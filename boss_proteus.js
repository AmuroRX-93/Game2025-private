// 普罗忒斯 Proteus - Shapeshifter Boss
// Switches form based on PLAYER DISTANCE (not HP). Three forms:
//   - Halberd Form  (close range): polearm sweeps, thrusts and a long-range wave
//   - Skirmish Form (mid range):    burst shotgun blasts + short dashes
//   - Turret Form   (far range):    deploys static cannons that arc-fire, no melee
// Reconfiguration takes ~600ms during which Proteus cannot attack but
// takes +25% damage. This rewards forcing him to mis-match the player
// and punishing during the swap window.

const PROTEUS_DAMAGE_MULT = 0.5;
const PROTEUS_FORM_THRESH_NEAR = 350;
const PROTEUS_FORM_THRESH_FAR  = 600;
const PROTEUS_FORM_HYSTERESIS  = 60;     // dead-zone to prevent flicker
const PROTEUS_RECONFIG_MS      = 600;
const PROTEUS_FORM_DWELL       = 20000;  // every form lasts exactly 20s, then swaps
const PROTEUS_PROACTIVE_CD     = 5500;   // min interval between *proactive* swaps

class Proteus extends GameObject {
    constructor(x, y) {
        super(x, y, 48, 48, '#3a4a55');
        this.maxHealth = 360;
        this.health = this.maxHealth;
        this.speed = 36;

        this.isBoss = true;
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = false;
        this.stunEndTime = 0;
        this.notTargetable = false;

        // Damage window
        this.damageWindow = { accumulated: 0, windowStart: Date.now() };

        // Hit indicators
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;

        // Form / reconfiguration state
        this.form = 'skirmish';            // halberd | skirmish | turret
        this.targetForm = 'skirmish';
        this.formEnteredAt = Date.now();
        this.reconfiguring = false;
        this.reconfigStart = 0;
        // Debug: when true, the AI does NOT auto-switch forms; designer
        // (or the floating debug panel) drives all form changes manually.
        this.debugMode = false;

        // Proactive (AI-driven) form swaps — separate cooldown from the
        // distance-driven swap so the boss can occasionally counter-pick
        // even when the player isn't crossing a distance threshold.
        this.lastProactiveSwapAt = 0;
        // Sliding 1.5s window of damage taken; if the player burns him
        // hard he reacts by jumping to a defensive form.
        this.recentDamageTaken = 0;
        this.recentDamageWindowStart = Date.now();

        // Per-form move timing (independent cooldowns)
        this.lastHalberdThrustAt = 0;
        this.lastHalberdSwingAt = 0;
        this.lastHalberdWaveAt = 0;
        // Halberd strafing state — boss orbits the player rather than
        // glueing to them. Direction flips on a randomized timer so the
        // player can disengage with sustained lateral movement.
        this.halberdStrafeDir = (Math.random() < 0.5 ? 1 : -1);
        this.halberdStrafeFlipAt = 0;
        this.lastSkirmishBlastAt = 0;
        this.lastSkirmishDashAt = 0;
        this.lastSkirmishMissileAt = 0;     // last missile salvo trigger
        this.skirmishMissileBurst = null;   // active 15-missile burst state
        // Reactive Skirmish-only abilities: blink, EMP, self-heal.
        // Each has its own cooldown and a chance gate so they only
        // fire opportunistically rather than every time conditions match.
        this.lastSkirmishBlinkAt = 0;
        this.lastSkirmishEmpAt = 0;
        this.lastSkirmishHealAt = 0;
        this.lastSkirmishCannonAt = 0;   // occasional turret-style laser cannon
        this.skirmishBlinkFx = null; // {at, sx, sy, ex, ey} for trail draw
        this.skirmishEmpFx = null;   // {at, durMs} expanding ring
        this.skirmishHealFx = null;  // {at, durMs} green pulse
        this.playerEmpUntil = 0;     // wall-clock until player is EMP'd
        // Drone bits — orbiting fighters that fire then self-destruct.
        // Used by Skirmish + Turret forms with independent cooldowns.
        this.proteusDrones = [];
        this.lastDroneSwarmAt = 0;
        this.lastTurretSpawnAt = 0;
        this.lastTurretShotAt = 0;
        this.lastTurretMissileAt = 0;  // periodic random missile launches
        this.turrets = []; // {x, y, lastShotAt, bornAt}

        // Turret-form shield (Magnus-style, 80% damage reduction).
        // Shield is *not* one-shot any more: it regenerates while active
        // and re-spawns automatically after shieldRespawnCd once broken.
        // HP pool was bumped from 0.168x → 0.32x of max HP to give it
        // real staying power in the new always-on regime.
        this.shieldActive = false;
        this.shieldHp = 0;
        this.shieldMaxHp = Math.round(this.maxHealth * 0.32);
        this.shieldDamageReduction = 0.8;
        // Shield regen — extremely slow (was 0.015 / ~64s, originally 0.06 / ~16s).
        // We compute as a fractional per-second value rather than rounding,
        // because at small shieldMaxHp the rounded integer would clamp to 0
        // and the shield would never tick up.
        this.shieldRegenPerSec = this.shieldMaxHp * 0.003;          // ~333s full
        this.shieldLastRegenTick = 0;
        this.shieldBornAt = 0;
        this.shieldBrokenAt = 0;
        this.shieldRespawnCd = 8000;
        this.shieldBreakDamage = 18;
        this.shieldBreakRadius = 110;

        // Active laser FX list — turret/boss-cannon shots are now hitscan
        // beams rendered for ~fireMs after firing. Mirrors Crimson King's
        // crimsonLaserFX but supports multiple concurrent beams.
        this.proteusLasers = [];

        // Point-defense (CIWS) — ported from Sublime Moon. Active only
        // in turret form (deactivated in _beginReconfigure when leaving).
        // Targets the nearest non-reversed player missile inside pdRange
        // and shoots fast tracers at it. Bullets reuse the existing
        // BossCIWSBullet pipeline (game.bossCiwsBullets) so collision
        // and rendering are handled by gameCore.
        this.pdActive = false;
        this.pdRange = 320;
        this.pdFireRate = 18;            // shots per second
        this.pdLastFire = 0;
        this.pdBulletSpeed = 14;
        this.pdColor = '#7fdfff';        // cyan to match turret form

        // Ongoing attack state (for melee swing windows)
        this.activeSwing = null;  // {startedAt, durMs, startAng, endAng, didHit}
        this.swingDash   = null;  // pre-swing forward dash with trailing blade
        this.activeThrust = null; // quick spear thrust
        this.activeWave = null;   // long-range spear wave (hitscan)
        this.activeDash  = null;

        // Telegraphs
        this.telegraphs = [];

        // Spin / facing (for visual)
        this.facingAngle = 0;
        this.bodySpin = 0;

        // Movement scratch
        this.lastAiUpdate = Date.now();
        this.spawnTime = Date.now();
    }

    // ============= Standard hit / damage handling =============
    takeDamage(damage, source) {
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage, source) : damage;
        const now = Date.now();
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        let actualDamage = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        // While reconfiguring, take +25% more damage — the encouragement
        // to bait form swaps and punish them.
        if (this.reconfiguring) actualDamage = Math.round(actualDamage * 1.25);
        this.damageWindow.accumulated += damage;

        // Turret-form shield: 80% of incoming damage is absorbed by the
        // shield pool, 20% leaks to hull. Breaks on shieldHp <= 0 with a
        // small AOE.
        if (this.shieldActive && this.shieldHp > 0) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            const absorbed = Math.round(actualDamage * this.shieldDamageReduction);
            const leak = actualDamage - absorbed;
            this.shieldHp -= absorbed;
            if (typeof bossFX !== 'undefined') {
                bossFX.addFlash(cx, cy, this.width * 0.9, '#7fdfff', 200, 0.55);
                bossFX.addShockwave(cx, cy, this.width * 0.5, this.width * 1.05,
                    '#bff0ff', 220, 1.6, 0.5);
            }
            this.hitIndicators.push({
                damage: absorbed, isShield: true,
                startTime: now,
                x: cx + (Math.random() - 0.5) * 50,
                y: this.y - 8 + Math.random() * 6
            });
            actualDamage = leak;
            if (this.shieldHp <= 0) this._breakShield();
        }

        if (actualDamage > 0) {
            this.health -= actualDamage;
            this.addHitIndicator(actualDamage);
        }
        // Track damage in a tighter sliding window for proactive AI:
        // sustained pressure should make him jump form to break tempo.
        if (now - this.recentDamageWindowStart >= 1500) {
            this.recentDamageTaken = 0;
            this.recentDamageWindowStart = now;
        }
        this.recentDamageTaken += actualDamage;
        return this.health <= 0;
    }

    _activateShield(now) {
        this.shieldActive = true;
        this.shieldHp = this.shieldMaxHp;
        this.shieldBornAt = now;
        this.shieldLastRegenTick = now;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, this.width * 1.2, '#7fdfff', 380, 0.85);
            bossFX.addShockwave(cx, cy, this.width * 0.5, this.width * 1.4,
                '#bff0ff', 460, 3, 0.65);
        }
    }

    _deactivateShield() {
        this.shieldActive = false;
        this.shieldHp = 0;
    }

    _breakShield() {
        this.shieldActive = false;
        this.shieldHp = 0;
        this.shieldBrokenAt = Date.now();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, this.shieldBreakRadius * 0.9, '#d8f0ff', 360, 1.0);
            bossFX.addShockwave(cx, cy, this.width * 0.6, this.shieldBreakRadius * 1.4,
                '#7fdfff', 500, 5, 0.85);
            bossFX.addShockwave(cx, cy, this.width * 0.4, this.shieldBreakRadius * 1.0,
                '#d8f0ff', 360, 3, 0.7);
            bossFX.spawnBurst && bossFX.spawnBurst(cx, cy, 22, {
                color: '#7fdfff',
                speedMin: 3, speedMax: 7,
                sizeMin: 2, sizeMax: 4,
                lifeMs: 480, drag: 0.92
            });
            if (typeof bossFX.addShake === 'function') bossFX.addShake(5, 240);
        }
        // AOE damage to player when the shield shatters near them.
        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(px - cx, py - cy);
            if (d <= this.shieldBreakRadius) {
                const falloff = 1 - (d / this.shieldBreakRadius) * 0.5;
                const dmg = Math.max(1, Math.round(this.shieldBreakDamage * falloff));
                game.player.takeDamage(dmg);
            }
        }
        // Chance to immediately rebuild the shield after a brief delay.
        // We don't call _activateShield directly here (the break VFX needs
        // a moment to read); instead we rewind shieldBrokenAt so the
        // existing respawn-cd path in _tickShield kicks in early.
        if (Math.random() < 0.35) {
            const rebuildDelay = 1200;
            this.shieldBrokenAt = Date.now() - (this.shieldRespawnCd - rebuildDelay);
            this._pendingShieldRebuild = true;
            if (typeof bossFX !== 'undefined') {
                // Telegraph the rebuild so it doesn't feel random.
                bossFX.addFlash(cx, cy, 36, '#7fdfff', 480, 0.55);
                if (typeof bossFX.addShockwave === 'function') {
                    bossFX.addShockwave(cx, cy, 8, 28, '#bff0ff', 480, 1.5, 0.4);
                }
            }
        }
    }

    // Per-frame shield maintenance — only meaningful in turret form.
    //   - If active and below max:  regen at shieldRegenPerSec.
    //   - If broken and cd elapsed: auto-reactivate (no need to swap form).
    // Called from _tickTurret each frame.
    _tickShield(now) {
        // Auto-respawn after the broken cooldown.
        if (!this.shieldActive && this.shieldBrokenAt > 0
            && now - this.shieldBrokenAt >= this.shieldRespawnCd) {
            this._activateShield(now);
            return;
        }
        // Continuous regen while active.
        if (this.shieldActive && this.shieldHp < this.shieldMaxHp) {
            if (this.shieldLastRegenTick === 0) this.shieldLastRegenTick = now;
            const dt = (now - this.shieldLastRegenTick) / 1000;
            if (dt > 0) {
                const regen = this.shieldRegenPerSec * dt;
                this.shieldHp = Math.min(this.shieldMaxHp, this.shieldHp + regen);
                this.shieldLastRegenTick = now;
            }
        } else {
            // Reset accumulator when we're at full or inactive so the
            // next regen cycle starts cleanly.
            this.shieldLastRegenTick = now;
        }
    }

    // Turret-form CIWS: ported from Sublime Moon. Picks the closest
    // non-reversed player missile inside pdRange and fires a fast tracer
    // at it. Tracer reuses BossCIWSBullet so collision/draw is shared
    // with the existing pipeline. Only runs while pdActive (set by
    // _beginReconfigure on form swap) so other forms aren't protected.
    _updateProteusPointDefense(now) {
        if (!this.pdActive) return;
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
            // Only friendly (non-reversed) player missiles. Reversed ones
            // are already heading away; intercepting them is wasted ammo.
            if (m.isReversed) continue;
            const mx = (m.x != null ? m.x : 0) + (m.width || 0) / 2;
            const my = (m.y != null ? m.y : 0) + (m.height || 0) / 2;
            const dx = mx - cx;
            const dy = my - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist2) {
                bestDist2 = d2;
                best = { m, mx, my };
            }
        }
        if (!best) return;

        // Direct aim — CIWS bullets are fast enough that lead prediction
        // shoots into empty space against curving missiles.
        const dx0 = best.mx - cx;
        const dy0 = best.my - cy;
        const aLen = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
        const vx = (dx0 / aLen) * this.pdBulletSpeed;
        const vy = (dy0 / aLen) * this.pdBulletSpeed;

        if (typeof BossCIWSBullet === 'function') {
            const bullet = new BossCIWSBullet(cx, cy, vx, vy, this.pdColor);
            if (!game.bossCiwsBullets) game.bossCiwsBullets = [];
            game.bossCiwsBullets.push(bullet);
        }
        // Muzzle puff so the player can read the firing arc.
        if (typeof bossFX !== 'undefined') {
            const ang = Math.atan2(vy, vx);
            const muzzleX = cx + Math.cos(ang) * 14;
            const muzzleY = cy + Math.sin(ang) * 14;
            bossFX.addFlash(muzzleX, muzzleY, 8, this.pdColor, 110, 0.7);
        }
        this.pdLastFire = now;
    }

    addHitIndicator(damage) {
        const now = Date.now();
        this.hitIndicators.push({
            damage,
            startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 60,
            y: this.y + this.height + 14 + Math.random() * 8
        });
        this.hitIndicators = this.hitIndicators.filter(i => now - i.startTime < this.hitIndicatorDuration);
    }

    drawHitIndicators(_ctx) { /* retired: trailing ghost on HP bar replaces this */ }

    getImpaled(weapon) {
        this.isImpaled = true; this.impaledBy = weapon;
        this.vx = 0; this.vy = 0;
    }
    releaseImpale() {
        this.isImpaled = false; this.impaledBy = null;
        this.stunned = true; this.stunEndTime = Date.now() + 250;
        this.vx = 0; this.vy = 0;
    }

    checkDodge() { /* intentionally empty */ }
    checkBulletDodge() { /* intentionally empty */ }
    checkMissileDodge() { /* intentionally empty */ }

    // ============= Top-level update =============
    update() {
        if (this.health <= 0) return;
        const now = Date.now();
        if (this.isImpaled) { super.update(); return; }
        if (this.stunned) {
            if (now >= this.stunEndTime) this.stunned = false;
            else { this.vx = 0; this.vy = 0; super.update(); return; }
        }

        this._faceTarget();
        this._evaluateFormSwitch(now);
        // Proactive switching disabled: forms now run on a fixed 20s
        // schedule per design. Re-enable by calling _evaluateProactiveSwitch
        // here if behavior should adapt within the 20s window again.

        if (this.reconfiguring) {
            this._tickReconfigure(now);
        } else {
            // Run form-specific behaviour.
            if (this.form === 'halberd') this._tickHalberd(now);
            else if (this.form === 'skirmish') this._tickSkirmish(now);
            else if (this.form === 'turret') this._tickTurret(now);
        }

        // Shield maintenance runs every frame so a pending rebuild after
        // a probabilistic break can fire even when the boss has already
        // swapped out of turret form.
        this._tickShield(now);

        this._tickSwingDash(now);
        this._tickActiveSwing(now);
        this._tickActiveThrust(now);
        this._tickActiveWave(now);
        this._tickActiveDash(now);
        this._updateTurrets(now);
        this._updateSplittingMissiles(now);
        this._updateProteusDrones(now);

        super.update();
        this._clampToArena();
        this.bodySpin += 0.012;
    }

    _faceTarget() {
        if (!game.player) return;
        const dx = (game.player.x + game.player.width / 2) - (this.x + this.width / 2);
        const dy = (game.player.y + game.player.height / 2) - (this.y + this.height / 2);
        this.facingAngle = Math.atan2(dy, dx);
    }

    _clampToArena() {
        if (this.x < 0) this.x = 0;
        if (this.y < 0) this.y = 0;
        if (this.x + this.width > GAME_CONFIG.WIDTH) this.x = GAME_CONFIG.WIDTH - this.width;
        if (this.y + this.height > GAME_CONFIG.HEIGHT) this.y = GAME_CONFIG.HEIGHT - this.height;
    }

    _playerDistance() {
        if (!game.player) return 9999;
        const dx = (game.player.x + game.player.width / 2) - (this.x + this.width / 2);
        const dy = (game.player.y + game.player.height / 2) - (this.y + this.height / 2);
        return Math.hypot(dx, dy);
    }

    // ============= Form selection =============
    // Decide what form *should* be active given current player distance.
    // Hysteresis: when already in a form, the boundary expands so the
    // boss doesn't oscillate at the threshold edge.
    _desiredFormForDistance(d) {
        const near = PROTEUS_FORM_THRESH_NEAR;
        const far  = PROTEUS_FORM_THRESH_FAR;
        const h = PROTEUS_FORM_HYSTERESIS;
        if (this.form === 'halberd') {
            // Lenient exit threshold: as soon as the player gets near the
            // base near-threshold, allow leaving halberd. Otherwise the
            // boss aggressively glues to 70px and the player can never
            // realistically open the gap to (near + h) to trigger a swap.
            if (d > near - h) {
                return d > far + h ? 'turret' : 'skirmish';
            }
            return 'halberd';
        }
        if (this.form === 'turret') {
            if (d < far - h) {
                return d < near - h ? 'halberd' : 'skirmish';
            }
            return 'turret';
        }
        // Currently skirmish.
        if (d < near - h) return 'halberd';
        if (d > far + h) return 'turret';
        return 'skirmish';
    }

    _evaluateFormSwitch(now) {
        if (this.reconfiguring) return;
        if (this.debugMode) return;
        // Fixed 20s dwell: when the timer hits, force a form swap. The
        // chosen form follows distance preference but must differ from
        // the current form, so the fight stays dynamic.
        if (now - this.formEnteredAt >= PROTEUS_FORM_DWELL) {
            const d = this._playerDistance();
            const forced = this._pickForcedSwapForm(d);
            if (forced && forced !== this.form) this._beginReconfigure(forced, now);
        }
    }

    // Pick a "best alternative" form when the max-dwell timer expires.
    // Prefers the distance-bucket neighbor of the current form, falling
    // back to a random non-current form if the bucket already matches.
    _pickForcedSwapForm(d) {
        const order = ['halberd', 'skirmish', 'turret'];
        const others = order.filter(f => f !== this.form);
        // If distance already prefers a non-current bucket, use it.
        let preferred = null;
        if (d < PROTEUS_FORM_THRESH_NEAR) preferred = 'halberd';
        else if (d > PROTEUS_FORM_THRESH_FAR) preferred = 'turret';
        else preferred = 'skirmish';
        if (preferred !== this.form) return preferred;
        return others[Math.floor(Math.random() * others.length)];
    }

    // Proactive AI: even when distance hasn't crossed a threshold, decide
    // whether the *current situation* warrants a counter-pick. Triggers:
    //   - Heavy recent damage  -> jump to a form that mismatches what the
    //                              player is doing (escape/relocate).
    //   - Low HP burst window  -> bias toward turret (longest-range threat).
    //   - Player point-blank   -> surprise swap to skirmish for shotgun
    //                              when stuck in halberd against a kiter.
    // Independent cooldown PROACTIVE_CD so it doesn't spam on top of the
    // distance-driven swap.
    _evaluateProactiveSwitch(now) {
        if (this.reconfiguring) return;
        if (now - this.formEnteredAt < PROTEUS_FORM_DWELL) return;
        if (now - this.lastProactiveSwapAt < PROTEUS_PROACTIVE_CD) return;

        const d = this._playerDistance();
        const hpPct = this.health / this.maxHealth;
        const pressure = this.recentDamageTaken; // hp lost in last 1.5s
        const heavyHit = pressure > this.maxHealth * 0.07;  // ~25 dmg on 360hp
        const desperate = hpPct < 0.35;

        // Candidate selection — pick a form *different* from current that
        // best fits the situation. Returns null if no good counter-pick.
        let want = null;

        // 1) Sustained pressure: bail out of whatever the player is comfy
        //    fighting. Halberd victims kite -> jump to turret. Turret
        //    being plinked at range -> jump to skirmish to close in.
        if (heavyHit) {
            if (this.form === 'halberd') want = 'turret';
            else if (this.form === 'turret') want = 'skirmish';
            else want = (d < PROTEUS_FORM_THRESH_NEAR) ? 'turret' : 'halberd';
        }

        // 2) Low HP: bias toward the most defensive form (turret — body
        //    is rooted but turrets keep firing, hardest to engage).
        if (desperate && this.form !== 'turret') {
            // Don't override an already-good counter-pick from rule (1).
            if (!want) want = 'turret';
        }

        // 3) Anti-camp: if player has been point-blank (<140) for a while
        //    and we're not halberd, swap *to* halberd so we punish them.
        //    Probabilistic so it isn't deterministic.
        if (!want && d < 140 && this.form !== 'halberd' && Math.random() < 0.5) {
            want = 'halberd';
        }

        // 4) Anti-snipe: player camping far (>700) for a while and we
        //    aren't turret -> turret form to deploy area pressure.
        if (!want && d > 700 && this.form !== 'turret' && Math.random() < 0.5) {
            want = 'turret';
        }

        if (!want || want === this.form) return;
        this._beginReconfigure(want, now);
        this.lastProactiveSwapAt = now;
        // Reset pressure window — we just paid the cost of swapping.
        this.recentDamageTaken = 0;
        this.recentDamageWindowStart = now;
    }

    _beginReconfigure(want, now) {
        this.targetForm = want;
        this.reconfiguring = true;
        this.reconfigStart = now;
        this.vx = 0; this.vy = 0;
        // Drop any in-flight melee/dash so reconfigure isn't broken.
        this.activeSwing = null;
        this.swingDash = null;
        this.activeThrust = null;
        this.activeWave = null;
        this.activeDash = null;
        this.skirmishMissileBurst = null;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        bossFX.addFlash(cx, cy, 56, '#a0e0c0', 280, 0.8);
        bossFX.addShockwave(cx, cy, 12, 80, '#7fc8a0', 360, 3, 0.6);
    }

    _tickReconfigure(now) {
        const t = (now - this.reconfigStart) / PROTEUS_RECONFIG_MS;
        if (t >= 1) {
            this.reconfiguring = false;
            this.form = this.targetForm;
            this.formEnteredAt = now;
            // On entering Turret form, immediately deploy turrets so the
            // player feels the structural change.
            if (this.form === 'turret') {
                this._deployTurrets();
                this.pdActive = true;
                // Bring the shield up unless it was just broken (cooldown).
                if (now - this.shieldBrokenAt >= this.shieldRespawnCd) {
                    this._activateShield(now);
                }
            } else {
                // Leaving turret form. If the shield is still up, the
                // boss vents the stored energy as a big shockwave on
                // the way out (no controlled retreat any more).
                if (this.shieldActive && this.shieldHp > 0) {
                    this._releaseShieldShockwave(now);
                }
                this._deactivateShield();
                this.pdActive = false;
            }
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            bossFX.addFlash(cx, cy, 60, this._formColor(), 300, 0.85);
            bossFX.addShockwave(cx, cy, 14, 90, this._formColor(), 360, 3, 0.6);
        }
        // No movement, no attacks while reconfiguring.
        this.vx = 0; this.vy = 0;
    }

    // Big radial shockwave fired off when Proteus drops a still-active
    // shield by switching forms. Damages the player based on falloff and
    // gives a hard knockback. Distinct from _breakShield AOE so the
    // visuals & numbers don't get mistaken for a regular shield shatter.
    _releaseShieldShockwave(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const radius = 260;
        const baseDmg = 38;
        if (typeof bossFX !== 'undefined') {
            bossFX.addFlash(cx, cy, radius * 0.6, '#bff0ff', 420, 1.0);
            if (typeof bossFX.addShockwave === 'function') {
                bossFX.addShockwave(cx, cy, this.width * 0.6, radius * 1.05,
                    '#7fdfff', 620, 7, 0.9);
                bossFX.addShockwave(cx, cy, this.width * 0.4, radius * 0.85,
                    '#d8f0ff', 480, 4, 0.75);
            }
            if (typeof bossFX.spawnBurst === 'function') {
                bossFX.spawnBurst(cx, cy, 32, {
                    color: '#7fdfff',
                    speedMin: 4, speedMax: 10,
                    sizeMin: 2, sizeMax: 4.5,
                    lifeMs: 560, drag: 0.92
                });
            }
            if (typeof bossFX.addShake === 'function') bossFX.addShake(8, 320);
        }
        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const d = Math.hypot(px - cx, py - cy);
            if (d <= radius) {
                const falloff = 1 - (d / radius) * 0.6;
                const dmg = Math.max(1, Math.round(baseDmg * falloff));
                game.player.takeDamage(dmg);
                if (d > 0.0001) {
                    const kx = (px - cx) / d, ky = (py - cy) / d;
                    game.player.vx += kx * 18;
                    game.player.vy += ky * 18;
                }
            }
        }
    }

    _formColor() {
        if (this.targetForm === 'halberd') return '#ffd86b';
        if (this.targetForm === 'turret')  return '#7fdfff';
        return '#a0ffc0';
    }

    // ============= Halberd Form (close range, "spearman" archetype) =============
    // The lance specialist. Four moves split by distance:
    //   - Thrust    : <220 reach,  flame spear stab  (short cd)
    //   - Sweep     : <220 reach,  arc slash         (medium cd)
    //   - Wave      : >200 dist,   hitscan beam      (longest cd, ranged poke)
    _tickHalberd(now) {
        if (!game.player) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const ang = Math.atan2(py - cy, px - cx);
        const dist = Math.hypot(px - cx, py - cy);
        // Hold position during active commitments — committed moves
        // freeze movement so the spearman doesn't drift mid-swing.
        const committed = !!(this.activeSwing || this.swingDash || this.activeThrust || this.activeWave);
        if (!committed) {
            // Periodically flip strafe direction so the boss doesn't
            // orbit predictably in one direction. 1.6–2.4s windows.
            if (now > this.halberdStrafeFlipAt) {
                // 70% chance to flip, 30% chance to keep direction (so it
                // can sometimes lap the player) — feels more lifelike.
                if (Math.random() < 0.7) this.halberdStrafeDir *= -1;
                this.halberdStrafeFlipAt = now + 1600 + Math.random() * 800;
            }
            // Desired distance breathes between 150 and 200 so the
            // player has wiggle room. Slow sin so the boss doesn't yo-yo.
            const desired = 175 + Math.sin(now * 0.0018) * 25;
            const delta = dist - desired;
            // Radial weight: strong push if too close, gentler pull if
            // too far (so the boss spends most of its time orbiting
            // rather than sprinting in a straight line).
            let radial;
            if (delta < 0) {
                // Too close — back off briskly.
                radial = Math.max(-1, delta / 60);
            } else {
                // Too far — close in but never at full sprint.
                radial = Math.min(0.7, delta / 110);
            }
            // Tangential strafe: orbit the player perpendicular to the
            // line connecting them. Stronger when the radial term is
            // small (i.e. boss is at desired distance).
            const orbitWeight = 0.65 + 0.35 * (1 - Math.min(1, Math.abs(delta) / 80));
            const tangAng = ang + Math.PI / 2 * this.halberdStrafeDir;
            const moveSpeed = this.speed * 1.25;
            const tvx = Math.cos(ang) * radial * moveSpeed
                      + Math.cos(tangAng) * orbitWeight * moveSpeed;
            const tvy = Math.sin(ang) * radial * moveSpeed
                      + Math.sin(tangAng) * orbitWeight * moveSpeed;
            // Smooth so direction flips don't snap the boss in place.
            this.vx += (tvx - this.vx) * 0.14;
            this.vy += (tvy - this.vy) * 0.14;
        }

        if (committed) return;

        // Move selection — pick the highest-priority move that fits the
        // current band. Each gates on its own CD so they cycle naturally.
        // Bands widened to match the new orbital desired distance (~175).
        if (dist < 220 && now - this.lastHalberdThrustAt > 900) {
            this._startHalberdThrust(now, ang);
            this.lastHalberdThrustAt = now;
            return;
        }
        // Swing only fires when the player is inside the blade's reach.
        // SWING_RADIUS must match the radius set in _startHalberdSwing.
        if (dist < 220 && now - this.lastHalberdSwingAt > 1700) {
            this._startHalberdSwing(now, ang);
            this.lastHalberdSwingAt = now;
            return;
        }
        if (dist > 200 && now - this.lastHalberdWaveAt > 4500) {
            this._startHalberdWave(now, ang);
            this.lastHalberdWaveAt = now;
            return;
        }
    }

    // --- Move 1: Spear Thrust (fast jab) ---
    // Short telegraph ~180ms, then snap a narrow forward stab. Quick to
    // commit; great pressure when the player is right on top of you.
    _startHalberdThrust(now, ang) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const reach = 360;
        // No windup — fire the thrust on the same frame the move is
        // selected. Aim straight at the player's current position.
        const px = (game.player ? game.player.x + game.player.width / 2 : cx + Math.cos(ang) * reach);
        const py = (game.player ? game.player.y + game.player.height / 2 : cy + Math.sin(ang) * reach);
        const ang2 = Math.atan2(py - cy, px - cx);
        this.activeThrust = {
            startedAt: Date.now(),
            durMs: 320,
            cx: cx, cy: cy,
            ang: ang2,
            reach: reach,
            hitRadius: 26,
            didHit: false,
            damage: Math.round(14 * PROTEUS_DAMAGE_MULT)
        };
        bossFX.addFlash(cx, cy, 32, '#bff0ff', 200, 0.75);
    }

    // --- Move 2: Sweep Slash (wide arc) ---
    // Plays in two phases:
    //   1. swingDash — boss lunges forward toward the player while the
    //      flame greatsword drags behind (matches the player sword's
    //      "刀推" pre-attack push). ~200ms.
    //   2. activeSwing — boss stops, blade unfolds and sweeps across.
    _startHalberdSwing(now, ang) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Aim now; this lock-in direction stays for both phases so the
        // dash is a clean straight push and the swing centers on it.
        const px = (game.player ? game.player.x + game.player.width / 2 : cx + Math.cos(ang) * 100);
        const py = (game.player ? game.player.y + game.player.height / 2 : cy + Math.sin(ang) * 100);
        const ang2 = Math.atan2(py - cy, px - cx);
        const dist = Math.hypot(px - cx, py - cy);
        // Dash distance: close most of the gap, but stop just outside
        // sweep radius so the swing actually hits.
        const targetGap = 80;
        const dashLen = Math.max(0, Math.min(dist - targetGap, 220));
        const dashDur = 200;
        this.swingDash = {
            startedAt: Date.now(),
            durMs: dashDur,
            sx: cx, sy: cy,
            ex: cx + Math.cos(ang2) * dashLen,
            ey: cy + Math.sin(ang2) * dashLen,
            ang: ang2
        };
        bossFX.addFlash(cx, cy, 36, '#ffd86b', 200, 0.6);
    }

    // --- Move 3: Spear Wave (long-range hitscan polearm beam) ---
    // No windup — fires the piercing hitscan immediately on the player's
    // current bearing. The wave's own draw routine still flashes a brief
    // beam so the move reads clearly.
    _startHalberdWave(now, ang) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Long range — extends near the arena edge for visual impact.
        const range = 900;
        const px = (game.player ? game.player.x + game.player.width / 2 : cx + Math.cos(ang) * range);
        const py = (game.player ? game.player.y + game.player.height / 2 : cy + Math.sin(ang) * range);
        const ang2 = Math.atan2(py - cy, px - cx);
        const endX = cx + Math.cos(ang2) * range;
        const endY = cy + Math.sin(ang2) * range;
        // Hit-check (line vs player).
        let dealt = false;
        if (game.player && !game.player.isUntargetable) {
            const ppx = game.player.x + game.player.width / 2;
            const ppy = game.player.y + game.player.height / 2;
            const dxL = endX - cx, dyL = endY - cy;
            const len2 = dxL * dxL + dyL * dyL;
            const tt = len2 > 0 ? Math.max(0, Math.min(1, ((ppx - cx) * dxL + (ppy - cy) * dyL) / len2)) : 0;
            const qx = cx + tt * dxL, qy = cy + tt * dyL;
            const d = Math.hypot(ppx - qx, ppy - qy);
            if (d < 24) {
                game.player.takeDamage(Math.round(22 * PROTEUS_DAMAGE_MULT));
                bossFX.addFlash(qx, qy, 36, '#ffe5a0', 280, 0.95);
                dealt = true;
            }
        }
        this.activeWave = {
            startedAt: Date.now(),
            durMs: 360,
            sx: cx, sy: cy,
            ex: endX, ey: endY,
            ang: ang2,
            hit: dealt
        };
        bossFX.addShake && bossFX.addShake(7, 240);
        bossFX.addFlash(cx, cy, 50, '#ffe5a0', 280, 0.95);
    }

    _tickSwingDash(now) {
        const d = this.swingDash;
        if (!d) return;
        const t = (now - d.startedAt) / d.durMs;
        if (t >= 1) {
            // Finalize position then transition into the actual swing.
            const fx = d.ex, fy = d.ey;
            this.x = fx - this.width / 2;
            this.y = fy - this.height / 2;
            this._clampToArena();
            const sweepHalf = 1.05;
            const cx2 = this.x + this.width / 2;
            const cy2 = this.y + this.height / 2;
            // Re-aim onto the player at swing-start so the fan centers
            // on their current position even if they shuffled during dash.
            let ang2 = d.ang;
            if (game.player && !game.player.isUntargetable) {
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                ang2 = Math.atan2(py - cy2, px - cx2);
            }
            this.activeSwing = {
                startedAt: Date.now(),
                durMs: 320,
                cx: cx2, cy: cy2,
                centerAng: ang2,
                startAng: ang2 - sweepHalf,
                endAng: ang2 + sweepHalf,
                radius: 220,
                didHit: false,
                damage: Math.round(16 * PROTEUS_DAMAGE_MULT)
            };
            bossFX.addFlash(cx2, cy2, 42, '#ffd86b', 240, 0.85);
            this.swingDash = null;
            return;
        }
        // Ease-out so the dash decelerates into the swing for clarity.
        const k = 1 - Math.pow(1 - t, 2);
        const cx = d.sx + (d.ex - d.sx) * k;
        const cy = d.sy + (d.ey - d.sy) * k;
        this.x = cx - this.width / 2;
        this.y = cy - this.height / 2;
        this._clampToArena();
    }

    _tickActiveSwing(now) {
        const s = this.activeSwing;
        if (!s) return;
        const t = (now - s.startedAt) / s.durMs;
        if (t >= 1) { this.activeSwing = null; return; }
        // Damage window: most of the sweep. We treat the swing as a fan
        // hitbox centered on s.centerAng — once the blade is out, anyone
        // inside the sector and within reach gets clipped. This avoids
        // the old "must be in the already-swept sub-arc" check that was
        // missing stationary targets directly in front of the boss.
        if (!s.didHit && t > 0.15 && t < 0.9 && game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const dx = px - s.cx, dy = py - s.cy;
            const d = Math.hypot(dx, dy);
            if (d <= s.radius + 32) {
                const angTo = Math.atan2(dy, dx);
                let rel = angTo - s.centerAng;
                while (rel > Math.PI) rel -= Math.PI * 2;
                while (rel < -Math.PI) rel += Math.PI * 2;
                const half = (s.endAng - s.startAng) * 0.5; // sweepHalf
                if (Math.abs(rel) <= half + 0.18) {
                    game.player.takeDamage(s.damage);
                    s.didHit = true;
                    bossFX.addFlash(px, py, 26, '#ffe5a0', 220, 0.85);
                }
            }
        }
    }

    _tickActiveThrust(now) {
        const s = this.activeThrust;
        if (!s) return;
        const t = (now - s.startedAt) / s.durMs;
        if (t >= 1) { this.activeThrust = null; return; }
        // Thrust profile: 0..0.30 extend → 0.30..0.65 hold (impale) →
        // 0.65..1.00 retract. Damage window covers extend+hold so a
        // committed jab definitively hits a target standing in front.
        if (!s.didHit && t > 0.18 && t < 0.72 && game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            let ext;
            if (t < 0.30) ext = t / 0.30;
            else if (t < 0.65) ext = 1;
            else ext = Math.max(0, 1 - (t - 0.65) / 0.35);
            const tipX = s.cx + Math.cos(s.ang) * s.reach * ext;
            const tipY = s.cy + Math.sin(s.ang) * s.reach * ext;
            // Line-segment hit from boss center to tip.
            const dxL = tipX - s.cx, dyL = tipY - s.cy;
            const len2 = dxL * dxL + dyL * dyL;
            const tt = len2 > 0 ? Math.max(0, Math.min(1, ((px - s.cx) * dxL + (py - s.cy) * dyL) / len2)) : 0;
            const qx = s.cx + tt * dxL, qy = s.cy + tt * dyL;
            const d = Math.hypot(px - qx, py - qy);
            if (d < s.hitRadius) {
                game.player.takeDamage(s.damage);
                s.didHit = true;
                bossFX.addFlash(qx, qy, 28, '#bff0ff', 220, 0.95);
                bossFX.addShake && bossFX.addShake(4, 140);
            }
        }
    }

    _tickActiveWave(now) {
        if (!this.activeWave) return;
        const w = this.activeWave;
        if (now - w.startedAt > w.durMs) this.activeWave = null;
    }

    // ============= Skirmish Form (mid range) =============
    // Burst shotgun and short dashes. Strafes around the player.
    _tickSkirmish(now) {
        if (!game.player) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const ang = Math.atan2(py - cy, px - cx);
        const dist = Math.hypot(px - cx, py - cy);
        const desired = 460;
        const errorD = dist - desired;
        const radial = Math.max(-1, Math.min(1, errorD / 120));
        const tangent = ang + Math.PI / 2 * (Math.sin(now / 1700) > 0 ? 1 : -1);
        const moveSpeed = this.speed * 1.1;
        const tvx = (Math.cos(ang) * radial + Math.cos(tangent) * 0.6) * moveSpeed;
        const tvy = (Math.sin(ang) * radial + Math.sin(tangent) * 0.6) * moveSpeed;
        this.vx += (tvx - this.vx) * 0.14;
        this.vy += (tvy - this.vy) * 0.14;

        if (now - this.lastSkirmishBlastAt > 467) {
            this._fireSkirmishShotgun(now, ang);
            this.lastSkirmishBlastAt = now;
        }
        // Missile barrage every ~7s — fires a 15-round volley with
        // staggered launches for a chained "missile launcher" cadence.
        if (!this.skirmishMissileBurst && now - this.lastSkirmishMissileAt > 7000) {
            this._startSkirmishMissileBurst(now);
            this.lastSkirmishMissileAt = now;
        }
        this._tickSkirmishMissileBurst(now);
        if (now - this.lastSkirmishDashAt > 3500 && !this.activeDash) {
            this._startSkirmishDash(now);
            this.lastSkirmishDashAt = now;
        }
        // Reactive defenses: opportunistic blink, EMP, self-heal.
        this._tickSkirmishReactive(now);
        // Drone swarm — long cooldown, occasional release.
        this._maybeReleaseDroneSwarm(now, 'skirmish');
        // Occasional turret-style heavy laser cannon (port of _fireBossCannon).
        // Fires roughly every 5–8s with a short wind-up (faster than turret).
        if (now - this.lastSkirmishCannonAt > 5000 && game.player) {
            // Per-tick chance ramps with how long it's been since last shot
            // so the wait time stays bounded around 5–8s.
            const overdue = (now - this.lastSkirmishCannonAt - 5000) / 3000;
            const chance = 0.004 + Math.max(0, Math.min(1, overdue)) * 0.04;
            if (Math.random() < chance) {
                this._fireSkirmishLaserCannon(now);
                this.lastSkirmishCannonAt = now;
            }
        }
    }

    // Skirmish form's primary ranged attack — a heavy shotgun blast
    // ported from the player's Shotgun: 12 pellets in a ~22° cone with
    // per-pellet jitter, distance-based damage falloff, recoil flash.
    // Uses ProteusBullet for the projectile so existing collision and
    // render plumbing in gameCore handles it.
    _fireSkirmishShotgun(now, baseAng) {
        if (!game.proteusBullets) game.proteusBullets = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player ? game.player.x + game.player.width / 2 : cx + Math.cos(baseAng) * 200;
        const py = game.player ? game.player.y + game.player.height / 2 : cy + Math.sin(baseAng) * 200;
        const aimAng = Math.atan2(py - cy, px - cx);

        const pellets = 12;
        const spreadDeg = 22;
        const spreadRad = spreadDeg * Math.PI / 180;
        const baseDamage = 6;       // per-pellet cap (12 pellets * 6 = 72 max)
        for (let i = 0; i < pellets; i++) {
            // Distribute pellets evenly across the cone with mild jitter.
            const tt = (i / (pellets - 1)) - 0.5;        // -0.5 .. +0.5
            const jitter = (Math.random() - 0.5) * spreadRad * 0.25;
            const ang = aimAng + tt * spreadRad + jitter;
            const b = new ProteusBullet(cx, cy, ang, '#ffb070', baseDamage);
            // Pellet ballistics: faster than default cannon round and
            // slightly shorter lifetime so spread stays visually tight.
            const speed = 14 * (0.9 + Math.random() * 0.2);
            b.vx = Math.cos(ang) * speed;
            b.vy = Math.sin(ang) * speed;
            b.maxLifetime = 1100 + Math.random() * 200;
            game.proteusBullets.push(b);
        }
        // Muzzle FX: bright wide flash at the barrel, screen kick.
        bossFX.addFlash(cx, cy, 38, '#ffd6a0', 220, 0.85);
        bossFX.addShake && bossFX.addShake(2.6, 110);
    }

    // 15-round missile launcher volley. Mirrors the player's missile
    // launcher cadence (one missile every ~110ms for a clean rapid-fire
    // chain) using the existing Proteus missile rig.
    _startSkirmishMissileBurst(now) {
        this.skirmishMissileBurst = {
            startedAt: now,
            nextAt: now,
            fired: 0,
            total: 15,
            intervalMs: 110
        };
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        bossFX.addFlash(cx, cy, 40, '#a0ffc0', 260, 0.7);
    }

    _tickSkirmishMissileBurst(now) {
        const b = this.skirmishMissileBurst;
        if (!b) return;
        if (this.form !== 'skirmish' || this.reconfiguring || this.health <= 0) {
            this.skirmishMissileBurst = null;
            return;
        }
        while (b.fired < b.total && now >= b.nextAt) {
            // Slight alternating spread on launch heading so the volley
            // visibly fans out rather than stacking on a single line.
            const sign = (b.fired % 2 === 0) ? 1 : -1;
            const spread = sign * (0.06 + Math.random() * 0.10);
            this._launchProteusNormalMissile(spread);
            b.fired++;
            b.nextAt = now + b.intervalMs;
        }
        if (b.fired >= b.total) {
            this.skirmishMissileBurst = null;
        }
    }

    _startSkirmishDash(now) {
        // Short ~140 px dash perpendicular to facing.
        const dir = Math.random() < 0.5 ? 1 : -1;
        const ang = this.facingAngle + Math.PI / 2 * dir;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const ex = cx + Math.cos(ang) * 160;
        const ey = cy + Math.sin(ang) * 160;
        this.activeDash = {
            startedAt: now,
            durMs: 220,
            sx: cx, sy: cy, ex, ey
        };
        bossFX.addFlash(cx, cy, 22, '#a0ffc0', 180, 0.6);
    }

    // -----------------------------------------------------------------
    // Skirmish reactive abilities
    // -----------------------------------------------------------------
    // Threat heuristic: rough 0..1 score of "the player is currently
    // threatening me". Combines melee proximity, incoming projectiles,
    // homing missiles, and player-committed super-weapon attacks.
    _skirmishThreatLevel(now) {
        if (!game.player) return 0;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const dist = Math.hypot(px - cx, py - cy);
        let score = 0;

        // Player committed to a sword/laser-spear/greatsword attack.
        if (typeof game.player.isCurrentlyAttacking === 'function' &&
            game.player.isCurrentlyAttacking()) {
            score += 0.5;
            // Within melee striking range — much more dangerous.
            if (dist < 110) score += 0.4;
        } else if (dist < 90) {
            // Player is on top of us with no commit — still a threat
            // (e.g. queued sword swing).
            score += 0.3;
        }

        // Player bullets within a small radius.
        if (game.bullets && game.bullets.length) {
            const r2 = 220 * 220;
            for (let i = 0; i < game.bullets.length && score < 1.2; i++) {
                const b = game.bullets[i];
                if (!b || b.isBossBullet) continue;
                const dx = (b.x || 0) - cx;
                const dy = (b.y || 0) - cy;
                if (dx * dx + dy * dy <= r2) { score += 0.25; break; }
            }
        }

        // Incoming player missiles.
        if (game.missiles && game.missiles.length) {
            const r2 = 280 * 280;
            for (let i = 0; i < game.missiles.length && score < 1.2; i++) {
                const m = game.missiles[i];
                if (!m || m.isBossMissile || m.isReversed) continue;
                const dx = (m.x || 0) - cx;
                const dy = (m.y || 0) - cy;
                if (dx * dx + dy * dy <= r2) { score += 0.45; break; }
            }
        }

        return Math.min(1, score);
    }

    // Top-level reactive driver. Each ability gates on:
    //   - its own cooldown
    //   - a chance roll (so the boss is *unpredictably* defensive)
    //   - relevant threat / HP context
    _tickSkirmishReactive(now) {
        if (this.reconfiguring || this.health <= 0) return;
        const threat = this._skirmishThreatLevel(now);

        // --- Blink: dodges sword combos / lasers / dense missile clouds.
        // Cooldown ~3.5s; once ready and threat is high, ~22% chance per
        // tick to actually fire (so it isn't a guaranteed escape).
        if (now - this.lastSkirmishBlinkAt > 3500 && threat >= 0.55) {
            if (Math.random() < 0.22) {
                this._startSkirmishBlink(now);
                this.lastSkirmishBlinkAt = now;
                return;
            }
        }

        // --- EMP: brief AoE burst that disables player attacks.
        // Long cooldown (~12s). Slight bias toward firing under pressure.
        if (now - this.lastSkirmishEmpAt > 12000) {
            const baseChance = 0.005;        // ~0.5%/tick baseline
            const bonus = threat * 0.012;    // up to ~+1.2%/tick under pressure
            if (Math.random() < baseChance + bonus) {
                this._castSkirmishEmp(now);
                this.lastSkirmishEmpAt = now;
                return;
            }
        }

        // --- Self heal: rolls only when wounded; chance scales with how
        // hurt we are. Long cooldown so it can't out-pace player damage.
        const hpFrac = this.health / this.maxHealth;
        if (hpFrac < 0.7 && now - this.lastSkirmishHealAt > 14000) {
            // 0..1 missing health → 0..2.5%/tick chance.
            const chance = (1 - hpFrac) * 0.025;
            if (Math.random() < chance) {
                this._castSkirmishHeal(now);
                this.lastSkirmishHealAt = now;
            }
        }
    }

    // Blink: instant teleport to a random nearby spot (preferring the
    // far side of the boss relative to the player so we land out of
    // melee). Leaves a dual-end ghost trail.
    _startSkirmishBlink(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        let tx = cx, ty = cy;
        if (game.player) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            // Direction from player to boss, push further along it.
            let dx = cx - px, dy = cy - py;
            const d = Math.hypot(dx, dy) || 1;
            dx /= d; dy /= d;
            // Add a small lateral jitter so consecutive blinks don't
            // strictly retreat in a line.
            const lateral = (Math.random() - 0.5) * 0.9;
            const lx = -dy * lateral;
            const ly =  dx * lateral;
            const blinkDist = 220 + Math.random() * 90;
            tx = cx + (dx + lx) * blinkDist;
            ty = cy + (dy + ly) * blinkDist;
        } else {
            const a = Math.random() * Math.PI * 2;
            tx = cx + Math.cos(a) * 240;
            ty = cy + Math.sin(a) * 240;
        }
        // Clamp to arena.
        const W = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.WIDTH : 1920;
        const H = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.HEIGHT : 1080;
        tx = Math.max(this.width / 2 + 24, Math.min(W - this.width / 2 - 24, tx));
        ty = Math.max(this.height / 2 + 24, Math.min(H - this.height / 2 - 24, ty));

        this.x = tx - this.width / 2;
        this.y = ty - this.height / 2;
        this.vx = 0; this.vy = 0;

        this.skirmishBlinkFx = { startedAt: now, durMs: 320, sx: cx, sy: cy, ex: tx, ey: ty };
        bossFX.addFlash(cx, cy, 38, '#a0ffc0', 240, 0.85);
        bossFX.addFlash(tx, ty, 32, '#a0ffc0', 220, 0.7);
        if (typeof bossFX !== 'undefined' && bossFX.spawnBurst) {
            bossFX.spawnBurst(cx, cy, 14, {
                color: '#a0ffc0', speedMin: 1.5, speedMax: 4.5,
                sizeMin: 1.2, sizeMax: 2.6, lifeMs: 320,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.92
            });
            bossFX.spawnBurst(tx, ty, 10, {
                color: '#cdfff0', speedMin: 1.0, speedMax: 3.5,
                sizeMin: 1.0, sizeMax: 2.2, lifeMs: 280,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.92
            });
        }
    }

    // EMP: short stun on the player's weapons. Implementation:
    //   - sets game.player._proteusEmpUntil (a soft contract — anything
    //     reading it can disable input). The blocking is also enforced
    //     via player.setStunned() if it exists, since most boss stun
    //     effects reuse it.
    //   - blast wave VFX + screen kick.
    _castSkirmishEmp(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const empMs = 900;
        this.skirmishEmpFx = { startedAt: now, durMs: 600 };

        if (game.player && !game.player.isUntargetable) {
            // Reuse the existing stun pipeline so we don't have to
            // intercept every weapon's attack code.
            if (typeof game.player.setStunned === 'function') {
                game.player.setStunned(empMs);
            }
            // Tag for any weapon code that wants a softer interaction
            // (e.g. just blocking firing, not movement).
            game.player._proteusEmpUntil = now + empMs;
        }
        this.playerEmpUntil = now + empMs;

        bossFX.addFlash(cx, cy, 80, '#cdeeff', 360, 0.95);
        bossFX.addShake && bossFX.addShake(5, 220);
        if (typeof bossFX !== 'undefined' && bossFX.spawnBurst) {
            bossFX.spawnBurst(cx, cy, 28, {
                color: '#a0d8ff', speedMin: 4, speedMax: 9,
                sizeMin: 1.4, sizeMax: 2.6, lifeMs: 520,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.94
            });
        }
    }

    // Self heal: instant tick of HP plus a recovery pulse VFX.
    // The amount is capped so chained heals can't trivialize a kill.
    _castSkirmishHeal(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const heal = Math.round(this.maxHealth * 0.07); // 7% of max
        this.health = Math.min(this.maxHealth, this.health + heal);
        this.skirmishHealFx = { startedAt: now, durMs: 700 };
        bossFX.addFlash(cx, cy, 56, '#7fffb0', 460, 0.9);
        if (typeof bossFX !== 'undefined' && bossFX.spawnBurst) {
            bossFX.spawnBurst(cx, cy, 18, {
                color: '#a0ffb0', speedMin: 1.5, speedMax: 4,
                sizeMin: 1.4, sizeMax: 2.6, lifeMs: 560,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.92
            });
        }
    }

    // -----------------------------------------------------------------
    // Drone bits
    // -----------------------------------------------------------------
    // Released from Skirmish or Turret. Two release modes:
    //   - "swarm-6":  6 drones, each shoots 4 times, low per-shot damage
    //   - "swarm-3":  3 drones, each shoots 2 times, per-shot damage = 3.5x
    // Both modes deal similar total damage on paper; the 3-drone roll is
    // a low-probability "elite" variant that punishes hard if the player
    // is caught out of position because each shot hits much harder.
    _maybeReleaseDroneSwarm(now, formTag) {
        // Don't stack swarms — only release if previous one is gone.
        if (this.proteusDrones.length > 0) return;
        const cd = 11000;
        if (now - this.lastDroneSwarmAt < cd) return;
        // Per-tick chance gate so the timing is unpredictable. Skirmish
        // releases a touch more eagerly than turret.
        const chancePerTick = formTag === 'skirmish' ? 0.012 : 0.010;
        if (Math.random() >= chancePerTick) return;
        this._releaseProteusDroneSwarm(now);
        this.lastDroneSwarmAt = now;
    }

    _releaseProteusDroneSwarm(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // 22% chance for the 3-drone elite variant.
        const elite = Math.random() < 0.22;
        const count = elite ? 3 : 6;
        const shotsEach = elite ? 2 : 4;
        // Base per-shot damage is balanced so the 6-drone mode totals
        // 6*4*X = 24X, and the 3-drone mode totals 3*2*(3.5X) = 21X
        // (slightly less but each hit is far more punishing).
        const baseDamage = 6;
        const perShotDamage = elite ? Math.round(baseDamage * 3.5) : baseDamage;
        // Drones flank the *player* at this radius (Star Devourer style).
        const attackRange = 240;
        for (let i = 0; i < count; i++) {
            // Spread starting positions evenly around the boss but each
            // drone gets its own attack-side angle around the player.
            const spawnPhase = (i / count) * Math.PI * 2 + Math.random() * 0.05;
            this.proteusDrones.push({
                bornAt: now,
                lastShotAt: 0,
                // Hard deadline: every drone MUST fire at least once
                // every 10s. Used by _updateProteusDrones to force a
                // preFire transition even if travel hasn't finished.
                forceFireAfter: 3000,
                cx: cx + Math.cos(spawnPhase) * 18,
                cy: cy + Math.sin(spawnPhase) * 18,
                vx: 0, vy: 0,
                formationAngle: (i / count) * Math.PI * 2 + Math.random() * 0.4,
                attackRange,
                speed: 54.0,                        // px/frame travel speed (300% of 18)
                shotsLeft: shotsEach,
                shotsTotal: shotsEach,
                state: 'travel',                    // travel → preFire → fire → postFire → travel ...
                stateStartedAt: now,
                preFireMs: 320,                     // wind-up
                postFireMs: 240,                    // recovery & re-pick angle
                attackType: 'laser',                // 'laser' | 'bullets'
                damage: perShotDamage,
                elite,
                detonateAt: 0,
                shouldDestroy: false,
            });
        }
        bossFX.addFlash(cx, cy, 38, elite ? '#ffd47a' : '#a0d8ff', 320, 0.85);
        if (typeof bossFX !== 'undefined' && bossFX.spawnBurst) {
            bossFX.spawnBurst(cx, cy, 22, {
                color: elite ? '#ffe39a' : '#bfe8ff',
                speedMin: 2, speedMax: 6,
                sizeMin: 1.4, sizeMax: 2.6, lifeMs: 360,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.93
            });
        }
    }

    _updateProteusDrones(now) {
        if (!this.proteusDrones.length) return;
        for (let i = this.proteusDrones.length - 1; i >= 0; i--) {
            const d = this.proteusDrones[i];
            if (d.shouldDestroy) { this.proteusDrones.splice(i, 1); continue; }

            // Detonating drones (out of shots) finish the self-destruct.
            if (d.state === 'detonating') {
                if (now >= d.detonateAt) {
                    this._explodeDrone(d);
                    d.shouldDestroy = true;
                    continue;
                }
                d.cx += (Math.random() - 0.5) * 0.6;
                d.cy += (Math.random() - 0.5) * 0.6;
                continue;
            }

            // Compute "ideal" attack station: a fixed offset from the
            // *player*, not the boss. Drones flank the player.
            let idealX = d.cx, idealY = d.cy;
            if (game.player) {
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                idealX = px + Math.cos(d.formationAngle) * d.attackRange;
                idealY = py + Math.sin(d.formationAngle) * d.attackRange;
            }
            // Clamp the station inside the arena so drones can't path off-screen.
            const W = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.WIDTH : 1920;
            const H = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.HEIGHT : 1080;
            idealX = Math.max(40, Math.min(W - 40, idealX));
            idealY = Math.max(40, Math.min(H - 40, idealY));

            // travel → arrive at station, then transition to preFire.
            if (d.state === 'travel') {
                const dx = idealX - d.cx;
                const dy = idealY - d.cy;
                const dist = Math.hypot(dx, dy);
                // Hard deadline: if we haven't shot in forceFireAfter ms
                // (measured from spawn, or from last shot for repeat
                // volleys), commit to preFire wherever we currently are
                // so the player never gets a free window.
                const refTime = d.lastShotAt > 0 ? d.lastShotAt : d.bornAt;
                const overdue = (now - refTime) >= d.forceFireAfter;
                if (dist <= 22 || overdue) {
                    d.state = 'preFire';
                    d.stateStartedAt = now;
                    d.attackType = (Math.random() < 0.5) ? 'laser' : 'bullets';
                } else {
                    const step = Math.min(d.speed, dist);
                    d.cx += (dx / dist) * step;
                    d.cy += (dy / dist) * step;
                }
                continue;
            }

            // preFire → small static wind-up, then fire and enter postFire.
            if (d.state === 'preFire') {
                if (now - d.stateStartedAt >= d.preFireMs) {
                    if (game.player && !game.player.isUntargetable) {
                        if (d.attackType === 'laser') this._droneFireLaser(d, now);
                        else this._droneFireBullets(d, now);
                    }
                    d.shotsLeft -= 1;
                    d.lastShotAt = now;
                    if (d.shotsLeft <= 0) {
                        d.state = 'detonating';
                        d.detonateAt = now + 220;
                    } else {
                        d.state = 'postFire';
                        d.stateStartedAt = now;
                    }
                }
                continue;
            }

            // postFire → re-pick a fresh formation angle and travel back out.
            if (d.state === 'postFire') {
                if (now - d.stateStartedAt >= d.postFireMs) {
                    // Re-randomize attack-side so player can't predict it.
                    d.formationAngle = Math.random() * Math.PI * 2;
                    d.state = 'travel';
                    d.stateStartedAt = now;
                }
                continue;
            }
        }
    }

    // Laser variant: hitscan, uses the existing _fireLaserBeam pipeline so
    // it shares colors / glow / wall-clipping with turret-mode lasers.
    // No stun, only damage — drones must not interrupt the player.
    _droneFireLaser(d, now) {
        if (!game.player) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - d.cy, px - d.cx);
        // Slightly thinner / shorter than turret laser so 6 of them
        // don't completely whiteout the screen.
        this._fireLaserBeam(d.cx, d.cy, ang, {
            hitRadius: d.elite ? 18 : 14,
            damage: d.damage,
            durationMs: 220,
            widths: d.elite ? [13, 5, 1.6] : [9, 3.5, 1.2],
        });
        bossFX.addFlash(d.cx, d.cy, d.elite ? 16 : 11,
            d.elite ? '#ffd47a' : '#9ad8ff', 160, 0.85);
    }

    // Solid-shot variant: small cluster of fast bullets toward the player.
    _droneFireBullets(d, now) {
        if (!game.player) return;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const pvx = game.player.vx || 0;
        const pvy = game.player.vy || 0;
        const lead = d.elite ? 8 : 4;
        const baseAng = Math.atan2((py + pvy * lead) - d.cy, (px + pvx * lead) - d.cx);
        const color = d.elite ? '#ffd47a' : '#9ad8ff';
        if (!game.proteusBullets) game.proteusBullets = [];
        // Elite fires 1 fat shot for the full damage; standard fires a
        // 3-shot tight burst so total per-volley damage stays as designed
        // (shot.damage = ceil(d.damage / 3) * 3 ≈ d.damage).
        if (d.elite) {
            const b = new ProteusBullet(d.cx, d.cy, baseAng, color, d.damage);
            b.width = 9; b.height = 9;
            b.vx *= 1.15; b.vy *= 1.15;
            b.maxLifetime = 2600;
            game.proteusBullets.push(b);
        } else {
            const per = Math.max(1, Math.round(d.damage / 3));
            for (let k = 0; k < 3; k++) {
                const ang = baseAng + (k - 1) * 0.06;
                const b = new ProteusBullet(d.cx, d.cy, ang, color, per);
                b.maxLifetime = 1800;
                game.proteusBullets.push(b);
            }
        }
        bossFX.addFlash(d.cx, d.cy, d.elite ? 14 : 10, color, 140, 0.8);
    }

    _explodeDrone(d) {
        // Self-destruct: small AoE puff (no direct damage — drones are
        // ranged threats, the ranged shots already did their job).
        bossFX.addFlash(d.cx, d.cy, d.elite ? 28 : 22,
            d.elite ? '#ffd47a' : '#a0d8ff', 280, 0.85);
        if (typeof bossFX !== 'undefined' && bossFX.spawnBurst) {
            bossFX.spawnBurst(d.cx, d.cy, d.elite ? 16 : 12, {
                color: d.elite ? '#ffd47a' : '#bfe8ff',
                speedMin: 1.6, speedMax: 4.4,
                sizeMin: 1.2, sizeMax: 2.4, lifeMs: 420,
                spreadAngle: Math.PI * 2, baseAngle: 0, drag: 0.93
            });
        }
    }

    _drawProteusDrones(ctx) {
        if (!this.proteusDrones.length) return;
        const now = Date.now();
        ctx.save();
        for (const d of this.proteusDrones) {
            const elite = d.elite;
            const baseColor = elite ? '#ffd47a' : '#a0d8ff';
            const innerColor = elite ? '#fff2c0' : '#e6f6ff';
            // Pulse: ramps up during preFire and detonating; otherwise ambient.
            let pulse = 0;
            if (d.state === 'detonating') {
                const t = (now - (d.detonateAt - 220)) / 220;
                pulse = Math.max(0, Math.min(1, t));
            } else if (d.state === 'preFire') {
                const t = (now - d.stateStartedAt) / d.preFireMs;
                pulse = Math.max(0, Math.min(1, t));
            } else {
                pulse = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(now / 140 + d.cx * 0.013));
            }

            // Outer aura
            ctx.globalCompositeOperation = 'lighter';
            const auraR = (elite ? 18 : 13) + pulse * 10;
            const grad = ctx.createRadialGradient(d.cx, d.cy, 0, d.cx, d.cy, auraR);
            grad.addColorStop(0, baseColor);
            grad.addColorStop(0.6, elite ? 'rgba(255,212,122,0.35)' : 'rgba(160,216,255,0.30)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(d.cx, d.cy, auraR, 0, Math.PI * 2); ctx.fill();

            // Core body — small angular drone with self-rotating fins.
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            const ang = (now / 220) + d.formationAngle * 2.0;
            ctx.save();
            ctx.translate(d.cx, d.cy);
            ctx.rotate(ang);
            const r = elite ? 8 : 6;
            ctx.fillStyle = innerColor;
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(r * 1.2, 0);
            ctx.lineTo(0, r * 0.7);
            ctx.lineTo(-r * 0.9, 0);
            ctx.lineTo(0, -r * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Targeting tether — only during preFire wind-up so the
            // player has a brief warning before the laser/bullet hits.
            if (d.state === 'preFire' && game.player) {
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                const charge = Math.min(1, (now - d.stateStartedAt) / d.preFireMs);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = charge * (elite ? 0.7 : 0.5);
                ctx.strokeStyle = baseColor;
                ctx.lineWidth = elite ? 2.0 : 1.4;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(d.cx, d.cy);
                ctx.lineTo(px, py);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        ctx.restore();
    }

    _tickActiveDash(now) {
        const D = this.activeDash;
        if (!D) return;
        const t = (now - D.startedAt) / D.durMs;
        if (t >= 1) {
            this.x = D.ex - this.width / 2;
            this.y = D.ey - this.height / 2;
            this._clampToArena();
            this.activeDash = null;
            return;
        }
        const cx = D.sx + (D.ex - D.sx) * t;
        const cy = D.sy + (D.ey - D.sy) * t;
        this.x = cx - this.width / 2;
        this.y = cy - this.height / 2;
        this._clampToArena();
    }

    // ============= Turret Form (long range) =============
    // Body roots in place; deploys 3 turrets that orbit slowly and arc-fire.
    _tickTurret(now) {
        // Boss body becomes mostly stationary — slight drift only.
        this.vx *= 0.85;
        this.vy *= 0.85;
        // Shield maintenance is now driven from the main update() so it
        // also runs after the boss has left turret form (needed for the
        // probabilistic post-break rebuild).
        // Point-defense (CIWS) — picks off the nearest player missile.
        this._updateProteusPointDefense(now);
        // Boss-direct cannon shot at the player every 1300ms (predictive arc).
        if (now - this.lastTurretShotAt > 1300 && game.player) {
            this._fireBossCannon(now);
            this.lastTurretShotAt = now;
        }
        // Random missile salvo every ~1.3s — multiple missiles per launch
        // and types can mix. Doubles the launch tempo of the previous
        // 2.6s, single-shot version.
        if (now - this.lastTurretMissileAt > 1300 && game.player) {
            this._fireRandomTurretSalvo(now);
            this.lastTurretMissileAt = now;
        }
        // Drone swarm release.
        this._maybeReleaseDroneSwarm(now, 'turret');
    }

    // Per-launch salvo: 1–3 missiles, each rolls its own type from the
    // 4-type pool. Occasional "burst" launches roll 4 missiles for a
    // genuinely scary moment.
    _fireRandomTurretSalvo(now) {
        const pool = ['normal', 'highHoming', 'splitting', 'plasma'];
        // Bias toward 2; 15% chance for a 4-shot burst.
        let count;
        const r = Math.random();
        if (r < 0.15) count = 4;
        else if (r < 0.55) count = 3;
        else if (r < 0.85) count = 2;
        else count = 1;
        for (let i = 0; i < count; i++) {
            const type = pool[Math.floor(Math.random() * pool.length)];
            // Spread the launch points slightly around the boss body so
            // overlapping missiles don't visually merge into one streak.
            const launchOffsetAngle = (i - (count - 1) / 2) * 0.18;
            if (type === 'normal') this._launchProteusNormalMissile(launchOffsetAngle);
            else if (type === 'highHoming') this._launchProteusHighHomingMissile(launchOffsetAngle);
            else if (type === 'splitting') this._launchProteusSplittingMissile(launchOffsetAngle);
            else if (type === 'plasma') this._launchProteusPlasmaMissile(launchOffsetAngle);
        }
    }

    // Random missile from a 4-type pool: normal salvo, high-homing,
    // splitting cluster, or plasma. Fired from the boss body. Kept for
    // backwards compatibility but the salvo path above is what tickTurret
    // now drives.
    _fireRandomTurretMissile(now) {
        this._fireRandomTurretSalvo(now);
    }

    _launchProteusNormalMissile(angleOffset = 0) {
        if (typeof Missile !== 'function') return;
        if (!game.player) return;
        if (!game.bossMissiles) game.bossMissiles = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx) + angleOffset;
        const launchDist = this.width / 2 + 10;
        const sx = cx + Math.cos(ang) * launchDist;
        const sy = cy + Math.sin(ang) * launchDist;
        const m = new Missile(sx, sy, px, py, 8, 11);
        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'salvo';
        m.delayStartTime = Date.now();
        m.delayDuration = 250;
        // Long-range engagement: turret form is supposed to threaten
        // the whole arena, so missile reach has to match.
        m.guideRange = 1800;
        m.maxLifetime = 6500;
        m.enhancedHoming = true;
        m.strongTrackingDuration = 2200;
        m.fadeOutDuration = 900;
        game.bossMissiles.push(m);
        bossFX.spawnBurst && bossFX.spawnBurst(sx, sy, 5, {
            color: '#7fdfff', speedMin: 1.5, speedMax: 4.5,
            sizeMin: 1.5, sizeMax: 3.5, lifeMs: 360,
            spreadAngle: Math.PI / 3, baseAngle: ang, drag: 0.9
        });
    }

    _launchProteusHighHomingMissile(angleOffset = 0) {
        if (typeof Missile !== 'function') return;
        if (!game.player) return;
        if (!game.bossMissiles) game.bossMissiles = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx) + angleOffset;
        const launchDist = this.width / 2 + 12;
        const sx = cx + Math.cos(ang) * launchDist;
        const sy = cy + Math.sin(ang) * launchDist;
        const m = new Missile(sx, sy, px, py, 10, 8.8);
        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'homing';
        m.delayStartTime = Date.now();
        m.delayDuration = 140;
        m.guideRange = 2200;
        m.maxLifetime = 7500;
        m.enhancedHoming = true;
        m.strongTrackingDuration = 4000;
        m.fadeOutDuration = 1600;
        m.size = 1.3;
        game.bossMissiles.push(m);
        bossFX.spawnBurst && bossFX.spawnBurst(sx, sy, 6, {
            color: '#bff0ff', speedMin: 2, speedMax: 5,
            sizeMin: 2, sizeMax: 4, lifeMs: 420,
            spreadAngle: Math.PI / 4, baseAngle: ang, drag: 0.9
        });
    }

    _launchProteusSplittingMissile(angleOffset = 0) {
        if (typeof Missile !== 'function') return;
        if (!game.player) return;
        if (!game.bossMissiles) game.bossMissiles = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx) + angleOffset;
        const launchDist = this.width / 2 + 12;
        const sx = cx + Math.cos(ang) * launchDist;
        const sy = cy + Math.sin(ang) * launchDist;
        // Mother missile: faster, weak homing — designed to split.
        const m = new Missile(sx, sy, px, py, 6, 9.5);
        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'splitting';
        m.delayStartTime = Date.now();
        m.delayDuration = 200;
        m.guideRange = 1800;
        m.maxLifetime = 5500;
        m.enhancedHoming = true;
        m.strongTrackingDuration = 1800;
        m.fadeOutDuration = 700;
        // Custom flag: when its scheduled split-time elapses, the boss
        // will detect this and spawn child missiles in its place.
        m.proteusSplitAt = Date.now() + 1200;
        m.proteusSplitConsumed = false;
        m.size = 1.15;
        game.bossMissiles.push(m);
        bossFX.spawnBurst && bossFX.spawnBurst(sx, sy, 5, {
            color: '#a0ffc0', speedMin: 1.6, speedMax: 4.2,
            sizeMin: 1.5, sizeMax: 3.2, lifeMs: 380,
            spreadAngle: Math.PI / 3, baseAngle: ang, drag: 0.9
        });
    }

    _launchProteusPlasmaMissile(angleOffset = 0) {
        if (typeof PlasmaMissile !== 'function') return;
        if (!game.player) return;
        if (!game.plasmaMissiles) game.plasmaMissiles = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        // Apply angle offset: rotate target around boss to spread plasma orbs.
        let tx = px, ty = py;
        if (angleOffset !== 0) {
            const baseAng = Math.atan2(py - cy, px - cx) + angleOffset;
            const dist = Math.hypot(py - cy, px - cx);
            tx = cx + Math.cos(baseAng) * dist;
            ty = cy + Math.sin(baseAng) * dist;
        }
        const orb = new PlasmaMissile(cx, cy, tx, ty, 9.5, {
            hostile: true,
            fuseRadius: 70,
            fieldRadius: 100,
            fieldDuration: 2000,
            fieldDamageInterval: 280,
            fieldDamage: 4,
            contactDamage: 10,
            armingDelay: 250,
            strongTrackingDuration: 4500,
            maxLifetime: 7000,
            detonateOnExpire: true
        });
        orb.bossOwned = true;
        game.plasmaMissiles.push(orb);
        bossFX.addFlash(cx, cy, 40, '#bff0ff', 220, 0.8);
    }

    // Walks bossMissiles each tick to detect splitting mothers whose
    // proteusSplitAt fuse has passed, replacing them with a fan of
    // 4 short-range homing children.
    _updateSplittingMissiles(now) {
        if (!game.bossMissiles || !game.bossMissiles.length) return;
        for (const m of game.bossMissiles) {
            if (!m || m.shouldDestroy) continue;
            if (!m.proteusSplitAt || m.proteusSplitConsumed) continue;
            if (now < m.proteusSplitAt) continue;
            m.proteusSplitConsumed = true;
            // Mother destructs; spawn 4 homing children fanned around its
            // current heading.
            const baseAng = Math.atan2(m.vy || 0, m.vx || 1);
            const sx = (m.x != null ? m.x : 0) + ((m.width || 0) / 2);
            const sy = (m.y != null ? m.y : 0) + ((m.height || 0) / 2);
            const fanCount = 4;
            const fanSpread = Math.PI * 70 / 180;
            for (let i = 0; i < fanCount; i++) {
                const a = baseAng - fanSpread / 2 +
                    (fanSpread / (fanCount - 1)) * i +
                    (Math.random() - 0.5) * 0.12;
                const cx = sx + Math.cos(a) * 14;
                const cy = sy + Math.sin(a) * 14;
                const tgX = sx + Math.cos(a) * 200;
                const tgY = sy + Math.sin(a) * 200;
                const child = new Missile(cx, cy, tgX, tgY, 4, 9.0);
                child.isBossMissile = true;
                child.isBossMissileDelayed = false;
                child.bossMissileType = 'splittingChild';
                child.maxLifetime = 5500;
                child.guideRange = 1600;
                child.guidanceDelay = 180;
                child.enhancedHoming = true;
                child.strongTrackingDuration = 2400;
                child.fadeOutDuration = 900;
                child.size = 0.85;
                game.bossMissiles.push(child);
            }
            m.shouldDestroy = true;
            bossFX.addFlash(sx, sy, 30, '#a0ffc0', 240, 0.85);
        }
    }

    _deployTurrets() {
        this.turrets = [];
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + Math.random() * 0.4;
            this.turrets.push({
                ox: Math.cos(a) * 56,
                oy: Math.sin(a) * 56,
                phase: a,
                lastShotAt: Date.now() + i * 280,
                bornAt: Date.now()
            });
        }
    }

    _updateTurrets(now) {
        if (!this.turrets || !this.turrets.length) return;
        // If we're not in turret form anymore, despawn turrets gracefully.
        if (this.form !== 'turret' && !this.reconfiguring) {
            this.turrets = [];
            return;
        }
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (const tu of this.turrets) {
            // Orbit slowly around the boss.
            tu.phase += 0.012;
            tu.ox = Math.cos(tu.phase) * 56;
            tu.oy = Math.sin(tu.phase) * 56;
            const tx = cx + tu.ox;
            const ty = cy + tu.oy;
            // Each turret fires every 1800ms staggered.
            if (this.form === 'turret' && !this.reconfiguring &&
                now - tu.lastShotAt > 1800 && game.player) {
                this._fireTurretShot(tu);
                tu.lastShotAt = now;
            }
        }
    }

    _fireTurretShot(tu) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tx = cx + tu.ox;
        const ty = cy + tu.oy;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - ty, px - tx);
        // Telegraph reaches across the arena so the player sees the full
        // line of fire — the actual laser also extends to the edge.
        const tRange = 2000;
        const tex = tx + Math.cos(ang) * tRange;
        const tey = ty + Math.sin(ang) * tRange;
        // Slowed wind-up: 320 → 560ms so the player has time to break
        // line of sight before the beam fires.
        const windupMs = 560;
        this.telegraphs.push(createTelegraphBeam(tx, ty, tex, tey, 6, windupMs, '#7fdfff'));
        setTimeout(() => {
            if (!this || this.health <= 0) return;
            const cx2 = this.x + this.width / 2;
            const cy2 = this.y + this.height / 2;
            const fx = cx2 + tu.ox;
            const fy = cy2 + tu.oy;
            this._fireLaserBeam(fx, fy, ang, {
                hitRadius: 16,
                damage: 9,
                durationMs: 240,
                widths: [12, 4.5, 1.4]
            });
        }, windupMs);
    }

    _fireBossCannon(now) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx);
        // Slowed wind-up: 460 → 760ms. The main cannon hits hard, so the
        // window for the player to read the telegraph and reposition is
        // generous.
        const windupMs = 760;
        // Heavy aura telegraph — main cannon incoming.
        this.telegraphs.push(createTelegraphAura(cx, cy, 50, windupMs, '#7fdfff'));
        // Pre-aim line crosses the arena (laser will extend to edge).
        const tRange = 2400;
        const tex = cx + Math.cos(ang) * tRange;
        const tey = cy + Math.sin(ang) * tRange;
        this.telegraphs.push(createTelegraphBeam(cx, cy, tex, tey, 8, windupMs, '#bff0ff'));
        setTimeout(() => {
            if (!this || this.health <= 0) return;
            if (this.form !== 'turret') return;
            const sx = this.x + this.width / 2;
            const sy = this.y + this.height / 2;
            const fireAng = this.facingAngle;
            this._fireLaserBeam(sx, sy, fireAng, {
                hitRadius: 22,
                damage: 14,
                durationMs: 360,
                widths: [22, 8, 2.4]
            });
            bossFX.addFlash(sx, sy, 36, '#7fdfff', 240, 0.85);
            bossFX.addShake(2, 100);
        }, windupMs);
    }

    // Skirmish-form laser cannon — a lighter, snappier port of the
    // turret-form _fireBossCannon. Same hitscan beam pipeline so the
    // visual fits the established Proteus laser style, but the wind-up
    // is much shorter (~360ms) and the damage / radius are reduced
    // since Skirmish is supposed to be highly mobile, not a sniper.
    // Locks form check to 'skirmish' so a mid-flight form swap aborts.
    _fireSkirmishLaserCannon(now) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        const ang = Math.atan2(py - cy, px - cx);
        const windupMs = 360;
        // Skirmish keeps a hint of telegraph — a small aura + beam line
        // (the global telegraph render is disabled so this is purely
        // logical, but it's harmless and stays consistent with the
        // turret cannon code path).
        this.telegraphs.push(createTelegraphAura(cx, cy, 36, windupMs, '#a0ffc0'));
        const tRange = 2400;
        const tex = cx + Math.cos(ang) * tRange;
        const tey = cy + Math.sin(ang) * tRange;
        this.telegraphs.push(createTelegraphBeam(cx, cy, tex, tey, 6, windupMs, '#cdfff0'));
        setTimeout(() => {
            if (!this || this.health <= 0) return;
            if (this.form !== 'skirmish') return;
            const sx = this.x + this.width / 2;
            const sy = this.y + this.height / 2;
            const fireAng = this.facingAngle;
            this._fireLaserBeam(sx, sy, fireAng, {
                hitRadius: 18,
                damage: 10,
                durationMs: 280,
                widths: [18, 6.5, 2.0],
                // Green palette to match the Skirmish form's body color.
                // Layers: [outer glow, mid body, pale core].
                colors: ['#3ad88a', '#7fffb0', '#d8ffe0']
            });
            bossFX.addFlash(sx, sy, 30, '#a0ffc0', 220, 0.85);
            bossFX.addShake && bossFX.addShake(1.6, 90);
        }, windupMs);
    }

    // Hitscan laser: single line-segment damage check + 3-layer additive
    // visual (matches Crimson King's crimsonLaser). The visual lingers
    // for durationMs while the damage is applied once at fire time. The
    // beam always extends to the arena edge so it visibly "punches
    // through" the room rather than disappearing mid-flight.
    _fireLaserBeam(sx, sy, ang, opts) {
        const hitRadius = opts.hitRadius || 16;
        const damage = opts.damage || 9;
        const durationMs = opts.durationMs || 240;
        const widths = opts.widths || [12, 4.5, 1.4];
        // Compute distance from (sx,sy) to first arena boundary along ang.
        // Each axis: solve sx + cos*t = boundary; pick the smallest positive t.
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        let tMax = Infinity;
        if (cosA > 1e-6) tMax = Math.min(tMax, (W - sx) / cosA);
        else if (cosA < -1e-6) tMax = Math.min(tMax, (0 - sx) / cosA);
        if (sinA > 1e-6) tMax = Math.min(tMax, (H - sy) / sinA);
        else if (sinA < -1e-6) tMax = Math.min(tMax, (0 - sy) / sinA);
        if (!isFinite(tMax) || tMax < 0) tMax = 100;
        const range = tMax;
        const ex = sx + cosA * range;
        const ey = sy + sinA * range;
        // Damage check: line-segment vs player-center distance.
        if (game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const dx = ex - sx, dy = ey - sy;
            const len2 = dx * dx + dy * dy;
            const tt = len2 > 0 ? Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / len2)) : 0;
            const qx = sx + tt * dx, qy = sy + tt * dy;
            const d = Math.hypot(px - qx, py - qy);
            if (d <= hitRadius) {
                game.player.takeDamage(damage);
                const flashColor = (opts.colors && opts.colors[2]) || '#bff0ff';
                bossFX.addFlash(qx, qy, 22, flashColor, 200, 0.8);
            }
        }
        this.proteusLasers.push({
            sx, sy, ex, ey,
            startedAt: Date.now(),
            durationMs,
            widths,
            // Optional 3-color palette [outerGlow, midBody, paleCore].
            // Defaults applied at draw time to keep older callsites stable.
            colors: opts.colors || null,
        });
    }

    _drawProteusLasers(ctx) {
        if (!this.proteusLasers || !this.proteusLasers.length) return;
        const now = Date.now();
        // Drop expired lasers.
        this.proteusLasers = this.proteusLasers.filter(l => now - l.startedAt < l.durationMs);
        if (!this.proteusLasers.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const l of this.proteusLasers) {
            const t = now - l.startedAt;
            const a = 1 - (t / l.durationMs);
            const palette = l.colors || ['#3aa8d8', '#7fdfff', '#d8f0ff'];
            // Outer glow — wide soft.
            ctx.globalAlpha = a * 0.45;
            ctx.strokeStyle = palette[0];
            ctx.lineWidth = l.widths[0];
            ctx.beginPath();
            ctx.moveTo(l.sx, l.sy);
            ctx.lineTo(l.ex, l.ey);
            ctx.stroke();
            // Mid body
            ctx.globalAlpha = a * 0.8;
            ctx.strokeStyle = palette[1];
            ctx.lineWidth = l.widths[1];
            ctx.beginPath();
            ctx.moveTo(l.sx, l.sy);
            ctx.lineTo(l.ex, l.ey);
            ctx.stroke();
            // Pale core — desaturated, can't blow out under stacking.
            ctx.globalAlpha = a;
            ctx.strokeStyle = palette[2];
            ctx.lineWidth = l.widths[2];
            ctx.beginPath();
            ctx.moveTo(l.sx, l.sy);
            ctx.lineTo(l.ex, l.ey);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Cyan barrier shield — Magnus-style ring + dashed rotor + HP arc.
    // Tied to turret form: spawns on entry, drops on exit, breaks under
    // Skirmish reactive ability VFX:
    //   - Blink: dual flash + zigzag energy trail between source and dest
    //   - EMP: expanding cyan shockwave ring with crackle highlights
    //   - Heal: ascending green motes + soft halo around the boss
    _drawSkirmishReactiveFx(ctx) {
        const now = Date.now();

        // Blink trail
        if (this.skirmishBlinkFx) {
            const f = this.skirmishBlinkFx;
            const t = (now - f.startedAt) / f.durMs;
            if (t >= 1) {
                this.skirmishBlinkFx = null;
            } else {
                const a = (1 - t) * 0.9;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.lineCap = 'round';
                // Outer glow line
                ctx.strokeStyle = `rgba(160,255,192,${a * 0.45})`;
                ctx.lineWidth = 14;
                ctx.beginPath();
                ctx.moveTo(f.sx, f.sy);
                ctx.lineTo(f.ex, f.ey);
                ctx.stroke();
                // Mid line
                ctx.strokeStyle = `rgba(200,255,220,${a * 0.7})`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(f.sx, f.sy);
                ctx.lineTo(f.ex, f.ey);
                ctx.stroke();
                // Bright zigzag spine — segmented with random offsets so
                // it reads as raw energy, not a smooth ribbon.
                ctx.strokeStyle = `rgba(255,255,255,${a})`;
                ctx.lineWidth = 2;
                const segs = 8;
                ctx.beginPath();
                for (let i = 0; i <= segs; i++) {
                    const u = i / segs;
                    const bx = f.sx + (f.ex - f.sx) * u;
                    const by = f.sy + (f.ey - f.sy) * u;
                    const j = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 14;
                    const nx = -(f.ey - f.sy);
                    const ny =  (f.ex - f.sx);
                    const nlen = Math.hypot(nx, ny) || 1;
                    const px = bx + (nx / nlen) * j;
                    const py = by + (ny / nlen) * j;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        // EMP shockwave
        if (this.skirmishEmpFx) {
            const f = this.skirmishEmpFx;
            const t = (now - f.startedAt) / f.durMs;
            if (t >= 1) {
                this.skirmishEmpFx = null;
            } else {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                const r = 30 + t * 380;
                const a = (1 - t);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                // Outer halo ring
                const grad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
                grad.addColorStop(0, 'rgba(160,220,255,0)');
                grad.addColorStop(0.7, `rgba(160,220,255,${a * 0.55})`);
                grad.addColorStop(1, 'rgba(60,120,180,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2); ctx.fill();
                // Bright leading edge
                ctx.strokeStyle = `rgba(220,240,255,${a * 0.95})`;
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
                // Inner crackle: short tangent strokes around the ring
                const crackles = 10;
                ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < crackles; i++) {
                    const ang = (i / crackles) * Math.PI * 2 + t * 6;
                    const r0 = r - 10;
                    const r1 = r + 10;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
                    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // Heal pulse
        if (this.skirmishHealFx) {
            const f = this.skirmishHealFx;
            const t = (now - f.startedAt) / f.durMs;
            if (t >= 1) {
                this.skirmishHealFx = null;
            } else {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                const a = 1 - t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                // Soft green halo around the boss.
                const haloR = this.width * 0.9 * (0.7 + 0.3 * t);
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
                grad.addColorStop(0, `rgba(160,255,180,${a * 0.55})`);
                grad.addColorStop(0.6, `rgba(120,240,150,${a * 0.30})`);
                grad.addColorStop(1, 'rgba(60,180,90,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();
                // Pulsing ring.
                ctx.strokeStyle = `rgba(220,255,220,${a * 0.85})`;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(cx, cy, this.width * 0.55 * (0.6 + 0.4 * t), 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
        }
    }

    // sustained fire and goes on cooldown.
    _drawProteusShield(ctx) {
        if (!this.shieldActive || this.shieldHp <= 0) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();
        const hpPct = Math.max(0, Math.min(1, this.shieldHp / this.shieldMaxHp));
        const sinceBorn = now - this.shieldBornAt;
        const bornScale = Math.min(1, sinceBorn / 250);
        const r = this.width * (0.85 + 0.1 * bornScale);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const spin = now / 700;
        ctx.translate(cx, cy);
        // Outer rotating dashed ring (alpha tied to hp).
        ctx.save();
        ctx.rotate(spin);
        ctx.globalAlpha = 0.55 * (0.4 + 0.6 * hpPct) * bornScale;
        ctx.strokeStyle = '#7fdfff';
        ctx.lineWidth = 4;
        ctx.setLineDash([18, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Soft fill.
        const fillAlpha = 0.35 + 0.45 * hpPct;
        const grad = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
        grad.addColorStop(0, 'rgba(127, 223, 255, 0)');
        grad.addColorStop(0.7, `rgba(127, 200, 255, ${(0.18 * fillAlpha).toFixed(3)})`);
        grad.addColorStop(1, `rgba(60, 160, 220, ${(0.5 * fillAlpha).toFixed(3)})`);
        ctx.globalAlpha = bornScale;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        // HP arc indicator (depletes counter-clockwise from top).
        ctx.globalAlpha = 0.95 * bornScale;
        ctx.strokeStyle = '#d8f0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const startA = -Math.PI / 2;
        ctx.arc(0, 0, r * 0.92, startA, startA + Math.PI * 2 * hpPct);
        ctx.stroke();
        // Pulsing inner glow when low — telegraphs imminent break.
        if (hpPct < 0.3) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.018);
            ctx.globalAlpha = 0.5 * pulse;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ============= Drawing =============
    draw(ctx) {
        // Telegraphs first.
        if (this.telegraphs && this.telegraphs.length) {
            renderBossTelegraphs(ctx, this.telegraphs);
        }

        // Active laser beams (turret + boss cannon hitscans).
        this._drawProteusLasers(ctx);

        // Skirmish reactive ability VFX (blink trail / EMP ring / heal pulse).
        this._drawSkirmishReactiveFx(ctx);

        // Drone bits (orbit + tether + body).
        this._drawProteusDrones(ctx);

        // Shield aura — drawn before the body so the chassis appears
        // "inside" the bubble.
        this._drawProteusShield(ctx);

        // Active swing — sweeping flame greatsword. Three components:
        //   1) wide gold radial fan from startAng to current ang (afterimage)
        //   2) procedural flame blade body at the current angle
        //   3) tip orb + sparks

        // Pre-swing dash — draws the flame greatsword trailing BEHIND
        // the boss (tip points opposite to the dash direction), echoing
        // the player sword's "刀推" push visual. Adds a few faint ghost
        // blades and a soft motion ring for speed cue.
        if (this.swingDash) {
            const d = this.swingDash;
            const t = (Date.now() - d.startedAt) / d.durMs;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            const bladeLen = 92;
            const trailAng = d.ang + Math.PI;
            const tipX = cx - Math.cos(d.ang) * bladeLen;
            const tipY = cy - Math.sin(d.ang) * bladeLen;
            const dnow = Date.now();
            const fadeIn = Math.min(1, t * 3);

            if (typeof SwordSlash !== 'undefined' && SwordSlash.renderFlameBlade) {
                // Two ghost blades displaced FORWARD along the dash so
                // they read as motion blur left behind by the lunge.
                for (let g = 2; g >= 1; g--) {
                    const fwd = g * 22;
                    const gcx = cx + Math.cos(d.ang) * fwd;
                    const gcy = cy + Math.sin(d.ang) * fwd;
                    const gtx = gcx - Math.cos(d.ang) * (bladeLen - g * 8);
                    const gty = gcy - Math.sin(d.ang) * (bladeLen - g * 8);
                    SwordSlash.renderFlameBlade(ctx, {
                        cx: gcx, cy: gcy, tipX: gtx, tipY: gty,
                        ang: trailAng,
                        bladeAlpha: (0.30 / g) * fadeIn,
                        elapsed: dnow - g * 30,
                        baseW: 13,
                        seed: d.startedAt + g
                    });
                }
                // Live blade — full alpha, fatter, dragged straight back.
                SwordSlash.renderFlameBlade(ctx, {
                    cx: cx, cy: cy, tipX, tipY,
                    ang: trailAng,
                    bladeAlpha: 0.95 * fadeIn,
                    elapsed: dnow,
                    baseW: 17,
                    seed: d.startedAt
                });
            }

            // Pulsing energy ring around the boss to read as a speed-up.
            const pulse = 0.7 + 0.3 * Math.sin(dnow / 50);
            const ringR = 38 * pulse;
            const ringGrad = ctx.createRadialGradient(cx, cy, ringR * 0.5, cx, cy, ringR * 1.7);
            ringGrad.addColorStop(0, 'rgba(255,232,160,0)');
            ringGrad.addColorStop(0.5, `rgba(255,200,80,${0.55 * fadeIn})`);
            ringGrad.addColorStop(1, 'rgba(180,120,30,0)');
            ctx.fillStyle = ringGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR * 1.7, 0, Math.PI * 2);
            ctx.fill();

            // Plasma motes streaking behind the dash.
            if (typeof bossFX !== 'undefined' && bossFX.particles && Math.random() < 0.7) {
                const tt = Math.random();
                const sx = cx - Math.cos(d.ang) * (50 * tt);
                const sy = cy - Math.sin(d.ang) * (50 * tt);
                const sp = 1.5 + Math.random() * 1.8;
                const a = d.ang + Math.PI + (Math.random() - 0.5) * 0.7;
                bossFX.particles.push({
                    x: sx, y: sy,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp,
                    size: 1.5 + Math.random() * 1.8,
                    color: Math.random() < 0.5 ? '#fff2c0' : '#ffd86b',
                    lifeMs: 240 + Math.random() * 200,
                    gravity: 0,
                    drag: 0.92,
                    alpha: 0.9,
                    startedAt: dnow
                });
            }
            ctx.restore();
        }

        if (this.activeSwing) {
            const s = this.activeSwing;
            const t = (Date.now() - s.startedAt) / s.durMs;
            const ang = s.startAng + (s.endAng - s.startAng) * t;
            const tipX = s.cx + Math.cos(ang) * s.radius;
            const tipY = s.cy + Math.sin(ang) * s.radius;
            const bladeAlpha = 1 - t * 0.5;
            ctx.save();

            // 1) Soft gold sweep fan — source-over so overlapping swings
            // can't bloom to white.
            ctx.globalCompositeOperation = 'source-over';
            const sweepAlpha = 0.22 * (1 - t * 0.3);
            const fanGrad = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, s.radius);
            fanGrad.addColorStop(0,    `rgba(255,232,160,${sweepAlpha * 1.2})`);
            fanGrad.addColorStop(0.55, `rgba(255,200,80,${sweepAlpha * 0.8})`);
            fanGrad.addColorStop(1,    'rgba(180,120,30,0)');
            ctx.fillStyle = fanGrad;
            ctx.beginPath();
            ctx.moveTo(s.cx, s.cy);
            ctx.arc(s.cx, s.cy, s.radius, s.startAng, ang);
            ctx.closePath();
            ctx.fill();

            // 2) Procedural flame greatsword body — gold ribbons +
            // wobbling white spine, drawn along the current sweep angle.
            // Inspired by SwordSlash.renderFlameBlade but recolored to
            // halberd-form gold so it doesn't clash with the form palette.
            {
                ctx.save();
                ctx.translate(s.cx, s.cy);
                ctx.rotate(ang);
                const len = s.radius;
                const ph = (Date.now() - s.startedAt) * 0.014;

                // Sample blade outline points (flame profile: thickest
                // ~25% from hilt, tapers to a point at tip, with a
                // two-octave sine wobble for a dancing-fire silhouette).
                const baseW = 16;
                const N = 22;
                const pts = [];
                for (let i = 0; i <= N; i++) {
                    const u = i / N;
                    const x = u * len;
                    const profile = (0.18 + 4.2 * u * Math.pow(1 - u, 1.4)) * baseW;
                    const wob1 = Math.sin(u * 9 + ph * 3.4) * 0.35;
                    const wob2 = Math.sin(u * 17 - ph * 5.1) * 0.18;
                    const wob3 = Math.sin(u * 4 + ph * 1.6) * 0.25;
                    const upper = -profile * (1 + wob1 + wob2);
                    const lower =  profile * (1 + wob3 - wob2);
                    pts.push({ x, upper, lower });
                }
                pts[0].upper = -baseW * 0.18;
                pts[0].lower =  baseW * 0.18;
                pts[N].upper = 0;
                pts[N].lower = 0;

                const tracePath = (offset) => {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].upper - offset);
                    for (let i = 1; i < pts.length; i++) {
                        const p = pts[i];
                        const pp = pts[i - 1];
                        const mx = (pp.x + p.x) / 2;
                        const my = ((pp.upper - offset) + (p.upper - offset)) / 2;
                        ctx.quadraticCurveTo(pp.x, pp.upper - offset, mx, my);
                    }
                    // Round off the tip — converge upper and lower edges
                    // at the blade point. No protruding apex (which used
                    // to read like an ugly arrowhead under the tip orb).
                    ctx.lineTo(pts[N].x, 0);
                    for (let i = pts.length - 2; i >= 0; i--) {
                        const p = pts[i];
                        const pn = pts[i + 1];
                        const mx = (pn.x + p.x) / 2;
                        const my = ((pn.lower + offset) + (p.lower + offset)) / 2;
                        ctx.quadraticCurveTo(pn.x, pn.lower + offset, mx, my);
                    }
                    ctx.closePath();
                };

                // Outer bloom (additive, low alpha so overlaps don't blow out).
                ctx.globalCompositeOperation = 'lighter';
                const bloomOffset = baseW * 1.6;
                const bloomGrad = ctx.createLinearGradient(0, -bloomOffset, 0, bloomOffset);
                bloomGrad.addColorStop(0,    'rgba(180,120,30,0)');
                bloomGrad.addColorStop(0.25, `rgba(220,170,60,${0.10 * bladeAlpha})`);
                bloomGrad.addColorStop(0.5,  `rgba(255,210,100,${0.18 * bladeAlpha})`);
                bloomGrad.addColorStop(0.75, `rgba(220,170,60,${0.10 * bladeAlpha})`);
                bloomGrad.addColorStop(1,    'rgba(180,120,30,0)');
                ctx.fillStyle = bloomGrad;
                tracePath(bloomOffset);
                ctx.fill();

                // Body draws opaque to prevent runaway saturation.
                ctx.globalCompositeOperation = 'source-over';

                // Outer halo: deep amber.
                ctx.globalAlpha = 0.55 * bladeAlpha;
                tracePath(baseW * 0.55);
                ctx.fillStyle = '#b07820';
                ctx.fill();

                // Mid body: gold.
                ctx.globalAlpha = 0.85 * bladeAlpha;
                tracePath(baseW * 0.18);
                ctx.fillStyle = '#ffd86b';
                ctx.fill();

                // Hot core: pale cream.
                ctx.globalAlpha = 0.95 * bladeAlpha;
                tracePath(-baseW * 0.10);
                ctx.fillStyle = '#fff2c0';
                ctx.fill();

                // Bright wobbling white spine.
                ctx.globalAlpha = bladeAlpha;
                ctx.strokeStyle = '#fffcec';
                ctx.lineCap = 'round';
                ctx.lineWidth = Math.max(2, baseW * 0.35);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                for (let i = 1; i < pts.length; i++) {
                    const p = pts[i];
                    const wob = Math.sin(p.x * 0.06 + ph * 4.2) * baseW * 0.18 * (1 - i / N);
                    ctx.lineTo(p.x, wob);
                }
                ctx.stroke();

                // Leaping tongues — short curls peeling off the silhouette.
                ctx.globalCompositeOperation = 'lighter';
                const tongueCount = 7;
                for (let k = 0; k < tongueCount; k++) {
                    const u = 0.10 + 0.85 * ((k * 0.137 + ph * 0.18) % 1);
                    const idx = Math.min(pts.length - 1, Math.floor(u * pts.length));
                    const p = pts[idx];
                    const side = (k % 2 === 0) ? 1 : -1;
                    const root = side > 0 ? p.lower : p.upper;
                    const tipOff = baseW * (0.55 + 0.85 * Math.abs(Math.sin(ph * 3.2 + k * 1.3)));
                    const curl = (Math.sin(ph * 4.4 + k * 1.7)) * baseW * 0.7;
                    const tx = p.x + curl * 0.5;
                    const ty = root + side * tipOff;
                    ctx.globalAlpha = 0.22 * bladeAlpha * (0.55 + 0.45 * Math.abs(Math.sin(ph * 5 + k)));
                    ctx.fillStyle = side > 0 ? '#ffe5a0' : '#ffb84a';
                    ctx.beginPath();
                    ctx.moveTo(p.x - baseW * 0.3, root);
                    ctx.quadraticCurveTo(p.x + baseW * 0.1, root + side * baseW * 0.45, tx, ty);
                    ctx.quadraticCurveTo(p.x + baseW * 0.05, root + side * baseW * 0.18, p.x + baseW * 0.3, root);
                    ctx.closePath();
                    ctx.fill();
                }

                ctx.restore();
            }

            // 3) Tip plasma orb at the leading edge of the blade —
            // a soft round flare, no diamond/arrow shape so it doesn't
            // read as a "spear tip" on a sweeping blade.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const tipPulse = 0.7 + 0.3 * Math.sin((Date.now() - s.startedAt) * 0.02);
            const tipR = 22 * tipPulse;
            const tipGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipR);
            tipGrad.addColorStop(0,   `rgba(255,250,220,${0.85 * bladeAlpha})`);
            tipGrad.addColorStop(0.5, `rgba(255,200,80,${0.45 * bladeAlpha})`);
            tipGrad.addColorStop(1,   'rgba(180,120,30,0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath(); ctx.arc(tipX, tipY, tipR, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // 4) Sparks shed off the tip while sweeping.
            if (typeof bossFX !== 'undefined' && bossFX.particles && Math.random() < 0.6 && t < 0.9) {
                const sp = 2 + Math.random() * 3;
                const sa = ang + (Math.random() - 0.5) * 1.4;
                bossFX.particles.push({
                    x: tipX, y: tipY,
                    vx: Math.cos(sa) * sp,
                    vy: Math.sin(sa) * sp,
                    size: 1.2 + Math.random() * 1.6,
                    color: Math.random() < 0.5 ? '#fff7d8' : '#ffd86b',
                    lifeMs: 220 + Math.random() * 200,
                    gravity: 0,
                    drag: 0.9,
                    alpha: 0.9,
                    startedAt: Date.now()
                });
            }

            ctx.restore();
        }

        // Active thrust — flame spear extending from the boss body,
        // matching the swing's procedural flame style for visual cohesion.
        // Single connected silhouette (no detached spearhead): from hilt
        // at boss center to a tapering point at the current tip.
        if (this.activeThrust) {
            const s = this.activeThrust;
            const t = (Date.now() - s.startedAt) / s.durMs;
            // Easing: snap extend → long hold (impale) → quick retract.
            // Matches _tickActiveThrust so hit window and visible spear
            // line up exactly.
            let ext;
            if (t < 0.30) ext = t / 0.30;
            else if (t < 0.65) ext = 1;
            else ext = Math.max(0, 1 - (t - 0.65) / 0.35);
            const len = s.reach * ext;
            if (len > 4) {
                const bladeAlpha = 1 - Math.max(0, t - 0.7) * 3.3;
                ctx.save();
                ctx.translate(s.cx, s.cy);
                ctx.rotate(s.ang);
                const ph = (Date.now() - s.startedAt) * 0.018;

                // Procedural flame-spear silhouette. Thinner than the
                // sweep blade (it's a stab, not a sword) but built from
                // the same point-sampled outline so the spine and halo
                // stay cleanly connected end to end.
                const baseW = 11;
                const N = 22;
                const pts = [];
                for (let i = 0; i <= N; i++) {
                    const u = i / N;
                    const x = u * len;
                    // Profile: thicker near hilt, sharp tip.
                    const profile = (0.22 + 3.2 * u * Math.pow(1 - u, 1.6)) * baseW;
                    const wob1 = Math.sin(u * 11 + ph * 4.0) * 0.30;
                    const wob2 = Math.sin(u * 5 - ph * 2.4) * 0.18;
                    const upper = -profile * (1 + wob1);
                    const lower =  profile * (1 - wob2);
                    pts.push({ x, upper, lower });
                }
                pts[0].upper = -baseW * 0.22;
                pts[0].lower =  baseW * 0.22;
                pts[N].upper = 0;
                pts[N].lower = 0;

                const tracePath = (offset) => {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].upper - offset);
                    for (let i = 1; i < pts.length; i++) {
                        const p = pts[i];
                        const pp = pts[i - 1];
                        const mx = (pp.x + p.x) / 2;
                        const my = ((pp.upper - offset) + (p.upper - offset)) / 2;
                        ctx.quadraticCurveTo(pp.x, pp.upper - offset, mx, my);
                    }
                    // Tip converges to a single point — no arrowhead apex.
                    ctx.lineTo(pts[N].x, 0);
                    for (let i = pts.length - 2; i >= 0; i--) {
                        const p = pts[i];
                        const pn = pts[i + 1];
                        const mx = (pn.x + p.x) / 2;
                        const my = ((pn.lower + offset) + (p.lower + offset)) / 2;
                        ctx.quadraticCurveTo(pn.x, pn.lower + offset, mx, my);
                    }
                    ctx.closePath();
                };

                // Outer cyan bloom (additive, low alpha).
                ctx.globalCompositeOperation = 'lighter';
                const bloomOffset = baseW * 1.6;
                const bg = ctx.createLinearGradient(0, -bloomOffset, 0, bloomOffset);
                bg.addColorStop(0,    'rgba(40,120,200,0)');
                bg.addColorStop(0.5, `rgba(127,223,255,${0.18 * bladeAlpha})`);
                bg.addColorStop(1,    'rgba(40,120,200,0)');
                ctx.fillStyle = bg;
                tracePath(bloomOffset);
                ctx.fill();

                // Body: opaque, no additive accumulation.
                ctx.globalCompositeOperation = 'source-over';

                // Outer halo: deep cyan
                ctx.globalAlpha = 0.55 * bladeAlpha;
                tracePath(baseW * 0.5);
                ctx.fillStyle = '#1c6088';
                ctx.fill();

                // Mid body: bright cyan
                ctx.globalAlpha = 0.85 * bladeAlpha;
                tracePath(baseW * 0.18);
                ctx.fillStyle = '#7fdfff';
                ctx.fill();

                // Hot core: pale ice
                ctx.globalAlpha = 0.95 * bladeAlpha;
                tracePath(-baseW * 0.10);
                ctx.fillStyle = '#e8faff';
                ctx.fill();

                // White wobbling spine — tapers to nothing at the tip,
                // so the silhouette ends in a point rather than a hard line.
                ctx.globalAlpha = bladeAlpha;
                ctx.strokeStyle = '#ffffff';
                ctx.lineCap = 'round';
                ctx.lineWidth = Math.max(2, baseW * 0.30);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                for (let i = 1; i < pts.length; i++) {
                    const p = pts[i];
                    const wob = Math.sin(p.x * 0.07 + ph * 5.0) * baseW * 0.16 * (1 - i / N);
                    ctx.lineTo(p.x, wob);
                }
                ctx.stroke();

                ctx.restore();

                // Tip soft glow — a little plasma flare at the spear's
                // leading point, drawn in world coords so it never clips
                // when the body fades.
                const tipX = s.cx + Math.cos(s.ang) * len;
                const tipY = s.cy + Math.sin(s.ang) * len;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const tipR = 16;
                const tg = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipR);
                tg.addColorStop(0,   `rgba(255,255,255,${0.85 * bladeAlpha})`);
                tg.addColorStop(0.5, `rgba(127,223,255,${0.45 * bladeAlpha})`);
                tg.addColorStop(1,   'rgba(40,120,200,0)');
                ctx.fillStyle = tg;
                ctx.beginPath(); ctx.arc(tipX, tipY, tipR, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        }

        // Active wave — long-range hitscan polearm beam, 3-layer additive
        // beam with bright core flash that fades fast.
        if (this.activeWave) {
            const w = this.activeWave;
            const t = (Date.now() - w.startedAt) / w.durMs;
            const fade = Math.max(0, 1 - t);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            // Outer huge halo
            ctx.strokeStyle = '#ffd86b';
            ctx.lineWidth = 38;
            ctx.globalAlpha = 0.45 * fade;
            ctx.beginPath(); ctx.moveTo(w.sx, w.sy); ctx.lineTo(w.ex, w.ey); ctx.stroke();
            // Mid body
            ctx.strokeStyle = '#ffe5a0';
            ctx.lineWidth = 18;
            ctx.globalAlpha = 0.75 * fade;
            ctx.beginPath(); ctx.moveTo(w.sx, w.sy); ctx.lineTo(w.ex, w.ey); ctx.stroke();
            // Hot core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 6;
            ctx.globalAlpha = fade;
            ctx.beginPath(); ctx.moveTo(w.sx, w.sy); ctx.lineTo(w.ex, w.ey); ctx.stroke();
            ctx.restore();
        }

        // Body — color depends on form. While reconfiguring, blink between
        // the source and target colors.
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const formColor = (this.reconfiguring && Math.floor(Date.now() / 80) % 2 === 0)
            ? this._formColor()
            : this._currentFormColor();

        // Outer halo
        ctx.save();
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50);
        halo.addColorStop(0, this._withAlpha(formColor, 0.35));
        halo.addColorStop(1, this._withAlpha(formColor, 0));
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Mech core
        ctx.save();
        ctx.translate(cx, cy);
        // Reconfigure: rotate quickly and shrink slightly.
        const reconfT = this.reconfiguring ? (Date.now() - this.reconfigStart) / PROTEUS_RECONFIG_MS : 0;
        const scale = this.reconfiguring ? (0.85 + 0.15 * Math.sin(reconfT * Math.PI)) : 1;
        const rot = this.reconfiguring ? this.bodySpin * 5 : this.facingAngle;
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        // Hex chassis
        ctx.fillStyle = '#1a3540';
        ctx.strokeStyle = formColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = 26;
            const x = Math.cos(a) * r, y = Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Form-specific weapon stub on the front
        ctx.fillStyle = formColor;
        if (this.form === 'halberd') {
            ctx.fillRect(20, -3, 36, 6);
        } else if (this.form === 'skirmish') {
            ctx.fillRect(18, -8, 18, 4);
            ctx.fillRect(18, 4, 18, 4);
        } else {
            ctx.beginPath();
            ctx.arc(18, 0, 7, 0, Math.PI * 2);
            ctx.fill();
        }
        // Core eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = formColor;
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Turrets (turret form)
        if (this.turrets && this.turrets.length && (this.form === 'turret' || this.reconfiguring)) {
            for (const tu of this.turrets) {
                const tx = cx + tu.ox, ty = cy + tu.oy;
                ctx.save();
                ctx.translate(tx, ty);
                ctx.fillStyle = '#0d2530';
                ctx.strokeStyle = '#7fdfff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 11, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                if (game.player) {
                    const ang = Math.atan2((game.player.y + game.player.height / 2) - ty,
                                           (game.player.x + game.player.width / 2) - tx);
                    ctx.rotate(ang);
                }
                ctx.fillStyle = '#7fdfff';
                ctx.fillRect(0, -2, 14, 4);
                ctx.restore();
            }
        }

        this.drawHitIndicators(ctx);
    }

    _currentFormColor() {
        if (this.form === 'halberd') return '#ffd86b';
        if (this.form === 'turret')  return '#7fdfff';
        return '#a0ffc0';
    }

    _withAlpha(hex, alpha) {
        // Convert "#rrggbb" -> "rgba(r,g,b,a)"
        if (!hex || hex[0] !== '#' || hex.length !== 7) return `rgba(255,255,255,${alpha})`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }
}

// ============================================================
// Proteus's projectile. Straight-flying shot. damage param keeps
// shotgun pellets distinct from heavy cannon rounds.
// ============================================================
class ProteusBullet {
    constructor(x, y, angle, color, damage) {
        this.x = x;
        this.y = y;
        this.width = 6;
        this.height = 6;
        const speed = 9;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.angle = angle;
        this.color = color;
        this.damage = damage;
        this.spawnTime = Date.now();
        this.maxLifetime = 2200;
        this.shouldDestroy = false;
        this.trail = [];
    }
    update() {
        const now = Date.now();
        if (now - this.spawnTime > this.maxLifetime) { this.shouldDestroy = true; return; }
        this.x += this.vx;
        this.y += this.vy;
        this.trail.push({ x: this.x, y: this.y, t: now });
        while (this.trail.length && now - this.trail[0].t > 160) this.trail.shift();
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
            if (d < 14) {
                game.player.takeDamage(this.damage);
                this.shouldDestroy = true;
                bossFX.addFlash(this.x, this.y, 16, this.color, 160, 0.8);
            }
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const age = (Date.now() - p.t) / 160;
            const a = Math.max(0, 1 - age) * 0.55;
            ctx.globalAlpha = a;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * (1 - age), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
