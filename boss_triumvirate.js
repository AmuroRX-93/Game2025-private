// Triumvirate — three-body elemental boss (Pyron / Volthar / Glacius).
// Killing any two collapses the third into Voidborn (a fourth, distinct
// fight). The container `Triumvirate` exposes a single `health/maxHealth`
// pair so the existing UI keeps working; per-member bars are drawn on top.
//
// File layout:
//   1. Constants & shared helpers
//   2. Pyron (fire)        + projectiles (HeatLanceColumn, FlameStream, MagmaSpout, CinderTrail)
//   3. Volthar (lightning) + projectiles (LightningStrike, IronSpike, ChainBolt, StormField)
//   4. Glacius (ice)       + projectiles (FrostBolt, FrostNovaWave, IceField, IceSpikeWall)
//   5. Voidborn            + projectiles (BlackholeShell, BlackholeField)
//   6. Triumvirate (container)

// ---------------------------------------------------------------
// 1. Constants & shared helpers
// ---------------------------------------------------------------

const TRI = {
    SUBHP: 240,
    VOID_HP: 200,
    SPAWN_SPREAD: 280,         // distance between members on spawn
    PHASE_VOID: 'void',
    PHASE_THREE: 'three',
    // --- Voidborn tuning ---
    VOID_DEVOUR_RADIUS: 240,   // ranged projectiles inside this are devoured
    VOID_TELEPORT_RADIUS: 160, // player inside this for too long -> teleported (was 95)
    VOID_TELEPORT_DWELL: 350,  // ms player must stay inside before tp (was 800)
    VOID_TELEPORT_CD: 1500,    // ms cooldown between teleports (was 2200)
    VOID_DRIFT_SPEED: 0.6,     // slow ambient drift
    VOID_BLACKHOLE_CD: 2400,   // ms between blackhole cannon shots (was 4200)
    VOID_BLACKHOLE_SPEED: 7.0, // projectile travel speed (was 4.2)
    VOID_BLACKHOLE_PULL_R: 460,
    VOID_BLACKHOLE_PULL: 16.0, // peak pull per frame (was 11.0)
    VOID_BLACKHOLE_PULL_FLOOR: 6.0, // minimum pull at the rim (was 4.5)
    VOID_BLACKHOLE_OUTWARD_RESIST: 1.4,  // > 1.0 means outward movement is fully cancelled
                                          // and partially reversed at the core
    VOID_BLACKHOLE_INWARD_BOOST: 1.25,
    VOID_BLACKHOLE_LIFE: 1500, // ms blackhole lasts before exploding
    VOID_BLACKHOLE_AOE_R: 220, // explosion radius
    VOID_BLACKHOLE_AOE_DMG: 38,// AOE damage on detonation (was 22)
    VOID_BLACKHOLE_PULL_TICK_DMG: 1.5, // damage per tick while inside pull field
    VOID_MELEE_RANGE: 95,      // melee = anything originating this close
};

// Distance from one entity to the player.
function _triDistToPlayer(e) {
    if (!game.player) return Infinity;
    const dx = (game.player.x + game.player.width / 2) - (e.x + e.width / 2);
    const dy = (game.player.y + game.player.height / 2) - (e.y + e.height / 2);
    return Math.hypot(dx, dy);
}

function _triPlayerCenter() {
    if (!game.player) return { x: 0, y: 0 };
    return {
        x: game.player.x + game.player.width / 2,
        y: game.player.y + game.player.height / 2,
    };
}

function _triClampToArena(p, margin = 40) {
    p.x = Math.max(margin, Math.min(GAME_CONFIG.WIDTH - margin, p.x));
    p.y = Math.max(margin, Math.min(GAME_CONFIG.HEIGHT - margin, p.y));
    return p;
}

// Push `self` away from any other Triumvirate member that's within
// `minDist` so the three never sit on top of each other. Each member
// calls this once per frame at the end of its movement step. The push
// is capped per-frame so we don't fight other movement code, and it
// scales with how deep the overlap is (closer = harder shove).
function _triApplySeparation(self, minDist = 220, maxPush = 1.4) {
    const tri = (game && game.boss && game.boss.isTriumvirate) ? game.boss : null;
    if (!tri || !Array.isArray(tri.members)) return;
    let pushX = 0, pushY = 0;
    for (const m of tri.members) {
        if (!m || m === self || m.shouldDestroy) continue;
        const dx = (self.x + self.width / 2) - (m.x + m.width / 2);
        const dy = (self.y + self.height / 2) - (m.y + m.height / 2);
        const d = Math.hypot(dx, dy);
        if (d > minDist || d < 0.001) continue;
        // Falloff: pushes harder when very close, fades to 0 at minDist.
        const k = 1 - (d / minDist);
        const inv = 1 / d;
        pushX += dx * inv * k;
        pushY += dy * inv * k;
    }
    const mag = Math.hypot(pushX, pushY);
    if (mag < 0.001) return;
    const scale = Math.min(maxPush, mag * maxPush) / mag;
    self.x += pushX * scale;
    self.y += pushY * scale;
}

// Generic boss-side projectile container access. We push elemental
// projectiles into game.triumvirateProjectiles so they update/draw
// independently of the missile pipeline.
function _triProjArr() {
    if (!game.triumvirateProjectiles) game.triumvirateProjectiles = [];
    return game.triumvirateProjectiles;
}

// Emit damage to the player, route through takeDamage so the
// existing damage flow (UI, shake, etc.) stays consistent.
function _triHitPlayer(damage) {
    if (!game.player || game.player.isUntargetable) return;
    game.player.takeDamage(damage);
    if (typeof updateUI === 'function') updateUI();
}

// Stun helper: many tri attacks apply 0.3s stun on hit.
function _triStunPlayer(ms) {
    if (!game.player) return;
    if (typeof game.player.setStunned === 'function') {
        game.player.setStunned(ms);
    }
}

// Hit-reaction sidestep. Triumvirate members nudge perpendicular to
// the player on every taken hit so they don't sit still as bullet
// sponges. Direction alternates each call to feel like reactive
// dodging rather than a constant slide.
function _triHitSidestep(self, magnitude) {
    if (!self || !game.player) return;
    const cx = self.x + self.width / 2;
    const cy = self.y + self.height / 2;
    const px = game.player.x + game.player.width / 2;
    const py = game.player.y + game.player.height / 2;
    const ang = Math.atan2(py - cy, px - cx);
    self._sideSign = (self._sideSign === 1) ? -1 : 1;
    const lateral = ang + Math.PI / 2;
    const m = (magnitude != null) ? magnitude : 9;
    self.x += Math.cos(lateral) * m * self._sideSign;
    self.y += Math.sin(lateral) * m * self._sideSign;
    // Tiny back-step away from the player too, so chip damage feels
    // less rewarding than commit damage.
    self.x -= Math.cos(ang) * 1.5;
    self.y -= Math.sin(ang) * 1.5;
    if (typeof _triClampToArena === 'function') _triClampToArena(self);
}

// ---------------------------------------------------------------
// 2. Pyron — fire elemental
// ---------------------------------------------------------------
// Mid-range pressure boss. Heat lance is an instant-strike telegraphed
// pillar; later phases will add flamethrower sweep, magma burst, dash.

// ---------------------------------------------------------------
// 2. Pyron — fire elemental
// ---------------------------------------------------------------
// Mid-range pressure boss.
//   - Heat Lance:    instant-strike telegraphed pillar (single point).
//   - Flamethrower:  1.8s sustained cone that slowly tracks the player.
// (Magma burst + cinder dash come in later phases.)

class FlameSweep {
    // Sustained flamethrower cone. Volumetric look built from many soft
    // "puffs" that spawn at the nozzle and drift outward along the cone,
    // expanding and fading. Each puff is a soft radial gradient, so the
    // overall jet looks like a turbulent gas plume rather than a solid
    // colored shape. A thin white-hot core jet sits on top, and slow
    // dark smoke trails behind the leading edge.
    constructor(opts) {
        this.spawnAt = Date.now();
        this.duration = opts.duration || 1800;
        this.range = opts.range || 280;
        this.coneHalfAngle = opts.coneHalfAngle || (Math.PI / 5);
        this.tickDamage = (opts.tickDamage != null) ? opts.tickDamage : 4;
        this.tickInterval = opts.tickInterval || 110;
        this.getOrigin = opts.getOrigin;
        this.getAimAngle = opts.getAimAngle;
        this.shouldDestroy = false;
        this._lastTickAt = 0;
        this.belongsTo = 'pyron';
        // Local, jet-relative particle pool: positions/dirs are stored in
        // jet-local space (x along the aim axis, y orthogonal) so we can
        // render after a translate+rotate without re-solving math.
        this._puffs = [];      // hot fire body
        this._smoke = [];      // trailing dark smoke
        this._embers = [];     // bright flecks
        this._lastSpawnAt = 0;
        this._lastFrameAt = Date.now();
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (age >= this.duration) {
            this.shouldDestroy = true;
            return;
        }
        // Damage tick.
        if (now - this._lastTickAt >= this.tickInterval) {
            this._lastTickAt = now;
            const o = this.getOrigin();
            const aim = this.getAimAngle();
            if (game.player && !game.player.isUntargetable) {
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                const dx = px - o.x, dy = py - o.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= this.range) {
                    let toPlayer = Math.atan2(dy, dx) - aim;
                    while (toPlayer > Math.PI) toPlayer -= Math.PI * 2;
                    while (toPlayer < -Math.PI) toPlayer += Math.PI * 2;
                    if (Math.abs(toPlayer) <= this.coneHalfAngle) {
                        _triHitPlayer(this.tickDamage);
                    }
                }
            }
        }

        // Particle simulation in jet-local space.
        let dt = (now - this._lastFrameAt) / 1000;
        if (dt > 0.05) dt = 0.05;
        this._lastFrameAt = now;

        // Intensity envelope (also gates spawn rate so the jet ramps
        // and tails off naturally).
        const t = age / this.duration;
        let intensity;
        if (t < 0.10) intensity = t / 0.10;
        else if (t > 0.88) intensity = 1 - (t - 0.88) / 0.12;
        else intensity = 1;
        intensity = Math.max(0, Math.min(1, intensity));

        // Spawn fire puffs.
        // Particle speeds & lives are derived from `range` so the visual
        // cone always reaches the damage range no matter how long it is.
        // Reference: range 280 ~ baseline (260 px/s, life 0.5s).
        const rangeScale = this.range / 280;
        const baseSpd = 240 * rangeScale;
        const baseLife = 0.42 * Math.sqrt(rangeScale);
        const fireSpawnEvery = 14; // ms between spawns at full intensity
        if (now - this._lastSpawnAt >= fireSpawnEvery / Math.max(0.2, intensity)) {
            this._lastSpawnAt = now;
            const burst = 2 + Math.floor(intensity * 2);
            for (let i = 0; i < burst; i++) {
                const ang = (Math.random() - 0.5) * this.coneHalfAngle * 0.55;
                const speed = baseSpd + Math.random() * (baseSpd * 0.9);
                this._puffs.push({
                    x: 6 + Math.random() * 8,
                    y: (Math.random() - 0.5) * 6,
                    vx: Math.cos(ang) * speed,
                    vy: Math.sin(ang) * speed,
                    r0: 7 + Math.random() * 6,
                    grow: (60 + Math.random() * 50) * rangeScale,    // px/s radius growth
                    life: 0,
                    maxLife: baseLife + Math.random() * baseLife * 0.5,
                    hue: 18 + Math.random() * 20,                   // 18..38 (red->orange)
                    seed: Math.random() * 1000,
                });
            }
            // Smoke spawns less often, lags behind.
            if (Math.random() < 0.7) {
                const ang = (Math.random() - 0.5) * this.coneHalfAngle * 0.7;
                const sSpd = baseSpd * 0.55;
                this._smoke.push({
                    x: 10 + Math.random() * 10,
                    y: (Math.random() - 0.5) * 8,
                    vx: Math.cos(ang) * (sSpd + Math.random() * sSpd * 0.9),
                    vy: Math.sin(ang) * (sSpd + Math.random() * sSpd * 0.9) + (Math.random() - 0.5) * 20,
                    r0: 9 + Math.random() * 6,
                    grow: (70 + Math.random() * 30) * rangeScale,
                    life: 0,
                    maxLife: (0.65 + Math.random() * 0.35) * Math.sqrt(rangeScale),
                    seed: Math.random() * 1000,
                });
            }
            if (Math.random() < 0.9 * intensity) {
                const ang = (Math.random() - 0.5) * this.coneHalfAngle * 0.8;
                const eSpd = baseSpd * 1.4;
                this._embers.push({
                    x: 4 + Math.random() * 6,
                    y: (Math.random() - 0.5) * 5,
                    vx: Math.cos(ang) * (eSpd + Math.random() * eSpd * 0.7),
                    vy: Math.sin(ang) * (eSpd + Math.random() * eSpd * 0.7) + (Math.random() - 0.5) * 40,
                    life: 0,
                    maxLife: (0.30 + Math.random() * 0.25) * Math.sqrt(rangeScale),
                    seed: Math.random() * 1000,
                });
            }
        }

        // Step particles.
        // Drag is reduced for long-range cones so particles actually
        // travel the full distance instead of stalling at the muzzle.
        const drag = Math.pow(0.985, 1 / Math.max(1, Math.sqrt(rangeScale)));
        const stepArr = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const p = arr[i];
                p.life += dt;
                if (p.life >= p.maxLife) { arr.splice(i, 1); continue; }
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                // Mild lateral turbulence.
                p.vy += Math.sin(p.seed + p.life * 9) * 60 * dt;
                // Drag (so puffs decelerate at the edge of the jet).
                p.vx *= drag;
                p.vy *= drag;
            }
        };
        stepArr(this._puffs);
        stepArr(this._smoke);
        stepArr(this._embers);

        // Cap puff arrays to keep canvas affordable. Long-range cones
        // need higher caps to maintain visual density.
        const puffCap = Math.floor(220 * Math.max(1, rangeScale));
        const smokeCap = Math.floor(90 * Math.max(1, rangeScale));
        const emberCap = Math.floor(90 * Math.max(1, rangeScale));
        if (this._puffs.length > puffCap) this._puffs.splice(0, this._puffs.length - puffCap);
        if (this._smoke.length > smokeCap) this._smoke.splice(0, this._smoke.length - smokeCap);
        if (this._embers.length > emberCap) this._embers.splice(0, this._embers.length - emberCap);
    }

    draw(ctx) {
        const o = this.getOrigin();
        const aim = this.getAimAngle();

        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(aim);

        // 1) Smoke first, behind everything (normal blending).
        for (const s of this._smoke) {
            const k = s.life / s.maxLife;
            const r = s.r0 + s.grow * s.life;
            const a = (1 - k) * 0.35;
            const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
            grad.addColorStop(0, `rgba(40,30,28,${a})`);
            grad.addColorStop(1, 'rgba(40,30,28,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        }

        // 2) Hot fire body (additive).
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this._puffs) {
            const k = p.life / p.maxLife;
            const r = p.r0 + p.grow * p.life;
            // Color shift: bright yellow when young, red when old.
            // We layer two gradients per puff (outer red, inner hot).
            const aOuter = (1 - k) * 0.55;
            const aInner = (1 - k) * (1 - k) * 0.85;

            const og = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            og.addColorStop(0, `rgba(255,${110 + p.hue * 2},40,${aOuter})`);
            og.addColorStop(0.55, `rgba(220,60,15,${aOuter * 0.6})`);
            og.addColorStop(1, 'rgba(60,10,0,0)');
            ctx.fillStyle = og;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();

            if (k < 0.6) {
                const ir = r * 0.55;
                const ig = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, ir);
                ig.addColorStop(0, `rgba(255,255,210,${aInner})`);
                ig.addColorStop(0.6, `rgba(255,200,120,${aInner * 0.6})`);
                ig.addColorStop(1, 'rgba(255,120,40,0)');
                ctx.fillStyle = ig;
                ctx.beginPath(); ctx.arc(p.x, p.y, ir, 0, Math.PI * 2); ctx.fill();
            }
        }

        // 3) White-hot nozzle jet: tight forward streak right at the muzzle.
        const now = Date.now();
        const flick = 0.85 + 0.15 * Math.sin(now * 0.04);
        const jetLen = Math.min(120, this.range * 0.45) * flick;
        const jetGrad = ctx.createLinearGradient(0, 0, jetLen, 0);
        jetGrad.addColorStop(0, 'rgba(255,255,235,0.95)');
        jetGrad.addColorStop(0.4, 'rgba(255,210,140,0.7)');
        jetGrad.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = jetGrad;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.quadraticCurveTo(jetLen * 0.4, -8, jetLen, 0);
        ctx.quadraticCurveTo(jetLen * 0.4, 8, 0, 3);
        ctx.closePath();
        ctx.fill();

        // 4) Embers as bright flecks.
        for (const e of this._embers) {
            const k = e.life / e.maxLife;
            const a = (1 - k) * 0.95;
            ctx.fillStyle = `rgba(255,${200 + Math.floor(40 * (1 - k))},120,${a})`;
            ctx.beginPath();
            ctx.arc(e.x, e.y, 1.4 + (1 - k) * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class HeatLanceColumn {
    // Volumetric fire pillar built from particles. On spawn, deals AOE
    // damage and starts emitting fire puffs upward, smoke plumes drifting
    // up-and-sideways, and bright embers. After peakDuration ends, the
    // emitter ramps down and the residual burn patch keeps ticking
    // damage on anyone standing in it. Visuals fade with the residual.
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 64;
        this.peakHeight = 220;
        this.spawnAt = Date.now();
        this.peakDuration = 380;
        this.burnDuration = 1400;
        this.shouldDestroy = false;
        this._struckPeak = false;
        this._lastBurnTick = 0;
        this.belongsTo = 'pyron';
        // Particle pools (world-space, since the column doesn't move).
        this._fire = [];
        this._smoke = [];
        this._embers = [];
        this._lastSpawnAt = 0;
        this._lastFrameAt = Date.now();
    }

    _emitterIntensity(now) {
        const age = now - this.spawnAt;
        if (age < this.peakDuration) {
            const t = age / this.peakDuration;
            if (t < 0.30) return t / 0.30;
            if (t < 0.75) return 1;
            return 1 - (t - 0.75) / 0.25 * 0.4;
        }
        // Residual: emitter mostly dies; small lapping flames remain.
        const tr = (age - this.peakDuration) / this.burnDuration;
        return Math.max(0, 0.35 * (1 - tr));
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;

        // Initial pillar hit (one-shot).
        if (!this._struckPeak) {
            this._struckPeak = true;
            const pc = _triPlayerCenter();
            if (Math.hypot(pc.x - this.x, pc.y - this.y) <= this.radius) {
                _triHitPlayer(18);
            }
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(this.x, this.y, this.radius * 1.2, '#ffb050', 280, 0.95);
                bossFX.addShockwave(this.x, this.y, this.radius * 0.4, this.radius * 1.4, '#ff6020', 360, 4, 0.7);
                bossFX.spawnBurst(this.x, this.y, 24, {
                    color: '#ffaa40', speedMin: 3, speedMax: 9,
                    sizeMin: 1.6, sizeMax: 3.4, lifeMs: 620, drag: 0.92
                });
                bossFX.addShake(4, 200);
            }
        }

        // Burn-patch tick.
        if (age >= this.peakDuration) {
            if (now - this._lastBurnTick >= 200) {
                this._lastBurnTick = now;
                const pc = _triPlayerCenter();
                if (Math.hypot(pc.x - this.x, pc.y - this.y) <= this.radius * 0.85) {
                    _triHitPlayer(2);
                }
            }
        }

        if (age >= this.peakDuration + this.burnDuration) {
            this.shouldDestroy = true;
            return;
        }

        // Particle simulation.
        let dt = (now - this._lastFrameAt) / 1000;
        if (dt > 0.05) dt = 0.05;
        this._lastFrameAt = now;

        const intensity = this._emitterIntensity(now);

        // Spawn rate scales with intensity. We spawn in bursts every
        // ~16ms at full power.
        if (intensity > 0.05 && now - this._lastSpawnAt >= 16 / Math.max(0.2, intensity)) {
            this._lastSpawnAt = now;
            const fireBurst = 2 + Math.floor(intensity * 3);
            for (let i = 0; i < fireBurst; i++) {
                const ox = (Math.random() - 0.5) * this.radius * 1.4;
                // Bias spawns toward the center for a tighter core.
                const cx = this.x + ox * (0.4 + Math.random() * 0.6);
                this._fire.push({
                    x: cx,
                    y: this.y + (Math.random() - 0.5) * 4,
                    vx: (Math.random() - 0.5) * 25,
                    vy: -(160 + Math.random() * 180),    // px/s up
                    r0: 8 + Math.random() * 8,
                    grow: 50 + Math.random() * 40,
                    life: 0,
                    maxLife: 0.45 + Math.random() * 0.30,
                    seed: Math.random() * 1000,
                });
            }
            // Smoke (slower, larger, darker, drifts to one side).
            if (Math.random() < 0.85) {
                const sx = this.x + (Math.random() - 0.5) * this.radius * 0.9;
                this._smoke.push({
                    x: sx,
                    y: this.y - 10 - Math.random() * 30,
                    vx: (Math.random() - 0.5) * 35,
                    vy: -(70 + Math.random() * 60),
                    r0: 12 + Math.random() * 8,
                    grow: 65 + Math.random() * 30,
                    life: 0,
                    maxLife: 0.95 + Math.random() * 0.55,
                    seed: Math.random() * 1000,
                });
            }
            // Embers (very fast, short).
            if (Math.random() < 0.95 * intensity) {
                const ex = this.x + (Math.random() - 0.5) * this.radius;
                this._embers.push({
                    x: ex,
                    y: this.y,
                    vx: (Math.random() - 0.5) * 90,
                    vy: -(260 + Math.random() * 200),
                    life: 0,
                    maxLife: 0.30 + Math.random() * 0.30,
                    seed: Math.random() * 1000,
                });
            }
        }

        const stepArr = (arr, sideTurb) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const p = arr[i];
                p.life += dt;
                if (p.life >= p.maxLife) { arr.splice(i, 1); continue; }
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (sideTurb) p.vx += Math.sin(p.seed + p.life * 7) * sideTurb * dt;
                p.vy *= 0.992;
                p.vx *= 0.985;
            }
        };
        stepArr(this._fire, 80);
        stepArr(this._smoke, 60);
        stepArr(this._embers, 50);

        if (this._fire.length > 260) this._fire.splice(0, this._fire.length - 260);
        if (this._smoke.length > 150) this._smoke.splice(0, this._smoke.length - 150);
        if (this._embers.length > 120) this._embers.splice(0, this._embers.length - 120);
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        const inResidual = age >= this.peakDuration;
        const fadeRes = inResidual
            ? Math.max(0, 1 - (age - this.peakDuration) / this.burnDuration)
            : 1;
        ctx.save();

        // Smoke under everything.
        for (const s of this._smoke) {
            const k = s.life / s.maxLife;
            const r = s.r0 + s.grow * s.life;
            const a = (1 - k) * 0.28 * fadeRes;
            const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
            grad.addColorStop(0, `rgba(35,28,26,${a})`);
            grad.addColorStop(1, 'rgba(35,28,26,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        }

        // Ground glow & burn patch (additive).
        ctx.globalCompositeOperation = 'lighter';
        const groundR = this.radius * (inResidual ? 0.95 : 1.15);
        const groundA = inResidual ? 0.55 * fadeRes : 0.95;
        const groundGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, groundR);
        groundGrad.addColorStop(0, `rgba(255,200,120,${groundA})`);
        groundGrad.addColorStop(0.55, `rgba(255,90,30,${groundA * 0.7})`);
        groundGrad.addColorStop(1, 'rgba(80,10,0,0)');
        ctx.fillStyle = groundGrad;
        ctx.beginPath(); ctx.arc(this.x, this.y, groundR, 0, Math.PI * 2); ctx.fill();

        // Fire body.
        for (const p of this._fire) {
            const k = p.life / p.maxLife;
            const r = p.r0 + p.grow * p.life;
            const aOuter = (1 - k) * 0.55 * fadeRes;
            const aInner = (1 - k) * (1 - k) * 0.85 * fadeRes;
            const og = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            og.addColorStop(0, `rgba(255,150,50,${aOuter})`);
            og.addColorStop(0.55, `rgba(220,60,15,${aOuter * 0.6})`);
            og.addColorStop(1, 'rgba(60,10,0,0)');
            ctx.fillStyle = og;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            if (k < 0.55) {
                const ir = r * 0.55;
                const ig = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, ir);
                ig.addColorStop(0, `rgba(255,255,210,${aInner})`);
                ig.addColorStop(0.6, `rgba(255,200,120,${aInner * 0.6})`);
                ig.addColorStop(1, 'rgba(255,120,40,0)');
                ctx.fillStyle = ig;
                ctx.beginPath(); ctx.arc(p.x, p.y, ir, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Embers as bright flecks.
        for (const e of this._embers) {
            const k = e.life / e.maxLife;
            const a = (1 - k) * 0.95 * fadeRes;
            ctx.fillStyle = `rgba(255,${200 + Math.floor(40 * (1 - k))},120,${a})`;
            ctx.beginPath();
            ctx.arc(e.x, e.y, 1.3 + (1 - k) * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

class Pyron extends GameObject {
    constructor(x, y, parent) {
        super(x, y, 36, 36, '#ff6030');
        this.parent = parent;
        this.maxHealth = TRI.SUBHP;
        this.health = this.maxHealth;
        this.isBoss = true;
        this.isTriMember = true;
        this.memberId = 'pyron';
        this.notTargetable = false;
        this.shouldDestroy = false;

        this.idealDistance = 250;
        this.facingAngle = 0;

        // Move CDs
        this._heatLanceCdUntil = 0;
        this._heatLanceCd = 2200;
        this._heatLanceTelegraphMs = 350;
        this._heatLanceWindupAt = 0;
        this._heatLanceTargetX = 0;
        this._heatLanceTargetY = 0;

        // Flamethrower sweep state.
        this._flameCdUntil = Date.now() + 4500;   // first sweep ~4.5s in
        this._flameCd = 8000;
        this._flameSweep = null;                  // active FlameSweep ref
        this._flameAimAngle = 0;                  // tracks player slowly

        // Hit indicators (matches other bosses' takeDamage path).
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;
    }

    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function')
            ? applyOverdriveBoost(damage, source) : damage;
        this.health -= damage;
        this.hitIndicators.push({
            damage: Math.round(damage),
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
            y: this.y - 10,
            startTime: Date.now()
        });
        if (this.health <= 0 && !this.shouldDestroy) {
            this.shouldDestroy = true;
            this._onDeathFx();
            return true;
        }
        _triHitSidestep(this, 8);
        return false;
    }

    _onDeathFx() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined' && typeof bossFX.spawnSubKillExplosion === 'function') {
            bossFX.spawnSubKillExplosion(cx, cy, {
                scale: 1.0,
                color: '#ff8030', // fire-tinted
                shake: 11,
                shakeMs: 260,
            });
        }
        // Death rattle: scorched earth where Pyron fell — burns + DoT.
        _triProjArr().push(new PyronScorchedEarth(cx, cy, {
            radius: 240,
            duration: 5000,
            dps: 8,
            tickInterval: 1000,
        }));
    }

    update() {
        if (this.shouldDestroy) return;
        const now = Date.now();
        const pc = _triPlayerCenter();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.facingAngle = Math.atan2(pc.y - cy, pc.x - cx);

        // Flamethrower active: keep slow lateral strafe so Pyron doesn't
        // sit still and become a free target. Aim still tracks the
        // player gently so the cone visibly chases without snapping.
        const flameActive = this._flameSweep && !this._flameSweep.shouldDestroy;
        if (flameActive) {
            const desired = Math.atan2(pc.y - cy, pc.x - cx);
            let diff = desired - this._flameAimAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this._flameAimAngle += diff * 0.045;
            // Strafe perpendicular to the player so we keep moving while
            // the cone tracks (Pyron stays roughly in firing range).
            const lateral = this.facingAngle + Math.PI / 2;
            const strafe = Math.sin(now * 0.0018) * 1.4;
            this.x += Math.cos(lateral) * strafe;
            this.y += Math.sin(lateral) * strafe;
            // Mild range maintenance during the sweep.
            const dActive = _triDistToPlayer(this);
            if (dActive > 360) {
                this.x += Math.cos(this.facingAngle) * 0.6;
                this.y += Math.sin(this.facingAngle) * 0.6;
            } else if (dActive < 200) {
                this.x -= Math.cos(this.facingAngle) * 0.8;
                this.y -= Math.sin(this.facingAngle) * 0.8;
            }
        } else {
            // Maintain idealDistance: slow drift towards desired ring.
            const dist = _triDistToPlayer(this);
            const driftSpeed = 1.4;
            const wantClose = dist > this.idealDistance + 40;
            const wantFar = dist < this.idealDistance - 40;
            if (wantClose) {
                this.x += Math.cos(this.facingAngle) * driftSpeed;
                this.y += Math.sin(this.facingAngle) * driftSpeed;
            } else if (wantFar) {
                this.x -= Math.cos(this.facingAngle) * driftSpeed;
                this.y -= Math.sin(this.facingAngle) * driftSpeed;
            } else {
                // Lateral strafe to avoid being a stationary target.
                const lateral = this.facingAngle + Math.PI / 2;
                const strafe = Math.sin(now * 0.0014) * 1.7
                    + Math.sin(now * 0.0033 + 1.3) * 0.7;
                this.x += Math.cos(lateral) * strafe;
                this.y += Math.sin(lateral) * strafe;
                // Mild forward/back jitter so distance isn't a fixed ring.
                const radial = Math.sin(now * 0.0021 + 0.6) * 0.45;
                this.x += Math.cos(this.facingAngle) * radial;
                this.y += Math.sin(this.facingAngle) * radial;
            }
        }

        _triApplySeparation(this);
        _triClampToArena(this);

        // Heat-lance state machine: idle -> wind-up -> fire.
        if (this._heatLanceWindupAt) {
            // During wind-up Pyron stays nearly still and tracks the player
            // for the first half (then locks).
            const elapsed = now - this._heatLanceWindupAt;
            if (elapsed < this._heatLanceTelegraphMs * 0.55) {
                this._heatLanceTargetX = pc.x;
                this._heatLanceTargetY = pc.y;
            }
            if (elapsed >= this._heatLanceTelegraphMs) {
                this._fireHeatLance();
                this._heatLanceWindupAt = 0;
                this._heatLanceCdUntil = now + this._heatLanceCd;
            }
        } else if (!flameActive && now >= this._heatLanceCdUntil) {
            // Begin wind-up when the player is in a reasonable range.
            const dist = _triDistToPlayer(this);
            if (dist <= 520) {
                this._heatLanceWindupAt = now;
                this._heatLanceTargetX = pc.x;
                this._heatLanceTargetY = pc.y;
                if (typeof bossFX !== 'undefined') {
                    bossFX.addFlash(cx, cy, 28, '#ffd070', 220, 0.7);
                }
            }
        }

        // Flamethrower sweep scheduling.
        if (!flameActive && !this._heatLanceWindupAt && now >= this._flameCdUntil) {
            const dist = _triDistToPlayer(this);
            if (dist <= 660) {
                this._startFlameSweep();
                this._flameCdUntil = now + this._flameCd;
            } else {
                this._flameCdUntil = now + 600;
            }
        }
    }

    _startFlameSweep() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const pc = _triPlayerCenter();
        // Seed aim angle at current direction to player.
        this._flameAimAngle = Math.atan2(pc.y - cy, pc.x - cx);
        // Origin lives at the nozzle tip ~24px out from body center; we
        // resolve it lazily in the closures so it follows Pyron if she
        // gets nudged by post-spawn logic (boundary clamps etc.).
        const sweep = new FlameSweep({
            duration: 1800,
            range: 630,
            coneHalfAngle: Math.PI / 5.5,    // ~33° total cone
            tickDamage: 4,
            tickInterval: 110,
            getOrigin: () => {
                const ox = this.x + this.width / 2;
                const oy = this.y + this.height / 2;
                return {
                    x: ox + Math.cos(this._flameAimAngle) * 24,
                    y: oy + Math.sin(this._flameAimAngle) * 24,
                };
            },
            getAimAngle: () => this._flameAimAngle,
        });
        this._flameSweep = sweep;
        _triProjArr().push(sweep);
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 36, '#ffaa50', 240, 0.9);
            bossFX.addShake(2, 200);
        }
    }

    _fireHeatLance() {
        const tx = this._heatLanceTargetX;
        const ty = this._heatLanceTargetY;
        _triProjArr().push(new HeatLanceColumn(tx, ty));
    }

    draw(ctx) {
        if (this.shouldDestroy) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        // Telegraph for heat lance: red crosshair at lock target.
        if (this._heatLanceWindupAt) {
            const t = (now - this._heatLanceWindupAt) / this._heatLanceTelegraphMs;
            const tx = this._heatLanceTargetX;
            const ty = this._heatLanceTargetY;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const r = 48 + Math.sin(now * 0.04) * 2;
            const a = 0.3 + 0.5 * t;
            ctx.strokeStyle = `rgba(255,80,40,${a})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tx, ty, r, 0, Math.PI * 2);
            ctx.stroke();
            // Cross
            ctx.beginPath();
            ctx.moveTo(tx - r, ty); ctx.lineTo(tx + r, ty);
            ctx.moveTo(tx, ty - r); ctx.lineTo(tx, ty + r);
            ctx.stroke();
            // Charging beam from Pyron to the target
            const beamA = 0.25 + 0.5 * t;
            ctx.strokeStyle = `rgba(255,160,60,${beamA})`;
            ctx.lineWidth = 1.5 + 1.5 * t;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.restore();
        }

        // Body: hexagonal fire-mech silhouette.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facingAngle);
        // Outer aura
        ctx.globalCompositeOperation = 'lighter';
        const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 38);
        auraGrad.addColorStop(0, 'rgba(255,180,80,0.45)');
        auraGrad.addColorStop(1, 'rgba(255,40,0,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // Hex body
        ctx.fillStyle = '#3a1810';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const rx = Math.cos(a) * 18, ry = Math.sin(a) * 18;
            if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ff6020'; ctx.lineWidth = 2; ctx.stroke();
        // Cannon nozzle pointing forward
        ctx.fillStyle = '#1a0805';
        ctx.fillRect(8, -4, 16, 8);
        ctx.strokeStyle = '#ffaa50'; ctx.lineWidth = 1.5;
        ctx.strokeRect(8, -4, 16, 8);
        // Hot core
        ctx.globalCompositeOperation = 'lighter';
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
        coreGrad.addColorStop(0, 'rgba(255,240,180,0.95)');
        coreGrad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        this._drawHitIndicators(ctx);
    }

    _drawHitIndicators(ctx) {
        const now = Date.now();
        for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
            const h = this.hitIndicators[i];
            const age = now - h.startTime;
            if (age > this.hitIndicatorDuration) {
                this.hitIndicators.splice(i, 1);
                continue;
            }
            const t = age / this.hitIndicatorDuration;
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#ffd070';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`-${h.damage}`, h.x, h.y - t * 18);
            ctx.restore();
        }
    }
}

// ---------------------------------------------------------------
// 3. Volthar — lightning elemental
// ---------------------------------------------------------------
// Long-range zoner.
//   - Magnet Strike: periodic lightning bolts spawn near the player,
//     slightly bend toward them, 0.3s stun on hit.
//   - Iron Spike Ritual: drops a wave of iron poles across the arena,
//     1.5s later each pole conducts a vertical bolt with a heavy AOE
//     (20 dmg + 0.3s stun) at the pole's position.

class IronSpike {
    // Falls onto (x, y) with a short impact warning, then sits idle for
    // `armingMs`. When it arms, if the player is within aoeRadius the
    // spike fires a chain of jagged lightning bolts directly at the
    // player, dealing damage and applying a stun. If the player is not
    // in range nothing strikes (the spike just discharges harmlessly).
    constructor(x, y, armingMs) {
        this.x = x;
        this.y = y;
        this.spawnAt = Date.now();
        this.dropMs = 380;
        this.armingMs = armingMs || 1500;
        this.aoeRadius = 200;     // detection radius (was 95)
        this.damage = 22;
        this.stunMs = 700;
        this._lit = false;
        this._strikeAt = 0;
        this._strike = null;      // { sx, sy, tx, ty, segs:[...] } once lit
        this.shouldDestroy = false;
        this.belongsTo = 'volthar';
    }

    // Build a jittered polyline from (sx,sy) to (tx,ty) representing
    // the main lightning trunk. Side branches are computed separately
    // by the draw routine using the same trunk points as anchors.
    _buildBoltSegments(sx, sy, tx, ty) {
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy);
        const nx = -dy / Math.max(len, 0.001);
        const ny = dx / Math.max(len, 0.001);
        const steps = Math.max(8, Math.floor(len / 18));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Jitter amplitude: small near endpoints, big near middle.
            const taper = Math.sin(Math.PI * t);
            const jitter = (Math.random() - 0.5) * 22 * taper;
            pts.push({
                x: sx + dx * t + nx * jitter,
                y: sy + dy * t + ny * jitter,
            });
        }
        return pts;
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (!this._lit && age >= this.dropMs + this.armingMs) {
            this._lit = true;
            this._strikeAt = now;
            // Only fire if the player is inside the spike's range.
            const pc = _triPlayerCenter();
            const dist = Math.hypot(pc.x - this.x, pc.y - this.y);
            if (dist <= this.aoeRadius && game.player && !game.player.isUntargetable) {
                const sx = this.x;
                const sy = this.y - 30;       // tip of the spike
                const tx = pc.x;
                const ty = pc.y;
                this._strike = {
                    sx, sy, tx, ty,
                    main: this._buildBoltSegments(sx, sy, tx, ty),
                };
                _triHitPlayer(this.damage);
                _triStunPlayer(this.stunMs);
                if (typeof bossFX !== 'undefined') {
                    bossFX.addFlash(tx, ty, 60, '#e0c0ff', 220, 1.0);
                    bossFX.addShockwave(tx, ty, 8, 60, '#a070ff', 320, 3, 0.85);
                    bossFX.addFlash(sx, sy, 36, '#e0c0ff', 200, 0.9);
                    bossFX.spawnBurst(tx, ty, 20, {
                        color: '#d0b0ff', speedMin: 2, speedMax: 7,
                        sizeMin: 1.4, sizeMax: 3, lifeMs: 420, drag: 0.9
                    });
                    bossFX.addShake(5, 220);
                }
            } else if (typeof bossFX !== 'undefined') {
                // Player outside range: small fizzle FX from the spike tip.
                bossFX.addFlash(this.x, this.y - 30, 22, '#d0b0ff', 180, 0.6);
            }
        }
        if (this._lit && now - this._strikeAt > 280) {
            this.shouldDestroy = true;
        }
    }

    // Render a mecha-tech lightning pylon at (bx, by). `charge` (0..1)
    // controls the brightness of the central energy core, the warning
    // light pulse and the tip arc. `alpha` (0..1) is a global alpha
    // applied to the chassis silhouette (used during the falling drop
    // so the pylon can blink/strobe in).
    _drawPylon(ctx, bx, by, charge, alpha) {
        const now = Date.now();
        ctx.save();
        ctx.translate(bx, by);

        // ----- 1) Ground tripod base (3 buttress legs forming a tri pad) -----
        // Drawn first under the shaft, in body-local coords (y- = up).
        const padR = 18;            // outer radius of the tri pad
        const legPts = [
            { ax:  Math.cos(-Math.PI / 2)            * padR, ay: Math.sin(-Math.PI / 2)            * padR },
            { ax:  Math.cos( Math.PI * 0.5 + 2.094)  * padR, ay: Math.sin( Math.PI * 0.5 + 2.094)  * padR },
            { ax:  Math.cos( Math.PI * 0.5 - 2.094)  * padR, ay: Math.sin( Math.PI * 0.5 - 2.094)  * padR },
        ];
        ctx.globalAlpha = alpha;
        // Pad plate.
        ctx.fillStyle = '#1f1a26';
        ctx.beginPath();
        ctx.moveTo(legPts[0].ax, legPts[0].ay * 0.45);
        ctx.lineTo(legPts[1].ax, legPts[1].ay * 0.45);
        ctx.lineTo(legPts[2].ax, legPts[2].ay * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5a3f7a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Bolt heads at corners.
        ctx.fillStyle = '#7a5cb0';
        for (const p of legPts) {
            ctx.beginPath();
            ctx.arc(p.ax * 0.85, p.ay * 0.85 * 0.45, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // ----- 2) Main shaft: tapered hex prism, 36 px tall -----
        const H = 36;                // total shaft height
        const wBase = 7;             // half-width at base
        const wTop = 4;              // half-width at top
        // Outer chassis silhouette.
        const grdShaft = ctx.createLinearGradient(-wBase, 0, wBase, 0);
        grdShaft.addColorStop(0,    '#2a2330');
        grdShaft.addColorStop(0.45, '#403a55');
        grdShaft.addColorStop(0.55, '#403a55');
        grdShaft.addColorStop(1,    '#1d1828');
        ctx.fillStyle = grdShaft;
        ctx.beginPath();
        ctx.moveTo(-wBase, 0);
        ctx.lineTo(-wTop,  -H);
        ctx.lineTo( wTop,  -H);
        ctx.lineTo( wBase, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#6b4ea0';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Side panel rivets / paneling lines.
        ctx.strokeStyle = 'rgba(120,90,170,0.55)';
        ctx.lineWidth = 0.8;
        for (let i = 1; i <= 3; i++) {
            const t = i / 4;
            const lY = -H * t;
            const lW = wBase * (1 - t) + wTop * t - 1;
            ctx.beginPath();
            ctx.moveTo(-lW, lY); ctx.lineTo(lW, lY);
            ctx.stroke();
        }
        ctx.fillStyle = '#8a6cd0';
        for (let i = 1; i <= 4; i++) {
            const t = i / 5;
            const lY = -H * t;
            const lW = wBase * (1 - t) + wTop * t - 1.4;
            ctx.beginPath();
            ctx.arc(-lW, lY, 0.7, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath();
            ctx.arc( lW, lY, 0.7, 0, Math.PI * 2); ctx.fill();
        }

        // ----- 3) Central energy conduit (running up the spine) -----
        // The conduit is a vertical bar that brightens with `charge`.
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(-1.6, -H + 4, 3.2, H - 6);
        ctx.globalCompositeOperation = 'lighter';
        const conduitFlick = 0.6 + 0.4 * Math.sin(now * 0.012 + this.x * 0.07);
        const conduitA = (0.35 + 0.65 * charge) * conduitFlick * alpha;
        const conduitGrd = ctx.createLinearGradient(0, -H + 4, 0, -2);
        conduitGrd.addColorStop(0,    `rgba(220,180,255,${conduitA})`);
        conduitGrd.addColorStop(0.5,  `rgba(160,100,255,${conduitA * 0.9})`);
        conduitGrd.addColorStop(1,    `rgba(80, 30,160,${conduitA * 0.4})`);
        ctx.fillStyle = conduitGrd;
        ctx.fillRect(-1.4, -H + 4, 2.8, H - 6);
        // Travelling charge bead.
        const beadT = ((now * 0.0008 + this.x * 0.011) % 1);
        const beadY = -H + 4 + (H - 6) * (1 - beadT);
        const beadG = ctx.createRadialGradient(0, beadY, 0, 0, beadY, 6);
        beadG.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
        beadG.addColorStop(1, 'rgba(180,120,255,0)');
        ctx.fillStyle = beadG;
        ctx.beginPath(); ctx.arc(0, beadY, 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // ----- 4) Warning lamp ring near the base -----
        const lamps = 6;
        for (let i = 0; i < lamps; i++) {
            const lx = ((i / lamps) - 0.5) * (wBase * 1.6);
            const ly = -3.5;
            const phase = (now * 0.006 + i * 0.7) % (Math.PI * 2);
            const lit = 0.5 + 0.5 * Math.sin(phase);
            const lampA = (0.25 + 0.75 * lit) * alpha;
            ctx.fillStyle = `rgba(255,90,140,${lampA})`;
            ctx.beginPath(); ctx.arc(lx, ly, 0.8, 0, Math.PI * 2); ctx.fill();
        }

        // ----- 5) Mid collar -----
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#332842';
        ctx.fillRect(-wBase * 0.95, -H * 0.5 - 2, wBase * 1.9, 4);
        ctx.strokeStyle = '#7a5cb0';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-wBase * 0.95, -H * 0.5 - 2, wBase * 1.9, 4);
        ctx.fillStyle = `rgba(220,180,255,${0.5 * charge * alpha})`;
        ctx.fillRect(-wBase * 0.85, -H * 0.5 - 1, wBase * 1.7, 2);

        // ----- 6) Antenna fins + arc tip -----
        // Two angled fin antennas at the very top, then a finned tip
        // emitter that sparks proportionally to `charge`.
        ctx.fillStyle = '#332842';
        ctx.strokeStyle = '#8a6cd0';
        ctx.lineWidth = 1;
        // Left fin.
        ctx.beginPath();
        ctx.moveTo(-wTop, -H);
        ctx.lineTo(-wTop - 4, -H - 6);
        ctx.lineTo(-wTop, -H - 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Right fin.
        ctx.beginPath();
        ctx.moveTo(wTop, -H);
        ctx.lineTo(wTop + 4, -H - 6);
        ctx.lineTo(wTop, -H - 4);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Tip emitter (small diamond).
        ctx.fillStyle = '#1f1a26';
        ctx.beginPath();
        ctx.moveTo(0, -H - 10);
        ctx.lineTo(2.2, -H - 4);
        ctx.lineTo(0,  -H - 1);
        ctx.lineTo(-2.2, -H - 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b890ff';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Tip arc glow.
        ctx.globalCompositeOperation = 'lighter';
        const tipGlow = (0.35 + 0.65 * charge) * (0.7 + 0.3 * Math.sin(now * 0.04 + this.x)) * alpha;
        const tipG = ctx.createRadialGradient(0, -H - 5, 0, 0, -H - 5, 14 + 8 * charge);
        tipG.addColorStop(0, `rgba(255,255,255,${tipGlow})`);
        tipG.addColorStop(0.5, `rgba(180,120,255,${tipGlow * 0.5})`);
        tipG.addColorStop(1, 'rgba(80,30,160,0)');
        ctx.fillStyle = tipG;
        ctx.beginPath(); ctx.arc(0, -H - 5, 14 + 8 * charge, 0, Math.PI * 2); ctx.fill();

        // Random arc filaments dancing between the two fins when charged.
        if (charge > 0.4 && Math.random() < 0.55 * charge) {
            ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            const ax = -wTop - 4 + Math.random() * 1.5;
            const ay = -H - 6 + Math.random() * 2;
            const bx2 =  wTop + 4 - Math.random() * 1.5;
            const by2 = -H - 6 + Math.random() * 2;
            ctx.moveTo(ax, ay);
            const segs = 4;
            for (let i = 1; i < segs; i++) {
                const t = i / segs;
                const px = ax + (bx2 - ax) * t + (Math.random() - 0.5) * 4;
                const py = ay + (by2 - ay) * t + (Math.random() - 0.5) * 4;
                ctx.lineTo(px, py);
            }
            ctx.lineTo(bx2, by2);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';

        ctx.restore();
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        ctx.save();
        if (age < this.dropMs) {
            // Falling phase: pylon plummets in from above with a growing
            // ground shadow + impact-warning ring at the landing spot.
            const t = age / this.dropMs;
            // Landing reticle.
            ctx.strokeStyle = `rgba(220,150,255,${0.25 + 0.55 * t})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, 18 + 6 * Math.sin(now * 0.02), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // Soft ground shadow that contracts as the pylon descends.
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + 4, 16 * (0.4 + 0.6 * t), 5 * (0.4 + 0.6 * t), 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            // Pylon descending from off-screen above.
            const fallY = this.y - (1 - t) * 220;
            this._drawPylon(ctx, this.x, fallY, 0.15, 1);
        } else if (!this._lit) {
            // Planted, charging. Pylon's charge ramps with arming time.
            const armT = Math.min(1, (age - this.dropMs) / this.armingMs);
            this._drawPylon(ctx, this.x, this.y, 0.2 + 0.8 * armT, 1);

            // Detection ring on the ground (uses real aoeRadius).
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(180,140,255,${0.18 + 0.45 * armT})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.aoeRadius * (0.55 + 0.45 * armT), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            // Inner kill-zone hint.
            if (armT > 0.6) {
                ctx.strokeStyle = `rgba(220,180,255,${(armT - 0.6) * 1.5})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.aoeRadius * 0.85, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
        } else {
            // Lit: pylon at max charge, then quickly dims out as the
            // bolt discharges through the player.
            const t = Math.min(1, (now - this._strikeAt) / 280);
            const fade = 1 - t;
            this._drawPylon(ctx, this.x, this.y, fade, 1);

            ctx.globalCompositeOperation = 'lighter';
            // Discharge halo at the spike tip (top of the pylon).
            const tipX = this.x, tipY = this.y - 36 - 5;
            const tipGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 32);
            tipGrad.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`);
            tipGrad.addColorStop(1, 'rgba(160,80,255,0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath(); ctx.arc(tipX, tipY, 32, 0, Math.PI * 2); ctx.fill();
        } /* else (lit + had a strike) handled below */
        ctx.restore();

        // Lit phase: bolts/branches/impact flash on top of the pylon.
        if (this._lit) {
            const t = Math.min(1, (now - this._strikeAt) / 280);
            const fade = 1 - t;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (this._strike) {
                const s = this._strike;
                // Trunk: outer purple glow.
                ctx.strokeStyle = `rgba(180,120,255,${0.85 * fade})`;
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(s.main[0].x, s.main[0].y);
                for (let i = 1; i < s.main.length; i++) ctx.lineTo(s.main[i].x, s.main[i].y);
                ctx.stroke();
                // Trunk: bright white core.
                ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(s.main[0].x, s.main[0].y);
                for (let i = 1; i < s.main.length; i++) ctx.lineTo(s.main[i].x, s.main[i].y);
                ctx.stroke();
                // Side forks: short jittered branches springing off the trunk.
                ctx.strokeStyle = `rgba(200,160,255,${0.7 * fade})`;
                ctx.lineWidth = 1.5;
                for (let i = 1; i < s.main.length - 1; i += 2) {
                    if (Math.random() < 0.55) {
                        const a = s.main[i];
                        const b = s.main[i + 1];
                        const ang = Math.atan2(b.y - a.y, b.x - a.x);
                        const branchAng = ang + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
                        const branchLen = 14 + Math.random() * 22;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        const bx = a.x + Math.cos(branchAng) * branchLen;
                        const by = a.y + Math.sin(branchAng) * branchLen;
                        const mx = (a.x + bx) / 2 + (Math.random() - 0.5) * 6;
                        const my = (a.y + by) / 2 + (Math.random() - 0.5) * 6;
                        ctx.lineTo(mx, my); ctx.lineTo(bx, by);
                        ctx.stroke();
                    }
                }
                // Impact flash at the player end.
                const ig = ctx.createRadialGradient(s.tx, s.ty, 0, s.tx, s.ty, 36);
                ig.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
                ig.addColorStop(0.5, `rgba(200,160,255,${0.55 * fade})`);
                ig.addColorStop(1, 'rgba(80,30,160,0)');
                ctx.fillStyle = ig;
                ctx.beginPath(); ctx.arc(s.tx, s.ty, 36, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }
}

class LightningStrike {
    // Lightning bolt that snakes out from Volthar's body and crawls
    // toward (anchorX, anchorY). During the telegraph the impact point
    // homes onto the player by `magnetism` (lerp toward the player), so
    // the bolt visibly bends mid-flight to chase a moving target.
    // On lock-in: AOE flash + 12 dmg + 0.3s stun if player is in radius.
    constructor(anchorX, anchorY, opts) {
        opts = opts || {};
        this.x = anchorX;
        this.y = anchorY;
        this.spawnAt = Date.now();
        this.telegraphMs = opts.telegraphMs || 220;
        this.flashDuration = 240;
        this.aoeRadius = opts.radius || 36;
        this.damage = (opts.damage != null) ? opts.damage : 12;
        this.stunMs = (opts.stunMs != null) ? opts.stunMs : 300;
        this.magnetism = (opts.magnetism != null) ? opts.magnetism : 0.45;
        // Source: where the bolt leaves Volthar from. Defaults to the
        // current Volthar center if a Triumvirate boss is on the field.
        this.sourceX = (opts.sourceX != null) ? opts.sourceX : this.x;
        this.sourceY = (opts.sourceY != null) ? opts.sourceY : this.y;
        this._struck = false;
        this.shouldDestroy = false;
        this.belongsTo = 'volthar';
        // Pre-rolled jitter seeds so the snake path is consistent
        // frame-to-frame (only the head extends, the body doesn't reroll).
        this._segCount = 14;
        this._jitterSeeds = [];
        for (let i = 0; i < this._segCount; i++) {
            this._jitterSeeds.push(Math.random() * Math.PI * 2);
        }
        this._strikeSegments = null;
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;

        // Pre-strike: drift toward the player so the bolt visibly
        // re-aims while it crawls out.
        if (age < this.telegraphMs) {
            const pc = _triPlayerCenter();
            this.x += (pc.x - this.x) * this.magnetism * 0.18;
            this.y += (pc.y - this.y) * this.magnetism * 0.18;
            return;
        }

        if (!this._struck) {
            this._struck = true;
            this._strikeSegments = this._buildSnakeSegments(1.0, 18);
            const pc = _triPlayerCenter();
            if (Math.hypot(pc.x - this.x, pc.y - this.y) <= this.aoeRadius) {
                _triHitPlayer(this.damage);
                _triStunPlayer(this.stunMs);
            }
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(this.x, this.y, this.aoeRadius * 1.6, '#c0a0ff', 240, 0.95);
                bossFX.addShockwave(this.x, this.y, this.aoeRadius * 0.3, this.aoeRadius * 1.4, '#a070ff', 320, 3, 0.7);
                bossFX.spawnBurst(this.x, this.y, 16, {
                    color: '#d0b0ff', speedMin: 2, speedMax: 6,
                    sizeMin: 1.5, sizeMax: 3, lifeMs: 380, drag: 0.92
                });
                bossFX.addShake(2, 130);
            }
        }

        if (age >= this.telegraphMs + this.flashDuration) {
            this.shouldDestroy = true;
        }
    }

    // Builds a jagged snake from (sourceX, sourceY) toward (this.x, this.y).
    // `growth` is 0..1 — controls how far along the path the bolt has
    // extended. `jitter` is the lateral noise amplitude (perpendicular to
    // the source->target direction). Pre-rolled seeds keep the body shape
    // stable across frames; only the head advances.
    _buildSnakeSegments(growth, jitter) {
        const segs = [];
        const sx = this.sourceX, sy = this.sourceY;
        const tx = this.x, ty = this.y;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        const nx = -dy / len, ny = dx / len;          // perpendicular unit
        const steps = this._segCount;
        const reach = Math.max(1, Math.floor(steps * Math.max(0, Math.min(1, growth))));
        let prev = { x: sx, y: sy };
        for (let i = 1; i <= reach; i++) {
            const u = i / steps;
            // Taper jitter at both ends so it looks anchored at source
            // and impact point rather than wobbling off the spot.
            const taper = Math.sin(u * Math.PI);
            const j = (Math.sin(this._jitterSeeds[i - 1] * 1.3) + Math.sin(this._jitterSeeds[i - 1] * 2.7) * 0.5) * jitter * taper;
            const pt = {
                x: sx + dx * u + nx * j,
                y: sy + dy * u + ny * j,
            };
            segs.push({ x1: prev.x, y1: prev.y, x2: pt.x, y2: pt.y });
            prev = pt;
        }
        return segs;
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        ctx.save();
        if (age < this.telegraphMs) {
            // Pre-strike: snake crawls out from Volthar toward the
            // (still-homing) target point. Growth ramps 0->1 across the
            // telegraph so the head visibly hunts the player.
            const t = age / this.telegraphMs;
            // Snap to the latest target while building (head leads the
            // homing tip), shorten body until ~80% to dramatize lock-on.
            const growth = Math.min(1, t / 0.8);
            const segs = this._buildSnakeSegments(growth, 22);

            ctx.globalCompositeOperation = 'lighter';
            // Outer glow strand
            ctx.strokeStyle = `rgba(180,140,255,${0.55 + 0.3 * t})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            for (const s of segs) {
                ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            // Inner core
            ctx.strokeStyle = `rgba(230,210,255,${0.85})`;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (const s of segs) {
                ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            // Tip flare at the leading head, pulsing as it homes.
            if (segs.length > 0) {
                const head = segs[segs.length - 1];
                const flare = 6 + 6 * Math.sin(now * 0.04);
                const tipGrad = ctx.createRadialGradient(head.x2, head.y2, 0, head.x2, head.y2, flare * 2);
                tipGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
                tipGrad.addColorStop(0.5, 'rgba(200,160,255,0.6)');
                tipGrad.addColorStop(1, 'rgba(80,40,160,0)');
                ctx.fillStyle = tipGrad;
                ctx.beginPath();
                ctx.arc(head.x2, head.y2, flare * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            // Subtle ground impact ring as the head closes.
            if (t > 0.6) {
                const a = (t - 0.6) / 0.4;
                ctx.strokeStyle = `rgba(180,140,255,${0.3 + 0.5 * a})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.aoeRadius * (0.7 + 0.3 * a), 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (this._strikeSegments) {
            // Lock-in flash: bright bolt + radial bloom.
            const t = (age - this.telegraphMs) / this.flashDuration;
            const fade = 1 - t;
            ctx.globalCompositeOperation = 'lighter';
            // Wide glow halo along the path
            ctx.strokeStyle = `rgba(180,140,255,${0.7 * fade})`;
            ctx.lineWidth = 9;
            ctx.beginPath();
            for (const s of this._strikeSegments) {
                ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            // White-hot core
            ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (const s of this._strikeSegments) {
                ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
            }
            ctx.stroke();
            // Impact bloom
            const flashGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.aoeRadius * 1.5);
            flashGrad.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
            flashGrad.addColorStop(0.5, `rgba(180,120,255,${0.6 * fade})`);
            flashGrad.addColorStop(1, 'rgba(50,0,80,0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.aoeRadius * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

class Volthar extends GameObject {
    constructor(x, y, parent) {
        super(x, y, 36, 36, '#a070ff');
        this.parent = parent;
        this.maxHealth = TRI.SUBHP;
        this.health = this.maxHealth;
        this.isBoss = true;
        this.isTriMember = true;
        this.memberId = 'volthar';
        this.notTargetable = false;
        this.shouldDestroy = false;

        this.idealDistance = 360;
        this.facingAngle = 0;

        // Magnet strike cadence.
        this._magnetCdUntil = 0;
        this._magnetCdMin = 1300;
        this._magnetCdMax = 1900;

        // Iron Spike Ritual cadence — heavy AOE punisher.
        this._spikeCdUntil = Date.now() + 8000;   // first one ~8s in
        this._spikeCd = 14000;

        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // Bobbing offset for the floating idle look.
        this._bobPhase = Math.random() * Math.PI * 2;
    }

    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function')
            ? applyOverdriveBoost(damage, source) : damage;
        this.health -= damage;
        this.hitIndicators.push({
            damage: Math.round(damage),
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
            y: this.y - 10,
            startTime: Date.now()
        });
        if (this.health <= 0 && !this.shouldDestroy) {
            this.shouldDestroy = true;
            this._onDeathFx();
            return true;
        }
        _triHitSidestep(this, 11);
        return false;
    }

    _onDeathFx() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined' && typeof bossFX.spawnSubKillExplosion === 'function') {
            bossFX.spawnSubKillExplosion(cx, cy, {
                scale: 1.0,
                color: '#a070ff', // electric purple
                shake: 11,
                shakeMs: 260,
            });
        }
        // Death rattle: storm zone — up to 3 strikes or 7s timeout.
        _triProjArr().push(new VoltharStormZone(cx, cy, {
            radius: 240,
            duration: 7000,
            strikeCount: 3,
            strikeInterval: 1900,
            firstStrikeDelay: 900,
            strikeDamage: 18,
            strikeRadius: 80,
            stunMs: 240,
        }));
    }

    update() {
        if (this.shouldDestroy) return;
        const now = Date.now();
        const pc = _triPlayerCenter();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.facingAngle = Math.atan2(pc.y - cy, pc.x - cx);

        // Stay far. If too close, drift away faster than approach.
        const dist = _triDistToPlayer(this);
        const drift = 1.3;
        if (dist < this.idealDistance - 30) {
            this.x -= Math.cos(this.facingAngle) * drift * 1.4;
            this.y -= Math.sin(this.facingAngle) * drift * 1.4;
        } else if (dist > this.idealDistance + 60) {
            this.x += Math.cos(this.facingAngle) * drift * 0.7;
            this.y += Math.sin(this.facingAngle) * drift * 0.7;
        }
        // Lateral strafe so Volthar is harder to lead-shot.
        const vlat = this.facingAngle + Math.PI / 2;
        const vstrafe = Math.sin(now * 0.0017 + this._bobPhase) * 1.5
            + Math.sin(now * 0.0041) * 0.6;
        this.x += Math.cos(vlat) * vstrafe;
        this.y += Math.sin(vlat) * vstrafe;
        // Bob up-down for floating feel.
        this.y += Math.sin(now * 0.0025 + this._bobPhase) * 0.4;
        _triApplySeparation(this);
        _triClampToArena(this);

        // Magnet strike scheduling.
        if (now >= this._magnetCdUntil) {
            this._fireMagnetStrike();
            const interval = this._magnetCdMin + Math.random() * (this._magnetCdMax - this._magnetCdMin);
            this._magnetCdUntil = now + interval;
        }

        // Iron Spike Ritual scheduling.
        if (now >= this._spikeCdUntil) {
            this._fireSpikeRitual();
            this._spikeCdUntil = now + this._spikeCd;
        }
    }

    _fireSpikeRitual() {
        // Drop 7-9 iron spikes at random arena positions, each with a
        // staggered arming time so the AOE hits cascade rather than all
        // detonate at once. One spike is always seeded near the player
        // for a non-trivial dodge target.
        const count = 7 + Math.floor(Math.random() * 3);  // 7-9
        const pc = _triPlayerCenter();
        const margin = 80;
        for (let i = 0; i < count; i++) {
            let sx, sy;
            if (i === 0) {
                // Anchor spike near the player (offset 50-130px away).
                const ang = Math.random() * Math.PI * 2;
                const r = 50 + Math.random() * 80;
                sx = pc.x + Math.cos(ang) * r;
                sy = pc.y + Math.sin(ang) * r;
            } else {
                sx = margin + Math.random() * (GAME_CONFIG.WIDTH - margin * 2);
                sy = margin + Math.random() * (GAME_CONFIG.HEIGHT - margin * 2);
            }
            sx = Math.max(margin, Math.min(GAME_CONFIG.WIDTH - margin, sx));
            sy = Math.max(margin, Math.min(GAME_CONFIG.HEIGHT - margin, sy));
            // Stagger arming so the strikes form a sweeping cascade.
            const arming = 1300 + i * 180;
            _triProjArr().push(new IronSpike(sx, sy, arming));
        }
        if (typeof bossFX !== 'undefined') {
            bossFX.addShake(4, 360);
        }
    }

    _fireMagnetStrike() {
        const pc = _triPlayerCenter();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Drop point: random offset around the player (so bolts surround them).
        const ang = Math.random() * Math.PI * 2;
        const r = 70 + Math.random() * 110;
        const ax = pc.x + Math.cos(ang) * r;
        const ay = pc.y + Math.sin(ang) * r;
        _triProjArr().push(new LightningStrike(ax, ay, {
            telegraphMs: 220, damage: 12, stunMs: 300, magnetism: 0.45,
            sourceX: cx, sourceY: cy
        }));
    }

    draw(ctx) {
        if (this.shouldDestroy) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facingAngle);

        // Outer arc aura.
        ctx.globalCompositeOperation = 'lighter';
        const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
        auraGrad.addColorStop(0, 'rgba(180,140,255,0.45)');
        auraGrad.addColorStop(1, 'rgba(60,0,120,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Tri-prong tesla coil silhouette.
        ctx.fillStyle = '#1a0830';
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(20, 12);
        ctx.lineTo(-20, 12);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#a070ff'; ctx.lineWidth = 2; ctx.stroke();

        // Three coil tips with constant spark animation.
        ctx.globalCompositeOperation = 'lighter';
        const tips = [
            { x: 0, y: -22 }, { x: 20, y: 12 }, { x: -20, y: 12 }
        ];
        for (const tip of tips) {
            const flick = 0.6 + 0.4 * Math.sin(now * 0.025 + tip.x);
            ctx.fillStyle = `rgba(255,255,255,${0.85 * flick})`;
            ctx.beginPath(); ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(180,140,255,${0.6 * flick})`;
            ctx.beginPath(); ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2); ctx.fill();
        }
        // Crackling arcs between tips.
        ctx.strokeStyle = `rgba(220,180,255,${0.55 + 0.4 * Math.sin(now * 0.04)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < tips.length; i++) {
            const a = tips[i], b = tips[(i + 1) % tips.length];
            const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 4;
            const my = (a.y + b.y) / 2 + (Math.random() - 0.5) * 4;
            ctx.moveTo(a.x, a.y); ctx.lineTo(mx, my); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();

        this._drawHitIndicators(ctx);
    }

    _drawHitIndicators(ctx) {
        const now = Date.now();
        for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
            const h = this.hitIndicators[i];
            const age = now - h.startTime;
            if (age > this.hitIndicatorDuration) {
                this.hitIndicators.splice(i, 1);
                continue;
            }
            const t = age / this.hitIndicatorDuration;
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#d0b0ff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`-${h.damage}`, h.x, h.y - t * 18);
            ctx.restore();
        }
    }
}

// ---------------------------------------------------------------
// 4. Glacius — ice elemental
// ---------------------------------------------------------------
// Long-range zoner. Frost Bolt: weakly homing slow projectile that does
// 0 damage but applies a stacking slow on hit. (Frost Nova / ice field /
// ice spike wall come in phase 2.)

class FrostBolt {
    constructor(x, y, targetX, targetY, opts) {
        opts = opts || {};
        this.x = x;
        this.y = y;
        this.width = 12;
        this.height = 12;
        this.spawnAt = Date.now();
        this.maxLifetime = opts.maxLifetime || 4500;
        this.speed = opts.speed || 5.2;
        const dx = targetX - x, dy = targetY - y;
        const len = Math.max(0.001, Math.hypot(dx, dy));
        this.vx = (dx / len) * this.speed;
        this.vy = (dy / len) * this.speed;
        this.homingStrength = opts.homing || 0.04; // gentle weak homing
        this.slowMs = opts.slowMs || 1500;
        this.slowMul = opts.slowMul || 0.5;
        this.shouldDestroy = false;
        this._exploded = false;
        this.belongsTo = 'glacius';
    }

    update() {
        if (this.shouldDestroy) return;
        const now = Date.now();
        const age = now - this.spawnAt;

        // Weak homing toward player.
        if (game.player && !game.player.isUntargetable) {
            const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const desiredAng = Math.atan2(py - cy, px - cx);
            const curAng = Math.atan2(this.vy, this.vx);
            // Lerp angle toward desired by homingStrength.
            let diff = desiredAng - curAng;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const newAng = curAng + diff * this.homingStrength;
            this.vx = Math.cos(newAng) * this.speed;
            this.vy = Math.sin(newAng) * this.speed;
        }

        this.x += this.vx;
        this.y += this.vy;

        // Player collision.
        if (game.player && !game.player.isUntargetable) {
            const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const r = (game.player.width + game.player.height) / 4 + 8;
            if (Math.hypot(px - cx, py - cy) <= r) {
                this._onHit();
                return;
            }
        }

        // Out of bounds / lifetime.
        if (age > this.maxLifetime ||
            this.x < -40 || this.x > GAME_CONFIG.WIDTH + 40 ||
            this.y < -40 || this.y > GAME_CONFIG.HEIGHT + 40) {
            this.shouldDestroy = true;
        }
    }

    _onHit() {
        this._exploded = true;
        this.shouldDestroy = true;
        // Apply movement slow via the player's standard slow channel
        // (same one SublimeMoon's spin slash uses). The bolt itself
        // deals zero damage as designed.
        if (game.player && typeof game.player.applySlow === 'function') {
            game.player.applySlow(this.slowMs, this.slowMul);
        }
        if (typeof bossFX !== 'undefined') {
            bossFX.spawnBurst(this.x + this.width / 2, this.y + this.height / 2, 12, {
                color: '#a0ddff', speedMin: 1.5, speedMax: 4.5,
                sizeMin: 1.2, sizeMax: 2.5, lifeMs: 360, drag: 0.92
            });
            bossFX.addFlash(this.x + this.width / 2, this.y + this.height / 2, 22, '#c0eeff', 220, 0.7);
        }
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Outer halo
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
        grad.addColorStop(0, 'rgba(220,240,255,0.95)');
        grad.addColorStop(0.45, 'rgba(120,180,255,0.7)');
        grad.addColorStop(1, 'rgba(40,80,160,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
        // Crystalline diamond core
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#dff4ff';
        ctx.strokeStyle = '#5aa0ff';
        ctx.lineWidth = 1.5;
        const ang = Math.atan2(this.vy, this.vx);
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(0, -5); ctx.lineTo(-8, 0); ctx.lineTo(0, 5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // Frost trail puff
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(180,220,255,${0.4 + 0.2 * Math.sin(now * 0.02)})`;
        ctx.beginPath(); ctx.arc(-8, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class FrostNovaWave {
    // Visual-only expanding shockwave for Glacius's Frost Nova. The
    // damage/stun was already applied at fire time by Glacius itself,
    // so this object exists purely to render the wave traveling out
    // from the cast point.
    constructor(x, y, peakRadius) {
        this.x = x;
        this.y = y;
        this.peakRadius = peakRadius;
        this.spawnAt = Date.now();
        this.duration = 520;
        this.shouldDestroy = false;
        this.belongsTo = 'glacius';
    }
    update() {
        if (Date.now() - this.spawnAt >= this.duration) this.shouldDestroy = true;
    }
    draw(ctx) {
        const t = (Date.now() - this.spawnAt) / this.duration;
        if (t >= 1) return;
        const r = this.peakRadius * t;
        const fade = 1 - t;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Bright leading edge.
        ctx.strokeStyle = `rgba(220,240,255,${0.95 * fade})`;
        ctx.lineWidth = 4 * fade + 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.stroke();
        // Inner cool wash.
        const grad = ctx.createRadialGradient(this.x, this.y, r * 0.6, this.x, this.y, r);
        grad.addColorStop(0, 'rgba(120,180,255,0)');
        grad.addColorStop(1, `rgba(160,210,255,${0.45 * fade})`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI * 2); ctx.fill();
        // Frost shards spiking outward at the leading edge.
        ctx.strokeStyle = `rgba(220,240,255,${0.85 * fade})`;
        ctx.lineWidth = 1.5;
        const shards = 18;
        for (let i = 0; i < shards; i++) {
            const ang = i * (Math.PI * 2 / shards);
            const r1 = r - 6;
            const r2 = r + 8 + Math.sin(i * 1.7) * 4;
            ctx.beginPath();
            ctx.moveTo(this.x + Math.cos(ang) * r1, this.y + Math.sin(ang) * r1);
            ctx.lineTo(this.x + Math.cos(ang) * r2, this.y + Math.sin(ang) * r2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

class IceField {
    // Ground hazard left by Frost Nova. Anyone standing inside has
    // their move speed slowed via the player's standard slow channel.
    // Visual: blue translucent disc with crystalline shards and
    // slow-drifting frost flecks.
    constructor(x, y, radius, opts) {
        opts = opts || {};
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = opts.duration || 4000;
        this.slowMul = (opts.slowMul != null) ? opts.slowMul : 0.6;
        this.spawnAt = Date.now();
        this.shouldDestroy = false;
        this.belongsTo = 'glacius';
        // Procedural shard pattern (cached, so it doesn't shimmer).
        this._shards = [];
        const count = 18;
        for (let i = 0; i < count; i++) {
            this._shards.push({
                ang: Math.random() * Math.PI * 2,
                rad: Math.random() * radius * 0.8,
                len: 6 + Math.random() * 10,
                seed: Math.random() * Math.PI * 2,
            });
        }
    }
    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (age >= this.duration) { this.shouldDestroy = true; return; }
        // Tick slow on player while inside.
        if (game.player && !game.player.isUntargetable &&
            typeof game.player.applySlow === 'function') {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            if (Math.hypot(px - this.x, py - this.y) <= this.radius) {
                game.player.applySlow(220, this.slowMul);
            }
        }
    }
    draw(ctx) {
        const age = Date.now() - this.spawnAt;
        const t = age / this.duration;
        const fadeIn = Math.min(1, age / 220);
        const fadeOut = Math.max(0, 1 - Math.max(0, (t - 0.8) / 0.2));
        const a = fadeIn * fadeOut;
        if (a <= 0) return;
        ctx.save();
        // Base disc: translucent on normal blending so it reads as ground.
        const disc = ctx.createRadialGradient(this.x, this.y, this.radius * 0.2,
                                              this.x, this.y, this.radius);
        disc.addColorStop(0, `rgba(180,220,255,${0.45 * a})`);
        disc.addColorStop(0.7, `rgba(120,180,240,${0.3 * a})`);
        disc.addColorStop(1, `rgba(60,110,200,${0.05 * a})`);
        ctx.fillStyle = disc;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        // Rim highlight.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(220,240,255,${0.55 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
        // Crystalline shards (procedural, cached angles).
        ctx.strokeStyle = `rgba(220,240,255,${0.8 * a})`;
        ctx.lineWidth = 1.2;
        const now = Date.now();
        for (const s of this._shards) {
            const flick = 0.7 + 0.3 * Math.sin(now * 0.004 + s.seed);
            const x0 = this.x + Math.cos(s.ang) * s.rad;
            const y0 = this.y + Math.sin(s.ang) * s.rad;
            const x1 = x0 + Math.cos(s.ang + Math.PI / 2) * s.len * flick;
            const y1 = y0 + Math.sin(s.ang + Math.PI / 2) * s.len * flick;
            const x2 = x0 - Math.cos(s.ang + Math.PI / 2) * s.len * flick;
            const y2 = y0 - Math.sin(s.ang + Math.PI / 2) * s.len * flick;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x0 + Math.cos(s.ang) * s.len * 0.9, y0 + Math.sin(s.ang) * s.len * 0.9);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.fillStyle = `rgba(180,220,255,${0.5 * a * flick})`;
            ctx.fill();
            ctx.stroke();
        }
        // Drifting frost flecks for life.
        for (let i = 0; i < 14; i++) {
            const seed = i * 13;
            const phase = (now * 0.0005 + seed) % 1;
            const ang = (seed + now * 0.0003) % (Math.PI * 2);
            const rr = phase * this.radius;
            const fx = this.x + Math.cos(ang) * rr;
            const fy = this.y + Math.sin(ang) * rr;
            const fa = (1 - phase) * 0.85 * a;
            ctx.fillStyle = `rgba(220,240,255,${fa})`;
            ctx.beginPath(); ctx.arc(fx, fy, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

// =====================================================================
// Death rattles — left behind by each elemental member when it dies.
// All three are GameObject-less ground hazards pushed into the shared
// triumvirate projectile pool so they update/draw in the existing pipe.
// They are passive; their owner is already gone.
// =====================================================================

// Volthar's death rattle: a wide storm field that strikes the player
// up to STRIKE_COUNT times (one strike every STRIKE_INTERVAL_MS while
// the player stands inside), or fades out after `duration` ms even
// if it hasn't fired all its strikes.
class VoltharStormZone {
    constructor(x, y, opts) {
        opts = opts || {};
        this.x = x;
        this.y = y;
        this.radius = opts.radius || 240;
        this.duration = opts.duration || 7000;
        this.strikeCount = opts.strikeCount || 3;
        this.strikeInterval = opts.strikeInterval || 1900; // ms between strikes
        this.firstStrikeDelay = opts.firstStrikeDelay || 900;
        this.strikeDamage = (opts.strikeDamage != null) ? opts.strikeDamage : 18;
        this.strikeRadius = opts.strikeRadius || 80;
        this.stunMs = (opts.stunMs != null) ? opts.stunMs : 240;
        this.spawnAt = Date.now();
        this._strikesFired = 0;
        this._nextStrikeAt = this.spawnAt + this.firstStrikeDelay;
        this.shouldDestroy = false;
        this.belongsTo = 'volthar';
        // Cached arc seeds for the storm-cloud rim animation.
        this._arcSeeds = [];
        for (let i = 0; i < 22; i++) this._arcSeeds.push(Math.random() * Math.PI * 2);
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (age >= this.duration || this._strikesFired >= this.strikeCount) {
            this.shouldDestroy = true;
            return;
        }
        if (now < this._nextStrikeAt) return;
        // Only strike if the player is inside the field. If they're not,
        // hold the next-strike timer at "ready" so they get hit the
        // moment they re-enter, rather than wasting strikes on empty
        // ground. This makes the zone feel like a denial area.
        const pc = _triPlayerCenter();
        if (Math.hypot(pc.x - this.x, pc.y - this.y) > this.radius) return;
        this._strikesFired++;
        this._nextStrikeAt = now + this.strikeInterval;
        // Spawn an actual LightningStrike at the player so the existing
        // visual tells the story, and the standard AOE damage logic
        // applies. Source = the storm cloud center.
        const strike = new LightningStrike(pc.x, pc.y, {
            telegraphMs: 280,
            radius: this.strikeRadius,
            damage: this.strikeDamage,
            stunMs: this.stunMs,
            magnetism: 0.55,
            sourceX: this.x,
            sourceY: this.y - 20,
        });
        _triProjArr().push(strike);
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(this.x, this.y, 60, '#c0a0ff', 200, 0.6);
            bossFX.addShake(2, 120);
        }
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        const t = age / this.duration;
        const fadeIn = Math.min(1, age / 260);
        const fadeOut = Math.max(0, 1 - Math.max(0, (t - 0.78) / 0.22));
        const a = fadeIn * fadeOut;
        if (a <= 0) return;
        ctx.save();
        // Storm-cloud disc on normal blending.
        const disc = ctx.createRadialGradient(this.x, this.y, this.radius * 0.15,
                                              this.x, this.y, this.radius);
        disc.addColorStop(0, `rgba(120, 90, 180, ${0.45 * a})`);
        disc.addColorStop(0.6, `rgba(80, 50, 140, ${0.28 * a})`);
        disc.addColorStop(1, `rgba(40, 20, 80, 0)`);
        ctx.fillStyle = disc;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        // Rim crackle (additive).
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(200,160,255,${0.6 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
        // Wandering arc lines along the rim.
        ctx.lineWidth = 1.4;
        for (let i = 0; i < this._arcSeeds.length; i++) {
            const seed = this._arcSeeds[i];
            const baseAng = (now * 0.0008 + seed) % (Math.PI * 2);
            const rWobble = this.radius * (0.85 + 0.13 * Math.sin(now * 0.005 + seed));
            const x0 = this.x + Math.cos(baseAng) * rWobble;
            const y0 = this.y + Math.sin(baseAng) * rWobble;
            const x1 = this.x + Math.cos(baseAng + 0.18) * (rWobble - 14 - Math.random() * 8);
            const y1 = this.y + Math.sin(baseAng + 0.18) * (rWobble - 14 - Math.random() * 8);
            ctx.strokeStyle = `rgba(220,200,255,${0.5 * a * (0.5 + Math.random() * 0.5)})`;
            ctx.beginPath();
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        // "Charging" indicator at center: pulse intensifies as next strike approaches.
        const tilNext = Math.max(0, this._nextStrikeAt - now);
        const charge = 1 - Math.min(1, tilNext / 600);
        if (charge > 0) {
            const coreR = 20 + 14 * charge;
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreR);
            grad.addColorStop(0, `rgba(255,255,255,${0.6 * a * charge})`);
            grad.addColorStop(0.5, `rgba(180,140,255,${0.45 * a * charge})`);
            grad.addColorStop(1, 'rgba(80,40,160,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(this.x, this.y, coreR, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

// Glacius's death rattle: a wide frost tomb. Anyone inside is slowed
// to 70% movement and, on first contact, gets a one-shot 7s
// vulnerability that amplifies all incoming damage by 1.5x. The
// vulnerability is non-refreshable while it's running.
class GlaciusFrostTomb {
    constructor(x, y, opts) {
        opts = opts || {};
        this.x = x;
        this.y = y;
        this.radius = opts.radius || 240;
        this.duration = opts.duration || 10000;
        this.slowMul = (opts.slowMul != null) ? opts.slowMul : 0.7;
        this.vulnerabilityMs = (opts.vulnerabilityMs != null) ? opts.vulnerabilityMs : 7000;
        this.vulnerabilityMul = (opts.vulnerabilityMul != null) ? opts.vulnerabilityMul : 1.5;
        this.spawnAt = Date.now();
        this.shouldDestroy = false;
        this.belongsTo = 'glacius';
        // Cached crystalline shards for a cohesive icy look.
        this._shards = [];
        for (let i = 0; i < 26; i++) {
            this._shards.push({
                ang: Math.random() * Math.PI * 2,
                rad: Math.random() * this.radius * 0.85,
                len: 7 + Math.random() * 14,
                seed: Math.random() * Math.PI * 2,
            });
        }
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (age >= this.duration) { this.shouldDestroy = true; return; }
        if (!game.player || game.player.isUntargetable) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        if (Math.hypot(px - this.x, py - this.y) > this.radius) return;
        // Tick slow with a short window so it auto-clears once the
        // player walks out, matching IceField's behavior.
        if (typeof game.player.applySlow === 'function') {
            game.player.applySlow(220, this.slowMul);
        }
        // First-touch vulnerability. applyVulnerability is itself
        // non-refreshable so repeat ticks while the player stays inside
        // are safe — it just no-ops until the debuff expires.
        if (typeof game.player.applyVulnerability === 'function') {
            game.player.applyVulnerability(this.vulnerabilityMs, this.vulnerabilityMul);
        }
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        const t = age / this.duration;
        const fadeIn = Math.min(1, age / 300);
        const fadeOut = Math.max(0, 1 - Math.max(0, (t - 0.85) / 0.15));
        const a = fadeIn * fadeOut;
        if (a <= 0) return;
        ctx.save();
        // Base disc.
        const disc = ctx.createRadialGradient(this.x, this.y, this.radius * 0.2,
                                              this.x, this.y, this.radius);
        disc.addColorStop(0, `rgba(190,230,255,${0.5 * a})`);
        disc.addColorStop(0.7, `rgba(120,180,240,${0.32 * a})`);
        disc.addColorStop(1, `rgba(60,110,200,${0.06 * a})`);
        ctx.fillStyle = disc;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        // Rim ring.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(220,240,255,${0.6 * a})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
        // Inner threshold ring to telegraph the danger area.
        ctx.strokeStyle = `rgba(180,220,255,${0.35 * a})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2); ctx.stroke();
        // Crystalline shards.
        ctx.lineWidth = 1.3;
        for (const s of this._shards) {
            const flick = 0.7 + 0.3 * Math.sin(now * 0.004 + s.seed);
            const x0 = this.x + Math.cos(s.ang) * s.rad;
            const y0 = this.y + Math.sin(s.ang) * s.rad;
            const x1 = x0 + Math.cos(s.ang + Math.PI / 2) * s.len * flick;
            const y1 = y0 + Math.sin(s.ang + Math.PI / 2) * s.len * flick;
            const x2 = x0 - Math.cos(s.ang + Math.PI / 2) * s.len * flick;
            const y2 = y0 - Math.sin(s.ang + Math.PI / 2) * s.len * flick;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x0 + Math.cos(s.ang) * s.len * 0.95, y0 + Math.sin(s.ang) * s.len * 0.95);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.fillStyle = `rgba(190,230,255,${0.55 * a * flick})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(230,250,255,${0.7 * a * flick})`;
            ctx.stroke();
        }
        // Drifting frost flecks.
        for (let i = 0; i < 22; i++) {
            const seed = i * 17;
            const phase = (now * 0.0004 + seed) % 1;
            const ang = (seed + now * 0.0003) % (Math.PI * 2);
            const rr = phase * this.radius;
            const fx = this.x + Math.cos(ang) * rr;
            const fy = this.y + Math.sin(ang) * rr;
            const fa = (1 - phase) * 0.85 * a;
            ctx.fillStyle = `rgba(220,240,255,${fa})`;
            ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

// Pyron's death rattle: a wide scorched-earth field. While the player
// stands inside, they take per-second damage AND get the burning
// status continuously refreshed (so they stay on fire while inside
// and continue to burn briefly after walking out). Reuses the
// player's existing applyBurn() lifecycle for the burn DoT.
class PyronScorchedEarth {
    constructor(x, y, opts) {
        opts = opts || {};
        this.x = x;
        this.y = y;
        this.radius = opts.radius || 240;
        this.duration = opts.duration || 5000;
        this.dps = (opts.dps != null) ? opts.dps : 8;
        this.tickInterval = opts.tickInterval || 1000; // 1s per the spec
        this.spawnAt = Date.now();
        this._lastTickAt = this.spawnAt;
        this.shouldDestroy = false;
        this.belongsTo = 'pyron';
        // Pre-rolled embers / flame seeds for visuals.
        this._flames = [];
        for (let i = 0; i < 24; i++) {
            this._flames.push({
                ang: Math.random() * Math.PI * 2,
                rad: Math.random() * this.radius * 0.9,
                seed: Math.random() * 1000,
                size: 4 + Math.random() * 6,
            });
        }
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnAt;
        if (age >= this.duration) { this.shouldDestroy = true; return; }
        if (!game.player || game.player.isUntargetable) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        if (Math.hypot(px - this.x, py - this.y) > this.radius) return;
        // Continuously re-apply burn so the player keeps burning while
        // inside (and keeps a residual burn after they walk out, just
        // like the molotov from Ugly Emperor).
        if (typeof game.player.applyBurn === 'function') {
            game.player.applyBurn();
        }
        // Per-second flat tick damage on top of the burn DoT.
        if (now - this._lastTickAt >= this.tickInterval) {
            const ticks = Math.floor((now - this._lastTickAt) / this.tickInterval);
            _triHitPlayer(this.dps * ticks);
            this._lastTickAt += ticks * this.tickInterval;
        }
    }

    draw(ctx) {
        const now = Date.now();
        const age = now - this.spawnAt;
        const t = age / this.duration;
        const fadeIn = Math.min(1, age / 200);
        const fadeOut = Math.max(0, 1 - Math.max(0, (t - 0.75) / 0.25));
        const a = fadeIn * fadeOut;
        if (a <= 0) return;
        ctx.save();
        // Charred ground disc on normal blending so it reads as ground.
        const disc = ctx.createRadialGradient(this.x, this.y, this.radius * 0.15,
                                              this.x, this.y, this.radius);
        disc.addColorStop(0, `rgba(80, 25, 10, ${0.55 * a})`);
        disc.addColorStop(0.55, `rgba(60, 18, 8, ${0.4 * a})`);
        disc.addColorStop(1, `rgba(20, 8, 4, 0)`);
        ctx.fillStyle = disc;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        // Glowing cracks: a few radial ember veins under the surface.
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + Math.sin(now * 0.0006 + i) * 0.15;
            const r0 = this.radius * 0.15;
            const r1 = this.radius * (0.55 + 0.2 * Math.sin(now * 0.002 + i));
            const x0 = this.x + Math.cos(ang) * r0;
            const y0 = this.y + Math.sin(ang) * r0;
            const x1 = this.x + Math.cos(ang) * r1;
            const y1 = this.y + Math.sin(ang) * r1;
            const grad = ctx.createLinearGradient(x0, y0, x1, y1);
            grad.addColorStop(0, `rgba(255, 220, 120, ${0.7 * a})`);
            grad.addColorStop(0.6, `rgba(255, 110, 30, ${0.5 * a})`);
            grad.addColorStop(1, 'rgba(120, 30, 0, 0)');
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        // Rim ember ring.
        ctx.strokeStyle = `rgba(255, 140, 50, ${0.55 * a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.stroke();
        // Living flame tongues.
        for (const f of this._flames) {
            const flick = 0.6 + 0.4 * Math.sin(now * 0.012 + f.seed);
            const fx = this.x + Math.cos(f.ang) * f.rad;
            const fy = this.y + Math.sin(f.ang) * f.rad;
            const r = f.size * (0.7 + 0.4 * flick);
            const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 1.6);
            grad.addColorStop(0, `rgba(255, 240, 180, ${0.85 * a * flick})`);
            grad.addColorStop(0.45, `rgba(255, 130, 30, ${0.65 * a * flick})`);
            grad.addColorStop(1, 'rgba(120, 30, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(fx, fy, r * 1.6, 0, Math.PI * 2); ctx.fill();
        }
        // Rising embers.
        for (let i = 0; i < 16; i++) {
            const seed = i * 29;
            const phase = ((now * 0.0009) + seed) % 1;
            const ang = (seed + now * 0.0004) % (Math.PI * 2);
            const rr = (0.2 + 0.7 * phase) * this.radius;
            const ex = this.x + Math.cos(ang) * rr;
            const ey = this.y + Math.sin(ang) * rr - phase * 18;
            const ea = (1 - phase) * 0.9 * a;
            ctx.fillStyle = `rgba(255, 200, 90, ${ea})`;
            ctx.beginPath(); ctx.arc(ex, ey, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

class Glacius extends GameObject {
    constructor(x, y, parent) {
        super(x, y, 36, 36, '#a0ddff');
        this.parent = parent;
        this.maxHealth = TRI.SUBHP;
        this.health = this.maxHealth;
        this.isBoss = true;
        this.isTriMember = true;
        this.memberId = 'glacius';
        this.notTargetable = false;
        this.shouldDestroy = false;

        this.idealDistance = 400;
        this.facingAngle = 0;

        this._boltCdUntil = 0;
        this._boltCd = 700;

        // Frost Nova (signature AOE): big radius shockwave that stuns
        // the player on direct hit and leaves an ice field that slows
        // anything standing in it. Long telegraph so it can be dodged.
        this._novaCdUntil = Date.now() + 5500;       // first cast after a few seconds
        this._novaCd = 9000;                         // ~9s cadence
        this._novaTelegraphMs = 900;                 // wind-up before detonation
        this._novaWindupAt = 0;                      // 0 = not winding up
        this._novaRadius = 230;                      // detonation radius
        this._novaDamage = 14;                       // direct-hit damage
        this._novaStunMs = 1000;                     // stun on direct hit

        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;
        this._bobPhase = Math.random() * Math.PI * 2;
    }

    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function')
            ? applyOverdriveBoost(damage, source) : damage;
        this.health -= damage;
        this.hitIndicators.push({
            damage: Math.round(damage),
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
            y: this.y - 10,
            startTime: Date.now()
        });
        if (this.health <= 0 && !this.shouldDestroy) {
            this.shouldDestroy = true;
            this._onDeathFx();
            return true;
        }
        _triHitSidestep(this, 12);
        return false;
    }

    _onDeathFx() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined' && typeof bossFX.spawnSubKillExplosion === 'function') {
            bossFX.spawnSubKillExplosion(cx, cy, {
                scale: 1.0,
                color: '#80c0ff', // icy cyan
                shake: 11,
                shakeMs: 260,
            });
        }
        // Death rattle: frost tomb — slow + one-shot 7s vulnerability.
        _triProjArr().push(new GlaciusFrostTomb(cx, cy, {
            radius: 240,
            duration: 10000,
            slowMul: 0.7,
            vulnerabilityMs: 7000,
            vulnerabilityMul: 1.5,
        }));
    }

    update() {
        if (this.shouldDestroy) return;
        const now = Date.now();
        const pc = _triPlayerCenter();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        this.facingAngle = Math.atan2(pc.y - cy, pc.x - cx);

        // Always wants to be far. If too close, retreat hard.
        const dist = _triDistToPlayer(this);
        const drift = 1.5;
        if (dist < this.idealDistance - 40) {
            this.x -= Math.cos(this.facingAngle) * drift * 1.5;
            this.y -= Math.sin(this.facingAngle) * drift * 1.5;
        } else if (dist > this.idealDistance + 80) {
            this.x += Math.cos(this.facingAngle) * drift * 0.5;
            this.y += Math.sin(this.facingAngle) * drift * 0.5;
        }
        // Lateral strafe so Glacius keeps moving while kiting.
        const glat = this.facingAngle + Math.PI / 2;
        const gstrafe = Math.sin(now * 0.0019 + this._bobPhase) * 1.6
            + Math.sin(now * 0.0047 + 1.1) * 0.7;
        this.x += Math.cos(glat) * gstrafe;
        this.y += Math.sin(glat) * gstrafe;
        this.y += Math.sin(now * 0.002 + this._bobPhase) * 0.3;
        _triApplySeparation(this);
        _triClampToArena(this);

        // Frost Nova handling. While winding up, Glacius doesn't fire
        // bolts so the player can read the telegraph clearly.
        if (this._novaWindupAt > 0) {
            const t = now - this._novaWindupAt;
            if (t >= this._novaTelegraphMs) {
                this._fireFrostNova();
                this._novaWindupAt = 0;
                this._novaCdUntil = now + this._novaCd;
            }
            return;
        }
        if (now >= this._novaCdUntil) {
            this._novaWindupAt = now;
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(cx, cy, 50, '#c0eeff', 220, 0.7);
            }
            return;
        }

        if (now >= this._boltCdUntil) {
            this._fireFrostBolt();
            this._boltCdUntil = now + this._boltCd;
        }
    }

    _fireFrostNova() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const r = this._novaRadius;
        // Direct-hit damage + stun if player is inside the radius.
        const pc = _triPlayerCenter();
        if (Math.hypot(pc.x - cx, pc.y - cy) <= r) {
            _triHitPlayer(this._novaDamage);
            if (game.player && typeof game.player.setStunned === 'function') {
                game.player.setStunned(this._novaStunMs);
            }
            // Strong slow on direct hit even after the stun ends.
            if (game.player && typeof game.player.applySlow === 'function') {
                game.player.applySlow(2400, 0.45);
            }
        }
        // Drop the lingering ice field where the nova detonated.
        _triProjArr().push(new IceField(cx, cy, r * 0.95, {
            duration: 4500,
            slowMul: 0.6,
        }));
        // Push the shockwave projectile (visual + radius growth).
        _triProjArr().push(new FrostNovaWave(cx, cy, r));
        // FX: heavy screen shake + shockwave + flash + burst.
        if (typeof bossFX !== 'undefined') {
            bossFX.addShake(12, 520);
            bossFX.addFlash(cx, cy, r * 0.6, '#dff4ff', 400, 1.0);
            bossFX.addShockwave(cx, cy, 30, r, '#a0ddff', 620, 6, 0.85);
            bossFX.spawnBurst(cx, cy, 38, {
                color: '#c0eeff', speedMin: 3, speedMax: 11,
                sizeMin: 1.8, sizeMax: 3.6, lifeMs: 720, drag: 0.92
            });
        }
    }

    _fireFrostBolt() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const pc = _triPlayerCenter();
        // Triple shot in a small spread for stronger pressure.
        const baseAng = Math.atan2(pc.y - cy, pc.x - cx);
        const offsets = [-0.18, 0, 0.18];
        for (const off of offsets) {
            const ang = baseAng + off;
            const tx = cx + Math.cos(ang) * 800;
            const ty = cy + Math.sin(ang) * 800;
            _triProjArr().push(new FrostBolt(cx, cy, tx, ty, {
                speed: 8.5, slowMs: 2200, slowMul: 0.4, homing: 0.09
            }));
        }
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 22, '#c0eeff', 200, 0.8);
        }
    }

    draw(ctx) {
        if (this.shouldDestroy) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facingAngle);

        // Frost aura
        ctx.globalCompositeOperation = 'lighter';
        const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
        auraGrad.addColorStop(0, 'rgba(180,220,255,0.45)');
        auraGrad.addColorStop(1, 'rgba(20,40,100,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Crystal-mech body: crystal cluster with central core.
        ctx.fillStyle = '#0a1628';
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(16, -8);
        ctx.lineTo(20, 12);
        ctx.lineTo(0, 20);
        ctx.lineTo(-20, 12);
        ctx.lineTo(-16, -8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#80c0ff'; ctx.lineWidth = 2; ctx.stroke();

        // Inner facets
        ctx.strokeStyle = '#5aa0ff'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(0, 20);
        ctx.moveTo(-16, -8); ctx.lineTo(20, 12);
        ctx.moveTo(16, -8); ctx.lineTo(-20, 12);
        ctx.stroke();

        // Cold core
        ctx.globalCompositeOperation = 'lighter';
        const coreFlick = 0.7 + 0.3 * Math.sin(now * 0.01);
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
        coreGrad.addColorStop(0, `rgba(220,240,255,${0.95 * coreFlick})`);
        coreGrad.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
        // Frost Nova wind-up telegraph: an expanding ring centered on
        // Glacius that closes inward as it nears detonation. Drawn in
        // world space (after the body's restore) so it's not affected
        // by the boss-local rotation.
        if (this._novaWindupAt > 0) {
            const tt = (Date.now() - this._novaWindupAt) / this._novaTelegraphMs;
            const k = Math.min(1, Math.max(0, tt));
            const ringR = this._novaRadius * (1 - 0.55 * k);
            const a = 0.25 + 0.55 * k;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Outer fading aura.
            const aura = ctx.createRadialGradient(cx, cy, ringR * 0.4, cx, cy, ringR);
            aura.addColorStop(0, 'rgba(120,180,255,0)');
            aura.addColorStop(0.85, `rgba(160,210,255,${0.12 * a})`);
            aura.addColorStop(1, `rgba(220,240,255,${0.32 * a})`);
            ctx.fillStyle = aura;
            ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.fill();
            // Bright contracting ring.
            ctx.strokeStyle = `rgba(220,240,255,${0.85 * a})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
            // Crackle marks around the ring.
            ctx.strokeStyle = `rgba(160,210,255,${0.7 * a})`;
            ctx.lineWidth = 1;
            for (let i = 0; i < 12; i++) {
                const ang = i * (Math.PI * 2 / 12) + tt * 1.4;
                const r1 = ringR - 6;
                const r2 = ringR + 4 + Math.sin(tt * 12 + i) * 3;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
                ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
                ctx.stroke();
            }
            ctx.restore();
        }
        this._drawHitIndicators(ctx);
    }

    _drawHitIndicators(ctx) {
        const now = Date.now();
        for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
            const h = this.hitIndicators[i];
            const age = now - h.startTime;
            if (age > this.hitIndicatorDuration) {
                this.hitIndicators.splice(i, 1);
                continue;
            }
            const t = age / this.hitIndicatorDuration;
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#c0eeff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`-${h.damage}`, h.x, h.y - t * 18);
            ctx.restore();
        }
    }
}

// ---------------------------------------------------------------
// 5. Voidborn — phase 2 replacement (defined further below)
// ---------------------------------------------------------------
// The full Voidborn implementation lives below the Triumvirate
// container; see "Voidborn — full implementation" section.

// ---------------------------------------------------------------
// 6. Triumvirate — container boss
// ---------------------------------------------------------------
// Adapter that exposes a single boss to gameCore. Internally manages
// up to three sub-members (Pyron/Volthar/Glacius). When two die, the
// third is destroyed and a Voidborn spawns at its location.

class Triumvirate extends GameObject {
    constructor(x, y) {
        super(x, y, 36, 36, '#cccccc');
        this.isBoss = true;
        this.isTriumvirate = true;
        this.notTargetable = true;          // damage is routed to members
        this.shouldDestroy = false;
        this.spawnTime = Date.now();

        // Spawn three members spread around the spawn point.
        const members = [];
        const spread = TRI.SPAWN_SPREAD;
        const angles = [-Math.PI / 2, Math.PI / 6, Math.PI - Math.PI / 6];
        members.push(new Pyron(x + Math.cos(angles[0]) * spread, y + Math.sin(angles[0]) * spread, this));
        members.push(new Volthar(x + Math.cos(angles[1]) * spread, y + Math.sin(angles[1]) * spread, this));
        members.push(new Glacius(x + Math.cos(angles[2]) * spread, y + Math.sin(angles[2]) * spread, this));
        for (const m of members) _triClampToArena(m);
        this.members = members;
        this.voidborn = null;

        this.phase = TRI.PHASE_THREE;

        // Hit indicators array exists so the existing UI path doesn't blow up
        // (gameCore peeks boss.hitIndicators in some draws).
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // Aggregate health is kept up to date in update() so the existing
        // boss UI works without modification.
        this._refreshAggregateHealth();
    }

    _refreshAggregateHealth() {
        if (this.phase === TRI.PHASE_THREE) {
            const alive = this.members.filter(m => !m.shouldDestroy);
            this.maxHealth = alive.length * TRI.SUBHP || TRI.SUBHP;
            this.health = alive.reduce((s, m) => s + Math.max(0, m.health), 0);
        } else if (this.phase === TRI.PHASE_VOID && this.voidborn) {
            this.maxHealth = this.voidborn.maxHealth;
            this.health = Math.max(0, this.voidborn.health);
        } else {
            this.maxHealth = 1;
            this.health = 0;
        }
    }

    // The container tracks its own position to the centroid of living
    // members (used for fx anchors); also keeps width/height nominal so
    // bossFX position queries don't crash.
    _refreshCentroid() {
        let cx = 0, cy = 0, n = 0;
        if (this.phase === TRI.PHASE_THREE) {
            for (const m of this.members) {
                if (m.shouldDestroy) continue;
                cx += m.x + m.width / 2; cy += m.y + m.height / 2; n++;
            }
        } else if (this.voidborn && !this.voidborn.shouldDestroy) {
            cx = this.voidborn.x + this.voidborn.width / 2;
            cy = this.voidborn.y + this.voidborn.height / 2;
            n = 1;
        }
        if (n > 0) {
            this.x = cx / n - this.width / 2;
            this.y = cy / n - this.height / 2;
        }
    }

    // Damage is routed by gameCore via the children: enemies/missiles
    // collide with Pyron/Volthar/Glacius/Voidborn directly because they
    // are pushed into game.enemies. The container itself stays
    // notTargetable. takeDamage is here only as a defensive fallback.
    takeDamage(damage, source) {
        // Forward to nearest living member if anyone calls this directly.
        const alive = (this.phase === TRI.PHASE_VOID)
            ? (this.voidborn && !this.voidborn.shouldDestroy ? [this.voidborn] : [])
            : this.members.filter(m => !m.shouldDestroy);
        if (alive.length === 0) return false;
        return alive[0].takeDamage(damage, source);
    }

    update() {
        const now = Date.now();
        // Drive members (their own update handles AI/movement/projectiles).
        if (this.phase === TRI.PHASE_THREE) {
            for (const m of this.members) {
                if (!m.shouldDestroy) m.update();
            }
            // Check for transition: 2 dead -> collapse last into Voidborn.
            const dead = this.members.filter(m => m.shouldDestroy).length;
            if (dead >= 2) {
                this._beginVoidTransition();
            }
        } else if (this.phase === TRI.PHASE_VOID) {
            if (this.voidborn && !this.voidborn.shouldDestroy) {
                this.voidborn.update();
            }
        }

        // ---- Black-hole pull bookkeeping (multi-well stacking) ----
        // Snapshot the player's position BEFORE any black holes pull
        // them this frame. Every BlackholeProjectile reads this so that
        // its outward-damping math is based on the player's intended
        // movement only, not on shoves applied by sibling wells. This
        // makes any number of wells stack additively & predictably.
        const proj = _triProjArr();
        if (game && game.player) {
            game._triBhFrameStartCx = game.player.x + game.player.width / 2;
            game._triBhFrameStartCy = game.player.y + game.player.height / 2;
        }

        // Update orphan projectiles (FrostBolt/HeatLanceColumn/LightningStrike/BlackholeProjectile).
        for (let i = proj.length - 1; i >= 0; i--) {
            const p = proj[i];
            p.update();
            if (p.shouldDestroy) proj.splice(i, 1);
        }

        this._refreshCentroid();
        this._refreshAggregateHealth();

        // Detect overall death.
        if (this.phase === TRI.PHASE_VOID) {
            if (!this.voidborn || this.voidborn.shouldDestroy) {
                this.shouldDestroy = true;
                this.health = 0;
            }
        }
    }

    _beginVoidTransition() {
        // Find the surviving member, kill it, spawn Voidborn in its place.
        const survivor = this.members.find(m => !m.shouldDestroy);
        if (!survivor) {
            // All three dead simultaneously: spawn Voidborn at centroid.
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            this.voidborn = new Voidborn(cx - 22, cy - 22, this);
        } else {
            const cx = survivor.x + survivor.width / 2;
            const cy = survivor.y + survivor.height / 2;
            survivor.shouldDestroy = true;
            this.voidborn = new Voidborn(cx - 22, cy - 22, this);
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(cx, cy, 120, '#9a3aff', 600, 1.0);
                bossFX.addShockwave(cx, cy, 30, 220, '#7020c0', 800, 5, 0.8);
                bossFX.addShake(8, 480);
            }
        }
        // Inject Voidborn into the enemies array so player targeting,
        // weapons and the standard collision pipeline can hit it the same
        // way they hit the three members.
        if (this.voidborn && typeof game !== 'undefined' && game.enemies) {
            game.enemies.push(this.voidborn);
        }
        this.phase = TRI.PHASE_VOID;
    }

    draw(ctx) {
        // Draw projectiles first (under members) for clarity.
        const proj = _triProjArr();
        // Two-pass: ground/telegraph first, then bright bolts on top.
        for (const p of proj) p.draw(ctx);

        if (this.phase === TRI.PHASE_THREE) {
            for (const m of this.members) {
                if (!m.shouldDestroy) m.draw(ctx);
            }
        } else if (this.phase === TRI.PHASE_VOID && this.voidborn) {
            this.voidborn.draw(ctx);
        }

        // Per-member sub bars across the top, under the main HP bar.
        this._drawSubBars(ctx);
    }

    _drawSubBars(ctx) {
        if (this.phase !== TRI.PHASE_THREE) return;
        const W = GAME_CONFIG.WIDTH;
        const baseY = 86;          // below main HP bar
        const barW = 140;
        const barH = 8;
        const gap = 12;
        const totalW = barW * 3 + gap * 2;
        const startX = (W - totalW) / 2;
        const labels = ['PYRON', 'VOLTHAR', 'GLACIUS'];
        const colors = ['#ff6030', '#a070ff', '#80c0ff'];
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const m = this.members[i];
            const x = startX + i * (barW + gap);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(x, baseY, barW, barH);
            if (m && !m.shouldDestroy) {
                const pct = Math.max(0, m.health / m.maxHealth);
                ctx.fillStyle = colors[i];
                ctx.fillRect(x, baseY, barW * pct, barH);
            }
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 1;
            ctx.strokeRect(x, baseY, barW, barH);
            ctx.fillStyle = colors[i];
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(labels[i], x + barW / 2, baseY + barH + 2);
        }
        ctx.restore();
    }
}

// ---------------------------------------------------------------
// 6. Voidborn — full implementation
// ---------------------------------------------------------------
// Passive: Void Devour. Player ranged projectiles (bullets, rockets,
//   plasma missiles, cluster missiles) entering VOID_DEVOUR_RADIUS are
//   bent toward the Voidborn and consumed.
// Passive: Void Teleport. If the player stays within VOID_TELEPORT_RADIUS
//   for VOID_TELEPORT_DWELL ms, the player is teleported to the arena
//   corner farthest from the Voidborn.
// Active: Blackhole Cannon. Periodically fires a blackhole projectile
//   that travels to a target point, then becomes a pull field for
//   VOID_BLACKHOLE_LIFE ms before exploding for AOE damage.
// Movement: slow ambient drift, does not actively chase the player.

class VoidDevourFx {
    constructor(x, y, tx, ty) {
        this.x = x; this.y = y;
        this.tx = tx; this.ty = ty;
        this.t = 0;
        this.life = 220;
        this.shouldDestroy = false;
    }
    update() {
        this.t += 16;
        if (this.t >= this.life) this.shouldDestroy = true;
    }
    draw(ctx) {
        const k = this.t / this.life;
        const x = this.x + (this.tx - this.x) * k;
        const y = this.y + (this.ty - this.y) * k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r = 14 * (1 - k) + 4;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(200,140,255,0.95)');
        grad.addColorStop(1, 'rgba(80,0,160,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class BlackholeProjectile {
    constructor(sx, sy, tx, ty, owner) {
        this.x = sx; this.y = sy;
        this.tx = tx; this.ty = ty;
        this.owner = owner;
        const dx = tx - sx, dy = ty - sy;
        const d = Math.max(1, Math.hypot(dx, dy));
        this.vx = (dx / d) * TRI.VOID_BLACKHOLE_SPEED;
        this.vy = (dy / d) * TRI.VOID_BLACKHOLE_SPEED;
        this.phase = 'travel';
        this.life = TRI.VOID_BLACKHOLE_LIFE;
        this.bornAt = Date.now();
        this.shouldDestroy = false;
        this.radius = 14;
        this.spin = 0;
        // Reuse standard projectile aabb so any boss-cleanup loops behave.
        this.width = 28; this.height = 28;
    }

    update() {
        if (this.shouldDestroy) return;
        this.spin += 0.18;
        if (this.phase === 'travel') {
            this.x += this.vx;
            this.y += this.vy;
            const dx = this.tx - this.x, dy = this.ty - this.y;
            if (Math.hypot(dx, dy) < TRI.VOID_BLACKHOLE_SPEED * 1.2) {
                this.phase = 'pull';
                this.bornAt = Date.now();
                if (typeof bossFX !== 'undefined') {
                    if (typeof bossFX.addShockwave === 'function') {
                        bossFX.addShockwave(this.x, this.y, 8, 60, '#9a3aff', 360, 3, 0.85);
                    }
                    if (typeof bossFX.addFlash === 'function') {
                        bossFX.addFlash(this.x, this.y, 60, '#b070ff', 320, 0.9);
                    }
                }
            }
            return;
        }
        if (this.phase === 'pull') {
            const p = game.player;
            if (p && !p.isUntargetable) {
                const px = p.x + p.width / 2;
                const py = p.y + p.height / 2;
                const dx = this.x - px, dy = this.y - py;     // toward hole
                const dist = Math.hypot(dx, dy);
                if (dist < TRI.VOID_BLACKHOLE_PULL_R && dist > 1) {
                    const u = dist / TRI.VOID_BLACKHOLE_PULL_R;
                    const floor = TRI.VOID_BLACKHOLE_PULL_FLOOR / TRI.VOID_BLACKHOLE_PULL;
                    const k = (1 - Math.pow(u, 1.6)) * (1 - floor) + floor;
                    const pull = TRI.VOID_BLACKHOLE_PULL * k;
                    // Unit vector pointing INTO the hole.
                    const inX = dx / dist, inY = dy / dist;

                    // ---- Outward-movement damping ----
                    // Use the per-frame snapshot of where the player
                    // started this frame (before ANY well pulled them).
                    // That way every well measures the player's pure
                    // input movement, not shoves applied by sibling
                    // wells, so N wells stack cleanly and additively.
                    const startCx = (game && game._triBhFrameStartCx != null) ? game._triBhFrameStartCx : px;
                    const startCy = (game && game._triBhFrameStartCy != null) ? game._triBhFrameStartCy : py;
                    const moveX = px - startCx;
                    const moveY = py - startCy;
                    const proj = moveX * inX + moveY * inY;
                    if (proj < 0) {
                        // Cancel + reverse the outward component.
                        const resist = TRI.VOID_BLACKHOLE_OUTWARD_RESIST;
                        p.x += -proj * inX * resist;
                        p.y += -proj * inY * resist;
                    } else if (proj > 0) {
                        const boost = (TRI.VOID_BLACKHOLE_INWARD_BOOST - 1);
                        p.x += proj * inX * boost;
                        p.y += proj * inY * boost;
                    }

                    // ---- Direct pull (always inward, additive) ----
                    p.x += inX * pull;
                    p.y += inY * pull;

                    // ---- Tick chip damage ----
                    if (!this._lastTickAt) this._lastTickAt = 0;
                    const now = Date.now();
                    if (now - this._lastTickAt >= 200) {
                        this._lastTickAt = now;
                        const tickDmg = TRI.VOID_BLACKHOLE_PULL_TICK_DMG * (0.6 + k);
                        if (typeof p.takeDamage === 'function') {
                            // Voidborn blackhole bypasses player shields
                            // and damage-reduction so the gravitational
                            // threat is consistent across loadouts.
                            p.takeDamage(tickDmg, { bypassShield: true, bypassReduction: true });
                        }
                    }
                }
            }
            if (Date.now() - this.bornAt >= this.life) {
                this._explode();
            }
            return;
        }
    }

    _explode() {
        this.shouldDestroy = true;
        const p = game.player;
        if (p && !p.isUntargetable) {
            const px = p.x + p.width / 2, py = p.y + p.height / 2;
            const d = Math.hypot(px - this.x, py - this.y);
            if (d <= TRI.VOID_BLACKHOLE_AOE_R && typeof p.takeDamage === 'function') {
                p.takeDamage(TRI.VOID_BLACKHOLE_AOE_DMG, { bypassShield: true, bypassReduction: true });
            }
        }
        if (typeof bossFX !== 'undefined') {
            if (typeof bossFX.addShockwave === 'function') {
                bossFX.addShockwave(this.x, this.y, 30, TRI.VOID_BLACKHOLE_AOE_R, '#b070ff', 520, 5, 0.85);
            }
            if (typeof bossFX.spawnBurst === 'function') {
                bossFX.spawnBurst(this.x, this.y, 28, {
                    color: '#9a3aff', speedMin: 2, speedMax: 8,
                    sizeMin: 1.6, sizeMax: 3.4, lifeMs: 620, drag: 0.92,
                });
            }
            if (typeof bossFX.addFlash === 'function') {
                bossFX.addFlash(this.x, this.y, TRI.VOID_BLACKHOLE_AOE_R * 0.7, '#dcb6ff', 360, 0.9);
            }
            if (typeof bossFX.addShake === 'function') {
                bossFX.addShake(8, 220);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        if (this.phase === 'travel') {
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 22);
            grad.addColorStop(0, 'rgba(180,100,255,0.95)');
            grad.addColorStop(1, 'rgba(40,0,80,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(this.x, this.y, 22, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1a0028';
            ctx.beginPath(); ctx.arc(this.x, this.y, 7, 0, Math.PI * 2); ctx.fill();
        } else if (this.phase === 'pull') {
            const t = (Date.now() - this.bornAt) / this.life;
            ctx.globalCompositeOperation = 'lighter';
            const R = TRI.VOID_BLACKHOLE_PULL_R;
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, R);
            g.addColorStop(0, 'rgba(160,80,255,0.55)');
            g.addColorStop(0.5, 'rgba(80,20,180,0.25)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.fill();
            // Swirling rings
            ctx.strokeStyle = 'rgba(200,140,255,0.85)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const rr = 30 + i * 22 + Math.sin(this.spin + i) * 4;
                ctx.beginPath();
                ctx.arc(this.x, this.y, rr, this.spin + i, this.spin + i + Math.PI * 1.4);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(this.x, this.y, 14 + t * 4, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#9a3aff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }
}

class Voidborn extends GameObject {
    constructor(x, y, parent) {
        super(x, y, 48, 48, '#9a3aff');
        this.parent = parent;
        this.maxHealth = TRI.VOID_HP;
        this.health = this.maxHealth;
        this.isBoss = true;
        this.isVoidborn = true;
        this.notTargetable = false;
        this.shouldDestroy = false;
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;
        // Drift state.
        this._driftAngle = Math.random() * Math.PI * 2;
        this._driftRetargetAt = 0;
        // Teleport state.
        this._meleeDwell = 0;
        this._lastTpAt = 0;
        // Blackhole state — start with first shot ready ~800ms after spawn.
        this._lastBlackholeAt = Date.now() - TRI.VOID_BLACKHOLE_CD + 800;
        // Devour fx queue.
        this._devourFx = [];
        // Visual.
        this._spin = 0;
    }

    // ---- targeting ----
    takeDamage(damage, source) {
        // Voidborn's body is partially phased — melee strikes connect
        // physically but bleed half their force into the void. This
        // stops melee from being a free counter to the devour aura.
        if (source === 'melee' || source === 'sword' || source === 'moonlight') {
            damage *= 0.5;
        }
        damage = (typeof applyOverdriveBoost === 'function')
            ? applyOverdriveBoost(damage, source) : damage;
        this.health -= damage;
        this.hitIndicators.push({
            damage: Math.round(damage),
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
            y: this.y - 10,
            startTime: Date.now()
        });
        if (this.health <= 0 && !this.shouldDestroy) {
            this.shouldDestroy = true;
            return true;
        }
        return false;
    }

    // ---- helpers ----
    _center() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }

    _scanAndDevour() {
        const c = this._center();
        const R = TRI.VOID_DEVOUR_RADIUS;
        const R2 = R * R;
        const lists = [
            game.bullets,
            game.missiles,
            game.plasmaMissiles,
        ];
        for (const list of lists) {
            if (!list || !list.length) continue;
            // Iterate backwards so we can splice in place. We splice
            // immediately (rather than relying on cleanup passes) because
            // some projectiles run their own collision/explosion logic
            // inside update() and could still hit us in the same frame
            // after being merely flagged for destruction.
            for (let i = list.length - 1; i >= 0; i--) {
                const p = list[i];
                if (!p || p.shouldDestroy) continue;
                // Cluster-bomb dispenser is invulnerable+non-devourable
                // until it finishes shedding all its bomblets.
                if (p.noDevour) continue;
                const px = (p.x || 0) + (p.width ? p.width / 2 : 0);
                const py = (p.y || 0) + (p.height ? p.height / 2 : 0);
                const dx = px - c.x, dy = py - c.y;
                if (dx * dx + dy * dy <= R2) {
                    this._devourFx.push(new VoidDevourFx(px, py, c.x, c.y));
                    p.shouldDestroy = true;
                    list.splice(i, 1);
                }
            }
        }
    }

    _maybeTeleportPlayer(dt) {
        const p = game.player;
        if (!p || p.isUntargetable) { this._meleeDwell = 0; return; }
        const c = this._center();
        const px = p.x + p.width / 2, py = p.y + p.height / 2;
        const dist = Math.hypot(px - c.x, py - c.y);
        // Consider player radius so the threshold matches "the player is
        // touching/near my body" rather than "player center inside a tiny
        // sphere around mine".
        const playerR = (p.width + p.height) / 4;
        const triggerR = TRI.VOID_TELEPORT_RADIUS + playerR;
        if (dist <= triggerR) {
            this._meleeDwell += dt;
        } else {
            this._meleeDwell = Math.max(0, this._meleeDwell - dt * 0.5);
        }
        const now = Date.now();
        if (this._meleeDwell >= TRI.VOID_TELEPORT_DWELL &&
            now - this._lastTpAt >= TRI.VOID_TELEPORT_CD) {
            this._teleportPlayerFar();
            this._meleeDwell = 0;
            this._lastTpAt = now;
        }
    }

    _teleportPlayerFar() {
        const p = game.player;
        if (!p) return;
        const margin = 80;
        const corners = [
            { x: margin, y: margin },
            { x: GAME_CONFIG.WIDTH - margin - p.width, y: margin },
            { x: margin, y: GAME_CONFIG.HEIGHT - margin - p.height },
            { x: GAME_CONFIG.WIDTH - margin - p.width, y: GAME_CONFIG.HEIGHT - margin - p.height },
        ];
        const c = this._center();
        let best = corners[0], bestD = -Infinity;
        for (const k of corners) {
            const cx = k.x + p.width / 2, cy = k.y + p.height / 2;
            const d = Math.hypot(cx - c.x, cy - c.y);
            if (d > bestD) { bestD = d; best = k; }
        }
        if (typeof bossFX !== 'undefined') {
            const oldC = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
            if (typeof bossFX.spawnBurst === 'function') {
                bossFX.spawnBurst(oldC.x, oldC.y, 18, {
                    color: '#9a3aff', speedMin: 2, speedMax: 6,
                    sizeMin: 1.4, sizeMax: 2.8, lifeMs: 420, drag: 0.92,
                });
            }
            if (typeof bossFX.addFlash === 'function') {
                bossFX.addFlash(oldC.x, oldC.y, 36, '#9a3aff', 240, 0.85);
            }
        }
        p.x = best.x; p.y = best.y;
        if (typeof bossFX !== 'undefined') {
            const newC = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
            if (typeof bossFX.spawnBurst === 'function') {
                bossFX.spawnBurst(newC.x, newC.y, 22, {
                    color: '#b070ff', speedMin: 2, speedMax: 7,
                    sizeMin: 1.4, sizeMax: 3, lifeMs: 460, drag: 0.92,
                });
            }
            if (typeof bossFX.addFlash === 'function') {
                bossFX.addFlash(newC.x, newC.y, 48, '#b070ff', 280, 0.95);
            }
            if (typeof bossFX.addShake === 'function') {
                bossFX.addShake(4, 180);
            }
        }
    }

    _drift(dt) {
        const now = Date.now();
        if (now >= this._driftRetargetAt) {
            this._driftAngle += (Math.random() - 0.5) * 1.6;
            this._driftRetargetAt = now + 1400 + Math.random() * 1200;
        }
        const sp = TRI.VOID_DRIFT_SPEED;
        this.x += Math.cos(this._driftAngle) * sp;
        this.y += Math.sin(this._driftAngle) * sp;
        _triClampToArena(this, 60);
    }

    _maybeFireBlackhole() {
        const now = Date.now();
        if (now - this._lastBlackholeAt < TRI.VOID_BLACKHOLE_CD) return;
        const p = game.player;
        if (!p) return;
        this._lastBlackholeAt = now;
        const c = this._center();
        // Predict player's position a beat ahead so the salvo brackets
        // them rather than landing where they used to be.
        const px = p.x + p.width / 2;
        const py = p.y + p.height / 2;
        const ahead = 40;
        let tx = px, ty = py;
        if (typeof p.vx === 'number' && typeof p.vy === 'number') {
            tx += p.vx * ahead / 6;
            ty += p.vy * ahead / 6;
        }
        // Salvo of 3 wells: one direct shot through the player's
        // predicted point, two flanks offset perpendicular to the
        // firing line. Flanks land short / long so their pull fields
        // bracket the player's escape lanes instead of stacking.
        const aimDx = tx - c.x, aimDy = ty - c.y;
        const aimLen = Math.hypot(aimDx, aimDy) || 1;
        const ax = aimDx / aimLen, ay = aimDy / aimLen;   // forward unit
        const nx = -ay, ny = ax;                           // perpendicular
        const flankSide = 170;   // perpendicular offset of each flank
        const longShift = 90;    // forward shift of right flank
        const shortShift = -70;  // forward shift of left flank
        const shots = [
            { x: tx,                                  y: ty,                                  delay: 0   },
            { x: tx + nx * flankSide + ax * longShift, y: ty + ny * flankSide + ay * longShift,  delay: 110 },
            { x: tx - nx * flankSide + ax * shortShift, y: ty - ny * flankSide + ay * shortShift, delay: 220 },
        ];
        const arr = Array.isArray(game.triumvirateProjectiles) ? game.triumvirateProjectiles : null;
        const fireOne = (sx, sy) => {
            const proj = new BlackholeProjectile(c.x, c.y, sx, sy, this);
            if (arr) arr.push(proj);
            if (typeof bossFX !== 'undefined' && typeof bossFX.addFlash === 'function') {
                bossFX.addFlash(c.x, c.y, 40, '#9a3aff', 220, 0.85);
            }
        };
        // First shot fires immediately; the rest are scheduled so the
        // muzzle flash actually flickers between rounds.
        fireOne(shots[0].x, shots[0].y);
        for (let i = 1; i < shots.length; i++) {
            const s = shots[i];
            setTimeout(() => {
                if (this.shouldDestroy) return;
                const cc = this._center();
                const proj = new BlackholeProjectile(cc.x, cc.y, s.x, s.y, this);
                if (Array.isArray(game.triumvirateProjectiles)) {
                    game.triumvirateProjectiles.push(proj);
                }
                if (typeof bossFX !== 'undefined' && typeof bossFX.addFlash === 'function') {
                    bossFX.addFlash(cc.x, cc.y, 40, '#9a3aff', 220, 0.85);
                }
            }, s.delay);
        }
        if (typeof bossFX !== 'undefined' && typeof bossFX.addShake === 'function') {
            bossFX.addShake(3, 240);
        }
    }

    update() {
        if (this.shouldDestroy) return;
        const dt = 16; // approx tick
        this._spin += 0.04;
        this._drift(dt);
        this._scanAndDevour();
        this._maybeTeleportPlayer(dt);
        this._maybeFireBlackhole();
        // Update devour FX.
        for (let i = this._devourFx.length - 1; i >= 0; i--) {
            const f = this._devourFx[i];
            f.update();
            if (f.shouldDestroy) this._devourFx.splice(i, 1);
        }
        // Update hit indicators decay handled by draw.
    }

    draw(ctx) {
        const c = this._center();
        ctx.save();
        // Devour aura ring (subtle, communicates the danger zone).
        ctx.globalCompositeOperation = 'lighter';
        const auraR = TRI.VOID_DEVOUR_RADIUS;
        const auraGrad = ctx.createRadialGradient(c.x, c.y, auraR * 0.55, c.x, c.y, auraR);
        auraGrad.addColorStop(0, 'rgba(120,40,200,0)');
        auraGrad.addColorStop(0.7, 'rgba(140,60,220,0.10)');
        auraGrad.addColorStop(1, 'rgba(180,100,255,0.22)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath(); ctx.arc(c.x, c.y, auraR, 0, Math.PI * 2); ctx.fill();
        // Outer halo.
        const haloR = 70;
        const halo = ctx.createRadialGradient(c.x, c.y, 6, c.x, c.y, haloR);
        halo.addColorStop(0, 'rgba(200,140,255,0.95)');
        halo.addColorStop(0.5, 'rgba(120,40,200,0.55)');
        halo.addColorStop(1, 'rgba(40,0,80,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(c.x, c.y, haloR, 0, Math.PI * 2); ctx.fill();
        // Rotating arcs.
        ctx.strokeStyle = 'rgba(200,140,255,0.85)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const rr = 26 + i * 8;
            const a = this._spin * (i % 2 === 0 ? 1 : -1) + i;
            ctx.beginPath();
            ctx.arc(c.x, c.y, rr, a, a + Math.PI * 1.2);
            ctx.stroke();
        }
        // Core body: round event horizon, like a black hole.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#1a0028';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b070ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Inner singularity dot.
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e0b0ff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        // Devour FX overlay.
        for (const f of this._devourFx) f.draw(ctx);
        // Damage numbers.
        const now = Date.now();
        for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
            const h = this.hitIndicators[i];
            const age = now - h.startTime;
            if (age >= this.hitIndicatorDuration) {
                this.hitIndicators.splice(i, 1);
                continue;
            }
            const t = age / this.hitIndicatorDuration;
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#e0b0ff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`-${h.damage}`, h.x, h.y - t * 18);
            ctx.restore();
        }
    }
}
