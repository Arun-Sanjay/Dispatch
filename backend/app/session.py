from copy import deepcopy
from threading import Lock
from typing import Any, Dict, List, Optional

from app.engine import CPUScheduler, Process, clone_processes
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
}
event_log: List[str] = []
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


def _parse_bursts(item: Dict[str, Any]) -> Dict[str, Any]:
    bursts = item.get("bursts")
    cpu_bursts = None
    io_bursts = None

    if bursts is not None:
        if not isinstance(bursts, list) or not bursts:
            raise ValueError("bursts must be a non-empty list")
        seq = []
        for value in bursts:
            burst = _safe_int(value, -1)
            if burst <= 0:
                raise ValueError("all bursts must be positive integers")
            seq.append(burst)
        if len(seq) % 2 == 0:
            raise ValueError("bursts must start with CPU and end with CPU")
        cpu_bursts = seq[0::2]
        io_bursts = seq[1::2]
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
    queue = _validate_queue(item.get("queue", "USER"))
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
    return sched


def _trim_event_log() -> None:
    global event_log
    if len(event_log) > 200:
        event_log = event_log[-200:]


def _rebuild_base_processes() -> None:
    global base_processes
    base_processes = clone_processes(default_processes) + clone_processes(added_processes)


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
    return serialize_state(scheduler, settings, base_processes, event_log)


def reset_session() -> Dict[str, Any]:
    global scheduler, event_log
    with _session_lock:
        _rebuild_base_processes()
        if base_processes:
            scheduler = _new_scheduler_from_base()
            event_log = ["Session reset"]
            return _state()

        scheduler = None
        event_log = []
        return default_state(settings)


def init_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, default_processes, added_processes, settings, event_log

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

        default_processes = _build_process_list(data.get("processes"))
        added_processes = []
        _rebuild_base_processes()
        scheduler = _new_scheduler_from_base()

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

        if scheduler is not None:
            scheduler.algorithm = str(settings["algorithm"])
            scheduler.quantum = int(settings["quantum"])
            scheduler.preemptive_priority = bool(settings["preemptive_priority"])

        event_log.append(
            f"Config algorithm={settings['algorithm']} preemptive={settings['preemptive_priority']} "
            f"tick={settings['tick_ms']} quantum={settings['quantum']}"
        )
        _trim_event_log()

        return {
            "ok": True,
            "config": {
                "algorithm": settings["algorithm"],
                "preemptive": bool(settings["preemptive_priority"]),
                "tick_ms": int(settings["tick_ms"]),
                "quantum": int(settings["quantum"]),
            },
        }


def tick_session() -> Dict[str, Any]:
    global event_log
    with _session_lock:
        if scheduler is None:
            return default_state(settings)

        if not scheduler.done():
            scheduler.tick()
            event_log.append(f"Tick -> t={scheduler.time}")
            _trim_event_log()

        return _state()


def run_session(steps: int) -> Dict[str, Any]:
    global event_log
    with _session_lock:
        if scheduler is None:
            return default_state(settings)

        count = max(0, _safe_int(steps, 0))
        for _ in range(count):
            if scheduler.done():
                break
            scheduler.tick()

        event_log.append(f"Run steps={count} -> t={scheduler.time}")
        _trim_event_log()

        return _state()


def add_process(proc: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, base_processes, added_processes, event_log
    with _session_lock:
        if not isinstance(proc, dict):
            return _state() if scheduler is not None else default_state(settings)

        base_proc = _build_process(proc)
        existing_pids = {p.pid for p in base_processes}
        if base_proc.pid in existing_pids:
            raise ValueError(f"pid '{base_proc.pid}' already exists")

        # If session was not initialized, initialize with this one process.
        if scheduler is None:
            added_processes.append(base_proc)
            _rebuild_base_processes()
            scheduler = _new_scheduler_from_base()
            if scheduler is None or not scheduler.processes:
                return default_state(settings)
            runtime_proc = scheduler.processes[-1]
            _insert_immediate_ready(runtime_proc)
            event_log.append(f"Added {runtime_proc.pid} (bootstrap)")
            return _state()

        runtime_proc = _build_process(proc)
        scheduler.processes.append(runtime_proc)
        if getattr(scheduler, "_all", scheduler.processes) is not scheduler.processes:
            scheduler._all.append(runtime_proc)

        # Engine arrival handling via scheduler.add_arrived_processes() covers future arrivals.
        # For immediate arrivals we inject into active queue right away.
        _insert_immediate_ready(runtime_proc)

        added_processes.append(base_proc)
        base_processes.append(base_proc)
        event_log.append(
            f"Added {runtime_proc.pid} AT={runtime_proc.arrival_time} Q={runtime_proc.queue}"
        )
        _trim_event_log()

        return _state()


def remove_added_process(pid: str) -> Dict[str, Any]:
    global scheduler, added_processes, event_log
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
        _rebuild_base_processes()

        scheduler = _new_scheduler_from_base() if base_processes else None
        event_log = [f"Removed added process {target}"]
        return _state() if scheduler is not None else default_state(settings)


def clear_added_processes() -> Dict[str, Any]:
    global scheduler, added_processes, event_log
    with _session_lock:
        added_processes = []
        _rebuild_base_processes()
        scheduler = _new_scheduler_from_base() if base_processes else None
        event_log = ["Cleared all user-added processes"]

        return _state()


def set_speed(tick_ms: int) -> Dict[str, Any]:
    with _session_lock:
        settings["tick_ms"] = max(1, _safe_int(tick_ms, settings.get("tick_ms", 200)))
        return _state() if scheduler is not None else default_state(settings)


def set_quantum(q: int) -> Dict[str, Any]:
    with _session_lock:
        settings["quantum"] = max(1, _safe_int(q, settings.get("quantum", 2)))
        if scheduler is not None:
            scheduler.quantum = settings["quantum"]
        return _state() if scheduler is not None else default_state(settings)


def get_state() -> Dict[str, Any]:
    with _session_lock:
        if scheduler is None:
            return default_state(settings)
        return _state()


def get_compare_processes() -> List[Process]:
    with _session_lock:
        return clone_processes(deepcopy(base_processes))


def get_settings() -> Dict[str, Any]:
    with _session_lock:
        return dict(settings)
