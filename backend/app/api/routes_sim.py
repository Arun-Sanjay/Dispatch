from typing import Any, Dict, List

from fastapi import APIRouter, Body

from app.engine import Process, compare_all_algorithms
from app.session import (
    add_process,
    get_compare_processes,
    get_settings,
    get_state,
    init_session,
    reset_session,
    run_session,
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
def sim_add(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, Any]:
    process_payload = payload.get("process") if isinstance(payload.get("process"), dict) else payload
    return add_process(process_payload)


@router.get("/sim/state")
def sim_state() -> Dict[str, Any]:
    return get_state()


@router.post("/sim/compare")
def sim_compare(payload: Dict[str, Any] = Body(default_factory=dict)) -> Dict[str, List[Dict[str, Any]]]:
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

    normalized: List[Dict[str, Any]] = []
    for r in results:
        normalized.append(
            {
                "algorithm": str(r.get("algorithm", "FCFS")),
                "avg_wt": float(r.get("avg_wt", 0.0)),
                "avg_tat": float(r.get("avg_tat", 0.0)),
                "avg_rt": float(r.get("avg_rt", 0.0)),
                "cpu_util": float(r.get("cpu_util", 0.0)),
                "makespan": int(r.get("makespan", 0)),
                "throughput": float(r.get("throughput", 0.0)),
            }
        )

    normalized.sort(key=lambda row: order.get(row["algorithm"], 999))
    return {"results": normalized}


@router.post("/sim/reset")
def sim_reset() -> Dict[str, Any]:
    return reset_session()
