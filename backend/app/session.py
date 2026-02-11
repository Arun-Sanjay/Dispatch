from copy import deepcopy
from threading import Lock
from typing import Any, Dict, List, Optional

from app.engine import CPUScheduler, Process, clone_processes
from app.memory_sim import (
    normalize_memory_algo,
    normalize_memory_mode,
    new_runtime,
    runtime_access,
    runtime_summary,
)
from app.serializers import default_state, serialize_state

_session_lock = Lock()

scheduler: Optional[CPUScheduler] = None
default_processes: List[Process] = []
added_processes: List[Process] = []
base_processes: List[Process] = []
settings: Dict[str, Any] = {
    "algorithm": "FCFS",
    "tick_ms": 200,
    "quantum": 2,
    "preemptive_priority": True,
    "mlq_sys_quantum": 2,
    "mlq_user_quantum": 4,
    "memory_mode": "CPU_ONLY",
    "mem_enabled": "CPU_ONLY",
    "page_size": 4096,
    "num_frames": 8,
    "frames_count": 8,
    "mem_algo": "LRU",
    "fault_penalty_ticks": 5,
}
event_log: List[str] = []
memory_runtime: Dict[str, Any] = new_runtime(
    mode=settings["mem_enabled"],
    algo=settings["mem_algo"],
    frames=settings["num_frames"],
    fault_penalty=settings["fault_penalty_ticks"],
    page_size=settings["page_size"],
)
pid_working_sets: Dict[str, List[int]] = {}
pid_memory_models: Dict[str, Dict[str, Any]] = {}
default_memory_profiles: Dict[str, Dict[str, Any]] = {}
added_memory_profiles: Dict[str, Dict[str, Any]] = {}
mem_wait: List[Dict[str, Any]] = []
SUPPORTED_ALGOS = {"FCFS", "SJF", "PRIORITY", "RR", "MLQ"}


def _normalize_algo_and_preemptive(algorithm: Any, preemptive: Any = None) -> Dict[str, Any]:
    algo_raw = str(algorithm or "FCFS").strip().upper()

    if algo_raw == "PRIORITY_NP":
        return {"algorithm": "PRIORITY", "preemptive_priority": False}
    if algo_raw == "PRIORITY_P":
        return {"algorithm": "PRIORITY", "preemptive_priority": True}
    if algo_raw not in SUPPORTED_ALGOS:
        algo_raw = "FCFS"

    if algo_raw != "PRIORITY":
        return {"algorithm": algo_raw, "preemptive_priority": settings.get("preemptive_priority", True)}

    preemptive_value = (
        _safe_bool(preemptive, settings.get("preemptive_priority", True))
        if preemptive is not None
        else settings.get("preemptive_priority", True)
    )
    return {"algorithm": "PRIORITY", "preemptive_priority": preemptive_value}


def _safe_int(value: Any, default: int) -> int:
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return int(default)
        try:
            if text.lower().startswith("0x"):
                return int(text, 16)
            return int(text, 10)
        except ValueError:
            return int(default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _safe_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y"}:
            return True
        if lowered in {"false", "0", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _pid_seed(pid: str) -> int:
    seed = 0
    for idx, ch in enumerate(str(pid)):
        seed = (seed * 131 + (idx + 17) * ord(ch)) & 0x7FFFFFFF
    return seed or 1


def _mix_seed(seed: int) -> int:
    # Deterministic pseudo-random mixer (no global RNG state).
    return (seed * 1103515245 + 12345) & 0x7FFFFFFF


def _seed_ratio(seed: int) -> float:
    return _mix_seed(seed) / float(0x7FFFFFFF)


def _build_working_set(pid: str) -> List[int]:
    seed = _pid_seed(pid)
    size = 5 + (seed % 8)  # 5..12 pages
    start = seed % 100
    step = ((seed >> 3) % 99) + 1
    if step % 2 == 0:
        step += 1
    pages = [int((start + i * step) % 100) for i in range(size)]
    return pages


def _dedupe_pages(values: List[int]) -> List[int]:
    seen = set()
    out: List[int] = []
    for value in values:
        page = max(0, int(value))
        if page in seen:
            continue
        seen.add(page)
        out.append(page)
    return out


def _build_working_set_from_size(pid: str, size: int) -> List[int]:
    count = max(1, min(100, int(size)))
    seed = _pid_seed(pid)
    start = seed % 100
    step = ((seed >> 5) % 99) + 1
    if step % 2 == 0:
        step += 1
    pages: List[int] = []
    for idx in range(count):
        pages.append((start + idx * step) % 100)
    return _dedupe_pages(pages)


def _extract_memory_profile(item: Dict[str, Any], pid: str) -> Dict[str, Any]:
    page_size = max(1, _safe_int(item.get("page_size", settings.get("page_size", 4096)), 4096))
    explicit_pages = item.get("working_set_pages")
    ws_pages: List[int]
    if isinstance(explicit_pages, list) and explicit_pages:
        parsed: List[int] = []
        for raw in explicit_pages:
            parsed.append(_safe_int(raw, 0))
        ws_pages = _dedupe_pages(parsed)
    else:
        size = _safe_int(item.get("working_set_size", 8), 8)
        ws_pages = _build_working_set_from_size(pid, size)
    ws_pages = ws_pages or _build_working_set_from_size(pid, 8)

    refs_per_tick = max(1, min(3, _safe_int(item.get("refs_per_cpu_tick", item.get("memory_ref_rate", 1)), 1)))
    custom_addrs_raw = item.get("custom_addrs")
    custom_addrs: List[int] = []
    if isinstance(custom_addrs_raw, list):
        for raw in custom_addrs_raw:
            custom_addrs.append(max(0, _safe_int(raw, 0)))

    addr_pattern = str(item.get("addr_pattern", "LOOP")).strip().upper()
    if addr_pattern not in {"SEQ", "LOOP", "RAND", "CUSTOM"}:
        addr_pattern = "LOOP"
    if addr_pattern == "CUSTOM" and not custom_addrs:
        addr_pattern = "LOOP"

    vm_size_default = max((max(ws_pages) + 1) * page_size, page_size * 32)
    vm_size_bytes = _safe_int(item.get("vm_size_bytes", vm_size_default), vm_size_default)
    if vm_size_bytes <= page_size:
        raise ValueError(f"vm_size_bytes must be greater than page_size ({page_size})")
    vm_pages = max(1, vm_size_bytes // page_size)

    ws_size_hint = _safe_int(item.get("working_set_size", len(ws_pages)), len(ws_pages))
    if ws_size_hint > vm_pages:
        raise ValueError(f"working_set_size cannot exceed total pages ({vm_pages})")

    if explicit_pages is not None and ws_pages and max(ws_pages) >= vm_pages:
        raise ValueError(f"working_set_pages values must be within 0..{vm_pages - 1}")

    ws_pages = [page % vm_pages for page in ws_pages]
    ws_pages = _dedupe_pages(ws_pages) or [0]

    seed = _pid_seed(pid)
    base_default = ((seed % 4096) + 1) * page_size
    address_base = max(0, _safe_int(item.get("address_base", base_default), base_default))
    if address_base % page_size != 0:
        address_base = (address_base // page_size) * page_size

    if custom_addrs:
        lower = address_base
        upper = address_base + vm_size_bytes
        if any((addr < lower or addr >= upper) for addr in custom_addrs):
            raise ValueError("custom_addrs must lie within [address_base, address_base + vm_size_bytes)")

    refs_per_cpu_tick = refs_per_tick

    return {
        "working_set_pages": ws_pages,
        "vm_size_bytes": vm_size_bytes,
        "address_base": address_base,
        "rng_seed": seed,
        "pc": 0,
        "refs_per_cpu_tick": refs_per_cpu_tick,
        "addr_pattern": addr_pattern,
        "custom_addrs": custom_addrs,
    }


def _refresh_working_sets() -> None:
    global pid_working_sets, pid_memory_models
    pid_working_sets = {}
    pid_memory_models = {}
    for process in base_processes:
        profile = default_memory_profiles.get(process.pid) or added_memory_profiles.get(process.pid)
        if profile:
            working_set = list(profile.get("working_set_pages", []))
            refs_per_tick = max(1, min(3, _safe_int(profile.get("refs_per_cpu_tick", 1), 1)))
            addr_pattern = str(profile.get("addr_pattern", "LOOP")).upper()
            custom_addrs = list(profile.get("custom_addrs", []))
            vm_size_bytes = max(
                max(1, _safe_int(settings.get("page_size", 4096), 4096)),
                _safe_int(profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32),
            )
            address_base = max(0, _safe_int(profile.get("address_base", ((_pid_seed(process.pid) % 4096) + 1) * settings.get("page_size", 4096)), ((_pid_seed(process.pid) % 4096) + 1) * settings.get("page_size", 4096)))
        else:
            working_set = _build_working_set(process.pid)
            refs_per_tick = 1
            addr_pattern = "LOOP"
            custom_addrs = []
            vm_size_bytes = max(settings.get("page_size", 4096) * 32, (max(working_set) + 1) * settings.get("page_size", 4096))
            address_base = ((_pid_seed(process.pid) % 4096) + 1) * settings.get("page_size", 4096)
        pid_working_sets[process.pid] = working_set
        pid_memory_models[process.pid] = {
            "working_set_pages": working_set,
            "rng_seed": _pid_seed(process.pid),
            "pc": 0,
            "refs_per_cpu_tick": refs_per_tick,
            "addr_pattern": addr_pattern,
            "custom_addrs": custom_addrs,
            "vm_size_bytes": vm_size_bytes,
            "address_base": address_base,
        }


def _ensure_working_set(pid: str) -> List[int]:
    if pid not in pid_working_sets:
        profile = default_memory_profiles.get(pid) or added_memory_profiles.get(pid) or {}
        working_set = list(profile.get("working_set_pages", [])) or _build_working_set(pid)
        refs_per_tick = max(1, min(3, _safe_int(profile.get("refs_per_cpu_tick", 1), 1)))
        addr_pattern = str(profile.get("addr_pattern", "LOOP")).upper()
        custom_addrs = list(profile.get("custom_addrs", []))
        vm_size_bytes = max(
            max(1, _safe_int(settings.get("page_size", 4096), 4096)),
            _safe_int(profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32),
        )
        address_base = max(
            0,
            _safe_int(
                profile.get("address_base", ((_pid_seed(pid) % 4096) + 1) * settings.get("page_size", 4096)),
                ((_pid_seed(pid) % 4096) + 1) * settings.get("page_size", 4096),
            ),
        )
        pid_working_sets[pid] = working_set
        pid_memory_models[pid] = {
            "working_set_pages": working_set,
            "rng_seed": _pid_seed(pid),
            "pc": 0,
            "refs_per_cpu_tick": refs_per_tick,
            "addr_pattern": addr_pattern,
            "custom_addrs": custom_addrs,
            "vm_size_bytes": vm_size_bytes,
            "address_base": address_base,
        }
    return pid_working_sets[pid]


def _runtime_memory_mode() -> str:
    return normalize_memory_mode(settings.get("mem_enabled", settings.get("memory_mode", "CPU_ONLY")), "CPU_ONLY")


def _reset_memory_runtime() -> None:
    global memory_runtime, mem_wait
    settings["memory_mode"] = normalize_memory_mode(settings.get("memory_mode", "CPU_ONLY"), "CPU_ONLY")
    settings["mem_enabled"] = settings["memory_mode"]
    settings["num_frames"] = max(1, _safe_int(settings.get("num_frames", settings.get("frames_count", 8)), 8))
    settings["frames_count"] = settings["num_frames"]
    settings["page_size"] = max(1, _safe_int(settings.get("page_size", 4096), 4096))
    settings["fault_penalty_ticks"] = max(1, _safe_int(settings.get("fault_penalty_ticks", 5), 5))
    memory_runtime = new_runtime(
        mode=_runtime_memory_mode(),
        algo=normalize_memory_algo(settings.get("mem_algo", "LRU"), "LRU"),
        frames=settings["num_frames"],
        fault_penalty=settings["fault_penalty_ticks"],
        page_size=settings["page_size"],
    )
    mem_wait = []


def _apply_memory_settings(data: Dict[str, Any], preserve_existing: bool = True) -> bool:
    prev = {
        "mem_enabled": settings.get("mem_enabled", settings.get("memory_mode", "CPU_ONLY")),
        "num_frames": settings.get("num_frames", settings.get("frames_count", 8)),
        "page_size": settings.get("page_size", 4096),
        "mem_algo": settings.get("mem_algo", "LRU"),
        "fault_penalty_ticks": settings.get("fault_penalty_ticks", 5),
    }

    mem_enabled_raw = data.get(
        "mem_enabled",
        data.get("memory_mode", prev["mem_enabled"] if preserve_existing else "CPU_ONLY"),
    )
    settings["mem_enabled"] = normalize_memory_mode(mem_enabled_raw, "CPU_ONLY")
    settings["memory_mode"] = settings["mem_enabled"]
    num_frames_raw = data.get(
        "num_frames",
        data.get(
            "frames_count",
            data.get("frames", prev["num_frames"] if preserve_existing else 8),
        ),
    )
    settings["num_frames"] = max(
        1,
        _safe_int(num_frames_raw, 8),
    )
    settings["frames_count"] = settings["num_frames"]
    settings["page_size"] = max(
        1,
        _safe_int(
            data.get("page_size", prev["page_size"] if preserve_existing else 4096),
            4096,
        ),
    )
    settings["mem_algo"] = normalize_memory_algo(
        data.get("mem_algo", data.get("memory_algo", prev["mem_algo"] if preserve_existing else "LRU")),
        "LRU",
    )
    settings["fault_penalty_ticks"] = max(
        1,
        _safe_int(
            data.get(
                "fault_penalty_ticks",
                data.get("fault_penalty", prev["fault_penalty_ticks"] if preserve_existing else 5),
            ),
            5,
        ),
    )

    return any(
        settings[key] != prev[key]
        for key in ["mem_enabled", "num_frames", "page_size", "mem_algo", "fault_penalty_ticks"]
    )


def _generate_tick_addrs(pid: str, time_value: int) -> List[int]:
    working_set = _ensure_working_set(pid)
    model = pid_memory_models.get(pid) or {
        "working_set_pages": working_set,
        "rng_seed": _pid_seed(pid),
        "pc": 0,
        "refs_per_cpu_tick": 1,
        "addr_pattern": "LOOP",
        "custom_addrs": [],
    }
    pid_memory_models[pid] = model

    ws = list(model.get("working_set_pages") or working_set or [0])
    ws = _dedupe_pages(ws) or [0]
    hot_size = max(1, int(round(len(ws) * 0.3)))
    hot_ws = ws[:hot_size]
    count = max(1, _safe_int(model.get("refs_per_cpu_tick", 1), 1))
    seed_base = _safe_int(model.get("rng_seed", _pid_seed(pid)), _pid_seed(pid))
    pc = _safe_int(model.get("pc", 0), 0)
    pattern = str(model.get("addr_pattern", "LOOP")).upper()
    custom_addrs = [max(0, _safe_int(v, 0)) for v in list(model.get("custom_addrs", []))]

    refs: List[int] = []
    page_size = max(1, _safe_int(settings.get("page_size", 4096), 4096))
    vm_size_bytes = max(page_size, _safe_int(model.get("vm_size_bytes", page_size * 32), page_size * 32))
    max_vpn = max(1, vm_size_bytes // page_size)
    ws = [page % max_vpn for page in ws]
    ws = _dedupe_pages(ws) or [0]
    hot_ws = ws[: max(1, int(round(len(ws) * 0.3)))]
    base = max(0, _safe_int(model.get("address_base", ((_pid_seed(pid) % 4096) + 1) * page_size), ((_pid_seed(pid) % 4096) + 1) * page_size))
    if base % page_size != 0:
        base = (base // page_size) * page_size
    for idx in range(count):
        seed = _mix_seed(seed_base ^ ((time_value + 1) * 104729) ^ ((idx + 1) * 31337) ^ (pc * 17))
        if pattern == "CUSTOM" and custom_addrs:
            addr = max(0, _safe_int(custom_addrs[pc % len(custom_addrs)], 0))
            pc = (pc + 1) % len(custom_addrs)
        elif pattern == "SEQ":
            vpn = ws[pc % len(ws)]
            pc = (pc + 1) % len(ws)
        elif pattern == "LOOP":
            if (seed % 100) < 80:
                pool = hot_ws
            else:
                pool = ws
            vpn = pool[(seed // 101) % len(pool)]
            pc = (pc + 1) % len(ws)
        else:
            # RAND (deterministic PRNG from seed); keep 80/20 locality mix.
            if (seed % 100) < 80:
                pool = hot_ws
                vpn = pool[(seed // 127) % len(pool)]
            else:
                vpn = ws[(seed // 127) % len(ws)]
            pc = (pc + 1) % len(ws)
        if pattern != "CUSTOM" or not custom_addrs:
            offset_seed = _mix_seed(seed ^ (_pid_seed(pid) + (time_value + 1) * 2654435761 + (idx + 1) * 97531))
            offset = offset_seed % page_size
            addr = base + (int(vpn) * page_size) + offset
        refs.append(int(addr))

    model["rng_seed"] = _mix_seed(seed_base ^ ((time_value + 1) * 65537) ^ (pc * 97))
    model["pc"] = pc
    model["address_base"] = base
    model["vm_size_bytes"] = vm_size_bytes
    return refs


def _parse_bursts(item: Dict[str, Any]) -> Dict[str, Any]:
    bursts = item.get("bursts")
    if bursts is None:
        bursts = item.get("burst_segments")
    cpu_bursts = None
    io_bursts = None

    if bursts is not None:
        if not isinstance(bursts, list) or not bursts:
            raise ValueError("bursts must be a non-empty list")
        seq: List[int] = []
        if all(isinstance(part, dict) for part in bursts):
            expected = "CPU"
            for part in bursts:
                btype = str(part.get("type", "")).strip().upper()
                length = _safe_int(part.get("len", part.get("length", -1)), -1)
                if btype not in {"CPU", "IO"}:
                    raise ValueError("burst type must be CPU or IO")
                if btype != expected:
                    raise ValueError("bursts must alternate CPU/IO and start with CPU")
                if length <= 0:
                    raise ValueError("burst lengths must be positive")
                seq.append(length)
                expected = "IO" if expected == "CPU" else "CPU"
        else:
            for value in bursts:
                burst = _safe_int(value, -1)
                if burst <= 0:
                    raise ValueError("all bursts must be positive integers")
                seq.append(burst)

        if len(seq) % 2 == 0:
            raise ValueError("bursts must start with CPU and end with CPU")
        cpu_bursts = [int(v) for v in seq[0::2]]
        io_bursts = [int(v) for v in seq[1::2]]
        burst_time = int(sum(cpu_bursts)) if cpu_bursts else _safe_int(item.get("burst_time", 1), 1)
    else:
        burst_time = _safe_int(item.get("burst_time", 1), 1)
        if burst_time <= 0:
            raise ValueError("burst_time must be a positive integer")
        cpu_bursts = [max(1, burst_time)]

    return {
        "cpu_bursts": cpu_bursts,
        "io_bursts": io_bursts,
        "burst_time": burst_time,
    }


def _validate_queue(queue: Any) -> str:
    value = str(queue or "USER").strip().upper()
    if value not in {"USER", "SYS"}:
        raise ValueError("queue must be either USER or SYS")
    return value


def _build_process(item: Dict[str, Any]) -> Process:
    pid = str(item.get("pid", "")).strip()
    if not pid:
        raise ValueError("pid is required")

    arrival_time = _safe_int(item.get("arrival_time", 0), 0)
    if arrival_time < 0:
        raise ValueError("arrival_time must be >= 0")

    priority = _safe_int(item.get("priority", 1), 1)
    queue = _validate_queue(item.get("queue", item.get("queue_type", "USER")))
    parsed = _parse_bursts(item)

    return Process(
        pid=pid,
        arrival_time=arrival_time,
        burst_time=max(1, int(parsed["burst_time"])),
        priority=priority,
        queue=queue,
        cpu_bursts=parsed["cpu_bursts"],
        io_bursts=parsed["io_bursts"],
    )


def _build_process_with_memory(item: Dict[str, Any]) -> Dict[str, Any]:
    process = _build_process(item)
    profile = _extract_memory_profile(item, process.pid)
    setattr(process, "working_set_pages", list(profile.get("working_set_pages", [])))
    setattr(process, "refs_per_cpu_tick", _safe_int(profile.get("refs_per_cpu_tick", 1), 1))
    setattr(process, "addr_pattern", str(profile.get("addr_pattern", "LOOP")))
    setattr(process, "vm_size_bytes", _safe_int(profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32))
    setattr(process, "address_base", _safe_int(profile.get("address_base", 0), 0))
    setattr(process, "custom_addrs", list(profile.get("custom_addrs", [])))
    return {"process": process, "memory_profile": profile}


def _build_process_list(payload_processes: Any) -> List[Process]:
    if not isinstance(payload_processes, list):
        return []
    out: List[Process] = []
    for item in payload_processes:
        if isinstance(item, dict):
            out.append(_build_process(item))
    return out


def _new_scheduler_from_base() -> Optional[CPUScheduler]:
    if base_processes is None:
        return None

    normalized = _normalize_algo_and_preemptive(
        settings.get("algorithm", "FCFS"),
        settings.get("preemptive_priority", True),
    )
    sched = CPUScheduler(
        clone_processes(base_processes),
        algorithm=str(normalized["algorithm"]),
        quantum=max(1, _safe_int(settings.get("quantum", 2), 2)),
    )
    sched.preemptive_priority = _safe_bool(normalized["preemptive_priority"], True)
    sched.quantum_sys = max(1, _safe_int(settings.get("mlq_sys_quantum", 2), 2))
    sched.quantum_user = max(1, _safe_int(settings.get("mlq_user_quantum", 4), 4))
    for proc in sched.processes:
        profile = pid_memory_models.get(proc.pid) or default_memory_profiles.get(proc.pid) or added_memory_profiles.get(proc.pid)
        if not profile:
            continue
        setattr(proc, "working_set_pages", list(profile.get("working_set_pages", [])))
        setattr(proc, "refs_per_cpu_tick", _safe_int(profile.get("refs_per_cpu_tick", 1), 1))
        setattr(proc, "addr_pattern", str(profile.get("addr_pattern", "LOOP")))
        setattr(proc, "vm_size_bytes", _safe_int(profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32))
        setattr(proc, "address_base", _safe_int(profile.get("address_base", 0), 0))
        setattr(proc, "custom_addrs", list(profile.get("custom_addrs", [])))
    return sched


def _trim_event_log() -> None:
    global event_log
    if len(event_log) > 200:
        event_log = event_log[-200:]


def _rebuild_base_processes() -> None:
    global base_processes
    base_processes = clone_processes(default_processes) + clone_processes(added_processes)
    _refresh_working_sets()


def _insert_immediate_ready(proc: Process):
    if scheduler is None:
        return
    if proc.arrival_time > scheduler.time:
        return

    proc.arrived = True
    if scheduler.algorithm == "MLQ":
        if proc.queue.upper() == "SYS":
            scheduler.sys_queue.append(proc)
        else:
            scheduler.user_queue.append(proc)
    else:
        scheduler.ready_queue.append(proc)

    if hasattr(scheduler, "_set_state"):
        scheduler._set_state(proc, "READY")


def _state() -> Dict[str, Any]:
    return serialize_state(
        scheduler,
        settings,
        base_processes,
        event_log,
        memory_state=runtime_summary(memory_runtime),
    )


def _enqueue_ready(proc: Process) -> None:
    if scheduler is None:
        return
    if scheduler.algorithm == "MLQ":
        if proc.queue.upper() == "SYS":
            scheduler.sys_queue.append(proc)
        else:
            scheduler.user_queue.append(proc)
    else:
        scheduler.ready_queue.append(proc)


def _admit_arrivals_current_tick() -> None:
    if scheduler is None:
        return
    for proc in list(getattr(scheduler, "_all", scheduler.processes)):
        if getattr(proc, "arrived", False):
            continue
        if _safe_int(getattr(proc, "arrival_time", 0), 0) != scheduler.time:
            continue
        proc.arrived = True
        _enqueue_ready(proc)
        scheduler._set_state(proc, "READY")


def _advance_mem_wait() -> None:
    global mem_wait
    if scheduler is None:
        return

    next_wait: List[Dict[str, Any]] = []
    for item in mem_wait:
        proc = item.get("process")
        if proc is None:
            continue
        remaining = max(0, _safe_int(item.get("remaining", 0), 0) - 1)
        if remaining <= 0:
            scheduler._set_state(proc, "READY", "(MEM done)")
            _enqueue_ready(proc)
        else:
            next_wait.append({"process": proc, "remaining": remaining})
    mem_wait = next_wait


def _append_mem_gantt(token: str) -> None:
    gantt = list(memory_runtime.get("mem_gantt", []))
    gantt.append(str(token))
    if len(gantt) > 5000:
        gantt = gantt[-5000:]
    memory_runtime["mem_gantt"] = gantt


def _execute_cpu_tick() -> None:
    if scheduler is None:
        return

    proc = scheduler.running
    if proc is None:
        scheduler.gantt_chart.append("IDLE")
        _append_mem_gantt("IDLE")
        return

    scheduler.gantt_chart.append(proc.pid)

    # One CPU tick consumed.
    proc.remaining_time -= 1
    if scheduler.algorithm in {"RR", "MLQ"}:
        scheduler.slice_left -= 1

    if _runtime_memory_mode() == "FULL":
        model = pid_memory_models.get(proc.pid) or {}
        refs = _generate_tick_addrs(proc.pid, scheduler.time)
        faulted = False
        fault_vpn: Optional[int] = None
        for va in refs:
            step, is_fault = runtime_access(memory_runtime, scheduler.time, proc.pid, va, model)
            if is_fault:
                faulted = True
                fault_vpn = _safe_int(step.get("vpn", -1), -1)
                break

        if faulted:
            if fault_vpn is not None and fault_vpn >= 0:
                _append_mem_gantt(f"FAULT:{proc.pid}:{fault_vpn}")
            else:
                _append_mem_gantt(f"FAULT:{proc.pid}")
            scheduler.running = None
            scheduler.slice_left = 0
            if proc.remaining_time <= 0:
                # Faulted instruction is retried after memory wait.
                proc.remaining_time = 1
            penalty = max(1, _safe_int(settings.get("fault_penalty_ticks", 5), 5))
            scheduler._set_state(proc, "WAITING_MEM", "(page fault)")
            mem_wait.append({"process": proc, "remaining": penalty})
            event_log.append(
                f"t={scheduler.time}: {proc.pid} RUNNING -> WAITING_MEM (fault penalty={penalty})"
            )
            return
        _append_mem_gantt(f"HIT:{proc.pid}")
    else:
        _append_mem_gantt("IDLE")

    # CPU burst completion
    if proc.remaining_time == 0:
        scheduler.running = None
        scheduler.slice_left = 0
        proc.cpu_index += 1

        if proc.io_index < len(proc.io_bursts):
            proc.io_remaining = int(proc.io_bursts[proc.io_index])
            proc.io_index += 1
            scheduler._set_state(proc, "WAITING_IO", "(I/O)")
            if scheduler.io_active is None:
                scheduler.io_active = proc
            else:
                scheduler.io_queue.append(proc)
            return

        if proc.cpu_index < len(proc.cpu_bursts):
            proc.remaining_time = int(proc.cpu_bursts[proc.cpu_index])
            scheduler._set_state(proc, "READY")
            _enqueue_ready(proc)
            return

        scheduler._set_state(proc, "DONE")
        proc.completion_time = scheduler.time + 1
        scheduler.completed.append(proc)
        return

    # Time-slice rotation
    if scheduler.algorithm == "RR" and scheduler.slice_left == 0:
        scheduler._set_state(proc, "READY", "(time slice)")
        scheduler.ready_queue.append(proc)
        scheduler.running = None
    elif scheduler.algorithm == "MLQ" and scheduler.slice_left == 0:
        scheduler._set_state(proc, "READY", "(time slice)")
        if proc.queue.upper() == "SYS":
            scheduler.sys_queue.append(proc)
        else:
            scheduler.user_queue.append(proc)
        scheduler.running = None


def _tick_once_with_memory() -> None:
    if scheduler is None:
        return

    # A) arrivals
    _admit_arrivals_current_tick()
    # B) I/O device progress
    scheduler._tick_io()
    # C) memory-wait progress
    _advance_mem_wait()
    # D) dispatch/preempt
    scheduler.schedule()
    # E + F) execute one CPU tick + memory access + transitions
    _execute_cpu_tick()
    scheduler.time += 1


def reset_session() -> Dict[str, Any]:
    global scheduler, event_log
    with _session_lock:
        _rebuild_base_processes()
        _reset_memory_runtime()
        if base_processes:
            scheduler = _new_scheduler_from_base()
            event_log = ["Session reset"]
            return _state()

        scheduler = None
        event_log = []
        return default_state(settings, memory_state=runtime_summary(memory_runtime))


def init_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, default_processes, added_processes, settings, event_log, default_memory_profiles, added_memory_profiles

    data = payload or {}
    with _session_lock:
        normalized = _normalize_algo_and_preemptive(
            data.get("algorithm", settings.get("algorithm", "FCFS")),
            data.get("preemptive_priority", data.get("preemptive")),
        )
        settings["algorithm"] = normalized["algorithm"]
        settings["tick_ms"] = max(1, _safe_int(data.get("tick_ms", settings.get("tick_ms", 200)), 200))
        settings["quantum"] = max(1, _safe_int(data.get("quantum", settings.get("quantum", 2)), 2))
        settings["preemptive_priority"] = _safe_bool(normalized["preemptive_priority"], True)
        settings["mlq_sys_quantum"] = max(
            1,
            _safe_int(data.get("mlq_sys_quantum", settings.get("mlq_sys_quantum", 2)), 2),
        )
        settings["mlq_user_quantum"] = max(
            1,
            _safe_int(data.get("mlq_user_quantum", settings.get("mlq_user_quantum", 4)), 4),
        )
        _apply_memory_settings(data, preserve_existing=False)

        default_processes = []
        default_memory_profiles = {}
        payload_processes = data.get("processes")
        if isinstance(payload_processes, list):
            for item in payload_processes:
                if not isinstance(item, dict):
                    continue
                bundle = _build_process_with_memory(item)
                process = bundle["process"]
                default_processes.append(process)
                default_memory_profiles[process.pid] = bundle["memory_profile"]
        added_processes = []
        added_memory_profiles = {}
        _rebuild_base_processes()
        scheduler = _new_scheduler_from_base()
        _reset_memory_runtime()

        event_log = [
            f"Initialized algorithm={settings['algorithm']} processes={len(base_processes)}"
        ]
        return _state()


def set_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, settings, event_log
    data = payload or {}
    with _session_lock:
        normalized = _normalize_algo_and_preemptive(
            data.get("algorithm", settings.get("algorithm", "FCFS")),
            data.get("preemptive_priority", data.get("preemptive")),
        )
        settings["algorithm"] = normalized["algorithm"]
        settings["preemptive_priority"] = _safe_bool(normalized["preemptive_priority"], True)
        settings["tick_ms"] = max(1, _safe_int(data.get("tick_ms", settings.get("tick_ms", 200)), 200))
        settings["quantum"] = max(1, _safe_int(data.get("quantum", settings.get("quantum", 2)), 2))
        memory_changed = _apply_memory_settings(data, preserve_existing=True)

        if scheduler is not None:
            scheduler.algorithm = str(settings["algorithm"])
            scheduler.quantum = int(settings["quantum"])
            scheduler.preemptive_priority = bool(settings["preemptive_priority"])
            if memory_changed:
                _reset_memory_runtime()
        elif memory_changed:
            _reset_memory_runtime()

        event_log.append(
            f"Config algorithm={settings['algorithm']} preemptive={settings['preemptive_priority']} "
            f"tick={settings['tick_ms']} quantum={settings['quantum']} "
            f"mem={settings['mem_enabled']}:{settings['mem_algo']}/{settings['num_frames']} page={settings['page_size']}"
        )
        _trim_event_log()

        return {
            "ok": True,
            "config": {
                "algorithm": settings["algorithm"],
                "preemptive": bool(settings["preemptive_priority"]),
                "tick_ms": int(settings["tick_ms"]),
                "quantum": int(settings["quantum"]),
                "memory_mode": settings["memory_mode"],
                "mem_enabled": settings["mem_enabled"],
                "num_frames": int(settings["num_frames"]),
                "frames_count": int(settings["num_frames"]),
                "frames": int(settings["num_frames"]),
                "mem_algo": settings["mem_algo"],
                "memory_algo": settings["mem_algo"],
                "page_size": int(settings["page_size"]),
                "fault_penalty_ticks": int(settings["fault_penalty_ticks"]),
                "fault_penalty": int(settings["fault_penalty_ticks"]),
            },
        }


def tick_session() -> Dict[str, Any]:
    global event_log
    with _session_lock:
        if scheduler is None:
            return default_state(settings, memory_state=runtime_summary(memory_runtime))

        if not scheduler.done():
            _tick_once_with_memory()
            event_log.append(f"Tick -> t={scheduler.time}")
            _trim_event_log()

        return _state()


def run_session(steps: int) -> Dict[str, Any]:
    global event_log
    with _session_lock:
        if scheduler is None:
            return default_state(settings, memory_state=runtime_summary(memory_runtime))

        count = max(0, _safe_int(steps, 0))
        for _ in range(count):
            if scheduler.done():
                break
            _tick_once_with_memory()

        event_log.append(f"Run steps={count} -> t={scheduler.time}")
        _trim_event_log()

        return _state()


def add_process(proc: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, base_processes, added_processes, event_log, added_memory_profiles
    with _session_lock:
        if not isinstance(proc, dict):
            return (
                _state()
                if scheduler is not None
                else default_state(settings, memory_state=runtime_summary(memory_runtime))
            )

        bundle = _build_process_with_memory(proc)
        base_proc = bundle["process"]
        memory_profile = bundle["memory_profile"]
        existing_pids = {p.pid for p in base_processes}
        if base_proc.pid in existing_pids:
            raise ValueError(f"pid '{base_proc.pid}' already exists")

        if ("fault_penalty_ticks" in proc) or ("fault_penalty" in proc):
            settings["fault_penalty_ticks"] = max(
                1,
                _safe_int(
                    proc.get("fault_penalty_ticks", proc.get("fault_penalty", settings.get("fault_penalty_ticks", 5))),
                    5,
                ),
            )
            _reset_memory_runtime()

        # If session was not initialized, initialize with this one process.
        if scheduler is None:
            added_processes.append(base_proc)
            added_memory_profiles[base_proc.pid] = memory_profile
            _rebuild_base_processes()
            scheduler = _new_scheduler_from_base()
            if scheduler is None or not scheduler.processes:
                return default_state(settings, memory_state=runtime_summary(memory_runtime))
            runtime_proc = scheduler.processes[-1]
            _insert_immediate_ready(runtime_proc)
            pid_memory_models[runtime_proc.pid] = {
                **memory_profile,
                "rng_seed": _pid_seed(runtime_proc.pid),
                "pc": 0,
            }
            setattr(runtime_proc, "working_set_pages", list(memory_profile.get("working_set_pages", [])))
            setattr(runtime_proc, "refs_per_cpu_tick", _safe_int(memory_profile.get("refs_per_cpu_tick", 1), 1))
            setattr(runtime_proc, "addr_pattern", str(memory_profile.get("addr_pattern", "LOOP")))
            setattr(runtime_proc, "vm_size_bytes", _safe_int(memory_profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32))
            setattr(runtime_proc, "address_base", _safe_int(memory_profile.get("address_base", 0), 0))
            setattr(runtime_proc, "custom_addrs", list(memory_profile.get("custom_addrs", [])))
            _ensure_working_set(runtime_proc.pid)
            event_log.append(f"Added {runtime_proc.pid} (bootstrap)")
            return _state()

        runtime_proc = _build_process(proc)
        scheduler.processes.append(runtime_proc)
        if getattr(scheduler, "_all", scheduler.processes) is not scheduler.processes:
            scheduler._all.append(runtime_proc)

        # Engine arrival handling via scheduler.add_arrived_processes() covers future arrivals.
        # For immediate arrivals we inject into active queue right away.
        _insert_immediate_ready(runtime_proc)
        added_memory_profiles[runtime_proc.pid] = memory_profile
        pid_memory_models[runtime_proc.pid] = {
            **memory_profile,
            "rng_seed": _pid_seed(runtime_proc.pid),
            "pc": 0,
        }
        setattr(runtime_proc, "working_set_pages", list(memory_profile.get("working_set_pages", [])))
        setattr(runtime_proc, "refs_per_cpu_tick", _safe_int(memory_profile.get("refs_per_cpu_tick", 1), 1))
        setattr(runtime_proc, "addr_pattern", str(memory_profile.get("addr_pattern", "LOOP")))
        setattr(runtime_proc, "vm_size_bytes", _safe_int(memory_profile.get("vm_size_bytes", settings.get("page_size", 4096) * 32), settings.get("page_size", 4096) * 32))
        setattr(runtime_proc, "address_base", _safe_int(memory_profile.get("address_base", 0), 0))
        setattr(runtime_proc, "custom_addrs", list(memory_profile.get("custom_addrs", [])))
        _ensure_working_set(runtime_proc.pid)

        added_processes.append(base_proc)
        base_processes.append(base_proc)
        event_log.append(
            f"Added {runtime_proc.pid} AT={runtime_proc.arrival_time} Q={runtime_proc.queue}"
        )
        _trim_event_log()

        return _state()


def remove_added_process(pid: str) -> Dict[str, Any]:
    global scheduler, added_processes, event_log, added_memory_profiles
    with _session_lock:
        target = str(pid or "").strip()
        if not target:
            raise ValueError("pid is required")

        match_index = -1
        for idx, process in enumerate(added_processes):
            if process.pid == target:
                match_index = idx
                break

        if match_index < 0:
            raise ValueError(f"pid '{target}' is not a user-added process")

        added_processes.pop(match_index)
        added_memory_profiles.pop(target, None)
        _rebuild_base_processes()

        scheduler = _new_scheduler_from_base() if base_processes else None
        _reset_memory_runtime()
        event_log = [f"Removed added process {target}"]
        return (
            _state()
            if scheduler is not None
            else default_state(settings, memory_state=runtime_summary(memory_runtime))
        )


def clear_added_processes() -> Dict[str, Any]:
    global scheduler, added_processes, event_log, added_memory_profiles
    with _session_lock:
        added_processes = []
        added_memory_profiles = {}
        _rebuild_base_processes()
        scheduler = _new_scheduler_from_base() if base_processes else None
        _reset_memory_runtime()
        event_log = ["Cleared all user-added processes"]

        return _state()


def set_speed(tick_ms: int) -> Dict[str, Any]:
    with _session_lock:
        settings["tick_ms"] = max(1, _safe_int(tick_ms, settings.get("tick_ms", 200)))
        return (
            _state()
            if scheduler is not None
            else default_state(settings, memory_state=runtime_summary(memory_runtime))
        )


def set_quantum(q: int) -> Dict[str, Any]:
    with _session_lock:
        settings["quantum"] = max(1, _safe_int(q, settings.get("quantum", 2)))
        if scheduler is not None:
            scheduler.quantum = settings["quantum"]
        return (
            _state()
            if scheduler is not None
            else default_state(settings, memory_state=runtime_summary(memory_runtime))
        )


def get_state() -> Dict[str, Any]:
    with _session_lock:
        if scheduler is None:
            return default_state(settings, memory_state=runtime_summary(memory_runtime))
        return _state()


def get_compare_processes() -> List[Process]:
    with _session_lock:
        return clone_processes(deepcopy(base_processes))


def get_settings() -> Dict[str, Any]:
    with _session_lock:
        return dict(settings)
