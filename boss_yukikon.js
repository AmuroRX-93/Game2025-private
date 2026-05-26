// 雪魂 Yukikon - 近战决斗型 Boss
// Hit-and-run melee duelist: blink, dash, sword rain, shadow clones.
// Inherits its own utility-based AI from the shared boss_ai_core helpers.

const YUKIKON_DAMAGE_MULT = 1.0;
// Yukikon takes only 15% damage from ranged sources while a melee swing
// is active (meleeShieldUntil > now). Set in the move triggers.
const YUKIKON_MELEE_RANGED_REDUCTION = 0.15;
// Source identifiers that count as melee attacks and bypass the shield.
const YUKIKON_MELEE_SOURCES = new Set([
    'sword', 'moonlight', 'spinSlash', 'laser_spear', 'spear', 'crescent'
]);

class Yukikon extends GameObject {
    constructor(x, y) {
        super(x, y, 32, 32, '#cfe6ff');
        this.maxHealth = 150;
        this.health = this.maxHealth;
        this.speed = 70;
        this.color = '#cfe6ff';
        this.accent = '#7fc8ff';
        this.deepAccent = '#1a4f8a';

        // Standard Boss-like flags so the rest of the game treats it as a boss.
        this.isBoss = true;
        this.notTargetable = false;
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = false;
        this.stunEndTime = 0;

        // Damage window (same accumulation reduction as other bosses)
        this.damageWindow = { accumulated: 0, windowStart: Date.now() };

        // While > now, Yukikon is mid-melee and ranged (gun/missile/etc.)
        // damage is reduced by MELEE_RANGED_REDUCTION. Sword-class melee
        // attacks are unaffected.
        this.meleeShieldUntil = 0;

        // Hit indicators
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // AI core
        this.aiMemory = createBossAIMemory();
        this.telegraphs = [];
        this.combatPhase = 'idle';
        this.activeMove = null;
        this.combatRecoverUntil = 0;
        this.spawnTime = Date.now();
        this.firstDecisionAt = this.spawnTime + 600;
        this.movesTable = this._buildMovesTable();

        // Movement scaffolding
        this.lastAiUpdate = Date.now();
        this.idealDistance = 180; // Yukikon wants to stay close — duelist
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;

        // Shadow clones (visual only). Real Yukikon swaps places with one
        // every shadowSwapInterval ms while active.
        this.clones = [];
        this.shadowActive = false;
        this.shadowEndAt = 0;
        this.lastShadowSwap = 0;
        this.shadowSwapInterval = 2000;

        // Trail for movement so high-speed dashes look smooth.
        this.trail = [];

        // Body angle for the silhouette: faces the player.
        this.facingAngle = 0;

        // Passive strafe-fire: while orbiting (no committed move) Yukikon
        // taps off SMG rounds at the player so she's never silent.
        this.lastPassiveShotAt = 0;
        this.passiveShotInterval = 130; // ms between shots

        // Point-defense (CIWS) — Yukikon's PD is twitchier than SublimeMoon's:
        // higher fire rate and faster tracers so dogged missile salvos
        // get shredded mid-flight. Range is effectively unlimited — she
        // engages any player missile on the field.
        this.pdRange = Infinity;
        this.pdFireRate = 32;
        this.pdLastFire = 0;
        this.pdBulletSpeed = 22;
        this.pdInheritedColor = '#7fc8ff';
    }

    // ============= Standard hit / damage handling =============
    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage, source) : damage;
        const now = Date.now();
        // Ranged shield: while a melee swing is active, ranged attacks
        // are massively reduced. Melee sources bypass the shield.
        const isMelee = source && YUKIKON_MELEE_SOURCES.has(source);
        if (now < this.meleeShieldUntil && !isMelee) {
            damage = damage * YUKIKON_MELEE_RANGED_REDUCTION;
        }
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 60);
        const actualDamage = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        this.damageWindow.accumulated += damage;

        this.health -= actualDamage;
        this.addHitIndicator(actualDamage);
        if (this.health <= 0) {
            this._destroyClones();
            this.clones = [];
            this.shadowActive = false;
        }
        return this.health <= 0;
    }

    addHitIndicator(damage) {
        const now = Date.now();
        this.hitIndicators.push({
            damage,
            startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 50,
            y: this.y + this.height + 12 + Math.random() * 8
        });
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
    }

    drawHitIndicators(ctx) {
        const now = Date.now();
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
        this.hitIndicators.forEach(ind => {
            const elapsed = now - ind.startTime;
            const progress = elapsed / this.hitIndicatorDuration;
            const alpha = 1 - progress;
            const offsetY = progress * 28;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#a0e0ff';
            ctx.strokeStyle = '#0a2440';
            ctx.lineWidth = 3;
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            const text = `HIT ${ind.damage}`;
            const dy = ind.y - offsetY;
            ctx.strokeText(text, ind.x, dy);
            ctx.fillText(text, ind.x, dy);
            ctx.restore();
        });
    }

    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        this.vx = 0; this.vy = 0;
    }
    releaseImpale() {
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = true;
        this.stunEndTime = Date.now() + 220;
        this.vx = 0; this.vy = 0;
    }
    // Bullet/missile dodging — duelist style: she does NOT dodge ranged
    // shots. The fight is "hit me back if you can while I close the gap".
    checkDodge() { /* intentionally empty */ }
    checkBulletDodge() { /* intentionally empty */ }
    checkMissileDodge() { /* intentionally empty */ }

    // ============= Top-level update =============
    update() {
        const now = Date.now();
        if (this.health <= 0) return;
        if (this.isImpaled) {
            super.update();
            this._updateTrail();
            return;
        }
        if (this.stunned) {
            if (now >= this.stunEndTime) this.stunned = false;
            else { this.vx = 0; this.vy = 0; super.update(); return; }
        }

        if (this.combatPhase === 'commit' && this.activeMove) {
            this._tickActiveMove(now);
        } else {
            this._steerMovement(now);
            if (now >= this.firstDecisionAt && now >= this.combatRecoverUntil) {
                this._maybePickMove(now);
            }
        }

        this._updateShadow(now);
        this._updatePointDefense(now);
        super.update();
        this._clampToArena();
        this._updateTrail();
        this._faceTarget();
    }

    _faceTarget() {
        if (!game.player) return;
        const dx = (game.player.x + game.player.width / 2) - (this.x + this.width / 2);
        const dy = (game.player.y + game.player.height / 2) - (this.y + this.height / 2);
        this.facingAngle = Math.atan2(dy, dx);
    }

    // === Point Defense ========================================================
    // Mirrors SublimeMoon's CIWS: blue tracer rounds, no cooldown beyond the
    // per-shot fire rate, intercepts only player missiles (not reversed ones).
    _updatePointDefense(now) {
        if (!game.missiles || game.missiles.length === 0) return;

        const fireInterval = 1000 / this.pdFireRate;
        if (now - this.pdLastFire < fireInterval) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const r2 = this.pdRange * this.pdRange;

        let best = null;
        let bestDist2 = r2;
        for (const m of game.missiles) {
            if (!m || m.shouldDestroy) continue;
            if (m.isReversed) continue;
            const mx = (m.x != null ? m.x : 0) + (m.width || 0) / 2;
            const my = (m.y != null ? m.y : 0) + (m.height || 0) / 2;
            const dx = mx - cx;
            const dy = my - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist2) {
                bestDist2 = d2;
                best = { mx, my };
            }
        }
        if (!best) return;

        // Aim at current position (no lead — player missiles curve, lead
        // would push the tracer onto the wrong side of the arc).
        const dx0 = best.mx - cx;
        const dy0 = best.my - cy;
        const aLen = Math.hypot(dx0, dy0) || 1;
        const vx = (dx0 / aLen) * this.pdBulletSpeed;
        const vy = (dy0 / aLen) * this.pdBulletSpeed;

        if (typeof BossCIWSBullet === 'function') {
            // No range cap — Yukikon's PD chases missiles across the
            // whole arena, so bullets must be allowed to traverse it.
            const bullet = new BossCIWSBullet(cx, cy, vx, vy, this.pdInheritedColor, {
                maxRange: 4000,
                maxLifetime: 2400
            });
            if (!game.bossCiwsBullets) game.bossCiwsBullets = [];
            game.bossCiwsBullets.push(bullet);
        }

        if (typeof bossFX !== 'undefined') {
            const ang = Math.atan2(vy, vx);
            const muzzleX = cx + Math.cos(ang) * 14;
            const muzzleY = cy + Math.sin(ang) * 14;
            bossFX.addFlash(muzzleX, muzzleY, 8, this.pdInheritedColor, 110, 0.7);
        }

        this.pdLastFire = now;
    }

    _updateTrail() {
        const now = Date.now();
        this.trail.push({ x: this.x + this.width / 2, y: this.y + this.height / 2, t: now });
        // Keep ~280ms of trail
        while (this.trail.length && now - this.trail[0].t > 280) this.trail.shift();
        if (this.trail.length > 60) this.trail.splice(0, this.trail.length - 60);
    }

    _clampToArena() {
        if (this.x < 0) this.x = 0;
        if (this.y < 0) this.y = 0;
        if (this.x + this.width > GAME_CONFIG.WIDTH) this.x = GAME_CONFIG.WIDTH - this.width;
        if (this.y + this.height > GAME_CONFIG.HEIGHT) this.y = GAME_CONFIG.HEIGHT - this.height;
    }

    _steerMovement(now) {
        if (!game.player) return;
        const ctx = buildBossAIContext(this);
        // Orbit at idealDistance and gradually pivot strafe direction.
        const desiredDist = this.idealDistance;
        const errorD = ctx.dist - desiredDist;
        const radial = Math.sign(errorD) * Math.min(1, Math.abs(errorD) / 120);
        const angTo = ctx.angleToPlayer;
        // Strafe around the player perpendicular to the radial axis.
        const tangent = angTo + Math.PI / 2 * this.strafeDirection;
        const radialVec = { x: Math.cos(angTo) * radial, y: Math.sin(angTo) * radial };
        const tangVec = { x: Math.cos(tangent) * 0.85, y: Math.sin(tangent) * 0.85 };
        const dirX = radialVec.x + tangVec.x;
        const dirY = radialVec.y + tangVec.y;
        const len = Math.hypot(dirX, dirY) || 1;
        const targetVx = (dirX / len) * this.speed;
        const targetVy = (dirY / len) * this.speed;
        // Smooth blending so motion feels like a duelist, not a pathfinder.
        this.vx += (targetVx - this.vx) * 0.18;
        this.vy += (targetVy - this.vy) * 0.18;
        // Occasionally flip strafe direction for unpredictability.
        if (Math.random() < 0.005) this.strafeDirection *= -1;

        // Passive strafe-fire: keep tapping bullets at the player while
        // orbiting, so Yukikon stays threatening between committed moves.
        // Skip if she's invisible during a Shadow Step setup.
        if (!this.shadowActive && ctx.dist <= 520 && now - this.lastPassiveShotAt >= this.passiveShotInterval) {
            this._fireSmgShotAtPlayer();
            this.lastPassiveShotAt = now;
        }
    }

    // ============= Move selection =============
    _buildMovesTable() {
        return [
            {
                id: 'flashStrike',
                cooldown: 4500,
                telegraphMs: 280,
                score: ctx => 1.0 + (ctx.dist > 240 ? 0.6 : 0) - (ctx.dist < 120 ? 0.4 : 0),
                start: () => this._startFlashStrike(),
                tick: now => this._tickFlashStrike(now)
            },
            {
                id: 'smgBurst',
                cooldown: 6500,
                telegraphMs: 350,
                // Wants ranged attacks especially at mid distance.
                score: ctx => 0.7 + (ctx.dist > 220 ? 0.4 : 0),
                start: () => this._startSmgBurst(),
                tick: now => this._tickSmgBurst(now)
            },
            {
                id: 'swordRain',
                cooldown: 9000,
                telegraphMs: 600,
                score: () => 0.65,
                start: () => this._startSwordRain(),
                tick: now => this._tickSwordRain(now)
            },
            {
                id: 'shadowStep',
                cooldown: 9000,
                telegraphMs: 0,
                canUse: ctx => !this.shadowActive,
                score: () => 0.7,
                start: () => this._startShadow(),
                tick: now => this._tickInstantMove(now)
            },
            {
                id: 'iaiCharge',
                cooldown: 7500,
                telegraphMs: 520,
                // Prefers mid-range engagements where the curving charge
                // actually has room to track — point-blank is wasted.
                score: ctx => 0.85 + (ctx.dist > 200 && ctx.dist < 520 ? 0.55 : 0),
                start: () => this._startIaiCharge(),
                tick: now => this._tickIaiCharge(now)
            }
        ];
    }

    _maybePickMove(now) {
        const ctx = buildBossAIContext(this);
        const move = selectBossMove(this.movesTable, this.aiMemory, ctx);
        if (!move) return;
        commitBossMove(move, this.aiMemory, now);
        this.combatPhase = 'commit';
        this.activeMove = {
            move,
            startedAt: now,
            telegraphUntil: now + (move.telegraphMs || 0),
            state: {}
        };
        if (move.start) move.start();
    }

    _tickActiveMove(now) {
        const m = this.activeMove;
        if (!m) { this.combatPhase = 'idle'; return; }
        m.move.tick(now);
    }

    _finishMove(recoverMs) {
        this.activeMove = null;
        this.combatPhase = 'idle';
        this.combatRecoverUntil = Date.now() + (recoverMs || 350);
    }

    // ============= Move 1: Flash Strike (blink + 3-hit slash) =============
    _startFlashStrike() {
        if (!game.player) return;
        // Mark a teleport target spot right next to the player — closer
        // than before so the slash arc actually overlaps her hitbox.
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.random() * Math.PI * 2;
        const offset = 36 + Math.random() * 16;
        const tx = px + Math.cos(ang) * offset;
        const ty = py + Math.sin(ang) * offset;
        this.activeMove.state.tx = tx;
        this.activeMove.state.ty = ty;
        // Telegraph: a circle marker at the destination.
        const tel = createTelegraphCircle(tx, ty, 36, this.activeMove.move.telegraphMs, '#7fc8ff');
        this.telegraphs.push(tel);
        bossFX.addFlash(this.x + this.width / 2, this.y + this.height / 2, 30, '#a0e0ff', 220, 0.7);
    }

    _tickFlashStrike(now) {
        const m = this.activeMove;
        const s = m.state;
        if (!s.teleported && now >= m.telegraphUntil) {
            // Teleport to telegraphed spot.
            this.x = s.tx - this.width / 2;
            this.y = s.ty - this.height / 2;
            this._clampToArena();
            this.vx = 0; this.vy = 0;
            s.teleported = true;
            s.slashIndex = 0;
            s.nextSlashAt = now + 80;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            bossFX.addFlash(cx, cy, 40, '#ffffff', 200, 0.9);
            bossFX.addShockwave(cx, cy, 6, 60, '#a0e0ff', 320, 3, 0.7);
        }
        if (!s.teleported) return;

        // Three quick slashes spaced ~140ms apart.
        if (now >= s.nextSlashAt && s.slashIndex < 3) {
            this._performSlash(s.slashIndex);
            s.slashIndex++;
            s.nextSlashAt = now + 150;
        }
        if (s.slashIndex >= 3 && now >= s.nextSlashAt + 80) {
            this._finishMove(280);
        }
    }

    _performSlash(index) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx);
        // Sweep arc with a small angular swing.
        const sweepHalf = 0.85;
        const sweepDir = (index % 2 === 0) ? 1 : -1;
        const a0 = ang - sweepHalf * sweepDir;
        const a1 = ang + sweepHalf * sweepDir;
        const bladeLen = 130;
        const reach = bladeLen + 20; // a touch of grace radius
        // Stash the slash for our custom render — bright lightsaber arc.
        this.telegraphs.push({
            kind: 'slash',
            cx, cy,
            radius: bladeLen,
            a0, a1,
            color: '#bfeaff',
            startedAt: Date.now(),
            expiresAt: Date.now() + 300
        });
        bossFX.addFlash(cx + Math.cos(ang) * bladeLen * 0.6,
                         cy + Math.sin(ang) * bladeLen * 0.6,
                         28, '#cfeaff', 200, 0.8);
        // Open the ranged-damage shield — melee active for the slash + a
        // little overhang so the player can't poke between slashes.
        this.meleeShieldUntil = Math.max(this.meleeShieldUntil, Date.now() + 280);

        // Damage check: cone within bladeLen radius and within sweepHalf
        // of the strike angle.
        const dx = px - cx, dy = py - cy;
        const d = Math.hypot(dx, dy);
        if (d <= reach) {
            const angTo = Math.atan2(dy, dx);
            let diff = angTo - ang;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            // Generous: ±sweepHalf + small margin.
            if (Math.abs(diff) <= sweepHalf + 0.25) {
                if (game.player && !game.player.isUntargetable) {
                    // Melee swing damage — boosted to 37 base for a sharper
                    // close-range threat now that she teleports right onto
                    // the player.
                    game.player.takeDamage(Math.round(37 * YUKIKON_DAMAGE_MULT));
                    // Hit-feel: a tiny shake plus a flash at the player so
                    // the cut feels like it connected, not just animated.
                    if (typeof bossFX !== 'undefined') {
                        bossFX.addShake(2.5, 120);
                        bossFX.addFlash(px, py, 26, '#ffffff', 160, 0.85);
                    }
                }
            }
        }
    }

    // ============= Move: Iai Charge (curving lunge with side blades) =============
    // Two ultra-long blades extend from Yukikon's flanks. After a brief
    // telegraph she homes the player like a guided missile — capable of
    // curving but on a hard time/hit budget so she can't loop forever. Hits
    // deal a chunky chip + 0.3s stun. A thin straight guide line connects
    // boss-to-player throughout the chase so the threat is unambiguous.
    _startIaiCharge() {
        const s = this.activeMove.state;
        s.bladeLen = 240;          // ultra-long flank blades
        s.bladeHalfWidth = 14;     // blade thickness for hit-checks
        s.chargeUntil = 0;         // set when charge actually begins
        s.maxChargeMs = 1500;      // hard timeout so it can't loop forever
        s.chargeSpeed = this.speed * (2 / 3);  // 2/3 of normal max move speed
        s.turnRate = 0;            // straight-line lunge — no in-flight steering
        s.heading = this.facingAngle != null ? this.facingAngle : 0;
        s.hitLanded = false;
        s.hitCooldownUntil = 0;
        s.charging = false;
        // Telegraph the lock-on with a circle on the boss (where blades
        // unfold) — players see the blades sprout before the lunge.
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 32, '#cfeaff', 240, 0.8);
        }
    }

    _tickIaiCharge(now) {
        const m = this.activeMove;
        const s = m.state;

        // === Telegraph phase: hold position, deploy blades ===
        if (now < m.telegraphUntil) {
            this.vx = 0;
            this.vy = 0;
            // Aim heading at the player throughout the wind-up.
            if (game.player) {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                s.heading = Math.atan2(py - cy, px - cx);
            }
            return;
        }

        // === Begin charge once ===
        if (!s.charging) {
            s.charging = true;
            s.chargeUntil = now + s.maxChargeMs;
            // Snap heading to player at launch.
            if (game.player) {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                s.heading = Math.atan2(py - cy, px - cx);
            }
            if (typeof bossFX !== 'undefined') {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                bossFX.addFlash(cx, cy, 44, '#ffffff', 180, 0.9);
                bossFX.addShake(3, 140);
            }
        }

        // === Charge phase: straight-line lunge — heading locked at launch ===
        this.vx = Math.cos(s.heading) * s.chargeSpeed;
        this.vy = Math.sin(s.heading) * s.chargeSpeed;

        // === Hit detection: blades sweep on both flanks ===
        // Blades are perpendicular to heading, centered on body, length
        // bladeLen on each side. Check if player is within bladeHalfWidth
        // of either blade segment.
        if (!s.hitLanded && now >= s.hitCooldownUntil && game.player && !game.player.isUntargetable) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            // Perpendicular axis to heading — that's where the blades lie.
            const perp = s.heading + Math.PI / 2;
            const ux = Math.cos(perp);
            const uy = Math.sin(perp);
            // Project player offset onto perp axis (along blade) and onto
            // heading axis (cross-blade thickness).
            const dx = px - cx;
            const dy = py - cy;
            const along = dx * ux + dy * uy;          // -bladeLen..+bladeLen
            const across = dx * Math.cos(s.heading) + dy * Math.sin(s.heading);
            if (Math.abs(along) <= s.bladeLen && Math.abs(across) <= s.bladeHalfWidth) {
                game.player.takeDamage(Math.round(12 * YUKIKON_DAMAGE_MULT));
                if (typeof game.player.setStunned === 'function') {
                    game.player.setStunned(300);
                }
                if (typeof bossFX !== 'undefined') {
                    bossFX.addFlash(px, py, 32, '#ffffff', 180, 0.9);
                    bossFX.addShake(4, 180);
                }
                s.hitLanded = true;
            }
        }

        // === End conditions: hit, timeout, or arena edge contact ===
        const hitWall = (this.x <= 0 || this.y <= 0 ||
            this.x + this.width >= GAME_CONFIG.WIDTH ||
            this.y + this.height >= GAME_CONFIG.HEIGHT);
        if (s.hitLanded || now >= s.chargeUntil || hitWall) {
            this.vx = 0;
            this.vy = 0;
            this._finishMove(380);
        }
    }

    // Render side blades + thin guide line during iai charge. Called from
    // draw() when the active move is iaiCharge (telegraph or charging).
    _drawIaiBlades(ctx) {
        const m = this.activeMove;
        if (!m || !m.move || m.move.id !== 'iaiCharge') return;
        const s = m.state;
        if (!s) return;
        const now = Date.now();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Blade growth animation during telegraph (0 → bladeLen).
        let growth = 1;
        if (now < m.telegraphUntil) {
            const t = 1 - (m.telegraphUntil - now) / (m.move.telegraphMs || 1);
            growth = Math.max(0, Math.min(1, t));
        }
        const bladeLen = (s.bladeLen || 240) * growth;
        const heading = s.heading || 0;
        const perp = heading + Math.PI / 2;
        const ux = Math.cos(perp);
        const uy = Math.sin(perp);

        // Thin guide line to player while charging or in late telegraph.
        if (game.player && (s.charging || now > m.telegraphUntil - 220)) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.55;
            ctx.strokeStyle = '#bfeaff';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Two flank blades — long thin glowing bars.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const side of [1, -1]) {
            const tipX = cx + ux * bladeLen * side;
            const tipY = cy + uy * bladeLen * side;
            // Outer halo
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = '#7fc8ff';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            // Mid body
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#cfeaff';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            // Hot core
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ============= Move 2: SMG Burst (rapid blue tracer fire) =============
    // Brief muzzle flash telegraph, then unload an ~1.4s spray of
    // low-damage tracers aimed at the player. Yukikon stays mostly in place
    // and re-aims slightly each shot.
    _startSmgBurst() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Pulsing muzzle flash telegraph at the boss — no beam line.
        bossFX.addFlash(cx, cy, 30, '#7fc8ff', this.activeMove.move.telegraphMs, 0.85);
        this.activeMove.state.shotsFired = 0;
        this.activeMove.state.totalShots = 44;
        this.activeMove.state.shotInterval = 30;
        this.activeMove.state.nextShotAt = 0;
    }

    _tickSmgBurst(now) {
        const m = this.activeMove;
        const s = m.state;
        if (now < m.telegraphUntil) return;
        if (s.shotsFired >= s.totalShots) {
            // Recovery after spray ends.
            this._finishMove(420);
            return;
        }
        if (now < s.nextShotAt) return;

        this._fireSmgShotAtPlayer();
        s.shotsFired++;
        s.nextShotAt = now + s.shotInterval;
    }

    // Shared SMG bullet emission used by both the burst move and the
    // passive strafe-fire that runs while Yukikon is orbiting the player.
    _fireSmgShotAtPlayer() {
        if (!game.yukikonBullets) game.yukikonBullets = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        let baseAng;
        if (game.player) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            baseAng = Math.atan2(py - cy, px - cx);
        } else {
            baseAng = this.facingAngle;
        }
        const spread = (Math.random() - 0.5) * 0.10; // ~+-3deg
        game.yukikonBullets.push(new YukikonBullet(cx, cy, baseAng + spread));
        bossFX.addFlash(cx, cy, 14, '#bfeaff', 90, 0.55);
    }

    // ============= Move 3: Sword Rain (radial homing daggers) =============
    _startSwordRain() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Telegraph: aura bloom around boss.
        const tel = createTelegraphAura(cx, cy, 90, this.activeMove.move.telegraphMs, '#7fc8ff');
        this.telegraphs.push(tel);
        this.activeMove.state.fired = false;
    }

    _tickSwordRain(now) {
        const m = this.activeMove;
        if (m.state.fired) {
            if (now >= m.telegraphUntil + 250) this._finishMove(360);
            return;
        }
        if (now < m.telegraphUntil) return;
        // Fire 12 daggers in a fan that homes for ~600ms.
        if (!game.yukikonDaggers) game.yukikonDaggers = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const count = 12;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.06;
            game.yukikonDaggers.push(new YukikonDagger(cx, cy, a));
        }
        bossFX.addFlash(cx, cy, 60, '#cfe8ff', 320, 0.85);
        bossFX.addShockwave(cx, cy, 8, 90, '#9fd8ff', 380, 3, 0.6);
        m.state.fired = true;
    }

    // ============= Move 4: Shadow Step (clones) =============
    _startShadow() {
        this.shadowActive = true;
        this.shadowEndAt = Date.now() + 9000;
        this.lastShadowSwap = Date.now();
        // Drop any leftovers from a previous activation (defensive).
        this._destroyClones();
        this.clones = [];
        // Spawn 1 or 2 clones (was always 3) — fewer decoys means each one
        // is more meaningful and the boss is more often the one in front of
        // you instead of hiding behind a crowd.
        const cloneCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < cloneCount; i++) {
            // Spawn clones in a ring around Yukikon's current position.
            const ang = (i / cloneCount) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 110 + Math.random() * 40;
            const cx = this.x + Math.cos(ang) * dist;
            const cy = this.y + Math.sin(ang) * dist;
            const phase = ang + Math.PI / 2;
            const clone = new YukikonShadowClone(cx, cy, phase, this);
            this.clones.push(clone);
        }
        // Clones live on the boss; they're surfaced to the player's targeting
        // pipeline via findNearestEnemy() but never enter game.enemies (which
        // would expose them to every weapon's hit/death/impale logic and
        // cause hard-to-track edge cases).
        // Force any current hard-lock that's pointing at the boss to retarget,
        // so the player's reticle gets visibly yanked onto a clone.
        if (gameState && gameState.lockMode === 'hard' &&
            gameState.hardLockTarget === this && this.clones.length) {
            gameState.hardLockTarget = this.clones[0];
        }
        const fcx = this.x + this.width / 2;
        const fcy = this.y + this.height / 2;
        bossFX.addFlash(fcx, fcy, 50, '#bfeaff', 360, 0.9);
    }

    _destroyClones() {
        if (!this.clones || !this.clones.length) return;
        for (const c of this.clones) {
            c.shouldDestroy = true;
        }
    }

    _tickInstantMove(now) {
        // Telegraph 0 — finish immediately.
        this._finishMove(420);
    }

    _updateShadow(now) {
        // Prune clones the world has destroyed (gameCore removes them when
        // shouldDestroy is set; we just mirror that here).
        if (this.clones && this.clones.length) {
            this.clones = this.clones.filter(c => !c.shouldDestroy);
        }
        if (!this.shadowActive) return;
        if (now >= this.shadowEndAt) {
            this.shadowActive = false;
            this._destroyClones();
            this.clones = [];
            return;
        }
        // Drift clones around the player area.
        for (const c of this.clones) {
            c.phase += 0.04;
            if (game.player) {
                // Target a position offset from the player; keep clone (x,y)
                // semantics consistent with top-left so swap math works.
                const tx = game.player.x + game.player.width / 2 + Math.cos(c.phase) * 220 - c.width / 2;
                const ty = game.player.y + game.player.height / 2 + Math.sin(c.phase * 0.8) * 220 - c.height / 2;
                c.x += (tx - c.x) * 0.04;
                c.y += (ty - c.y) * 0.04;
            }
        }
        // Periodic body swap — boss moves to a random clone position.
        if (now - this.lastShadowSwap >= this.shadowSwapInterval && this.clones.length) {
            const target = this.clones[Math.floor(Math.random() * this.clones.length)];
            const oldCx = this.x + this.width / 2;
            const oldCy = this.y + this.height / 2;
            const tCx = target.x + target.width / 2;
            const tCy = target.y + target.height / 2;
            this.x = tCx - this.width / 2;
            this.y = tCy - this.height / 2;
            this._clampToArena();
            target.x = oldCx - target.width / 2;
            target.y = oldCy - target.height / 2;
            this.lastShadowSwap = now;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            bossFX.addFlash(cx, cy, 24, '#ffffff', 180, 0.7);
        }
    }

    // ============= Drawing =============
    draw(ctx) {
        // Render telegraphs first so the player sees the cue under the boss.
        this._renderTelegraphs(ctx);

        // Movement trail (afterimages).
        this._drawTrail(ctx);

        // Shadow clones — drawn here (not via game.enemies) so we keep
        // their lifecycle entirely on the boss.
        for (const c of this.clones) {
            const ccx = c.x + c.width / 2;
            const ccy = c.y + c.height / 2;
            this._drawSilhouette(ctx, ccx, ccy, 0.45);
            // Decoy pulse ring so a careful player can tell clones from real.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const pulse = 0.25 + 0.25 * Math.sin(Date.now() / 140 + c.phase * 4);
            ctx.globalAlpha = pulse;
            ctx.strokeStyle = '#cfeaff';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(ccx, ccy, 22, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Main body.
        this._drawSilhouette(ctx, this.x + this.width / 2, this.y + this.height / 2, 1.0);

        // Iai-charge flank blades + guide line (only active during that move).
        this._drawIaiBlades(ctx);

        // Melee-shield aura — a bright ring around the boss while ranged
        // damage is reduced. Telegraphs to the player that bullets won't
        // hurt right now.
        if (Date.now() < this.meleeShieldUntil) {
            this._drawMeleeShieldAura(ctx);
        }

        this.drawHitIndicators(ctx);
    }

    _drawMeleeShieldAura(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const remaining = Math.max(0, this.meleeShieldUntil - Date.now());
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 60);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Outer halo
        const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 46);
        grad.addColorStop(0, 'rgba(207,234,255,0)');
        grad.addColorStop(0.7, 'rgba(127,200,255,0.45)');
        grad.addColorStop(1, 'rgba(127,200,255,0)');
        ctx.globalAlpha = 0.85 * pulse;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 46, 0, Math.PI * 2);
        ctx.fill();
        // Bright ring
        ctx.strokeStyle = '#cfeaff';
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(cx, cy, 36, 0, Math.PI * 2);
        ctx.stroke();
        // Tick marks rotating to reinforce "active" state
        const rot = Date.now() / 250;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const a = rot + (i / 6) * Math.PI * 2;
            const r1 = 36, r2 = 42;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
            ctx.stroke();
        }
        ctx.restore();
        void remaining;
    }

    _drawTrail(ctx) {
        if (!this.trail.length) return;
        const now = Date.now();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const age = (now - p.t) / 280;
            const a = Math.max(0, 1 - age) * 0.35;
            if (a <= 0.01) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#7fc8ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 14 * (1 - age), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawSilhouette(ctx, cx, cy, alpha) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facingAngle);
        // Body — sleek diamond with a light core.
        ctx.globalAlpha = alpha;
        // Outer halo
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        halo.addColorStop(0, 'rgba(180, 230, 255, 0.55)');
        halo.addColorStop(1, 'rgba(180, 230, 255, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
        // Diamond plate
        ctx.fillStyle = this.deepAccent;
        ctx.strokeStyle = this.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(0, -12);
        ctx.lineTo(-16, 0);
        ctx.lineTo(0, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Glowing slit
        ctx.fillStyle = '#cfeaff';
        ctx.fillRect(-4, -1.5, 18, 3);
        ctx.restore();
    }

    _renderTelegraphs(ctx) {
        if (!this.telegraphs || !this.telegraphs.length) return;
        const now = Date.now();
        // Custom slash overlays first so they render under the standard set.
        const slashes = this.telegraphs.filter(t => t.kind === 'slash');
        const others = this.telegraphs.filter(t => t.kind !== 'slash');
        for (let i = slashes.length - 1; i >= 0; i--) {
            const s = slashes[i];
            const total = s.expiresAt - s.startedAt;
            const t = (now - s.startedAt) / total;
            if (t >= 1) {
                this.telegraphs.splice(this.telegraphs.indexOf(s), 1);
                continue;
            }
            this._drawLightsaberSlash(ctx, s, t);
        }
        renderBossTelegraphs(ctx, others);
        // Re-merge so non-rendered slashes stay; renderBossTelegraphs already
        // pruned the others array contents. Replace telegraphs with the union.
        this.telegraphs = slashes.concat(others);
    }

    // Lightsaber-style slash. We draw the sweep as a filled "fan" tracing
    // the swept area (with a soft radial gradient), then a sharp tip light,
    // and finally a few bright sparkle motes streaming off the cut. The
    // blade itself isn't drawn as a static line — it's the *cut* you see.
    // Yukikon's signature slash. The visual reads as a fast katana cut:
    //   * a thin, crisp "blade glint" sweeps the leading edge,
    //   * one or two staggered after-image arcs trail behind,
    //   * a counter-curling wind crescent peels off in the opposite
    //     direction (the air pressure the cut leaves behind),
    //   * a sharp impact bloom pops at the tip, and
    //   * tiny ice motes shed from the cut curve.
    // Everything fades within ~220ms; the slash should *feel* like a flash
    // rather than a beam.
    _drawLightsaberSlash(ctx, s, t) {
        const a0 = s.a0;
        const a1 = s.a1;
        const ang = a0 + (a1 - a0) * t;
        const r = s.radius;
        const cx = s.cx, cy = s.cy;
        const direction = a1 >= a0 ? 1 : -1;
        const tipX = cx + Math.cos(ang) * r;
        const tipY = cy + Math.sin(ang) * r;

        // One-time per-slash random data (debris, edge wobble seeds).
        if (!s._fx) {
            const motes = [];
            for (let i = 0; i < 9; i++) {
                motes.push({
                    f: i / 9 + Math.random() * 0.04,
                    side: (Math.random() - 0.5) * 0.22,
                    radial: r - 6 + Math.random() * 8,
                    speed: 90 + Math.random() * 110,
                    drift: (Math.random() - 0.5) * 0.6,
                    size: 1.1 + Math.random() * 1.4
                });
            }
            const dust = [];
            for (let i = 0; i < 5; i++) {
                dust.push({
                    f: 0.05 + Math.random() * 0.7,
                    side: (Math.random() - 0.5) * 0.35,
                    radial: 10 + Math.random() * (r - 14),
                    drift: (Math.random() - 0.5) * 0.4,
                    speed: 30 + Math.random() * 40,
                    life: 0.55 + Math.random() * 0.35
                });
            }
            s._fx = { motes, dust };
        }

        const totalDur = Math.max(1, s.expiresAt - s.startedAt);
        const elapsed = Date.now() - s.startedAt;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // === 1) After-image arcs: 3 staggered cuts that lag behind the
        // leading edge so the player reads "the air remembers the path".
        // Each later arc is dimmer, thicker, more blue. Drawn arc-by-arc.
        const lagOffsets = [0, 0.18, 0.34];
        const lagAlpha   = [0.95, 0.55, 0.28];
        const lagWidth   = [3.2, 6.5, 11];
        const lagColor   = ['#ffffff', '#cfeaff', '#7fc8ff'];
        ctx.lineCap = 'round';
        for (let li = 0; li < lagOffsets.length; li++) {
            const lagT = Math.max(0, t - lagOffsets[li]);
            if (lagT <= 0) continue;
            const lagAng = a0 + (a1 - a0) * lagT;
            // Fade per-layer based on its own age.
            const layerFade = (1 - lagT) * (1 - 0.45 * t);
            if (layerFade <= 0.02) continue;
            ctx.globalAlpha = lagAlpha[li] * layerFade;
            ctx.strokeStyle = lagColor[li];
            ctx.lineWidth = lagWidth[li];
            ctx.beginPath();
            ctx.arc(cx, cy, r, a0, lagAng, direction < 0);
            ctx.stroke();
        }

        // === 2) Counter wind-crescent: a faint backward-curving arc on
        // the OPPOSITE side of the swing, suggesting displaced air.
        // Drawn at slightly larger radius and curls the other way.
        if (t > 0.1 && t < 0.95) {
            const counterFade = Math.sin(Math.min(1, (t - 0.1) / 0.6) * Math.PI) * 0.6;
            ctx.globalAlpha = counterFade;
            ctx.strokeStyle = '#a8e0ff';
            ctx.lineWidth = 1.6;
            const cR = r * 1.18;
            // Mirror-curve the swept range across the perpendicular axis.
            const span = (a1 - a0);
            const mid = (a0 + a1) / 2;
            const cA0 = mid + span * 0.1;
            const cA1 = mid - span * 0.5 - 0.25 * direction;
            ctx.beginPath();
            ctx.arc(cx, cy, cR, Math.min(cA0, cA1), Math.max(cA0, cA1));
            ctx.stroke();
        }

        // === 3) Visible katana blade riding on the leading edge.
        //     Stylized but anatomically convincing: dark wrapped tsuka,
        //     small round tsuba guard, narrow habaki collar, then a long
        //     curved blade that tapers + has a bright cutting edge and
        //     a softer mune (back). The blade is drawn so its tip lands
        //     on the swing arc, anchoring the slash visually.
        if (t < 0.95) {
            const bladeAlpha = (1 - Math.abs(t - 0.45) * 1.55);
            if (bladeAlpha > 0.05) {
                this._drawKatanaBlade(ctx, cx, cy, ang, r, bladeAlpha);
            }
        }

        // === 3b) Crisp diamond glint that pops at the very tip of the
        //     blade as it crosses peak speed. Sells the "flash of steel".
        if (t < 0.85) {
            const glintR = 9 + 6 * Math.sin(Math.min(1, t / 0.6) * Math.PI);
            const glintAlpha = (1 - Math.abs(t - 0.4) * 1.6);
            if (glintAlpha > 0.02) {
                ctx.save();
                ctx.translate(tipX, tipY);
                ctx.rotate(ang + Math.PI / 2);
                ctx.globalAlpha = glintAlpha;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(0, -glintR);
                ctx.lineTo(glintR * 0.32, 0);
                ctx.lineTo(0, glintR);
                ctx.lineTo(-glintR * 0.32, 0);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = glintAlpha * 0.6;
                const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, glintR * 2.4);
                halo.addColorStop(0, 'rgba(207,234,255,0.9)');
                halo.addColorStop(1, 'rgba(127,200,255,0)');
                ctx.fillStyle = halo;
                ctx.beginPath();
                ctx.arc(0, 0, glintR * 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // === 4) Impact bloom at the swing's end-point, ramps in late.
        if (t > 0.55) {
            const ipT = (t - 0.55) / 0.45;
            const endA = a1;
            const endX = cx + Math.cos(endA) * r;
            const endY = cy + Math.sin(endA) * r;
            const bloomR = 14 + 22 * ipT;
            const bAlpha = (1 - ipT) * 1.0;
            const bloom = ctx.createRadialGradient(endX, endY, 0, endX, endY, bloomR);
            bloom.addColorStop(0, `rgba(255,255,255,${0.9 * bAlpha})`);
            bloom.addColorStop(0.45, `rgba(207,234,255,${0.55 * bAlpha})`);
            bloom.addColorStop(1, 'rgba(127,200,255,0)');
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(endX, endY, bloomR, 0, Math.PI * 2);
            ctx.fill();
            // Cross spark.
            ctx.globalAlpha = bAlpha * 0.85;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            const spike = bloomR * 1.4;
            ctx.beginPath();
            ctx.moveTo(endX - spike, endY); ctx.lineTo(endX + spike, endY);
            ctx.moveTo(endX, endY - spike); ctx.lineTo(endX, endY + spike);
            ctx.stroke();
        }

        // === 5) Pivot flash at the boss's hand. Subtle compared to the
        // blade so the eye stays on the cut.
        const pivotAlpha = (1 - t) * 0.7;
        if (pivotAlpha > 0.02) {
            const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
            pg.addColorStop(0, `rgba(255,255,255,${pivotAlpha})`);
            pg.addColorStop(1, 'rgba(127,200,255,0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fill();
        }

        // === 6) Slow wind-dust drifting *inside* the cut path. Sells the
        // sense that the slash displaced air all along its sweep, not
        // just at the tip.
        for (const d of s._fx.dust) {
            if (d.f > t) continue;
            const localT = Math.max(0, (elapsed - d.f * totalDur) / totalDur);
            if (localT > d.life) continue;
            const a = a0 + (a1 - a0) * d.f + d.side;
            const rr = d.radial + d.drift * localT * 60;
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            const da = (1 - localT / d.life) * 0.55;
            ctx.globalAlpha = da;
            ctx.fillStyle = '#cfeaff';
            ctx.beginPath();
            ctx.arc(x, y, 2.2 * (1 - localT / d.life), 0, Math.PI * 2);
            ctx.fill();
        }

        // === 7) Ice motes: bright pinprick particles ejected outward
        // along the cut. Each mote spawns when the swing reaches its
        // fraction `f`, then flies along the radial direction.
        for (const m of s._fx.motes) {
            if (m.f > t) continue;
            const localT = Math.max(0, (elapsed - m.f * totalDur) / 1000);
            const a = a0 + (a1 - a0) * m.f + m.side + m.drift * localT;
            const rr = m.radial + m.speed * localT;
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            const ma = Math.max(0, 1 - localT * 2.6);
            if (ma <= 0.02) continue;
            ctx.globalAlpha = ma;
            // Outer halo
            const mg = ctx.createRadialGradient(x, y, 0, x, y, m.size * 3);
            mg.addColorStop(0, 'rgba(255,255,255,0.95)');
            mg.addColorStop(1, 'rgba(127,200,255,0)');
            ctx.fillStyle = mg;
            ctx.beginPath();
            ctx.arc(x, y, m.size * 3, 0, Math.PI * 2);
            ctx.fill();
            // Bright core
            ctx.globalAlpha = ma * 0.95;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, m.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Draw a stylized katana whose tip lands on the swing arc. Anchored at
    // the boss's hand (cx, cy) and angled along `ang`. Proportions follow
    // a real katana: ~70% blade, small round tsuba guard, dark wrapped
    // tsuka. The blade has a slight curve (sori), tapers ~30% toward the
    // tip, and carries a bright cutting edge plus a softer mune ridge.
    // `arcR` is the swing radius — the kissaki (tip) lands at arcR*0.96.
    // `alpha` is a global multiplier for the slash-age fade.
    _drawKatanaBlade(ctx, cx, cy, ang, arcR, alpha) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        // After this transform, +X is "out from the hand toward the tip"
        // and +Y is "to the cutting-edge side". We design in this frame.
        // Pull layout knobs from arcR so the katana scales with reach.
        const totalLen   = arcR * 0.96;          // hand to kissaki
        const tsukaLen   = totalLen * 0.22;      // ~22% handle
        const habakiLen  = totalLen * 0.04;      // tiny collar
        const bladeLen   = totalLen - tsukaLen - habakiLen;
        const tsubaR     = totalLen * 0.05;      // small round guard
        const baseW      = Math.max(3.2, arcR * 0.034);
        const tipW       = baseW * 0.7;          // 30% taper
        // Slight upward curve (sori). Positive Y in our local frame is the
        // edge side; the spine should curve gently toward it.
        const sori       = Math.max(2.0, arcR * 0.020);

        // Where the blade starts along +X (after handle + habaki).
        const bx0 = tsukaLen + habakiLen;
        const bx1 = bx0 + bladeLen;
        const tipX = bx1;
        // The kissaki tip lifts slightly off-axis (toward the edge).
        const tipY = -sori * 0.35;

        // ---- Tsuka (handle) -------------------------------------------
        // Dark indigo body with a leather-wrapped diamond pattern.
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#1a1c2a';
        ctx.strokeStyle = '#0a0d18';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(0, -baseW * 0.85, tsukaLen, baseW * 1.7);
        ctx.fill();
        ctx.stroke();
        // Wrap diamonds (ito) along the tsuka.
        ctx.strokeStyle = '#3a4060';
        ctx.lineWidth = 0.8;
        const wraps = 5;
        for (let i = 1; i < wraps; i++) {
            const wx = (i / wraps) * tsukaLen;
            ctx.beginPath();
            ctx.moveTo(wx - tsukaLen * 0.06, -baseW * 0.85);
            ctx.lineTo(wx + tsukaLen * 0.06, baseW * 0.85);
            ctx.moveTo(wx + tsukaLen * 0.06, -baseW * 0.85);
            ctx.lineTo(wx - tsukaLen * 0.06, baseW * 0.85);
            ctx.stroke();
        }
        // Kashira (pommel cap) — tiny darker block at the butt.
        ctx.fillStyle = '#0a0d18';
        ctx.fillRect(-tsukaLen * 0.04, -baseW * 0.95, tsukaLen * 0.06, baseW * 1.9);

        // ---- Tsuba (guard) -------------------------------------------
        // Small disc with a thin rim and a slim slot for the blade tang.
        ctx.fillStyle = '#2a2f44';
        ctx.strokeStyle = '#7fc8ff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(tsukaLen, 0, tsubaR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0a0d18';
        ctx.fillRect(tsukaLen - 1.4, -baseW * 0.55, 2.8, baseW * 1.1);

        // ---- Habaki (blade collar) -----------------------------------
        ctx.fillStyle = '#cfeaff';
        ctx.fillRect(tsukaLen + tsubaR * 0.1, -baseW * 0.55,
                     habakiLen, baseW * 1.1);

        // ---- Blade ---------------------------------------------------
        // Build blade silhouette as a path with a curved spine and edge
        // so it looks like a real, slightly-curved katana — not a slab.
        // Local control points for the silhouette:
        //   - Spine (back) runs from (bx0, -baseW/2) to (tipX, tipY - tipW/4),
        //     bending upward in the middle by `sori`.
        //   - Edge runs from (bx0, +baseW/2) to (tipX, tipY + tipW/4),
        //     bending in the same direction so width tapers cleanly.
        const spineY0 = -baseW * 0.5;
        const spineY1 = tipY - tipW * 0.25;
        const edgeY0  = baseW * 0.5;
        const edgeY1  = tipY + tipW * 0.25;
        const midX    = (bx0 + tipX) * 0.5;

        // Outer silhouette fill (steel body).
        ctx.beginPath();
        ctx.moveTo(bx0, spineY0);
        ctx.quadraticCurveTo(midX, spineY0 - sori, tipX, spineY1);
        // Kissaki tip — slight angle line to suggest the yokote.
        ctx.lineTo(tipX + tipW * 0.4, tipY);
        ctx.lineTo(tipX, edgeY1);
        ctx.quadraticCurveTo(midX, edgeY0 - sori * 0.6, bx0, edgeY0);
        ctx.closePath();
        // Steel gradient: cool dark on spine side, lighter near edge.
        const bladeGrad = ctx.createLinearGradient(0, spineY0 - sori, 0, edgeY0);
        bladeGrad.addColorStop(0, '#3a4862');     // mune side
        bladeGrad.addColorStop(0.55, '#a8c8e8');  // body
        bladeGrad.addColorStop(1, '#f0fbff');     // edge side
        ctx.fillStyle = bladeGrad;
        ctx.fill();
        // Outline for crispness.
        ctx.strokeStyle = '#dfeefb';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Hamon line (temper line) — gentle wavy line just above the
        // cutting edge, the iconic katana detail.
        ctx.save();
        ctx.beginPath();
        const hamonOffset = baseW * 0.18;
        ctx.moveTo(bx0 + 2, edgeY0 - hamonOffset);
        for (let i = 1; i <= 6; i++) {
            const f = i / 6;
            const hx = bx0 + (tipX - bx0) * f;
            const wob = Math.sin(f * Math.PI * 3.2) * baseW * 0.08;
            const hy = edgeY0 - hamonOffset - sori * 0.6 * f + wob;
            ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.restore();

        // Bright cutting edge: thin glow line right along the blade's
        // edge. This is what reads as "razor sharp" at speed.
        ctx.beginPath();
        ctx.moveTo(bx0, edgeY0);
        ctx.quadraticCurveTo(midX, edgeY0 - sori * 0.6, tipX, edgeY1);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = alpha;
        ctx.stroke();
        // Soft outer bloom along the edge to fake bloom at speed.
        ctx.globalAlpha = alpha * 0.45;
        ctx.strokeStyle = '#cfeaff';
        ctx.lineWidth = 3.6;
        ctx.stroke();

        // Tiny tip highlight where the kissaki meets the air.
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tipX + tipW * 0.15, tipY, Math.max(1.4, tipW * 0.45), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ============================================================
// Yukikon's SMG bullet — small fast straight-flying tracer.
// Low damage; the threat comes from sustained fire and Yukikon's
// melee mixups. Lives in game.yukikonBullets[].
// ============================================================
class YukikonBullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 4;
        const speed = 39;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.spawnTime = Date.now();
        this.maxLifetime = 700;
        this.shouldDestroy = false;
        this.damage = Math.max(1, Math.round(3 * YUKIKON_DAMAGE_MULT));
        this.trail = [];
    }

    update() {
        const now = Date.now();
        if (now - this.spawnTime > this.maxLifetime) { this.shouldDestroy = true; return; }

        this.x += this.vx;
        this.y += this.vy;
        this.trail.push({ x: this.x, y: this.y, t: now });
        while (this.trail.length && now - this.trail[0].t > 120) this.trail.shift();

        if (this.x < -30 || this.y < -30 ||
            this.x > GAME_CONFIG.WIDTH + 30 ||
            this.y > GAME_CONFIG.HEIGHT + 30) {
            this.shouldDestroy = true;
            return;
        }

        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(this.x - px, this.y - py);
            if (d < 12) {
                game.player.takeDamage(this.damage);
                this.shouldDestroy = true;
                bossFX.addFlash(this.x, this.y, 10, '#bfeaff', 120, 0.7);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const age = (Date.now() - p.t) / 120;
            const a = Math.max(0, 1 - age) * 0.7;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#7fc8ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5 * (1 - age), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Bright tracer core
        ctx.fillStyle = '#e0f4ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7fc8ff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ============================================================
// Yukikon shadow clone — decoy that sits in game.enemies so
// targeting / aim-assist / projectiles all treat it as a real
// boss-sized target. takeDamage() never reduces health on the
// real Yukikon: clones are pure damage sponges that exist for
// a limited duration. Lifetime is controlled by the parent
// (boss.shadowEndAt) which sets shouldDestroy on expiry.
// ============================================================
class YukikonShadowClone {
    constructor(x, y, phase, parent) {
        this.x = x;
        this.y = y;
        this.width = 32;
        this.height = 32;
        this.phase = phase;
        this.parent = parent;
        this.vx = 0;
        this.vy = 0;
        this.shouldDestroy = false;
        this.notTargetable = false;
        this.isClone = true;
        this.isYukikonClone = true;
        // Prevent Boss/elite checks elsewhere from misclassifying us.
        this.isBoss = false;
        // Hit flash state — visual only.
        this.hitFlashUntil = 0;
    }

    update() {
        // Movement is driven entirely by Yukikon._updateShadow(); the
        // clone itself just exists. Kill the clone if the parent is
        // dead/gone — defensive, parent normally does this.
        if (!this.parent || this.parent.health <= 0) {
            this.shouldDestroy = true;
        }
    }

    // Damage no-op. Returning false signals "not killed" to all weapons,
    // but we still surface a flash + ghost-style "MISS" indicator so the
    // player gets feedback that they hit a decoy.
    takeDamage(_damage, _source) {
        const now = Date.now();
        this.hitFlashUntil = now + 160;
        bossFX.addFlash(this.x + this.width / 2, this.y + this.height / 2, 22, '#bfeaff', 200, 0.7);
        return false;
    }

    // Various weapons probe these; treat clones the same as the boss
    // would so they don't break combat math.
    getImpaled() { /* clones can't be impaled */ }
    releaseImpale() { /* no-op */ }
    checkDodge() { /* no-op */ }
    checkBulletDodge() { /* no-op */ }
    checkMissileDodge() { /* no-op */ }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const flashing = Date.now() < this.hitFlashUntil;
        const baseAlpha = flashing ? 0.55 : 0.22;
        // Reuse parent silhouette draw for visual parity.
        if (this.parent && typeof this.parent._drawSilhouette === 'function') {
            this.parent._drawSilhouette(ctx, cx, cy, baseAlpha);
        } else {
            ctx.save();
            ctx.globalAlpha = baseAlpha;
            ctx.fillStyle = '#7fc8ff';
            ctx.beginPath();
            ctx.arc(cx, cy, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Subtle "decoy" pulse so a careful player can tell clones apart
        // from the real boss with practice.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.25 + 0.25 * Math.sin(Date.now() / 140 + this.phase * 4);
        ctx.globalAlpha = pulse * (flashing ? 1.4 : 1.0);
        ctx.strokeStyle = '#cfeaff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ============================================================
// Yukikon's homing dagger — small projectile that tracks the
// player for ~600ms then flies straight. Despawns on hit or
// after maxLifetime. Lives in game.yukikonDaggers[].
// ============================================================
class YukikonDagger {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.width = 10;
        this.height = 10;
        // Initial-version dagger with bullet speed doubled (6 -> 12).
        const speed = 36;
        this.speed = speed;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.spawnTime = Date.now();
        this.guideDuration = 450;
        this.guideTurnRate = 0.19;
        this.maxLifetime = 3000;
        this.shouldDestroy = false;
        this.damage = Math.round(8 * YUKIKON_DAMAGE_MULT);
        this.trail = [];
    }

    update() {
        const now = Date.now();
        const age = now - this.spawnTime;
        if (age > this.maxLifetime) { this.shouldDestroy = true; return; }

        // Track player while in guide window.
        if (age < this.guideDuration && game.player) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const desired = Math.atan2(py - this.y, px - this.x);
            let diff = desired - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turn = this.guideTurnRate;
            this.angle += Math.max(-turn, Math.min(turn, diff));
            this.vx = Math.cos(this.angle) * this.speed;
            this.vy = Math.sin(this.angle) * this.speed;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.trail.push({ x: this.x, y: this.y, t: now });
        while (this.trail.length && now - this.trail[0].t > 200) this.trail.shift();

        if (this.x < -40 || this.y < -40 ||
            this.x > GAME_CONFIG.WIDTH + 40 ||
            this.y > GAME_CONFIG.HEIGHT + 40) {
            this.shouldDestroy = true;
            return;
        }

        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(this.x - px, this.y - py);
            if (d < 16) {
                game.player.takeDamage(this.damage);
                this.shouldDestroy = true;
                bossFX.addFlash(this.x, this.y, 18, '#bfeaff', 180, 0.9);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const age = (Date.now() - p.t) / 200;
            const a = Math.max(0, 1 - age) * 0.6;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#a0e0ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3 * (1 - age), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#e0f4ff';
        ctx.strokeStyle = '#3070c0';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(-6, -3); ctx.lineTo(-4, 0); ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
