from typing import List, Optional

import pygame

from engine import CPUScheduler, compute_metrics

from .draw_helpers import draw_inner_highlight, draw_shadow_rect
from .theme import (
    BORDER,
    GANTT_BG,
    GRID,
    MUTED,
    OUTLINE,
    PANEL,
    STATE_COLORS,
    TEXT,
    CPU_IDLE,
)
from .utils import compress_gantt, pid_color


def draw_gantt(screen, rect, gantt: List[str], font, small, hover_items=None, proc_map=None):
    draw_shadow_rect(screen, rect)
    pygame.draw.rect(screen, PANEL, rect, border_radius=14)
    draw_inner_highlight(screen, rect)
    pygame.draw.rect(screen, BORDER, rect, 2, border_radius=14)
    title = font.render("Gantt Chart", True, TEXT)
    screen.blit(title, (rect.x + 12, rect.y + 10))

    inner = pygame.Rect(rect.x + 12, rect.y + 52, rect.w - 24, rect.h - 72)
    pygame.draw.rect(screen, GANTT_BG, inner, border_radius=10)

    if not gantt:
        msg = small.render("(no ticks yet)", True, MUTED)
        screen.blit(msg, (inner.x + 10, inner.y + 10))
        return

    segs = compress_gantt(gantt)
    total_t = len(gantt)

    px_per_t = max(10, min(40, inner.w // max(1, total_t)))

    x0 = inner.x + 10
    y0 = inner.y + 18
    h = 54

    for pid, s, e in segs:
        bx = x0 + s * px_per_t
        bw = max(1, (e - s) * px_per_t)
        block = pygame.Rect(bx, y0, bw, h)
        pygame.draw.rect(screen, pid_color(pid), block, border_radius=8)
        pygame.draw.rect(screen, OUTLINE, block, 2, border_radius=8)

        if bw >= 40:
            label = small.render(pid, True, (10, 10, 10))
            screen.blit(label, (bx + 6, y0 + 16))

        if hover_items is not None:
            if pid == "IDLE":
                hover_items.append((block, ["IDLE", f"Segment: {s} → {e}"]))
            else:
                p = proc_map.get(pid) if proc_map else None
                if p is not None:
                    hover_items.append((
                        block,
                        [
                            f"PID: {p.pid}",
                            f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                            f"Queue: {p.queue}   Rem: {p.remaining_time}",
                            f"Segment: {s} → {e}",
                        ],
                    ))
                else:
                    hover_items.append((block, [f"PID: {pid}", f"Segment: {s} → {e}"]))

    max_markers = 16
    step = max(1, total_t // max_markers)
    for t in range(0, total_t + 1, step):
        mx = x0 + t * px_per_t
        pygame.draw.line(screen, GRID, (mx, y0 + h + 8), (mx, y0 + h + 22), 2)
        tt = small.render(str(t), True, MUTED)
        screen.blit(tt, (mx - 6, y0 + h + 26))


# ------------------------------
# I/O Timeline panel
# ------------------------------
def draw_io_timeline(screen, rect, io_gantt: List[str], font, small, hover_items=None, proc_map=None, ref_len: Optional[int] = None):
    """I/O device timeline (single device). `ref_len` keeps the time scale identical to CPU Gantt."""
    draw_shadow_rect(screen, rect)
    pygame.draw.rect(screen, PANEL, rect, border_radius=14)
    draw_inner_highlight(screen, rect)
    pygame.draw.rect(screen, BORDER, rect, 2, border_radius=14)

    title = font.render("I/O Timeline", True, TEXT)
    screen.blit(title, (rect.x + 12, rect.y + 10))

    inner = pygame.Rect(rect.x + 12, rect.y + 52, rect.w - 24, rect.h - 72)
    pygame.draw.rect(screen, GANTT_BG, inner, border_radius=10)

    if not io_gantt:
        msg = small.render("(no ticks yet)", True, MUTED)
        screen.blit(msg, (inner.x + 10, inner.y + 10))
        return

    # Use CPU gantt length for scaling so labels/blocks line up visually.
    total_t = int(ref_len) if (ref_len is not None and ref_len > 0) else len(io_gantt)
    total_t = max(1, total_t)

    segs = compress_gantt(io_gantt)

    px_per_t = max(10, min(40, inner.w // total_t))

    x0 = inner.x + 10
    h = min(54, max(34, inner.h - 46))
    y0 = inner.y + 12

    for pid, s, e in segs:
        bx = x0 + s * px_per_t
        bw = max(1, (e - s) * px_per_t)
        block = pygame.Rect(bx, y0, bw, h)

        color = CPU_IDLE if pid == "IDLE" else pid_color(pid)
        pygame.draw.rect(screen, color, block, border_radius=8)
        pygame.draw.rect(screen, OUTLINE, block, 2, border_radius=8)

        if bw >= 40:
            label = small.render(pid, True, (10, 10, 10))
            screen.blit(label, (bx + 6, y0 + (h // 2 - label.get_height() // 2)))

        if hover_items is not None:
            if pid == "IDLE":
                hover_items.append((block, ["I/O: IDLE", f"Segment: {s} → {e}"]))
            else:
                p = proc_map.get(pid) if proc_map else None
                if p is not None:
                    hover_items.append((
                        block,
                        [
                            f"PID: {p.pid}",
                            f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                            f"Queue: {p.queue}   IO Rem: {p.io_remaining}",
                            f"Segment: {s} → {e}",
                        ],
                    ))
                else:
                    hover_items.append((block, [f"PID: {pid}", f"Segment: {s} → {e}"]))

    # Markers (aligned to the same scale)
    max_markers = 16
    step = max(1, total_t // max_markers)
    marker_y1 = y0 + h + 6
    marker_y2 = y0 + h + 18
    label_y = y0 + h + 20

    for t in range(0, total_t + 1, step):
        mx = x0 + t * px_per_t
        pygame.draw.line(screen, GRID, (mx, marker_y1), (mx, marker_y2), 2)
        tt = small.render(str(t), True, MUTED)
        screen.blit(tt, (mx - 6, label_y))


# ------------------------------
# State Transitions panel (replaces Info & Legend panel)
# ------------------------------
def draw_state_transitions_panel(screen, rect, scheduler: CPUScheduler, font, small, tiny):
    """Layout-safe: rows fit panel, log lines clip with ellipsis."""
    draw_shadow_rect(screen, rect)
    pygame.draw.rect(screen, PANEL, rect, border_radius=14)
    draw_inner_highlight(screen, rect)
    pygame.draw.rect(screen, BORDER, rect, 2, border_radius=14)

    title = font.render("State Transitions", True, TEXT)
    screen.blit(title, (rect.x + 12, rect.y + 8))

    current = scheduler.running
    if current is None:
        cur_label = "Current: IDLE"
    else:
        cur_label = f"Current: {current.pid} RUNNING"
    cur_surf = tiny.render(cur_label, True, MUTED)
    screen.blit(cur_surf, (rect.right - 12 - cur_surf.get_width(), rect.y + 12))

    inner = pygame.Rect(rect.x + 12, rect.y + 32, rect.w - 24, rect.h - 40)

    # Split: left = states table, right = recent transitions
    gap = 12
    left_w = int(min(520, max(360, inner.w * 0.52)))
    left = pygame.Rect(inner.x, inner.y, left_w, inner.h)
    right = pygame.Rect(left.right + gap, inner.y, inner.right - (left.right + gap), inner.h)

    pygame.draw.rect(screen, GANTT_BG, left, border_radius=10)
    pygame.draw.rect(screen, OUTLINE, left, 2, border_radius=10)

    pygame.draw.rect(screen, GANTT_BG, right, border_radius=10)
    pygame.draw.rect(screen, OUTLINE, right, 2, border_radius=10)

    # --- Left: current state table ---
    table_top = left.y + 8
    row_h = 18
    rows = sorted(scheduler.processes, key=lambda p: (p.arrival_time, p.pid))

    rows_per_col = max(1, (left.bottom - table_top - 6) // row_h)
    cols = 2 if (left.w >= 360 and len(rows) > rows_per_col) else 1
    col_gap = 10
    table_left = left.x + 8
    table_w = left.w - 16
    col_w = (table_w - col_gap * (cols - 1)) // cols
    capacity = rows_per_col * cols

    overflow = 0
    if len(rows) > capacity:
        overflow = len(rows) - capacity
        rows = rows[-capacity:]
        if scheduler.running and scheduler.running not in rows:
            rows[-1] = scheduler.running

    for idx, p in enumerate(rows):
        col = idx // rows_per_col
        row = idx % rows_per_col
        if col >= cols:
            break
        x = table_left + col * (col_w + col_gap)
        y = table_top + row * row_h

        # PID
        screen.blit(tiny.render(p.pid, True, MUTED), (x, y))

        # State chip
        st = getattr(p, "state", "NEW")
        c = STATE_COLORS.get(st, MUTED)
        chip_x = x + 44
        chip_w = max(64, min(92, col_w - 52))
        chip = pygame.Rect(chip_x, y - 2, chip_w, 16)
        pygame.draw.rect(screen, c, chip, border_radius=8)
        pygame.draw.rect(screen, OUTLINE, chip, 2, border_radius=8)
        screen.blit(tiny.render(st, True, (10, 10, 10)), (chip.x + 6, chip.y + 1))

    if overflow > 0:
        more = tiny.render(f"+{overflow} more", True, MUTED)
        screen.blit(more, (left.right - 10 - more.get_width(), left.bottom - 18))

    # --- Right: last transition + per-process paths ---
    log = scheduler.event_log if getattr(scheduler, "event_log", None) else []

    def _clip_line(s: str, max_px: int) -> str:
        surf = tiny.render(s, True, (195, 202, 220))
        if surf.get_width() <= max_px:
            return s
        ell = "…"
        lo, hi = 0, len(s)
        while lo < hi:
            mid = (lo + hi) // 2
            test = s[:mid] + ell
            if tiny.render(test, True, (195, 202, 220)).get_width() <= max_px:
                lo = mid + 1
            else:
                hi = mid
        cut = max(0, lo - 1)
        return s[:cut] + ell

    line_h = 16
    max_px = right.w - 16
    last_line = log[-1] if log else "No transitions yet"
    last_txt = _clip_line(f"Last: {last_line}", max_px)
    screen.blit(tiny.render(last_txt, True, (195, 202, 220)), (right.x + 8, right.y + 6))
    screen.blit(tiny.render("Paths", True, TEXT), (right.x + 8, right.y + 6 + line_h))

    # Build compact state paths per process from the event log.
    paths = {p.pid: ["NEW"] for p in scheduler.processes}
    for entry in log:
        try:
            body = entry.split(": ", 1)[1]
            pid, rest = body.split(" ", 1)
            if " → " not in rest:
                continue
            old_state, new_state = rest.split(" → ", 1)
            old_state = old_state.strip()
            new_state = new_state.split(" ", 1)[0].strip()
        except ValueError:
            continue
        if pid not in paths:
            paths[pid] = ["NEW"]
        if paths[pid][-1] != old_state:
            paths[pid].append(old_state)
        if paths[pid][-1] != new_state:
            paths[pid].append(new_state)

    for p in scheduler.processes:
        cur = getattr(p, "state", "NEW")
        if p.pid not in paths:
            paths[p.pid] = ["NEW"]
        if paths[p.pid][-1] != cur:
            paths[p.pid].append(cur)

    path_top = right.y + 6 + (line_h * 2)
    path_h = right.bottom - path_top - 6
    path_rows = max(1, path_h // line_h)
    path_items = sorted(scheduler.processes, key=lambda x: (x.arrival_time, x.pid))

    path_cols = 2 if (right.w >= 420 and len(path_items) > path_rows) else 1
    path_gap = 12
    path_left = right.x + 8
    path_w = right.w - 16
    path_col_w = (path_w - path_gap * (path_cols - 1)) // path_cols
    path_cap = path_rows * path_cols

    path_overflow = 0
    if len(path_items) > path_cap:
        path_overflow = len(path_items) - path_cap
        path_items = path_items[-path_cap:]
        if scheduler.running and scheduler.running not in path_items:
            path_items[-1] = scheduler.running

    for idx, p in enumerate(path_items):
        col = idx // path_rows
        row = idx % path_rows
        if col >= path_cols:
            break
        x = path_left + col * (path_col_w + path_gap)
        y = path_top + row * line_h
        seq = "→".join(paths.get(p.pid, ["NEW"]))
        txt = _clip_line(f"{p.pid}: {seq}", path_col_w)
        screen.blit(tiny.render(txt, True, (195, 202, 220)), (x, y))

    if path_overflow > 0:
        more = tiny.render(f"+{path_overflow} more", True, MUTED)
        screen.blit(more, (right.right - 8 - more.get_width(), right.bottom - 18))


def draw_metrics_panel(screen, rect, scheduler: CPUScheduler, font, small, tiny, scroll_rows: int = 0):
    draw_shadow_rect(screen, rect)
    pygame.draw.rect(screen, PANEL, rect, border_radius=14)
    draw_inner_highlight(screen, rect)
    pygame.draw.rect(screen, BORDER, rect, 2, border_radius=14)
    title = font.render("Metrics", True, TEXT)
    screen.blit(title, (rect.x + 12, rect.y + 10))

    rows, avg_wt, avg_tat, avg_rt = compute_metrics(scheduler.processes)

    total = len(scheduler.gantt_chart)
    busy = sum(1 for x in scheduler.gantt_chart if x != "IDLE")
    util = (busy / total * 100.0) if total else 0.0

    summary = f"Avg WT: {avg_wt:.2f}   Avg TAT: {avg_tat:.2f}   Avg RT: {avg_rt:.2f}   CPU Util: {util:.1f}%"
    screen.blit(small.render(summary, True, MUTED), (rect.x + 12, rect.y + 46))

    # Table (use smaller font + tighter line height so many rows fit)
    cols = ["PID", "AT", "BT", "PR", "Q", "ST", "CT", "TAT", "WT", "RT"]
    x = rect.x + 12
    y = rect.y + 76

    col_w = [60, 42, 42, 42, 78, 42, 42, 54, 48, 48]
    for c, w in zip(cols, col_w):
        screen.blit(tiny.render(c, True, TEXT), (x, y))
        x += w

    y += 22

    if not rows:
        screen.blit(tiny.render("(no processes)", True, MUTED), (rect.x + 12, y))
        return 0

    row_h = 20
    max_rows = max(1, (rect.y + rect.h - y - 12) // row_h)

    # Clamp scroll to available rows
    max_scroll = max(0, len(rows) - max_rows)
    scroll_rows = max(0, min(max_scroll, int(scroll_rows)))

    # Render visible window
    visible = rows[scroll_rows: scroll_rows + max_rows]

    for r in visible:
        x = rect.x + 12
        for c, w in zip(cols, col_w):
            screen.blit(tiny.render(str(r[c]), True, MUTED), (x, y))
            x += w
        y += row_h

    # Subtle scroll indicator (only when needed)
    if max_scroll > 0:
        info = tiny.render(f"Rows {scroll_rows + 1}-{min(scroll_rows + max_rows, len(rows))} / {len(rows)}", True, MUTED)
        screen.blit(info, (rect.right - 12 - info.get_width(), rect.y + 46))

    return scroll_rows
