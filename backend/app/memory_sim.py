from __future__ import annotations

from collections import OrderedDict, defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Tuple

MEMORY_ALGOS = {"FIFO", "LRU", "LFU", "OPT", "CLOCK"}


def normalize_memory_algo(value: Any, default: str = "LRU") -> str:
    algo = str(value or default).strip().upper()
    if algo not in MEMORY_ALGOS:
        return default
    return algo


def normalize_memory_mode(value: Any, default: str = "CPU_ONLY") -> str:
    mode = str(value or default).strip().upper()
    return "FULL" if mode in {"FULL", "FULL_SYSTEM", "CPU+MEMORY"} else "CPU_ONLY"


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _safe_page(value: Any) -> int:
    page = _safe_int(value, 0)
    return max(0, page)


def _stable_pid_seed(pid: str) -> int:
    seed = 0
    for idx, ch in enumerate(str(pid)):
        seed = (seed * 131 + (idx + 11) * ord(ch)) & 0x7FFFFFFF
    return seed or 1


def _normalize_refs(refs: List[Any]) -> List[int]:
    return [_safe_page(value) for value in list(refs or [])]


def _make_result(steps: List[Dict[str, Any]], faults: int, hits: int) -> Dict[str, Any]:
    total = faults + hits
    return {
        "steps": steps,
        "faults": faults,
        "hits": hits,
        "hitRatio": (hits / total) if total > 0 else 0.0,
    }


def run_fifo(frames_count: int, refs: List[int]) -> Dict[str, Any]:
    frames = [None] * max(1, _safe_int(frames_count, 3))
    pointer = 0
    steps: List[Dict[str, Any]] = []
    faults = 0
    hits = 0

    for t, ref in enumerate(refs):
        hit = ref in frames
        evicted: Optional[int] = None
        if hit:
            hits += 1
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
                frames[idx] = ref
            else:
                evicted = frames[pointer]
                frames[pointer] = ref
                pointer = (pointer + 1) % len(frames)

        step = {
            "t": t,
            "ref": ref,
            "frames": list(frames),
            "hit": hit,
        }
        if evicted is not None:
            step["evicted"] = evicted
        steps.append(step)

    return _make_result(steps, faults, hits)


def run_lru(frames_count: int, refs: List[int]) -> Dict[str, Any]:
    frames = [None] * max(1, _safe_int(frames_count, 3))
    usage: Deque[int] = deque()
    steps: List[Dict[str, Any]] = []
    faults = 0
    hits = 0

    def touch(page: int):
        try:
            usage.remove(page)
        except ValueError:
            pass
        usage.append(page)

    for t, ref in enumerate(refs):
        hit = ref in frames
        evicted: Optional[int] = None

        if hit:
            hits += 1
            touch(ref)
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
                frames[idx] = ref
                touch(ref)
            else:
                victim = usage.popleft() if usage else frames[0]
                idx = frames.index(victim)
                evicted = frames[idx]
                frames[idx] = ref
                touch(ref)

        step = {
            "t": t,
            "ref": ref,
            "frames": list(frames),
            "hit": hit,
        }
        if evicted is not None:
            step["evicted"] = evicted
        steps.append(step)

    return _make_result(steps, faults, hits)


def run_lfu(frames_count: int, refs: List[int]) -> Dict[str, Any]:
    frames = [None] * max(1, _safe_int(frames_count, 3))
    freq: Dict[int, int] = {}
    stamp: Dict[int, int] = {}
    counter = 0
    steps: List[Dict[str, Any]] = []
    faults = 0
    hits = 0

    def choose_victim() -> int:
        in_frames = [page for page in frames if page is not None]
        in_frames.sort(key=lambda page: (freq.get(page, 0), stamp.get(page, 0), page))
        return in_frames[0]

    for t, ref in enumerate(refs):
        counter += 1
        hit = ref in frames
        evicted: Optional[int] = None

        if hit:
            hits += 1
            freq[ref] = freq.get(ref, 0) + 1
            stamp[ref] = counter
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
                frames[idx] = ref
            else:
                victim = choose_victim()
                idx = frames.index(victim)
                evicted = frames[idx]
                frames[idx] = ref
                freq.pop(victim, None)
                stamp.pop(victim, None)

            freq[ref] = 1
            stamp[ref] = counter

        step = {
            "t": t,
            "ref": ref,
            "frames": list(frames),
            "hit": hit,
        }
        if evicted is not None:
            step["evicted"] = evicted
        steps.append(step)

    return _make_result(steps, faults, hits)


def run_opt(frames_count: int, refs: List[int]) -> Dict[str, Any]:
    frames = [None] * max(1, _safe_int(frames_count, 3))
    steps: List[Dict[str, Any]] = []
    faults = 0
    hits = 0

    future_positions: Dict[int, Deque[int]] = defaultdict(deque)
    for idx, page in enumerate(refs):
        future_positions[page].append(idx)

    for t, ref in enumerate(refs):
        positions = future_positions.get(ref)
        if positions and positions[0] == t:
            positions.popleft()

        hit = ref in frames
        evicted: Optional[int] = None

        if hit:
            hits += 1
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
                frames[idx] = ref
            else:
                farthest = -1
                victim_index = 0
                for idx, page in enumerate(frames):
                    if page is None:
                        victim_index = idx
                        farthest = float("inf")
                        break
                    upcoming = future_positions.get(page)
                    next_use = upcoming[0] if upcoming else float("inf")
                    if next_use > farthest:
                        farthest = next_use
                        victim_index = idx
                evicted = frames[victim_index]
                frames[victim_index] = ref

        step = {
            "t": t,
            "ref": ref,
            "frames": list(frames),
            "hit": hit,
        }
        if evicted is not None:
            step["evicted"] = evicted
        steps.append(step)

    return _make_result(steps, faults, hits)


def run_clock(frames_count: int, refs: List[int]) -> Dict[str, Any]:
    frame_len = max(1, _safe_int(frames_count, 3))
    frames: List[Optional[int]] = [None] * frame_len
    ref_bits = [0] * frame_len
    hand = 0
    steps: List[Dict[str, Any]] = []
    faults = 0
    hits = 0

    for t, ref in enumerate(refs):
        hit = False
        evicted: Optional[int] = None
        hit_idx = -1
        for idx, page in enumerate(frames):
            if page == ref:
                hit = True
                hit_idx = idx
                break

        if hit:
            hits += 1
            ref_bits[hit_idx] = 1
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
                frames[idx] = ref
                ref_bits[idx] = 1
            else:
                while ref_bits[hand] == 1:
                    ref_bits[hand] = 0
                    hand = (hand + 1) % frame_len
                evicted = frames[hand]
                frames[hand] = ref
                ref_bits[hand] = 1
                hand = (hand + 1) % frame_len

        step = {
            "t": t,
            "ref": ref,
            "frames": list(frames),
            "hit": hit,
        }
        if evicted is not None:
            step["evicted"] = evicted
        steps.append(step)

    return _make_result(steps, faults, hits)


def run_memory_algorithm(frames_count: int, algo: Any, refs: List[Any]) -> Dict[str, Any]:
    refs_norm = _normalize_refs(refs)
    frames_norm = max(1, _safe_int(frames_count, 3))
    normalized_algo = normalize_memory_algo(algo, "LRU")

    if normalized_algo == "FIFO":
        return run_fifo(frames_norm, refs_norm)
    if normalized_algo == "LFU":
        return run_lfu(frames_norm, refs_norm)
    if normalized_algo == "OPT":
        return run_opt(frames_norm, refs_norm)
    if normalized_algo == "CLOCK":
        return run_clock(frames_norm, refs_norm)
    return run_lru(frames_norm, refs_norm)


def _empty_frame(pfn: int) -> Dict[str, Any]:
    return {
        "pfn": int(pfn),
        "pid": None,
        "vpn": None,
        "loaded_at": 0,
        "last_used": 0,
        "freq": 0,
        "ref_bit": 0,
    }


def new_runtime(
    mode: Any = "CPU_ONLY",
    algo: Any = "LRU",
    frames: Any = 8,
    fault_penalty: Any = 5,
    page_size: Any = 4096,
) -> Dict[str, Any]:
    num_frames = max(1, _safe_int(frames, 8))
    page_size_norm = max(1, _safe_int(page_size, 4096))
    runtime = {
        "enabled": normalize_memory_mode(mode, "CPU_ONLY"),
        "mode": normalize_memory_mode(mode, "CPU_ONLY"),
        "algo": normalize_memory_algo(algo, "LRU"),
        "page_size": page_size_norm,
        "num_frames": num_frames,
        "fault_penalty": max(1, _safe_int(fault_penalty, 5)),
        "frames": [_empty_frame(pfn) for pfn in range(num_frames)],
        "page_tables": {},
        "hits": 0,
        "faults": 0,
        "hit_ratio": 0.0,
        "recent_steps": [],
        "last_translation_log": [],
        "mem_gantt": [],
        "fifo_queue": deque(),
        "lru_order": OrderedDict(),
        "lfu_freq": {},
        "lfu_buckets": {},
        "lfu_min_freq": 0,
        "clock_hand": 0,
    }
    return runtime


def reset_runtime(runtime: Dict[str, Any]) -> None:
    num_frames = max(1, _safe_int(runtime.get("num_frames", runtime.get("frames", 8)), 8))
    runtime["frames"] = [_empty_frame(pfn) for pfn in range(num_frames)]
    runtime["page_tables"] = {}
    runtime["hits"] = 0
    runtime["faults"] = 0
    runtime["hit_ratio"] = 0.0
    runtime["recent_steps"] = []
    runtime["last_translation_log"] = []
    runtime["mem_gantt"] = []
    runtime["fifo_queue"] = deque()
    runtime["lru_order"] = OrderedDict()
    runtime["lfu_freq"] = {}
    runtime["lfu_buckets"] = {}
    runtime["lfu_min_freq"] = 0
    runtime["clock_hand"] = 0


def _get_page_entry(runtime: Dict[str, Any], pid: str, vpn: int) -> Dict[str, Any]:
    page_tables = runtime.setdefault("page_tables", {})
    pid_table = page_tables.setdefault(str(pid), {})
    entry = pid_table.get(int(vpn))
    if entry is None:
        entry = {
            "present": False,
            "pfn": None,
            "last_used": 0,
            "freq": 0,
            "dirty": False,
        }
        pid_table[int(vpn)] = entry
    return entry


def _predict_next_use_distance(pid: str, vpn: int, current_t: int) -> int:
    horizon = 48
    seed0 = _stable_pid_seed(pid)
    target = max(0, int(vpn))
    for offset in range(1, horizon + 1):
        seed = (seed0 ^ ((current_t + offset) * 2654435761) ^ (offset * 11400714819323198485)) & 0x7FFFFFFF
        candidate = seed % 1024
        if candidate == target:
            return offset
    return horizon + 1


def _lfu_touch(runtime: Dict[str, Any], pfn: int, next_freq: int) -> None:
    buckets: Dict[int, OrderedDict] = runtime.setdefault("lfu_buckets", {})
    freq_map: Dict[int, int] = runtime.setdefault("lfu_freq", {})
    old_freq = freq_map.get(pfn)
    if old_freq is not None:
        bucket = buckets.get(old_freq)
        if bucket is not None and pfn in bucket:
            del bucket[pfn]
            if not bucket:
                buckets.pop(old_freq, None)
                if runtime.get("lfu_min_freq", 0) == old_freq:
                    runtime["lfu_min_freq"] = min(buckets.keys()) if buckets else 0

    bucket = buckets.setdefault(next_freq, OrderedDict())
    bucket[pfn] = None
    freq_map[pfn] = next_freq
    if runtime.get("lfu_min_freq", 0) == 0 or next_freq < runtime.get("lfu_min_freq", 0):
        runtime["lfu_min_freq"] = next_freq


def _on_access(runtime: Dict[str, Any], pfn: int) -> None:
    algo = normalize_memory_algo(runtime.get("algo", "LRU"), "LRU")
    if algo == "FIFO":
        return
    if algo in {"LRU", "OPT"}:
        order: OrderedDict = runtime.setdefault("lru_order", OrderedDict())
        if pfn in order:
            order.move_to_end(pfn)
        else:
            order[pfn] = None
        return
    if algo == "LFU":
        freq_map: Dict[int, int] = runtime.setdefault("lfu_freq", {})
        curr = freq_map.get(pfn, 0)
        _lfu_touch(runtime, pfn, curr + 1)
        return
    if algo == "CLOCK":
        frames: List[Dict[str, Any]] = runtime.get("frames", [])
        if 0 <= pfn < len(frames):
            frames[pfn]["ref_bit"] = 1


def _on_load(runtime: Dict[str, Any], pfn: int) -> None:
    algo = normalize_memory_algo(runtime.get("algo", "LRU"), "LRU")
    if algo == "FIFO":
        queue: Deque[int] = runtime.setdefault("fifo_queue", deque())
        try:
            queue.remove(pfn)
        except ValueError:
            pass
        queue.append(pfn)
        return
    if algo in {"LRU", "OPT"}:
        order: OrderedDict = runtime.setdefault("lru_order", OrderedDict())
        order[pfn] = None
        order.move_to_end(pfn)
        return
    if algo == "LFU":
        _lfu_touch(runtime, pfn, 1)
        return
    if algo == "CLOCK":
        frames: List[Dict[str, Any]] = runtime.get("frames", [])
        if 0 <= pfn < len(frames):
            frames[pfn]["ref_bit"] = 1


def _on_evict(runtime: Dict[str, Any], pfn: int) -> None:
    algo = normalize_memory_algo(runtime.get("algo", "LRU"), "LRU")
    if algo == "FIFO":
        queue: Deque[int] = runtime.setdefault("fifo_queue", deque())
        try:
            queue.remove(pfn)
        except ValueError:
            pass
        return
    if algo in {"LRU", "OPT"}:
        order: OrderedDict = runtime.setdefault("lru_order", OrderedDict())
        order.pop(pfn, None)
        return
    if algo == "LFU":
        freq_map: Dict[int, int] = runtime.setdefault("lfu_freq", {})
        freq = freq_map.pop(pfn, None)
        if freq is None:
            return
        buckets: Dict[int, OrderedDict] = runtime.setdefault("lfu_buckets", {})
        bucket = buckets.get(freq)
        if bucket and pfn in bucket:
            del bucket[pfn]
            if not bucket:
                buckets.pop(freq, None)
        runtime["lfu_min_freq"] = min(buckets.keys()) if buckets else 0
        return
    if algo == "CLOCK":
        frames: List[Dict[str, Any]] = runtime.get("frames", [])
        if 0 <= pfn < len(frames):
            frames[pfn]["ref_bit"] = 0


def _choose_victim_frame(runtime: Dict[str, Any], t: int) -> int:
    frames: List[Dict[str, Any]] = runtime.get("frames", [])
    for idx, frame in enumerate(frames):
        if frame.get("pid") is None:
            return idx

    algo = normalize_memory_algo(runtime.get("algo", "LRU"), "LRU")
    if algo == "FIFO":
        queue: Deque[int] = runtime.setdefault("fifo_queue", deque())
        if not queue:
            for frame in frames:
                queue.append(int(frame.get("pfn", 0)))
        return int(queue[0])

    if algo in {"LRU", "OPT"}:
        if algo == "LRU":
            order: OrderedDict = runtime.setdefault("lru_order", OrderedDict())
            if not order:
                for frame in frames:
                    order[int(frame.get("pfn", 0))] = None
            return int(next(iter(order)))

        # Online OPT approximation in live simulation.
        farthest = -1
        victim = 0
        for frame in frames:
            pid = str(frame.get("pid") or "")
            vpn = _safe_int(frame.get("vpn", 0), 0)
            dist = _predict_next_use_distance(pid, vpn, _safe_int(t, 0))
            if dist > farthest:
                farthest = dist
                victim = int(frame.get("pfn", 0))
        return victim

    if algo == "LFU":
        buckets: Dict[int, OrderedDict] = runtime.setdefault("lfu_buckets", {})
        if not buckets:
            for frame in frames:
                _lfu_touch(runtime, int(frame.get("pfn", 0)), 1)
            buckets = runtime.setdefault("lfu_buckets", {})
        min_freq = min(buckets.keys())
        bucket = buckets[min_freq]
        return int(next(iter(bucket)))

    # CLOCK
    hand = _safe_int(runtime.get("clock_hand", 0), 0)
    size = max(1, len(frames))
    scans = 0
    while scans < size * 2:
        idx = hand % size
        frame = frames[idx]
        if _safe_int(frame.get("ref_bit", 0), 0) == 0:
            runtime["clock_hand"] = (idx + 1) % size
            return idx
        frame["ref_bit"] = 0
        hand = (idx + 1) % size
        scans += 1
    runtime["clock_hand"] = (hand + 1) % size
    return hand % size


def runtime_access(
    runtime: Dict[str, Any],
    t: int,
    pid: str,
    va: int,
    process_profile: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], bool]:
    process_profile = process_profile or {}
    pid_str = str(pid)
    now = _safe_int(t, 0)
    page_size = max(1, _safe_int(runtime.get("page_size", 4096), 4096))

    address_base = max(0, _safe_int(process_profile.get("address_base", 0), 0))
    raw_va = max(0, _safe_int(va, 0))
    relative = raw_va - address_base
    if relative < 0:
        relative = 0

    vpn = relative // page_size
    offset = relative % page_size

    entry = _get_page_entry(runtime, pid_str, vpn)
    frames: List[Dict[str, Any]] = runtime.setdefault("frames", [])
    if not frames:
        frames.append(_empty_frame(0))

    hit = False
    hit_pfn: Optional[int] = None
    current_pfn = entry.get("pfn")
    if entry.get("present") and current_pfn is not None:
        pfn_idx = _safe_int(current_pfn, -1)
        if 0 <= pfn_idx < len(frames):
            frame = frames[pfn_idx]
            if frame.get("pid") == pid_str and _safe_int(frame.get("vpn", -1), -1) == vpn:
                hit = True
                hit_pfn = pfn_idx

    evicted: Optional[Dict[str, Any]] = None
    if hit and hit_pfn is not None:
        runtime["hits"] = _safe_int(runtime.get("hits", 0), 0) + 1
        frame = frames[hit_pfn]
        frame["last_used"] = now
        frame["freq"] = _safe_int(frame.get("freq", 0), 0) + 1
        frame["ref_bit"] = 1

        entry["present"] = True
        entry["pfn"] = hit_pfn
        entry["last_used"] = now
        entry["freq"] = _safe_int(entry.get("freq", 0), 0) + 1
        _on_access(runtime, hit_pfn)
        selected_pfn = hit_pfn
    else:
        runtime["faults"] = _safe_int(runtime.get("faults", 0), 0) + 1
        pfn = _choose_victim_frame(runtime, now)
        pfn = max(0, min(pfn, len(frames) - 1))
        victim_frame = frames[pfn]

        if victim_frame.get("pid") is not None and victim_frame.get("vpn") is not None:
            victim_pid = str(victim_frame.get("pid"))
            victim_vpn = _safe_int(victim_frame.get("vpn"), 0)
            victim_entry = _get_page_entry(runtime, victim_pid, victim_vpn)
            victim_entry["present"] = False
            victim_entry["pfn"] = None
            evicted = {
                "pid": victim_pid,
                "vpn": victim_vpn,
                "pfn": pfn,
            }
            _on_evict(runtime, pfn)

        victim_frame["pid"] = pid_str
        victim_frame["vpn"] = vpn
        victim_frame["loaded_at"] = now
        victim_frame["last_used"] = now
        victim_frame["freq"] = 1
        victim_frame["ref_bit"] = 1

        entry["present"] = True
        entry["pfn"] = pfn
        entry["last_used"] = now
        entry["freq"] = _safe_int(entry.get("freq", 0), 0) + 1
        _on_load(runtime, pfn)
        selected_pfn = pfn

    total = _safe_int(runtime.get("hits", 0), 0) + _safe_int(runtime.get("faults", 0), 0)
    runtime["hit_ratio"] = (_safe_int(runtime.get("hits", 0), 0) / total) if total > 0 else 0.0

    step: Dict[str, Any] = {
        "t": now,
        "pid": pid_str,
        "va": raw_va,
        "vpn": vpn,
        "offset": offset,
        "pfn": selected_pfn,
        "hit": bool(hit),
        "fault": not hit,
    }
    if evicted is not None:
        step["evicted"] = evicted

    recent_steps = list(runtime.get("recent_steps", []))
    recent_steps.append(step)
    runtime["recent_steps"] = recent_steps[-200:]

    translation_log = list(runtime.get("last_translation_log", []))
    if hit:
        translation_log.append(
            f"t={now}: {pid_str} VA={raw_va} VPN={vpn} -> HIT PFN={selected_pfn}"
        )
    else:
        evicted_txt = ""
        if evicted is not None:
            evicted_txt = f" evict={evicted['pid']}:{evicted['vpn']}"
        translation_log.append(
            f"t={now}: {pid_str} VA={raw_va} VPN={vpn} -> FAULT PFN={selected_pfn}{evicted_txt}"
        )
    runtime["last_translation_log"] = translation_log[-30:]

    return step, (not hit)


def runtime_summary(runtime: Dict[str, Any]) -> Dict[str, Any]:
    hits = _safe_int(runtime.get("hits", 0), 0)
    faults = _safe_int(runtime.get("faults", 0), 0)
    total = hits + faults
    hit_ratio = (hits / total) if total > 0 else 0.0

    frames_raw: List[Dict[str, Any]] = runtime.get("frames", [])
    frames_out: List[Dict[str, Any]] = []
    for idx, frame in enumerate(frames_raw):
        frames_out.append(
            {
                "pfn": _safe_int(frame.get("pfn", idx), idx),
                "pid": frame.get("pid"),
                "vpn": frame.get("vpn"),
                "loaded_at": _safe_int(frame.get("loaded_at", 0), 0),
                "last_used": _safe_int(frame.get("last_used", 0), 0),
                "freq": _safe_int(frame.get("freq", 0), 0),
                "ref_bit": _safe_int(frame.get("ref_bit", 0), 0),
            }
        )

    page_tables_out: Dict[str, List[Dict[str, Any]]] = {}
    tables = runtime.get("page_tables", {})
    for pid, mapping in dict(tables).items():
        rows: List[Dict[str, Any]] = []
        for vpn, entry in dict(mapping).items():
            rows.append(
                {
                    "vpn": _safe_int(vpn, 0),
                    "present": bool(entry.get("present", False)),
                    "pfn": entry.get("pfn"),
                    "last_used": _safe_int(entry.get("last_used", 0), 0),
                    "freq": _safe_int(entry.get("freq", 0), 0),
                    "dirty": bool(entry.get("dirty", False)),
                }
            )
        rows.sort(key=lambda row: row["vpn"])
        page_tables_out[str(pid)] = rows

    return {
        "enabled": normalize_memory_mode(runtime.get("enabled", runtime.get("mode", "CPU_ONLY")), "CPU_ONLY"),
        "mode": normalize_memory_mode(runtime.get("mode", runtime.get("enabled", "CPU_ONLY")), "CPU_ONLY"),
        "algo": normalize_memory_algo(runtime.get("algo", "LRU"), "LRU"),
        "page_size": max(1, _safe_int(runtime.get("page_size", 4096), 4096)),
        "num_frames": max(1, _safe_int(runtime.get("num_frames", len(frames_out) or 8), 8)),
        "fault_penalty": max(1, _safe_int(runtime.get("fault_penalty", 5), 5)),
        "hits": hits,
        "faults": faults,
        "hit_ratio": hit_ratio,
        "frames": frames_out,
        "page_tables": page_tables_out,
        "last_translation_log": list(runtime.get("last_translation_log", []))[-30:],
        "recent_steps": list(runtime.get("recent_steps", []))[-80:],
        "mem_gantt": list(runtime.get("mem_gantt", [])),
        # Legacy aliases for existing UI compatibility.
        "frames_count": max(1, _safe_int(runtime.get("num_frames", len(frames_out) or 8), 8)),
        "frame_state": [frame.get("vpn") if frame.get("pid") is not None else None for frame in frames_out],
    }
