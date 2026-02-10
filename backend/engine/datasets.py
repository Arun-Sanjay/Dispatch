import json
import os
from typing import List

from .models import Process


def _script_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_default_processes() -> List[Process]:
    here = _script_dir()
    return load_processes_json(os.path.join(here, "processes.json"))


# Helper: clone process list (no runtime fields)
def clone_processes(procs: List[Process]) -> List[Process]:
    return [
        Process(
            p.pid,
            p.arrival_time,
            p.burst_time,
            priority=p.priority,
            queue=p.queue,
            cpu_bursts=list(p.cpu_bursts) if p.cpu_bursts is not None else None,
            io_bursts=list(p.io_bursts) if p.io_bursts is not None else None,
        )
        for p in procs
    ]


# ------------------------------
# Dataset loaders: presets + JSON
# ------------------------------
def load_preset(preset_id: int) -> List[Process]:
    if preset_id == 1:
        return [
            Process("P1", arrival_time=0, burst_time=5, priority=2, queue="USER"),
            Process("P2", arrival_time=1, burst_time=3, priority=1, queue="SYS"),
            Process("P3", arrival_time=2, burst_time=6, priority=3, queue="USER"),
            Process("P4", arrival_time=4, burst_time=2, priority=0, queue="SYS"),
        ]

    if preset_id == 2:
        return [
            Process("P1", arrival_time=0, burst_time=3, priority=1, queue="USER"),
            Process("P2", arrival_time=6, burst_time=2, priority=0, queue="SYS"),
            Process("P3", arrival_time=8, burst_time=4, priority=2, queue="USER"),
            Process("P4", arrival_time=12, burst_time=2, priority=1, queue="SYS"),
        ]

    if preset_id == 3:
        return [
            Process("P1", arrival_time=0, burst_time=4, priority=3, queue="USER"),
            Process("P2", arrival_time=1, burst_time=3, priority=0, queue="SYS"),
            Process("P3", arrival_time=2, burst_time=5, priority=2, queue="USER"),
            Process("P4", arrival_time=3, burst_time=2, priority=1, queue="SYS"),
        ]

    if preset_id == 4:
        return [
            Process("P1", arrival_time=0, burst_time=6, priority=1, queue="USER"),
            Process("P2", arrival_time=0, burst_time=5, priority=2, queue="USER"),
            Process("P3", arrival_time=0, burst_time=4, priority=3, queue="USER"),
            Process("P4", arrival_time=0, burst_time=3, priority=0, queue="USER"),
        ]

    if preset_id == 5:
        return [
            Process("S1", arrival_time=0, burst_time=4, priority=0, queue="SYS"),
            Process("U1", arrival_time=0, burst_time=6, priority=3, queue="USER"),
            Process("S2", arrival_time=2, burst_time=3, priority=1, queue="SYS"),
            Process("U2", arrival_time=3, burst_time=4, priority=2, queue="USER"),
        ]

    return load_preset(1)


def load_processes_json(path: str = "processes.json") -> List[Process]:
    # Always resolve relative paths from the directory of this script
    if not os.path.isabs(path):
        here = _script_dir()
        path = os.path.join(here, path)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    processes: List[Process] = []
    for item in data:
        cpu_bursts = None
        io_bursts = None

        # Optional: bursts = [cpu, io, cpu, io, cpu] (must start with CPU)
        if "bursts" in item and item["bursts"] is not None:
            seq = [max(1, int(x)) for x in item["bursts"]]
            cpu_bursts = seq[0::2]
            io_bursts = seq[1::2]
            bt = int(sum(cpu_bursts)) if cpu_bursts else int(item.get("burst_time", 1))
        else:
            bt = int(item["burst_time"])

        processes.append(
            Process(
                pid=str(item["pid"]),
                arrival_time=int(item["arrival_time"]),
                burst_time=bt,
                priority=int(item.get("priority", 0)),
                queue=str(item.get("queue", "USER")),
                cpu_bursts=cpu_bursts,
                io_bursts=io_bursts,
            )
        )

    return processes
