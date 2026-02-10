import math

import pygame

from .theme import (
    ACCENT,
    BG,
    BORDER,
    HEADER_STRIP_ALPHA,
    HILITE,
    HILITE_ALPHA,
    OUTLINE,
    PANEL,
    SHADOW,
    SHADOW_ALPHA,
    SHADOW_OFFSET,
    TEXT,
    W,
    H,
)


def draw_shadow_rect(screen, rect, radius=14, alpha=SHADOW_ALPHA, offset=SHADOW_OFFSET):
    shadow_surf = pygame.Surface((rect.w + 14, rect.h + 14), pygame.SRCALPHA)
    shadow_rect = pygame.Rect(7, 7, rect.w, rect.h)
    pygame.draw.rect(shadow_surf, (*SHADOW, alpha), shadow_rect, border_radius=radius)
    screen.blit(shadow_surf, (rect.x + offset[0] - 7, rect.y + offset[1] - 7))


def draw_inner_highlight(screen, rect, radius=14, alpha=HILITE_ALPHA):
    band = pygame.Surface((rect.w - 6, 26), pygame.SRCALPHA)
    pygame.draw.rect(band, (*HILITE, alpha), pygame.Rect(0, 0, band.get_width(), band.get_height()), border_radius=radius)
    screen.blit(band, (rect.x + 3, rect.y + 3))


def build_background_surface():
    surf = pygame.Surface((W, H))
    top = (
        min(255, BG[0] + 6),
        min(255, BG[1] + 7),
        min(255, BG[2] + 9),
    )
    bottom = (
        max(0, BG[0] - 6),
        max(0, BG[1] - 6),
        max(0, BG[2] - 8),
    )

    grad = pygame.Surface((1, H))
    for y in range(H):
        t = y / max(1, H - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        grad.set_at((0, y), (r, g, b))
    grad = pygame.transform.scale(grad, (W, H))
    surf.blit(grad, (0, 0))

    vignette = pygame.Surface((W, H), pygame.SRCALPHA)
    cx, cy = W / 2, H / 2
    max_dist = math.hypot(cx, cy)
    for y in range(H):
        dy = y - cy
        for x in range(W):
            dx = x - cx
            d = math.hypot(dx, dy) / max_dist
            alpha = int(110 * (d ** 1.8))
            vignette.set_at((x, y), (0, 0, 0, alpha))
    surf.blit(vignette, (0, 0))
    return surf


def draw_header_strip(screen, height):
    """Soft top fade (no hard horizontal line)."""
    strip = pygame.Surface((W, height), pygame.SRCALPHA)
    # Fade from HEADER_STRIP_ALPHA at the top to 0 at the bottom.
    # The exponent eases the fade so it feels natural.
    denom = max(1, height - 1)
    for y in range(height):
        t = y / denom
        a = int(HEADER_STRIP_ALPHA * (1.0 - t) ** 1.6)
        # draw 1px row with alpha
        strip.fill((0, 0, 0, a), rect=pygame.Rect(0, y, W, 1))
    screen.blit(strip, (0, 0))


def draw_panel(screen, rect, title, font, small):
    draw_shadow_rect(screen, rect)
    pygame.draw.rect(screen, PANEL, rect, border_radius=14)
    draw_inner_highlight(screen, rect)
    pygame.draw.rect(screen, BORDER, rect, 2, border_radius=14)
    t = font.render(title, True, TEXT)
    screen.blit(t, (rect.x + 12, rect.y + 10))


def draw_process_chip(screen, rect, label, color, small, glow_alpha: int = 0):
    draw_shadow_rect(screen, rect, radius=10, alpha=SHADOW_ALPHA - 20, offset=(0, 4))
    pygame.draw.rect(screen, color, rect, border_radius=10)
    pygame.draw.rect(screen, OUTLINE, rect, 2, border_radius=10)
    if glow_alpha > 0:
        glow = pygame.Surface((rect.w + 10, rect.h + 10), pygame.SRCALPHA)
        pygame.draw.rect(
            glow,
            (*ACCENT, glow_alpha),
            pygame.Rect(0, 0, glow.get_width(), glow.get_height()),
            width=3,
            border_radius=12,
        )
        screen.blit(glow, (rect.x - 5, rect.y - 5))
    txt = small.render(label, True, (10, 10, 10))
    screen.blit(txt, (rect.x + 10, rect.y + 14))


# ------------------------------
# Tooltip renderer (reusable)
# ------------------------------
def draw_tooltip(screen, pos, lines, tiny, max_w=460):
    """Simple hover tooltip. `lines` is a list[str]."""
    if not lines:
        return

    pad_x, pad_y = 10, 8
    line_h = tiny.get_height() + 4

    rendered = [tiny.render(str(ln), True, TEXT) for ln in lines]
    w = min(max(s.get_width() for s in rendered) + pad_x * 2, max_w)

    h = len(rendered) * line_h + pad_y * 2

    mx, my = pos
    x = mx + 14
    y = my + 14

    # keep inside window
    if x + w > W - 8:
        x = mx - w - 14
    if y + h > H - 8:
        y = my - h - 14
    x = max(8, min(W - w - 8, x))
    y = max(8, min(H - h - 8, y))

    box = pygame.Rect(x, y, w, h)

    # shadow
    draw_shadow_rect(screen, box, radius=10, alpha=SHADOW_ALPHA - 10, offset=(0, 4))

    # body
    body = pygame.Surface((w, h), pygame.SRCALPHA)
    body.fill((18, 19, 22, 240))
    pygame.draw.rect(body, (*BORDER, 230), pygame.Rect(0, 0, w, h), 2, border_radius=10)

    # subtle top highlight
    top_band = pygame.Surface((w - 6, 18), pygame.SRCALPHA)
    pygame.draw.rect(top_band, (255, 255, 255, 18), pygame.Rect(0, 0, top_band.get_width(), top_band.get_height()), border_radius=10)
    body.blit(top_band, (3, 3))

    screen.blit(body, (x, y))

    ty = y + pad_y
    for surf in rendered:
        screen.blit(surf, (x + pad_x, ty))
        ty += line_h
