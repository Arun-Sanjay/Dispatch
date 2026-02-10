from typing import List, Optional

from .models import Process


class CPUScheduler:
    """
    Supported algorithms:
      - FCFS (non-preemptive)
      - SJF  (preemptive SRTF: shortest remaining time first)
      - PRIORITY (preemptive; lower priority number runs first)
      - RR (Round Robin; time quantum)
      - MLQ (Multilevel Queue):
          SYS queue  = Round Robin (quantum_sys)
          USER queue = Round Robin (quantum_user)
          SYS has strict priority over USER (preempts USER at tick boundary)
    """

    def __init__(self, processes: List[Process], algorithm: str = "FCFS", quantum: int = 2):
        self.processes = processes
        self.algorithm = algorithm
        self.quantum = quantum          # RR quantum (time units)
        self.quantum_sys = 2            # MLQ SYS quantum (time units)
        self.quantum_user = 4           # MLQ USER quantum (time units)
        self.preemptive_priority = True
        self.reset()

    def reset(self):
        self.time = 0

        # Single-queue algorithms
        self.ready_queue: List[Process] = []

        # MLQ queues
        self.sys_queue: List[Process] = []
        self.user_queue: List[Process] = []

        self.running: Optional[Process] = None
        self.completed: List[Process] = []
        self.gantt_chart: List[str] = []

        # I/O device model (single device): io_active runs, io_queue waits
        self.io_queue: List[Process] = []
        self.io_active: Optional[Process] = None
        self.io_gantt_chart: List[str] = []
        # RR/MLQ time-slice tracking
        self.slice_left: int = 0

        # Transition log for visualizing process state changes
        self.event_log: List[str] = []
        self.event_log_limit: int = 120

        # Stable list for arrival checks
        self._all = self.processes

        # Reset runtime fields on processes
        for p in self._all:
            p.cpu_index = 0
            p.io_index = 0
            p.io_remaining = 0
            p.remaining_time = int(p.cpu_bursts[0]) if p.cpu_bursts else 0

            p.start_time = None
            p.completion_time = None
            p.arrived = False
            p.state = "NEW"

    def set_algorithm(self, algorithm: str):
        # Switch algorithm and reset simulation for clean demo
        self.algorithm = algorithm
        self.reset()

    def add_arrived_processes(self):
        for p in self._all:
            if (not p.arrived) and p.arrival_time <= self.time:
                if self.algorithm == "MLQ":
                    if p.queue.upper() == "SYS":
                        self.sys_queue.append(p)
                    else:
                        self.user_queue.append(p)
                else:
                    self.ready_queue.append(p)
                p.arrived = True
                self._set_state(p, "READY")

    def done(self) -> bool:
        return len(self.completed) == len(self.processes)

    def _log_event(self, msg: str):
        self.event_log.append(msg)
        if len(self.event_log) > self.event_log_limit:
            self.event_log = self.event_log[-self.event_log_limit:]

    def _set_state(self, p: 'Process', new_state: str, detail: str = ""):
        old = getattr(p, "state", "NEW")
        if old != new_state:
            p.state = new_state
            extra = f" {detail}" if detail else ""
            self._log_event(f"t={self.time}: {p.pid} {old} → {new_state}{extra}")

    # -------- Scheduling helpers --------
    def _dispatch_fcfs(self):
        if self.running is None and self.ready_queue:
            self.running = self.ready_queue.pop(0)
            self._set_state(self.running, "RUNNING")
            if self.running.start_time is None:
                self.running.start_time = self.time

    def _dispatch_sjf(self):
        # Preemptive SJF (SRTF): always run the job with the shortest remaining CPU time
        if self.running is None and self.ready_queue:
            idx = min(
                range(len(self.ready_queue)),
                key=lambda i: (
                    self.ready_queue[i].remaining_time,
                    self.ready_queue[i].arrival_time,
                    self.ready_queue[i].pid,
                ),
            )
            self.running = self.ready_queue.pop(idx)
            self._set_state(self.running, "RUNNING")
            if self.running.start_time is None:
                self.running.start_time = self.time

        elif self.running is not None and self.ready_queue:
            best_idx = min(
                range(len(self.ready_queue)),
                key=lambda i: (
                    self.ready_queue[i].remaining_time,
                    self.ready_queue[i].arrival_time,
                    self.ready_queue[i].pid,
                ),
            )
            best = self.ready_queue[best_idx]

            # Preempt only if a strictly shorter remaining-time job exists
            if best.remaining_time < self.running.remaining_time:
                self.ready_queue.pop(best_idx)
                self._set_state(self.running, "READY", "(preempted)")
                self.ready_queue.append(self.running)
                self.running = best
                self._set_state(self.running, "RUNNING")
                if self.running.start_time is None:
                    self.running.start_time = self.time

    def _dispatch_priority(self):
        if self.running is None and self.ready_queue:
            idx = min(
                range(len(self.ready_queue)),
                key=lambda i: (
                    self.ready_queue[i].priority,
                    self.ready_queue[i].arrival_time,
                    self.ready_queue[i].pid,
                ),
            )
            self.running = self.ready_queue.pop(idx)
            self._set_state(self.running, "RUNNING")
            if self.running.start_time is None:
                self.running.start_time = self.time
        elif self.running and self.preemptive_priority and self.ready_queue:
            # Preempt if a strictly higher priority process exists in the ready queue.
            best_idx = min(
                range(len(self.ready_queue)),
                key=lambda i: (
                    self.ready_queue[i].priority,
                    self.ready_queue[i].arrival_time,
                    self.ready_queue[i].pid,
                ),
            )
            best = self.ready_queue[best_idx]
            if best.priority < self.running.priority:
                self.ready_queue.pop(best_idx)
                # Put the current running process back into the ready queue (no data loss).
                self._set_state(self.running, "READY", "(preempted)")
                self.ready_queue.append(self.running)
                self.running = best
                self._set_state(self.running, "RUNNING")
                if self.running.start_time is None:
                    self.running.start_time = self.time

    def _dispatch_rr(self):
        if self.running is None and self.ready_queue:
            self.running = self.ready_queue.pop(0)
            self._set_state(self.running, "RUNNING")
            if self.running.start_time is None:
                self.running.start_time = self.time
            self.slice_left = self.quantum

    def _dispatch_mlq(self):
        # SYS always wins; preempt USER at tick boundary if SYS becomes non-empty
        if self.running is not None:
            if self.running.queue.upper() != "SYS" and self.sys_queue:
                self._set_state(self.running, "READY", "(preempted by SYS)")
                self.user_queue.insert(0, self.running)
                self.running = None

        if self.running is None:
            if self.sys_queue:
                self.running = self.sys_queue.pop(0)
                self._set_state(self.running, "RUNNING")
                if self.running.start_time is None:
                    self.running.start_time = self.time
                self.slice_left = self.quantum_sys
            elif self.user_queue:
                self.running = self.user_queue.pop(0)
                self._set_state(self.running, "RUNNING")
                if self.running.start_time is None:
                    self.running.start_time = self.time
                # USER is also time-sliced (more OS-realistic).
                self.slice_left = self.quantum_user

    def schedule(self):
        if self.algorithm == "FCFS":
            self._dispatch_fcfs()
        elif self.algorithm == "SJF":
            self._dispatch_sjf()
        elif self.algorithm == "PRIORITY":
            self._dispatch_priority()
        elif self.algorithm == "RR":
            self._dispatch_rr()
        elif self.algorithm == "MLQ":
            self._dispatch_mlq()
        else:
            self._dispatch_fcfs()

    def _tick_io(self):
        # Start IO if device is idle
        if self.io_active is None and self.io_queue:
            self.io_active = self.io_queue.pop(0)

        if self.io_active is not None:
            self.io_active.io_remaining -= 1
            self.io_gantt_chart.append(self.io_active.pid)

            # IO completed -> go back to READY for the next CPU burst
            if self.io_active.io_remaining <= 0:
                p = self.io_active
                self.io_active = None

                if p.cpu_index < len(p.cpu_bursts):
                    p.remaining_time = int(p.cpu_bursts[p.cpu_index])

                if p.completion_time is None:
                    self._set_state(p, "READY", "(I/O done)")
                    if self.algorithm == "MLQ":
                        if p.queue.upper() == "SYS":
                            self.sys_queue.append(p)
                        else:
                            self.user_queue.append(p)
                    else:
                        self.ready_queue.append(p)
        else:
            self.io_gantt_chart.append("IDLE")

    def execute(self):
        if self.running:
            self.running.remaining_time -= 1
            self.gantt_chart.append(self.running.pid)

            # time-slice tracking
            if self.algorithm == "RR":
                self.slice_left -= 1
            elif self.algorithm == "MLQ":
                self.slice_left -= 1

            # CPU burst finished
            if self.running.remaining_time == 0:
                p = self.running
                self.running = None
                self.slice_left = 0

                # advance CPU burst index
                p.cpu_index += 1

                # If there is an IO burst after this CPU burst -> WAIT
                if p.io_index < len(p.io_bursts):
                    p.io_remaining = int(p.io_bursts[p.io_index])
                    p.io_index += 1
                    self._set_state(p, "WAITING", "(I/O)" )
                    self.io_queue.append(p)
                    return

                # If more CPU bursts remain (edge case: CPU bursts without IO) -> READY
                if p.cpu_index < len(p.cpu_bursts):
                    p.remaining_time = int(p.cpu_bursts[p.cpu_index])
                    self._set_state(p, "READY")
                    if self.algorithm == "MLQ":
                        if p.queue.upper() == "SYS":
                            self.sys_queue.append(p)
                        else:
                            self.user_queue.append(p)
                    else:
                        self.ready_queue.append(p)
                    return

                # Otherwise process completed
                self._set_state(p, "DONE")
                p.completion_time = self.time + 1
                self.completed.append(p)
                return

            # RR time slice ended
            if self.algorithm == "RR" and self.slice_left == 0:
                self._set_state(self.running, "READY", "(time slice)")
                self.ready_queue.append(self.running)
                self.running = None
            elif self.algorithm == "MLQ" and self.running and self.slice_left == 0:
                self._set_state(self.running, "READY", "(time slice)")
                if self.running.queue.upper() == "SYS":
                    self.sys_queue.append(self.running)
                else:
                    self.user_queue.append(self.running)
                self.running = None
        else:
            self.gantt_chart.append("IDLE")

    def tick(self):
        self.add_arrived_processes()
        self._tick_io()
        self.schedule()
        self.execute()
        self.time += 1
