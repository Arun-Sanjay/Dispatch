# ------------------------------
# CONFIG
# ------------------------------
W, H = 1100, 900
FPS = 60
TICK_MS_DEFAULT = 500  # 0.5s per time unit

# ------------------------------
# COLORS (Neo-dark dashboard)
# ------------------------------
BG = (14, 15, 18)            # app background
PANEL = (26, 28, 34)         # primary surface
PANEL_2 = (32, 35, 42)       # secondary surface (reserved for later)
BORDER = (70, 74, 88)        # subtle border (no bright white)
OUTLINE = (10, 11, 13)       # dark outline for chips/buttons
TEXT = (240, 242, 248)
MUTED = (170, 176, 192)

ACCENT = (92, 145, 255)      # reserved for later polish
GOOD = (80, 200, 140)
BAD = (255, 120, 120)

CPU_RUN = GOOD
CPU_IDLE = (110, 114, 126)
READY_BOX = (92, 145, 255)   # ready chips use accent tone
GANTT_BG = (18, 19, 22)
GRID = (60, 62, 72)

SHADOW = (0, 0, 0)
SHADOW_ALPHA = 120
SHADOW_OFFSET = (0, 6)
HILITE = (255, 255, 255)
HILITE_ALPHA = 18

HEADER_STRIP_ALPHA = 170

# Vibrant per-task palette (used by Gantt + I/O timelines)
# Chosen to be high-contrast on the neo-dark background.
TASK_COLORS = [
    (255, 99, 132),   # pink-red
    (54, 162, 235),   # blue
    (255, 206, 86),   # yellow
    (75, 192, 192),   # teal
    (153, 102, 255),  # purple
    (255, 159, 64),   # orange
    (46, 204, 113),   # green
    (231, 76, 60),    # red
    (52, 152, 219),   # light blue
    (241, 196, 15),   # gold
    (155, 89, 182),   # violet
    (26, 188, 156),   # aqua
]

# Process state colors (for READY → RUNNING → WAITING(I/O) → READY ... → DONE)
STATE_COLORS = {
    "NEW": (140, 145, 160),
    "READY": READY_BOX,
    "RUNNING": CPU_RUN,
    "WAITING": (255, 206, 86),
    "DONE": (140, 200, 160),
}
