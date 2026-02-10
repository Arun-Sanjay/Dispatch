from typing import List, Optional

from .theme import CPU_IDLE, TASK_COLORS


def pid_color(pid: str):
    """Deterministic, vibrant colors per PID (improves readability in Gantt + I/O panels)."""
    if pid == "IDLE":
        return CPU_IDLE

    # Stable hash -> palette index
    h = 2166136261  # FNV-1a seed
    for ch in pid:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF

    base = TASK_COLORS[h % len(TASK_COLORS)]

    # Tiny brightness variation so similar PIDs still look a bit different,
    # but keep it readable (no dark muddy colors).
    bump = ((h >> 8) % 26) - 13  # -13..+12
    r = max(0, min(255, base[0] + bump))
    g = max(0, min(255, base[1] + bump))
    b = max(0, min(255, base[2] + bump))
    return (r, g, b)


def compress_gantt(gantt: List[str]):
    segs = []
    if not gantt:
        return segs
    cur = gantt[0]
    start = 0
    for i in range(1, len(gantt)):
        if gantt[i] != cur:
            segs.append((cur, start, i))
            cur = gantt[i]
            start = i
    segs.append((cur, start, len(gantt)))
    return segs


def safe_int(value, default=0, min_val=None):
    try:
        num = int(value)
    except (TypeError, ValueError):
        return default
    if min_val is not None:
        num = max(min_val, num)
    return num
