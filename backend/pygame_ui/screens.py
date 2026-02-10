import pygame

from .draw_helpers import draw_header_strip, draw_inner_highlight, draw_shadow_rect
from .theme import (
    BG,
    BORDER,
    GANTT_BG,
    H,
    MUTED,
    OUTLINE,
    PANEL,
    SHADOW_ALPHA,
    TEXT,
    W,
)
from .utils import pid_color


# ------------------------------
# Start screen
# ------------------------------
def draw_start_screen(screen, title_font, font, small, tiny, state):
    if state.get("background") is not None:
        screen.blit(state["background"], (0, 0))
        draw_header_strip(screen, 150)
    else:
        screen.fill(BG)
        draw_header_strip(screen, 150)

    title = title_font.render("CPU Scheduling Visualizer", True, TEXT)
    screen.blit(title, (W // 2 - title.get_width() // 2, 80))

    sub = small.render("Start setup (choose defaults, then press ENTER)", True, MUTED)
    screen.blit(sub, (W // 2 - sub.get_width() // 2, 120))

    panel = pygame.Rect(260, 190, 580, 420)
    draw_shadow_rect(screen, panel, radius=16)
    pygame.draw.rect(screen, PANEL, panel, border_radius=16)
    draw_inner_highlight(screen, panel, radius=16)
    pygame.draw.rect(screen, BORDER, panel, 2, border_radius=16)

    # Rows
    y = panel.y + 40
    row_gap = 62

    algo = state["algorithms"][state["algo_idx"]]
    algo_line = small.render(f"Algorithm:  {algo}", True, TEXT)
    screen.blit(algo_line, (panel.x + 30, y))
    hint = tiny.render("Use ↑/↓ to change", True, MUTED)
    screen.blit(hint, (panel.right - 30 - hint.get_width(), y + 2))
    y += row_gap

    tick_line = small.render(f"Default Tick Time:  {state['tick_ms']} ms", True, TEXT)
    screen.blit(tick_line, (panel.x + 30, y))
    hint = tiny.render("Use ←/→ to adjust", True, MUTED)
    screen.blit(hint, (panel.right - 30 - hint.get_width(), y + 2))
    y += row_gap

    if algo == "RR":
        q_line = small.render(f"Quantum (RR):  {state['quantum']}", True, TEXT)
        screen.blit(q_line, (panel.x + 30, y))
        hint = tiny.render("Use A/D to adjust", True, MUTED)
        screen.blit(hint, (panel.right - 30 - hint.get_width(), y + 2))
        y += row_gap
    else:
        q_line = small.render("Quantum (RR):  (not applicable)", True, MUTED)
        screen.blit(q_line, (panel.x + 30, y))
        y += row_gap

    # Footer layout (fixed positions so nothing overlaps)
    btn = pygame.Rect(panel.x + 190, panel.bottom - 72, 200, 50)

    note1 = "Note: After starting, you can still change tick speed (UP/DOWN)"
    note2 = "and quantum (←/→) while running."

    note_y = btn.y - 54
    keys_y = note_y - 70

    # Key hints
    screen.blit(small.render("ENTER: Start simulation", True, MUTED), (panel.x + 30, keys_y))
    screen.blit(small.render("ESC: Quit", True, MUTED), (panel.x + 30, keys_y + 30))

    # Note (two lines)
    screen.blit(tiny.render(note1, True, MUTED), (panel.x + 30, note_y))
    screen.blit(tiny.render(note2, True, MUTED), (panel.x + 30, note_y + 20))

    # Start button (clickable)
    draw_shadow_rect(screen, btn, radius=12, alpha=SHADOW_ALPHA - 15, offset=(0, 4))
    pygame.draw.rect(screen, (60, 130, 220), btn, border_radius=12)
    pygame.draw.rect(screen, OUTLINE, btn, 2, border_radius=12)
    btxt = font.render("START", True, (10, 10, 10))
    screen.blit(btxt, (btn.x + btn.w // 2 - btxt.get_width() // 2, btn.y + 14))

    state["start_button"] = btn


def draw_comparison_screen(screen, title_font, font, small, tiny, results, metric_key: str, selected_idx: int):
    """Compare algorithms with a simple bar chart + table, and show per-process metrics for selected algorithm."""
    screen.fill(BG)

    hdr = title_font.render("Algorithm Comparison", True, TEXT)
    screen.blit(hdr, (W // 2 - hdr.get_width() // 2, 26))

    help1 = small.render("1 WT   2 TAT   3 RT   4 CPU Util    |    ←/→ select algo    |    ESC: back", True, MUTED)
    screen.blit(help1, (W // 2 - help1.get_width() // 2, 66))

    panel = pygame.Rect(60, 100, W - 120, H - 160)
    draw_shadow_rect(screen, panel, radius=16)
    pygame.draw.rect(screen, PANEL, panel, border_radius=16)
    draw_inner_highlight(screen, panel, radius=16)
    pygame.draw.rect(screen, BORDER, panel, 2, border_radius=16)

    label_map = {
        "avg_wt": "Average Waiting Time (lower is better)",
        "avg_tat": "Average Turnaround Time (lower is better)",
        "avg_rt": "Average Response Time (lower is better)",
        "cpu_util": "CPU Utilization (higher is better)",
    }
    metric_title = font.render(label_map.get(metric_key, metric_key), True, TEXT)
    screen.blit(metric_title, (panel.x + 22, panel.y + 18))

    chart = pygame.Rect(panel.x + 22, panel.y + 66, panel.w - 44, 260)
    pygame.draw.rect(screen, GANTT_BG, chart, border_radius=12)
    pygame.draw.rect(screen, OUTLINE, chart, 2, border_radius=12)

    if not results:
        msg = small.render("(no results)", True, MUTED)
        screen.blit(msg, (chart.x + 14, chart.y + 14))
        return

    vals = [float(r.get(metric_key, 0.0)) for r in results]
    max_v = max(vals) if vals else 1.0
    max_v = max(max_v, 1e-9)

    n = len(results)
    bar_gap = 16
    bar_w = int((chart.w - bar_gap * (n + 1)) / n)
    bar_w = max(90, min(170, bar_w))
    total_w = n * bar_w + (n + 1) * bar_gap
    x0 = chart.x + (chart.w - total_w) // 2
    y_base = chart.bottom - 46
    max_h = 170

    for i, r in enumerate(results):
        a = r["algorithm"]
        v = float(r.get(metric_key, 0.0))
        h = int((v / max_v) * max_h) if max_v > 0 else 0

        bx = x0 + bar_gap + i * (bar_w + bar_gap)
        by = y_base - h
        bar = pygame.Rect(bx, by, bar_w, h)

        color = pid_color(a)
        pygame.draw.rect(screen, color, bar, border_radius=10)
        pygame.draw.rect(screen, OUTLINE, bar, 2, border_radius=10)

        val_s = tiny.render(f"{v:.2f}" if metric_key != "cpu_util" else f"{v:.1f}%", True, MUTED)
        screen.blit(val_s, (bx + bar_w // 2 - val_s.get_width() // 2, by - 18))

        lab = tiny.render(a, True, MUTED)
        screen.blit(lab, (bx + bar_w // 2 - lab.get_width() // 2, y_base + 12))

    table = pygame.Rect(panel.x + 22, chart.bottom + 18, panel.w - 44, panel.h - (chart.bottom - panel.y) - 40)

    # Split: top = algorithm summary, bottom = per-process metrics for selected algorithm
    split_gap = 12
    summary_h = min(170, max(140, table.h // 2 - 10))
    summary_rect = pygame.Rect(table.x, table.y, table.w, summary_h)
    proc_rect = pygame.Rect(table.x, table.y + summary_h + split_gap, table.w, table.h - summary_h - split_gap)

    # --- Summary table (algorithms) ---
    pygame.draw.rect(screen, GANTT_BG, summary_rect, border_radius=12)
    pygame.draw.rect(screen, OUTLINE, summary_rect, 2, border_radius=12)

    cols = ["Algo", "Avg WT", "Avg TAT", "Avg RT", "CPU Util", "Makespan", "Throughput"]
    col_w = [120, 120, 140, 120, 120, 120, 140]

    tx = summary_rect.x + 14
    ty = summary_rect.y + 12
    for c, w in zip(cols, col_w):
        screen.blit(tiny.render(c, True, TEXT), (tx, ty))
        tx += w

    ty += 24
    row_h = 20
    for i, r in enumerate(results):
        # Highlight selected algorithm
        if i == selected_idx:
            hi = pygame.Rect(summary_rect.x + 8, ty - 2, summary_rect.w - 16, row_h)
            pygame.draw.rect(screen, (255, 255, 255, 18), hi, border_radius=8)

        tx = summary_rect.x + 14
        row = [
            r["algorithm"],
            f"{r['avg_wt']:.2f}",
            f"{r['avg_tat']:.2f}",
            f"{r['avg_rt']:.2f}",
            f"{r['cpu_util']:.1f}%",
            str(r["makespan"]),
            f"{r['throughput']:.3f}",
        ]
        for v, w in zip(row, col_w):
            screen.blit(tiny.render(v, True, MUTED), (tx, ty))
            tx += w
        ty += row_h

    # --- Per-process metrics (selected algorithm) ---
    pygame.draw.rect(screen, GANTT_BG, proc_rect, border_radius=12)
    pygame.draw.rect(screen, OUTLINE, proc_rect, 2, border_radius=12)

    if results:
        selected_idx = max(0, min(selected_idx, len(results) - 1))
        sel = results[selected_idx]
        title2 = small.render(f"Per-Process Metrics: {sel['algorithm']}", True, TEXT)
        screen.blit(title2, (proc_rect.x + 14, proc_rect.y + 10))

        rows = sel.get("_rows", [])
        cols2 = ["PID", "AT", "BT", "PR", "Q", "ST", "CT", "TAT", "WT", "RT"]
        col_w2 = [60, 42, 42, 42, 78, 42, 42, 54, 48, 48]

        tx = proc_rect.x + 14
        ty = proc_rect.y + 40
        for c, w in zip(cols2, col_w2):
            screen.blit(tiny.render(c, True, TEXT), (tx, ty))
            tx += w

        ty += 22
        # Fit rows
        row_h2 = 20
        max_rows = max(1, (proc_rect.bottom - ty - 10) // row_h2)
        shown = rows[:max_rows]

        for r in shown:
            tx = proc_rect.x + 14
            for c, w in zip(cols2, col_w2):
                screen.blit(tiny.render(str(r.get(c, "-")), True, MUTED), (tx, ty))
                tx += w
            ty += row_h2

        if len(rows) > max_rows:
            more = tiny.render(f"(+{len(rows) - max_rows} more rows)", True, MUTED)
            screen.blit(more, (proc_rect.right - 14 - more.get_width(), proc_rect.y + 10))
    else:
        msg = small.render("(no results)", True, MUTED)
        screen.blit(msg, (proc_rect.x + 14, proc_rect.y + 10))
