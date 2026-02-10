import pygame

from .draw_helpers import draw_inner_highlight, draw_panel, draw_shadow_rect
from .theme import (
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
from .utils import safe_int


class MemoryManager:
    def __init__(self, page_size: int = 256, num_frames: int = 8, pages_per_process: int = 8):
        self.page_size = max(1, int(page_size))
        self.num_frames = max(1, int(num_frames))
        self.pages_per_process = max(1, int(pages_per_process))
        self.page_tables = {}  # pid -> list of entries
        self.frame_owner = [None] * self.num_frames  # frame -> (pid, vpn) or None
        self.fifo = []  # FIFO of frame indices
        self.current_pid = None

    def reset(self, page_size: int, num_frames: int, pages_per_process: int):
        self.page_size = max(1, int(page_size))
        self.num_frames = max(1, int(num_frames))
        self.pages_per_process = max(1, int(pages_per_process))
        self.page_tables = {}
        self.frame_owner = [None] * self.num_frames
        self.fifo = []
        self.current_pid = None

    def ensure_page_table(self, pid: str, min_pages: int = 0):
        size = max(self.pages_per_process, int(min_pages))
        table = self.page_tables.get(pid)
        if table is None:
            table = [{"present": False, "frame": None} for _ in range(size)]
            self.page_tables[pid] = table
        elif len(table) < size:
            table.extend({"present": False, "frame": None} for _ in range(size - len(table)))
        return table

    def _allocate_frame(self, pid: str, vpn: int):
        frame = None
        for idx, owner in enumerate(self.frame_owner):
            if owner is None:
                frame = idx
                break

        evicted = None
        if frame is None:
            if self.fifo:
                frame = self.fifo.pop(0)
            else:
                frame = 0
            evicted = self.frame_owner[frame]
            if evicted is not None:
                ev_pid, ev_vpn = evicted
                ev_table = self.page_tables.get(ev_pid)
                if ev_table and ev_vpn < len(ev_table):
                    ev_table[ev_vpn]["present"] = False
                    ev_table[ev_vpn]["frame"] = None

        self.frame_owner[frame] = (pid, vpn)
        table = self.ensure_page_table(pid, vpn + 1)
        table[vpn]["present"] = True
        table[vpn]["frame"] = frame
        self.fifo.append(frame)
        return frame, evicted

    def translate(self, pid: str, vaddr: int):
        steps = []
        fault = False

        if pid != self.current_pid:
            steps.append(f"Context switch → PTBR now points to {pid} page table")
            self.current_pid = pid

        steps.append(f"CPU issues VA={vaddr}")
        vpn = vaddr // self.page_size
        offset = vaddr % self.page_size
        steps.append(f"Split VA → VPN={vpn}, offset={offset}")

        table = self.ensure_page_table(pid, vpn + 1)
        entry = table[vpn]
        steps.append(f"Page table lookup → present={1 if entry['present'] else 0}")

        if not entry["present"]:
            fault = True
            steps.append("PAGE FAULT")
            steps.append("OS allocates/evicts frame (FIFO)")
            self._allocate_frame(pid, vpn)
            steps.append("Load page into frame")
            entry = table[vpn]

        frame = entry["frame"]
        pa = frame * self.page_size + offset
        steps.append(f"Physical address = frame*page_size + offset = {pa}")
        steps.append(f"Result: PA={pa} ({'fault' if fault else 'hit'})")
        return steps


def draw_paging_overlay(screen, title_font, font, small, tiny, state, scheduler):
    fields = state["fields"]
    if scheduler and scheduler.running and not fields[0]["value"].strip():
        fields[0]["value"] = scheduler.running.pid

    overlay = pygame.Surface((W, H), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    screen.blit(overlay, (0, 0))

    panel = pygame.Rect(60, 70, W - 120, H - 140)
    draw_shadow_rect(screen, panel, radius=16)
    pygame.draw.rect(screen, PANEL, panel, border_radius=16)
    draw_inner_highlight(screen, panel, radius=16)
    pygame.draw.rect(screen, BORDER, panel, 2, border_radius=16)

    title = font.render("Paging Demo - Address Translation", True, TEXT)
    screen.blit(title, (panel.x + 18, panel.y + 14))
    controls = small.render(
        "M close | TAB/SHIFT+TAB cycle | ENTER translate | BACKSPACE delete | type input",
        True,
        MUTED,
    )
    screen.blit(controls, (panel.x + 18, panel.y + 42))

    inner = pygame.Rect(panel.x + 16, panel.y + 70, panel.w - 32, panel.h - 86)
    panel_gap = 16
    left_w = int(min(560, max(480, inner.w * 0.52)))
    left_panel = pygame.Rect(inner.x, inner.y, left_w, inner.h)
    right_panel = pygame.Rect(left_panel.right + panel_gap, inner.y, inner.right - (left_panel.right + panel_gap), inner.h)

    draw_panel(screen, left_panel, "Inputs & Translation", font, small)
    draw_panel(screen, right_panel, "Memory View", font, small)

    active_idx = state["active_idx"]
    mm = state["mm"]

    # Inputs
    field_start_y = left_panel.y + 54
    row_h = 52
    label_x = left_panel.x + 16
    field_x = left_panel.x + 190
    field_w = left_panel.w - 210
    field_h = 36

    for idx, f in enumerate(fields):
        label = small.render(f["label"], True, TEXT)
        screen.blit(label, (label_x, field_start_y + idx * row_h))
        rect = pygame.Rect(field_x, field_start_y + idx * row_h - 6, field_w, field_h)
        pygame.draw.rect(screen, (50, 50, 55), rect, border_radius=10)
        pygame.draw.rect(screen, (120, 190, 255) if idx == active_idx else BORDER, rect, 2, border_radius=10)
        val = small.render(str(f["value"]), True, TEXT)
        screen.blit(val, (rect.x + 10, rect.y + 8))

    # Translation steps
    log_top = field_start_y + row_h * len(fields) + 8
    screen.blit(small.render("Translation Steps", True, TEXT), (label_x, log_top))
    log_y = log_top + 26
    log_h = left_panel.bottom - log_y - 12
    line_h = tiny.get_height() + 4
    max_lines = max(1, log_h // line_h)
    log_lines = state["log"][-max_lines:] if state["log"] else ["(no translation yet)"]

    for i, line in enumerate(log_lines):
        screen.blit(tiny.render(str(line), True, MUTED), (label_x, log_y + i * line_h))

    # Right side: page table, frames, FIFO
    inner_x = right_panel.x + 12
    inner_w = right_panel.w - 24
    gap = 10
    table_h = int(right_panel.h * 0.45)
    frames_h = int(right_panel.h * 0.32)
    table_box = pygame.Rect(inner_x, right_panel.y + 44, inner_w, table_h)
    frames_box = pygame.Rect(inner_x, table_box.bottom + gap, inner_w, frames_h)
    fifo_box = pygame.Rect(inner_x, frames_box.bottom + gap, inner_w, right_panel.bottom - (frames_box.bottom + gap) - 12)

    for box in (table_box, frames_box, fifo_box):
        pygame.draw.rect(screen, GANTT_BG, box, border_radius=10)
        pygame.draw.rect(screen, OUTLINE, box, 2, border_radius=10)

    pid = fields[0]["value"].strip()
    if not pid and scheduler and scheduler.running:
        pid = scheduler.running.pid
    pages_per = safe_int(fields[3]["value"], mm.pages_per_process, min_val=1)
    table = mm.ensure_page_table(pid, pages_per) if pid else []

    # Page table
    pt_title = f"Page Table ({pid})" if pid else "Page Table (no PID)"
    screen.blit(small.render(pt_title, True, TEXT), (table_box.x + 10, table_box.y + 8))
    header_y = table_box.y + 34
    screen.blit(tiny.render("VPN", True, MUTED), (table_box.x + 12, header_y))
    screen.blit(tiny.render("P", True, MUTED), (table_box.x + 120, header_y))
    screen.blit(tiny.render("Frame", True, MUTED), (table_box.x + 170, header_y))

    row_h = 18
    start_y = header_y + 18
    max_rows = max(1, (table_box.bottom - start_y - 8) // row_h)
    overflow = max(0, len(table) - max_rows)
    for i, entry in enumerate(table[:max_rows]):
        y = start_y + i * row_h
        screen.blit(tiny.render(str(i), True, TEXT), (table_box.x + 12, y))
        present = "1" if entry["present"] else "0"
        screen.blit(tiny.render(present, True, TEXT), (table_box.x + 120, y))
        frame = "-" if entry["frame"] is None else str(entry["frame"])
        screen.blit(tiny.render(frame, True, TEXT), (table_box.x + 170, y))

    if overflow > 0:
        more = tiny.render(f"+{overflow} more", True, MUTED)
        screen.blit(more, (table_box.right - 10 - more.get_width(), table_box.bottom - 18))

    # Frames
    screen.blit(small.render("Physical Frames", True, TEXT), (frames_box.x + 10, frames_box.y + 8))
    frame_line_y = frames_box.y + 34
    frame_row_h = 18
    rows_per_col = max(1, (frames_box.bottom - frame_line_y - 8) // frame_row_h)
    frame_count = len(mm.frame_owner)
    frame_cols = 2 if frame_count > rows_per_col else 1
    frame_gap = 16
    frame_col_w = (frames_box.w - 20 - frame_gap * (frame_cols - 1)) // frame_cols
    frame_capacity = rows_per_col * frame_cols
    frame_overflow = max(0, frame_count - frame_capacity)

    for idx, owner in enumerate(mm.frame_owner[:frame_capacity]):
        col = idx // rows_per_col
        row = idx % rows_per_col
        x = frames_box.x + 10 + col * (frame_col_w + frame_gap)
        y = frame_line_y + row * frame_row_h
        if owner is None:
            label = f"F{idx}: free"
        else:
            opid, ovpn = owner
            label = f"F{idx}: {opid}[VPN{ovpn}]"
        screen.blit(tiny.render(label, True, TEXT), (x, y))

    if frame_overflow > 0:
        more = tiny.render(f"+{frame_overflow} more", True, MUTED)
        screen.blit(more, (frames_box.right - 10 - more.get_width(), frames_box.bottom - 18))

    # FIFO queue
    screen.blit(small.render("FIFO Queue", True, TEXT), (fifo_box.x + 10, fifo_box.y + 8))
    fifo_line = "FIFO: " + (" → ".join(str(f) for f in mm.fifo) if mm.fifo else "(empty)")
    screen.blit(tiny.render(fifo_line, True, TEXT), (fifo_box.x + 10, fifo_box.y + 36))


# ------------------------------
# Add-process modal
# ------------------------------
def draw_add_modal(screen, font, small, fields, active_idx, status):
    overlay = pygame.Surface((W, H), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 180))
    screen.blit(overlay, (0, 0))

    box = pygame.Rect(160, 180, 780, 460)
    draw_shadow_rect(screen, box, radius=16, alpha=SHADOW_ALPHA + 20)
    pygame.draw.rect(screen, PANEL, box, border_radius=16)
    draw_inner_highlight(screen, box, radius=16)
    pygame.draw.rect(screen, BORDER, box, 3, border_radius=16)

    title = font.render("Add Process (Enter to save, Esc to cancel)", True, TEXT)
    screen.blit(title, (box.x + 24, box.y + 18))

    instructions = [
        "Tab/Shift+Tab to change fields | Queue: USER or SYS",
        "Arrival time defaults to current clock if you enter something older.",
    ]
    for i, ln in enumerate(instructions):
        screen.blit(small.render(ln, True, MUTED), (box.x + 24, box.y + 60 + i * 24))

    start_y = box.y + 120
    for idx, f in enumerate(fields):
        # Split long Queue label onto two lines to avoid truncation
        label_y = start_y + idx * 60
        if idx == 4 or f["label"].startswith("Queue"):
            screen.blit(small.render("Queue", True, TEXT), (box.x + 24, label_y))
            screen.blit(small.render("(USER/SYS)", True, TEXT), (box.x + 24, label_y + 22))
        else:
            label = small.render(f["label"], True, TEXT)
            screen.blit(label, (box.x + 24, label_y))

        field_rect = pygame.Rect(box.x + 180, start_y + idx * 60 - 8, 500, 42)
        pygame.draw.rect(screen, (50, 50, 55), field_rect, border_radius=10)
        pygame.draw.rect(
            screen,
            (120, 190, 255) if idx == active_idx else BORDER,
            field_rect,
            2,
            border_radius=10,
        )
        val = small.render(f["value"], True, TEXT)
        screen.blit(val, (field_rect.x + 12, field_rect.y + 10))

    screen.blit(small.render(status, True, MUTED), (box.x + 24, box.y + box.h - 40))
