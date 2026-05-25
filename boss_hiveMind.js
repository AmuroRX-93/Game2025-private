// Hive Mind - swarm boss with orbital drones, kamikaze rushes, and a death
// split into 4 splinter cores. Themed around bio-mechanical hive aesthetic
// (dark chassis + violet plasma).

// =================================================================
// HiveDrone - small orbital drone that protects the queen and can
// kamikaze toward the player. Has its own HP and explodes on death.
// =================================================================
class HiveDrone extends GameObject {
    constructor(queen, orbitAngle, orbitRadius, role = 'defender') {
        super(queen.x + queen.width / 2, queen.y + queen.height / 2, 16, 16, '#7a5dbf');
        this.queen = queen;
        this.maxHealth = 5;
        this.health = this.maxHealth;
        this.orbitAngle = orbitAngle;
        this.orbitRadius = orbitRadius;
        this.orbitSpeed = 0.025 + Math.random() * 0.012; // rad/frame
        this.orbitDirection = Math.random() < 0.5 ? 1 : -1;
        this.spawnTime = Date.now();
        this.shouldDestroy = false;

        // Cannot be directly locked-on. Player weapons must hit them by AOE
        // or by being in their flight path while the drones intercept.
        this.unlockable = true;
        this.notTargetable = true;

        // Role: 'defender' (close orbit, intercept) or 'attacker' (far orbit, fire plasma)
        this.role = role;

        // Behavior modes
        this.mode = 'orbit';        // 'orbit' | 'intercept' | 'kamikaze'
        this.modeTarget = null;     // a bullet/missile or the player
        this.kamikazeFuse = 0;
        this.lastInterceptCheck = 0;

        // Attacker firing
        this.lastFireAt = Date.now() + Math.random() * 1500; // stagger
        this.fireInterval = 2200 + Math.random() * 900;
        this.attackerColor = '#ff8acc';

        // Visual / collision damage
        this.kamikazeDamage = 14;
        this.kamikazeRadius = 60;
        this.contactDamage = 8;
        this.lastContactDamageAt = 0;

        // For kill detection in weapons.js
        this.isHiveDrone = true;
    }

    takeDamage(damage) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage) : damage;
        this.health -= damage;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 12, '#caa8ff', 160, 0.8);
        }
        if (this.health <= 0) {
            this._explode(false);
        }
        return this.health <= 0;
    }

    _explode(asKamikaze) {
        if (this.shouldDestroy) return;
        this.shouldDestroy = true;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, asKamikaze ? 56 : 28, '#caa8ff', 360, 0.95);
            bossFX.addShockwave(cx, cy, 8, asKamikaze ? 70 : 40,
                '#9a6cff', asKamikaze ? 480 : 320, asKamikaze ? 4 : 2.5, 0.7);
            bossFX.spawnBurst(cx, cy, asKamikaze ? 18 : 10, {
                color: '#b48bff',
                speedMin: 1.5, speedMax: asKamikaze ? 6 : 3.5,
                sizeMin: 1.5, sizeMax: 3,
                lifeMs: 380, drag: 0.92
            });
        }
        // Kamikaze AOE damage to player
        if (asKamikaze && game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(px - cx, py - cy);
            if (d <= this.kamikazeRadius) {
                const fall = 1 - (d / this.kamikazeRadius) * 0.5;
                const dmg = Math.max(2, Math.round(this.kamikazeDamage * fall));
                game.player.takeDamage(dmg);
                if (d > 0.001) {
                    game.player.vx += ((px - cx) / d) * 14;
                    game.player.vy += ((py - cy) / d) * 14;
                }
                if (typeof updateUI === 'function') updateUI();
            }
        }
    }

    // ---- Behavior switching ------------------------------------------------
    // Try to intercept incoming player projectiles when one comes near.
    // ALL drones intercept (defenders + attackers) - they're the queen's shield.
    _maybeIntercept(now) {
        if (this.mode !== 'orbit') return;
        if (now - this.lastInterceptCheck < 120) return;
        this.lastInterceptCheck = now;
        // Always responsive - swarm shield is the gimmick
        if (Math.random() > 0.7) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const interceptR2 = 320 * 320;
        // Look at player bullets, missiles, plasma missiles, cluster missiles, sword slashes
        const candidates = [];
        const consider = (arr, w = 4) => {
            if (!arr) return;
            for (const b of arr) {
                if (b.fromBoss || b.shouldDestroy) continue;
                const bx = b.x + (b.width || w) / 2;
                const by = b.y + (b.height || w) / 2;
                const d2 = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
                if (d2 <= interceptR2) candidates.push({ obj: b, d2 });
            }
        };
        consider(game.bullets, 4);
        consider(game.missiles, 6);
        consider(game.plasmaMissiles, 8);
        consider(game.clusterMissiles, 10);
        if (candidates.length === 0) return;
        candidates.sort((a, b) => a.d2 - b.d2);
        this.mode = 'intercept';
        this.modeTarget = candidates[0].obj;
    }

    // Switch to kamikaze (set externally by the queen's move).
    startKamikaze() {
        this.mode = 'kamikaze';
        this.kamikazeFuse = Date.now() + 1800;
    }

    update() {
        const now = Date.now();
        if (this.shouldDestroy) return;
        if (!this.queen || this.queen.health <= 0 && !this.queen.splinterPhase) {
            // Queen died non-splinterly (e.g. via debug); go orbit-less and self-destruct
            this._explode(false);
            return;
        }

        this._maybeIntercept(now);

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        switch (this.mode) {
            case 'orbit': {
                // Surge speed reverts after expiry
                if (this._surgeUntil && now >= this._surgeUntil) {
                    this.orbitSpeed = this.orbitSpeed / 1.6;
                    this._surgeUntil = 0;
                }
                this.orbitAngle += this.orbitSpeed * this.orbitDirection;
                const qcx = this.queen.x + this.queen.width / 2;
                const qcy = this.queen.y + this.queen.height / 2;
                const tx = qcx + Math.cos(this.orbitAngle) * this.orbitRadius;
                const ty = qcy + Math.sin(this.orbitAngle) * this.orbitRadius;
                // Smooth move toward orbit anchor (so it doesn't snap when queen teleports)
                const lx = tx - this.width / 2;
                const ly = ty - this.height / 2;
                this.x += (lx - this.x) * 0.18;
                this.y += (ly - this.y) * 0.18;
                break;
            }
            case 'intercept': {
                if (!this.modeTarget || this.modeTarget.shouldDestroy) {
                    this.mode = 'orbit';
                    this.modeTarget = null;
                    break;
                }
                const tx = this.modeTarget.x + (this.modeTarget.width || 4) / 2;
                const ty = this.modeTarget.y + (this.modeTarget.height || 4) / 2;
                const dx = tx - cx;
                const dy = ty - cy;
                const d = Math.hypot(dx, dy) || 1;
                const speed = 7;
                this.x += (dx / d) * speed;
                this.y += (dy / d) * speed;
                if (d < 14) {
                    // Body-block: destroy the projectile, then explode (small)
                    if (this.modeTarget.shouldDestroy !== undefined) {
                        this.modeTarget.shouldDestroy = true;
                    }
                    this._explode(false);
                    return;
                }
                break;
            }
            case 'kamikaze': {
                if (!game.player) {
                    this._explode(false);
                    return;
                }
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                const dx = px - cx;
                const dy = py - cy;
                const d = Math.hypot(dx, dy) || 1;
                const speed = 9;
                this.x += (dx / d) * speed;
                this.y += (dy / d) * speed;
                if (d < 22 || now >= this.kamikazeFuse) {
                    this._explode(true);
                    return;
                }
                break;
            }
        }

        // Attackers fire plasma at player while orbiting
        if (this.mode === 'orbit' && this.role === 'attacker' && game.player &&
            now - this.lastFireAt > this.fireInterval) {
            this._fireAtPlayer(now);
            this.lastFireAt = now;
            this.fireInterval = 2000 + Math.random() * 1100;
        }

        // Contact damage to player
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)
            && now - this.lastContactDamageAt > 600) {
            game.player.takeDamage(this.contactDamage);
            this.lastContactDamageAt = now;
            if (typeof updateUI === 'function') updateUI();
        }
    }

    _fireAtPlayer(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const px = tc.x;
        const py = tc.y;
        const dx = px - cx;
        const dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        if (len > 800) return; // out of effective range
        const speed = 6.5;
        if (!game.hivePlasmaBullets) game.hivePlasmaBullets = [];
        game.hivePlasmaBullets.push(new HivePlasmaBullet(
            cx, cy, (dx / len) * speed, (dy / len) * speed,
            6, { tracking: 0.025 }));
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 11, this.attackerColor, 140, 0.85);
        }
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();
        // Color theme: defender = violet, attacker = magenta-pink, kamikaze = hot pink
        const isAtk = this.role === 'attacker';
        const baseHot = this.mode === 'kamikaze' ? '#ffb0ff'
            : (isAtk ? '#ff8acc' : '#caa8ff');
        const innerColor = this.mode === 'kamikaze' ? 'rgba(255,140,220,0.55)'
            : (isAtk ? 'rgba(255,120,200,0.55)' : 'rgba(160,110,255,0.55)');
        const fadeColor = this.mode === 'kamikaze' ? 'rgba(255,80,200,0)'
            : (isAtk ? 'rgba(220,60,160,0)' : 'rgba(120,80,220,0)');
        const chassisFill = isAtk ? '#3d1d44' : '#3a2660';

        ctx.save();
        // Outer halo (additive)
        ctx.globalCompositeOperation = 'lighter';
        const haloR = this.mode === 'kamikaze' ? 18 + 4 * Math.sin(now * 0.04)
            : (isAtk ? 12 + Math.sin(now * 0.012) * 1.5 : 13);
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
        halo.addColorStop(0, baseHot);
        halo.addColorStop(0.5, innerColor);
        halo.addColorStop(1, fadeColor);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Core chassis: defender = diamond, attacker = triangle (pointing at player)
        ctx.save();
        ctx.translate(cx, cy);
        if (isAtk) {
            // Attackers point toward current target (player or decoy)
            let aim = 0;
            const tc = (typeof getBossTargetCenter === 'function')
                ? getBossTargetCenter(cx, cy) : null;
            if (tc) {
                aim = Math.atan2(tc.y - cy, tc.x - cx);
            } else if (game.player) {
                aim = Math.atan2(
                    game.player.y + game.player.height / 2 - cy,
                    game.player.x + game.player.width / 2 - cx);
            }
            ctx.rotate(aim);
            ctx.fillStyle = chassisFill;
            ctx.beginPath();
            ctx.moveTo(this.width / 2, 0);
            ctx.lineTo(-this.width / 2, -this.height / 2 + 1);
            ctx.lineTo(-this.width / 2 + 4, 0);
            ctx.lineTo(-this.width / 2, this.height / 2 - 1);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = baseHot;
            ctx.lineWidth = 1.4;
            ctx.stroke();
            // Muzzle dot
            ctx.fillStyle = baseHot;
            ctx.beginPath();
            ctx.arc(this.width / 2 - 1, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.rotate(now * 0.005);
            ctx.fillStyle = chassisFill;
            ctx.beginPath();
            ctx.moveTo(0, -this.height / 2);
            ctx.lineTo(this.width / 2, 0);
            ctx.lineTo(0, this.height / 2);
            ctx.lineTo(-this.width / 2, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = baseHot;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = baseHot;
            ctx.beginPath();
            ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // HP bar (small)
        if (this.health < this.maxHealth) {
            const bw = 18, bh = 2;
            const hp = Math.max(0, this.health) / this.maxHealth;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - 1, this.y - 6, bw, bh);
            ctx.fillStyle = baseHot;
            ctx.fillRect(this.x - 1, this.y - 6, bw * hp, bh);
        }
    }
}

// =================================================================
// HivePlasmaBullet - violet plasma orb fired by HiveMind / Splinters.
// Slow, mildly homing, leaves a short additive trail.
// =================================================================
class HivePlasmaBullet extends GameObject {
    constructor(x, y, vx, vy, damage, opts = {}) {
        super(x, y, 8, 8, '#caa8ff');
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.startTime = Date.now();
        this.lifetime = opts.lifetime || 3200;
        this.tracking = opts.tracking != null ? opts.tracking : 0.0;
        this.spinPhase = Math.random() * Math.PI * 2;
        this.shouldDestroy = false;
    }

    update() {
        const now = Date.now();
        if (now - this.startTime > this.lifetime) {
            this.shouldDestroy = true;
            return;
        }
        // Mild homing toward current valid target (player or decoy)
        if (this.tracking > 0) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const tc = (typeof getBossTargetCenter === 'function')
                ? getBossTargetCenter(cx, cy) : null;
            if (tc) {
                const px = tc.x;
                const py = tc.y;
                const dx = px - cx;
                const dy = py - cy;
                const d = Math.hypot(dx, dy) || 1;
                const speed = Math.hypot(this.vx, this.vy) || 1;
                const tvx = (dx / d) * speed;
                const tvy = (dy / d) * speed;
                this.vx = this.vx * (1 - this.tracking) + tvx * this.tracking;
                this.vy = this.vy * (1 - this.tracking) + tvy * this.tracking;
            }
        }
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < -20 || this.x > GAME_CONFIG.WIDTH + 20 ||
            this.y < -20 || this.y > GAME_CONFIG.HEIGHT + 20) {
            this.shouldDestroy = true;
            return;
        }
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)) {
            game.player.takeDamage(this.damage);
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(cx, cy, 22, '#e0c8ff', 220, 0.85);
                bossFX.spawnBurst(cx, cy, 6, {
                    color: '#caa8ff', speedMin: 1, speedMax: 3,
                    sizeMin: 1.5, sizeMax: 2.5, lifeMs: 320, drag: 0.9
                });
            }
            this.shouldDestroy = true;
            if (typeof updateUI === 'function') updateUI();
            return;
        }
        // Decoys also intercept hostile plasma bullets
        if (game.decoys) {
            for (const decoy of game.decoys) {
                if (this.collidesWith(decoy)) {
                    decoy.takeDamage(this.damage);
                    const cx = this.x + this.width / 2;
                    const cy = this.y + this.height / 2;
                    if (typeof bossFX !== 'undefined') {
                        bossFX.addFlash(cx, cy, 22, '#e0c8ff', 220, 0.85);
                    }
                    this.shouldDestroy = true;
                    break;
                }
            }
        }
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof drawTracer === 'function') {
            drawTracer(ctx, {
                x: cx, y: cy,
                vx: this.vx, vy: this.vy,
                length: 18, width: 3,
                scheme: 'violet'
            });
        }
        if (typeof drawBulletGlow === 'function') {
            const wobble = 1 + 0.18 * Math.sin(this.spinPhase + Date.now() * 0.018);
            drawBulletGlow(ctx, {
                x: cx, y: cy,
                radius: this.width * 0.6 * wobble,
                scheme: 'violet', alpha: 1
            });
        }
    }
}

// =================================================================
// HiveMind - the queen body. Fragile on its own; protected by a ring
// of HiveDrones. When killed, splits into 4 Splinter cores.
// =================================================================
class HiveMind extends GameObject {
    constructor(x, y) {
        super(x, y, 60, 60, '#2a1a3e');
        this.maxHealth = 320;
        this.health = this.maxHealth;
        this.speed = 22;
        this.dodgeSpeed = 30;

        // Stun / impale support
        this.stunned = false;
        this.stunEndTime = 0;
        this.isImpaled = false;
        this.impaledBy = null;

        // Damage diminishing window (shared boss pattern)
        this.damageWindow = { accumulated: 0, windowStart: Date.now() };

        // Hit feedback
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // Drone perimeter — two squads, smart auto-rebalanced
        this.drones = [];
        this.maxDrones = 30;
        this.targetDefenderRatio = 0.6;     // 60% defenders, 40% attackers
        this.defenderOrbitRadius = 78;      // inner ring
        this.attackerOrbitRadius = 150;     // outer ring
        this.droneOrbitRadius = this.defenderOrbitRadius; // legacy compat
        this.droneSpawnInterval = 1500;     // ms between reinforcements
        this.lastDroneSpawnAt = Date.now();
        this.droneSpawnBatchMax = 2;        // up to 2 per tick
        this.lastRoleRebalance = Date.now();
        this.roleRebalanceInterval = 800;
        this._spawnInitialDrones();

        // Exposed window after all drones killed
        this.exposedUntil = 0;
        this.exposedDamageMult = 2.0;

        // Splinter phase flag (becomes true on death)
        this.splinterPhase = false;

        // Combat AI
        this.combatPhase = 'idle';
        this.activeMove = null;
        this.combatRecoverUntil = 0;
        this.aiMemory = createBossAIMemory();
        this.telegraphs = [];
        this.spawnTime = Date.now();
        this.firstDecisionAt = this.spawnTime + 1000;
        this.movesTable = this._buildMovesTable();

        // Movement state - hovers at medium range
        this.aiState = 'hover';
        this.idealDistance = 320;
        this.minDistance = 200;
        this.maxDistance = 460;
        this.lastAiUpdate = Date.now();

        // Visual
        this.facing = 0;
        this.pulsePhase = 0;
        this.lastTeleport = 0;
        this.teleportCooldown = 4000;

        // Damage values
        this.contactDamage = 10;
        this.lastContactDamageAt = 0;

        // Heal regen disabled by default (kept for boss interface compat)
        this.healCooldown = 99999;
        this.lastHealAt = 0;

        // For external kill detection
        this.isHiveMind = true;

        // Set initial random direction
        const a = Math.random() * Math.PI * 2;
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;
    }

    _spawnInitialDrones() {
        if (!game.hiveDrones) game.hiveDrones = [];
        // Start at ~50% capacity, let reinforcement fill the rest gradually.
        const initialCount = Math.floor(this.maxDrones * 0.5);
        const initialDef = Math.round(initialCount * this.targetDefenderRatio);
        const initialAtk = initialCount - initialDef;
        for (let i = 0; i < initialDef; i++) {
            const a = (i / initialDef) * Math.PI * 2;
            this._spawnDrone(a, 'defender');
        }
        for (let i = 0; i < initialAtk; i++) {
            const a = (i / initialAtk) * Math.PI * 2 + Math.PI / initialAtk;
            this._spawnDrone(a, 'attacker');
        }
    }

    _spawnDrone(orbitAngle, role) {
        const radius = role === 'attacker' ? this.attackerOrbitRadius : this.defenderOrbitRadius;
        const drone = new HiveDrone(this, orbitAngle, radius, role);
        this.drones.push(drone);
        if (!game.hiveDrones) game.hiveDrones = [];
        game.hiveDrones.push(drone);
        if (game.enemies) game.enemies.push(drone);
        return drone;
    }

    // Counts only live drones belonging to this queen, optionally by role
    _countDrones(role) {
        if (!game.hiveDrones) return 0;
        let n = 0;
        for (const d of game.hiveDrones) {
            if (d.shouldDestroy || d.queen !== this) continue;
            if (role && d.role !== role) continue;
            n++;
        }
        return n;
    }

    // Time-based reinforcement: every droneSpawnInterval ms add 1-2 drones
    // up to maxDrones, prioritizing whichever role is below quota.
    _maybeReinforce(now) {
        if (this.splinterPhase) return;
        if (now - this.lastDroneSpawnAt < this.droneSpawnInterval) return;
        const total = this._countDrones();
        if (total >= this.maxDrones) {
            this.lastDroneSpawnAt = now;
            return;
        }
        const slots = Math.min(this.droneSpawnBatchMax, this.maxDrones - total);
        const targetDef = Math.round(this.maxDrones * this.targetDefenderRatio);
        const liveDef = this._countDrones('defender');
        const liveAtk = total - liveDef;
        const targetAtk = this.maxDrones - targetDef;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (let i = 0; i < slots; i++) {
            // Pick role that's furthest below quota
            const defGap = targetDef - (liveDef + (i)); // optimistic count
            const atkGap = targetAtk - liveAtk;
            const role = (defGap >= atkGap) ? 'defender' : 'attacker';
            const a = Math.random() * Math.PI * 2;
            const drone = this._spawnDrone(a, role);
            // Spawn-in fade: start small inside the queen and dilate outward
            const radius = role === 'attacker' ? this.attackerOrbitRadius : this.defenderOrbitRadius;
            drone.x = cx + Math.cos(a) * radius * 0.3 - drone.width / 2;
            drone.y = cy + Math.sin(a) * radius * 0.3 - drone.height / 2;
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(drone.x + drone.width / 2, drone.y + drone.height / 2,
                    14, role === 'attacker' ? '#ff8acc' : '#caa8ff', 220, 0.85);
            }
        }
        this.lastDroneSpawnAt = now;
    }

    // Periodic role rebalancing: if attacker/defender ratio is way off
    // (e.g. all defenders died), promote/demote some drones in-place.
    _maybeRebalanceRoles(now) {
        if (this.splinterPhase) return;
        if (now - this.lastRoleRebalance < this.roleRebalanceInterval) return;
        this.lastRoleRebalance = now;
        const total = this._countDrones();
        if (total < 4) return;
        const targetDef = Math.round(total * this.targetDefenderRatio);
        const liveDef = this._countDrones('defender');
        const need = targetDef - liveDef; // positive = need more defenders
        if (Math.abs(need) < 2) return; // small drift is fine

        const candidates = [];
        for (const d of game.hiveDrones || []) {
            if (d.shouldDestroy || d.queen !== this) continue;
            if (d.mode !== 'orbit') continue; // don't reassign mid-action
            candidates.push(d);
        }
        if (need > 0) {
            // Convert attackers -> defenders
            const atkers = candidates.filter(d => d.role === 'attacker');
            for (let i = 0; i < Math.min(need, atkers.length); i++) {
                atkers[i].role = 'defender';
                atkers[i].orbitRadius = this.defenderOrbitRadius;
            }
        } else {
            // Convert defenders -> attackers
            const defenders = candidates.filter(d => d.role === 'defender');
            for (let i = 0; i < Math.min(-need, defenders.length); i++) {
                defenders[i].role = 'attacker';
                defenders[i].orbitRadius = this.attackerOrbitRadius;
            }
        }
    }

    // ---- Damage ------------------------------------------------------------
    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage, source) : damage;
        const now = Date.now();
        // Splinter phase: route damage to nearest splinter
        if (this.splinterPhase) {
            const splinters = (game.hiveSplinters || []).filter(s => !s.shouldDestroy);
            if (splinters.length === 0) {
                this.health = 0;
                return true;
            }
            let nearest = splinters[0];
            let bestD = Infinity;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            for (const s of splinters) {
                const sx = s.x + s.width / 2;
                const sy = s.y + s.height / 2;
                const d = Math.hypot(sx - cx, sy - cy);
                if (d < bestD) { bestD = d; nearest = s; }
            }
            return nearest.takeDamage(damage, '__boosted');
        }

        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        let actual = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        this.damageWindow.accumulated += damage;

        // Drone shielding: if any drone alive, queen takes only 25% damage.
        // If exposed window active, take +exposedDamageMult instead.
        const liveDrones = this._liveDroneCount();
        if (now < this.exposedUntil) {
            actual = Math.round(actual * this.exposedDamageMult);
        } else if (liveDrones > 0) {
            // Damage reduction scales with live drone count.
            // Encourages "thin the swarm before assaulting the queen".
            let mult;
            if (liveDrones >= 20) mult = 0.20;
            else if (liveDrones >= 10) mult = 0.35;
            else if (liveDrones >= 5)  mult = 0.55;
            else mult = 0.75;
            actual = Math.max(1, Math.round(actual * mult));
            // Visual: deflection spark
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(cx, cy, this.width * 0.7, '#caa8ff', 200, 0.55);
            }
        }

        this.health -= actual;
        this._addHitIndicator(actual, !this.splinterPhase && liveDrones > 0 && now >= this.exposedUntil);

        // Death check -> trigger splinter split (only first time)
        if (this.health <= 0 && !this.splinterPhase) {
            this._splitIntoSplinters();
            return false; // do NOT report dead; splinters carry on
        }
        return this.health <= 0;
    }

    _addHitIndicator(damage, deflected) {
        const now = Date.now();
        this.hitIndicators.push({
            damage, deflected,
            startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 50,
            y: this.y - 6 + Math.random() * 6
        });
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
    }

    _liveDroneCount() {
        if (!game.hiveDrones) return 0;
        return game.hiveDrones.filter(d => !d.shouldDestroy && d.queen === this).length;
    }

    // Triggered when queen HP hits 0 the first time. Spawns 4 splinter cores
    // and switches the queen into ghost router mode.
    _splitIntoSplinters() {
        this.splinterPhase = true;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 100, '#e0c8ff', 480, 1.0);
            bossFX.addShockwave(cx, cy, 18, 220, '#9a6cff', 700, 6, 0.85);
            bossFX.spawnBurst(cx, cy, 36, {
                color: '#caa8ff',
                speedMin: 3, speedMax: 9,
                sizeMin: 2, sizeMax: 4.5,
                lifeMs: 600, drag: 0.92
            });
            if (typeof bossFX.addShake === 'function') bossFX.addShake(8, 380);
        }
        // Spawn 4 splinters around the queen position (added to game.enemies so
        // existing player weapons can target them naturally). They explode
        // outward at distinct cardinal-ish angles so they instantly scatter
        // toward different corners of the arena.
        if (!game.hiveSplinters) game.hiveSplinters = [];
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const spawnR = 60;
            const sx = cx + Math.cos(a) * spawnR - 22;
            const sy = cy + Math.sin(a) * spawnR - 22;
            const sp = new HiveSplinter(sx, sy, a);
            // Strong initial outward velocity so the scatter is dramatic.
            sp.vx = Math.cos(a) * 9;
            sp.vy = Math.sin(a) * 9;
            game.hiveSplinters.push(sp);
            if (game.enemies) game.enemies.push(sp);
        }
        // Ghost mode: queen stays as game.boss for kill-detection routing
        // but is invisible/intangible. Health is virtual (sum of splinters).
        this.health = 1; // keep alive until splinters die
        this.maxHealth = 1;
        this._splinterTotalMax = 80 * 4;
        // Make her unselectable by player auto/manual lock so the reticle
        // tracks the actual splinters instead of the empty ghost position.
        this.notTargetable = true;
        // Drop all remaining drones
        if (game.hiveDrones) {
            for (const d of game.hiveDrones) {
                if (d.queen === this && !d.shouldDestroy) d._explode(false);
            }
        }
    }

    // Stun / impale interface (shared with other bosses)
    setStunned(durationMs = 400) {
        this.stunned = true;
        this.stunEndTime = Date.now() + durationMs;
        this.vx = 0; this.vy = 0;
    }
    getImpaled(weapon) { this.isImpaled = true; this.impaledBy = weapon; this.vx = 0; this.vy = 0; }
    releaseImpale() { this.isImpaled = false; this.impaledBy = null; this.setStunned(220); }
    tryHeal() { /* no passive regen */ }

    // ---- AI / movement -----------------------------------------------------
    update() {
        const now = Date.now();
        // Splinter ghost mode: queen is intangible router only.
        if (this.splinterPhase) {
            const live = (game.hiveSplinters || []).filter(s => !s.shouldDestroy).length;
            if (live === 0) {
                this.health = 0;
                this.shouldDestroy = true;
            } else {
                this.health = 1;
            }
            return;
        }
        if (this.stunned) {
            if (now >= this.stunEndTime) this.stunned = false;
            else { this.vx = 0; this.vy = 0; super.update(); this._clampToField(); return; }
        }
        if (this.isImpaled) { super.update(); this._clampToField(); return; }

        // Track exposed-window state: when swarm is critically thinned, queen
        // becomes vulnerable for 5s. Threshold scales with maxDrones.
        const live = this._liveDroneCount();
        const exposedThreshold = Math.max(2, Math.floor(this.maxDrones * 0.15));
        if (live <= exposedThreshold && this.exposedUntil < now) {
            this.exposedUntil = now + 5000;
            // Visual signal
            if (typeof bossFX !== 'undefined') {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                bossFX.addFlash(cx, cy, this.width * 1.4, '#ffb0ff', 380, 0.9);
                bossFX.addShockwave(cx, cy, 12, 110, '#caa8ff', 480, 4, 0.7);
            }
        }

        // Periodic teleport (not too aggressive)
        if (now - this.lastTeleport > this.teleportCooldown && Math.random() < 0.012) {
            this._teleportRandom();
        }

        this._updateMovement(now);
        this._updateCombatAI(now);

        // Smart swarm management: time-based reinforcement + role rebalancing
        this._maybeReinforce(now);
        this._maybeRebalanceRoles(now);

        // Contact damage
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)
            && now - this.lastContactDamageAt > 700) {
            game.player.takeDamage(this.contactDamage);
            this.lastContactDamageAt = now;
            if (typeof updateUI === 'function') updateUI();
        }

        super.update();
        this._clampToField();

        // Update facing for visuals
        if (Math.abs(this.vx) + Math.abs(this.vy) > 0.05) {
            this.facing = Math.atan2(this.vy, this.vx);
        }
        this.pulsePhase += 0.04;
    }

    _clampToField() {
        const margin = 8;
        if (this.x < margin) { this.x = margin; this.vx = Math.abs(this.vx); }
        if (this.y < margin) { this.y = margin; this.vy = Math.abs(this.vy); }
        if (this.x > GAME_CONFIG.WIDTH - this.width - margin) {
            this.x = GAME_CONFIG.WIDTH - this.width - margin; this.vx = -Math.abs(this.vx);
        }
        if (this.y > GAME_CONFIG.HEIGHT - this.height - margin) {
            this.y = GAME_CONFIG.HEIGHT - this.height - margin; this.vy = -Math.abs(this.vy);
        }
    }

    _updateMovement(now) {
        if (!game.player) return;
        const dt = Math.min((now - this.lastAiUpdate) / 1000, 0.05);
        this.lastAiUpdate = now;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const toPlayer = Math.atan2(dy, dx);

        // Hover at idealDistance, gentle strafe perpendicular to player line
        let desiredAngle;
        if (dist < this.minDistance) desiredAngle = toPlayer + Math.PI; // back off
        else if (dist > this.maxDistance) desiredAngle = toPlayer;       // close in
        else {
            const drift = Math.sin(now * 0.0009) * 0.6 + Math.PI / 2;
            desiredAngle = toPlayer + drift;
        }
        const desiredSpeed = this.speed * (this.exposedUntil > now ? 0.6 : 1.0);
        const tvx = Math.cos(desiredAngle) * desiredSpeed;
        const tvy = Math.sin(desiredAngle) * desiredSpeed;
        this.vx += (tvx - this.vx) * 0.08;
        this.vy += (tvy - this.vy) * 0.08;
    }

    _teleportRandom() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 36, '#caa8ff', 240, 0.8);
            bossFX.addShockwave(cx, cy, 8, 50, '#9a6cff', 320, 3, 0.6);
        }
        // Re-place near a random screen quadrant, away from player
        let nx, ny, attempts = 0;
        do {
            nx = 80 + Math.random() * (GAME_CONFIG.WIDTH - 160);
            ny = 80 + Math.random() * (GAME_CONFIG.HEIGHT - 160);
            attempts++;
        } while (attempts < 6 && game.player &&
            Math.hypot(nx - (game.player.x + game.player.width / 2),
                ny - (game.player.y + game.player.height / 2)) < 240);
        this.x = nx - this.width / 2;
        this.y = ny - this.height / 2;
        this.lastTeleport = Date.now();
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(this.x + this.width / 2, this.y + this.height / 2,
                40, '#caa8ff', 280, 0.85);
        }
    }

    _updateCombatAI(now) {
        // Telegraph cleanup
        if (this.telegraphs.length > 0) {
            this.telegraphs = this.telegraphs.filter(t => now < t.expiresAt);
        }
        if (this.combatPhase === 'commit' && this.activeMove) {
            this.activeMove.tick(this, now);
            if (this.activeMove.isDone(this, now)) {
                this.combatPhase = 'recover';
                this.combatRecoverUntil = now + (this.activeMove.recoveryMs || 350);
                if (typeof this.activeMove.onEnd === 'function') this.activeMove.onEnd(this);
                this.activeMove = null;
            }
            return;
        }
        if (this.combatPhase === 'recover') {
            if (now >= this.combatRecoverUntil) this.combatPhase = 'idle';
            else return;
        }
        if (now < this.firstDecisionAt) return;
        if (now - this.aiMemory.lastMoveTime < 320) return;
        const ctx = buildBossAIContext(this);
        const chosen = selectBossMove(this.movesTable, this.aiMemory, ctx);
        if (!chosen) return;
        commitBossMove(chosen, this.aiMemory, now);
        const state = chosen.start(this, ctx);
        if (!state) { this.combatPhase = 'idle'; return; }
        this.activeMove = state;
        this.combatPhase = 'commit';
    }

    _buildMovesTable() {
        return [
            // Plasma scatter: 10 plasma orbs in a wide spread
            {
                id: 'plasmaScatter',
                cooldown: 2800,
                score: () => 1.8 + Math.random() * 0.5,
                start: (b) => {
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    const telegraphMs = 280;
                    b.telegraphs.push(createTelegraphAura(cx, cy, 70, telegraphMs, '#9a6cff'));
                    return {
                        startedAt: Date.now(),
                        telegraphMs, fired: false, recoveryMs: 200,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) return;
                            if (!st.fired) { b2._firePlasmaScatter(); st.fired = true; }
                        },
                        isDone: (b2) => b2.activeMove.fired
                    };
                }
            },
            // Kamikaze strike: send 2-4 defender drones rushing the player
            {
                id: 'kamikazeStrike',
                cooldown: 6500,
                canUse: () => true,
                score: (ctx) => {
                    const def = ctx.boss._countDrones('defender');
                    if (def < 4) return -10;
                    let s = 1.1 + Math.random() * 0.4;
                    if (ctx.dist < 280) s += 0.5;
                    return s;
                },
                start: (b) => {
                    // Use defenders for kamikaze (attackers stay back to shoot)
                    const totalDef = b._countDrones('defender');
                    const sendCount = Math.min(4, Math.max(2, Math.floor(totalDef * 0.25)));
                    const candidates = (game.hiveDrones || []).filter(d =>
                        !d.shouldDestroy && d.queen === b && d.mode === 'orbit'
                        && d.role === 'defender');
                    candidates.sort(() => Math.random() - 0.5);
                    for (let i = 0; i < Math.min(sendCount, candidates.length); i++) {
                        candidates[i].startKamikaze();
                    }
                    return {
                        startedAt: Date.now(),
                        recoveryMs: 280,
                        tick: () => {},
                        isDone: (b2, now) => now - b2.activeMove.startedAt > 200
                    };
                }
            },
            // Drone perimeter volley: ATTACKER drones fire a synchronized salvo
            {
                id: 'dronePerimeter',
                cooldown: 7500,
                canUse: (ctx) => ctx.boss._countDrones('attacker') >= 3,
                score: (ctx) => {
                    const atk = ctx.boss._countDrones('attacker');
                    if (atk < 3) return -10;
                    return 1.2 + atk * 0.05;
                },
                start: (b) => {
                    const drones = (game.hiveDrones || []).filter(d =>
                        !d.shouldDestroy && d.queen === b && d.mode === 'orbit'
                        && d.role === 'attacker');
                    const telegraphMs = 380;
                    return {
                        startedAt: Date.now(),
                        telegraphMs, fired: false, recoveryMs: 320,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) return;
                            if (!st.fired) {
                                if (!game.player) { st.fired = true; return; }
                                const tc = (typeof getBossTargetCenter === 'function')
                                    ? getBossTargetCenter(b2.x + b2.width / 2, b2.y + b2.height / 2) : null;
                                if (!tc) { st.fired = true; return; }
                                const px = tc.x;
                                const py = tc.y;
                                if (!game.hivePlasmaBullets) game.hivePlasmaBullets = [];
                                for (const d of drones) {
                                    if (d.shouldDestroy) continue;
                                    // Skip if drone changed mode in the meantime
                                    if (d.mode !== 'orbit') continue;
                                    const cx = d.x + d.width / 2;
                                    const cy = d.y + d.height / 2;
                                    const dx = px - cx;
                                    const dy = py - cy;
                                    const len = Math.hypot(dx, dy) || 1;
                                    const speed = 7;
                                    game.hivePlasmaBullets.push(new HivePlasmaBullet(
                                        cx, cy, (dx / len) * speed, (dy / len) * speed,
                                        8, { tracking: 0.04 }));
                                    // Reset their next solo-fire timer so they don't double-tap
                                    d.lastFireAt = now;
                                    if (typeof bossFX !== 'undefined') {
                                        bossFX.addFlash(cx, cy, 14, '#ff8acc', 180, 0.85);
                                    }
                                }
                                st.fired = true;
                            }
                        },
                        isDone: (b2) => b2.activeMove.fired
                    };
                }
            },
            // Swarm surge: temporarily boosts orbit speed + spawns 3 fresh defenders
            // (replaces the old swarmRecall which is now redundant with passive reinforcement)
            {
                id: 'swarmSurge',
                cooldown: 14000,
                canUse: (ctx) => ctx.boss._countDrones() < ctx.boss.maxDrones - 4,
                score: (ctx) => {
                    const missing = ctx.boss.maxDrones - ctx.boss._countDrones();
                    if (missing < 5) return -10;
                    return 0.9 + missing * 0.05;
                },
                start: (b) => {
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    const telegraphMs = 500;
                    b.telegraphs.push(createTelegraphAura(cx, cy, 110, telegraphMs, '#9a6cff'));
                    return {
                        startedAt: Date.now(),
                        telegraphMs, surged: false, recoveryMs: 420,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) {
                                b2.vx *= 0.6; b2.vy *= 0.6;
                                return;
                            }
                            if (!st.surged) {
                                // Force-spawn 3 immediate defenders (bypass interval)
                                const ccx = b2.x + b2.width / 2;
                                const ccy = b2.y + b2.height / 2;
                                for (let i = 0; i < 3; i++) {
                                    if (b2._countDrones() >= b2.maxDrones) break;
                                    const a = (i / 3) * Math.PI * 2 + Math.random() * 0.4;
                                    const drone = b2._spawnDrone(a, 'defender');
                                    drone.x = ccx + Math.cos(a) * 30 - drone.width / 2;
                                    drone.y = ccy + Math.sin(a) * 30 - drone.height / 2;
                                }
                                // Speed boost all live drones for ~3s
                                for (const d of game.hiveDrones || []) {
                                    if (d.queen !== b2 || d.shouldDestroy) continue;
                                    d.orbitSpeed *= 1.6;
                                    d._surgeUntil = now + 3000;
                                }
                                if (typeof bossFX !== 'undefined') {
                                    bossFX.addShockwave(ccx, ccy, 10, 140,
                                        '#caa8ff', 480, 4, 0.7);
                                    bossFX.addFlash(ccx, ccy, 60, '#e0c8ff', 320, 0.85);
                                }
                                st.surged = true;
                            }
                        },
                        isDone: (b2) => b2.activeMove.surged
                    };
                }
            }
        ];
    }

    _firePlasmaScatter() {
        if (!game.hivePlasmaBullets) game.hivePlasmaBullets = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        const aim = tc ? Math.atan2(tc.y - cy, tc.x - cx) : 0;
        const count = 10;
        const spread = Math.PI * 0.9;
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1);
            const a = aim - spread / 2 + spread * t;
            const speed = 5.5 + Math.random() * 1.5;
            game.hivePlasmaBullets.push(new HivePlasmaBullet(
                cx + Math.cos(a) * 30, cy + Math.sin(a) * 30,
                Math.cos(a) * speed, Math.sin(a) * speed,
                10, { tracking: 0.025 }));
        }
        if (typeof bossFX !== 'undefined') {
            bossFX.addShockwave(cx, cy, 12, 80, '#caa8ff', 320, 3, 0.7);
        }
    }

    _recallDrones(maxNew) {
        if (!game.hiveDrones) game.hiveDrones = [];
        let needed = Math.min(maxNew, this.maxDrones - this._liveDroneCount());
        if (needed <= 0) return;
        const usedAngles = new Set();
        const live = (game.hiveDrones || []).filter(d => !d.shouldDestroy && d.queen === this);
        live.forEach(d => usedAngles.add(Math.round(d.orbitAngle * 100) / 100));
        let placed = 0;
        for (let i = 0; i < this.maxDrones && placed < needed; i++) {
            const a = (i / this.maxDrones) * Math.PI * 2;
            const key = Math.round(a * 100) / 100;
            if (usedAngles.has(key)) continue;
            const drone = new HiveDrone(this, a, this.droneOrbitRadius);
            this.drones.push(drone);
            game.hiveDrones.push(drone);
            if (game.enemies) game.enemies.push(drone);
            placed++;
        }
        if (typeof bossFX !== 'undefined') {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            bossFX.addFlash(cx, cy, 64, '#caa8ff', 360, 0.85);
            bossFX.addShockwave(cx, cy, 14, 100, '#9a6cff', 420, 4, 0.7);
        }
    }

    // ---- Draw -------------------------------------------------------------
    draw(ctx) {
        if (this.splinterPhase) return; // Ghost mode - splinters are drawn separately
        renderBossTelegraphs(ctx, this.telegraphs);

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        // Exposed glow when drones are gone
        if (now < this.exposedUntil) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const r = this.width * 1.2 + 4 * Math.sin(now * 0.012);
            const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
            grad.addColorStop(0, 'rgba(255,180,255,0.55)');
            grad.addColorStop(0.7, 'rgba(180,120,255,0.25)');
            grad.addColorStop(1, 'rgba(120,80,200,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Hull
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facing);
        // Outer hex chassis
        ctx.fillStyle = '#1c1230';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = this.width / 2;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#9a6cff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner pulsing core
        const pulse = 1 + 0.18 * Math.sin(this.pulsePhase);
        const coreR = this.width * 0.32 * pulse;
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR + 4);
        coreGrad.addColorStop(0, '#ffb0ff');
        coreGrad.addColorStop(0.5, '#9a6cff');
        coreGrad.addColorStop(1, 'rgba(80,40,160,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, coreR + 4, 0, Math.PI * 2);
        ctx.fill();

        // Eye slit (horizontal)
        ctx.fillStyle = '#fff0ff';
        ctx.fillRect(-6, -1.5, 12, 3);

        ctx.restore();

        // Hit indicators
        this._drawHitIndicators(ctx);
    }

    _drawHitIndicators(ctx) {
        const now = Date.now();
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
        for (const ind of this.hitIndicators) {
            const elapsed = now - ind.startTime;
            const p = elapsed / this.hitIndicatorDuration;
            const alpha = 1 - p;
            const offY = p * 30;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = ind.deflected ? '#7fdfff' : '#caa8ff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            const text = ind.deflected ? `DEFLECT ${ind.damage}` : `HIT ${ind.damage}`;
            ctx.strokeText(text, ind.x, ind.y - offY);
            ctx.fillText(text, ind.x, ind.y - offY);
            ctx.restore();
        }
    }
}

// =================================================================
// HiveSplinter - one of 4 cores spawned when HiveMind dies. Faster,
// more aggressive, fires plasma bursts. Player must kill all 4.
// =================================================================
class HiveSplinter extends GameObject {
    constructor(x, y, initialAngle) {
        super(x, y, 36, 36, '#3a2660');
        this.maxHealth = 80;
        this.health = this.maxHealth;
        this.speed = 36;
        this.spawnTime = Date.now();
        const a = initialAngle != null ? initialAngle : Math.random() * Math.PI * 2;
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;

        this.damageWindow = { accumulated: 0, windowStart: Date.now() };
        this.hitIndicators = [];
        this.hitIndicatorDuration = 500;

        this.lastFireAt = 0;
        this.fireInterval = 1400 + Math.random() * 600;
        this.contactDamage = 6;
        this.lastContactDamageAt = 0;

        this.stunned = false;
        this.stunEndTime = 0;
        this.isImpaled = false;
        this.impaledBy = null;

        this.facing = a;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.isHiveSplinter = true;
        this.shouldDestroy = false;
    }

    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage, source) : damage;
        const now = Date.now();
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        const actual = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        this.damageWindow.accumulated += damage;
        this.health -= actual;
        this.hitIndicators.push({
            damage: actual, startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 30,
            y: this.y - 4
        });
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 18, '#caa8ff', 180, 0.7);
        }
        if (this.health <= 0) {
            this._die();
            return true;
        }
        return false;
    }

    _die() {
        if (this.shouldDestroy) return;
        this.shouldDestroy = true;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, 60, '#e0c8ff', 420, 0.95);
            bossFX.addShockwave(cx, cy, 12, 90, '#9a6cff', 460, 4, 0.75);
            bossFX.spawnBurst(cx, cy, 18, {
                color: '#caa8ff',
                speedMin: 2, speedMax: 6,
                sizeMin: 1.8, sizeMax: 3.5,
                lifeMs: 460, drag: 0.9
            });
        }
    }

    setStunned(durationMs = 300) {
        this.stunned = true;
        this.stunEndTime = Date.now() + durationMs;
        this.vx = 0; this.vy = 0;
    }
    getImpaled(weapon) { this.isImpaled = true; this.impaledBy = weapon; this.vx = 0; this.vy = 0; }
    releaseImpale() { this.isImpaled = false; this.impaledBy = null; this.setStunned(180); }
    tryHeal() {}

    update() {
        const now = Date.now();
        if (this.shouldDestroy) return;
        if (this.stunned) {
            if (now >= this.stunEndTime) this.stunned = false;
            else { this.vx = 0; this.vy = 0; super.update(); this._clamp(); return; }
        }
        if (this.isImpaled) { super.update(); this._clamp(); return; }

        // ----- Phase-2 AI: scatter and kite -----
        // Splinters now actively keep distance from the player, repel each other
        // to avoid clustering, and snipe with plasma. They become harder to
        // multi-hit with AoE because they spread out.
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        // Steering vector accumulator.
        let sx = 0, sy = 0;

        if (game.player) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const dx = px - cx;
            const dy = py - cy;
            const distP = Math.hypot(dx, dy) || 1;
            const toPlayer = Math.atan2(dy, dx);

            // 1) Flee from player when too close. Force scales with proximity.
            //    Strong below 280px, fades out near 420px (preferred standoff).
            const fleeMin = 200;
            const fleeMax = 420;
            if (distP < fleeMax) {
                const k = 1 - Math.max(0, distP - fleeMin) / (fleeMax - fleeMin);
                // Negative direction (away from player) with mild tangential weave.
                const weaveSide = Math.sin(now * 0.005 + this.spawnTime * 0.0013) * 0.6;
                const fleeAng = toPlayer + Math.PI + weaveSide;
                const w = 1.6 * k; // strong push
                sx += Math.cos(fleeAng) * w;
                sy += Math.sin(fleeAng) * w;
            } else {
                // Far enough: slow drift outward perpendicular to the player line.
                const driftSide = ((this.spawnTime % 2 === 0) ? 1 : -1);
                const dAng = toPlayer + Math.PI / 2 * driftSide;
                sx += Math.cos(dAng) * 0.25;
                sy += Math.sin(dAng) * 0.25;
            }

            // 2) Snipe at current target from range. Only fire if there's some standoff.
            if (distP > 160 && now - this.lastFireAt > this.fireInterval) {
                // Aim at the actual valid target (player or decoy) so decoys draw fire too.
                let aimAng = toPlayer;
                const tc = (typeof getBossTargetCenter === 'function')
                    ? getBossTargetCenter(cx, cy) : null;
                if (tc) aimAng = Math.atan2(tc.y - cy, tc.x - cx);
                this._fire(aimAng);
                this.lastFireAt = now;
                this.fireInterval = 1100 + Math.random() * 700;
            }
        }

        // 3) Mutual separation: repel from nearby splinters so they don't
        //    pile up into a single AOE-friendly blob.
        const splinters = (game.enemies || []).filter(e => e instanceof HiveSplinter && e !== this && !e.shouldDestroy);
        if (splinters.length > 0) {
            const sepRadius = 180;
            let rxAcc = 0, ryAcc = 0;
            for (const s of splinters) {
                const ox = s.x + s.width / 2;
                const oy = s.y + s.height / 2;
                const ddx = cx - ox;
                const ddy = cy - oy;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 < sepRadius * sepRadius && d2 > 1) {
                    const d = Math.sqrt(d2);
                    const fall = (1 - d / sepRadius); // 1 close, 0 at edge
                    rxAcc += (ddx / d) * fall;
                    ryAcc += (ddy / d) * fall;
                }
            }
            sx += rxAcc * 1.2;
            sy += ryAcc * 1.2;
        }

        // 4) Soft wall avoidance — push back from edges so they don't
        //    pin themselves into corners while fleeing.
        const wallMargin = 80;
        if (this.x < wallMargin) sx += (wallMargin - this.x) * 0.02;
        if (this.y < wallMargin) sy += (wallMargin - this.y) * 0.02;
        if (this.x > GAME_CONFIG.WIDTH - this.width - wallMargin) {
            sx -= (this.x - (GAME_CONFIG.WIDTH - this.width - wallMargin)) * 0.02;
        }
        if (this.y > GAME_CONFIG.HEIGHT - this.height - wallMargin) {
            sy -= (this.y - (GAME_CONFIG.HEIGHT - this.height - wallMargin)) * 0.02;
        }

        // Convert steering to target velocity (capped at this.speed).
        const sLen = Math.hypot(sx, sy);
        let tvx = 0, tvy = 0;
        if (sLen > 0.0001) {
            const inv = 1 / sLen;
            tvx = sx * inv * this.speed;
            tvy = sy * inv * this.speed;
        }
        // Smooth steering for less jitter.
        this.vx += (tvx - this.vx) * 0.12;
        this.vy += (tvy - this.vy) * 0.12;
        this.facing = Math.atan2(this.vy || 0.001, this.vx || 0.001);

        // Contact damage (kept as a defensive bite if player still chases them).
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)
            && now - this.lastContactDamageAt > 500) {
            game.player.takeDamage(this.contactDamage);
            this.lastContactDamageAt = now;
            if (typeof updateUI === 'function') updateUI();
        }

        super.update();
        this._clamp();
        this.pulsePhase += 0.05;
    }

    _clamp() {
        const m = 8;
        if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx); }
        if (this.y < m) { this.y = m; this.vy = Math.abs(this.vy); }
        if (this.x > GAME_CONFIG.WIDTH - this.width - m) {
            this.x = GAME_CONFIG.WIDTH - this.width - m; this.vx = -Math.abs(this.vx);
        }
        if (this.y > GAME_CONFIG.HEIGHT - this.height - m) {
            this.y = GAME_CONFIG.HEIGHT - this.height - m; this.vy = -Math.abs(this.vy);
        }
    }

    _fire(aim) {
        if (!game.hivePlasmaBullets) game.hivePlasmaBullets = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // 3-round burst slightly spread
        for (let i = 0; i < 3; i++) {
            const spread = (i - 1) * 0.18;
            const a = aim + spread;
            const speed = 7;
            game.hivePlasmaBullets.push(new HivePlasmaBullet(
                cx + Math.cos(a) * 22, cy + Math.sin(a) * 22,
                Math.cos(a) * speed, Math.sin(a) * speed,
                7, { tracking: 0.03 }));
        }
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx + Math.cos(aim) * 22, cy + Math.sin(aim) * 22,
                14, '#caa8ff', 160, 0.85);
        }
    }

    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        // Halo
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const haloR = this.width * 0.7 + 3 * Math.sin(this.pulsePhase);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
        grad.addColorStop(0, 'rgba(255,160,255,0.7)');
        grad.addColorStop(0.6, 'rgba(160,110,255,0.35)');
        grad.addColorStop(1, 'rgba(80,40,160,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Body (rotated diamond hex)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.facing);
        ctx.fillStyle = '#241540';
        ctx.beginPath();
        ctx.moveTo(this.width / 2, 0);
        ctx.lineTo(0, -this.height / 2);
        ctx.lineTo(-this.width / 2, 0);
        ctx.lineTo(0, this.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#caa8ff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Eye
        ctx.fillStyle = '#fff0ff';
        ctx.beginPath();
        ctx.arc(this.width / 4, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // HP bar
        const bw = 36, bh = 3;
        const hp = Math.max(0, this.health) / this.maxHealth;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(this.x, this.y - 8, bw, bh);
        ctx.fillStyle = '#caa8ff';
        ctx.fillRect(this.x, this.y - 8, bw * hp, bh);

        // Hit indicators
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
        for (const ind of this.hitIndicators) {
            const elapsed = now - ind.startTime;
            const p = elapsed / this.hitIndicatorDuration;
            const a = 1 - p;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = '#caa8ff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.strokeText(ind.damage, ind.x, ind.y - p * 24);
            ctx.fillText(ind.damage, ind.x, ind.y - p * 24);
            ctx.restore();
        }
    }
}
