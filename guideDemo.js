// Guide Demo - LIVE sandbox that reuses the real combat update/draw loop.
// -----------------------------------------------------------------------
// Earlier iterations of this module ran a parallel mini-world with its own
// update/draw/proxy. That meant every new weapon / projectile / VFX type
// had to be re-plumbed in two places, and inevitably drifted (missiles
// missing trails, plasma fields not splitting, mines not being laid, etc.).
//
// New approach: when the player opens the field manual we hijack the
// existing `game` instance instead of building a parallel one. The host
// `Game.update()` / `Game.drawWorld()` keep running with their full set
// of weapon / projectile / explosion / FX systems; the only things we
// swap out for the duration of a demo are
//   - game.player           -> a fresh demo Player with the recipe loadout
//   - game.enemies          -> a small set of TrainingDummies
//   - game.boss             -> null
//   - all projectile arrays -> empty
//   - gameState.weaponConfig / lockMode etc. -> demo values
//   - real keyboard / mouse input is suppressed and replaced every frame
//     by the recipe's scripted AI (so the demo Player flies / fires
//     without the real user touching anything)
// On exit we restore everything verbatim so the actual fight continues
// undisturbed.
//
// Because the Game's own update/draw runs the show, every weapon, particle,
// explosion VFX, screen-shake, etc. behaves identically to the live fight
// — there is exactly one renderer.
(function (global) {
    'use strict';

    // Where on the host canvas the sandbox lives. Filled in by draw().
    let _vp = { x: 40, y: 100, w: 1200, h: 540 };

    const _state = {
        active: false,
        recipeId: null,
        recipe: null,
        scriptT: 0,
        lastTickAt: 0,
        // Saved host-game state so clear() can put everything back.
        saved: null,
    };

    function isActive() { return _state.active; }

    function setViewport(x, y, w, h) {
        _vp = { x, y, w, h };
    }

    // ------------------------------------------------------------------
    // Saving / restoring the host Game instance.
    // ------------------------------------------------------------------

    // Every projectile / FX array the host Game touches every frame.
    // Listed once here so save / restore / clear stay in lock-step.
    const ARRAY_KEYS = [
        'enemies', 'bullets', 'missiles', 'bossMissiles', 'beams',
        'mines', 'molotovs', 'crescentBullets', 'bossCiwsBullets',
        'iceClones', 'plasmaFields', 'plasmaMissiles', 'clusterMissiles',
        'decoys', 'subBosses', 'explosions', 'ciwsBullets',
        'spinSlashEffects', 'teleportEffects', 'boomerangHitEffects',
        'chaosBullets', 'starDevourerBullets', 'magnusBullets',
        'magnusShells', 'hivePlasmaBullets', 'hiveSplinters', 'hiveDrones',
        'yukikonBullets', 'yukikonDaggers', 'proteusBullets',
        'laserTurrets', 'damageNumbers', 'triumvirateProjectiles',
        'bossDamageStream',
    ];

    function _saveHostState() {
        if (!global.game) return null;
        const g = global.game;
        const saved = {
            player: g.player,
            boss: g.boss,
            arrays: {},
            // gameState slices we touch
            gs: {
                weaponConfig: { ...gameState.weaponConfig },
                lockMode: gameState.lockMode,
                hardLockTarget: gameState.hardLockTarget,
                manualLockX: gameState.manualLockX,
                manualLockY: gameState.manualLockY,
                gameMode: gameState.gameMode,
                gameOver: gameState.gameOver,
                victory: gameState.victory,
                paused: gameState.paused,
                playerDying: gameState.playerDying,
                bossDying: gameState.bossDying,
                damageFrozen: gameState.damageFrozen,
                playerBlinded: gameState.playerBlinded,
                invincibleMode: gameState.invincibleMode,
            },
            bossFX: null,
        };
        for (const k of ARRAY_KEYS) saved.arrays[k] = g[k];
        if (typeof bossFX !== 'undefined') {
            saved.bossFX = {
                particles: bossFX.particles,
                flashes: bossFX.flashes,
                shockwaves: bossFX.shockwaves,
                shake: bossFX.shake,
            };
        }
        return saved;
    }

    function _installDemoSlate() {
        if (!global.game) return;
        const g = global.game;
        for (const k of ARRAY_KEYS) g[k] = [];
        g.boss = null;
        // Don't keep stale FX from the real fight bleeding into the demo.
        if (typeof bossFX !== 'undefined') {
            bossFX.particles = [];
            bossFX.flashes = [];
            bossFX.shockwaves = [];
            bossFX.shake = { x: 0, y: 0, until: 0, magnitude: 0, totalMs: 0 };
        }
        // Demo never wants death / victory / pause states.
        gameState.gameOver = false;
        gameState.victory = false;
        gameState.paused = false;
        gameState.playerDying = false;
        gameState.bossDying = false;
        gameState.damageFrozen = false;
        gameState.playerBlinded = false;
        gameState.invincibleMode = false;
        gameState.gameMode = 'demo';
        // Soft lock so weapons aim at the nearest dummy without manual aim.
        gameState.lockMode = 'soft';
        gameState.hardLockTarget = null;
        gameState.manualLockX = 0;
        gameState.manualLockY = 0;
    }

    function _restoreHostState(saved) {
        if (!saved || !global.game) return;
        const g = global.game;
        g.player = saved.player;
        g.boss = saved.boss;
        for (const k of ARRAY_KEYS) g[k] = saved.arrays[k];
        // Restore weaponConfig field-by-field so any module that holds a
        // reference to the original object keeps seeing live values.
        if (saved.gs && saved.gs.weaponConfig && gameState.weaponConfig) {
            for (const k of Object.keys(saved.gs.weaponConfig)) {
                gameState.weaponConfig[k] = saved.gs.weaponConfig[k];
            }
        }
        for (const k of Object.keys(saved.gs)) {
            if (k === 'weaponConfig') continue;
            gameState[k] = saved.gs[k];
        }
        if (saved.bossFX && typeof bossFX !== 'undefined') {
            bossFX.particles = saved.bossFX.particles;
            bossFX.flashes = saved.bossFX.flashes;
            bossFX.shockwaves = saved.bossFX.shockwaves;
            bossFX.shake = saved.bossFX.shake;
        }
    }

    // Wipe whatever real keyboard / mouse state the user might have
    // pressed before opening the manual so it doesn't leak into the
    // demo player's first-frame inputs.
    function _suppressRealInput() {
        if (typeof keys !== 'undefined') {
            for (const k in keys) keys[k] = false;
        }
        if (typeof mouse !== 'undefined') {
            mouse.leftClick = false;
            mouse.rightClick = false;
        }
    }

    function _clampToViewport(ent) {
        if (!ent) return;
        const pad = 8;
        const minX = _vp.x + pad;
        const maxX = _vp.x + _vp.w - (ent.width || 0) - pad;
        const minY = _vp.y + pad;
        const maxY = _vp.y + _vp.h - (ent.height || 0) - pad;
        if (ent.x < minX) ent.x = minX;
        if (ent.x > maxX) ent.x = maxX;
        if (ent.y < minY) ent.y = minY;
        if (ent.y > maxY) ent.y = maxY;
    }

    // ------------------------------------------------------------------
    // Demo player / dummy spawn helpers.
    // ------------------------------------------------------------------

    function _applyLoadout(load) {
        if (!load) load = {};
        if (!gameState.weaponConfig) gameState.weaponConfig = {};
        // Reset everything so a previous recipe's weapons don't leak in.
        gameState.weaponConfig.leftHand = null;
        gameState.weaponConfig.rightHand = null;
        gameState.weaponConfig.leftShoulder = null;
        gameState.weaponConfig.rightShoulder = null;
        gameState.weaponConfig.hiddenAbility = null;
        if (load.left) gameState.weaponConfig.leftHand = load.left;
        if (load.right) gameState.weaponConfig.rightHand = load.right;
        if (load.ls) gameState.weaponConfig.leftShoulder = load.ls;
        if (load.rs) gameState.weaponConfig.rightShoulder = load.rs;
        if (load.hidden) gameState.weaponConfig.hiddenAbility = load.hidden;
    }

    function _spawnDemoPlayer() {
        if (typeof Player !== 'function') return null;
        const cx = _vp.x + _vp.w * 0.35;
        const cy = _vp.y + _vp.h * 0.5;
        const mech = gameState.selectedMech ||
            (typeof MECH_TYPES !== 'undefined' && MECH_TYPES.HYBRID ? 'HYBRID' :
                Object.keys(typeof MECH_TYPES !== 'undefined' ? MECH_TYPES : {})[0]);
        const p = new Player(cx - 18, cy - 18, mech);
        // The host Game.update() will tick this player every frame.
        if (typeof p.loadDefaultWeapons === 'function') {
            try { p.loadDefaultWeapons(); } catch (e) {}
        }
        // Heal to full so we start clean.
        p.health = p.maxHealth;
        p.isInvincible = false;
        // Demo-only: clamp any cooldown / reload longer than 5 s down to
        // 5 s so viewers don't have to wait through real-fight downtimes.
        _capLongCooldowns(p);
        return p;
    }

    // Walk every weapon attached to the demo player and squash anything
    // that gates fire frequency at >5 s back down to 5 s. Only touches
    // the demo Player's clones; the underlying classes are untouched.
    function _capLongCooldowns(p) {
        const CAP = 5000;
        const FIELDS = ['cooldown', 'reloadDuration', 'overheatDuration'];
        const seen = new Set();
        const slots = [
            p.leftHandWeapon, p.rightHandWeapon, p.hiddenAbilityWeapon,
            p.leftShoulderWeapon, p.rightShoulderWeapon,
        ];
        for (const wp of slots) {
            if (!wp || seen.has(wp)) continue;
            seen.add(wp);
            for (const f of FIELDS) {
                if (typeof wp[f] === 'number' && wp[f] > CAP) {
                    wp[f] = CAP;
                }
            }
        }
    }

    function _spawnDummies(spec) {
        const list = [];
        if (!spec) return list;
        if (typeof TrainingDummy !== 'function') return list;
        const count = (spec && spec.count) || 1;
        const hp = (spec && spec.hp) || 240;
        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const dx = _vp.x + _vp.w * (0.65 + 0.18 * (t - 0.5));
            const dy = _vp.y + _vp.h * (0.3 + 0.4 * t);
            const d = new TrainingDummy(dx, dy);
            d.maxHealth = hp;
            d.health = hp;
            list.push(d);
        }
        return list;
    }

    // ------------------------------------------------------------------
    // Public: set(recipeId), clear(), tick(), draw()
    // ------------------------------------------------------------------

    function set(recipeId) {
        if (!recipeId || !recipes[recipeId]) {
            clear();
            return false;
        }
        // If there's already a demo running, fully clear before swapping.
        if (_state.active) clear();

        if (!global.game) return false;
        const recipe = recipes[recipeId]();
        if (!recipe) return false;

        _state.saved = _saveHostState();
        _state.recipeId = recipeId;
        _state.recipe = recipe;
        _state.scriptT = 0;
        _state.lastTickAt = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        _suppressRealInput();
        _installDemoSlate();
        _applyLoadout(recipe.loadout);

        const p = _spawnDemoPlayer();
        if (!p) return false;
        global.game.player = p;

        // Position override (boss demos lock the player at a fixed spot).
        if (recipe.playerSpawn) {
            p.x = recipe.playerSpawn.x - p.width * 0.5;
            p.y = recipe.playerSpawn.y - p.height * 0.5;
        }
        if (recipe.playerInvincible) {
            p.isInvincible = true;
        }

        const dummies = _spawnDummies(recipe.dummy);
        for (const d of dummies) global.game.enemies.push(d);

        // Boss recipes use onEnter to spawn a real boss instance into the
        // host game. Anything they push to game.enemies / game.boss is
        // restored via _saveHostState() / _restoreHostState() on exit.
        if (typeof recipe.onEnter === 'function') {
            try { recipe.onEnter(global.game, _vp); }
            catch (e) { console.warn('[GuideDemo] recipe onEnter threw:', e); }
        }

        _state.active = true;
        return true;
    }

    function clear() {
        if (!_state.active) return;
        _suppressRealInput();
        _restoreHostState(_state.saved);
        _state.active = false;
        _state.recipeId = null;
        _state.recipe = null;
        _state.saved = null;
    }

    // Called by gameLoop() BEFORE update(). Runs the recipe's AI which
    // pokes keys/mouse + may directly mutate the demo player's pos.
    function tick() {
        if (!_state.active) return;
        // Hard-suppress keyboard input every frame so the user can't
        // accidentally drive the demo player around with WASD/space etc.
        // Mouse buttons are NOT cleared here because some recipes
        // (e.g. laser_rifle) intentionally pin them high.
        if (typeof keys !== 'undefined') {
            for (const k in keys) keys[k] = false;
        }
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        let dt = now - _state.lastTickAt;
        if (!Number.isFinite(dt) || dt < 0) dt = 16;
        if (dt > 100) dt = 100;
        _state.lastTickAt = now;
        _state.scriptT += dt;

        const g = global.game;
        if (!g || !g.player) return;

        // Demo player must never enter the death cinematic. Pin HP at
        // a single safe floor so takeDamage()'s flash plays but the
        // player can never actually die. We deliberately don't yank HP
        // back up at higher thresholds — recipes that chip the player
        // intentionally (repair, counter) need the bar to visibly dip.
        if (g.player.health <= 1) {
            g.player.health = g.player.maxHealth;
        }
        // If a stray frame slipped into the death sequence anyway, undo it.
        if (gameState.playerDying || gameState.gameOver || gameState.victory ||
            gameState.bossDying) {
            gameState.playerDying = false;
            gameState.gameOver = false;
            gameState.victory = false;
            gameState.bossDying = false;
            gameState.damageFrozen = false;
            // Boss demos pin invincibility on; only clear it for normal
            // recipes that need the bar to dip on hit.
            if (!_state.recipe || !_state.recipe.bossOnly) {
                g.player.isInvincible = false;
            }
            g.player.health = g.player.maxHealth;
        }
        // Keep the player + dummies inside the demo viewport so the action
        // never wanders into the menu chrome above/below.
        _clampToViewport(g.player);
        for (const e of g.enemies) _clampToViewport(e);
        // Repopulate dummies if the player nuked them all.
        if (g.enemies.length === 0 && _state.recipe && _state.recipe.dummy) {
            const more = _spawnDummies(_state.recipe.dummy);
            for (const d of more) g.enemies.push(d);
        }

        // Boss demos: pin the player at a fixed spot, keep them invincible
        // and topped up, and refuse to let the boss die (so the showcase
        // loops indefinitely instead of running into the death cinematic).
        if (_state.recipe && _state.recipe.bossOnly) {
            if (_state.recipe.playerSpawn) {
                g.player.x = _state.recipe.playerSpawn.x - g.player.width * 0.5;
                g.player.y = _state.recipe.playerSpawn.y - g.player.height * 0.5;
            }
            if (_state.recipe.playerInvincible) {
                g.player.isInvincible = true;
                g.player.health = g.player.maxHealth;
            }
            if (g.boss) {
                if (g.boss.health < g.boss.maxHealth * 0.5) {
                    g.boss.health = g.boss.maxHealth;
                }
                g.boss.markedForRemoval = false;
            }
        }

        // Provide the recipe with a 'world' shim that maps to the host
        // game so existing recipe.tick(w) helpers (_chase / _autoFire /
        // dummy-shoot) keep working without a rewrite.
        const w = _worldShim(g);
        try {
            if (typeof _state.recipe.tick === 'function') {
                _state.recipe.tick(w, dt, _state.scriptT);
            }
        } catch (e) {
            console.warn('[GuideDemo] recipe tick threw:', e);
        }
    }

    // Shim that exposes the live game arrays under the names the existing
    // recipe AI expects (player, enemies, bullets, bossMissiles).
    function _worldShim(g) {
        return {
            get player() { return g.player; },
            set player(v) { g.player = v; },
            get enemies() { return g.enemies; },
            get bullets() { return g.bullets; },
            get missiles() { return g.missiles; },
            get bossMissiles() { return g.bossMissiles; },
        };
    }

    // ------------------------------------------------------------------
    // Draw - called from drawGuide() with the panel rectangle.
    // The host Game.drawWorld() does the actual entity rendering; we just
    // draw the frame + clip the world to the demo viewport.
    // ------------------------------------------------------------------

    function draw(ctx, sx, sy, sw, sh) {
        // Track viewport so spawn helpers know where to drop entities.
        _vp = { x: sx, y: sy, w: sw, h: sh };

        // Demo frame.
        ctx.save();
        ctx.fillStyle = 'rgba(8,12,22,0.92)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = 'rgba(120,180,255,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
        ctx.restore();

        if (!_state.active || !global.game) return;

        // Render the live game world clipped to the demo panel.
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();
        try {
            if (typeof bossFX !== 'undefined') bossFX.preDraw(ctx);
            global.game.drawWorld();
            if (typeof bossFX !== 'undefined') bossFX.postDraw(ctx);
        } catch (e) {
            console.warn('[GuideDemo] drawWorld threw:', e);
        }
        ctx.restore();

        // Demo player HP bar overlay.
        _drawDemoHpBar(ctx);
    }

    function _drawDemoHpBar(ctx) {
        const g = global.game;
        if (!g || !g.player) return;
        const p = g.player;
        const w = 80, h = 6;
        const x = p.x + p.width / 2 - w / 2;
        const y = p.y - 14;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        const ratio = Math.max(0, Math.min(1, p.health / Math.max(1, p.maxHealth)));
        ctx.fillStyle = ratio > 0.5 ? '#5cf08e' : ratio > 0.25 ? '#f0c25c' : '#f06a5c';
        ctx.fillRect(x, y, w * ratio, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.restore();
    }

    // ==================================================================
    // Recipe registry
    // ==================================================================

    const recipes = {};

    // ------------------------------------------------------------------
    // Recipe helpers (operate on the world shim above).
    // ------------------------------------------------------------------

    function _chase(w, opts) {
        if (!w || !w.player || !w.enemies || w.enemies.length === 0) return null;
        const target = w.enemies[0];
        const desired = opts.desired || 240;
        const slack = opts.slack || 24;
        let speed = opts.speed || 2;
        // When the recipe wants visual speed-buffs to register, pull the
        // multiplier from the player's own active modifiers (overdrive,
        // repair, etc.) so the AI visibly accelerates the moment the
        // ability fires.
        if (opts.useRealSpeed && w.player) {
            const overdriveMul = w.player.overdriveActive ? 3 : 1;
            const repairMul = w.player.repairProtocolActive ? 1.5 : 1;
            speed *= overdriveMul * repairMul;
        }
        const px = w.player.x + w.player.width / 2;
        const py = w.player.y + w.player.height / 2;
        const tx = target.x + target.width / 2;
        const ty = target.y + target.height / 2;
        const dx = tx - px;
        const dy = ty - py;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const ux = dx / dist;
        const uy = dy / dist;
        if (dist > desired + slack) {
            w.player.x += ux * speed;
            w.player.y += uy * speed;
        } else if (dist < desired - slack) {
            w.player.x -= ux * speed;
            w.player.y -= uy * speed;
        }
        // Aim soft-lock at this dummy so weapons that don't auto-pick a
        // target (manual fire) still face it.
        gameState.manualLockX = tx;
        gameState.manualLockY = ty;
        return { dist, ux, uy, target };
    }

    function _autoFireSlot(slot) {
        return function (w) {
            if (!w || !w.player) return;
            const wp = w.player[slot];
            if (!wp) return;
            if (typeof wp.canUse === 'function' && !wp.canUse()) return;
            if (typeof wp.use !== 'function') return;
            try { wp.use(w.player); } catch (e) {}
        };
    }

    function _dummyShootBullet(w, dummy, speed, damage) {
        if (!w.player || !dummy || typeof Bullet !== 'function') return;
        const px = w.player.x + w.player.width / 2;
        const py = w.player.y + w.player.height / 2;
        const dcx = dummy.x + dummy.width / 2;
        const dcy = dummy.y + dummy.height / 2;
        const dx_ = dcx - px;
        const dy_ = dcy - py;
        const angle = Math.atan2(-dy_, -dx_) * 180 / Math.PI;
        const dist = Math.hypot(dx_, dy_);
        // Spawn outside the dummy's own collision box so gameCore's
        // bullet-vs-enemies sweep doesn't delete the bullet on its very
        // first frame (bullets are friendly and treat every enemy as a
        // hit target — including the launching dummy).
        const dirToPlayer = dist > 0 ? -1 : 1;
        const ux = dist > 0 ? dx_ / dist : 0;
        const uy = dist > 0 ? dy_ / dist : 0;
        const offset = (dummy.width || 30) * 0.5 + 18;
        const sx = dcx + dirToPlayer * ux * offset;
        const sy = dcy + dirToPlayer * uy * offset;
        const b = new Bullet(sx, sy, angle, speed || 5, damage || 4, dist + 80);
        b._fromDummy = true;
        b.color = '#ff7766';
        w.bullets.push(b);
    }

    function _dummyShootMissile(w, dummy) {
        if (!w.player || !dummy || typeof Missile !== 'function') return;
        const px = w.player.x + w.player.width / 2;
        const py = w.player.y + w.player.height / 2;
        const dcx = dummy.x + dummy.width / 2;
        const dcy = dummy.y + dummy.height / 2;
        // Spawn outside the dummy's own collision radius and toward the
        // player, so the missile's impact-check (which treats every
        // game.enemies entry as a kill target — including the launching
        // dummy) doesn't immediately detonate it on the launcher.
        const dx = px - dcx;
        const dy = py - dcy;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const offset = (dummy.width || 30) * 0.5 + 24;
        const sx = dcx + ux * offset;
        const sy = dcy + uy * offset;
        const m = new Missile(sx, sy, px, py, 6, 4.5, 'crimson_king');
        m.isBossMissile = true;
        m.maxLifetime = 4000;
        w.bossMissiles.push(m);
    }

    // ==================================================================
    // Hand weapons
    // ==================================================================

    recipes['weapons:gun'] = function () {
        return {
            loadout: { left: 'gun' },
            dummy: { count: 1, hp: 200, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 260, slack: 28, speed: 2.2 });
                if (r && r.dist <= 360) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:sword'] = function () {
        return {
            loadout: { left: 'sword' },
            dummy: { count: 1, hp: 220, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 360, slack: 40, speed: 1.6 });
                if (!r) return;
                _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:laser_spear'] = function () {
        return {
            loadout: { left: 'laser_spear' },
            dummy: { count: 1, hp: 220, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 340, slack: 36, speed: 1.6 });
                if (!r) return;
                _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:laser_rifle'] = function () {
        return {
            loadout: { left: 'laser_rifle' },
            dummy: { count: 1, hp: 360, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 280, slack: 28, speed: 2.2 });
                // LaserRifle's update() cancels charging when neither
                // mouse button is held. Pin leftClick high so the demo
                // AI can keep charging through the 1s wind-up and fire.
                if (typeof mouse !== 'undefined') mouse.leftClick = true;
                if (r && r.dist <= 380) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:laser_smg'] = function () {
        return {
            loadout: { left: 'laser_smg' },
            dummy: { count: 1, hp: 360, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 220, slack: 24, speed: 2.4 });
                if (typeof mouse !== 'undefined') mouse.leftClick = true;
                if (r && r.dist <= 320) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:cluster_missile'] = function () {
        return {
            loadout: { left: 'cluster_missile' },
            dummy: { count: 1, hp: 240, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 320, slack: 32, speed: 2.0 });
                if (r) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:shotgun'] = function () {
        return {
            loadout: { left: 'shotgun' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 130, slack: 18, speed: 2.6 });
                if (r && r.dist <= 220) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:rocket'] = function () {
        return {
            loadout: { left: 'rocket_launcher' },
            dummy: { count: 1, hp: 260, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 360, slack: 36, speed: 2.0 });
                if (r) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:minigun'] = function () {
        return {
            loadout: { left: 'minigun' },
            dummy: { count: 1, hp: 600, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 240, slack: 26, speed: 2.2 });
                if (r && r.dist <= 360) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    recipes['weapons:flamethrower'] = function () {
        return {
            loadout: { left: 'flamethrower' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            _desiredDist: 110,
            _fireRange: 220,
            _moveSpeed: 2.4,
            tick(w) {
                if (!w.player || !w.enemies[0]) return;
                // Demo-only: pin heat at zero so the flamethrower can be
                // shown firing continuously without ever overheating.
                const wp = w.player.leftHandWeapon;
                if (wp && wp.type === 'flamethrower') {
                    wp.heat = 0;
                    wp.overheated = false;
                }
                const target = w.enemies[0];
                const pcx = w.player.x + w.player.width / 2;
                const pcy = w.player.y + w.player.height / 2;
                const tcx = target.x + target.width / 2;
                const tcy = target.y + target.height / 2;
                const dx = tcx - pcx;
                const dy = tcy - pcy;
                const dist = Math.hypot(dx, dy);
                const ux = dist > 0.0001 ? dx / dist : 0;
                const uy = dist > 0.0001 ? dy / dist : 0;
                const slack = 18;
                if (dist > this._desiredDist + slack) {
                    w.player.x += ux * this._moveSpeed;
                    w.player.y += uy * this._moveSpeed;
                } else if (dist < this._desiredDist - slack) {
                    w.player.x -= ux * this._moveSpeed;
                    w.player.y -= uy * this._moveSpeed;
                }
                gameState.manualLockX = tcx;
                gameState.manualLockY = tcy;
                if (dist <= this._fireRange) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    // ==================================================================
    // Shoulder weapons
    // ==================================================================

    recipes['shoulder:missile'] = function () {
        return {
            loadout: { ls: 'missile_launcher' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 320, slack: 32, speed: 2.0 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:high_track'] = function () {
        return {
            loadout: { ls: 'high_track_missile' },
            dummy: { count: 1, hp: 240, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 360, slack: 36, speed: 1.8 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:cluster_bomb'] = function () {
        return {
            loadout: { ls: 'cluster_bomb_missile' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 360, slack: 36, speed: 2.0 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:mine_layer'] = function () {
        return {
            loadout: { ls: 'mine_layer_missile' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 380, slack: 40, speed: 1.8 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:det_cord'] = function () {
        return {
            loadout: { ls: 'det_cord_missile' },
            dummy: { count: 1, hp: 320, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 360, slack: 36, speed: 1.8 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:laser_turret'] = function () {
        return {
            loadout: { ls: 'laser_turret' },
            dummy: { count: 2, hp: 220, behaviour: 'wander' },
            tick(w) {
                _chase(w, { desired: 240, slack: 30, speed: 1.6 });
                _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:ciws'] = function () {
        return {
            loadout: { ls: 'ciws' },
            dummy: { count: 1, hp: 360, behaviour: 'wander' },
            _nextMissileAt: 700,
            _missileIntervalMs: 1500,
            _trackedMissiles: null,
            tick(w, dt, scriptT) {
                _chase(w, { desired: 320, slack: 30, speed: 1.6 });

                // CIWS-only: keep dummies notTargetable so the cannon
                // ONLY fires when an enemy missile is in flight (instead
                // of constantly stitching the dummy with low-priority
                // tracer fire). Cleared by clear() implicitly because
                // the dummy is destroyed on demo exit.
                for (const e of w.enemies) e.notTargetable = true;
                _autoFireSlot('leftShoulderWeapon')(w);

                const dummy = w.enemies[0];
                if (!dummy) return;
                if (scriptT >= this._nextMissileAt) {
                    _dummyShootMissile(w, dummy);
                    this._nextMissileAt = scriptT + this._missileIntervalMs;
                }

                // Demo-only intercept FX: if a tracked missile vanished
                // this frame and was nowhere near its lifetime cap, treat
                // it as "shot down by CIWS" and pop a flash + burst at
                // its last known position. Doesn't touch live combat.
                const cur = (w.bossMissiles || []).slice();
                if (this._trackedMissiles && typeof bossFX !== 'undefined') {
                    for (const prev of this._trackedMissiles) {
                        if (cur.indexOf(prev.ref) !== -1) continue;
                        const ageMs = Date.now() - prev.ref.startTime;
                        if (ageMs >= prev.ref.maxLifetime - 50) continue;
                        bossFX.addFlash(prev.x, prev.y, 26, '#ffd07a', 260, 0.95);
                        bossFX.addFlash(prev.x, prev.y, 14, '#ffffff', 160, 1);
                        bossFX.spawnBurst(prev.x, prev.y, 14, {
                            color: '#ffb24a',
                            speedMin: 1.5, speedMax: 4.5,
                            sizeMin: 1.2, sizeMax: 2.8,
                            lifeMs: 420,
                            spreadAngle: Math.PI * 2,
                            baseAngle: 0,
                            drag: 0.92
                        });
                        bossFX.spawnBurst(prev.x, prev.y, 8, {
                            color: '#fff2c4',
                            speedMin: 0.6, speedMax: 1.8,
                            sizeMin: 1.0, sizeMax: 1.8,
                            lifeMs: 320,
                            spreadAngle: Math.PI * 2,
                            baseAngle: 0,
                            drag: 0.9
                        });
                    }
                }
                this._trackedMissiles = cur.map(m => ({
                    ref: m, x: m.x, y: m.y
                }));
            },
        };
    };

    recipes['shoulder:plasma'] = function () {
        return {
            loadout: { ls: 'plasma_missile' },
            dummy: { count: 1, hp: 360, behaviour: 'wander' },
            tick(w) {
                const r = _chase(w, { desired: 320, slack: 30, speed: 2.0 });
                if (r) _autoFireSlot('leftShoulderWeapon')(w);
            },
        };
    };

    recipes['shoulder:super'] = function () {
        return {
            loadout: { ls: 'super_weapon', rs: 'super_weapon' },
            dummy: { count: 1, hp: 240, behaviour: 'wander' },
            _nextRebuildAt: 0,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                _chase(w, { desired: 360, slack: 36, speed: 1.8 });
                const wp = w.player.leftShoulderWeapon;
                if (wp && typeof wp.canUse === 'function' && wp.canUse() &&
                    typeof wp.use === 'function') {
                    try { wp.use(w.player); } catch (e) {}
                    this._nextRebuildAt = scriptT + 4000;
                }
                if (this._nextRebuildAt && scriptT >= this._nextRebuildAt) {
                    if (typeof SuperWeapon !== 'undefined') {
                        const sw = new SuperWeapon(true);
                        w.player.leftShoulderWeapon = sw;
                        w.player.rightShoulderWeapon = sw;
                    }
                    this._nextRebuildAt = 0;
                }
            },
        };
    };

    recipes['shoulder:moonlight'] = function () {
        return {
            loadout: { right: 'moonlight_greatsword' },
            dummy: { count: 3, hp: 200, behaviour: 'wander' },
            _nextRebuildAt: 0,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                _chase(w, { desired: 320, slack: 36, speed: 1.5 });
                const wp = w.player.rightHandWeapon;
                if (wp && typeof wp.canUse === 'function' && wp.canUse() &&
                    typeof wp.use === 'function') {
                    try { wp.use(w.player); } catch (e) {}
                    this._nextRebuildAt = scriptT + 3500;
                }
                if (this._nextRebuildAt && scriptT >= this._nextRebuildAt) {
                    if (typeof MoonlightGreatsword !== 'undefined') {
                        const mg = new MoonlightGreatsword();
                        w.player.rightHandWeapon = mg;
                        w.player.leftShoulderWeapon = mg;
                        w.player.rightShoulderWeapon = mg;
                        w.player.hiddenAbilityWeapon = mg;
                    }
                    this._nextRebuildAt = 0;
                }
            },
        };
    };

    // ==================================================================
    // Hidden abilities
    // ==================================================================

    recipes['hidden:pulse_shield'] = function () {
        return {
            loadout: { left: 'gun', hidden: 'pulse_shield' },
            dummy: { count: 1, hp: 220, behaviour: 'static' },
            // Demo cadence: dummy fires a visual bullet on a 1.2s loop;
            // we trigger parry just as the bullet enters point-blank
            // range and manually feed the damage through player.takeDamage
            // so PulseShield.reflectDamage bounces it back. Feels like a
            // perfectly-timed parry every time.
            _shotIntervalMs: 1200,
            _bulletSpeed: 5,
            _nextShotAt: 600,
            _pendingParryAt: null,
            _pendingHitAt: null,
            _pendingBullet: null,
            _shotDamage: 6,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                const dummy = w.enemies[0];
                if (!dummy) return;

                // Demo-only: keep PulseShield off cooldown so timing is
                // never blocked by lingering recovery from a prior cycle.
                const parry = w.player.hiddenAbilityWeapon;
                if (parry && parry.type === 'pulse_shield') {
                    parry.lastUseTime = 0;
                }

                // Fire a fresh visual bullet on cadence.
                if (scriptT >= this._nextShotAt) {
                    const px = w.player.x + w.player.width / 2;
                    const py = w.player.y + w.player.height / 2;
                    const dcx = dummy.x + dummy.width / 2;
                    const dcy = dummy.y + dummy.height / 2;
                    const dist = Math.hypot(dcx - px, dcy - py);
                    _dummyShootBullet(w, dummy, this._bulletSpeed, this._shotDamage);
                    this._pendingBullet = w.bullets[w.bullets.length - 1] || null;
                    // Frames until impact. Bullet moves _bulletSpeed px/frame
                    // at ~60 fps → flightMs = (dist/speed)*1000/60.
                    const flightMs = (dist / this._bulletSpeed) * (1000 / 60);
                    // Open the parry window ~80ms before impact so the
                    // 200ms window is centred on the hit.
                    this._pendingParryAt = scriptT + Math.max(40, flightMs - 80);
                    this._pendingHitAt = scriptT + Math.max(80, flightMs);
                    this._nextShotAt = scriptT + this._shotIntervalMs;
                }

                if (parry && this._pendingParryAt != null && scriptT >= this._pendingParryAt) {
                    if (typeof parry.canUse === 'function' && parry.canUse() &&
                        typeof parry.use === 'function') {
                        try { parry.use(w.player); } catch (e) {}
                    }
                    this._pendingParryAt = null;
                }

                if (this._pendingHitAt != null && scriptT >= this._pendingHitAt) {
                    // Despawn the visual bullet and feed the damage to
                    // the player. PulseShield.reflectDamage will then
                    // bounce it back at the dummy automatically.
                    if (this._pendingBullet) {
                        this._pendingBullet.shouldDestroy = true;
                        this._pendingBullet = null;
                    }
                    try { w.player.takeDamage(this._shotDamage); } catch (e) {}
                    this._pendingHitAt = null;
                }
            },
        };
    };

    recipes['hidden:emp'] = function () {
        return {
            loadout: { hidden: 'emp' },
            dummy: { count: 3, hp: 220, behaviour: 'wander' },
            tick(w) {
                _chase(w, { desired: 200, slack: 30, speed: 1.4 });
                _autoFireSlot('hiddenAbilityWeapon')(w);
            },
        };
    };

    // Counter Strike: scripted demo. counter_mech is one-shot per
    // cooldown but lingers active for 3s — every takeDamage() during
    // that window auto-bounces back. We fire the ability immediately,
    // then within the active window manually feed several hits through
    // player.takeDamage() so the reflect line/flash plays repeatedly.
    recipes['hidden:counter'] = function () {
        return {
            loadout: { hidden: 'counter_mech' },
            dummy: { count: 1, hp: 280, behaviour: 'wander' },
            _phase: 'idle',
            _phaseUntil: 0,
            _nextHitAt: 0,
            _hitDamage: 6,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                _chase(w, { desired: 220, slack: 24, speed: 1.6 });
                const ab = w.player.hiddenAbilityWeapon;
                if (!ab || ab.type !== 'counter_mech') return;
                // Squash any leftover cooldown so the demo loop is tight.
                ab.lastUseTime = 0;

                if (this._phase === 'idle') {
                    if (typeof ab.canUse === 'function' && ab.canUse() &&
                        typeof ab.use === 'function') {
                        try { ab.use(w.player); } catch (e) {}
                        this._phase = 'active';
                        this._phaseUntil = scriptT + (ab.duration || 3000) - 100;
                        this._nextHitAt = scriptT + 250;
                    }
                    return;
                }

                if (this._phase === 'active') {
                    const dummy = w.enemies[0];
                    if (dummy && scriptT >= this._nextHitAt) {
                        // Tracer for visual context, then forced hit.
                        _dummyShootBullet(w, dummy, 6, this._hitDamage);
                        const last = w.bullets[w.bullets.length - 1];
                        try { w.player.takeDamage(this._hitDamage); } catch (e) {}
                        if (last) last.shouldDestroy = true;
                        this._nextHitAt = scriptT + 500;
                    }
                    if (scriptT >= this._phaseUntil) {
                        this._phase = 'cooldown';
                        this._phaseUntil = scriptT + 600;
                    }
                    return;
                }

                if (this._phase === 'cooldown') {
                    if (scriptT >= this._phaseUntil) {
                        this._phase = 'idle';
                    }
                }
            },
        };
    };

    // Decoy Clone: dummy keeps lobbing boss-class missiles at the
    // player. The player drops decoys on cadence; the missiles' own
    // homing logic redirects to decoys (already handled by Missile).
    recipes['hidden:decoy'] = function () {
        return {
            loadout: { hidden: 'decoy_clone' },
            dummy: { count: 1, hp: 280, behaviour: 'wander' },
            _nextMissileAt: 700,
            tick(w, dt, scriptT) {
                _chase(w, { desired: 280, slack: 28, speed: 1.8 });
                const ab = w.player.hiddenAbilityWeapon;
                if (ab && ab.type === 'decoy_clone') ab.lastUseTime = 0;
                _autoFireSlot('hiddenAbilityWeapon')(w);
                const dummy = w.enemies[0];
                if (!dummy) return;
                if (scriptT >= this._nextMissileAt) {
                    _dummyShootMissile(w, dummy);
                    this._nextMissileAt = scriptT + 1100;
                }
            },
        };
    };

    recipes['hidden:overdrive'] = function () {
        return {
            loadout: { left: 'gun', hidden: 'overdrive_burst' },
            dummy: { count: 1, hp: 360, behaviour: 'wander' },
            _orbitT: 0,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                const ab = w.player.hiddenAbilityWeapon;
                if (ab && ab.type === 'overdrive_burst') ab.lastUseTime = 0;
                _autoFireSlot('hiddenAbilityWeapon')(w);

                const target = w.enemies[0];
                if (!target) return;
                const tcx = target.x + target.width / 2;
                const tcy = target.y + target.height / 2;

                // Drive an internal orbit phase whose advance rate is
                // gated by the live overdrive multiplier — so when the
                // ability fires, the figure-eight visibly accelerates
                // without any "chase the moving target" jitter.
                const overdriveMul = w.player.overdriveActive ? 3 : 1;
                const baseRate = 0.0026; // radians per ms at 1x speed
                this._orbitT += baseRate * overdriveMul * (dt || 16);

                const orbitR = 240;
                const t = this._orbitT;
                const px = tcx + Math.cos(t) * orbitR;
                const py = tcy + Math.sin(t * 1.3) * (orbitR * 0.55);
                w.player.x = px - w.player.width / 2;
                w.player.y = py - w.player.height / 2;

                gameState.manualLockX = tcx;
                gameState.manualLockY = tcy;
                const dist = Math.hypot(tcx - px, tcy - py);
                if (dist <= 360) _autoFireSlot('leftHandWeapon')(w);
            },
        };
    };

    // Repair Protocol: scripted demo. Activate on idle, then within the
    // 5s active window let a real-looking dummy bullet travel into the
    // player and chunk a big slice of HP, so the +5/s regen can be seen
    // visibly clawing it back. Two staged hits per cycle.
    recipes['hidden:repair'] = function () {
        return {
            loadout: { hidden: 'repair_protocol' },
            // Static dummy + static player keeps the bullet path predictable
            // so the manual collision below always lands.
            dummy: { count: 1, hp: 220, behaviour: 'static' },
            _phase: 'idle',
            _phaseUntil: 0,
            _hits: null,
            _hitDamage: 6,
            tick(w, dt, scriptT) {
                if (!w.player) return;
                // Aim at the dummy without moving so the player presents
                // a fixed bullet target.
                const dummy = w.enemies[0];
                if (dummy) {
                    gameState.manualLockX = dummy.x + dummy.width / 2;
                    gameState.manualLockY = dummy.y + dummy.height / 2;
                }
                const ab = w.player.hiddenAbilityWeapon;
                if (!ab || ab.type !== 'repair_protocol') return;
                ab.lastUseTime = 0;

                if (this._phase === 'idle') {
                    if (typeof ab.canUse === 'function' && ab.canUse() &&
                        typeof ab.use === 'function') {
                        // Pre-drop HP to ~55% so the regen has obvious room
                        // to climb. Without this, +5/s spills entirely into
                        // the overflow bank (since the player started full)
                        // and the bank then eats every incoming bullet,
                        // making the demo look like the bullets pass right
                        // through without doing anything.
                        w.player.health = Math.max(1,
                            Math.floor(w.player.maxHealth * 0.55));
                        w.player.overflowHp = 0;
                        try { ab.use(w.player); } catch (e) {}
                        this._phase = 'active';
                        this._phaseUntil = scriptT + (ab.duration || 5000) - 200;
                        this._hits = [
                            { fireAt: scriptT + 300, fired: false, bullet: null, hitAt: 0 },
                            { fireAt: scriptT + 1100, fired: false, bullet: null, hitAt: 0 },
                            { fireAt: scriptT + 1900, fired: false, bullet: null, hitAt: 0 },
                            { fireAt: scriptT + 2700, fired: false, bullet: null, hitAt: 0 },
                            { fireAt: scriptT + 3500, fired: false, bullet: null, hitAt: 0 },
                            { fireAt: scriptT + 4300, fired: false, bullet: null, hitAt: 0 },
                        ];
                    }
                    return;
                }

                if (this._phase === 'active') {
                    for (const h of this._hits) {
                        if (!h.fired && dummy && scriptT >= h.fireAt) {
                            // Slow tracer so it's clearly visible mid-flight.
                            _dummyShootBullet(w, dummy, 4, this._hitDamage);
                            h.fired = true;
                            h.bullet = w.bullets[w.bullets.length - 1] || null;
                        }
                        // Hand-rolled collision: friendly bullets normally
                        // never hit the player, so we sweep manually each
                        // frame and pop the bullet on the first overlap.
                        if (h.fired && h.bullet && !h.bullet.shouldDestroy) {
                            const px = w.player.x + w.player.width / 2;
                            const py = w.player.y + w.player.height / 2;
                            const bx = h.bullet.x + h.bullet.width / 2;
                            const by = h.bullet.y + h.bullet.height / 2;
                            const r = (w.player.width + w.player.height) * 0.25 + 4;
                            if (Math.hypot(bx - px, by - py) < r) {
                                h.bullet.shouldDestroy = true;
                                try { w.player.takeDamage(this._hitDamage); } catch (e) {}
                                h.bullet = null;
                            } else if (h.bullet.shouldDestroy) {
                                // Bullet hit max range and self-destructed
                                // before reaching the player; still count
                                // it so the demo cadence stays on rhythm.
                                try { w.player.takeDamage(this._hitDamage); } catch (e) {}
                                h.bullet = null;
                            }
                        }
                    }
                    if (scriptT >= this._phaseUntil) {
                        this._phase = 'cooldown';
                        this._phaseUntil = scriptT + 1200;
                    }
                    return;
                }

                if (this._phase === 'cooldown') {
                    if (scriptT >= this._phaseUntil) {
                        this._phase = 'idle';
                    }
                }
            },
        };
    };

    recipes['hidden:godmode'] = function () {
        return {
            loadout: { hidden: 'god_mode' },
            dummy: { count: 4, hp: 200, behaviour: 'wander' },
            tick(w) {
                _chase(w, { desired: 200, slack: 30, speed: 1.4 });
                _autoFireSlot('hiddenAbilityWeapon')(w);
            },
        };
    };

    // ==================================================================
    // Boss demos
    // ------------------------------------------------------------------
    // Each recipe spawns a real boss instance into the host game so the
    // showcase uses the exact same AI / VFX / projectile pipeline the
    // real fight does. The demo player stands still in the bottom-left
    // of the panel as a punching bag — invincible, topped up every
    // frame, and weaponless so the boss never gets shot. The boss is
    // also pinned to full HP whenever it dips below 50% so the demo
    // loops indefinitely instead of dying out.
    // ==================================================================

    function _bossRecipe(BossCtor, opts) {
        opts = opts || {};
        return function () {
            return {
                bossOnly: true,
                loadout: {},
                dummy: null,
                playerInvincible: true,
                // Player parks bottom-left so the boss has the rest of the
                // panel to play in.
                playerSpawn: null, // resolved in onEnter once viewport known
                onEnter(g, vp) {
                    // Player parks in the lower-left so the boss has the
                    // upper portion of the panel for its moves; sits at
                    // ~65% height so the on-head HP bar isn't buried in
                    // the bottom chrome of the demo frame.
                    const px = vp.x + vp.w * 0.22;
                    const py = vp.y + vp.h * 0.5;
                    this.playerSpawn = { x: px, y: py };
                    if (g.player) {
                        g.player.x = px - g.player.width * 0.5;
                        g.player.y = py - g.player.height * 0.5;
                        g.player.isInvincible = true;
                        g.player.health = g.player.maxHealth;
                    }
                    // Boss position: centered upper half of the viewport.
                    const bx = opts.bossX != null ? opts.bossX : (vp.x + vp.w * 0.6);
                    const by = opts.bossY != null ? opts.bossY : (vp.y + vp.h * 0.4);
                    try {
                        g.boss = new BossCtor(bx, by);
                    } catch (e) {
                        console.warn('[GuideDemo] boss spawn threw:', e);
                        return;
                    }
                    // Triumvirate keeps members internally but the player
                    // weapons would normally need them in game.enemies for
                    // targeting. The demo player has no weapons so we skip
                    // pushing them — kept here as a note in case that
                    // changes later.
                    if (typeof opts.afterSpawn === 'function') {
                        try { opts.afterSpawn(g.boss, g, vp); } catch (e) {}
                    }
                },
                tick(w) {
                    // The host Game.update() ticks game.boss for us. We
                    // only need to make sure the punching-bag player keeps
                    // soft-locking onto the boss so any stray crosshair
                    // visuals point the right way.
                    if (typeof gameState !== 'undefined') {
                        gameState.lockMode = 'soft';
                    }
                },
            };
        };
    }

    if (typeof Boss === 'function') {
        recipes['boss:CRIMSON_KING'] = _bossRecipe(Boss);
    }
    if (typeof SublimeMoon === 'function') {
        recipes['boss:SUBLIME_MOON'] = _bossRecipe(SublimeMoon);
    }
    if (typeof StarDevourer === 'function') {
        recipes['boss:STAR_DEVOURER'] = _bossRecipe(StarDevourer);
    }
    if (typeof UglyEmperor === 'function') {
        recipes['boss:UGLY_EMPEROR'] = _bossRecipe(UglyEmperor);
    }
    if (typeof Magnus === 'function') {
        recipes['boss:MAGNUS_EXEC'] = _bossRecipe(Magnus);
    }
    if (typeof HiveMind === 'function') {
        recipes['boss:HIVE_MIND'] = _bossRecipe(HiveMind);
    }
    if (typeof Yukikon === 'function') {
        recipes['boss:YUKIKON'] = _bossRecipe(Yukikon);
    }
    if (typeof Proteus === 'function') {
        recipes['boss:PROTEUS'] = _bossRecipe(Proteus);
    }
    if (typeof Triumvirate === 'function') {
        recipes['boss:TRIUMVIRATE'] = _bossRecipe(Triumvirate);
    }

    // ==================================================================
    // Public surface
    // ==================================================================

    global.GuideDemo = {
        set,
        clear,
        isActive,
        setViewport,
        tick,
        draw,
        recipes,
        _state,
    };
})(typeof window !== 'undefined' ? window : globalThis);
