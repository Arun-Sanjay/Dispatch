from typing import List

from .datasets import clone_processes
from .metrics import compute_metrics
from .models import Process
from .scheduler import CPUScheduler


def run_algorithm_once(
    processes: List[Process],
    algorithm: str,
    quantum: int = 2,
    preemptive_priority: bool = True,
    mlq_sys_quantum: int = 2,
    mlq_user_quantum: int = 4,
):
    """Run a full simulation for a given algorithm on a fresh clone of `processes` and return summary metrics."""
    sched = CPUScheduler(clone_processes(processes), algorithm=algorithm, quantum=quantum)
    if algorithm == "PRIORITY":
        # Priority is always preemptive in this build
        sched.preemptive_priority = True
    if algorithm == "MLQ":
        sched.quantum_sys = int(mlq_sys_quantum)
        sched.quantum_user = int(mlq_user_quantum)

    guard = 0
    max_steps = 200000  # safety
    while (not sched.done()) and guard < max_steps:
        sched.tick()
        guard += 1

    rows, avg_wt, avg_tat, avg_rt = compute_metrics(sched.processes)

    total = len(sched.gantt_chart)
    busy = sum(1 for x in sched.gantt_chart if x != "IDLE")
    util = (busy / total * 100.0) if total else 0.0

    makespan = sched.time
    throughput = (len(sched.completed) / makespan) if makespan > 0 else 0.0

    return {
        "algorithm": algorithm,
        "avg_wt": float(avg_wt),
        "avg_tat": float(avg_tat),
        "avg_rt": float(avg_rt),
        "cpu_util": float(util),
        "makespan": int(makespan),
        "throughput": float(throughput),
        "_rows": rows,
    }


def compare_all_algorithms(
    processes: List[Process],
    rr_quantum: int,
    preemptive_priority: bool,
    mlq_sys_quantum: int = 2,
    mlq_user_quantum: int = 4,
):
    """Return a list of result dicts for all supported algorithms."""
    algos = ["FCFS", "SJF", "PRIORITY", "RR", "MLQ"]
    out = []
    for a in algos:
        q = rr_quantum if a == "RR" else 2
        out.append(
            run_algorithm_once(
                processes,
                a,
                quantum=q,
                preemptive_priority=preemptive_priority,
                mlq_sys_quantum=mlq_sys_quantum,
                mlq_user_quantum=mlq_user_quantum,
            )
        )
    return out
