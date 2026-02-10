from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Process:
    pid: str
    arrival_time: int

    # Total CPU time across all CPU bursts (used for metrics)
    burst_time: int

    priority: int = 0          # lower number = higher priority
    queue: str = "USER"        # for MLQ: "SYS" or "USER"
    arrived: bool = False      # internal: has this process been enqueued yet?

    # Burst model
    # cpu_bursts = [cpu1, cpu2, ...]
    # io_bursts  = [io1,  io2,  ...] where io_i occurs after cpu_i
    cpu_bursts: Optional[List[int]] = None
    io_bursts: Optional[List[int]] = None

    # Runtime state
    remaining_time: int = 0          # remaining in current CPU burst
    cpu_index: int = 0              # current CPU burst index
    io_index: int = 0               # current IO burst index
    io_remaining: int = 0           # remaining IO time if in IO

    start_time: Optional[int] = None
    completion_time: Optional[int] = None

    # UI state (NEW/READY/RUNNING/WAITING/DONE)
    state: str = "NEW"

    def __post_init__(self):
        # Back-compat: if cpu_bursts not provided, treat burst_time as a single CPU burst
        if self.cpu_bursts is None:
            self.cpu_bursts = [int(self.burst_time)]
        else:
            self.cpu_bursts = [max(1, int(x)) for x in self.cpu_bursts] if self.cpu_bursts else [1]

        if self.io_bursts is None:
            self.io_bursts = []
        else:
            self.io_bursts = [max(1, int(x)) for x in self.io_bursts]

        # Ensure burst_time equals total CPU time
        self.burst_time = int(sum(self.cpu_bursts))

        # Initialize runtime fields
        self.cpu_index = 0
        self.io_index = 0
        self.io_remaining = 0
        self.remaining_time = int(self.cpu_bursts[0]) if self.cpu_bursts else 0
