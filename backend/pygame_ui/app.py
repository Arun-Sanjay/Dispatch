import math
from typing import List

import pygame

from engine import (
    Process,
    CPUScheduler,
    compute_metrics,
    build_default_processes,
    clone_processes,
    load_preset,
    load_processes_json,
    run_algorithm_once,
    compare_all_algorithms,
)

from .theme import *
from .draw_helpers import (
    build_background_surface,
    draw_header_strip,
    draw_panel,
    draw_process_chip,
    draw_tooltip,
)
from .panels import (
    draw_gantt,
    draw_io_timeline,
    draw_metrics_panel,
    draw_state_transitions_panel,
)
from .screens import draw_comparison_screen, draw_start_screen
from .overlays import MemoryManager, draw_add_modal, draw_paging_overlay


def run():
    pygame.init()

    # Robust fullscreen: draw to a fixed logical surface (W,H) and scale to the window.
    fullscreen = False
    base_size = (W, H)

    # `window` is the actual display surface; `screen` is the logical render surface.
    window = None
    screen = pygame.Surface(base_size)

    # Scaling / letterbox
    scale = 1.0
    scaled_size = base_size
    offset = (0, 0)

    def _recompute_scale():
        nonlocal scale, scaled_size, offset
        ww, wh = window.get_size()
        sx = ww / base_size[0]
        sy = wh / base_size[1]
        scale = min(sx, sy)
        sw = max(1, int(base_size[0] * scale))
        sh = max(1, int(base_size[1] * scale))
        scaled_size = (sw, sh)
        offset = ((ww - sw) // 2, (wh - sh) // 2)

    def to_logical(pos):
        """Map window mouse coordinates -> logical (W,H) coordinates."""
        mx, my = pos
        ox, oy = offset
        # remove letterbox offset
        mx -= ox
        my -= oy
        if scaled_size[0] <= 0 or scaled_size[1] <= 0:
            return (0, 0)
        lx = int(mx * base_size[0] / scaled_size[0])
        ly = int(my * base_size[1] / scaled_size[1])
        # clamp
        lx = max(0, min(base_size[0] - 1, lx))
        ly = max(0, min(base_size[1] - 1, ly))
        return (lx, ly)

    def set_display(full: bool):
        nonlocal window, fullscreen
        fullscreen = full
        if fullscreen:
            # (0,0) picks the desktop resolution.
            window = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
        else:
            window = pygame.display.set_mode(base_size)
        pygame.display.set_caption("CPU Scheduling Visualizer - Phase 3")
        _recompute_scale()

    def present():
        """Scale logical surface to window and present."""
        window.fill(BG)
        if scaled_size == base_size and offset == (0, 0):
            window.blit(screen, (0, 0))
        else:
            frame = pygame.transform.smoothscale(screen, scaled_size)
            window.blit(frame, offset)
        pygame.display.flip()

    # Start windowed
    set_display(False)
    # Now that a video mode exists, convert the logical surface for faster blits.
    screen = screen.convert()

    clock = pygame.time.Clock()

    title_font = pygame.font.SysFont("Arial", 32, bold=True)
    font = pygame.font.SysFont("Arial", 24, bold=True)
    small = pygame.font.SysFont("Arial", 18)
    tiny = pygame.font.SysFont("Arial", 15)

    background = build_background_surface()

    base_dataset = build_default_processes()  # last loaded preset/JSON; does not include live additions

    # App mode: "menu" (start screen), "sim" (running simulator), "compare"
    app_mode = "menu"

    start_state = {
        "algorithms": ["FCFS", "SJF", "PRIORITY", "RR", "MLQ"],
        "algo_idx": 0,            # default FCFS
        "tick_ms": TICK_MS_DEFAULT,
        "quantum": 2,
        "start_button": None,
        "background": background,
    }

    # Scheduler will be created when we press START
    scheduler = None
    status_msg = "Ready"
    live_counter = 1

    paused = False
    tick_ms = TICK_MS_DEFAULT
    last_tick = pygame.time.get_ticks()

    adding_process = False
    add_fields = []
    active_field = 0
    add_status = ""
    live_added: List[Process] = []  # additions for current run only

    # Comparison screen state
    compare_results = None
    compare_metric = "avg_tat"
    compare_shown_once = False
    compare_algo_idx = 0

    # Paging demo state
    paging_state = {
        "fields": [
            {"label": "PID", "value": ""},
            {"label": "Virtual Address", "value": "1024"},
            {"label": "Page Size", "value": "256"},
            {"label": "Pages per process", "value": "8"},
            {"label": "Frames", "value": "8"},
        ],
        "active_idx": 0,
        "log": ["Press ENTER to translate"],
        "mm": MemoryManager(page_size=256, num_frames=8, pages_per_process=8),
        "background": background,
    }
    paging_open = False

    def reset_scheduler():
        nonlocal scheduler, status_msg, live_added, compare_results, compare_metric, compare_shown_once
        if scheduler is None:
            return
        prev_preempt = scheduler.preemptive_priority
        scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
        scheduler.preemptive_priority = prev_preempt
        scheduler.preemptive_priority = True
        live_added = []
        compare_results = None
        compare_metric = "avg_tat"
        compare_shown_once = False
        status_msg = "Reset to base dataset (cleared live additions)"

    def add_live_process(pid, arrival_val, burst_val, pr_val, queue_val):
        nonlocal live_counter, status_msg, live_added
        base_proc = Process(
            pid,
            arrival_time=arrival_val,
            burst_time=burst_val,
            priority=pr_val,
            queue=queue_val,
        )

        live_proc = Process(
            pid,
            arrival_time=arrival_val,
            burst_time=burst_val,
            priority=pr_val,
            queue=queue_val,
        )

        # NOTE: scheduler._all is usually the same list object as scheduler.processes
        # (see CPUScheduler.reset(): self._all = self.processes). Appending to both
        # would duplicate the process and make it show up twice in Metrics.
        scheduler.processes.append(live_proc)
        if scheduler._all is not scheduler.processes:
            scheduler._all.append(live_proc)

        if arrival_val <= scheduler.time:
            live_proc.arrived = True
            if scheduler.algorithm == "MLQ":
                if queue_val == "SYS":
                    scheduler.sys_queue.append(live_proc)
                else:
                    scheduler.user_queue.append(live_proc)
            else:
                scheduler.ready_queue.append(live_proc)
            scheduler._set_state(live_proc, "READY")

        live_added.append(base_proc)
        live_counter += 1
        status_msg = f"Added {pid} (AT={arrival_val}, BT={burst_val}, PR={pr_val}, Q={queue_val})"

    running = True
    while running:
        clock.tick(FPS)
        now = pygame.time.get_ticks()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.VIDEORESIZE and (not fullscreen):
                # If windowed resize ever occurs, recompute scaling.
                _recompute_scale()

            # Start screen controls
            if app_mode == "menu":
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_f:
                        set_display(not fullscreen)
                    elif event.key == pygame.K_ESCAPE:
                        # If in fullscreen, ESC exits fullscreen first; otherwise quit.
                        if fullscreen:
                            set_display(False)
                        else:
                            running = False
                    elif event.key == pygame.K_UP:
                        start_state["algo_idx"] = (start_state["algo_idx"] - 1) % len(start_state["algorithms"])
                    elif event.key == pygame.K_DOWN:
                        start_state["algo_idx"] = (start_state["algo_idx"] + 1) % len(start_state["algorithms"])
                    elif event.key == pygame.K_LEFT:
                        start_state["tick_ms"] = max(100, start_state["tick_ms"] - 100)
                    elif event.key == pygame.K_RIGHT:
                        start_state["tick_ms"] = min(1500, start_state["tick_ms"] + 100)
                    elif event.key == pygame.K_a:
                        # adjust quantum only if RR is selected
                        if start_state["algorithms"][start_state["algo_idx"]] == "RR":
                            start_state["quantum"] = max(1, start_state["quantum"] - 1)
                    elif event.key == pygame.K_d:
                        if start_state["algorithms"][start_state["algo_idx"]] == "RR":
                            start_state["quantum"] = min(10, start_state["quantum"] + 1)
                    elif event.key == pygame.K_RETURN or event.key == pygame.K_KP_ENTER:
                        # Create scheduler and enter sim mode
                        algo = start_state["algorithms"][start_state["algo_idx"]]
                        scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=algo, quantum=start_state["quantum"])
                        scheduler.preemptive_priority = True
                        tick_ms = start_state["tick_ms"]
                        paused = False
                        last_tick = pygame.time.get_ticks()
                        status_msg = "Started"
                        app_mode = "sim"

                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    lx, ly = to_logical(event.pos)
                    if start_state.get("start_button") and start_state["start_button"].collidepoint((lx, ly)):
                        algo = start_state["algorithms"][start_state["algo_idx"]]
                        scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=algo, quantum=start_state["quantum"])
                        scheduler.preemptive_priority = True
                        tick_ms = start_state["tick_ms"]
                        paused = False
                        last_tick = pygame.time.get_ticks()
                        status_msg = "Started"
                        app_mode = "sim"
                continue

            # Comparison screen controls
            if app_mode == "compare":
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_f:
                        set_display(not fullscreen)
                    elif event.key == pygame.K_ESCAPE:
                        app_mode = "sim"
                        status_msg = "Back to simulation"
                    elif event.key == pygame.K_1:
                        compare_metric = "avg_wt"
                    elif event.key == pygame.K_2:
                        compare_metric = "avg_tat"
                    elif event.key == pygame.K_3:
                        compare_metric = "avg_rt"
                    elif event.key == pygame.K_4:
                        compare_metric = "cpu_util"
                    elif event.key == pygame.K_LEFT:
                        if compare_results:
                            compare_algo_idx = (compare_algo_idx - 1) % len(compare_results)
                    elif event.key == pygame.K_RIGHT:
                        if compare_results:
                            compare_algo_idx = (compare_algo_idx + 1) % len(compare_results)
                continue

            # Paging overlay controls (capture keyboard input only)
            if app_mode == "sim" and paging_open and event.type == pygame.KEYDOWN:
                if event.key == pygame.K_m:
                    paging_open = False
                    status_msg = "Paging overlay closed"
                elif event.key in (pygame.K_TAB,):
                    if pygame.key.get_mods() & pygame.KMOD_SHIFT:
                        paging_state["active_idx"] = (paging_state["active_idx"] - 1) % len(paging_state["fields"])
                    else:
                        paging_state["active_idx"] = (paging_state["active_idx"] + 1) % len(paging_state["fields"])
                elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    fields = paging_state["fields"]
                    pid = fields[0]["value"].strip()
                    if (not pid) and scheduler and scheduler.running:
                        pid = scheduler.running.pid
                        fields[0]["value"] = pid
                    if not pid:
                        paging_state["log"] = [
                            "No PID available: enter PID or run a process",
                        ]
                        continue
                    try:
                        vaddr = int(fields[1]["value"])
                        page_size = max(1, int(fields[2]["value"]))
                        pages_per = max(1, int(fields[3]["value"]))
                        frames = max(1, int(fields[4]["value"]))
                    except ValueError:
                        paging_state["log"] = [
                            "Invalid input: use integers for address/page size/pages/frames",
                        ]
                        continue

                    if vaddr < 0:
                        vaddr = 0
                    fields[0]["value"] = pid
                    fields[1]["value"] = str(vaddr)
                    fields[2]["value"] = str(page_size)
                    fields[3]["value"] = str(pages_per)
                    fields[4]["value"] = str(frames)

                    mm = paging_state["mm"]
                    log_prefix = []
                    if (
                        page_size != mm.page_size
                        or frames != mm.num_frames
                        or pages_per != mm.pages_per_process
                    ):
                        mm.reset(page_size, frames, pages_per)
                        log_prefix = ["Config updated → memory cleared"]

                    steps = mm.translate(pid, vaddr)
                    paging_state["log"] = log_prefix + steps
                elif event.key == pygame.K_BACKSPACE:
                    fields = paging_state["fields"]
                    idx = paging_state["active_idx"]
                    val = fields[idx]["value"]
                    fields[idx]["value"] = val[:-1]
                else:
                    ch = event.unicode
                    if ch.isprintable():
                        fields = paging_state["fields"]
                        idx = paging_state["active_idx"]
                        fields[idx]["value"] += ch
                continue

            if event.type == pygame.KEYDOWN and adding_process and app_mode == "sim":
                if event.key == pygame.K_ESCAPE:
                    adding_process = False
                    status_msg = "Add canceled"
                elif event.key in (pygame.K_TAB,):
                    if pygame.key.get_mods() & pygame.KMOD_SHIFT:
                        active_field = (active_field - 1) % len(add_fields)
                    else:
                        active_field = (active_field + 1) % len(add_fields)
                elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    try:
                        pid_val = add_fields[0]["value"].strip() or f"X{live_counter}"
                        arrival_val = int(add_fields[1]["value"])
                        burst_val = max(1, int(add_fields[2]["value"]))
                        pr_val = int(add_fields[3]["value"])
                        queue_val = add_fields[4]["value"].strip().upper() or "USER"
                        if queue_val not in ("SYS", "USER"):
                            queue_val = "USER"

                        if arrival_val < scheduler.time:
                            arrival_val = scheduler.time

                        add_live_process(pid_val, arrival_val, burst_val, pr_val, queue_val)
                        adding_process = False
                    except ValueError:
                        add_status = "Invalid number in one of the fields"
                elif event.key == pygame.K_BACKSPACE:
                    val = add_fields[active_field]["value"]
                    add_fields[active_field]["value"] = val[:-1]
                else:
                    ch = event.unicode
                    if ch.isprintable():
                        add_fields[active_field]["value"] += ch

                continue


            if event.type == pygame.KEYDOWN and app_mode == "sim":
                if event.key == pygame.K_f:
                    set_display(not fullscreen)
                elif event.key == pygame.K_SPACE:
                    paused = not paused
                elif event.key == pygame.K_r:
                    reset_scheduler()
                elif event.key == pygame.K_m:
                    paging_open = not paging_open
                    status_msg = "Paging overlay open" if paging_open else "Paging overlay closed"
                elif event.key == pygame.K_UP:
                    tick_ms = min(1500, tick_ms + 100)
                elif event.key == pygame.K_DOWN:
                    tick_ms = max(100, tick_ms - 100)
                elif event.key == pygame.K_1:
                    scheduler.set_algorithm("FCFS")
                    compare_shown_once = False
                elif event.key == pygame.K_2:
                    scheduler.set_algorithm("SJF")
                    compare_shown_once = False
                elif event.key == pygame.K_3:
                    scheduler.set_algorithm("PRIORITY")
                    compare_shown_once = False
                elif event.key == pygame.K_4:
                    scheduler.set_algorithm("RR")
                    compare_shown_once = False
                elif event.key == pygame.K_5:
                    scheduler.set_algorithm("MLQ")
                    compare_shown_once = False
                elif event.key == pygame.K_LEFT:
                    if scheduler.algorithm == "MLQ":
                        if pygame.key.get_mods() & pygame.KMOD_SHIFT:
                            scheduler.quantum_user = max(1, scheduler.quantum_user - 1)
                            status_msg = f"MLQ USER quantum={scheduler.quantum_user}"
                        else:
                            scheduler.quantum_sys = max(1, scheduler.quantum_sys - 1)
                            status_msg = f"MLQ SYS quantum={scheduler.quantum_sys}"
                    else:
                        scheduler.quantum = max(1, scheduler.quantum - 1)
                        status_msg = f"RR quantum={scheduler.quantum}"
                elif event.key == pygame.K_RIGHT:
                    if scheduler.algorithm == "MLQ":
                        if pygame.key.get_mods() & pygame.KMOD_SHIFT:
                            scheduler.quantum_user = min(10, scheduler.quantum_user + 1)
                            status_msg = f"MLQ USER quantum={scheduler.quantum_user}"
                        else:
                            scheduler.quantum_sys = min(10, scheduler.quantum_sys + 1)
                            status_msg = f"MLQ SYS quantum={scheduler.quantum_sys}"
                    else:
                        scheduler.quantum = min(10, scheduler.quantum + 1)
                        status_msg = f"RR quantum={scheduler.quantum}"
                elif event.key == pygame.K_p:
                    status_msg = "Priority is always preemptive"
                elif event.key == pygame.K_F1:
                    prev_preempt = scheduler.preemptive_priority
                    base_dataset = load_preset(1)
                    scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                    scheduler.preemptive_priority = prev_preempt
                    scheduler.preemptive_priority = True
                    live_added = []
                    status_msg = "Loaded preset F1 (live additions cleared)"
                    live_counter = 1
                    compare_shown_once = False
                elif event.key == pygame.K_F2:
                    prev_preempt = scheduler.preemptive_priority
                    base_dataset = load_preset(2)
                    scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                    scheduler.preemptive_priority = prev_preempt
                    scheduler.preemptive_priority = True
                    live_added = []
                    status_msg = "Loaded preset F2 (idle gaps, live additions cleared)"
                    live_counter = 1
                    compare_shown_once = False
                elif event.key == pygame.K_F3:
                    prev_preempt = scheduler.preemptive_priority
                    base_dataset = load_preset(3)
                    scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                    scheduler.preemptive_priority = prev_preempt
                    scheduler.preemptive_priority = True
                    live_added = []
                    status_msg = "Loaded preset F3 (priority, live additions cleared)"
                    live_counter = 1
                    compare_shown_once = False
                elif event.key == pygame.K_F4:
                    prev_preempt = scheduler.preemptive_priority
                    base_dataset = load_preset(4)
                    scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                    scheduler.preemptive_priority = prev_preempt
                    scheduler.preemptive_priority = True
                    live_added = []
                    status_msg = "Loaded preset F4 (RR, live additions cleared)"
                    live_counter = 1
                    compare_shown_once = False
                elif event.key == pygame.K_F5:
                    prev_preempt = scheduler.preemptive_priority
                    base_dataset = load_preset(5)
                    scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                    scheduler.preemptive_priority = prev_preempt
                    scheduler.preemptive_priority = True
                    live_added = []
                    status_msg = "Loaded preset F5 (MLQ, live additions cleared)"
                    live_counter = 1
                    compare_shown_once = False
                elif event.key == pygame.K_l:
                    try:
                        prev_preempt = scheduler.preemptive_priority
                        base_dataset = load_processes_json("processes.json")
                        scheduler = CPUScheduler(clone_processes(base_dataset), algorithm=scheduler.algorithm, quantum=scheduler.quantum)
                        scheduler.preemptive_priority = prev_preempt
                        scheduler.preemptive_priority = True
                        live_added = []
                        status_msg = "Loaded processes.json (live additions cleared)"
                        live_counter = 1
                        compare_shown_once = False
                    except Exception:
                        status_msg = "Load failed"
                elif event.key == pygame.K_c:
                    paused = True
                    dataset_for_compare = clone_processes(base_dataset + live_added)
                    compare_results = compare_all_algorithms(
                        dataset_for_compare,
                        rr_quantum=scheduler.quantum,
                        preemptive_priority=scheduler.preemptive_priority,
                        mlq_sys_quantum=scheduler.quantum_sys,
                        mlq_user_quantum=scheduler.quantum_user,
                    )
                    compare_metric = "avg_tat"
                    compare_algo_idx = 0
                    app_mode = "compare"
                    status_msg = "Showing comparison (ESC to return)"
                elif event.key == pygame.K_a:
                    adding_process = True
                    add_status = ""
                    add_fields = [
                        {"label": "PID", "value": f"X{live_counter}"},
                        {"label": "Arrival Time", "value": str(scheduler.time)},
                        {"label": "Burst Time", "value": "3"},
                        {"label": "Priority", "value": "0"},
                        {"label": "Queue (USER/SYS)", "value": "USER" if not (pygame.key.get_mods() & pygame.KMOD_SHIFT) else "SYS"},
                    ]
                    active_field = 0
                    status_msg = "Adding new process…"

        if app_mode == "sim" and scheduler is not None:
            if (not paused) and (not scheduler.done()) and (now - last_tick >= tick_ms):
                scheduler.tick()
                last_tick = now

            # Auto-open comparison once at completion
            if scheduler.done() and (not compare_shown_once):
                paused = True
                dataset_for_compare = clone_processes(base_dataset + live_added)
                compare_results = compare_all_algorithms(
                    dataset_for_compare,
                    rr_quantum=scheduler.quantum,
                    preemptive_priority=scheduler.preemptive_priority,
                    mlq_sys_quantum=scheduler.quantum_sys,
                    mlq_user_quantum=scheduler.quantum_user,
                )
                compare_metric = "avg_tat"
                compare_algo_idx = 0
                app_mode = "compare"
                compare_shown_once = True
                status_msg = "Completed — showing comparison (ESC to return)"

        if app_mode == "menu":
            draw_start_screen(screen, title_font, font, small, tiny, start_state)
            present()
            continue

        if app_mode == "compare":
            if start_state.get("background") is not None:
                screen.blit(start_state["background"], (0, 0))
                draw_header_strip(screen, 150)
            else:
                screen.fill(BG)
                draw_header_strip(screen, 150)

            draw_comparison_screen(
                screen,
                title_font,
                font,
                small,
                tiny,
                compare_results or [],
                compare_metric,
                compare_algo_idx,
            )
            present()
            continue

        hover_items = []
        proc_map = {p.pid: p for p in scheduler.processes}
        screen.fill(BG)

        algo_label = scheduler.algorithm
        if scheduler.algorithm == "PRIORITY":
            algo_label = "PRIORITY (Preemptive)"
        elif scheduler.algorithm == "SJF":
            algo_label = "SJF (Preemptive SRTF)"

        header = [
            f"CPU Scheduling Visualizer ({algo_label}) - Phase 3",
            f"Algo: {algo_label} | Time: {scheduler.time} | Completed: {len(scheduler.completed)}/{len(scheduler.processes)} | Tick: {tick_ms}ms",
            "Controls: SPACE Pause/Resume | R Reset (clears live adds) | UP Slow | DOWN Fast | C Compare | M Paging Overlay | F Fullscreen",
            "Add: A (popup, Shift+A preselect SYS) | Quantum: ←/→ (RR) | MLQ: SYS ←/→, USER Shift+←/→ | Priority & SJF are preemptive",
            "Algorithms: 1 FCFS | 2 SJF | 3 PRIORITY | 4 RR | 5 MLQ",
            f"Datasets: F1-F5 presets | L load processes.json | Status: {status_msg}",
        ]
        y = 16
        title_surf = title_font.render(header[0], True, TEXT)
        screen.blit(title_surf, (18, y))
        y += title_surf.get_height() + 6
        for ln in header[1:]:
            surf = small.render(ln, True, TEXT)
            screen.blit(surf, (18, y))
            y += surf.get_height() + 6

        # Layout: place panels below the header dynamically (prevents overlap)
        content_top = y + 14  # gap below header

        cpu_h = 140
        top_h_gap = 10
        info_h = 170

        # Dynamic vertical allocation (prevents overflow): Gantt + I/O + Metrics share remaining space.
        # Gantt and I/O get reasonable defaults; Metrics gets the rest.
        gantt_h = 190
        io_h = 160  # slightly taller so the tick labels fit cleanly
        metrics_h = 260  # will be recalculated after we know gantt_panel_y

        cpu_panel = pygame.Rect(40, content_top, 360, cpu_h)
        rq_panel  = pygame.Rect(430, content_top, 630, cpu_h)

        draw_panel(screen, cpu_panel, "CPU", font, small)
        if scheduler.running:
            chip = pygame.Rect(cpu_panel.x + 20, cpu_panel.y + 70, 220, 56)
            if scheduler.algorithm == "PRIORITY":
                label = f"{scheduler.running.pid} pr:{scheduler.running.priority} rem:{scheduler.running.remaining_time}"
            elif scheduler.algorithm == "MLQ":
                label = f"{scheduler.running.pid} {scheduler.running.queue} rem:{scheduler.running.remaining_time}"
            else:
                label = f"{scheduler.running.pid} rem:{scheduler.running.remaining_time}"
            pulse = int(60 + 90 * (0.5 + 0.5 * math.sin(now / 220.0)))
            draw_process_chip(screen, chip, label, CPU_RUN, small, glow_alpha=pulse)
            p = scheduler.running
            hover_items.append((
                chip,
                [
                    f"PID: {p.pid}",
                    f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                    f"Queue: {p.queue}   Rem: {p.remaining_time}",
                ],
            ))
        else:
            chip = pygame.Rect(cpu_panel.x + 20, cpu_panel.y + 70, 220, 56)
            draw_process_chip(screen, chip, "IDLE", CPU_IDLE, small)
            hover_items.append((chip, ["CPU: IDLE"]))

        if scheduler.algorithm == "MLQ":
            draw_panel(screen, rq_panel, "MLQ Queues (SYS then USER)", font, small)

            # Fit both SYS + USER rows inside rq_panel height (no overlap into the next panel)
            label_x = rq_panel.x + 20
            chip_x0 = rq_panel.x + 90
            chip_w, chip_h = 170, 40
            chip_dx = 180
            max_show = 3

            # SYS row
            sys_label_y = rq_panel.y + 34
            sys_chip_y = rq_panel.y + 50
            screen.blit(small.render("SYS:", True, MUTED), (label_x, sys_label_y))

            for i, p in enumerate(scheduler.sys_queue[:max_show]):
                chip = pygame.Rect(chip_x0 + i * chip_dx, sys_chip_y, chip_w, chip_h)
                label = f"{p.pid} rem:{p.remaining_time}"
                draw_process_chip(screen, chip, label, READY_BOX, small)
                hover_items.append((
                    chip,
                    [
                        f"PID: {p.pid}",
                        f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                        f"Queue: {p.queue}   Rem: {p.remaining_time}",
                    ],
                ))

            if len(scheduler.sys_queue) > max_show:
                more = small.render(f"(+{len(scheduler.sys_queue) - max_show} more)", True, MUTED)
                screen.blit(more, (chip_x0 + max_show * chip_dx, sys_chip_y + 10))

            # USER row
            user_label_y = rq_panel.y + 78
            user_chip_y = rq_panel.y + 94
            screen.blit(small.render("USER:", True, MUTED), (label_x, user_label_y))

            for i, p in enumerate(scheduler.user_queue[:max_show]):
                chip = pygame.Rect(chip_x0 + i * chip_dx, user_chip_y, chip_w, chip_h)
                label = f"{p.pid} rem:{p.remaining_time}"
                draw_process_chip(screen, chip, label, READY_BOX, small)
                hover_items.append((
                    chip,
                    [
                        f"PID: {p.pid}",
                        f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                        f"Queue: {p.queue}   Rem: {p.remaining_time}",
                    ],
                ))

            if len(scheduler.user_queue) > max_show:
                more = small.render(f"(+{len(scheduler.user_queue) - max_show} more)", True, MUTED)
                screen.blit(more, (chip_x0 + max_show * chip_dx, user_chip_y + 10))
        else:
            draw_panel(screen, rq_panel, "Ready Queue (front → back)", font, small)
            rx, ry = rq_panel.x + 20, rq_panel.y + 70
            for i, p in enumerate(scheduler.ready_queue[:6]):
                chip = pygame.Rect(rx + (i % 3) * 200, ry + (i // 3) * 70, 180, 56)
                if scheduler.algorithm == "PRIORITY":
                    label = f"{p.pid} pr:{p.priority} rem:{p.remaining_time}"
                else:
                    label = f"{p.pid} rem:{p.remaining_time}"
                draw_process_chip(screen, chip, label, READY_BOX, small)
                hover_items.append((
                    chip,
                    [
                        f"PID: {p.pid}",
                        f"AT: {p.arrival_time}   BT: {p.burst_time}   PR: {p.priority}",
                        f"Queue: {p.queue}   Rem: {p.remaining_time}",
                    ],
                ))

        info_panel_y = cpu_panel.y + cpu_panel.h + top_h_gap
        info_h = 160
        info_panel = pygame.Rect(40, info_panel_y, 1020, info_h)
        draw_state_transitions_panel(screen, info_panel, scheduler, font, small, tiny)

        gantt_panel_y = info_panel.y + info_panel.h + top_h_gap

        gantt_panel = pygame.Rect(40, gantt_panel_y, 1020, gantt_h)
        draw_gantt(screen, gantt_panel, scheduler.gantt_chart, font, small, hover_items=hover_items, proc_map=proc_map)

        io_panel_y = gantt_panel.y + gantt_panel.h + top_h_gap
        io_panel = pygame.Rect(40, io_panel_y, 1020, io_h)
        draw_io_timeline(
            screen,
            io_panel,
            scheduler.io_gantt_chart,
            font,
            small,
            hover_items=hover_items,
            proc_map=proc_map,
            ref_len=len(scheduler.gantt_chart),
        )


        if paused:
            screen.blit(title_font.render("PAUSED", True, TEXT), (900, 14))

        if adding_process:
            draw_add_modal(screen, font, small, add_fields, active_field, add_status or "Fill details and press Enter")

        if paging_open:
            draw_paging_overlay(screen, title_font, font, small, tiny, paging_state, scheduler)

        # Tooltip drawing (after all panels)
        if not adding_process and (not paging_open):
            mx, my = to_logical(pygame.mouse.get_pos())
            tip_lines = None
            for r, lines in reversed(hover_items):
                if r.collidepoint((mx, my)):
                    tip_lines = lines
                    break
            if tip_lines:
                draw_tooltip(screen, (mx, my), tip_lines, tiny)

        present()

    pygame.quit()
