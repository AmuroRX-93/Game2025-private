// New-pilot tutorial. Linear, four-step flow:
//   step 0  intro panel  -> press Space
//   step 1  movement     -> walk into 3 rings
//   step 2  weapons      -> destroy 4 dummies (any hand weapon)
//   step 3  shoulder+lock-> destroy 3 armoured dummies (Q to fire missiles, C to cycle)
//   step 4  boss fight   -> kill the SparringDrone (custom tutorial-only boss)
//   step 5  outro panel  -> press Space, return to main menu
//
// The player is invincible the entire time so the tutorial can never
// soft-lock. We rely on the same enemy/projectile arrays the rest of
// the game uses, so weapons behave exactly as in real combat.

const TUTORIAL_LS_KEY = 'tutorialCompleted';

function tutorialIsCompleted() {
    try { return localStorage.getItem(TUTORIAL_LS_KEY) === '1'; }
    catch (_) { return false; }
}
function tutorialMarkCompleted() {
    try { localStorage.setItem(TUTORIAL_LS_KEY, '1'); } catch (_) {}
}
function tutorialResetCompleted() {
    try { localStorage.removeItem(TUTORIAL_LS_KEY); } catch (_) {}
}

class TutorialDirector {
    constructor(game) {
        this.game = game;
        this.step = 0;
        // 'panel'   : intro/outro full-screen panel, waits for Space
        // 'playing' : interactive step, waits on isComplete()
        this.phase = 'panel';
        this.markers = [];
        this.skipDialogOpen = false;
        this._panelOpenedAt = Date.now();
        this._steps = buildTutorialSteps();
    }

    get currentStep() { return this._steps[this.step] || null; }

    start() {
        // step 0 is the intro panel; don't run setup until dismissed.
        this.phase = 'panel';
        this._panelOpenedAt = Date.now();
    }

    // Called every frame from gameCore.update().
    update() {
        if (this.skipDialogOpen) return;
        if (this.phase !== 'playing') return;
        // Pre-step: detect dodge-press edges so any step needing dodge
        // tracking can react. Also enforce stunner-stun lock on player.
        const p = this.game && this.game.player;
        if (p) {
            const dodging = !!p.isDodging;
            if (dodging && !this._lastDodging) {
                _registerDodgePress(this.game, this);
            }
            this._lastDodging = dodging;
            // Stun lock: if a stunner beam tagged the player, freeze
            // movement while the stun window is active. Player is
            // invincible (gameState.invincibleMode), so HP isn't at risk.
            if (p._tutorialStunUntil && Date.now() < p._tutorialStunUntil) {
                p.vx = 0; p.vy = 0;
            }
            // 1-HP floor for the boss fight step. The player is mortal
            // there but we never let them actually die — the boss has
            // very low damage anyway.
            if (p.tutorialMinHpFloor && p.health < 1) {
                p.health = 1;
            }
        }
        const s = this.currentStep;
        if (!s) return;
        try {
            if (typeof s.update === 'function') s.update(this.game, this);
            if (typeof s.isComplete === 'function' && s.isComplete(this.game, this)) {
                this._advance();
            }
        } catch (e) {
            console.warn('[tutorial] step update threw', e);
        }
    }

    _advance() {
        const cur = this.currentStep;
        if (cur && typeof cur.onExit === 'function') {
            try { cur.onExit(this.game, this); } catch (_) {}
        }
        // Wipe every in-flight projectile so leftovers from the
        // previous step (laser beams mid-charge, missiles in trail,
        // etc.) can never carry into the next one.
        _clearAllProjectiles(this.game);
        this.step++;
        this.markers = [];
        const next = this.currentStep;
        if (!next) {
            // Off the end -> mark complete and bounce to menu.
            tutorialMarkCompleted();
            if (this.game && typeof this.game.backToMainMenu === 'function') {
                this.game.backToMainMenu();
            }
            return;
        }
        if (next.kind === 'panel') {
            this.phase = 'panel';
            this._panelOpenedAt = Date.now();
        } else {
            this.phase = 'playing';
            if (typeof next.onEnter === 'function') {
                try { next.onEnter(this.game, this); }
                catch (e) { console.warn('[tutorial] onEnter threw', e); }
            }
        }
    }

    // Called from utils.js keydown listener. Returns true to swallow.
    handleKeydown(key) {
        if (this.skipDialogOpen) {
            if (key === 'Enter' || key === 'y' || key === 'Y') {
                this.skipDialogOpen = false;
                this._skipAll();
            } else if (key === 'Escape' || key === 'n' || key === 'N') {
                this.skipDialogOpen = false;
            }
            return true;
        }
        if (key === 'Escape') {
            this.skipDialogOpen = true;
            return true;
        }
        if (this.phase === 'panel') {
            // Debounce so a held key from the previous panel doesn't auto-skip.
            if (Date.now() - this._panelOpenedAt < 200) return true;
            if (key === ' ' || key === 'Enter') {
                this._advance();
                return true;
            }
            return true; // panel eats all other keys
        }
        return false;
    }

    _skipAll() {
        const cur = this.currentStep;
        if (cur && typeof cur.onExit === 'function') {
            try { cur.onExit(this.game, this); } catch (_) {}
        }
        tutorialMarkCompleted();
        if (this.game && typeof this.game.backToMainMenu === 'function') {
            this.game.backToMainMenu();
        }
    }
}

// =====================================================================
// Step definitions
// =====================================================================
// Each step has either kind:'panel' (briefing screen, waits for Space)
// or kind:'playing' (interactive). Playing steps may define onEnter,
// update, isComplete, onExit. The director walks them top-to-bottom.

function buildTutorialSteps() {
    const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
    return [
        // ---------- 0 : intro panel ----------
        {
            kind: 'panel',
            titleKey: 'tut.intro.title',
            bodyKey: 'tut.intro.body'
        },

        // ---------- 1 : movement (rings) ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.move',
            onEnter(game, dir) {
                _equip(game, { leftHand: null, rightHand: null,
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: null });
                _spawnRing(dir, 'ALPHA',   W * 0.25, H * 0.32);
                _spawnRing(dir, 'BRAVO',   W * 0.75, H * 0.32);
                _spawnRing(dir, 'CHARLIE', W * 0.50, H * 0.78);
            },
            update(game, dir) { _checkRingHits(game, dir); },
            isComplete(game, dir) { return _allRingsHit(dir); },
            onExit(game, dir) { dir.markers = []; }
        },

        // ---------- 2 : left-hand auto rifle only ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.leftHand',
            onEnter(game) {
                _equip(game, { leftHand: 'gun', rightHand: null,
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: null });
                _spawnDummy(game, W * 0.30, H * 0.30, { hp: 30 });
                _spawnDummy(game, W * 0.50, H * 0.30, { hp: 30 });
                _spawnDummy(game, W * 0.70, H * 0.30, { hp: 30 });
                _spawnDummy(game, W * 0.50, H * 0.65, { hp: 30 });
            },
            isComplete(game) { return _liveTutorialDummies(game) === 0; },
            onExit(game) { _clearTutorialEnemies(game); }
        },

        // ---------- 3 : right-hand melee only ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.rightHand',
            onEnter(game) {
                _equip(game, { leftHand: null, rightHand: 'sword',
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: null });
                // Spawn dummies close to the player so melee is practical.
                const cx = W / 2, cy = H / 2;
                _spawnDummy(game, cx - 140, cy - 30, { hp: 35 });
                _spawnDummy(game, cx + 140, cy - 30, { hp: 35 });
                _spawnDummy(game, cx - 80,  cy + 120, { hp: 35 });
                _spawnDummy(game, cx + 80,  cy + 120, { hp: 35 });
            },
            isComplete(game) { return _liveTutorialDummies(game) === 0; },
            onExit(game) { _clearTutorialEnemies(game); }
        },

        // ---------- 4 : shoulder 15-shot missile only ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.shoulder',
            onEnter(game) {
                _equip(game, { leftHand: null, rightHand: null,
                    leftShoulder: 'missile_launcher', rightShoulder: null,
                    hiddenAbility: null });
                _spawnDummy(game, W * 0.20, H * 0.30, { hp: 20, label: 'TGT-1' });
                _spawnDummy(game, W * 0.50, H * 0.20, { hp: 20, label: 'TGT-2' });
                _spawnDummy(game, W * 0.80, H * 0.30, { hp: 20, label: 'TGT-3' });
            },
            isComplete(game) { return _liveTutorialDummies(game) === 0; },
            onExit(game) { _clearTutorialEnemies(game); }
        },

        // ---------- 5 : EMP hidden ability ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.emp',
            onEnter(game, dir) {
                _equip(game, { leftHand: null, rightHand: null,
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: 'emp' });
                if (typeof keys !== 'undefined') {
                    keys['Shift'] = false;
                    keys['ShiftLeft'] = false;
                    keys['ShiftRight'] = false;
                }
                if (game.player && game.player.hiddenAbilityWeapon) {
                    const w = game.player.hiddenAbilityWeapon;
                    w.lastUseTime = Date.now() - Math.max(0, (w.cooldown || 0) - 600);
                }
                // Beefy enough to survive a centred EMP and keep the
                // stun visual going. EMP base 100 with linear falloff
                // — at the spawn radii below, dummies eat ~50–60 dmg
                // each, leaving them visibly damaged but alive so the
                // player gets to admire the stun + shockwave VFX.
                const cx = W / 2, cy = H / 2;
                _spawnDummy(game, cx - 200, cy - 60,  { hp: 200 });
                _spawnDummy(game, cx + 200, cy - 60,  { hp: 200 });
                _spawnDummy(game, cx - 120, cy + 140, { hp: 200 });
                _spawnDummy(game, cx + 120, cy + 140, { hp: 200 });
                _spawnDummy(game, cx,       cy - 200, { hp: 200 });
                // Track snapshot of total dummy HP so we can detect a
                // legitimate EMP hit (any HP loss) before counting down.
                dir.empState = {
                    initialHp: _sumTutorialDummyHp(game),
                    hitAt: 0
                };
            },
            update(game, dir) {
                const s = dir && dir.empState;
                if (!s) return;
                if (s.hitAt) return;
                const cur = _sumTutorialDummyHp(game);
                if (cur < s.initialHp) {
                    s.hitAt = Date.now();
                }
            },
            isComplete(game, dir) {
                const s = dir && dir.empState;
                if (!s || !s.hitAt) return false;
                return Date.now() - s.hitAt >= 2000;
            },
            onExit(game) { _clearTutorialEnemies(game); }
        },

        // ---------- 6 : dodge training (stunner laser turrets) ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.dodge',
            onEnter(game, dir) {
                _equip(game, { leftHand: null, rightHand: null,
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: null });
                dir.dodgeState = {
                    successful: 0,
                    required: 5,
                    lastSpaceAt: 0,
                    lastHitAt: 0,
                    pendingResolveAt: 0
                };
                // Spawn 3 stationary stunner turrets around the field.
                dir.stunnerTurrets = [
                    new TutorialStunnerTurret(W * 0.20, H * 0.25),
                    new TutorialStunnerTurret(W * 0.80, H * 0.25),
                    new TutorialStunnerTurret(W * 0.50, H * 0.80)
                ];
            },
            update(game, dir) {
                if (dir.stunnerTurrets) {
                    for (const t of dir.stunnerTurrets) t.update(game, dir);
                }
                _resolveDodgeAttempt(game, dir);
            },
            isComplete(game, dir) {
                return dir.dodgeState && dir.dodgeState.successful >= dir.dodgeState.required;
            },
            onExit(game, dir) {
                dir.stunnerTurrets = null;
                dir.dodgeState = null;
            }
        },

        // ---------- 7 : kill one enemy in each lock mode ----------
        {
            kind: 'playing',
            hintKey: 'tut.step.lock',
            onEnter(game, dir) {
                _equip(game, { leftHand: 'gun', rightHand: null,
                    leftShoulder: null, rightShoulder: null,
                    hiddenAbility: null });
                gameState.lockMode = 'soft';
                // Each flag flips true only after a kill confirmed under
                // that specific lock mode. Just cycling C is no longer
                // enough — the pilot must actually fire and finish a
                // dummy in soft / hard / manual lock.
                dir.lockState = { soft: false, hard: false, manual: false };
                dir.lockSpawnQueue = [];
                _spawnLockDummy(game, dir, W * 0.25, H * 0.30);
                _spawnLockDummy(game, dir, W * 0.50, H * 0.25);
                _spawnLockDummy(game, dir, W * 0.75, H * 0.30);
            },
            update(game, dir) {
                _trackLockKills(game, dir);
                _tickLockRespawn(game, dir);
            },
            isComplete(game, dir) {
                return dir.lockState && dir.lockState.soft &&
                    dir.lockState.hard && dir.lockState.manual;
            },
            onExit(game, dir) {
                _clearTutorialEnemies(game);
                dir.lockState = null;
                dir.lockSpawnQueue = null;
                gameState.lockMode = 'hard';
            }
        },

        // ---------- 8 : boss panel + boss fight ----------
        {
            kind: 'panel',
            titleKey: 'tut.boss.title',
            bodyKey: 'tut.boss.body'
        },
        {
            kind: 'playing',
            hintKey: 'tut.step.boss',
            onEnter(game) {
                // Full combat loadout for the final test.
                _equip(game, {
                    leftHand: 'gun',
                    rightHand: 'sword',
                    leftShoulder: 'missile_launcher',
                    rightShoulder: null,
                    hiddenAbility: 'emp'
                });
                // Player is mortal but very resilient: cannot drop below 1 HP.
                gameState.invincibleMode = false;
                if (game.player) {
                    game.player.isInvincible = false;
                    game.player.health = game.player.maxHealth;
                    game.player.tutorialMinHpFloor = true;
                }
                game.boss = new SparringDrone(W * 0.5, H * 0.30);
                gameState.bossSpawned = true;
                // Soften the drone so the player can finish even with the
                // 1-HP floor (no progress checkpoints if they die anyway).
                if (game.boss) {
                    for (const k in (game.boss._bulletDamageOverride || {})) {}
                    game.boss._tutorialFinalFight = true;
                }
            },
            isComplete(game) {
                return !game.boss || game.boss.health <= 0 || game.boss.markedForRemoval;
            },
            onExit(game) {
                if (game.boss) {
                    game.boss.markedForRemoval = true;
                    game.boss = null;
                }
                gameState.bossSpawned = false;
                gameState.invincibleMode = true;
                if (game.player) {
                    const p = game.player;
                    p.isInvincible = true;
                    p.tutorialMinHpFloor = false;
                    // Defensive reset so the outro panel does not show
                    // a player drifting/dashing/dodging from leftover state.
                    p.vx = 0; p.vy = 0;
                    p.isDodging = false;
                    p.dodgeStartTime = 0;
                    p.burning = false;
                    p.slowMultiplier = 1;
                    p.slowEndTime = 0;
                    if (p.getAllWeapons) {
                        p.getAllWeapons().forEach(w => {
                            if (!w) return;
                            if (w.type === 'sword') { w.isAttacking = false; w.isDashing = false; w.dashTarget = null; w.slashes = []; }
                            if (w.type === 'laser_spear') { w.isCharging = false; w.impaledEnemies && w.impaledEnemies.clear && w.impaledEnemies.clear(); }
                            if (w.type === 'moonlight_greatsword') { w.isAttacking = false; }
                        });
                    }
                }
                gameState.manualLockX = null;
                gameState.manualLockY = null;
                if (typeof keys !== 'undefined') { for (const k in keys) keys[k] = false; }
                if (typeof mouse !== 'undefined') { mouse.leftClick = false; mouse.rightClick = false; }
                if (typeof bossFX !== 'undefined') {
                    bossFX.shake = { x: 0, y: 0, until: 0, magnitude: 0, totalMs: 0 };
                }
                _clearTutorialProjectiles(game);
            }
        },

        // ---------- 9 : outro panel ----------
        {
            kind: 'panel',
            titleKey: 'tut.outro.title',
            bodyKey: 'tut.outro.body'
        }
    ];
}

// ---------- Step helpers ----------
function _spawnRing(dir, label, x, y, radius = 70) {
    dir.markers.push({ kind: 'ring', label, x, y, radius, hit: false });
}
// Re-equip the player from a partial weaponConfig override. Any slot
// not set here is forced to null so each tutorial step can guarantee
// a clean loadout (e.g. "left hand only" with no shoulder leak).
function _equip(game, cfg) {
    gameState.weaponConfig = {
        leftHand:      cfg.leftHand      || null,
        rightHand:     cfg.rightHand     || null,
        leftShoulder:  cfg.leftShoulder  || null,
        rightShoulder: cfg.rightShoulder || null,
        hiddenAbility: cfg.hiddenAbility || null
    };
    if (game.player && typeof game.player.loadDefaultWeapons === 'function') {
        game.player.loadDefaultWeapons();
    }
    if (typeof game.resetAllWeaponStates === 'function') {
        game.resetAllWeaponStates();
    }
}
function _playerInRing(game, ring) {
    if (!game.player) return false;
    const px = game.player.x + game.player.width / 2;
    const py = game.player.y + game.player.height / 2;
    const dx = px - ring.x, dy = py - ring.y;
    return (dx * dx + dy * dy) <= ring.radius * ring.radius;
}
function _allRingsHit(dir) {
    return dir.markers.length > 0 &&
        dir.markers.every(m => m.kind !== 'ring' || m.hit);
}
function _checkRingHits(game, dir) {
    for (const m of dir.markers) {
        if (m.kind !== 'ring' || m.hit) continue;
        if (_playerInRing(game, m)) m.hit = true;
    }
}
function _liveTutorialDummies(game) {
    return (game.enemies || []).filter(e => e && e.tutorialOwned && e.health > 0).length;
}
function _sumTutorialDummyHp(game) {
    let total = 0;
    for (const e of (game.enemies || [])) {
        if (e && e.tutorialOwned) total += Math.max(0, e.health);
    }
    return total;
}

// ---- Step 7 helpers: respawning lock-on dummies ----
//
// Tag each spawned dummy with a respawn marker so when it dies we
// can find a fresh location away from its previous slot and any
// surviving siblings, then reanimate after a 500ms delay.
function _spawnLockDummy(game, dir, x, y) {
    const d = _spawnDummy(game, x, y, { hp: 15, label: 'TGT' });
    d._lockTutDummy = true;
    d._lockSpawnRequested = false;
    // Wrap takeDamage one more time so we can attribute the kill to
    // the lock mode active at the moment of death — the bullet loop
    // splices the corpse the same frame, so we can't rely on the
    // director re-scanning enemies later.
    const _prev = d.takeDamage.bind(d);
    d.takeDamage = function (damage) {
        const wasAlive = this.health > 0;
        const r = _prev(damage);
        if (wasAlive && this.health <= 0 && dir && dir.lockState) {
            const m = gameState.lockMode;
            if (m === 'soft' || m === 'hard' || m === 'manual') {
                dir.lockState[m] = true;
            }
        }
        return r;
    };
    return d;
}
function _tickLockRespawn(game, dir) {
    if (!dir || !Array.isArray(dir.lockSpawnQueue)) return;
    const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
    const now = Date.now();

    // Detect freshly killed lock-tutorial dummies and queue a respawn.
    for (const e of (game.enemies || [])) {
        if (!e || !e._lockTutDummy) continue;
        if (e.health <= 0 && !e._lockSpawnRequested) {
            e._lockSpawnRequested = true;
            const slot = _pickLockSlot(game, W, H);
            dir.lockSpawnQueue.push({ at: now + 500, x: slot.x, y: slot.y });
        }
    }
    // Top up to 3 — count alive dummies plus already-queued spawns so
    // we don't over-queue while bullets are mid-flight at the same
    // dummy. (Without this top-up, simultaneous deaths could leave the
    // field empty for longer than the 500ms grace.)
    const alive = (game.enemies || []).filter(e => e && e._lockTutDummy && e.health > 0).length;
    const expected = alive + dir.lockSpawnQueue.length;
    for (let i = expected; i < 3; i++) {
        const slot = _pickLockSlot(game, W, H);
        dir.lockSpawnQueue.push({ at: now + 500, x: slot.x, y: slot.y });
    }
    // Pop ready entries.
    for (let i = dir.lockSpawnQueue.length - 1; i >= 0; i--) {
        const q = dir.lockSpawnQueue[i];
        if (now >= q.at) {
            _spawnLockDummy(game, dir, q.x, q.y);
            dir.lockSpawnQueue.splice(i, 1);
        }
    }
}

// A kill counts toward the current lock mode if the dummy that just
// died was being targeted under that mode at time of death. We tag
// kill attribution directly inside the dummy's takeDamage wrapper so
// the bullet-collision loop (which splices killed enemies the same
// frame) can never lose the event before director.update sees it.
function _trackLockKills(game, dir) {
    // No-op: attribution happens in _spawnLockDummy's takeDamage hook.
}
function _pickLockSlot(game, W, H) {
    const minX = W * 0.15, maxX = W * 0.85;
    const minY = H * 0.18, maxY = H * 0.55;
    const alive = (game.enemies || []).filter(e =>
        e && e._lockTutDummy && e.health > 0);
    let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, score: -Infinity };
    for (let i = 0; i < 12; i++) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        let minDistSq = Infinity;
        for (const a of alive) {
            const ax = a.x + a.width / 2;
            const ay = a.y + a.height / 2;
            const d2 = (x - ax) ** 2 + (y - ay) ** 2;
            if (d2 < minDistSq) minDistSq = d2;
        }
        if (minDistSq > best.score) {
            best = { x, y, score: minDistSq };
        }
    }
    return { x: best.x, y: best.y };
}
function _spawnDummy(game, x, y, opts = {}) {
    const d = new TrainingDummy(x, y);
    d.tutorialOwned = true;
    if (opts.hp != null) { d.health = opts.hp; d.maxHealth = opts.hp; }
    if (opts.label) d.tutorialLabel = opts.label;
    // Tutorial dummies stay put — easier targets while learning.
    d.vx = 0; d.vy = 0;
    d.setRandomDirection = function () { this.vx = 0; this.vy = 0; };
    // Belt-and-suspenders: TrainingDummy.takeDamage just returns isDead
    // and a few weapons (e.g. LaserRifle) don't splice on the return
    // value. Set shouldDestroy on death so the main game loop reaps the
    // corpse regardless of which weapon hit it.
    const _origTakeDamage = d.takeDamage.bind(d);
    d.takeDamage = function (damage) {
        const r = _origTakeDamage(damage);
        if (this.health <= 0) this.shouldDestroy = true;
        return r;
    };
    game.enemies.push(d);
    return d;
}
function _clearTutorialEnemies(game) {
    if (!game.enemies) return;
    game.enemies = game.enemies.filter(e => !e || !e.tutorialOwned);
}
function _clearTutorialProjectiles(game) {
    // SparringDrone owns its own projectile list; just nuke it.
    if (game.boss && Array.isArray(game.boss.bullets)) {
        game.boss.bullets.length = 0;
    }
    if (game.boss && Array.isArray(game.boss.warnings)) {
        game.boss.warnings.length = 0;
    }
}

// Clear every in-flight projectile / hazard owned by the main game
// loop. Called between tutorial steps so a step can never inherit
// stray ammo from the previous one.
function _clearAllProjectiles(game) {
    if (!game) return;
    const FIELDS = [
        'bullets', 'missiles', 'bossMissiles', 'crescentBullets',
        'bossCiwsBullets', 'mines', 'molotovs', 'chaosBullets',
        'starDevourerBullets', 'magnusBullets', 'magnusShells',
        'hivePlasmaBullets', 'hiveSplinters', 'yukikonBullets',
        'yukikonDaggers', 'proteusBullets', 'ciwsBullets',
        'plasmaMissiles', 'plasmaFields', 'clusterMissiles',
        'splitMissiles', 'highTrackMissiles', 'clusterBombMissiles',
        'clusterBombChildren', 'mineLayerMissiles', 'mineLayerMines',
        'detCordMissiles', 'detCordTrails', 'detCordExplosions',
        'laserTurrets'
    ];
    for (const k of FIELDS) {
        if (Array.isArray(game[k])) game[k].length = 0;
    }
    // Boss-owned projectile lists too.
    _clearTutorialProjectiles(game);
}

// ---- Step 6 helpers: dodge counter ----
//
// A "successful dodge" is defined as: player presses Space (the dodge
// key) AND was not hit by a stunner laser in the 1s window before the
// press, AND is not hit in the 1s window after the press. We resolve
// pending presses each frame after the trailing window expires.
function _registerDodgePress(game, dir) {
    if (!dir || !dir.dodgeState) return;
    const now = Date.now();
    dir.dodgeState.lastSpaceAt = now;
    dir.dodgeState.pendingResolveAt = now + 1000;
}
function _registerStunnerHit(game, dir) {
    if (!dir || !dir.dodgeState) return;
    dir.dodgeState.lastHitAt = Date.now();
}
function _resolveDodgeAttempt(game, dir) {
    const s = dir && dir.dodgeState;
    if (!s) return;
    const now = Date.now();
    if (!s.pendingResolveAt || now < s.pendingResolveAt) return;

    const pressAt = s.lastSpaceAt;
    // Hit in the window [press-1s, press+1s] disqualifies this attempt.
    const hitWithinWindow = s.lastHitAt &&
        Math.abs(s.lastHitAt - pressAt) <= 1000;
    if (!hitWithinWindow) {
        s.successful = Math.min(s.required, s.successful + 1);
    }
    // Reset the pending state regardless so a new press can be tracked.
    s.pendingResolveAt = 0;
    s.lastSpaceAt = 0;
}

// ---- Step 6: stunner laser turret ----
//
// Static, immortal (no health bar). Fires a thin beam at the player's
// current position with telegraph -> beam -> recover phases. A beam
// hit briefly stuns the player (vx/vy zeroed for ~600ms) and counts
// as a "stunner hit" against the dodge resolver.
class TutorialStunnerTurret {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.r = 22;
        this.color = '#ff5f5f';
        // State machine
        this.phase = 'idle'; // 'idle' | 'aim' | 'fire' | 'cool'
        this.phaseUntil = Date.now() + 800 + Math.random() * 600;
        this.aimX = 0; this.aimY = 0;
        this.beamLen = 1400;
    }
    update(game, dir) {
        const now = Date.now();
        if (now < this.phaseUntil) {
            // Continue current phase; for 'fire' we still need to apply
            // the beam hit each frame the player crosses it.
            if (this.phase === 'fire') this._tryHitPlayer(game, dir);
            return;
        }
        // Phase transitions
        if (this.phase === 'idle') {
            this._lockOnPlayer(game);
            this.phase = 'aim';
            this.phaseUntil = now + 700;
        } else if (this.phase === 'aim') {
            this.phase = 'fire';
            this.phaseUntil = now + 280;
            this._tryHitPlayer(game, dir);
        } else if (this.phase === 'fire') {
            this.phase = 'cool';
            this.phaseUntil = now + 1100;
        } else {
            this.phase = 'idle';
            this.phaseUntil = now + 600 + Math.random() * 500;
        }
    }
    _lockOnPlayer(game) {
        const p = game.player;
        if (!p) { this.aimX = this.x; this.aimY = this.y; return; }
        this.aimX = p.x + p.width / 2;
        this.aimY = p.y + p.height / 2;
    }
    _tryHitPlayer(game, dir) {
        const p = game.player;
        if (!p) return;
        // Distance from player center to the beam ray.
        const sx = this.x, sy = this.y;
        const dx = this.aimX - sx, dy = this.aimY - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const px = p.x + p.width / 2, py = p.y + p.height / 2;
        // Project player onto beam.
        const tProj = (px - sx) * ux + (py - sy) * uy;
        if (tProj < 0 || tProj > this.beamLen) return;
        const closestX = sx + ux * tProj;
        const closestY = sy + uy * tProj;
        const distSq = (closestX - px) ** 2 + (closestY - py) ** 2;
        const radius = 14; // beam thickness
        if (distSq > radius * radius) return;

        // Hit! Briefly stun the player (zero velocity, lock attacks).
        // Player keeps invincibility (gameState.invincibleMode = true)
        // so the laser does no real damage — only the stun.
        if (!p._tutorialStunUntil || Date.now() > p._tutorialStunUntil) {
            // Apply stun: hijack vx/vy + isDodging clear. We use a custom
            // flag so the player.update() logic doesn't fight us.
            p.vx = 0; p.vy = 0;
            p._tutorialStunUntil = Date.now() + 600;
        }
        _registerStunnerHit(game, dir);
    }
    draw(ctx) {
        const now = Date.now();
        // Body
        ctx.save();
        ctx.fillStyle = '#3a1010';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Inner core
        ctx.shadowBlur = 0;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Beam visualization
        if (this.phase === 'aim') {
            const k = 1 - (this.phaseUntil - now) / 700;
            ctx.save();
            ctx.strokeStyle = `rgba(255,95,95,${0.25 + 0.5 * Math.max(0, k)})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 6]);
            const ang = Math.atan2(this.aimY - this.y, this.aimX - this.x);
            const ex = this.x + Math.cos(ang) * this.beamLen;
            const ey = this.y + Math.sin(ang) * this.beamLen;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.restore();
        } else if (this.phase === 'fire') {
            ctx.save();
            const ang = Math.atan2(this.aimY - this.y, this.aimX - this.x);
            const ex = this.x + Math.cos(ang) * this.beamLen;
            const ey = this.y + Math.sin(ang) * this.beamLen;
            ctx.shadowColor = '#ff5f5f';
            ctx.shadowBlur = 18;
            ctx.strokeStyle = '#ffd0d0';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.strokeStyle = '#ff5f5f';
            ctx.lineWidth = 14;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// =====================================================================
// SparringDrone — tutorial-only boss
// =====================================================================
// A friendly training partner used in the final tutorial step. It
// stays roughly stationary, cycles through three telegraphed attacks
// at a slow tempo, and owns its own bullet/warning lists (so it
// doesn't have to plug into any of the global projectile arrays).
//
// HP, damage, and timings are all tuned low — the player is also
// invincible during the tutorial, so this is purely a controlled
// environment for the pilot to exercise everything they just learned.

class SparringDrone {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 84;
        this.height = 84;
        this.maxHealth = 800;
        this.health = this.maxHealth;
        this.color = '#aef0ff';
        this.markedForRemoval = false;
        this.isBoss = true;
        this.bossName = 'SPARRING DRONE';
        // Drift so the player has to lead aim a tiny bit.
        this._driftAngle = Math.random() * Math.PI * 2;
        this._driftSpeed = 0.6;
        // Attack scheduling
        this._lastAttackAt = Date.now() + 1500; // grace before first volley
        this._attackInterval = 3200;
        this._attackIdx = 0;
        // Owned hazards
        this.bullets = [];   // {x,y,vx,vy,r,life,damage}
        this.warnings = [];  // {x,y,r,until,damage}
        // Hit-flash state for the unified boss damage overlay.
        this.lastDamageTime = 0;
        this.lastDamageAmount = 0;
    }

    takeDamage(damage) {
        const boosted = (typeof applyOverdriveBoost === 'function')
            ? applyOverdriveBoost(damage) : damage;
        this.health -= boosted;
        this.lastDamageTime = Date.now();
        this.lastDamageAmount = boosted;
        if (typeof spawnDamageNumber === 'function') {
            spawnDamageNumber(this.x + this.width / 2, this.y, boosted);
        }
        if (this.health <= 0) {
            this.health = 0;
            this.markedForRemoval = true;
        }
    }

    update() {
        if (this.markedForRemoval) return;
        const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;

        // Lazy drift, kept inside a comfortable rectangle.
        this._driftAngle += (Math.random() - 0.5) * 0.05;
        this.x += Math.cos(this._driftAngle) * this._driftSpeed;
        this.y += Math.sin(this._driftAngle) * this._driftSpeed * 0.5;
        const minX = W * 0.20, maxX = W * 0.80;
        const minY = H * 0.10, maxY = H * 0.40;
        if (this.x < minX) { this.x = minX; this._driftAngle = Math.PI - this._driftAngle; }
        if (this.x > maxX) { this.x = maxX; this._driftAngle = Math.PI - this._driftAngle; }
        if (this.y < minY) { this.y = minY; this._driftAngle = -this._driftAngle; }
        if (this.y > maxY) { this.y = maxY; this._driftAngle = -this._driftAngle; }

        // Attack ticker
        const now = Date.now();
        if (now - this._lastAttackAt >= this._attackInterval) {
            this._lastAttackAt = now;
            this._fireNextAttack();
        }

        this._tickBullets();
        this._tickWarnings();
    }

    _fireNextAttack() {
        const idx = this._attackIdx % 3;
        this._attackIdx++;
        if (idx === 0) this._atkAimedSpread();
        else if (idx === 1) this._atkRingBurst();
        else this._atkGroundMark();
    }

    // 5 slow bullets in a narrow spread aimed at the player.
    _atkAimedSpread() {
        const target = this._playerCenter();
        if (!target) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const baseAng = Math.atan2(target.y - cy, target.x - cx);
        const speed = 4.5;
        for (let i = -2; i <= 2; i++) {
            const a = baseAng + i * 0.10;
            this.bullets.push({
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                r: 8, life: 220, damage: 4,
                color: '#aef0ff'
            });
        }
    }

    // 12 bullets evenly around the drone.
    _atkRingBurst() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const speed = 3.6;
        const N = 12;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            this.bullets.push({
                x: cx, y: cy,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                r: 7, life: 240, damage: 4,
                color: '#7feaff'
            });
        }
    }

    // Drop a telegraphed AOE on the player's current position.
    _atkGroundMark() {
        const target = this._playerCenter();
        if (!target) return;
        this.warnings.push({
            x: target.x, y: target.y, r: 95,
            createdAt: Date.now(),
            until: Date.now() + 900,
            damage: 6,
            triggered: false
        });
    }

    _tickBullets() {
        const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
        const player = this._playerCenter();
        const livePlayer = (typeof game !== 'undefined' && game) ? game.player : null;
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;
            if (player) {
                const dx = b.x - player.x, dy = b.y - player.y;
                if (dx * dx + dy * dy < (b.r + 14) * (b.r + 14)) {
                    // Final-fight step: deal a tiny scratch (1 HP) and let
                    // the director floor health to 1. Otherwise (earlier
                    // panel/warm-up), the player is invincible — just
                    // consume the bullet.
                    if (this._tutorialFinalFight && livePlayer &&
                        typeof livePlayer.takeDamage === 'function') {
                        try { livePlayer.takeDamage(1); } catch (_) {}
                    }
                    this.bullets.splice(i, 1);
                    continue;
                }
            }
            if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
                this.bullets.splice(i, 1);
            }
        }
    }

    _tickWarnings() {
        const now = Date.now();
        const livePlayer = (typeof game !== 'undefined' && game) ? game.player : null;
        const pc = this._playerCenter();
        for (let i = this.warnings.length - 1; i >= 0; i--) {
            const w = this.warnings[i];
            if (!w.triggered && now >= w.until) {
                w.triggered = true;
                w.detonatedAt = now;
                if (typeof bossFX !== 'undefined' && bossFX.shockwaves) {
                    bossFX.shockwaves.push({
                        x: w.x, y: w.y, r: 12, maxR: w.r,
                        createdAt: now, life: 320,
                        color: '#ff8a4c'
                    });
                }
                // Final-fight step: 1 dmg if the player is inside the
                // marker at detonation. Earlier scripted segments leave
                // the player invincible.
                if (this._tutorialFinalFight && pc && livePlayer &&
                    typeof livePlayer.takeDamage === 'function') {
                    const dx = pc.x - w.x, dy = pc.y - w.y;
                    if (dx * dx + dy * dy <= w.r * w.r) {
                        try { livePlayer.takeDamage(1); } catch (_) {}
                    }
                }
            }
            if (w.triggered && now - w.detonatedAt > 250) {
                this.warnings.splice(i, 1);
            }
        }
    }

    _playerCenter() {
        if (!game || !game.player) return null;
        return {
            x: game.player.x + game.player.width / 2,
            y: game.player.y + game.player.height / 2
        };
    }

    draw(ctx) {
        if (this.markedForRemoval) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const t = (Date.now() % 4000) / 4000;
        const spin = t * Math.PI * 2;

        // Outer hex frame
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(spin * 0.5);
        ctx.strokeStyle = '#aef0ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#aef0ff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        const R = this.width * 0.62;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = Math.cos(a) * R, py = Math.sin(a) * R;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Inner core (rotates the other way)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-spin * 1.2);
        ctx.fillStyle = 'rgba(174,240,255,0.20)';
        ctx.strokeStyle = '#e6fbff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const r2 = this.width * 0.30;
        ctx.rect(-r2, -r2, r2 * 2, r2 * 2);
        ctx.fill();
        ctx.stroke();
        // Core dot
        ctx.fillStyle = '#e6fbff';
        ctx.shadowColor = '#aef0ff';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Bullets
        for (const b of this.bullets) {
            ctx.save();
            ctx.fillStyle = b.color || '#aef0ff';
            ctx.shadowColor = b.color || '#aef0ff';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Ground warnings
        for (const w of this.warnings) {
            const now = Date.now();
            if (w.triggered) {
                const k = (now - w.detonatedAt) / 250;
                ctx.save();
                ctx.globalAlpha = Math.max(0, 1 - k);
                ctx.strokeStyle = '#ff8a4c';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(w.x, w.y, w.r * (0.6 + k * 0.4), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                continue;
            }
            const k = Math.min(1, (now - w.createdAt) / (w.until - w.createdAt));
            ctx.save();
            ctx.strokeStyle = `rgba(255,138,76,${0.3 + 0.5 * k})`;
            ctx.fillStyle = `rgba(255,138,76,${0.10 + 0.20 * k})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }
}

// =====================================================================
// Rendering
// =====================================================================
function tutorialDrawWorld(ctx, dir) {
    if (!dir) return;
    // Ring markers (movement step)
    if (dir.markers) {
        for (const m of dir.markers) {
            if (m.kind !== 'ring') continue;
            const t = (Date.now() % 1000) / 1000;
            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
            const color = m.hit ? '#69f0ae' : '#aef0ff';
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 14 + pulse * 12;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.25 + pulse * 0.35;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.radius * (0.4 + pulse * 0.4), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.font = `bold 16px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(m.label, m.x, m.y);
            if (m.hit) {
                ctx.font = `11px ${UI_THEME.font.mono}`;
                ctx.fillText('CLEAR', m.x, m.y + 18);
            }
            ctx.restore();
        }
    }
    // Stunner laser turrets (dodge step)
    if (dir.stunnerTurrets) {
        for (const t of dir.stunnerTurrets) {
            if (typeof t.draw === 'function') t.draw(ctx);
        }
    }
    // Boss is drawn from gameCore's normal boss draw path (we set
    // game.boss = drone). No work here.
}

function tutorialDrawHUD(ctx, dir) {
    if (!dir) return;
    const W = GAME_CONFIG.WIDTH;

    if (dir.phase === 'panel') {
        const step = dir.currentStep;
        if (step) {
            // Pilot/mech name is plumbed into the title and body so
            // the welcome / outro panels feel personal.
            const pilot = (gameState && gameState.mechName) || 'Scorchfrost';
            _drawPanel(ctx, t(step.titleKey, pilot), t(step.bodyKey, pilot),
                t('tut.ui.continueBriefing'));
        }
    } else if (dir.phase === 'playing') {
        const step = dir.currentStep;
        if (step && step.hintKey) {
            const subline = _objectiveSubline(dir);
            _drawObjective(ctx, t(step.hintKey), subline);
        }
        _drawProgressPill(ctx, dir, W);
    }
    if (dir.skipDialogOpen) _drawSkipDialog(ctx);
}

function _drawProgressPill(ctx, dir, W) {
    const H = GAME_CONFIG.HEIGHT;
    const w = 220, h = 36;
    const x = W - w - 20;
    const y = H - h - 16;
    uiDrawPanel(ctx, x, y, w, h, {
        chamfer: 8,
        fill: { from: 'rgba(8,14,20,0.85)', to: 'rgba(14,22,30,0.85)' },
        stroke: UI_THEME.color.buttonBorder,
        strokeWidth: 1.2
    });
    ctx.save();
    ctx.fillStyle = UI_THEME.color.buttonBorder;
    ctx.font = `12px ${UI_THEME.font.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Count only "playing" steps for a clean N/M display.
    const playingSteps = dir._steps.filter(s => s.kind === 'playing');
    const myIdx = playingSteps.indexOf(dir.currentStep);
    const cur = myIdx >= 0 ? myIdx + 1 : 1;
    const total = playingSteps.length;
    ctx.fillText(`STEP ${cur} / ${total}`, x + 12, y + h / 2);
    ctx.fillStyle = UI_THEME.color.textPrimary;
    ctx.font = `bold 13px ${UI_THEME.font.display}`;
    ctx.fillText(t('tut.ui.tutorialLabel'), x + 110, y + h / 2);
    ctx.restore();
}

function _objectiveSubline(dir) {
    if (!dir) return '';
    if (dir.dodgeState) {
        return t('tut.step.dodgeProgress',
            dir.dodgeState.successful, dir.dodgeState.required);
    }
    if (dir.lockState) {
        const tags = [];
        tags.push((dir.lockState.soft   ? '[X] ' : '[ ] ') + t('tut.lock.soft'));
        tags.push((dir.lockState.hard   ? '[X] ' : '[ ] ') + t('tut.lock.hard'));
        tags.push((dir.lockState.manual ? '[X] ' : '[ ] ') + t('tut.lock.manual'));
        return tags.join('   ');
    }
    return '';
}

function _drawObjective(ctx, hint, subline) {
    const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
    const w = 580, h = subline ? 88 : 64;
    const x = (W - w) / 2;
    const y = H - h - 16;
    uiDrawPanel(ctx, x, y, w, h, {
        chamfer: 10,
        fill: { from: 'rgba(8,14,20,0.9)', to: 'rgba(14,22,30,0.9)' },
        stroke: UI_THEME.color.buttonBorder,
        strokeWidth: 1.5
    });
    ctx.save();
    ctx.fillStyle = UI_THEME.color.buttonBorder;
    ctx.font = `11px ${UI_THEME.font.mono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t('tut.ui.objective'), x + 16, y + 10);
    ctx.fillStyle = UI_THEME.color.textPrimary;
    ctx.font = `15px ${UI_THEME.font.body}`;
    ctx.textAlign = 'center';
    if (typeof wrapAndDrawText === 'function') {
        wrapAndDrawText(ctx, hint, x + w / 2, y + 32, w - 32, 18);
    } else {
        ctx.fillText(hint, x + w / 2, y + 34);
    }
    if (subline) {
        ctx.fillStyle = UI_THEME.color.buttonBorder;
        ctx.font = `13px ${UI_THEME.font.mono}`;
        ctx.fillText(subline, x + w / 2, y + h - 22);
    }
    ctx.restore();
}

function _drawPanel(ctx, title, body, footer) {
    const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const w = 720, h = 320;
    const x = (W - w) / 2, y = (H - h) / 2;
    uiDrawPanel(ctx, x, y, w, h, {
        chamfer: 18,
        fill: { from: 'rgba(8,14,20,0.95)', to: 'rgba(14,22,30,0.95)' },
        stroke: UI_THEME.color.buttonBorder,
        strokeWidth: 2,
        glow: true,
        glowColor: UI_THEME.color.buttonBorder
    });
    ctx.save();
    ctx.fillStyle = UI_THEME.color.buttonBorder;
    ctx.font = `12px ${UI_THEME.font.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(t('tut.ui.tutorialLabel'), x + w / 2, y + 22);
    ctx.fillStyle = UI_THEME.color.textPrimary;
    ctx.font = `bold 28px ${UI_THEME.font.display}`;
    ctx.fillText(title || '', x + w / 2, y + 48);
    ctx.fillStyle = UI_THEME.color.textSecondary;
    ctx.font = `16px ${UI_THEME.font.body}`;
    const lines = String(body || '').split('\n');
    let by = y + 110;
    for (const line of lines) {
        if (typeof wrapAndDrawText === 'function') {
            wrapAndDrawText(ctx, line, x + w / 2, by, w - 80, 22);
        } else {
            ctx.fillText(line, x + w / 2, by);
        }
        by += 28;
    }
    ctx.fillStyle = UI_THEME.color.buttonBorder;
    ctx.font = `13px ${UI_THEME.font.mono}`;
    ctx.fillText(footer || '', x + w / 2, y + h - 30);
    ctx.restore();
}

function _drawSkipDialog(ctx) {
    const W = GAME_CONFIG.WIDTH, H = GAME_CONFIG.HEIGHT;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const w = 480, h = 200;
    const x = (W - w) / 2, y = (H - h) / 2;
    uiDrawPanel(ctx, x, y, w, h, {
        chamfer: 14,
        fill: { from: 'rgba(20,8,12,0.95)', to: 'rgba(28,10,14,0.95)' },
        stroke: UI_THEME.color.danger,
        strokeWidth: 2,
        glow: true,
        glowColor: UI_THEME.color.danger
    });
    ctx.save();
    ctx.fillStyle = UI_THEME.color.textPrimary;
    ctx.font = `bold 22px ${UI_THEME.font.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('tut.ui.skipTitle'), x + w / 2, y + 60);
    ctx.font = `14px ${UI_THEME.font.body}`;
    ctx.fillStyle = UI_THEME.color.textSecondary;
    ctx.fillText(t('tut.ui.skipBody'), x + w / 2, y + 100);
    ctx.fillStyle = UI_THEME.color.buttonBorder;
    ctx.font = `13px ${UI_THEME.font.mono}`;
    ctx.fillText(t('tut.ui.skipPrompt'), x + w / 2, y + h - 32);
    ctx.restore();
}

// =====================================================================
// Entry / exit
// =====================================================================
function tutorialEnter(game) {
    // Start with an empty rig — each step rewrites weaponConfig to
    // mandate exactly the loadout being trained.
    gameState.weaponConfig = {
        leftHand: null,
        rightHand: null,
        leftShoulder: null,
        rightShoulder: null,
        hiddenAbility: null
    };
    gameState.invincibleMode = true;
    gameState.selectedGameMode = 'TUTORIAL';
    gameState.selectedLevel = null;
    gameState.showModeSelection = false;
    gameState.showLevelSelection = false;
    gameState.showWeaponConfig = false;
    gameState.showMechCustomization = false;
    gameState.bossSpawned = false;
    gameState.gameOver = false;
    gameState.victory = false;
    if (typeof game.clearAllGameObjects === 'function') {
        game.clearAllGameObjects();
    } else {
        game.enemies = [];
        game.boss = null;
    }
    game.player = new Player(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2, 'HYBRID');
    gameState.selectedMech = 'HYBRID';
    if (game.player) {
        game.player.isInvincible = true;
        game.player.isDodging = false;
        game.player.vx = 0;
        game.player.vy = 0;
        if (typeof game.resetAllWeaponStates === 'function') {
            game.resetAllWeaponStates();
        }
    }
    game.tutorialDirector = new TutorialDirector(game);
    game.tutorialDirector.start();
}

function tutorialExitToMenu(game) {
    if (!game) return;
    if (game.tutorialDirector) {
        const dir = game.tutorialDirector;
        const cur = dir.currentStep;
        if (cur && typeof cur.onExit === 'function') {
            try { cur.onExit(game, dir); } catch (_) {}
        }
    }
    game.tutorialDirector = null;
    gameState.invincibleMode = true;
    gameState.selectedGameMode = null;
    gameState.bossSpawned = false;
    gameState.showModeSelection = true;
    gameState.manualLockX = null;
    gameState.manualLockY = null;
    if (typeof keys !== 'undefined') { for (const k in keys) keys[k] = false; }
    if (typeof mouse !== 'undefined') { mouse.leftClick = false; mouse.rightClick = false; }
    if (typeof bossFX !== 'undefined') {
        bossFX.particles = [];
        bossFX.flashes = [];
        bossFX.shockwaves = [];
        bossFX.shake = { x: 0, y: 0, until: 0, magnitude: 0, totalMs: 0 };
    }
    if (typeof game.clearAllGameObjects === 'function') {
        game.clearAllGameObjects();
    } else {
        game.enemies = [];
        game.boss = null;
    }
}
