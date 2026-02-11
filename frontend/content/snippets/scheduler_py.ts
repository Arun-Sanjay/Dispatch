export const schedulerTickSnippet = `def tick_step(self) -> None:
    # A) admit arrivals for this tick
    for proc in list(self.pending_arrivals):
        if proc.arrival_time == self.time:
            self.pending_arrivals.remove(proc)
            proc.state = "READY"
            self.enqueue_ready(proc)
            self.log(f"t={self.time}: {proc.pid} NEW -> READY")

    # B) advance I/O device
    if self.io_active is not None:
        self.io_remaining -= 1
        if self.io_remaining <= 0:
            proc = self.io_active
            self.io_active = None
            proc.state = "READY"
            self.enqueue_ready(proc)
            self.log(f"t={self.time}: {proc.pid} WAITING_IO -> READY")

    # C) dispatch if CPU is idle
    if self.current is None:
        next_proc = self.pick_next_process()
        if next_proc is not None:
            self.current = next_proc
            next_proc.state = "RUNNING"
            if next_proc.start_time is None:
                next_proc.start_time = self.time
            self.log(f"t={self.time}: {next_proc.pid} READY -> RUNNING")

    # D) execute one CPU tick
    if self.current is None:
        self.gantt.append("IDLE")
    else:
        p = self.current
        self.gantt.append(p.pid)
        p.remaining_in_current_burst -= 1
        self.quantum_left -= 1

        if p.remaining_in_current_burst == 0:
            self.handle_cpu_completion(p)
        elif self.algorithm == "RR" and self.quantum_left == 0:
            p.state = "READY"
            self.enqueue_ready(p)
            self.current = None
            self.log(f"t={self.time}: {p.pid} RUNNING -> READY (time slice)")

    self.time += 1
`;

export const rrRotationSnippet = `def schedule_rr(self) -> Process | None:
    if not self.ready_queue:
        return None

    # Round-robin queue discipline: pop front, run for quantum.
    proc = self.ready_queue.popleft()
    self.quantum_left = self.quantum

    # CPU burst already active from previous dispatch or new arrival.
    if proc.remaining_in_current_burst <= 0:
        proc.remaining_in_current_burst = proc.bursts[proc.burst_index]

    return proc


def maybe_preempt_rr(self) -> None:
    if self.current is None:
        return

    if self.quantum_left > 0:
        return

    current = self.current
    current.state = "READY"
    self.ready_queue.append(current)
    self.current = None
    self.log(
        f"t={self.time}: {current.pid} RUNNING -> READY (time slice, q={self.quantum})"
    )
`;

export const heapSelectionSnippet = `import heapq


def schedule_priority(self) -> Process | None:
    # min-heap by priority, then arrival, then pid for deterministic tie-breaks
    while self.priority_heap:
        priority, arrival, pid, proc = heapq.heappop(self.priority_heap)
        if proc.state != "READY":
            continue

        if proc.remaining_in_current_burst <= 0:
            proc.remaining_in_current_burst = proc.bursts[proc.burst_index]

        return proc

    return None


def push_ready_priority(self, proc: Process) -> None:
    heapq.heappush(
        self.priority_heap,
        (proc.priority, proc.arrival_time, proc.pid, proc),
    )
`;

export const pagingLruSnippet = `class LruFramePolicy:
    def __init__(self) -> None:
        self.nodes: dict[int, _Node] = {}
        self.head = _Node(-1)
        self.tail = _Node(-1)
        self.head.next = self.tail
        self.tail.prev = self.head

    def on_access(self, pfn: int) -> None:
        node = self.nodes.get(pfn)
        if node is None:
            return
        self._detach(node)
        self._attach_back(node)

    def on_load(self, pfn: int) -> None:
        node = _Node(pfn)
        self.nodes[pfn] = node
        self._attach_back(node)

    def on_evict(self, pfn: int) -> None:
        node = self.nodes.pop(pfn, None)
        if node is not None:
            self._detach(node)

    def choose_victim_frame(self, frames: list[Frame]) -> int:
        # Least recently used is the first real node after head.
        victim = self.head.next
        if victim is None or victim is self.tail:
            raise RuntimeError("No frame available for eviction")
        return victim.pfn

    def _detach(self, node: _Node) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _attach_back(self, node: _Node) -> None:
        node.prev = self.tail.prev
        node.next = self.tail
        self.tail.prev.next = node
        self.tail.prev = node
`;
