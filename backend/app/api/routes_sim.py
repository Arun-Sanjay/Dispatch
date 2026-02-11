from math import sqrt
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException

from app.engine import Process, compare_all_algorithms
from app.memory_sim import normalize_memory_algo, run_memory_algorithm
from app.session import (
    add_process,
    clear_added_processes,
    get_compare_processes,
    get_settings,
    get_state,
    init_session,
    remove_added_process,
    reset_session,
    run_session,
    set_config,
    tick_session,
)

router = APIRouter()


def _to_process(item: Dict[str, Any]) -> Process:
    bursts = item.get("bursts")
    cpu_bursts = None
    io_bursts = None
    if bursts is not None:
        seq = [max(1, int(x)) for x in list(bursts)]
        cpu_bursts = seq[0::2]
        io_bursts = seq[1::2]
        burst_time = int(sum(cpu_bursts)) if cpu_bursts else int(item.get("burst_time", 1))
    else:
        burst_time = int(item.get("burst_time", 1))
        cpu_bursts = [max(1, burst_time)]

    return Process(
        pid=str(item.get("pid", "P?")),
        arrival_time=int(item.get("arrival_time", 0)),
        burst_time=max(1, int(burst_time)),
        priority=int(item.get("priority", 0)),
        queue=str(item.get("queue", "USER")),
        cpu_bursts=cpu_bursts,
        io_bursts=io_bursts,
    )


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _compute_workload(processes: List[Process]) -> Dict[str, float]:
    cpu_bursts: List[int] = []
    total_io = 0
    arrivals: List[int] = []

    for process in processes:
        arrivals.append(int(process.arrival_time))
        for burst in list(process.cpu_bursts or []):
            cpu_bursts.append(int(burst))
        for io_burst in list(process.io_bursts or []):
            total_io += int(io_burst)

    total_cpu = sum(cpu_bursts)
    n_procs = len(processes)
    burst_count_total = len(cpu_bursts)
    avg_cpu = (total_cpu / burst_count_total) if burst_count_total else 0.0
    var_cpu = 0.0
    if burst_count_total > 0:
        var_cpu = sum((burst - avg_cpu) ** 2 for burst in cpu_bursts) / burst_count_total
    std_cpu = sqrt(var_cpu) if var_cpu > 0 else 0.0
    arrival_spread = (max(arrivals) - min(arrivals)) if arrivals else 0

    return {
        "total_cpu": float(total_cpu),
        "total_io": float(total_io),
        "io_ratio": float(total_io / max(total_cpu, 1)),
        "avg_cpu_burst": float(avg_cpu),
        "std_cpu_burst": float(std_cpu),
        "burst_variance": float(std_cpu / max(avg_cpu, 1.0)),
        "n_procs": float(n_procs),
        "arrival_spread": float(arrival_spread),
        "burst_count_total": float(burst_count_total),
    }


def _normalize_compare_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    rows = raw.get("_rows") or []
    per_process: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue

        def _maybe_int(value: Any) -> Optional[int]:
            if value in {"-", None}:
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        per_process.append(
            {
                "pid": str(row.get("PID", "")),
                "at": int(row.get("AT", 0)),
                "pr": int(row.get("PR", 0)),
                "queue": str(row.get("Q", "USER")),
                "st": _maybe_int(row.get("ST")),
                "ct": _maybe_int(row.get("CT")),
                "tat": _maybe_int(row.get("TAT")),
                "wt": _maybe_int(row.get("WT")),
                "rt": _maybe_int(row.get("RT")),
            }
        )

    return {
        "algorithm": str(raw.get("algorithm", "FCFS")),
        "avg_wt": _safe_float(raw.get("avg_wt", 0.0)),
        "avg_tat": _safe_float(raw.get("avg_tat", 0.0)),
        "avg_rt": _safe_float(raw.get("avg_rt", 0.0)),
        "cpu_util": _safe_float(raw.get("cpu_util", 0.0)),
        "makespan": int(raw.get("makespan", 0)),
        "throughput": _safe_float(raw.get("throughput", 0.0)),
        "per_process": per_process,
    }


@router.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


@router.post("/sim/init")
def sim_init(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    return init_session(payload)


@router.post("/sim/tick")
def sim_tick() -> Dict[str, Any]:
    return tick_session()


@router.post("/sim/run")
def sim_run(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    steps = int(payload.get("steps", 1))
    return run_session(steps)


@router.post("/sim/add")
def sim_add(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, bool]:
    process_payload = payload.get("process") if isinstance(payload.get("process"), dict) else payload
    try:
        add_process(process_payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"ok": True}


@router.post("/sim/add_process")
def sim_add_process(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, bool]:
    return sim_add(payload)


@router.post("/sim/clear_added")
def sim_clear_added() -> Dict[str, bool]:
    clear_added_processes()
    return {"ok": True}


@router.post("/sim/remove/{pid}")
def sim_remove(pid: str) -> Dict[str, bool]:
    try:
        remove_added_process(pid)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"ok": True}


@router.post("/sim/config")
def sim_config(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    try:
        return set_config(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/sim/state")
def sim_state() -> Dict[str, Any]:
    return get_state()


@router.post("/sim/compare")
def sim_compare(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    order = {"FCFS": 0, "SJF": 1, "PRIORITY": 2, "RR": 3, "MLQ": 4}

    payload_processes = payload.get("processes")
    if isinstance(payload_processes, list) and payload_processes:
        processes = [_to_process(p) for p in payload_processes if isinstance(p, dict)]
    else:
        processes = get_compare_processes()

    settings = get_settings()
    rr_quantum = int(payload.get("rr_quantum", settings.get("quantum", 2)))
    preemptive_priority = bool(payload.get("preemptive_priority", settings.get("preemptive_priority", True)))
    mlq_sys_quantum = int(payload.get("mlq_sys_quantum", settings.get("mlq_sys_quantum", 2)))
    mlq_user_quantum = int(payload.get("mlq_user_quantum", settings.get("mlq_user_quantum", 4)))

    results = compare_all_algorithms(
        processes,
        rr_quantum=rr_quantum,
        preemptive_priority=preemptive_priority,
        mlq_sys_quantum=mlq_sys_quantum,
        mlq_user_quantum=mlq_user_quantum,
    )

    normalized = [_normalize_compare_row(result) for result in results]

    normalized.sort(key=lambda row: order.get(row["algorithm"], 999))
    return {
        "results": normalized,
        "workload": _compute_workload(processes),
    }


@router.post("/memory/run")
def memory_run(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    frames = int(payload.get("frames", 4))
    algo = normalize_memory_algo(payload.get("algo", "LRU"), "LRU")
    refs_input = payload.get("refs", [])
    if not isinstance(refs_input, list):
        raise HTTPException(status_code=422, detail="refs must be an array of integers")

    try:
        refs = [int(value) for value in refs_input]
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="refs must contain only integers")

    if frames <= 0:
        raise HTTPException(status_code=422, detail="frames must be >= 1")

    return run_memory_algorithm(frames, algo, refs)


@router.post("/sim/reset")
def sim_reset() -> Dict[str, Any]:
    return reset_session()
