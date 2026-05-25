// Military HUD UI theme - colors, fonts, panel/button helpers
// Inspired by Ace Combat / EVE Online tactical interfaces.

const UI_THEME = {
    // Color palette
    color: {
        bgDeep: '#05080d',
        bgPanel: 'rgba(10, 18, 26, 0.85)',
        bgPanelStrong: 'rgba(8, 14, 20, 0.95)',
        gridLine: 'rgba(0, 230, 200, 0.06)',
        scanline: 'rgba(0, 230, 200, 0.03)',

        primary: '#00e6c8',
        primaryDim: 'rgba(0, 230, 200, 0.35)',
        primaryGlow: 'rgba(0, 230, 200, 0.55)',

        accent: '#ffb74d',
        accentDim: 'rgba(255, 183, 77, 0.4)',

        danger: '#ff5252',
        dangerDim: 'rgba(255, 82, 82, 0.35)',
        dangerGlow: 'rgba(255, 82, 82, 0.55)',

        warning: '#ffd54f',
        success: '#69f0ae',

        textPrimary: '#e8f4f3',
        textSecondary: '#8fb6b3',
        textMuted: '#506d6b',
        textInverse: '#05080d'
    },

    // Font stacks (loaded via Google Fonts in index.html)
    font: {
        display: '"Aldrich", "Arial", sans-serif',
        mono: '"Share Tech Mono", "Courier New", monospace',
        body: '"Aldrich", "Arial", sans-serif'
    }
};

// Hit test against current mouse position
function uiIsHovered(rect) {
    if (typeof mouse === 'undefined' || !rect) return false;
    return mouse.x >= rect.x && mouse.x <= rect.x + rect.width &&
           mouse.y >= rect.y && mouse.y <= rect.y + rect.height;
}

// Trace a chamfered (corner-clipped) rectangle path
function uiPathChamferRect(ctx, x, y, w, h, chamfer = 12) {
    const c = Math.min(chamfer, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
}

// HUD panel: chamfered rect with vertical gradient fill + outline
function uiDrawPanel(ctx, x, y, w, h, opts = {}) {
    const {
        chamfer = 12,
        fill = UI_THEME.color.bgPanel,
        stroke = UI_THEME.color.primaryDim,
        strokeWidth = 1.5,
        glow = false,
        glowColor = UI_THEME.color.primaryGlow
    } = opts;

    ctx.save();
    uiPathChamferRect(ctx, x, y, w, h, chamfer);

    if (typeof fill === 'string') {
        ctx.fillStyle = fill;
    } else {
        // gradient fill: { from, to } as colors
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, fill.from);
        g.addColorStop(1, fill.to);
        ctx.fillStyle = g;
    }
    ctx.fill();

    if (glow) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 16;
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.restore();
}

// Decorative L-brackets at panel corners
function uiDrawCornerBrackets(ctx, x, y, w, h, opts = {}) {
    const {
        size = 14,
        offset = 6,
        color = UI_THEME.color.primary,
        lineWidth = 2
    } = opts;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';

    const ox = x - offset;
    const oy = y - offset;
    const ow = w + offset * 2;
    const oh = h + offset * 2;

    ctx.beginPath();
    // top-left
    ctx.moveTo(ox, oy + size);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox + size, oy);
    // top-right
    ctx.moveTo(ox + ow - size, oy);
    ctx.lineTo(ox + ow, oy);
    ctx.lineTo(ox + ow, oy + size);
    // bottom-right
    ctx.moveTo(ox + ow, oy + oh - size);
    ctx.lineTo(ox + ow, oy + oh);
    ctx.lineTo(ox + ow - size, oy + oh);
    // bottom-left
    ctx.moveTo(ox + size, oy + oh);
    ctx.lineTo(ox, oy + oh);
    ctx.lineTo(ox, oy + oh - size);
    ctx.stroke();
    ctx.restore();
}

// HUD button with hover/press states; returns the rect for hit-testing
function uiDrawButton(ctx, x, y, w, h, label, opts = {}) {
    const {
        accentColor = UI_THEME.color.primary,
        subLabel = null,
        labelFont = `bold 22px ${UI_THEME.font.display}`,
        subFont = `13px ${UI_THEME.font.mono}`,
        chamfer = 14,
        disabled = false,
        labelLetterSpacing = 0
    } = opts;

    const rect = { x, y, width: w, height: h };
    const hovered = !disabled && uiIsHovered(rect);

    const baseAlpha = disabled ? 0.25 : (hovered ? 0.85 : 0.55);
    const fillFrom = `rgba(8, 14, 20, ${baseAlpha})`;
    const fillTo = disabled ? 'rgba(20, 28, 36, 0.4)' : `rgba(14, 26, 36, ${baseAlpha})`;

    uiDrawPanel(ctx, x, y, w, h, {
        chamfer,
        fill: { from: fillFrom, to: fillTo },
        stroke: disabled ? UI_THEME.color.textMuted : accentColor,
        strokeWidth: hovered ? 2.5 : 1.5,
        glow: hovered,
        glowColor: accentColor
    });

    // Left accent strip (hit point indicator)
    ctx.save();
    ctx.fillStyle = disabled ? UI_THEME.color.textMuted : accentColor;
    ctx.fillRect(x + 6, y + h * 0.25, 3, h * 0.5);
    ctx.restore();

    // Label
    ctx.save();
    ctx.fillStyle = disabled ? UI_THEME.color.textMuted : UI_THEME.color.textPrimary;
    ctx.font = labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (hovered) {
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 12;
    }
    const labelY = subLabel ? y + h * 0.38 : y + h / 2;
    const labelText = labelLetterSpacing > 0 ? uiSpaceLetters(label, labelLetterSpacing) : label;
    ctx.fillText(labelText, x + w / 2, labelY);
    ctx.restore();

    if (subLabel) {
        ctx.save();
        ctx.fillStyle = disabled ? UI_THEME.color.textMuted : UI_THEME.color.textSecondary;
        ctx.font = subFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(subLabel, x + w / 2, y + h * 0.72);
        ctx.restore();
    }

    return rect;
}

// Helper: insert spaces between characters for letter-spacing effect
function uiSpaceLetters(text, _amount) {
    return text.split('').join('\u2009');
}

// Word-wrap a single string into up to 2 lines, centered. Caller controls font/fill.
function wrapAndDrawText(ctx, text, cx, cy, maxWidth, lineHeight) {
    if (!text) return;
    if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, cx, cy);
        return;
    }
    // Split: prefer space; fallback to char-wise for CJK
    const hasSpace = /\s/.test(text);
    const tokens = hasSpace ? text.split(/(\s+)/) : text.split('');
    let line1 = '';
    let line2 = '';
    let i = 0;
    while (i < tokens.length) {
        const test = line1 + tokens[i];
        if (ctx.measureText(test).width <= maxWidth) {
            line1 = test;
            i++;
        } else break;
    }
    while (i < tokens.length) {
        line2 += tokens[i];
        i++;
    }
    if (ctx.measureText(line2).width > maxWidth) {
        // Truncate line2 with ellipsis
        while (line2.length > 0 && ctx.measureText(line2 + '...').width > maxWidth) {
            line2 = line2.slice(0, -1);
        }
        line2 += '...';
    }
    ctx.fillText(line1.trim(), cx, cy - lineHeight / 2);
    ctx.fillText(line2.trim(), cx, cy + lineHeight / 2);
}

// Subtle moving grid background for menu screens
function uiDrawGridBackground(ctx, w, h, opts = {}) {
    const {
        gridSize = 48,
        color = UI_THEME.color.gridLine,
        bgColor = UI_THEME.color.bgDeep
    } = opts;

    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Animated drift based on time
    const t = Date.now() / 80;
    const offsetX = (t % gridSize);
    const offsetY = (t * 0.6 % gridSize);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -gridSize + offsetX; x < w + gridSize; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
    }
    for (let y = -gridSize + offsetY; y < h + gridSize; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
}

// Horizontal scanlines overlay for retro CRT feel
function uiDrawScanlines(ctx, w, h, opts = {}) {
    const { spacing = 3, color = UI_THEME.color.scanline } = opts;
    ctx.save();
    ctx.fillStyle = color;
    for (let y = 0; y < h; y += spacing) {
        ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
}

// Big stylized title with sub-text and accent bar
function uiDrawTitle(ctx, cx, cy, mainText, subText, opts = {}) {
    const {
        mainFont = `bold 52px ${UI_THEME.font.display}`,
        subFont = `15px ${UI_THEME.font.mono}`,
        mainColor = UI_THEME.color.textPrimary,
        subColor = UI_THEME.color.primary,
        glow = true
    } = opts;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (glow) {
        ctx.shadowColor = UI_THEME.color.primaryGlow;
        ctx.shadowBlur = 20;
    }
    ctx.fillStyle = mainColor;
    ctx.font = mainFont;
    ctx.fillText(mainText, cx, cy);

    if (subText) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = subColor;
        ctx.font = subFont;
        ctx.fillText(subText, cx, cy + 38);

        // Accent bar under subtitle
        const barW = 120;
        ctx.strokeStyle = subColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, cy + 56);
        ctx.lineTo(cx + barW / 2, cy + 56);
        ctx.stroke();
    }
    ctx.restore();
}

// Status pill: small label + value capsule (e.g. for difficulty, locked state)
function uiDrawStatusBadge(ctx, x, y, text, opts = {}) {
    const {
        color = UI_THEME.color.primary,
        font = `12px ${UI_THEME.font.mono}`,
        paddingX = 10,
        paddingY = 5
    } = opts;

    ctx.save();
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = metrics.width + paddingX * 2;
    const h = 22;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    uiPathChamferRect(ctx, x, y, w, h, 4);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();

    return { x, y, width: w, height: h };
}

// Top corner HUD frame markers (for full-screen feel)
function uiDrawScreenFrame(ctx, w, h, opts = {}) {
    const {
        color = UI_THEME.color.primaryDim,
        size = 28,
        margin = 16,
        lineWidth = 1.5
    } = opts;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(margin, margin + size);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + size, margin);
    // Top-right
    ctx.moveTo(w - margin - size, margin);
    ctx.lineTo(w - margin, margin);
    ctx.lineTo(w - margin, margin + size);
    // Bottom-left
    ctx.moveTo(margin, h - margin - size);
    ctx.lineTo(margin, h - margin);
    ctx.lineTo(margin + size, h - margin);
    // Bottom-right
    ctx.moveTo(w - margin - size, h - margin);
    ctx.lineTo(w - margin, h - margin);
    ctx.lineTo(w - margin, h - margin - size);
    ctx.stroke();
    ctx.restore();
}
