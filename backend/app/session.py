from copy import deepcopy
from threading import Lock
from typing import Any, Dict, List, Optional

from app.engine import CPUScheduler, Process, clone_processes
from app.serializers import default_state, serialize_state

_session_lock = Lock()

scheduler: Optional[CPUScheduler] = None
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


def _build_process(item: Dict[str, Any]) -> Process:
    bursts = item.get("bursts")
    cpu_bursts = None
    io_bursts = None

    if bursts is not None:
        seq = [max(1, _safe_int(x, 1)) for x in list(bursts)]
        cpu_bursts = seq[0::2]
        io_bursts = seq[1::2]
        burst_time = int(sum(cpu_bursts)) if cpu_bursts else _safe_int(item.get("burst_time", 1), 1)
    else:
        burst_time = _safe_int(item.get("burst_time", 1), 1)
        cpu_bursts = [max(1, burst_time)]

    return Process(
        pid=str(item.get("pid", "P?")),
        arrival_time=_safe_int(item.get("arrival_time", 0), 0),
        burst_time=max(1, burst_time),
        priority=_safe_int(item.get("priority", 0), 0),
        queue=str(item.get("queue", "USER")),
        cpu_bursts=cpu_bursts,
        io_bursts=io_bursts,
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

    sched = CPUScheduler(
        clone_processes(base_processes),
        algorithm=str(settings.get("algorithm", "FCFS")),
        quantum=max(1, _safe_int(settings.get("quantum", 2), 2)),
    )
    sched.preemptive_priority = _safe_bool(settings.get("preemptive_priority", True), True)
    sched.quantum_sys = max(1, _safe_int(settings.get("mlq_sys_quantum", 2), 2))
    sched.quantum_user = max(1, _safe_int(settings.get("mlq_user_quantum", 4), 4))
    return sched


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
        if base_processes:
            scheduler = _new_scheduler_from_base()
            event_log = ["Session reset"]
            return _state()

        scheduler = None
        event_log = []
        return default_state(settings)


def init_session(payload: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, base_processes, settings, event_log

    data = payload or {}
    with _session_lock:
        settings["algorithm"] = str(data.get("algorithm", settings.get("algorithm", "FCFS")))
        settings["tick_ms"] = max(1, _safe_int(data.get("tick_ms", settings.get("tick_ms", 200)), 200))
        settings["quantum"] = max(1, _safe_int(data.get("quantum", settings.get("quantum", 2)), 2))
        settings["preemptive_priority"] = _safe_bool(
            data.get("preemptive_priority", settings.get("preemptive_priority", True)),
            True,
        )
        settings["mlq_sys_quantum"] = max(
            1,
            _safe_int(data.get("mlq_sys_quantum", settings.get("mlq_sys_quantum", 2)), 2),
        )
        settings["mlq_user_quantum"] = max(
            1,
            _safe_int(data.get("mlq_user_quantum", settings.get("mlq_user_quantum", 4)), 4),
        )

        base_processes = _build_process_list(data.get("processes"))
        scheduler = _new_scheduler_from_base()

        event_log = [
            f"Initialized algorithm={settings['algorithm']} processes={len(base_processes)}"
        ]
        return _state()


def tick_session() -> Dict[str, Any]:
    global event_log
    with _session_lock:
        if scheduler is None:
            return default_state(settings)

        if not scheduler.done():
            scheduler.tick()
            event_log.append(f"Tick -> t={scheduler.time}")
            if len(event_log) > 200:
                event_log = event_log[-200:]

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
        if len(event_log) > 200:
            event_log = event_log[-200:]

        return _state()


def add_process(proc: Dict[str, Any]) -> Dict[str, Any]:
    global scheduler, base_processes, event_log
    with _session_lock:
        if not isinstance(proc, dict):
            return _state() if scheduler is not None else default_state(settings)

        base_proc = _build_process(proc)

        # If session was not initialized, initialize with this one process.
        if scheduler is None:
            base_processes = [base_proc]
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

        base_processes.append(base_proc)
        event_log.append(
            f"Added {runtime_proc.pid} AT={runtime_proc.arrival_time} Q={runtime_proc.queue}"
        )
        if len(event_log) > 200:
            event_log = event_log[-200:]

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
