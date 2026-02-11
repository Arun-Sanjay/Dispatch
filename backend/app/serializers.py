from typing import Any, Dict, Iterable, List, Optional

from app.engine.metrics import compute_metrics


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _get_attr(obj: Any, names: Iterable[str], default: Any = None) -> Any:
    for name in names:
        if hasattr(obj, name):
            return getattr(obj, name)
    return default


def _pid_of(item: Any) -> str:
    if item is None:
        return "IDLE"
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        if "pid" in item:
            return str(item["pid"])
    if hasattr(item, "pid"):
        return str(getattr(item, "pid"))
    return str(item)


def _pid_list(items: Any) -> List[str]:
    if items is None:
        return []
    out: List[str] = []
    for item in list(items):
        pid = _pid_of(item)
        out.append("IDLE" if pid in {"", "None"} else pid)
    return out


def _timeline(values: Any) -> List[str]:
    if values is None:
        return []
    return ["IDLE" if _pid_of(v) in {"", "None"} else _pid_of(v) for v in list(values)]


def _normalize_state_label(proc: Any, scheduler: Any) -> str:
    state = str(_get_attr(proc, ["state"], "NEW"))
    if state == "WAITING":
        io_active = _get_attr(scheduler, ["io_active"], None)
        io_queue = list(_get_attr(scheduler, ["io_queue"], []) or [])
        if proc is io_active or proc in io_queue:
            return "WAITING_IO"
    return state


def _default_memory(settings: Optional[Dict[str, Any]] = None, memory_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = settings or {}
    mem = memory_state or {}
    frames_value = mem.get("frames", [])
    if not isinstance(frames_value, list):
        frames_value = []
    num_frames = _safe_int(
        mem.get("num_frames", mem.get("frames_count", cfg.get("num_frames", cfg.get("frames_count", 8)))),
        8,
    )
    if num_frames < 1:
        num_frames = 1
    return {
        "enabled": str(mem.get("enabled", mem.get("mode", cfg.get("mem_enabled", cfg.get("memory_mode", "CPU_ONLY"))))),
        "mode": str(mem.get("mode", cfg.get("memory_mode", "CPU_ONLY"))),
        "algo": str(mem.get("algo", cfg.get("mem_algo", "LRU"))),
        "page_size": _safe_int(mem.get("page_size", cfg.get("page_size", 4096)), 4096),
        "num_frames": num_frames,
        "frames": frames_value,
        "fault_penalty": _safe_int(mem.get("fault_penalty", cfg.get("fault_penalty_ticks", 5)), 5),
        "faults": _safe_int(mem.get("faults", 0), 0),
        "hits": _safe_int(mem.get("hits", 0), 0),
        "hit_ratio": _safe_float(mem.get("hit_ratio", 0.0), 0.0),
        "frame_state": list(mem.get("frame_state", [])),
        "frames_count": num_frames,
        "page_tables": dict(mem.get("page_tables", {})),
        "recent_steps": list(mem.get("recent_steps", [])),
        "mem_gantt": list(mem.get("mem_gantt", [])),
        "last_translation_log": list(mem.get("last_translation_log", [])),
    }


def default_state(
    settings: Optional[Dict[str, Any]] = None,
    memory_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    cfg = settings or {}
    return {
        "time": 0,
        "algorithm": str(cfg.get("algorithm", "FCFS")),
        "preemptive": bool(cfg.get("preemptive_priority", True)),
        "tick_ms": _safe_int(cfg.get("tick_ms", 200), 200),
        "quantum": _safe_int(cfg.get("quantum", 2), 2),
        "running": "IDLE",
        "ready_queue": [],
        "sys_queue": [],
        "user_queue": [],
        "io_active": "IDLE",
        "io_queue": [],
        "gantt": [],
        "io_gantt": [],
        "mem_gantt": [],
        "completed": [],
        "metrics": {
            "avg_wt": 0.0,
            "avg_tat": 0.0,
            "avg_rt": 0.0,
            "cpu_util": 0.0,
            "makespan": 0,
            "throughput": 0.0,
        },
        "per_process": [],
        "processes": [],
        "event_log": [],
        "memory": _default_memory(cfg, memory_state),
    }


def serialize_state(
    scheduler: Any,
    settings: Dict[str, Any],
    all_processes: List[Any],
    event_log: Optional[List[str]] = None,
    memory_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    state = default_state(settings, memory_state=memory_state)
    if scheduler is None:
        if event_log:
            state["event_log"] = [str(x) for x in event_log]
        return state

    time_value = _get_attr(scheduler, ["time", "t", "current_time"], 0)
    algorithm = _get_attr(scheduler, ["algorithm"], state["algorithm"])
    running_obj = _get_attr(scheduler, ["running", "current", "current_process"], None)
    io_active_obj = _get_attr(scheduler, ["io_active", "io_current", "active_io"], None)

    ready_queue = _pid_list(_get_attr(scheduler, ["ready_queue", "ready", "queue"], []))
    sys_queue = _pid_list(_get_attr(scheduler, ["sys_queue"], []))
    user_queue = _pid_list(_get_attr(scheduler, ["user_queue"], []))
    io_queue = _pid_list(_get_attr(scheduler, ["io_queue", "waiting_io"], []))

    gantt = _timeline(_get_attr(scheduler, ["gantt_chart", "gantt", "timeline"], []))
    io_gantt = _timeline(_get_attr(scheduler, ["io_gantt_chart", "io_gantt", "io_timeline"], []))

    completed_items = _get_attr(scheduler, ["completed", "done", "finished"], [])
    completed = _pid_list(completed_items)

    processes = list(_get_attr(scheduler, ["processes", "all_processes"], []) or all_processes or [])

    rows: List[Dict[str, Any]] = []
    avg_wt = avg_tat = avg_rt = 0.0
    try:
        rows, avg_wt, avg_tat, avg_rt = compute_metrics(processes)
    except Exception:
        rows = []
        avg_wt = avg_tat = avg_rt = 0.0

    makespan = _safe_int(time_value, 0)
    busy = sum(1 for x in gantt if x != "IDLE")
    cpu_util = (busy / len(gantt) * 100.0) if gantt else 0.0
    throughput = (len(completed) / makespan) if makespan > 0 else 0.0

    per_process: List[Dict[str, Any]] = []
    if rows:
        for row in rows:
            def _maybe(v: Any):
                return None if v in {"-", None} else _safe_int(v, 0)

            per_process.append(
                {
                    "pid": str(row.get("PID", "")),
                    "at": _safe_int(row.get("AT", 0), 0),
                    "pr": _safe_int(row.get("PR", 0), 0),
                    "queue": str(row.get("Q", "USER")),
                    "st": _maybe(row.get("ST")),
                    "ct": _maybe(row.get("CT")),
                    "tat": _maybe(row.get("TAT")),
                    "wt": _maybe(row.get("WT")),
                    "rt": _maybe(row.get("RT")),
                }
            )
    else:
        for p in processes:
            at = _safe_int(_get_attr(p, ["arrival_time", "at"], 0), 0)
            st = _get_attr(p, ["start_time", "st"], None)
            ct = _get_attr(p, ["completion_time", "ct"], None)
            bt = _safe_int(_get_attr(p, ["burst_time", "bt"], 0), 0)
            tat = (ct - at) if isinstance(ct, int) else None
            wt = (tat - bt) if (tat is not None) else None
            rt = (st - at) if isinstance(st, int) else None
            per_process.append(
                {
                    "pid": _pid_of(p),
                    "at": at,
                    "pr": _safe_int(_get_attr(p, ["priority", "pr"], 0), 0),
                    "queue": str(_get_attr(p, ["queue"], "USER")),
                    "st": st if isinstance(st, int) else None,
                    "ct": ct if isinstance(ct, int) else None,
                    "tat": tat,
                    "wt": wt,
                    "rt": rt,
                }
            )

    process_summary: List[Dict[str, Any]] = []
    for p in processes:
        cpu_bursts = list(_get_attr(p, ["cpu_bursts"], []) or [])
        io_bursts = list(_get_attr(p, ["io_bursts"], []) or [])
        merged_bursts: List[int] = []
        for idx, cpu in enumerate(cpu_bursts):
            merged_bursts.append(_safe_int(cpu, 0))
            if idx < len(io_bursts):
                merged_bursts.append(_safe_int(io_bursts[idx], 0))
        process_summary.append(
            {
                "pid": _pid_of(p),
                "state": _normalize_state_label(p, scheduler),
                "arrival_time": _safe_int(_get_attr(p, ["arrival_time"], 0), 0),
                "priority": _safe_int(_get_attr(p, ["priority"], 0), 0),
                "queue": str(_get_attr(p, ["queue"], "USER")),
                "burst_index": _safe_int(_get_attr(p, ["cpu_index"], 0), 0),
                "remaining_in_current_burst": _safe_int(_get_attr(p, ["remaining_time"], 0), 0),
                "bursts": merged_bursts,
                "working_set_pages": list(_get_attr(p, ["working_set_pages"], []) or []),
                "refs_per_cpu_tick": _safe_int(_get_attr(p, ["refs_per_cpu_tick"], 1), 1),
                "addr_pattern": str(_get_attr(p, ["addr_pattern"], "LOOP")),
                "vm_size_bytes": _safe_int(_get_attr(p, ["vm_size_bytes"], 0), 0),
                "address_base": _safe_int(_get_attr(p, ["address_base"], 0), 0),
            }
        )

    scheduler_log = _get_attr(scheduler, ["event_log", "state_transitions"], [])
    merged_log = [str(x) for x in list(scheduler_log or [])]
    if event_log:
        for entry in event_log:
            text = str(entry)
            if text and text not in merged_log:
                merged_log.append(text)

    state.update(
        {
            "time": _safe_int(time_value, 0),
            "algorithm": str(algorithm),
            "preemptive": bool(
                _get_attr(scheduler, ["preemptive_priority"], settings.get("preemptive_priority", True))
            ),
            "tick_ms": _safe_int(settings.get("tick_ms", 200), 200),
            "quantum": _safe_int(_get_attr(scheduler, ["quantum"], settings.get("quantum", 2)), 2),
            "running": _pid_of(running_obj) if running_obj is not None else "IDLE",
            "ready_queue": ready_queue,
            "sys_queue": sys_queue,
            "user_queue": user_queue,
            "io_active": _pid_of(io_active_obj) if io_active_obj is not None else "IDLE",
            "io_queue": io_queue,
            "gantt": gantt,
            "io_gantt": io_gantt,
            "mem_gantt": list(_default_memory(settings, memory_state).get("mem_gantt", [])),
            "completed": completed,
            "metrics": {
                "avg_wt": _safe_float(avg_wt, 0.0),
                "avg_tat": _safe_float(avg_tat, 0.0),
                "avg_rt": _safe_float(avg_rt, 0.0),
                "cpu_util": _safe_float(cpu_util, 0.0),
                "makespan": _safe_int(makespan, 0),
                "throughput": _safe_float(throughput, 0.0),
            },
            "per_process": per_process,
            "processes": process_summary,
            "event_log": merged_log,
            "memory": _default_memory(settings, memory_state),
        }
    )

    # Ensure required keys always present.
    for key in [
        "ready_queue",
        "sys_queue",
        "user_queue",
        "io_queue",
        "gantt",
        "io_gantt",
        "mem_gantt",
        "completed",
        "per_process",
        "processes",
        "event_log",
    ]:
        if key not in state or state[key] is None:
            state[key] = []

    if "memory" not in state or not isinstance(state["memory"], dict):
        state["memory"] = _default_memory(settings, memory_state)

    return state
