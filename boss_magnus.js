// Magnus - Mech Executive Boss
// Heavy artillery archetype: twin shoulder turret pods, predictive lasers,
// AOE artillery barrages, and a phase-2 "overload" state where the shoulder
// pods detach into autonomous drone turrets.

class Magnus extends GameObject {
    constructor(x, y) {
        super(x, y, 70, 70, '#5a6470');
        this.maxHealth = 420;
        this.health = this.maxHealth;
        this.speed = 28;
        this.dodgeSpeed = 36;

        // Boss dodge system (lower than CrimsonKing - Magnus is a heavy unit)
        this.dodgeChance = 0.10;
        this.missileDodgeChance = 0.45;
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 220;
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0;
        this.dodgeCooldown = 900;

        this.damageWindow = {
            accumulated: 0,
            windowStart: Date.now()
        };

        // Impale/stun support (sword pierce)
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = false;
        this.stunEndTime = 0;

        // Shared boss missile params
        this.missileDamage = 8;
        this.missileSpeed = 22;
        this.spawnTime = Date.now();

        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // Movement: stay at long-medium range, prefer slow strafe
        this.aiState = 'strafe';
        this.aiStateTimer = 0;
        this.idealDistance = 480;
        this.minDistance = 320;
        this.maxDistance = 640;
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.lastAiUpdate = Date.now();

        // Combat AI
        this.combatPhase = 'idle';
        this.activeMove = null;
        this.combatRecoverUntil = 0;
        this.aiMemory = createBossAIMemory();
        this.telegraphs = [];
        this.firstDecisionAt = this.spawnTime + 800;
        this.movesTable = this._buildMovesTable();

        // Phase 2 ("overload"): triggered at 50% HP. Shoulder pods detach.
        this.phase = 1;
        this.phase2TriggeredAt = 0;
        this.podsDetached = false;
        this.shoulderPods = [];

        // Internal turret aim state - each pod has its own laser
        this.turretAimAngles = [-Math.PI / 2, -Math.PI / 2];
        this.turretChargeUntil = [0, 0];

        // Shield state - new threshold-based model:
        // - Hits dealing <= 40 dmg are FULLY absorbed (0 hull damage). Shield
        //   loses HP equal to the incoming damage.
        // - Hits dealing 40 < dmg <= 200 are partially absorbed. The
        //   reduction ratio falls off smoothly: heavy hits leak more.
        // - Hits dealing > 200 dmg break the shield catastrophically: the
        //   hull eats 100% of the damage AND the shield loses 2x the damage
        //   value, almost guaranteeing a shatter.
        this.shieldActive = false;
        this.shieldHp = 0;
        this.shieldMaxHp = Math.round(this.maxHealth * 0.5);
        this.shieldFullAbsorbThreshold = 40;
        this.shieldPartialAbsorbCap = 200;
        this.shieldOverloadThreshold = 200;
        this.shieldBreakDamage = 35;       // AOE on break
        this.shieldBreakRadius = 130;
        this.shieldBornAt = 0;             // for ramp-up VFX

        // Heading angle (for hull rotation visual)
        this.facing = 0;

        this.setRandomDirection();
    }

    setRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    // ============ Standard Boss damage / stun / hit feedback ============
    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage, source) : damage;
        const now = Date.now();
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        let actualDamage = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        this.damageWindow.accumulated += damage;

        // Shield processing — threshold-based absorption model.
        if (this.shieldActive && this.shieldHp > 0) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const fullThr = this.shieldFullAbsorbThreshold;   // 40
            const cap = this.shieldPartialAbsorbCap;          // 200
            const overload = this.shieldOverloadThreshold;    // 200

            if (actualDamage > overload) {
                // ---- Overload: shield is shattered by a single huge hit. ----
                // Hull eats the full damage, AND the shield loses 2x as a
                // penalty: a clear "don't tank big bursts with this barrier".
                const shieldLoss = Math.round(actualDamage * 2);
                this.shieldHp -= shieldLoss;
                bossFX.addFlash(cx, cy, this.width * 1.4, '#ff4040', 320, 0.9);
                bossFX.addShockwave(cx, cy, this.width * 0.7, this.width * 1.6,
                    '#ff6060', 360, 4, 0.85);
                if (typeof bossFX.addShake === 'function') bossFX.addShake(5, 240);
                this.hitIndicators.push({
                    damage: actualDamage, isShield: false,
                    startTime: now,
                    x: cx + (Math.random() - 0.5) * 50,
                    y: this.y - 8 + Math.random() * 6
                });
                // actualDamage is unchanged: 100% leaks to hull.
                if (this.shieldHp <= 0) this._breakShield();
            } else if (actualDamage <= fullThr) {
                // ---- Full absorption: small hits cost shield = damage. ----
                this.shieldHp -= actualDamage;
                bossFX.addFlash(cx, cy, this.width * 0.7, '#ffd060', 200, 0.55);
                bossFX.addShockwave(cx, cy, this.width * 0.4, this.width * 0.9,
                    '#ffd070', 200, 1.4, 0.45);
                this.hitIndicators.push({
                    damage: actualDamage, isShield: true,
                    startTime: now,
                    x: cx + (Math.random() - 0.5) * 50,
                    y: this.y - 8 + Math.random() * 6
                });
                actualDamage = 0;
                if (this.shieldHp <= 0) this._breakShield();
            } else {
                // ---- Partial absorption between 40 and 200. ----
                // Reduction ratio: 1.0 at threshold (full absorb), falling
                // smoothly to a small floor near the cap. A power < 1 keeps
                // protection high in the lower part of the band, then drops
                // off sharply as damage approaches 200.
                const span = cap - fullThr;
                const t = Math.min(1, (actualDamage - fullThr) / span); // 0..1
                const reductionRatio = Math.max(0.05, 1 - Math.pow(t, 0.7));
                const absorbed = Math.round(actualDamage * reductionRatio);
                const leak = actualDamage - absorbed;
                this.shieldHp -= absorbed;
                bossFX.addFlash(cx, cy, this.width * 0.95, '#ffb040', 230, 0.65);
                bossFX.addShockwave(cx, cy, this.width * 0.55, this.width * 1.05,
                    '#ffc060', 240, 1.8, 0.55);
                this.hitIndicators.push({
                    damage: absorbed, isShield: true,
                    startTime: now,
                    x: cx + (Math.random() - 0.5) * 50,
                    y: this.y - 8 + Math.random() * 6
                });
                actualDamage = leak;
                if (this.shieldHp <= 0) this._breakShield();
            }
        }

        if (actualDamage > 0) {
            this.health -= actualDamage;
            this.addHitIndicator(actualDamage);
        }
        return this.health <= 0;
    }

    // Activate the new barrier shield (called by the barrier move).
    activateShield() {
        this.shieldActive = true;
        this.shieldHp = this.shieldMaxHp;
        this.shieldBornAt = Date.now();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Spin-up VFX
        bossFX.addFlash(cx, cy, this.width * 1.3, '#ffd060', 460, 0.9);
        bossFX.addShockwave(cx, cy, this.width * 0.5, this.width * 1.6,
            '#ffb040', 520, 4, 0.7);
    }

    // Shield HP reached 0: explode for AOE, then drop the barrier.
    _breakShield() {
        this.shieldActive = false;
        this.shieldHp = 0;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Big break VFX
        bossFX.addFlash(cx, cy, this.shieldBreakRadius * 0.9, '#fff0a0', 380, 1.0);
        bossFX.addShockwave(cx, cy, this.width * 0.6, this.shieldBreakRadius * 1.4,
            '#ffb040', 540, 6, 0.85);
        bossFX.addShockwave(cx, cy, this.width * 0.4, this.shieldBreakRadius * 1.0,
            '#fff0a0', 360, 3, 0.7);
        bossFX.spawnBurst(cx, cy, 28, {
            color: '#ffd060',
            speedMin: 3, speedMax: 8,
            sizeMin: 2, sizeMax: 4.5,
            lifeMs: 520, drag: 0.92
        });
        if (typeof bossFX.addShake === 'function') bossFX.addShake(7, 280);
        // AOE damage to player if in radius
        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(px - cx, py - cy);
            if (d <= this.shieldBreakRadius) {
                // Falloff: full damage at 0, half at edge
                const falloff = 1 - (d / this.shieldBreakRadius) * 0.5;
                const dmg = Math.max(1, Math.round(this.shieldBreakDamage * falloff));
                game.player.takeDamage(dmg);
                // Knockback push
                if (d > 0.0001) {
                    const kx = (px - cx) / d;
                    const ky = (py - cy) / d;
                    game.player.vx += kx * 16;
                    game.player.vy += ky * 16;
                }
                if (typeof updateUI === 'function') updateUI();
            }
        }
    }

    addHitIndicator(damage) {
        const now = Date.now();
        this.hitIndicators.push({
            damage,
            startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 60,
            y: this.y + this.height + 15 + Math.random() * 10
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
            const offsetY = progress * 30;
            ctx.save();
            ctx.globalAlpha = alpha;
            const isHeal = !!ind.isHeal;
            const isShield = !!ind.isShield;
            ctx.fillStyle = isHeal ? '#00ff66' : (isShield ? '#7fdfff' : '#ffaa30');
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            const displayY = ind.y - offsetY;
            const text = isHeal ? `+${ind.damage}` : (isShield ? `■ ${ind.damage}` : `HIT ${ind.damage}`);
            ctx.strokeText(text, ind.x, displayY);
            ctx.fillText(text, ind.x, displayY);
            ctx.restore();
        });
    }

    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        this.vx = 0;
        this.vy = 0;
    }

    releaseImpale() {
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = true;
        this.stunEndTime = Date.now() + 250;
        this.vx = 0;
        this.vy = 0;
    }

    // ============ Movement AI (FSM) ============
    updateAI() {
        if (!game.player) return;
        const now = Date.now();
        const dt = (now - this.lastAiUpdate) / 1000;
        this.lastAiUpdate = now;

        const bossCX = this.x + this.width / 2;
        const bossCY = this.y + this.height / 2;
        const playerCX = game.player.x + game.player.width / 2;
        const playerCY = game.player.y + game.player.height / 2;
        const dx = playerCX - bossCX;
        const dy = playerCY - bossCY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const toPlayerAngle = Math.atan2(dy, dx);

        this.aiStateTimer -= dt;

        if (dist < this.minDistance) {
            this.aiState = 'retreat';
            this.aiStateTimer = 0.7 + Math.random() * 0.5;
        } else if (dist > this.maxDistance) {
            this.aiState = 'approach';
            this.aiStateTimer = 0.9 + Math.random() * 0.4;
        } else if (this.aiStateTimer <= 0) {
            this.aiState = 'strafe';
            this.aiStateTimer = 2.2 + Math.random() * 1.6;
            if (Math.random() < 0.4) this.strafeDirection *= -1;
        }

        let moveAngle = 0;
        let moveSpeed = this.speed;
        switch (this.aiState) {
            case 'strafe': {
                const perpAngle = toPlayerAngle + (Math.PI / 2) * this.strafeDirection;
                const distError = dist - this.idealDistance;
                const correctionWeight = Math.min(Math.abs(distError) / 180, 0.6);
                const correctionAngle = distError > 0 ? toPlayerAngle : toPlayerAngle + Math.PI;
                moveAngle = this.lerpAngle(perpAngle, correctionAngle, correctionWeight);
                moveSpeed = this.speed * 0.7; // heavy unit, slow strafe
                break;
            }
            case 'retreat': {
                moveAngle = toPlayerAngle + Math.PI + (Math.random() - 0.5) * 0.5;
                moveSpeed = this.speed * 1.0;
                break;
            }
            case 'approach': {
                moveAngle = toPlayerAngle + (Math.random() - 0.5) * 0.3;
                moveSpeed = this.speed * 0.85;
                break;
            }
        }

        const margin = 80;
        let bx = 0, by = 0;
        if (bossCX < margin) bx = (margin - bossCX) / margin;
        else if (bossCX > GAME_CONFIG.WIDTH - margin) bx = (GAME_CONFIG.WIDTH - margin - bossCX) / margin;
        if (bossCY < margin) by = (margin - bossCY) / margin;
        else if (bossCY > GAME_CONFIG.HEIGHT - margin) by = (GAME_CONFIG.HEIGHT - margin - bossCY) / margin;

        const finalVx = Math.cos(moveAngle) * moveSpeed + bx * moveSpeed * 1.5;
        const finalVy = Math.sin(moveAngle) * moveSpeed + by * moveSpeed * 1.5;
        const smoothing = 0.08; // heavy: smoother
        this.vx += (finalVx - this.vx) * smoothing;
        this.vy += (finalVy - this.vy) * smoothing;

        // Hull facing slowly tracks player
        const desiredFacing = toPlayerAngle;
        this.facing = this.lerpAngle(this.facing, desiredFacing, 0.05);
    }

    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return a + diff * t;
    }

    // ============ Combat AI (utility move selector) ============
    updateCombatAI() {
        if (!game.player) return;
        const now = Date.now();

        // Phase transition at 50% HP
        if (this.phase === 1 && this.health / this.maxHealth <= 0.5) {
            this._enterPhase2();
        }

        if (this.combatPhase === 'commit' && this.activeMove) {
            const m = this.activeMove;
            if (m.tick) m.tick(this, now);
            if (m.isDone(this, now)) {
                if (m.onEnd) m.onEnd(this);
                this.activeMove = null;
                this.combatPhase = 'recover';
                this.combatRecoverUntil = now + (m.recoveryMs || 300);
            }
            return;
        }

        if (this.combatPhase === 'recover') {
            if (now >= this.combatRecoverUntil) this.combatPhase = 'idle';
            else return;
        }

        if (now < this.firstDecisionAt) return;
        if (now - this.aiMemory.lastMoveTime < 400) return;

        const ctx = buildBossAIContext(this);
        const chosen = selectBossMove(this.movesTable, this.aiMemory, ctx);
        if (!chosen) return;

        commitBossMove(chosen, this.aiMemory, now);
        const state = chosen.start(this, ctx);
        if (!state) {
            this.combatPhase = 'idle';
            return;
        }
        this.activeMove = state;
        this.combatPhase = 'commit';
    }

    _enterPhase2() {
        this.phase = 2;
        this.phase2TriggeredAt = Date.now();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Big visual: shockwave + flash + sparks
        bossFX.addFlash(cx, cy, 180, '#ffb030', 600, 1.0);
        bossFX.addShockwave(cx, cy, 30, 280, '#ffd060', 800, 8, 0.85);
        bossFX.addShake(8, 500);
        bossFX.spawnBurst(cx, cy, 28, {
            color: '#ffc040',
            speedMin: 3, speedMax: 9,
            sizeMin: 2, sizeMax: 5,
            lifeMs: 700, drag: 0.9
        });
        // Spawn detached shoulder pods
        this._detachShoulderPods();
    }

    _detachShoulderPods() {
        if (this.podsDetached) return;
        this.podsDetached = true;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            const pod = new MagnusShoulderPod(cx + side * 50, cy - 30, side);
            this.shoulderPods.push(pod);
            // Register pod into the global enemy list so player weapons / lock-on
            // can target it as a normal enemy.
            if (typeof game !== 'undefined' && game.enemies) game.enemies.push(pod);
        }
    }

    // ============ Moves Table ============
    _buildMovesTable() {
        const boss = this;
        return [
            // Move 1: Twin Laser Snipe
            // Long telegraph, both shoulder pods independently aim & fire piercing beams.
            // Heavy reward, long recovery (good punish window).
            {
                id: 'twinLaserSnipe',
                cooldown: 6500,
                canUse: (ctx) => ctx.dist > 200,
                score: (ctx) => {
                    let s = 1.5;
                    if (ctx.dist > 350) s += 0.6;
                    if (ctx.hpPct > 0.5) s += 0.3;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 900;
                    const fireMs = 380;
                    const startedAt = Date.now();
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 700,
                        fired: false,
                        beams: null,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            // Twin beam is owned by the chassis: always fire from
                            // the body's shoulder mounts, even after pods detach.
                            const pods = boss._getBodyShoulderOrigins();
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                if (game.player) {
                                    const pcx = game.player.x + game.player.width / 2;
                                    const pcy = game.player.y + game.player.height / 2;
                                    for (let i = 0; i < pods.length; i++) {
                                        const pod = pods[i];
                                        const desired = Math.atan2(pcy - pod.y, pcx - pod.x);
                                        b2.turretAimAngles[i] = b2.lerpAngle(b2.turretAimAngles[i], desired, 0.12);
                                    }
                                }
                                return;
                            }
                            // Fire phase: lock beam direction once
                            if (!st.fired) {
                                st.fired = true;
                                st.beams = [];
                                for (let i = 0; i < pods.length; i++) {
                                    const pod = pods[i];
                                    const ang = b2.turretAimAngles[i];
                                    st.beams.push({
                                        x1: pod.x, y1: pod.y,
                                        x2: pod.x + Math.cos(ang) * 1600,
                                        y2: pod.y + Math.sin(ang) * 1600,
                                        angle: ang,
                                        ox: pod.x, oy: pod.y,
                                        damaged: false
                                    });
                                    bossFX.addFlash(pod.x, pod.y, 36, '#ffd060', 320, 1.0);
                                    boss._spawnLaserMuzzle(pod.x, pod.y, ang);
                                }
                                bossFX.addShake(5, 220);
                            }
                            // Damage tick: instant hit on first frame; beam visual lingers fireMs
                            if (st.beams && !st.beams[0].damaged) {
                                for (const beam of st.beams) {
                                    boss._damageAlongBeam(beam, 14);
                                    beam.damaged = true;
                                }
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs,
                        // Custom render hook (used by draw())
                        render: (b2, ctx, now) => {
                            const st = b2.activeMove;
                            const pods = boss._getBodyShoulderOrigins();
                            // Aim laser (telegraph): draw a thin red guide line
                            if (now < st.startedAt + st.telegraphMs) {
                                const tProgress = (now - st.startedAt) / st.telegraphMs;
                                for (let i = 0; i < pods.length; i++) {
                                    const pod = pods[i];
                                    const ang = b2.turretAimAngles[i];
                                    const x2 = pod.x + Math.cos(ang) * 1600;
                                    const y2 = pod.y + Math.sin(ang) * 1600;
                                    boss._drawAimLaser(ctx, pod.x, pod.y, x2, y2, tProgress);
                                }
                            } else if (st.beams) {
                                // Fire beam (visible lifetime)
                                const fireT = (now - (st.startedAt + st.telegraphMs)) / st.fireMs;
                                const alpha = Math.max(0, 1 - fireT);
                                for (const beam of st.beams) {
                                    if (typeof drawBeam === 'function') {
                                        drawBeam(ctx, {
                                            x1: beam.x1, y1: beam.y1,
                                            x2: beam.x2, y2: beam.y2,
                                            width: 10 * alpha + 2,
                                            scheme: 'gold',
                                            alpha,
                                            charge: 1
                                        });
                                    }
                                }
                            }
                        }
                    };
                }
            },
            // Move 2: Artillery Barrage
            // Boss freezes, lobs 5 high-arc shells with ground impact circles (AOE explosions).
            {
                id: 'artilleryBarrage',
                cooldown: 8000,
                canUse: () => true,
                score: (ctx) => {
                    let s = 1.3;
                    if (ctx.dist < 400) s += 0.4; // good area-deny when player is close-ish
                    if (ctx.hpPct < 0.7) s += 0.2;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 600;
                    const lobInterval = 220;
                    const shellCount = 5;
                    const totalLobMs = lobInterval * shellCount;
                    return {
                        startedAt: Date.now(),
                        telegraphMs,
                        totalMs: telegraphMs + totalLobMs,
                        recoveryMs: 600,
                        shellCount,
                        lobInterval,
                        nextLobIdx: 0,
                        nextLobAt: Date.now() + telegraphMs,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                return;
                            }
                            while (st.nextLobIdx < st.shellCount && now >= st.nextLobAt) {
                                boss._lobArtilleryShell(st.nextLobIdx);
                                st.nextLobIdx++;
                                st.nextLobAt += st.lobInterval;
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            },
            // Move 3: Pulse Cannon (chest particle cone)
            // Forward charge cone — fast multi-bullet burst spread at player.
            {
                id: 'pulseCannon',
                cooldown: 5500,
                canUse: () => true,
                score: (ctx) => {
                    let s = 1.2;
                    if (ctx.dist > 250 && ctx.dist < 550) s += 0.5;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 500;
                    const fireMs = 700;
                    const startedAt = Date.now();
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 450,
                        target: 18,
                        fired: 0,
                        nextFireAt: startedAt + telegraphMs,
                        intervalMs: 700 / 18,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                return;
                            }
                            while (st.fired < st.target && now >= st.nextFireAt) {
                                boss._firePulseShell(st.fired, st.target);
                                st.fired++;
                                st.nextFireAt += st.intervalMs;
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            },
            // Move 4: Shoulder Missile Swarm — 8 homing missiles fanned out
            {
                id: 'missileSwarm',
                cooldown: 7000,
                canUse: (ctx) => ctx.dist > 200,
                score: (ctx) => {
                    let s = 1.25;
                    if (ctx.dist > 400) s += 0.4;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 550;
                    const fireMs = 600;
                    const startedAt = Date.now();
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 500,
                        target: 8,
                        fired: 0,
                        nextFireAt: startedAt + telegraphMs,
                        intervalMs: fireMs / 8,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                return;
                            }
                            while (st.fired < st.target && now >= st.nextFireAt) {
                                boss._fireSwarmMissile(st.fired);
                                st.fired++;
                                st.nextFireAt += st.intervalMs;
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            },
            // Move 5: Overload Dash - charges through player, big shockwave
            {
                id: 'overloadDash',
                cooldown: 9000,
                canUse: (ctx) => ctx.dist > 180 && ctx.dist < 700,
                score: (ctx) => {
                    let s = 1.0;
                    if (ctx.dist > 280 && ctx.dist < 500) s += 0.5;
                    if (ctx.hpPct < 0.5) s += 0.3;
                    return s;
                },
                start: (b, ctx) => {
                    const telegraphMs = 750;
                    const dashMs = 480;
                    const startedAt = Date.now();
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    const dirX = Math.cos(ctx.angleToPlayer);
                    const dirY = Math.sin(ctx.angleToPlayer);
                    const tx = ctx.playerCX + dirX * 100;
                    const ty = ctx.playerCY + dirY * 100;
                    b.telegraphs.push(createTelegraphArrow(cx, cy, tx, ty, telegraphMs, '#ffaa30'));
                    return {
                        startedAt,
                        telegraphMs,
                        dashMs,
                        totalMs: telegraphMs + dashMs,
                        recoveryMs: 800,
                        dirX, dirY,
                        dashSpeed: 16,
                        launched: false,
                        lastTrailAt: 0,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                return;
                            }
                            b2.vx = st.dirX * st.dashSpeed;
                            b2.vy = st.dirY * st.dashSpeed;
                            const cx2 = b2.x + b2.width / 2;
                            const cy2 = b2.y + b2.height / 2;
                            if (!st.launched) {
                                st.launched = true;
                                bossFX.addFlash(cx2, cy2, 130, '#ffb040', 380, 1.0);
                                bossFX.addShockwave(cx2, cy2, 28, 220, '#ffc060', 540, 6, 0.85);
                                bossFX.addShake(7, 320);
                                bossFX.spawnBurst(cx2, cy2, 24, {
                                    color: '#ffc060',
                                    speedMin: 2.5, speedMax: 8,
                                    sizeMin: 2, sizeMax: 5, lifeMs: 540,
                                    spreadAngle: Math.PI / 1.4
                                });
                            }
                            // Trail particles + body damage on player contact
                            if (now - st.lastTrailAt > 28) {
                                st.lastTrailAt = now;
                                bossFX.spawnBurst(cx2, cy2, 4, {
                                    color: '#ffa040',
                                    speedMin: 1, speedMax: 3,
                                    sizeMin: 2, sizeMax: 3.5, lifeMs: 360,
                                    drag: 0.9
                                });
                            }
                            if (game.player && !game.player.isUntargetable && b2.collidesWith(game.player)) {
                                game.player.takeDamage(20 * MAGNUS_DAMAGE_MULT);
                                bossFX.addFlash(game.player.x + game.player.width / 2,
                                    game.player.y + game.player.height / 2, 60, '#ffd070', 240, 1.0);
                            }
                        },
                        onEnd: (b2) => {
                            // Final stop shockwave
                            const cx3 = b2.x + b2.width / 2;
                            const cy3 = b2.y + b2.height / 2;
                            bossFX.addShockwave(cx3, cy3, 12, 160, '#ffc060', 440, 5, 0.7);
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            },
            // Move 6: Barrier - puts up a separate-HP shield. While it's up,
            // most damage is absorbed into the shield pool. When the pool
            // hits 0 the shield explodes for AOE. The boss does NOT regen
            // while shielded; aggressive players can break it for a punish.
            {
                id: 'barrierUp',
                cooldown: 14000,
                canUse: (ctx) => {
                    // Only when not already shielded, and HP under 80%
                    if (ctx.boss.shieldActive) return false;
                    return ctx.hpPct < 0.8;
                },
                score: (ctx) => {
                    if (ctx.boss.shieldActive) return -10;
                    let s = 0.9 + (1 - ctx.hpPct) * 1.4; // hungrier for it as HP drops
                    if (ctx.hpPct < 0.4) s += 0.6;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 420;
                    const startedAt = Date.now();
                    bossFX.addFlash(b.x + b.width / 2, b.y + b.height / 2, 100, '#ffd060', 460, 0.85);
                    return {
                        startedAt,
                        telegraphMs,
                        totalMs: telegraphMs,
                        recoveryMs: 280,
                        activated: false,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                // Slow drift during windup
                                b2.vx *= 0.85; b2.vy *= 0.85;
                                return;
                            }
                            if (!st.activated) {
                                st.activated = true;
                                b2.activateShield();
                            }
                        },
                        isDone: (b2, now) => b2.activeMove.activated
                    };
                }
            },
            // Move 7: EMP Burst - phase-2 only, big radial pulse that pushes player + spawns shockwaves
            {
                id: 'empBurst',
                cooldown: 14000,
                canUse: (ctx) => ctx.boss.phase === 2,
                score: (ctx) => {
                    if (ctx.boss.phase !== 2) return -10;
                    let s = 1.4;
                    if (ctx.dist < 350) s += 0.6;
                    return s;
                },
                start: (b) => {
                    const telegraphMs = 850;
                    const burstMs = 600;
                    const startedAt = Date.now();
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    b.telegraphs.push(createTelegraphAura(cx, cy, b.width * 5.5, telegraphMs, '#ffb030'));
                    return {
                        startedAt,
                        telegraphMs,
                        burstMs,
                        totalMs: telegraphMs + burstMs,
                        recoveryMs: 900,
                        triggered: false,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                freezeBoss(b2);
                                return;
                            }
                            if (!st.triggered) {
                                st.triggered = true;
                                boss._fireEMPBurst();
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            }
        ];
    }

    // ============ Firing helpers ============
    _getPodOrigins() {
        // Returns world positions of the two shoulder turret pods.
        // In phase 1 they're attached to the chassis; in phase 2 use the detached pod entity positions.
        if (this.phase === 2 && this.podsDetached && this.shoulderPods.length === 2) {
            return this.shoulderPods.map(p => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 }));
        }
        return this._getBodyShoulderOrigins();
    }

    // Always returns the chassis shoulder-mount positions, regardless of phase.
    // Used for the twin-beam attack which is owned by the body even in phase 2
    // (so the detached pods can specialize in rockets / suppressing fire).
    _getBodyShoulderOrigins() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const off = 38;
        const perp = this.facing + Math.PI / 2;
        return [
            { x: cx + Math.cos(perp) * -off, y: cy + Math.sin(perp) * -off },
            { x: cx + Math.cos(perp) * off, y: cy + Math.sin(perp) * off }
        ];
    }

    _spawnLaserMuzzle(x, y, angle) {
        if (typeof drawMuzzleFlash === 'function') {
            // Muzzle is per-frame; here we just spawn FX particles + flash.
        }
        bossFX.spawnBurst(x, y, 8, {
            color: '#ffd060',
            speedMin: 2, speedMax: 6,
            sizeMin: 2, sizeMax: 4,
            lifeMs: 400, baseAngle: angle,
            spreadAngle: Math.PI / 3,
            drag: 0.9
        });
    }

    _drawAimLaser(ctx, x1, y1, x2, y2, progress) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Faint warning beam grows brighter as telegraph progresses
        const alpha = 0.15 + progress * 0.55;
        const dash = 16;
        const dashGap = 10;
        const offset = (Date.now() / 60) % (dash + dashGap);
        ctx.setLineDash([dash, dashGap]);
        ctx.lineDashOffset = -offset;
        ctx.strokeStyle = `rgba(255, 200, 80, ${alpha})`;
        ctx.lineWidth = 2 + progress * 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Charging dot at origin
        ctx.setLineDash([]);
        const r = 4 + progress * 8;
        const grad = ctx.createRadialGradient(x1, y1, 0, x1, y1, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#ffd060');
        grad.addColorStop(1, 'rgba(255, 180, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x1, y1, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _damageAlongBeam(beam, damage) {
        if (!game.player || game.player.isUntargetable) return;
        damage = Math.round(damage * MAGNUS_DAMAGE_MULT);
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const dx = beam.x2 - beam.x1;
        const dy = beam.y2 - beam.y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const nx = dx / len, ny = dy / len;
        const rx = px - beam.x1, ry = py - beam.y1;
        const t = Math.max(0, Math.min(len, rx * nx + ry * ny));
        const closestX = beam.x1 + nx * t;
        const closestY = beam.y1 + ny * t;
        const dist = Math.hypot(px - closestX, py - closestY);
        const beamRadius = 22;
        if (dist < beamRadius + game.player.width / 2) {
            game.player.takeDamage(damage);
            bossFX.addFlash(px, py, 60, '#ffd070', 280, 1.0);
            if (typeof drawImpactSparks === 'function') {
                drawImpactSparks({ x: px, y: py, count: 18, scheme: 'gold', speed: 6, lifeMs: 460 });
            }
        }
    }

    _lobArtilleryShell(idx) {
        if (!game.player) return;
        const pods = this._getPodOrigins();
        // Alternate between left/right pod for the lob origin
        const origin = pods[idx % 2];
        // Aim at the current valid target (player or decoy)
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(origin.x, origin.y) : null;
        if (!tc) return;
        const px = tc.x;
        const py = tc.y;
        // Predict landing position (slight lead, only meaningful for live player)
        const tvx = (tc.entity && tc.entity.vx) || 0;
        const tvy = (tc.entity && tc.entity.vy) || 0;
        const leadX = px + tvx * 24;
        const leadY = py + tvy * 24;
        // Spread shells around lead point
        const spread = 80;
        const offX = (Math.random() - 0.5) * spread * 2;
        const offY = (Math.random() - 0.5) * spread * 2;
        const targetX = Math.max(40, Math.min(GAME_CONFIG.WIDTH - 40, leadX + offX));
        const targetY = Math.max(40, Math.min(GAME_CONFIG.HEIGHT - 40, leadY + offY));
        if (!game.magnusShells) game.magnusShells = [];
        game.magnusShells.push(new MagnusArtilleryShell(origin.x, origin.y, targetX, targetY, 18));
        // Muzzle effect
        bossFX.addFlash(origin.x, origin.y, 24, '#ffb030', 220, 0.9);
        bossFX.spawnBurst(origin.x, origin.y, 6, {
            color: '#ffa040',
            speedMin: 2, speedMax: 5,
            sizeMin: 2, sizeMax: 3.5,
            lifeMs: 380,
            spreadAngle: Math.PI * 0.4,
            baseAngle: -Math.PI / 2
        });
    }

    _firePulseShell(idx, total) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const px = tc.x;
        const py = tc.y;
        const baseAngle = Math.atan2(py - cy, px - cx);
        const coneRad = Math.PI * 0.45;
        const t = total > 1 ? idx / (total - 1) : 0.5;
        const angle = baseAngle + (t - 0.5) * coneRad + (Math.random() - 0.5) * 0.06;
        const launchDist = this.width / 2 + 10;
        const lx = cx + Math.cos(angle) * launchDist;
        const ly = cy + Math.sin(angle) * launchDist;
        const speed = 16;
        if (!game.magnusBullets) game.magnusBullets = [];
        game.magnusBullets.push(new MagnusBullet(lx, ly, Math.cos(angle) * speed, Math.sin(angle) * speed, 6, 'gold'));
        bossFX.spawnBurst(lx, ly, 4, {
            color: '#ffd060',
            speedMin: 1.5, speedMax: 4,
            sizeMin: 1.5, sizeMax: 2.5,
            lifeMs: 280, baseAngle: angle,
            spreadAngle: Math.PI / 4
        });
        if (idx === 0) {
            bossFX.addFlash(cx, cy, 60, '#ffb030', 260, 0.85);
            bossFX.addShake(3, 180);
        }
    }

    _fireSwarmMissile(idx) {
        if (!game.player) return;
        const pods = this._getPodOrigins();
        const origin = pods[idx % 2];
        const cx = origin.x;
        const cy = origin.y;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const playerCX = tc.x;
        const playerCY = tc.y;
        const baseAngle = Math.atan2(playerCY - cy, playerCX - cx);
        const coneRad = Math.PI * 0.7;
        const t = 8 > 1 ? idx / (8 - 1) : 0.5;
        const angle = baseAngle + (t - 0.5) * coneRad;
        const launchDist = 14;
        const launchX = cx + Math.cos(angle) * launchDist;
        const launchY = cy + Math.sin(angle) * launchDist;
        const m = new Missile(launchX, launchY, playerCX, playerCY,
            this.missileDamage, this.missileSpeed * 1.0);
        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'magnus';
        m.delayStartTime = Date.now();
        m.delayDuration = 200;
        m.guideRange = 700;
        if (!game.bossMissiles) game.bossMissiles = [];
        game.bossMissiles.push(m);
        bossFX.spawnBurst(launchX, launchY, 5, {
            color: '#ffa040',
            speedMin: 1.8, speedMax: 4.5,
            sizeMin: 1.5, sizeMax: 3,
            lifeMs: 380,
            spreadAngle: Math.PI / 3,
            baseAngle: angle,
            drag: 0.9
        });
        if (idx === 0) {
            bossFX.addShake(3, 180);
        }
    }

    _fireEMPBurst() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // 3 expanding rings + radial bullet wave
        bossFX.addFlash(cx, cy, 220, '#ffd060', 600, 1.0);
        bossFX.addShockwave(cx, cy, 30, 380, '#ffd060', 700, 8, 0.9);
        bossFX.addShockwave(cx, cy, 30, 480, '#ffaa30', 900, 6, 0.7);
        bossFX.addShockwave(cx, cy, 30, 560, '#ff7020', 1100, 4, 0.5);
        bossFX.addShake(10, 600);
        // 24 bullets in a perfect circle
        const count = 24;
        if (!game.magnusBullets) game.magnusBullets = [];
        for (let i = 0; i < count; i++) {
            const ang = (i / count) * Math.PI * 2;
            const speed = 10;
            game.magnusBullets.push(new MagnusBullet(
                cx + Math.cos(ang) * 30,
                cy + Math.sin(ang) * 30,
                Math.cos(ang) * speed,
                Math.sin(ang) * speed,
                10, 'orange'
            ));
        }
    }

    // ============ Dodge helpers (sword/missile evasion) ============
    checkDodge() {
        // Magnus rarely dodges - heavy unit
        const now = Date.now();
        if (this.isDodging) return;
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        // Skip during commit phase
        if (this.combatPhase === 'commit') return;
        // Sword swing detection (player in close swing range)
        if (game.player && game.player.swordSlash && game.player.swordSlash.isActive) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const dist = Math.hypot(cx - px, cy - py);
            if (dist < 200 && Math.random() < this.dodgeChance) {
                this._startDodge(Math.atan2(cy - py, cx - px));
            }
        }
    }

    _startDodge(awayAngle) {
        const now = Date.now();
        this.isDodging = true;
        this.dodgeStartTime = now;
        this.lastDodgeTime = now;
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        const perp = awayAngle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        this.vx = Math.cos(perp) * this.dodgeSpeed;
        this.vy = Math.sin(perp) * this.dodgeSpeed;
        // Brief afterimage VFX
        bossFX.addFlash(this.x + this.width / 2, this.y + this.height / 2, 50, '#ffc060', 220, 0.6);
    }

    updateDodge() {
        if (!this.isDodging) return;
        if (Date.now() - this.dodgeStartTime >= this.dodgeDuration) {
            this.isDodging = false;
            this.vx = this.originalVx * 0.5;
            this.vy = this.originalVy * 0.5;
        }
    }

    // ============ Main update ============
    update() {
        // Tick & prune telegraphs (auto cleanup of expired entries)
        const now = Date.now();
        this.telegraphs = this.telegraphs.filter(t => now - t.startedAt < t.durationMs);

        if (this.stunned) {
            if (now >= this.stunEndTime) this.stunned = false;
            else {
                this.vx = 0; this.vy = 0;
                super.update();
                this.checkBounds();
                this._updateShoulderPods();
                return;
            }
        }
        if (this.isImpaled && this.impaledBy) {
            super.update();
            this.checkBounds();
            this._updateShoulderPods();
            return;
        }

        this.checkDodge();
        this.updateDodge();

        // Combat decisions (utility)
        this.updateCombatAI();

        // Movement only when not committing
        if (!this.isDodging && this.combatPhase !== 'commit') {
            this.updateAI();
        } else if (this.combatPhase === 'recover') {
            // Slow drift during recovery (vulnerable)
            this.vx *= 0.85;
            this.vy *= 0.85;
        }

        // Hard-clamp to bounds
        if (this.x <= 0) { this.x = 1; this.vx = Math.abs(this.vx); }
        if (this.x + this.width >= GAME_CONFIG.WIDTH) { this.x = GAME_CONFIG.WIDTH - this.width - 1; this.vx = -Math.abs(this.vx); }
        if (this.y <= 0) { this.y = 1; this.vy = Math.abs(this.vy); }
        if (this.y + this.height >= GAME_CONFIG.HEIGHT) { this.y = GAME_CONFIG.HEIGHT - this.height - 1; this.vy = -Math.abs(this.vy); }

        super.update();
        this.checkBounds();
        this._updateShoulderPods();
    }

    _updateShoulderPods() {
        if (!this.podsDetached) return;
        // Pods are now registered in game.enemies which handles update() and
        // draw(). Here we only prune dead refs from our auxiliary list so
        // drawShoulderPods() / _shoulderTurretCenters() stay consistent.
        for (let i = this.shoulderPods.length - 1; i >= 0; i--) {
            if (this.shoulderPods[i].shouldDestroy) this.shoulderPods.splice(i, 1);
        }
    }

    // ============ Draw ============
    draw(ctx) {
        // Telegraphs render under the boss
        renderBossTelegraphs(ctx, this.telegraphs);

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Shield aura (when active) - shows current shield HP as ring fill
        const now = Date.now();
        if (this.shieldActive && this.shieldHp > 0) {
            const hpPct = Math.max(0, Math.min(1, this.shieldHp / this.shieldMaxHp));
            const sinceBorn = now - this.shieldBornAt;
            // Spin-up scale during the first 250ms
            const bornScale = Math.min(1, sinceBorn / 250);
            const r = this.width * (0.85 + 0.1 * bornScale);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const spin = now / 700;
            ctx.translate(cx, cy);
            // Outer rotating dashed ring (alpha tied to hp)
            ctx.save();
            ctx.rotate(spin);
            ctx.globalAlpha = 0.55 * (0.4 + 0.6 * hpPct) * bornScale;
            ctx.strokeStyle = '#ffd070';
            ctx.lineWidth = 4;
            ctx.setLineDash([18, 10]);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            // Soft fill
            const fillAlpha = 0.35 + 0.45 * hpPct;
            const grad = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
            grad.addColorStop(0, 'rgba(255, 220, 120, 0)');
            grad.addColorStop(0.7, `rgba(255, 200, 80, ${(0.18 * fillAlpha).toFixed(3)})`);
            grad.addColorStop(1, `rgba(255, 140, 40, ${(0.5 * fillAlpha).toFixed(3)})`);
            ctx.globalAlpha = bornScale;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();
            // HP arc on top of ring (counter-clockwise empties as hp drops)
            ctx.globalAlpha = 0.95 * bornScale;
            ctx.strokeStyle = '#fff0b0';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const startA = -Math.PI / 2;
            ctx.arc(0, 0, r * 0.92, startA, startA + Math.PI * 2 * hpPct);
            ctx.stroke();
            // Pulsing inner glow when hp < 30% to telegraph imminent break
            if (hpPct < 0.3) {
                const pulse = 0.5 + 0.5 * Math.sin(now * 0.018);
                ctx.globalAlpha = 0.5 * pulse;
                ctx.strokeStyle = '#fff8c0';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Hull body - heavy armored chassis (rotates with facing)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facing);

        // Outer plate
        ctx.fillStyle = '#3c4450';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Inner panel
        ctx.fillStyle = '#525c6a';
        ctx.fillRect(-this.width / 2 + 6, -this.height / 2 + 6, this.width - 12, this.height - 12);

        // Center reactor core (pulse glow)
        const pulse = 0.7 + 0.3 * Math.sin(now / 220);
        const coreR = 12;
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.4, '#ffd060');
        coreGrad.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.globalAlpha = pulse;
        ctx.fillStyle = coreGrad;
        ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        // Front arrow plate (indicates facing)
        ctx.fillStyle = '#2a323d';
        ctx.beginPath();
        ctx.moveTo(this.width / 2 - 4, -this.height / 4);
        ctx.lineTo(this.width / 2 + 8, 0);
        ctx.lineTo(this.width / 2 - 4, this.height / 4);
        ctx.closePath();
        ctx.fill();

        // Rivets (4 corners)
        ctx.fillStyle = '#1c222b';
        const rivetR = 2.5;
        const rOff = this.width / 2 - 8;
        for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
            ctx.beginPath();
            ctx.arc(sx * rOff, sy * rOff, rivetR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Shoulder pods - drawn ATTACHED in phase 1, free entities draw themselves in phase 2
        if (!this.podsDetached) {
            this._drawAttachedShoulderPods(ctx);
        }

        // Active move custom render hook (e.g. laser beams)
        if (this.activeMove && this.activeMove.render) {
            this.activeMove.render(this, ctx, now);
        }

        // Health bar
        const barWidth = this.width;
        const barHeight = 6;
        const barY = this.y - 14;
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        const healthRatio = this.health / this.maxHealth;
        ctx.fillStyle = `rgb(${Math.floor(255 * (1 - healthRatio))}, ${Math.floor(220 * healthRatio + 35)}, 30)`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        // Phase divider mark on bar
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + barWidth * 0.5 - 1, barY - 1, 2, barHeight + 2);

        // Boss label
        ctx.fillStyle = '#ffb030';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(t('boss.MAGNUS_EXEC'), cx, this.y - 18);

        this.drawHitIndicators(ctx);

        // Impale visual
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#00CCFF';
            ctx.lineWidth = 6;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(t('boss.pierce'), cx, this.y - 28);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Stun visual
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Thruster flames (4 hull thrusters)
        this.drawThrusterFlames(ctx);

        // Lock indicator
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) this.drawLockIndicator(ctx);
        }
    }

    _drawAttachedShoulderPods(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const perp = this.facing + Math.PI / 2;
        const off = 38;
        for (let i = 0; i < 2; i++) {
            const side = i === 0 ? -1 : 1;
            const px = cx + Math.cos(perp) * off * side;
            const py = cy + Math.sin(perp) * off * side;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(this.turretAimAngles[i] || 0);
            // Pod base
            ctx.fillStyle = '#2c333d';
            ctx.fillRect(-12, -10, 24, 20);
            ctx.fillStyle = '#454f5d';
            ctx.fillRect(-10, -8, 20, 16);
            // Cannon barrel pointing along aim
            ctx.fillStyle = '#1d242d';
            ctx.fillRect(0, -3, 22, 6);
            ctx.fillStyle = '#5a6675';
            ctx.fillRect(2, -2, 18, 4);
            // Aim indicator dot at barrel tip
            const tipR = 2.5 + 1.2 * Math.sin(Date.now() / 180);
            const tipGrad = ctx.createRadialGradient(22, 0, 0, 22, 0, tipR + 4);
            tipGrad.addColorStop(0, '#ffd060');
            tipGrad.addColorStop(1, 'rgba(255, 140, 40, 0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.arc(22, 0, tipR + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    drawThrusterFlames(ctx) {
        const isMoving = Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1;
        if (!isMoving) return;
        const moveAngle = Math.atan2(this.vy, this.vx);
        const thrusterAngle = moveAngle + Math.PI;
        const dodging = !!this.isDodging;
        const intensity = dodging ? 1.0 : 0.65;
        const length = dodging ? 90 : 50;
        const width = dodging ? 22 : 16;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const startDistance = this.width / 2 + 3;
        const perpAngle = thrusterAngle + Math.PI / 2;
        const spacing = 12;
        for (let i = 0; i < 2; i++) {
            const offsetPerp = (i - 0.5) * spacing * 2;
            const ox = cx + Math.cos(thrusterAngle) * startDistance + Math.cos(perpAngle) * offsetPerp;
            const oy = cy + Math.sin(thrusterAngle) * startDistance + Math.sin(perpAngle) * offsetPerp;
            drawJetFlame(ctx, {
                originX: ox, originY: oy,
                angle: thrusterAngle,
                length, width,
                intensity,
                scheme: 'gold',
                spawnEmbers: true,
                emberDensity: dodging ? 1.0 : 0.5,
                id: i + (dodging ? 30 : 0)
            });
        }
    }

    drawLockIndicator(ctx) {
        drawBossLockIndicator(ctx, this, '#ffb030', 'white', { tipYOffset: -10, height: 26, halfWidth: 13, bounceAmp: 4, speed: 0.01 });
    }

    drawShoulderPods(ctx) {
        if (!this.podsDetached) return;
        for (const pod of this.shoulderPods) pod.draw(ctx);
    }
}

// =================================================================
// MagnusBullet - particle cannon shell + EMP wave bullet
// =================================================================
// All Magnus weapon damage is multiplied by this. Bumped from 1x to 2x to
// give Magnus real teeth (he's the heavy artillery boss).
const MAGNUS_DAMAGE_MULT = 2;

class MagnusBullet extends GameObject {
    constructor(x, y, vx, vy, damage, scheme = 'gold') {
        super(x, y, 8, 8, '#ffc060');
        this.vx = vx;
        this.vy = vy;
        this.damage = Math.round(damage * MAGNUS_DAMAGE_MULT);
        this.scheme = scheme;
        this.startTime = Date.now();
        this.lifetime = 3500;
        this.spinPhase = Math.random() * Math.PI * 2;
    }

    update() {
        if (Date.now() - this.startTime > this.lifetime) {
            this.shouldDestroy = true;
            return;
        }
        if (this.x < -20 || this.x > GAME_CONFIG.WIDTH + 20 ||
            this.y < -20 || this.y > GAME_CONFIG.HEIGHT + 20) {
            this.shouldDestroy = true;
            return;
        }
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)) {
            game.player.takeDamage(this.damage);
            // Tiny on-hit FX
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            bossFX.addFlash(cx, cy, 28, '#ffd060', 220, 0.85);
            bossFX.spawnBurst(cx, cy, 6, {
                color: '#ffd060',
                speedMin: 1, speedMax: 3,
                sizeMin: 1.5, sizeMax: 2.5,
                lifeMs: 320, drag: 0.9
            });
            this.shouldDestroy = true;
            return;
        }
        // Decoys also intercept Magnus bullets
        if (game.decoys) {
            for (const decoy of game.decoys) {
                if (this.collidesWith(decoy)) {
                    decoy.takeDamage(this.damage);
                    const cx = this.x + this.width / 2;
                    const cy = this.y + this.height / 2;
                    if (typeof bossFX !== 'undefined') {
                        bossFX.addFlash(cx, cy, 22, '#ffd060', 200, 0.85);
                    }
                    this.shouldDestroy = true;
                    return;
                }
            }
        }
        super.update();
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const dirX = this.vx / speed;
        const dirY = this.vy / speed;
        if (typeof drawTracer === 'function') {
            drawTracer(ctx, {
                x: cx, y: cy,
                vx: this.vx, vy: this.vy,
                length: 22, width: 3.5,
                scheme: this.scheme, alpha: 1
            });
        }
        if (typeof drawBulletGlow === 'function') {
            const wobble = 1 + 0.15 * Math.sin(this.spinPhase + Date.now() * 0.018);
            drawBulletGlow(ctx, {
                x: cx, y: cy,
                radius: this.width * 0.5 * wobble,
                scheme: this.scheme, alpha: 1
            });
        }
    }
}

// =================================================================
// MagnusArtilleryShell - lobbed shell with arc + ground impact AOE
// =================================================================
class MagnusArtilleryShell extends GameObject {
    constructor(originX, originY, targetX, targetY, damage) {
        super(originX, originY, 14, 14, '#ffaa30');
        this.originX = originX;
        this.originY = originY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.damage = Math.round(damage * MAGNUS_DAMAGE_MULT);
        this.startTime = Date.now();
        this.flightDuration = 1100; // arc time
        this.aoeRadius = 80;
        this.exploded = false;
        // Ground marker telegraph (drawn at target during flight)
        this.markerLifeMs = this.flightDuration;
    }

    update() {
        if (this.exploded) {
            this.shouldDestroy = true;
            return;
        }
        const now = Date.now();
        const t = (now - this.startTime) / this.flightDuration;
        if (t >= 1) {
            this._explode();
            return;
        }
        // Parabolic interpolation: x/y linear, with vertical "altitude" arc as offsetY
        this.x = this.originX + (this.targetX - this.originX) * t - this.width / 2;
        this.y = this.originY + (this.targetY - this.originY) * t - this.height / 2;
        // Smoke trail
        if (Math.random() < 0.6) {
            bossFX.spawnBurst(this.x + this.width / 2, this.y + this.height / 2, 1, {
                color: '#665040',
                speedMin: 0.3, speedMax: 1,
                sizeMin: 2, sizeMax: 3,
                lifeMs: 500, drag: 0.92
            });
        }
    }

    _explode() {
        this.exploded = true;
        const ex = this.targetX;
        const ey = this.targetY;
        // Big AOE check vs player
        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(px - ex, py - ey);
            if (d < this.aoeRadius + game.player.width / 2) {
                const falloff = 1 - Math.min(1, d / this.aoeRadius);
                const dmg = Math.max(4, Math.round(this.damage * falloff));
                game.player.takeDamage(dmg);
            }
        }
        // AOE check vs decoys
        if (game.decoys) {
            for (const decoy of game.decoys) {
                const dcx = decoy.x + decoy.width / 2;
                const dcy = decoy.y + decoy.height / 2;
                const d = Math.hypot(dcx - ex, dcy - ey);
                if (d < this.aoeRadius + decoy.width / 2) {
                    const falloff = 1 - Math.min(1, d / this.aoeRadius);
                    const dmg = Math.max(4, Math.round(this.damage * falloff));
                    decoy.takeDamage(dmg);
                }
            }
        }
        // FX
        bossFX.addFlash(ex, ey, this.aoeRadius * 1.6, '#ffaa30', 480, 1.0);
        bossFX.addShockwave(ex, ey, 20, this.aoeRadius * 2.2, '#ffc060', 600, 6, 0.85);
        bossFX.addShake(5, 280);
        bossFX.spawnBurst(ex, ey, 22, {
            color: '#ffb040',
            speedMin: 2.5, speedMax: 7,
            sizeMin: 2, sizeMax: 4.5,
            lifeMs: 560, drag: 0.9
        });
    }

    draw(ctx) {
        if (this.exploded) return;
        const now = Date.now();
        const t = (now - this.startTime) / this.flightDuration;

        // Ground impact marker telegraph (pulsing red ring at target)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.6 + 0.4 * Math.sin(now / 80);
        const ringAlpha = (0.3 + 0.5 * t) * pulse;
        ctx.strokeStyle = `rgba(255, 80, 30, ${ringAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.targetX, this.targetY, this.aoeRadius * (0.85 + 0.15 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        // Inner solid disc fades in
        const innerAlpha = 0.05 + 0.18 * t;
        ctx.fillStyle = `rgba(255, 100, 30, ${innerAlpha})`;
        ctx.beginPath();
        ctx.arc(this.targetX, this.targetY, this.aoeRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Crosshair lines
        ctx.strokeStyle = `rgba(255, 200, 80, ${ringAlpha * 0.8})`;
        ctx.lineWidth = 1.5;
        const cr = this.aoeRadius * 1.05;
        ctx.beginPath();
        ctx.moveTo(this.targetX - cr, this.targetY);
        ctx.lineTo(this.targetX + cr, this.targetY);
        ctx.moveTo(this.targetX, this.targetY - cr);
        ctx.lineTo(this.targetX, this.targetY + cr);
        ctx.stroke();
        ctx.restore();

        // The shell itself - glowing trailing projectile
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const arc = Math.sin(t * Math.PI) * 60; // visual altitude
        const drawY = cy - arc;
        // Shell body: hot core + halo
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createRadialGradient(cx, drawY, 0, cx, drawY, this.width * 1.4);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#ffd060');
        grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, drawY, this.width * 1.4, 0, Math.PI * 2);
        ctx.fill();
        // Solid shell silhouette
        ctx.fillStyle = '#1c222b';
        ctx.beginPath();
        ctx.arc(cx, drawY, this.width * 0.45, 0, Math.PI * 2);
        ctx.fill();
        // Bright tip
        ctx.fillStyle = '#ffd060';
        ctx.beginPath();
        ctx.arc(cx, drawY, this.width * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// =================================================================
// MagnusShoulderPod - autonomous turret drone (phase 2)
// Hovers near boss, periodically fires single shots at player.
// Cannot be locked / targeted by sword (too small/agile); only contributes pressure.
// Pods auto-despawn when boss dies (handled by Magnus.shoulderPods cleanup).
// =================================================================
class MagnusShoulderPod extends GameObject {
    constructor(x, y, side) {
        super(x, y, 28, 28, '#454f5d');
        this.side = side; // -1 left, 1 right
        this.aimAngle = 0;
        this.lastFireAt = Date.now();
        this.fireInterval = 1100 + Math.random() * 400;
        // Rocket launcher (player-style: straight shot + AOE on impact).
        // Mirrors the player's RocketLauncher contract — single-shot tube
        // with reload between shots, big radius, strong center / weak rim.
        // Each pod owns its own launcher with staggered initial cooldown
        // so the two pods don't volley simultaneously.
        this.rocketCooldown = 5500;          // ms between launches
        this.rocketTelegraphMs = 520;        // pre-fire wind-up
        this.rocketDamage = 22;              // peak (center-hit)
        this.rocketSpeed = 13;
        this.rocketExplosionRadius = 150;
        this.rocketRange = 18 * 50;
        this.lastRocketAt = Date.now() - 2200 - Math.random() * 2400;
        this.rocketWindupAt = 0;             // 0 = idle; otherwise launch deadline
        this.rocketWindupAngle = 0;
        this.driftPhase = Math.random() * Math.PI * 2;
        this.maxHealth = 80;
        this.health = this.maxHealth;
        // Pods are floating drones; not lockable as boss target.
    }

    update() {
        if (this.shouldDestroy) return;
        if (this.health <= 0) {
            this._destroyVFX();
            this.shouldDestroy = true;
            return;
        }
        const now = Date.now();
        const boss = game.boss;
        if (!boss || !game.player) {
            super.update();
            return;
        }
        // Drift around the boss at fixed offset, with bobbing
        const bcx = boss.x + boss.width / 2;
        const bcy = boss.y + boss.height / 2;
        this.driftPhase += 0.02;
        const orbitR = 90;
        const baseAngle = (this.side === -1 ? Math.PI : 0) + Math.sin(this.driftPhase * 0.6) * 0.3;
        const desiredX = bcx + Math.cos(baseAngle) * orbitR - this.width / 2;
        const desiredY = bcy + Math.sin(baseAngle) * orbitR - this.height / 2 + Math.sin(this.driftPhase) * 12;
        // Smooth chase
        this.x += (desiredX - this.x) * 0.08;
        this.y += (desiredY - this.y) * 0.08;

        // Aim at player
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const desiredAim = Math.atan2(py - cy, px - cx);
        // Smoothing
        let diff = desiredAim - this.aimAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.aimAngle += diff * 0.1;

        // Fire single tracer shot on interval
        if (now - this.lastFireAt > this.fireInterval) {
            this.lastFireAt = now;
            this._fireShot();
        }

        // Rocket launcher: brief telegraph, then a single straight rocket.
        // (Player-style RocketLauncher: NOT a homing missile — it flies in
        // a straight line and explodes in an AOE on impact / max range.)
        if (this.rocketWindupAt > 0) {
            if (now >= this.rocketWindupAt) {
                this.rocketWindupAt = 0;
                this._fireRocket();
                this.lastRocketAt = now;
            }
        } else if (now - this.lastRocketAt > this.rocketCooldown) {
            this.rocketWindupAt = now + this.rocketTelegraphMs;
            // Lock aim now so the player can read the launch direction
            // from the pod orientation — straight rockets can't course-
            // correct, so they MUST commit on telegraph start.
            this.rocketWindupAngle = this.aimAngle;
            const cx2 = this.x + this.width / 2;
            const cy2 = this.y + this.height / 2;
            bossFX.addFlash(cx2, cy2, 22, '#ffd070', this.rocketTelegraphMs, 0.7);
        }

        this.checkBounds();
    }

    _fireShot() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Predictive aim: lead by target velocity (player or decoy)
        if (!game.player) return;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const px = tc.x;
        const py = tc.y;
        const tvx = (tc.entity && tc.entity.vx) || 0;
        const tvy = (tc.entity && tc.entity.vy) || 0;
        const speed = 18;
        const lead = 8;
        const tx = px + tvx * lead;
        const ty = py + tvy * lead;
        const ang = Math.atan2(ty - cy, tx - cx);
        const launchX = cx + Math.cos(ang) * 16;
        const launchY = cy + Math.sin(ang) * 16;
        if (!game.magnusBullets) game.magnusBullets = [];
        game.magnusBullets.push(new MagnusBullet(launchX, launchY,
            Math.cos(ang) * speed, Math.sin(ang) * speed, 5, 'orange'));
        // Muzzle FX
        bossFX.addFlash(launchX, launchY, 16, '#ffb040', 180, 0.8);
        bossFX.spawnBurst(launchX, launchY, 3, {
            color: '#ffb040',
            speedMin: 1, speedMax: 3,
            sizeMin: 1, sizeMax: 2,
            lifeMs: 240, baseAngle: ang, spreadAngle: Math.PI / 4
        });
    }

    // Fires a single straight-flying rocket along the locked windup angle.
    // Player's RocketLauncher contract: dumb fire + AOE on impact. No
    // homing — that would make this a missile, not a rocket.
    _fireRocket() {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const ang = this.rocketWindupAngle;
        const launchDist = 18;
        const launchX = cx + Math.cos(ang) * launchDist;
        const launchY = cy + Math.sin(ang) * launchDist;
        // Flight target is just "very far ahead" — straight line.
        const reach = this.rocketRange;
        const tx = launchX + Math.cos(ang) * reach;
        const ty = launchY + Math.sin(ang) * reach;
        const rocket = new BossRocket(launchX, launchY, tx, ty,
            this.rocketDamage, this.rocketSpeed,
            this.rocketExplosionRadius, this.rocketRange);
        if (!game.bossMissiles) game.bossMissiles = [];
        game.bossMissiles.push(rocket);
        bossFX.addFlash(launchX, launchY, 36, '#ffd070', 280, 1.0);
        bossFX.spawnBurst(launchX, launchY, 10, {
            color: '#ffc060',
            speedMin: 2.5, speedMax: 6,
            sizeMin: 1.8, sizeMax: 3.2,
            lifeMs: 420, baseAngle: ang, spreadAngle: Math.PI / 3,
            drag: 0.9
        });
        bossFX.addShake(3, 180);
    }

    takeDamage(damage) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage) : damage;
        this.health -= damage;
        if (this.health <= 0 && !this.shouldDestroy) {
            this._destroyVFX();
            this.shouldDestroy = true;
            return true;
        }
        return false;
    }

    _destroyVFX() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        bossFX.addFlash(cx, cy, 60, '#ffaa30', 380, 1.0);
        bossFX.addShockwave(cx, cy, 10, 90, '#ffc060', 500, 4, 0.7);
        bossFX.spawnBurst(cx, cy, 14, {
            color: '#ffa040',
            speedMin: 2, speedMax: 6,
            sizeMin: 2, sizeMax: 4,
            lifeMs: 540, drag: 0.9
        });
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.aimAngle);
        // Body
        ctx.fillStyle = '#2c333d';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.fillStyle = '#525c6a';
        ctx.fillRect(-this.width / 2 + 3, -this.height / 2 + 3, this.width - 6, this.height - 6);
        // Cannon
        ctx.fillStyle = '#1d242d';
        ctx.fillRect(0, -3, this.width / 2 + 8, 6);
        ctx.fillStyle = '#5a6675';
        ctx.fillRect(2, -2, this.width / 2 + 4, 4);
        // Sensor LED (pulsing)
        const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 180);
        const ledGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 5);
        ledGrad.addColorStop(0, '#ffffff');
        ledGrad.addColorStop(0.5, '#ffd060');
        ledGrad.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.globalAlpha = pulse;
        ctx.fillStyle = ledGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();

        // Rocket charge ring — fills as the launch telegraph counts down so
        // the player can read pod state at a glance.
        if (this.rocketWindupAt > 0) {
            const now = Date.now();
            const total = this.rocketTelegraphMs;
            const remain = Math.max(0, this.rocketWindupAt - now);
            const charge = 1 - remain / total;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = '#ffd070';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.55 + 0.35 * charge;
            ctx.beginPath();
            ctx.arc(0, 0, this.width * 0.7, -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * charge);
            ctx.stroke();
            ctx.restore();
        }

        // Tiny health bar
        const barW = this.width;
        ctx.fillStyle = 'rgba(60,60,60,0.8)';
        ctx.fillRect(this.x, this.y - 6, barW, 3);
        const ratio = Math.max(0, this.health / this.maxHealth);
        ctx.fillStyle = '#ffaa30';
        ctx.fillRect(this.x, this.y - 6, barW * ratio, 3);
    }
}







