// Boss AI Core - shared decision framework + FX system for all Boss classes.

// === Utility-based move selector ============================================
function selectBossMove(movesTable, memory, ctx) {
    const now = ctx.now;
    let best = null;
    let bestScore = -Infinity;

    for (const move of movesTable) {
        const lastUse = memory.cooldowns[move.id] || 0;
        if (now - lastUse < move.cooldown) continue;
        if (move.canUse && !move.canUse(ctx)) continue;

        let score = move.score ? move.score(ctx) : 1.0;
        if (memory.lastMove === move.id) score -= 1.5;
        const recentCount = memory.recentMoves.filter(m => m === move.id).length;
        if (recentCount >= 2) score -= 0.8;
        score += (Math.random() - 0.5) * 0.3;

        if (score > bestScore) {
            bestScore = score;
            best = move;
        }
    }
    return best;
}

function commitBossMove(move, memory, now) {
    memory.cooldowns[move.id] = now;
    memory.lastMove = move.id;
    memory.lastMoveTime = now;
    memory.recentMoves.push(move.id);
    if (memory.recentMoves.length > 5) memory.recentMoves.shift();
}

function createBossAIMemory() {
    return {
        cooldowns: {},
        lastMove: null,
        lastMoveTime: 0,
        recentMoves: [],
        hitsTaken: 0,
        hitsTakenWindowStart: Date.now()
    };
}

function buildBossAIContext(boss) {
    const now = Date.now();
    const player = game.player;
    const bossCX = boss.x + boss.width / 2;
    const bossCY = boss.y + boss.height / 2;
    let dist = 9999, dx = 0, dy = 0, angle = 0;
    let playerCX = bossCX, playerCY = bossCY;
    if (player) {
        playerCX = player.x + player.width / 2;
        playerCY = player.y + player.height / 2;
        dx = playerCX - bossCX;
        dy = playerCY - bossCY;
        dist = Math.sqrt(dx * dx + dy * dy);
        angle = Math.atan2(dy, dx);
    }
    const hpPct = boss.health / boss.maxHealth;
    return {
        now, boss, player,
        bossCX, bossCY, playerCX, playerCY,
        dx, dy, dist,
        angleToPlayer: angle,
        hpPct,
        playerInvincible: player ? !!player.isInvincible : false
    };
}

// === Easing helpers ========================================================
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// === Smooth heading change =================================================
function steerBossVelocity(boss, desiredAngle, desiredSpeed, smoothing = 0.12) {
    const fvx = Math.cos(desiredAngle) * desiredSpeed;
    const fvy = Math.sin(desiredAngle) * desiredSpeed;
    boss.vx += (fvx - boss.vx) * smoothing;
    boss.vy += (fvy - boss.vy) * smoothing;
}

function freezeBoss(boss) {
    boss.vx = 0;
    boss.vy = 0;
}

// === FX System (particles + impact flashes + screen shake) ==================
// Single global instance kept on `bossFX`. Game loop:
//   - call bossFX.update() once per tick
//   - call bossFX.preDraw(ctx) before world draw  (applies screen shake)
//   - call bossFX.postDraw(ctx) after world draw  (renders flashes/particles)
const bossFX = {
    particles: [],
    flashes: [],     // bright impact rings/flashes
    shockwaves: [],  // expanding rings
    shake: { x: 0, y: 0, until: 0, magnitude: 0 },

    update() {
        const now = Date.now();
        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const t = (now - p.startedAt) / p.lifeMs;
            if (t >= 1) { this.particles.splice(i, 1); continue; }
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.vy += p.gravity;
        }
        // Flashes & shockwaves prune
        this.flashes = this.flashes.filter(f => now - f.startedAt < f.lifeMs);
        this.shockwaves = this.shockwaves.filter(s => now - s.startedAt < s.lifeMs);
        // Shake decay
        if (now < this.shake.until) {
            const remain = (this.shake.until - now) / this.shake.totalMs;
            const m = this.shake.magnitude * remain;
            this.shake.x = (Math.random() - 0.5) * 2 * m;
            this.shake.y = (Math.random() - 0.5) * 2 * m;
        } else {
            this.shake.x = 0;
            this.shake.y = 0;
        }
    },

    preDraw(ctx) {
        if (this.shake.x !== 0 || this.shake.y !== 0) {
            ctx.save();
            ctx.translate(this.shake.x, this.shake.y);
        }
    },
    postDraw(ctx) {
        // Particles + flashes + shockwaves render in additive blend for glow.
        const now = Date.now();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Shockwaves
        for (const s of this.shockwaves) {
            const t = (now - s.startedAt) / s.lifeMs;
            const r = s.startRadius + (s.endRadius - s.startRadius) * easeOutCubic(t);
            ctx.globalAlpha = (1 - t) * (s.alpha || 0.7);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = (s.thickness || 4) * (1 - t * 0.5);
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Flashes
        for (const f of this.flashes) {
            const t = (now - f.startedAt) / f.lifeMs;
            const r = f.radius * (1 + t * 0.4);
            const a = (1 - t) * (f.alpha || 1);
            const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            grad.addColorStop(0, `${f.color}ff`);
            grad.addColorStop(0.4, `${f.color}88`);
            grad.addColorStop(1, `${f.color}00`);
            ctx.globalAlpha = a;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // Particles
        for (const p of this.particles) {
            const t = (now - p.startedAt) / p.lifeMs;
            const a = (1 - t) * (p.alpha || 1);
            const sz = p.size * (1 - t * 0.5);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Pop the shake transform
        if (this.shake.x !== 0 || this.shake.y !== 0) {
            ctx.restore();
        }
    },

    // ---- Spawners ----
    addShake(magnitude, durationMs) {
        const now = Date.now();
        if (now < this.shake.until && this.shake.magnitude > magnitude) return;
        this.shake.magnitude = magnitude;
        this.shake.until = now + durationMs;
        this.shake.totalMs = durationMs;
    },
    addFlash(x, y, radius, color, lifeMs = 280, alpha = 1) {
        this.flashes.push({ x, y, radius, color, lifeMs, alpha, startedAt: Date.now() });
    },
    addShockwave(x, y, startRadius, endRadius, color, lifeMs = 500, thickness = 4, alpha = 0.8) {
        this.shockwaves.push({ x, y, startRadius, endRadius, color, lifeMs, thickness, alpha, startedAt: Date.now() });
    },
    spawnBurst(x, y, count, opts = {}) {
        const {
            color = '#ff4040',
            speedMin = 1, speedMax = 6,
            sizeMin = 2, sizeMax = 5,
            lifeMs = 600,
            spreadAngle = Math.PI * 2,
            baseAngle = 0,
            gravity = 0,
            drag = 0.94
        } = opts;
        for (let i = 0; i < count; i++) {
            const ang = baseAngle + (Math.random() - 0.5) * spreadAngle;
            const sp = speedMin + Math.random() * (speedMax - speedMin);
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                size: sizeMin + Math.random() * (sizeMax - sizeMin),
                color, lifeMs, gravity, drag,
                startedAt: Date.now()
            });
        }
    }
};

// === Telegraphs (attack predictors) =========================================
// Boss owns its own list. Render with renderBossTelegraphs(ctx, telegraphs).
// Telegraphs auto-prune when expired. They use additive blending + multi-layer
// drawing for a non-plastic look.

function createTelegraphArrow(startX, startY, endX, endY, durationMs, color = '#ff4040') {
    const now = Date.now();
    return { kind: 'arrow', startX, startY, endX, endY, color, startedAt: now, expiresAt: now + durationMs };
}
// Smart variant: arrow that re-aims at the player (and re-anchors at the boss)
// every frame, so the telegraph never lies. Pass the boss + an optional fixed
// length (defaults to the original distance).
function createTrackingArrow(boss, durationMs, length, color = '#ff4040') {
    const now = Date.now();
    return {
        kind: 'arrow', color, startedAt: now, expiresAt: now + durationMs,
        trackBoss: boss, trackLength: length || 90
    };
}
function createTelegraphCircle(x, y, radius, durationMs, color = '#ff4040') {
    const now = Date.now();
    return { kind: 'circle', x, y, radius, color, startedAt: now, expiresAt: now + durationMs };
}
function createTelegraphBeam(startX, startY, endX, endY, width, durationMs, color = '#ff4040') {
    const now = Date.now();
    return { kind: 'beam', startX, startY, endX, endY, width, color, startedAt: now, expiresAt: now + durationMs };
}
function createTelegraphAura(x, y, radius, durationMs, color = '#ff4040') {
    const now = Date.now();
    return { kind: 'aura', x, y, radius, color, startedAt: now, expiresAt: now + durationMs };
}

function renderBossTelegraphs(ctx, telegraphs) {
    if (!telegraphs || telegraphs.length === 0) return;
    const now = Date.now();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = telegraphs.length - 1; i >= 0; i--) {
        const t = telegraphs[i];
        if (now >= t.expiresAt) {
            telegraphs.splice(i, 1);
            continue;
        }
        const total = t.expiresAt - t.startedAt;
        const elapsed = now - t.startedAt;
        const progress = total > 0 ? elapsed / total : 0;
        // Final 25% ramps to maximum brightness (urgency cue)
        const urgency = progress < 0.75 ? progress / 0.75 * 0.6 : 0.6 + (progress - 0.75) / 0.25 * 0.4;
        const flicker = 0.85 + 0.15 * Math.sin(elapsed / 35);

        if (t.kind === 'arrow') {
            // Live-track the player if requested
            if (t.trackBoss && game && game.player) {
                const b = t.trackBoss;
                const sx = b.x + b.width / 2;
                const sy = b.y + b.height / 2;
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                const a = Math.atan2(py - sy, px - sx);
                t.startX = sx;
                t.startY = sy;
                t.endX = sx + Math.cos(a) * t.trackLength;
                t.endY = sy + Math.sin(a) * t.trackLength;
            }
            _renderTelegraphArrow(ctx, t, urgency, flicker);
        } else if (t.kind === 'circle') {
            _renderTelegraphCircle(ctx, t, progress, urgency, flicker);
        } else if (t.kind === 'beam') {
            _renderTelegraphBeam(ctx, t, progress, urgency, flicker);
        } else if (t.kind === 'aura') {
            _renderTelegraphAura(ctx, t, elapsed, progress, urgency, flicker);
        }
    }
    ctx.restore();
}

// ---- Telegraph renderers (multi-layer additive glow style) ----------------

function _renderTelegraphArrow(ctx, t, urgency, flicker) {
    const dx = t.endX - t.startX;
    const dy = t.endY - t.startY;
    const ang = Math.atan2(dy, dx);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    ctx.save();
    ctx.translate(t.startX, t.startY);
    ctx.rotate(ang);

    // Thin sci-fi laser sight: outer halo + crisp inner line + travelling
    // pulse + reticle ring at the target end.
    //
    // 1) Soft outer halo (additive, very subtle)
    const haloW = 6;
    ctx.globalAlpha = 0.35 * urgency * flicker;
    ctx.fillStyle = t.color;
    ctx.fillRect(0, -haloW / 2, len, haloW);

    // 2) Mid line
    ctx.globalAlpha = 0.7 * urgency * flicker;
    ctx.fillRect(0, -1.5, len, 3);

    // 3) Inner bright core (white hot)
    ctx.globalAlpha = 0.9 * urgency;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -0.6, len, 1.2);

    // 4) Travelling pulse (scanning the line toward the target)
    const pulseW = 28;
    const pulseTravel = (Date.now() / 380) % 1;
    const px = pulseTravel * len;
    const grad = ctx.createLinearGradient(px - pulseW, 0, px + pulseW, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, t.color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.7 * urgency * flicker;
    ctx.fillStyle = grad;
    ctx.fillRect(px - pulseW, -3, pulseW * 2, 6);

    // 5) End reticle: cross + ring at target point
    const rOuter = 14 + 4 * Math.sin(Date.now() / 110);
    const rInner = 6;
    ctx.globalAlpha = 0.75 * urgency * flicker;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(len, 0, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = urgency;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(len, 0, rInner, 0, Math.PI * 2);
    ctx.stroke();

    // Cross-hair tick marks
    ctx.beginPath();
    ctx.moveTo(len - rOuter - 5, 0); ctx.lineTo(len - rInner - 1, 0);
    ctx.moveTo(len + rInner + 1, 0); ctx.lineTo(len + rOuter + 5, 0);
    ctx.moveTo(len, -rOuter - 5);     ctx.lineTo(len, -rInner - 1);
    ctx.moveTo(len, rInner + 1);      ctx.lineTo(len, rOuter + 5);
    ctx.stroke();

    // 6) Slim arrowhead tucked just before the reticle (directional cue)
    const headLen = 10;
    const headHalfW = 5;
    const headBaseX = len - rOuter - 8;
    if (headBaseX > 0) {
        ctx.globalAlpha = 0.85 * urgency * flicker;
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(headBaseX, -headHalfW);
        ctx.lineTo(headBaseX + headLen, 0);
        ctx.lineTo(headBaseX, headHalfW);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function _renderTelegraphCircle(ctx, t, progress, urgency, flicker) {
    // Two concentric rings: outer expanding (target lock), inner pulsing.
    const rOuter = t.radius * (0.5 + 0.6 * easeOutCubic(progress));
    ctx.globalAlpha = 0.7 * urgency * flicker;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    // Inner soft fill
    const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, rOuter);
    grad.addColorStop(0, `${t.color}33`);
    grad.addColorStop(1, `${t.color}00`);
    ctx.globalAlpha = 0.6 * urgency;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(t.x, t.y, rOuter, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair ticks at the cardinal directions
    ctx.globalAlpha = urgency;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const tick = 8;
    for (let a = 0; a < 4; a++) {
        const ang = a * Math.PI / 2;
        const tx = t.x + Math.cos(ang) * rOuter;
        const ty = t.y + Math.sin(ang) * rOuter;
        ctx.beginPath();
        ctx.moveTo(tx - Math.cos(ang) * tick, ty - Math.sin(ang) * tick);
        ctx.lineTo(tx + Math.cos(ang) * tick, ty + Math.sin(ang) * tick);
        ctx.stroke();
    }
}

function _renderTelegraphBeam(ctx, t, progress, urgency, flicker) {
    const dx = t.endX - t.startX;
    const dy = t.endY - t.startY;
    const ang = Math.atan2(dy, dx);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    ctx.save();
    ctx.translate(t.startX, t.startY);
    ctx.rotate(ang);
    const wMax = t.width;
    const wNow = wMax * (0.15 + 0.85 * easeInOutQuad(progress));
    // Outer halo
    ctx.globalAlpha = 0.22 * urgency * flicker;
    ctx.fillStyle = t.color;
    ctx.fillRect(0, -wNow * 0.9, len, wNow * 1.8);
    // Mid bar
    ctx.globalAlpha = 0.5 * urgency * flicker;
    ctx.fillRect(0, -wNow / 2, len, wNow);
    // Bright core
    const coreW = Math.max(2, wNow * 0.18);
    ctx.globalAlpha = urgency;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -coreW / 2, len, coreW);
    ctx.restore();
}

function _renderTelegraphAura(ctx, t, elapsed, progress, urgency, flicker) {
    // Multiple pulsing rings + radial glow
    const baseR = t.radius;
    const pulse = 0.85 + 0.15 * Math.sin(elapsed / 60);
    // Radial glow
    const grad = ctx.createRadialGradient(t.x, t.y, baseR * 0.3, t.x, t.y, baseR * 1.4);
    grad.addColorStop(0, `${t.color}55`);
    grad.addColorStop(0.6, `${t.color}22`);
    grad.addColorStop(1, `${t.color}00`);
    ctx.globalAlpha = 0.85 * urgency;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(t.x, t.y, baseR * 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Two animated rings
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
        const phase = (elapsed / 700 + i * 0.5) % 1;
        const r = baseR * (0.6 + phase * 0.7);
        ctx.globalAlpha = (1 - phase) * 0.7 * urgency * flicker;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Inner bright ring (steady)
    ctx.globalAlpha = urgency;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, baseR * 0.55 * pulse, 0, Math.PI * 2);
    ctx.stroke();
}

// === Jet Flame (shared thruster effect) =====================================
// Multi-layer additive flame: outer halo → mid body → bright core → wisp tongues
// + per-frame ember particles. Looks far less plastic than a single stroked line.
//
// Usage: drawJetFlame(ctx, {
//   originX, originY,    // emitter point in current ctx space
//   angle,               // flame direction (radians, where flame *flows*)
//   length, width,       // base length & width
//   intensity = 0.7,     // 0..1, scales length/width/brightness
//   scheme = 'orange',   // 'orange' | 'crimson' | 'azure' | 'violet'
//   spawnEmbers = true,  // physics particles via bossFX
//   emberDensity = 0.6,  // 0..1
//   id = 0               // distinguishes multiple emitters (animation phase offset)
// })
const JET_FLAME_SCHEMES = {
    orange: {
        haloColor:  'rgba(255, 130, 30, 0.0)',
        haloMid:    'rgba(255, 160, 40, 0.55)',
        haloIn:     'rgba(255, 210, 90, 0.95)',
        bodyOut:    'rgba(255, 90, 0, 0.0)',
        bodyMid:    'rgba(255, 180, 40, 0.85)',
        bodyIn:     'rgba(255, 240, 150, 0.95)',
        coreOut:    'rgba(255, 240, 200, 0.0)',
        coreIn:     'rgba(255, 255, 255, 1)',
        ember:      ['#ffe080', '#ff9030', '#ff5010', '#c54010']
    },
    crimson: {
        haloColor:  'rgba(140, 0, 10, 0.0)',
        haloMid:    'rgba(200, 30, 30, 0.6)',
        haloIn:     'rgba(255, 80, 60, 0.95)',
        bodyOut:    'rgba(120, 0, 0, 0.0)',
        bodyMid:    'rgba(220, 40, 30, 0.85)',
        bodyIn:     'rgba(255, 160, 100, 0.95)',
        coreOut:    'rgba(255, 220, 180, 0.0)',
        coreIn:     'rgba(255, 255, 255, 1)',
        ember:      ['#ffffff', '#ffb060', '#ff5030', '#a01010']
    },
    azure: {
        haloColor:  'rgba(20, 70, 180, 0.0)',
        haloMid:    'rgba(80, 140, 230, 0.55)',
        haloIn:     'rgba(150, 210, 255, 0.95)',
        bodyOut:    'rgba(20, 70, 180, 0.0)',
        bodyMid:    'rgba(80, 160, 240, 0.85)',
        bodyIn:     'rgba(200, 240, 255, 0.95)',
        coreOut:    'rgba(220, 240, 255, 0.0)',
        coreIn:     'rgba(255, 255, 255, 1)',
        ember:      ['#ffffff', '#a0d8ff', '#3080ff', '#1040b0']
    },
    violet: {
        haloColor:  'rgba(60, 0, 100, 0.0)',
        haloMid:    'rgba(150, 60, 220, 0.55)',
        haloIn:     'rgba(220, 160, 255, 0.95)',
        bodyOut:    'rgba(60, 0, 100, 0.0)',
        bodyMid:    'rgba(160, 80, 240, 0.85)',
        bodyIn:     'rgba(240, 200, 255, 0.95)',
        coreOut:    'rgba(240, 220, 255, 0.0)',
        coreIn:     'rgba(255, 255, 255, 1)',
        ember:      ['#ffffff', '#d8a0ff', '#9040e0', '#5010a0']
    },
    gold: {
        haloColor:  'rgba(120, 80, 0, 0.0)',
        haloMid:    'rgba(220, 170, 40, 0.55)',
        haloIn:     'rgba(255, 230, 130, 0.95)',
        bodyOut:    'rgba(140, 80, 0, 0.0)',
        bodyMid:    'rgba(255, 200, 60, 0.85)',
        bodyIn:     'rgba(255, 245, 200, 0.95)',
        coreOut:    'rgba(255, 240, 200, 0.0)',
        coreIn:     'rgba(255, 255, 255, 1)',
        ember:      ['#ffffff', '#ffe080', '#ffa030', '#a06010']
    }
};

function drawJetFlame(ctx, opts) {
    const {
        originX, originY,
        angle,
        length: baseLen,
        width: baseW,
        intensity = 0.7,
        scheme = 'orange',
        spawnEmbers = true,
        emberDensity = 0.6,
        id = 0
    } = opts;

    const palette = JET_FLAME_SCHEMES[scheme] || JET_FLAME_SCHEMES.orange;
    const now = Date.now();
    // Animated breathing — slight length/width pulse + flicker
    const breathe = 0.92 + 0.08 * Math.sin(now / 60 + id * 1.7);
    const flicker = 0.85 + 0.15 * Math.sin(now / 25 + id * 3.1);
    const len = baseLen * intensity * breathe;
    const widthOut = baseW * intensity;
    const widthIn = widthOut * 0.45;
    const widthCore = Math.max(1.5, widthOut * 0.18);

    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';

    // ----- Layer 1: outer halo (wide, soft, longest) -----
    // Drawn with a teardrop-ish path: wide at the nozzle, narrowing to a point.
    const haloLen = len * 1.15;
    const haloW = widthOut * 1.6;
    const haloGrad = ctx.createLinearGradient(0, 0, haloLen, 0);
    haloGrad.addColorStop(0, palette.haloIn);
    haloGrad.addColorStop(0.4, palette.haloMid);
    haloGrad.addColorStop(1, palette.haloColor);
    ctx.globalAlpha = 0.55 * flicker;
    ctx.fillStyle = haloGrad;
    _drawFlameTeardrop(ctx, 0, haloLen, haloW * 0.7, haloW * 0.18);

    // ----- Layer 2: mid body -----
    const bodyGrad = ctx.createLinearGradient(0, 0, len, 0);
    bodyGrad.addColorStop(0, palette.bodyIn);
    bodyGrad.addColorStop(0.55, palette.bodyMid);
    bodyGrad.addColorStop(1, palette.bodyOut);
    ctx.globalAlpha = 0.85 * flicker;
    ctx.fillStyle = bodyGrad;
    _drawFlameTeardrop(ctx, 0, len, widthOut * 0.55, widthOut * 0.12);

    // ----- Layer 3: bright core -----
    const coreLen = len * 0.55;
    const coreGrad = ctx.createLinearGradient(0, 0, coreLen, 0);
    coreGrad.addColorStop(0, palette.coreIn);
    coreGrad.addColorStop(0.7, palette.coreIn);
    coreGrad.addColorStop(1, palette.coreOut);
    ctx.globalAlpha = flicker;
    ctx.fillStyle = coreGrad;
    _drawFlameTeardrop(ctx, 0, coreLen, widthIn * 0.5, widthIn * 0.1);

    // ----- Layer 4: bright tip dot at the nozzle -----
    const dotR = widthCore * 1.6;
    const dotGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, dotR);
    dotGrad.addColorStop(0, '#ffffff');
    dotGrad.addColorStop(0.6, palette.bodyIn);
    dotGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = flicker;
    ctx.fillStyle = dotGrad;
    ctx.beginPath();
    ctx.arc(0, 0, dotR, 0, Math.PI * 2);
    ctx.fill();

    // ----- Layer 5: animated tongues (wavy ridges along the flame) -----
    ctx.globalAlpha = 0.5 * flicker;
    ctx.strokeStyle = palette.bodyIn;
    ctx.lineWidth = 1.2;
    const tongueCount = 3;
    for (let t = 0; t < tongueCount; t++) {
        const phase = (now / 90 + t * 1.7 + id * 0.7) % (Math.PI * 2);
        ctx.beginPath();
        for (let s = 0; s <= 8; s++) {
            const sf = s / 8;
            const x = sf * len * 0.95;
            const yy = Math.sin(phase + sf * 6) * widthOut * 0.18 * (1 - sf);
            if (s === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ----- Embers (physics particles in world space) -----
    if (spawnEmbers && typeof bossFX !== 'undefined' && Math.random() < emberDensity) {
        // Need world-space origin: caller passes localOriginX/Y; convert via current
        // transform matrix. We approximate by using ctx.getTransform().
        // Re-apply the local→world point: since we restored, we must compute it.
        const m = ctx.getTransform();
        // Pick a random spawn point along the first 30% of the flame.
        const sLocal = Math.random() * len * 0.3;
        // Local point relative to origin & angle:
        const lx = Math.cos(angle) * sLocal + originX;
        const ly = Math.sin(angle) * sLocal + originY;
        // World = matrix · (lx, ly)
        const wx = m.a * lx + m.c * ly + m.e;
        const wy = m.b * lx + m.d * ly + m.f;
        // Velocity: backward along flame + small lateral spread
        const speed = (1.5 + Math.random() * 2.5) * intensity;
        const spread = (Math.random() - 0.5) * 0.6;
        // Convert flame-direction velocity to world via transform too.
        const vlx = Math.cos(angle + spread) * speed;
        const vly = Math.sin(angle + spread) * speed;
        const wvx = m.a * vlx + m.c * vly;
        const wvy = m.b * vlx + m.d * vly;
        const colors = palette.ember;
        bossFX.particles.push({
            x: wx, y: wy,
            vx: wvx, vy: wvy,
            size: 1.5 + Math.random() * 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            lifeMs: 280 + Math.random() * 240,
            gravity: 0,
            drag: 0.93,
            alpha: 0.9,
            startedAt: now
        });
    }
}

// Internal: draws a teardrop-shaped flame envelope from (x0,0) to (x0+len, 0)
// along the +x axis. Wide at base (halfWBase), narrowing to point (halfWTip).
function _drawFlameTeardrop(ctx, x0, len, halfWBase, halfWTip) {
    ctx.beginPath();
    // Top side (curve from base to tip)
    ctx.moveTo(x0, -halfWBase);
    ctx.bezierCurveTo(
        x0 + len * 0.35, -halfWBase * 1.05,
        x0 + len * 0.7,  -halfWTip * 2.2,
        x0 + len,        -halfWTip
    );
    // Tip
    ctx.lineTo(x0 + len, halfWTip);
    // Bottom side
    ctx.bezierCurveTo(
        x0 + len * 0.7,  halfWTip * 2.2,
        x0 + len * 0.35, halfWBase * 1.05,
        x0,              halfWBase
    );
    ctx.closePath();
    ctx.fill();
}

// === Weapon FX helpers ======================================================
// All helpers are stateless: pass coords + style and they paint multi-layer
// additive visuals. Designed to make any plain stroke/fill weapon feel modern.
//
// Color schemes shared by helpers:
const WEAPON_FX_SCHEMES = {
    cyan:    { core: '#ffffff', mid: '#a8f0ff', edge: '#00b8ff', dark: '#0050a0' },
    azure:   { core: '#ffffff', mid: '#a0c8ff', edge: '#3070ff', dark: '#102060' },
    gold:    { core: '#ffffff', mid: '#fff0b0', edge: '#ffb030', dark: '#a05000' },
    orange:  { core: '#ffffff', mid: '#ffd080', edge: '#ff7020', dark: '#902010' },
    crimson: { core: '#ffffff', mid: '#ffb0a0', edge: '#ff3030', dark: '#700810' },
    violet:  { core: '#ffffff', mid: '#e0a0ff', edge: '#9040ff', dark: '#400080' },
    green:   { core: '#ffffff', mid: '#b0ffb0', edge: '#30c050', dark: '#106020' },
    pink:    { core: '#ffffff', mid: '#ffc0e0', edge: '#ff40a0', dark: '#800040' },
    white:   { core: '#ffffff', mid: '#fff0c0', edge: '#fff080', dark: '#aaa040' }
};

function _wfxPalette(scheme) {
    return WEAPON_FX_SCHEMES[scheme] || WEAPON_FX_SCHEMES.cyan;
}

// 1. drawBulletGlow: replaces a flat-fill bullet with a glowing dot.
//    Use for any small projectile (gun, ciws, plasma, etc).
//    opts: { x, y, radius, scheme='cyan', alpha=1, trail=false }
function drawBulletGlow(ctx, opts) {
    const { x, y, radius: r, scheme = 'cyan', alpha = 1 } = opts;
    const p = _wfxPalette(scheme);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Outer halo
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    halo.addColorStop(0, p.edge);
    halo.addColorStop(0.4, p.dark);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fill();
    // Mid glow
    const mid = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    mid.addColorStop(0, p.mid);
    mid.addColorStop(0.6, p.edge);
    mid.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = mid;
    ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
    // Bright core
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.core;
    ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// 2. drawTracer: directional bullet with a stretched glow tail (replaces line stroke).
//    opts: { x, y, vx, vy, length, width, scheme, alpha=1 }
function drawTracer(ctx, opts) {
    const { x, y, vx, vy, length, width, scheme = 'gold', alpha = 1 } = opts;
    const angle = Math.atan2(vy, vx);
    const p = _wfxPalette(scheme);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    // Halo (wide, soft)
    const halo = ctx.createLinearGradient(-length, 0, length * 0.2, 0);
    halo.addColorStop(0, 'rgba(0,0,0,0)');
    halo.addColorStop(0.4, p.dark);
    halo.addColorStop(0.8, p.edge);
    halo.addColorStop(1, p.mid);
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = halo;
    ctx.fillRect(-length, -width * 1.6, length * 1.2, width * 3.2);
    // Body
    const body = ctx.createLinearGradient(-length * 0.85, 0, length * 0.1, 0);
    body.addColorStop(0, 'rgba(0,0,0,0)');
    body.addColorStop(0.5, p.edge);
    body.addColorStop(1, p.mid);
    ctx.globalAlpha = alpha * 0.95;
    ctx.fillStyle = body;
    ctx.fillRect(-length * 0.85, -width * 0.5, length * 0.95, width);
    // Bright head
    ctx.globalAlpha = alpha;
    const head = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 1.2);
    head.addColorStop(0, p.core);
    head.addColorStop(0.6, p.mid);
    head.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = head;
    ctx.beginPath(); ctx.arc(0, 0, width * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// 3. drawMuzzleFlash: flash at gun barrel (call when firing).
//    Spawns visual flash that lives 1 frame (call every frame while firing).
//    opts: { x, y, angle, size=18, scheme='gold', alpha=1 }
function drawMuzzleFlash(ctx, opts) {
    const { x, y, angle, size = 18, scheme = 'gold', alpha = 1 } = opts;
    const p = _wfxPalette(scheme);
    const t = Date.now();
    const flicker = 0.85 + 0.15 * Math.sin(t / 30);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    // Burst rays
    ctx.globalAlpha = alpha * 0.7 * flicker;
    ctx.strokeStyle = p.mid;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const ang = (Math.random() - 0.5) * 1.0;
        const len = size * (0.6 + Math.random() * 0.7);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        ctx.stroke();
    }
    // Conical glow (forward)
    const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
    cone.addColorStop(0, p.core);
    cone.addColorStop(0.3, p.mid);
    cone.addColorStop(0.7, p.edge);
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.6);
    ctx.lineTo(size * 1.4, 0);
    ctx.lineTo(-size * 0.3, size * 0.6);
    ctx.closePath();
    ctx.fill();
    // Bright core dot
    ctx.fillStyle = p.core;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// 4. drawBeam: continuous beam between two points (laser, plasma stream).
//    opts: { x1, y1, x2, y2, width, scheme='cyan', alpha=1, charge=1 (0..1+) }
function drawBeam(ctx, opts) {
    const { x1, y1, x2, y2, width, scheme = 'cyan', alpha = 1, charge = 1 } = opts;
    const p = _wfxPalette(scheme);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const angle = Math.atan2(dy, dx);
    const t = Date.now();
    const flicker = 0.9 + 0.1 * Math.sin(t / 20);
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';

    // Outer halo (very wide & soft)
    ctx.globalAlpha = alpha * 0.5 * flicker;
    ctx.fillStyle = p.dark;
    ctx.fillRect(0, -width * 2.2 * charge, len, width * 4.4 * charge);
    // Mid layer
    const midGrad = ctx.createLinearGradient(0, -width * charge, 0, width * charge);
    midGrad.addColorStop(0, 'rgba(0,0,0,0)');
    midGrad.addColorStop(0.5, p.edge);
    midGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.85 * flicker;
    ctx.fillStyle = midGrad;
    ctx.fillRect(0, -width * charge, len, width * 2 * charge);
    // Inner body
    const innerGrad = ctx.createLinearGradient(0, -width * 0.45, 0, width * 0.45);
    innerGrad.addColorStop(0, 'rgba(0,0,0,0)');
    innerGrad.addColorStop(0.5, p.mid);
    innerGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = innerGrad;
    ctx.fillRect(0, -width * 0.6, len, width * 1.2);
    // Bright core line
    ctx.fillStyle = p.core;
    ctx.fillRect(0, -width * 0.18, len, width * 0.36);

    // Endpoint pulses
    const endRad = width * 1.8 * charge;
    const endGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, endRad);
    endGlow.addColorStop(0, p.core);
    endGlow.addColorStop(0.5, p.mid);
    endGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = endGlow;
    ctx.beginPath(); ctx.arc(0, 0, endRad, 0, Math.PI * 2); ctx.fill();
    const tipGlow = ctx.createRadialGradient(len, 0, 0, len, 0, endRad * 1.2);
    tipGlow.addColorStop(0, p.core);
    tipGlow.addColorStop(0.5, p.edge);
    tipGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tipGlow;
    ctx.beginPath(); ctx.arc(len, 0, endRad * 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// 5. drawSlashArc: a stylized melee slash arc (sword swing trail).
//    opts: { x, y, radius, startAngle, endAngle, thickness, scheme='white', alpha=1, progress=1 (0..1) }
//    progress controls fade: 0 = sharpest, 1 = fully faded
function drawSlashArc(ctx, opts) {
    const { x, y, radius, startAngle, endAngle, thickness, scheme = 'white', alpha = 1, progress = 0 } = opts;
    const p = _wfxPalette(scheme);
    const fade = 1 - progress;
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Outer wide glow
    ctx.globalAlpha = alpha * 0.4 * fade;
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = thickness * 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    // Mid
    ctx.globalAlpha = alpha * 0.75 * fade;
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = thickness * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    // Inner body
    ctx.globalAlpha = alpha * 0.95 * fade;
    ctx.strokeStyle = p.mid;
    ctx.lineWidth = thickness * 0.85;
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    // Bright core line
    ctx.globalAlpha = alpha * fade;
    ctx.strokeStyle = p.core;
    ctx.lineWidth = Math.max(1.5, thickness * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
}

// 6. drawEnergyRing: animated energy ring (used for shields, EMP, slashes).
//    opts: { x, y, radius, thickness, scheme, alpha, segments=1 (number of arc segments rotating), spin=0 }
function drawEnergyRing(ctx, opts) {
    const { x, y, radius, thickness = 4, scheme = 'cyan', alpha = 1, segments = 1, spin = 0 } = opts;
    const p = _wfxPalette(scheme);
    const t = Date.now() / 600;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin + t);
    ctx.globalCompositeOperation = 'lighter';

    // Solid soft ring
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = thickness * 2.5;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = thickness;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.mid;
    ctx.lineWidth = Math.max(1.2, thickness * 0.4);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();

    // Rotating segment highlights
    const segLen = (Math.PI * 2) / (segments * 4);
    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.core;
        ctx.lineWidth = thickness * 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, radius, a0, a0 + segLen);
        ctx.stroke();
    }
    ctx.restore();
}

// 7. drawImpactSparks: burst of small radial sparks (call once on impact).
//    Spawns particles into bossFX so they fade out naturally.
//    opts: { x, y, count=12, scheme='gold', speed=4, lifeMs=400 }
function drawImpactSparks(opts) {
    const { x, y, count = 12, scheme = 'gold', speed = 4, lifeMs = 400 } = opts;
    if (typeof bossFX === 'undefined') return;
    const p = _wfxPalette(scheme);
    const colors = [p.core, p.mid, p.edge];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = speed * (0.4 + Math.random() * 0.9);
        bossFX.particles.push({
            x, y,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            size: 1.2 + Math.random() * 1.8,
            color: colors[Math.floor(Math.random() * colors.length)],
            lifeMs: lifeMs * (0.7 + Math.random() * 0.6),
            gravity: 0,
            drag: 0.9,
            alpha: 0.95,
            startedAt: now
        });
    }
    if (typeof bossFX.addFlash === 'function') {
        bossFX.addFlash(x, y, 14, p.mid, 140);
    }
}
