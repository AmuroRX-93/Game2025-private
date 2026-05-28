// 游戏主类
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.player = null;
        this.clearAllGameObjects();
        
        this.init();
    }

    getWeaponOptions() {
        const weaponOptions = [
            { type: 'gun', name: t('weapon.gun'), color: '#4169E1', desc: t('weaponDesc.gun') },
            { type: 'sword', name: t('weapon.sword'), color: '#ff6b6b', desc: t('weaponDesc.sword') },
            { type: 'laser_spear', name: t('weapon.laser_spear'), color: '#00FFFF', desc: t('weaponDesc.laser_spear') },
            { type: 'cluster_missile', name: t('weapon.cluster_missile'), color: '#FFD700', desc: t('weaponDesc.cluster_missile') },
            { type: 'laser_rifle', name: t('weapon.laser_rifle'), color: '#FF4444', desc: t('weaponDesc.laser_rifle') },
            { type: 'shotgun', name: t('weapon.shotgun'), color: '#ff9040', desc: t('weaponDesc.shotgun') },
            { type: 'rocket_launcher', name: t('weapon.rocket_launcher'), color: '#ff7030', desc: t('weaponDesc.rocket_launcher') },
            { type: 'minigun', name: t('weapon.minigun'), color: '#d4a040', desc: t('weaponDesc.minigun') }
        ];
        const shoulderWeaponOptions = [
            { type: 'missile_launcher', name: t('weapon.missile_launcher'), color: '#FFD700', desc: t('weaponDesc.missile_launcher') },
            { type: 'high_track_missile', name: t('weapon.high_track_missile'), color: '#FF8030', desc: t('weaponDesc.high_track_missile') },
            { type: 'cluster_bomb_missile', name: t('weapon.cluster_bomb_missile'), color: '#FFA040', desc: t('weaponDesc.cluster_bomb_missile') },
            { type: 'mine_layer_missile', name: t('weapon.mine_layer_missile'), color: '#FF6040', desc: t('weaponDesc.mine_layer_missile') },
            { type: 'ciws', name: t('weapon.ciws'), color: '#00FF88', desc: t('weaponDesc.ciws') },
            { type: 'plasma_missile', name: t('weapon.plasma_missile'), color: '#00FFCC', desc: t('weaponDesc.plasma_missile') },
            { type: 'super_weapon', name: t('weapon.super_weapon'), color: '#FF0000', desc: t('weaponDesc.super_weapon') },
            { type: 'moonlight_greatsword', name: t('weapon.moonlight_greatsword'), color: '#88CCFF', desc: t('weaponDesc.moonlight_greatsword') }
        ];
        const hiddenAbilityOptions = [
            { type: 'pulse_shield', name: t('weapon.pulse_shield'), color: '#00FFFF', desc: t('weaponDesc.pulse_shield') },
            { type: 'emp', name: t('weapon.emp'), color: '#66CCFF', desc: t('weaponDesc.emp') },
            { type: 'counter_mech', name: t('weapon.counter_mech'), color: '#FF8C00', desc: t('weaponDesc.counter_mech') },
            { type: 'decoy_clone', name: t('weapon.decoy_clone'), color: '#4488FF', desc: t('weaponDesc.decoy_clone') },
            { type: 'overdrive_burst', name: t('weapon.overdrive_burst'), color: '#FF2030', desc: t('weaponDesc.overdrive_burst') },
            { type: 'repair_protocol', name: t('weapon.repair_protocol'), color: '#60FF90', desc: t('weaponDesc.repair_protocol') },
            { type: 'moonlight_greatsword', name: t('weapon.moonlight_greatsword'), color: '#88CCFF', desc: t('weaponDesc.moonlight_greatsword') },
            { type: 'god_mode', name: t('weapon.god_mode'), color: '#FFD700', desc: t('weaponDesc.god_mode') }
        ];
        return { weaponOptions, shoulderWeaponOptions, hiddenAbilityOptions };
    }

    applyWeaponSlotLinkage(slotKey, newWeaponType) {
        const mgSlots = ['rightHand', 'leftShoulder', 'rightShoulder', 'hiddenAbility'];
        if (newWeaponType === 'moonlight_greatsword') {
            mgSlots.forEach(k => { gameState.weaponConfig[k] = 'moonlight_greatsword'; });
        } else {
            const wasMG = mgSlots.some(k => gameState.weaponConfig[k] === 'moonlight_greatsword');
            if (wasMG && mgSlots.includes(slotKey)) {
                mgSlots.forEach(k => { if (gameState.weaponConfig[k] === 'moonlight_greatsword') gameState.weaponConfig[k] = null; });
                gameState.weaponConfig[slotKey] = newWeaponType;
            } else if (slotKey === 'leftShoulder' || slotKey === 'rightShoulder') {
                if (newWeaponType === 'super_weapon') {
                    gameState.weaponConfig.leftShoulder = 'super_weapon';
                    gameState.weaponConfig.rightShoulder = 'super_weapon';
                } else {
                    const otherSlotKey = slotKey === 'leftShoulder' ? 'rightShoulder' : 'leftShoulder';
                    if (gameState.weaponConfig[otherSlotKey] === 'super_weapon') {
                        gameState.weaponConfig.leftShoulder = newWeaponType;
                        gameState.weaponConfig.rightShoulder = newWeaponType;
                    } else {
                        gameState.weaponConfig[slotKey] = newWeaponType;
                    }
                }
            } else {
                gameState.weaponConfig[slotKey] = newWeaponType;
            }
        }
    }

    resetAllWeaponStates() {
        if (!this.player) return;
        const weapons = this.player.getAllWeapons();
        weapons.forEach(weapon => {
            if (weapon.type === 'sword') {
                weapon.isDashing = false;
                weapon.dashTarget = null;
                weapon.isAttacking = false;
                weapon.slashes = [];
            }
            if (weapon.type === 'laser_spear') {
                weapon.isCharging = false;
                weapon.impaledEnemies.clear();
            }
            if (weapon.type === 'missile_launcher' || weapon.type === 'plasma_missile') {
                weapon.isLaunching = false;
                weapon.missilesFired = 0;
            }
            if (weapon.type === 'decoy_clone') {
                weapon.isStealthActive = false;
            }
            if (weapon.type === 'moonlight_greatsword') {
                weapon.isUsed = false;
                weapon.isAttacking = false;
                weapon.slashes = [];
            }
        });
    }

    clearAllGameObjects() {
        this.enemies = [];
        this.bullets = [];
        this.missiles = [];
        this.bossMissiles = [];
        this.explosions = [];
        this.spinSlashEffects = [];
        this.teleportEffects = [];
        this.boomerangHitEffects = [];
        this.crescentBullets = [];
        this.bossCiwsBullets = [];
        this.iceClones = [];
        this.mines = [];
        this.molotovs = [];
        this.chaosBullets = [];
        this.starDevourerBullets = [];
        this.magnusBullets = [];
        this.magnusShells = [];
        this.hivePlasmaBullets = [];
        this.hiveSplinters = [];
        this.hiveDrones = [];
        this.yukikonBullets = [];
        this.yukikonDaggers = [];
        this.proteusBullets = [];
        this.ciwsBullets = [];
        this.plasmaMissiles = [];
        this.plasmaFields = [];
        this.clusterMissiles = [];
        this.decoys = [];
        this.damageNumbers = [];
        // Triumvirate ground hazards & active projectiles (Blackhole Cannon,
        // FrostBolt, HeatLance, LightningStrike, IronSpike, scorched earth,
        // storm zones, frost tombs, etc.). MUST be cleared between runs —
        // otherwise leftover blackholes from a previous Triumvirate fight
        // will still be in flight when the player re-enters the level.
        this.triumvirateProjectiles = [];
        this.boss = null;
        // Unified boss damage stream: every hitIndicator added by any
        // boss / sub-boss this frame gets siphoned here and rendered as
        // a single high-visibility readout under the top boss HP bar.
        // Each entry: { dmg, startTime, lifeMs, side, lane }.
        this.bossDamageStream = [];
        this._bossDamageStreamLaneCursor = 0;
    }

    init() {
        // Load persistent settings before the first frame so menus
        // render with the saved values from the start.
        try {
            const savedName = localStorage.getItem('mechName');
            if (savedName && typeof savedName === 'string' && savedName.trim().length > 0) {
                gameState.mechName = savedName.slice(0, 24);
            }
        } catch (_) { /* localStorage may be unavailable in private mode */ }
        // 等待用户选择游戏模式，不预生成敌人
        this.gameLoop();
    }

    // 普通敌人和精英敌人生成方法已删除（纯Boss战模式）
    
    spawnBoss() {
        if (!gameState.bossSpawned) {
            // 在屏幕边缘随机生成，远离玩家中心位置
            const spawnPositions = [
                { x: 50, y: 50 },                                    // 左上角
                { x: GAME_CONFIG.WIDTH - 100, y: 50 },               // 右上角
                { x: 50, y: GAME_CONFIG.HEIGHT - 100 },              // 左下角
                { x: GAME_CONFIG.WIDTH - 100, y: GAME_CONFIG.HEIGHT - 100 } // 右下角
            ];
            const randomPos = spawnPositions[Math.floor(Math.random() * spawnPositions.length)];
            this.boss = new Boss(randomPos.x, randomPos.y);
            gameState.bossSpawned = true;
        }
    }
    
    spawnBossForLevel(levelId) {
        if (!gameState.bossSpawned) {
            const level = BOSS_LEVELS[levelId];
            if (level) {
                // 清除上一场残留的投射物
                this.clearAllGameObjects();
                
                // 在屏幕边缘随机生成，远离玩家中心位置
                const spawnPositions = [
                    { x: 50, y: 50 },                                    // 左上角
                    { x: GAME_CONFIG.WIDTH - 100, y: 50 },               // 右上角
                    { x: 50, y: GAME_CONFIG.HEIGHT - 100 },              // 左下角
                    { x: GAME_CONFIG.WIDTH - 100, y: GAME_CONFIG.HEIGHT - 100 } // 右下角
                ];
                const randomPos = spawnPositions[Math.floor(Math.random() * spawnPositions.length)];
                
                // 根据关卡配置创建相应的Boss
                switch (level.bossClass) {
                    case 'Boss':
                        this.boss = new Boss(randomPos.x, randomPos.y);
                        break;
                    case 'SublimeMoon':
                        this.boss = new SublimeMoon(randomPos.x, randomPos.y);
                        break;
                    case 'StarDevourer':
                        this.boss = new StarDevourer(randomPos.x, randomPos.y);
                        break;
                    case 'UglyEmperor':
                        this.boss = new UglyEmperor(randomPos.x, randomPos.y);
                        break;
                    case 'Magnus':
                        this.boss = new Magnus(randomPos.x, randomPos.y);
                        break;
                    case 'HiveMind':
                        this.boss = new HiveMind(randomPos.x, randomPos.y);
                        break;
                    case 'Yukikon':
                        this.boss = new Yukikon(randomPos.x, randomPos.y);
                        break;
                    case 'Proteus':
                        this.boss = new Proteus(randomPos.x, randomPos.y);
                        break;
                    case 'Triumvirate':
                        this.boss = new Triumvirate(randomPos.x, randomPos.y);
                        // Push members into the enemies array so player
                        // weapons can target them via the standard pipeline.
                        for (const m of this.boss.members) this.enemies.push(m);
                        break;
                    default:
                        console.warn(`未知的Boss类型: ${level.bossClass}`);
                        this.boss = new Boss(randomPos.x, randomPos.y); // 默认使用血红之王
                        break;
                }
                
                // 可以根据关卡设置Boss的特殊属性
                if (level.difficulty > 1) {
                    // 未来可以在这里调整Boss的难度属性
                }
                
            gameState.bossSpawned = true;
            }
        }
    }

    // ===== Training Ground =====
    // We keep TARGET_COUNT dummies alive at all times. When one
    // dies it's removed by the regular enemy update loop, and a
    // short-delayed timer (handled in update()) walks the count
    // back up so the player always has something to shoot.
    get _trainingTargetCount() { return 5; }
    get _trainingRespawnDelay() { return 250; } // ms after a death

    spawnTrainingDummies() {
        this.enemies = this.enemies.filter(e => !(e && e.isTrainingDummy));
        for (let i = 0; i < this._trainingTargetCount; i++) {
            this.enemies.push(this._makeTrainingDummy());
        }
        this._trainingNextRespawnAt = 0;
    }

    _makeTrainingDummy() {
        const margin = 80;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        // Avoid spawning on top of the player.
        let x, y, tries = 0;
        do {
            x = margin + Math.random() * (W - margin * 2);
            y = margin + Math.random() * (H - margin * 2);
            tries++;
            if (!this.player) break;
            const dx = x - (this.player.x + this.player.width / 2);
            const dy = y - (this.player.y + this.player.height / 2);
            if (dx * dx + dy * dy >= 220 * 220) break;
        } while (tries < 8);
        return new TrainingDummy(x, y);
    }

    _maintainTrainingDummies() {
        if (gameState.selectedGameMode !== 'TRAINING') return;
        const live = this.enemies.filter(e => e && e.isTrainingDummy).length;
        const need = this._trainingTargetCount - live;
        if (need <= 0) {
            this._trainingNextRespawnAt = 0;
            return;
        }
        const now = Date.now();
        if (!this._trainingNextRespawnAt) {
            this._trainingNextRespawnAt = now + this._trainingRespawnDelay;
            return;
        }
        if (now >= this._trainingNextRespawnAt) {
            // Respawn one dummy per tick until we hit the cap; the
            // gentle stagger keeps replacements from popping in as
            // a single cluster.
            this.enemies.push(this._makeTrainingDummy());
            this._trainingNextRespawnAt = now + this._trainingRespawnDelay;
        }
    }
    
    selectGameMode(gameMode) {
        gameState.selectedGameMode = gameMode;
        gameState.showModeSelection = false;

        if (gameMode === 'TRAINING') {
            // Training Ground has no level select — go straight to
            // weapon config so the pilot can pick a loadout.
            gameState.selectedLevel = null;
            gameState.showLevelSelection = false;
            gameState.showWeaponConfig = true;
            this.enemies = [];
            this.boss = null;
            gameState.bossSpawned = false;
            updateUI();
            return;
        }

        gameState.showLevelSelection = true;
        gameState.levelScrollOffset = 0;

        updateUI();
    }
    
    selectLevel(levelId) {
        gameState.selectedLevel = levelId;
        gameState.showLevelSelection = false;
        gameState.showWeaponConfig = true;
        
        // Boss战模式：清空所有普通敌人，准备生成选定的Boss
            this.enemies = [];
            this.boss = null;
            gameState.bossSpawned = false;
        
        updateUI();
    }
    
    selectWeaponConfig() {
        gameState.showWeaponConfig = false;
        gameState.selectedMech = 'HYBRID';
        this.player = new Player(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2, 'HYBRID');
        
        // 确保玩家状态完全重置
        if (this.player) {
            this.player.isDodging = false;    // 确保闪避状态为 false
            this.player.vx = 0;               // 重置水平速度
            this.player.vy = 0;               // 重置垂直速度
            
            this.resetAllWeaponStates();
        }
        
        // 如果是Boss战模式，根据选中的关卡生成Boss
        if (gameState.selectedGameMode === 'BOSS_BATTLE' && gameState.selectedLevel) {
            this.spawnBossForLevel(gameState.selectedLevel);
        }

        // 训练场模式：生成初始假人靶
        if (gameState.selectedGameMode === 'TRAINING') {
            this.spawnTrainingDummies();
        }
        
        // 清除所有键盘状态，确保游戏开始时角色不会不由自主移动
        for (let key in keys) {
            keys[key] = false;
        }
        
        // 清除鼠标状态
        mouse.leftClick = false;
        mouse.rightClick = false;
        
        // Default to hard lock so a fresh run starts with the boss/enemy
        // already locked. Players can cycle to soft/manual via the toggle.
        gameState.lockMode = 'hard';
        gameState.hardLockTarget = null;
        
        // 隐藏点击提示
        const clickHint = document.querySelector('.click-hint');
        if (clickHint) {
            clickHint.style.display = 'none';
        }
        
        updateUI();
    }
    
    backToModeSelection() {
        gameState.showWeaponConfig = false;
        gameState.showLevelSelection = false;
        gameState.showModeSelection = true;
        gameState.selectedGameMode = null;
        gameState.selectedLevel = null;
        
        // 清除键盘状态，防止在界面切换时保留按键状态
        for (let key in keys) {
            keys[key] = false;
        }
        
        // 清除鼠标状态
        mouse.leftClick = false;
        mouse.rightClick = false;
        
        updateUI();
    }
    
    backToWeaponConfig() {
        // 不再需要机甲选择，这个方法保留但不执行任何操作
        updateUI();
    }
    
    showMechCustomization() {
        // 进入机甲定制界面
        gameState.showModeSelection = false;
        gameState.showMechCustomization = true;
    }

    showVictoryAndReturnToMenu() {
        gameState.victory = true;
        gameState.victoryBossLevel = gameState.selectedLevel;
        gameState.victoryBossName = gameState.selectedLevel ? t('boss.' + gameState.selectedLevel) : t('boss.unknown');
        
        if (this._victoryTimer) clearTimeout(this._victoryTimer);
        this._victoryTimer = setTimeout(() => {
            this._victoryTimer = null;
            if (gameState.victory) {
                this.backToMainMenu();
            }
        }, 5000);
    }

    _tickDeathSpectacle() {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const dur = gameState.deathSpectacleMs || 2200;

        // Pick the active spectacle (boss death takes priority if both flagged).
        let cx, cy, startedAt;
        if (gameState.bossDying) {
            cx = gameState.bossDyingX;
            cy = gameState.bossDyingY;
            startedAt = gameState.bossDyingAt;
        } else {
            cx = gameState.playerDyingX;
            cy = gameState.playerDyingY;
            startedAt = gameState.playerDyingAt;
        }
        const elapsed = now - startedAt;
        const t = Math.max(0, Math.min(1, elapsed / dur));

        // Lock invulnerability for the whole spectacle.
        if (this.player) this.player.isInvincible = true;

        if (typeof bossFX !== 'undefined') {
            const FIRE_PALETTE  = ['#fff2b8', '#ffd35a', '#ff9030', '#ff5028', '#ff7030'];
            const SMOKE_PALETTE = ['#5a4738', '#3a2e26', '#2a201a', '#6a5043'];
            const EMBER_COLOR   = '#ffd070';

            // Phase definition driven entirely by `t`.
            //   t < 0.18 : ramp-in     — small pops growing in size
            //   t < 0.65 : inferno     — dense overlapping fireballs
            //   t == 0.65: climax      — one giant flash + one ring + heavy debris
            //   t < 0.92 : aftermath   — billowing smoke + falling embers, no fire
            //   t >= 0.92: settle      — no new spawns, let what's there fade
            const phase =
                t < 0.18 ? 'rampIn' :
                t < 0.65 ? 'inferno' :
                t < 0.92 ? 'aftermath' : 'settle';

            // Climax kicks exactly once when crossing 0.65.
            if (!gameState._deathClimaxFired && t >= 0.65) {
                gameState._deathClimaxFired = true;
                // One white-hot core flash, layered with a warm halo.
                bossFX.addFlash(cx, cy, 620, '#ffffff', 600, 1.0);
                bossFX.addFlash(cx, cy, 460, '#ffe7a8', 720, 0.9);
                bossFX.addFlash(cx, cy, 320, '#ff9030', 820, 0.8);
                // Single dominant shockwave (the only big ring of the show).
                bossFX.addShockwave(cx, cy, 50, 820, '#ffd070', 1000, 8, 0.85);
                // Heavy chunk debris, mostly outward.
                bossFX.spawnBurst(cx, cy, 80, {
                    color: '#ffd6a0',
                    speedMin: 5, speedMax: 17,
                    sizeMin: 3, sizeMax: 8,
                    lifeMs: 1300,
                    gravity: 0.06,
                    drag: 0.96,
                });
                // Bright sparks that linger.
                bossFX.spawnBurst(cx, cy, 50, {
                    color: '#fff8d0',
                    speedMin: 7, speedMax: 22,
                    sizeMin: 1.5, sizeMax: 3,
                    lifeMs: 1100,
                    gravity: 0.08,
                    drag: 0.97,
                });
                // First wave of rising smoke columns.
                for (let i = 0; i < 14; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const r = Math.random() * 90;
                    bossFX.spawnBurst(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 4, {
                        color: SMOKE_PALETTE[(Math.random() * SMOKE_PALETTE.length) | 0],
                        speedMin: 0.4, speedMax: 1.6,
                        sizeMin: 12, sizeMax: 22,
                        lifeMs: 1500 + Math.random() * 400,
                        gravity: -0.05,
                        drag: 0.97,
                    });
                }
                bossFX.addShake(38, 600);
            }

            // Per-frame spawning by phase. Throttle to ~50ms for inferno/rampIn,
            // a bit slower for aftermath so smoke breathes.
            const last = gameState._deathLastBurstAt || 0;
            const interval = (phase === 'aftermath') ? 90 : 55;
            if (phase !== 'settle' && now - last >= interval) {
                gameState._deathLastBurstAt = now;

                if (phase === 'rampIn') {
                    // Ease-in scale: tiny fast pops, growing.
                    const k = t / 0.18; // 0 → 1
                    const popCount = 1 + Math.floor(k * 2);
                    for (let i = 0; i < popCount; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const rad = 10 + Math.random() * (60 + k * 80);
                        const ex = cx + Math.cos(ang) * rad;
                        const ey = cy + Math.sin(ang) * rad;
                        const col = FIRE_PALETTE[(Math.random() * FIRE_PALETTE.length) | 0];
                        const flashR = 30 + k * 90 + Math.random() * 40;
                        bossFX.addFlash(ex, ey, flashR, col, 360 + Math.random() * 160, 0.85);
                        bossFX.spawnBurst(ex, ey, 6 + ((Math.random() * 6) | 0), {
                            color: EMBER_COLOR,
                            speedMin: 1.5, speedMax: 5.5,
                            sizeMin: 1.5, sizeMax: 3,
                            lifeMs: 600 + Math.random() * 300,
                            gravity: 0.05,
                            drag: 0.96,
                        });
                    }
                    bossFX.addShake(8 + k * 10, 160);
                } else if (phase === 'inferno') {
                    // Overlapping radial-gradient fireballs make the volumetric
                    // explosion mass — no shockwave rings here on purpose.
                    const fireballs = 4 + ((Math.random() * 3) | 0);
                    for (let i = 0; i < fireballs; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const rad = Math.random() * 180;
                        const ex = cx + Math.cos(ang) * rad;
                        const ey = cy + Math.sin(ang) * rad;
                        const col = FIRE_PALETTE[(Math.random() * FIRE_PALETTE.length) | 0];
                        const flashR = 70 + Math.random() * 130;
                        bossFX.addFlash(ex, ey, flashR, col, 520 + Math.random() * 280, 0.9);
                        // A second tighter bright core makes it look hot, not flat.
                        bossFX.addFlash(ex, ey, flashR * 0.45, '#fff8d0',
                                        260 + Math.random() * 160, 0.95);
                        // Chunky debris (using particles as small fireballs).
                        bossFX.spawnBurst(ex, ey, 10 + ((Math.random() * 10) | 0), {
                            color: col,
                            speedMin: 2, speedMax: 7.5,
                            sizeMin: 3, sizeMax: 6,
                            lifeMs: 700 + Math.random() * 400,
                            gravity: 0.04,
                            drag: 0.95,
                        });
                        // Sparks.
                        bossFX.spawnBurst(ex, ey, 6, {
                            color: EMBER_COLOR,
                            speedMin: 4, speedMax: 11,
                            sizeMin: 1, sizeMax: 2.2,
                            lifeMs: 500 + Math.random() * 300,
                            gravity: 0.06,
                            drag: 0.97,
                        });
                    }
                    // Persistent core fireball at the middle.
                    bossFX.addFlash(cx, cy, 180 + Math.random() * 60, '#ffd070', 380, 0.85);
                    bossFX.addFlash(cx, cy, 90, '#ffffff', 220, 0.9);
                    // Subtle building smoke beneath the fire.
                    bossFX.spawnBurst(cx, cy, 5, {
                        color: SMOKE_PALETTE[(Math.random() * SMOKE_PALETTE.length) | 0],
                        speedMin: 0.4, speedMax: 1.4,
                        sizeMin: 10, sizeMax: 18,
                        lifeMs: 1300 + Math.random() * 400,
                        gravity: -0.04,
                        drag: 0.97,
                    });
                    bossFX.addShake(14, 180);
                } else if (phase === 'aftermath') {
                    // Smoke + slow embers only — let the climax breathe out.
                    for (let i = 0; i < 3; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const rad = Math.random() * 200;
                        const ex = cx + Math.cos(ang) * rad;
                        const ey = cy + Math.sin(ang) * rad;
                        bossFX.spawnBurst(ex, ey, 5, {
                            color: SMOKE_PALETTE[(Math.random() * SMOKE_PALETTE.length) | 0],
                            speedMin: 0.3, speedMax: 1.3,
                            sizeMin: 14, sizeMax: 24,
                            lifeMs: 1500 + Math.random() * 500,
                            gravity: -0.05,
                            drag: 0.98,
                        });
                    }
                    // Drifting embers settling out of the smoke column.
                    bossFX.spawnBurst(cx, cy - 30, 3, {
                        color: EMBER_COLOR,
                        speedMin: 0.5, speedMax: 2.2,
                        sizeMin: 1.2, sizeMax: 2.6,
                        lifeMs: 1100,
                        gravity: 0.04,
                        drag: 0.97,
                    });
                }
            }
        }

        // Finalize the spectacle once the timer expires.
        if (elapsed >= dur) {
            if (gameState.bossDying) {
                gameState.bossDying = false;
                gameState._deathClimaxFired = false;
                if (gameState.selectedGameMode === 'BOSS_BATTLE') {
                    gameState.bossSpawned = false;
                    this.showVictoryAndReturnToMenu();
                }
            } else if (gameState.playerDying) {
                gameState.playerDying = false;
                gameState._deathClimaxFired = false;
                gameState.gameOver = true;
            }
        }
    }

    backToMainMenu() {
        if (this._victoryTimer) {
            clearTimeout(this._victoryTimer);
            this._victoryTimer = null;
        }
        gameState.gameOver = false;
        gameState.paused = false;
        gameState.playerDying = false;
        gameState.bossDying = false;
        gameState._deathClimaxFired = false;
        gameState._deathLastBurstAt = 0;
        gameState.damageFrozen = false;
        gameState.showModeSelection = true;
        gameState.showLevelSelection = false;
        gameState.showWeaponConfig = false;
        gameState.showMechCustomization = false;
        gameState.showGuide = false;
        gameState.guideCategory = null;
        gameState.guideSubItem = null;
        gameState.guideScrollOffset = 0;
        gameState.showSettings = false;
        if (this._settingsInputEl) {
            this._settingsInputEl.style.display = 'none';
            try { this._settingsInputEl.blur(); } catch (_) {}
        }
        gameState.selectedMech = null;
        gameState.selectedGameMode = null;
        gameState.selectedLevel = null;
        gameState.bossSpawned = false;
        gameState.bossKillCount = 0;
        gameState.score = 0;
        gameState.totalDamage = 0;
        gameState.victory = false;
        gameState.victoryBossName = '';
        // 重置失明状态
        gameState.playerBlinded = false;
        // 重置维修包数量
        gameState.repairKits = gameState.maxRepairKits;
        
        this.resetAllWeaponStates();
        
        // 清空游戏对象
        this.player = null;
        this.clearAllGameObjects();
        
        // 清除所有键盘状态，防止角色不由自主移动
        for (let key in keys) {
            keys[key] = false;
        }
        
        // 清除鼠标状态
        mouse.leftClick = false;
        mouse.rightClick = false;
        
        updateUI();
    }
    
    // selectMech方法已删除，功能已合并到selectWeaponConfig中

    update() {
        if (gameState.paused || gameState.showModeSelection || gameState.showWeaponConfig || gameState.showMechCustomization || gameState.showGuide || gameState.showSettings) return;
        if (!this.player) return;
        
        // 游戏结束时只更新UI，不更新游戏对象
        if (gameState.gameOver) {
            this.clearAllGameObjects();
            // Hard-reset the FX pool so nothing lingers visually if anything
            // else references it (and so a fresh game starts clean).
            if (typeof bossFX !== 'undefined') {
                bossFX.particles = [];
                bossFX.flashes = [];
                bossFX.shockwaves = [];
                bossFX.shake = { x: 0, y: 0, until: 0, magnitude: 0, totalMs: 0 };
            }
            updateUI();
            return;
        }

        // Death spectacle: when the boss or player dies we play the explosion
        // animation before transitioning to the result screen. We DO let the
        // rest of the world keep updating (projectiles, mines, explosions,
        // particles…) so anything still in flight visually completes its arc;
        // but `damageFrozen` makes every takeDamage a no-op so nothing can
        // actually hurt anyone, the player loses input control, and the boss
        // is already gone so there's nothing left to fight.
        const inDeathSpectacle = gameState.bossDying || gameState.playerDying;
        if (inDeathSpectacle) {
            gameState.damageFrozen = true;
            this._tickDeathSpectacle();
        } else {
            gameState.damageFrozen = false;
        }

        // 更新玩家（死亡演出期间冻结玩家输入与行动）
        if (!inDeathSpectacle) {
            this.player.update();
        }

        // 更新敌人 - 从后往前遍历避免索引问题
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            // Snapshot pre-update position so we can compute *observed*
            // velocity (intent vs reality may diverge when wall-pinned).
            const _prevX = enemy.x;
            const _prevY = enemy.y;
            enemy.update();
            enemy._observedVx = enemy.x - _prevX;
            enemy._observedVy = enemy.y - _prevY;
            if (enemy.shouldDestroy) {
                this.enemies.splice(i, 1);
            }
        }

        // 更新子弹 - 从后往前遍历避免索引问题
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update();
            if (bullet.shouldDestroy) {
                this.bullets.splice(i, 1);
            }
        }

        // 更新导弹 - 从后往前遍历避免索引问题
        if (this.missiles) {
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                const missile = this.missiles[i];
                missile.update();
                if (missile.shouldDestroy) {
                    this.missiles.splice(i, 1);
                }
            }
        } else {
            this.missiles = [];
        }

        // 更新Boss导弹 - 从后往前遍历避免索引问题
        if (this.bossMissiles) {
            for (let i = this.bossMissiles.length - 1; i >= 0; i--) {
                const missile = this.bossMissiles[i];
                missile.update();
                if (missile.shouldDestroy) {
                    this.bossMissiles.splice(i, 1);
                }
            }
        } else {
            this.bossMissiles = [];
        }

        // 更新月牙追踪弹 - 从后往前遍历避免索引问题
        if (this.crescentBullets) {
            for (let i = this.crescentBullets.length - 1; i >= 0; i--) {
                const bullet = this.crescentBullets[i];
                bullet.update();
                if (bullet.shouldDestroy) {
                    this.crescentBullets.splice(i, 1);
                }
            }
        } else {
            this.crescentBullets = [];
        }

        // Boss CIWS bullets (defensive interceptors fired by the boss
        // at incoming player missiles).
        if (this.bossCiwsBullets) {
            for (let i = this.bossCiwsBullets.length - 1; i >= 0; i--) {
                const bullet = this.bossCiwsBullets[i];
                bullet.update();
                if (bullet.shouldDestroy) {
                    this.bossCiwsBullets.splice(i, 1);
                }
            }
        } else {
            this.bossCiwsBullets = [];
        }

        // 更新冰之姬分身 - 从后往前遍历避免索引问题
        if (this.iceClones) {
            for (let i = this.iceClones.length - 1; i >= 0; i--) {
                const clone = this.iceClones[i];
                clone.update();
                if (clone.shouldRemove) {
                    this.iceClones.splice(i, 1);
                }
            }
        } else {
            this.iceClones = [];
        }

        // 更新机雷 - 从后往前遍历避免索引问题
        if (this.mines) {
            for (let i = this.mines.length - 1; i >= 0; i--) {
                const mine = this.mines[i];
                mine.update();
                // 机雷的移除逻辑在Mine类的update方法中处理
            }
        } else {
            this.mines = [];
            this.molotovs = [];
        }

        // 子弹与敌人碰撞 - 从后往前遍历避免索引问题
        for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
            const bullet = this.bullets[bulletIndex];
            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];
                if (bullet.collidesWith(enemy)) {
                    const isDead = enemy.takeDamage(bullet.damage);
                    this.bullets.splice(bulletIndex, 1);
                    gameState.score += bullet.damage;
                    gameState.totalDamage += bullet.damage;
                    if (isDead) {
                        this.enemies.splice(enemyIndex, 1);
                        gameState.score += 10; // 击杀奖励
                    }
                    updateUI();
                    break; // 子弹已被销毁，跳出内层循环
                }
            }
        }

        // 子弹与Boss碰撞
        if (this.boss && !this.boss.notTargetable && this.bullets.length > 0) {
            for (let bulletIndex = this.bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
                const bullet = this.bullets[bulletIndex];
                if (bullet.collidesWith(this.boss)) {
                    // 冰之姬对步枪子弹伤害减半
                    let actualDamage = bullet.damage;
                    if (this.boss instanceof SublimeMoon) {
                        actualDamage = Math.floor(bullet.damage / 2); // 伤害减半（向下取整）
                    }
                    
                    // 为丑皇添加伤害来源标识
                    let damageSource = 'bullet';
                    if (this.boss instanceof UglyEmperor) {
                        damageSource = 'bullet'; // 子弹伤害
                    }
                    
                    this.boss.takeDamage(actualDamage, damageSource);
                    this.bullets.splice(bulletIndex, 1);
                    gameState.score += bullet.damage;
                    gameState.totalDamage += actualDamage;
                    updateUI();
                    break;
                }
            }
        }

        // Boss导弹与玩家碰撞检测
        if (this.player && !this.player.isUntargetable && this.bossMissiles && this.bossMissiles.length > 0) {
            for (let missileIndex = this.bossMissiles.length - 1; missileIndex >= 0; missileIndex--) {
                const missile = this.bossMissiles[missileIndex];
                if (missile.collidesWith(this.player)) {
                    missile.explode();
                    this.bossMissiles.splice(missileIndex, 1);
                    this.player.takeDamage(missile.damage || 3);
                    updateUI();
                    break;
                }
            }
        }

        // 敌人与玩家碰撞检测
        if (this.player && !this.player.isUntargetable && this.enemies.length > 0) {
            for (let enemyIndex = this.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
                const enemy = this.enemies[enemyIndex];
                // Triumvirate members deal damage exclusively through their
                // attack moves — direct body contact is a no-op (they would
                // otherwise melt the player just by being shoved).
                if (enemy.isTriMember || enemy.isVoidborn) continue;
                if (enemy.collidesWith(this.player)) {
                    this.player.takeDamage(1);
                    updateUI();
                    break;
                }
            }
        }

        // Boss与玩家碰撞检测（已取消伤害）
        // if (this.player && this.boss) {
        //     if (this.boss.collidesWith(this.player)) {
        //         // Boss撞击玩家造成伤害，根据Boss类型决定伤害值
        //         let damage = 2; // 默认Boss造成2点伤害
        //         if (this.boss instanceof SublimeMoon) {
        //             damage = 0; // 冰之姬现在是靶子，不造成伤害
        //         }
        //         if (damage > 0) {
        //             this.player.takeDamage(damage);
        //             updateUI();
        //         }
        //     }
        // }
            
        // Boss战模式：不再自动生成新Boss
        // 删除自动生成Boss的代码，让Boss死亡后直接显示胜利画面

        // 检查Boss是否死亡（血量为0）- 统一入口
        if (this.boss && this.boss.health <= 0) {
            handleBossKill();
        }

        // 更新Boss
        if (this.boss) {
            const _bossPrevX = this.boss.x;
            const _bossPrevY = this.boss.y;
            this.boss.update();
            this.boss._observedVx = this.boss.x - _bossPrevX;
            this.boss._observedVy = this.boss.y - _bossPrevY;
        }
        
        // 更新混沌子弹
        if (this.chaosBullets) {
            for (let i = this.chaosBullets.length - 1; i >= 0; i--) {
                const bullet = this.chaosBullets[i];
                bullet.update();
                
                if (bullet.shouldDestroy) {
                    this.chaosBullets.splice(i, 1);
                }
            }
        }
        
        // 更新噬星者步枪子弹
        if (this.starDevourerBullets) {
            for (let i = this.starDevourerBullets.length - 1; i >= 0; i--) {
                const bullet = this.starDevourerBullets[i];
                bullet.update();
                if (bullet.shouldDestroy) {
                    this.starDevourerBullets.splice(i, 1);
                }
            }
        }

        // Magnus particle cannon shells / EMP wave bullets
        if (this.magnusBullets) {
            for (let i = this.magnusBullets.length - 1; i >= 0; i--) {
                const b = this.magnusBullets[i];
                b.update();
                if (b.shouldDestroy) this.magnusBullets.splice(i, 1);
            }
        }
        // Magnus artillery shells (lobbed AOE)
        if (this.magnusShells) {
            for (let i = this.magnusShells.length - 1; i >= 0; i--) {
                const s = this.magnusShells[i];
                s.update();
                if (s.shouldDestroy) this.magnusShells.splice(i, 1);
            }
        }
        // HiveMind plasma bullets
        if (this.hivePlasmaBullets) {
            for (let i = this.hivePlasmaBullets.length - 1; i >= 0; i--) {
                const b = this.hivePlasmaBullets[i];
                b.update();
                if (b.shouldDestroy) this.hivePlasmaBullets.splice(i, 1);
            }
        }
        // Yukikon SMG bullets
        if (this.yukikonBullets) {
            for (let i = this.yukikonBullets.length - 1; i >= 0; i--) {
                const b = this.yukikonBullets[i];
                b.update();
                if (b.shouldDestroy) this.yukikonBullets.splice(i, 1);
            }
        }
        // Yukikon homing daggers (sword-rain projectiles)
        if (this.yukikonDaggers) {
            for (let i = this.yukikonDaggers.length - 1; i >= 0; i--) {
                const b = this.yukikonDaggers[i];
                b.update();
                if (b.shouldDestroy) this.yukikonDaggers.splice(i, 1);
            }
        }
        // Proteus projectiles (shotgun pellets / cannon rounds / turret tracers)
        if (this.proteusBullets) {
            for (let i = this.proteusBullets.length - 1; i >= 0; i--) {
                const b = this.proteusBullets[i];
                b.update();
                if (b.shouldDestroy) this.proteusBullets.splice(i, 1);
            }
        }
        // HiveMind splinters: prune dead from auxiliary list
        // (they live in game.enemies which handles update/draw)
        if (this.hiveSplinters) {
            for (let i = this.hiveSplinters.length - 1; i >= 0; i--) {
                if (this.hiveSplinters[i].shouldDestroy) this.hiveSplinters.splice(i, 1);
            }
        }
        // HiveMind drones: prune dead from auxiliary list (they are in game.enemies)
        if (this.hiveDrones) {
            for (let i = this.hiveDrones.length - 1; i >= 0; i--) {
                if (this.hiveDrones[i].shouldDestroy) this.hiveDrones.splice(i, 1);
            }
        }
        
        // 更新近防炮子弹
        if (this.ciwsBullets) {
            for (let i = this.ciwsBullets.length - 1; i >= 0; i--) {
                const bullet = this.ciwsBullets[i];
                bullet.update();
                if (bullet.shouldDestroy) {
                    this.ciwsBullets.splice(i, 1);
                }
            }
        }
        
        // 更新电浆飞弹
        if (this.plasmaMissiles) {
            for (let i = this.plasmaMissiles.length - 1; i >= 0; i--) {
                const pm = this.plasmaMissiles[i];
                pm.update();
                if (pm.shouldDestroy) {
                    this.plasmaMissiles.splice(i, 1);
                }
            }
        }
        
        // 更新电浆场
        if (this.plasmaFields) {
            for (let i = this.plasmaFields.length - 1; i >= 0; i--) {
                const field = this.plasmaFields[i];
                field.update();
                if (field.shouldDestroy) {
                    this.plasmaFields.splice(i, 1);
                }
            }
        }
        
        // 更新分裂飞弹母弹
        if (this.clusterMissiles) {
            for (let i = this.clusterMissiles.length - 1; i >= 0; i--) {
                const cm = this.clusterMissiles[i];
                cm.update();
                if (cm.shouldDestroy) {
                    this.clusterMissiles.splice(i, 1);
                }
            }
        }
        
        // 更新诱饵
        if (this.decoys) {
            for (let i = this.decoys.length - 1; i >= 0; i--) {
                this.decoys[i].update();
                if (this.decoys[i].shouldDestroy) {
                    this.decoys.splice(i, 1);
                }
            }
        }
        
        // 更新燃烧瓶
        if (this.molotovs) {
            for (let i = this.molotovs.length - 1; i >= 0; i--) {
                const molotov = this.molotovs[i];
                molotov.update();
                
                if (molotov.shouldDestroy) {
                    this.molotovs.splice(i, 1);
                }
            }
        }

        // 确保特效数组存在
        if (!this.teleportEffects) {
            this.teleportEffects = [];
        }

        // 移除了基于时间的记分系统，现在分数完全基于造成的伤害
        updateUI();

        // Boss FX system tick (particles, flashes, screen shake decay)
        if (typeof bossFX !== 'undefined') bossFX.update();

        // Training Ground: keep the dummy population topped up.
        this._maintainTrainingDummies();

        // Floating damage numbers (lifetime-based fade).
        if (typeof updateDamageNumbers === 'function') updateDamageNumbers();

        // Drain every boss / sub-boss hit indicator into the unified
        // top-of-screen damage stream so each boss class's own draw
        // method has nothing left to render in the world.
        this._drainBossHitIndicators();
    }

    draw() {
        // HUD-style background: dark with animated grid + vignette + scanlines
        const inMenuOrModal = gameState.showGuide || gameState.showModeSelection ||
            gameState.showLevelSelection || gameState.showWeaponConfig ||
            gameState.showMechCustomization || gameState.showSettings;
        if (inMenuOrModal) {
            uiDrawGridBackground(this.ctx, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        } else {
            this.ctx.fillStyle = UI_THEME.color.bgDeep;
            this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        }

        // 显示游戏简介界面
        if (gameState.showGuide) {
            this.drawGuide();
            return;
        }

        // Settings page (mech callsign etc.)
        if (gameState.showSettings) {
            this.drawSettings();
            return;
        }

        // 显示模式选择界面
        if (gameState.showModeSelection) {
            this.drawModeSelection();
            return;
        }

        // 显示关卡选择界面
        if (gameState.showLevelSelection) {
            this.drawLevelSelection();
            return;
        }

        // 显示武器配置界面
        if (gameState.showWeaponConfig) {
            this.drawWeaponConfig();
            return;
        }

        // 显示机甲定制界面
        if (gameState.showMechCustomization) {
            this.drawMechCustomization();
            return;
        }

        // 绘制游戏世界（try-catch 防止单个错误导致整个UI消失）
        // When the game is over we skip the entire world render — any
        // lingering FX (sword slashes, telegraphs, particle bursts that
        // were mid-flight when the player died) would otherwise freeze
        // on top of the GAME OVER screen because their owners stop
        // updating the moment gameOver flips on.
        if (gameState.gameOver) {
            this.drawGameOver();
            return;
        }
        try {
        // Apply screen shake (offset world transform). Will be popped by postDraw.
        if (typeof bossFX !== 'undefined') bossFX.preDraw(this.ctx);
        // 绘制玩家（玩家死亡演出阶段不再绘制本体，只剩爆炸）
        if (this.player && !gameState.playerDying) {
            this.player.draw(this.ctx);
        }

        // 绘制敌人
        this.enemies.forEach(enemy => enemy.draw(this.ctx));

        // 绘制Boss
        if (this.boss) {
            this.boss.draw(this.ctx);
        }
        
        // 绘制混沌子弹
        if (this.chaosBullets) {
            this.chaosBullets.forEach(bullet => {
                bullet.draw(this.ctx);
            });
        }
        
        // 绘制噬星者步枪子弹
        if (this.starDevourerBullets) {
            this.starDevourerBullets.forEach(bullet => bullet.draw(this.ctx));
        }

        // Magnus particle bullets + lobbed shells (detached pods are now in
        // game.enemies and rendered by the enemy loop)
        if (this.magnusBullets) this.magnusBullets.forEach(b => b.draw(this.ctx));
        if (this.magnusShells) this.magnusShells.forEach(s => s.draw(this.ctx));

        // HiveMind plasma bullets
        if (this.hivePlasmaBullets) this.hivePlasmaBullets.forEach(b => b.draw(this.ctx));
        if (this.yukikonBullets) this.yukikonBullets.forEach(b => b.draw(this.ctx));
        if (this.yukikonDaggers) this.yukikonDaggers.forEach(b => b.draw(this.ctx));
        if (this.proteusBullets) this.proteusBullets.forEach(b => b.draw(this.ctx));
        
        // 绘制近防炮子弹
        if (this.ciwsBullets) {
            this.ciwsBullets.forEach(bullet => bullet.draw(this.ctx));
        }
        
        // 绘制电浆场（在飞弹之前绘制，作为地面效果）
        if (this.plasmaFields) {
            this.plasmaFields.forEach(field => field.draw(this.ctx));
        }
        
        // 绘制电浆飞弹
        if (this.plasmaMissiles) {
            this.plasmaMissiles.forEach(pm => pm.draw(this.ctx));
        }
        
        // 绘制分裂飞弹母弹
        if (this.clusterMissiles) {
            this.clusterMissiles.forEach(cm => cm.draw(this.ctx));
        }

        // 绘制诱饵
        if (this.decoys) {
            this.decoys.forEach(d => d.draw(this.ctx));
        }

        // 绘制子弹
        this.bullets.forEach(bullet => bullet.draw(this.ctx));

        // 绘制导弹
        if (this.missiles) {
            this.missiles.forEach(missile => missile.draw(this.ctx));
        }

        // 绘制Boss导弹
        if (this.bossMissiles) {
            this.bossMissiles.forEach(missile => missile.draw(this.ctx));
        }

        // 绘制月牙追踪弹
        if (this.crescentBullets) {
            this.crescentBullets.forEach(bullet => bullet.draw(this.ctx));
        }

        // Boss CIWS bullets — drawn above missiles so they're clearly visible
        if (this.bossCiwsBullets) {
            this.bossCiwsBullets.forEach(bullet => bullet.draw(this.ctx));
        }

        // 绘制冰之姬分身
        if (this.iceClones) {
            this.iceClones.forEach(clone => clone.draw(this.ctx));
        }

        // 绘制机雷
        if (this.mines) {
            this.mines.forEach(mine => mine.draw(this.ctx));
        }
        
        // 绘制燃烧瓶
        if (this.molotovs) {
            this.molotovs.forEach(molotov => molotov.draw(this.ctx));
        }

        // 绘制爆炸效果
        this.drawExplosions();

        // 绘制回旋斩特效
        this.drawSpinSlashEffects();
        
        // 绘制传送特效
        this.drawTeleportEffects();
        
        // 绘制回旋镖命中特效
        this.drawBoomerangHitEffects();
        // FX overlay (particles, flashes, shockwaves) on top of world; pops shake.
        if (typeof bossFX !== 'undefined') bossFX.postDraw(this.ctx);

        // Floating damage numbers — drawn after the world FX so
        // they always sit on top and stay readable.
        if (typeof drawDamageNumbers === 'function') drawDamageNumbers(this.ctx);
        } catch (e) {
            console.error('游戏绘制错误:', e);
            this.ctx.restore();
        }

        // 绘制失明效果（在UI之前）
        if (gameState.playerBlinded) {
            this.drawBlindnessEffect();
        }

        // 绘制UI信息（在失明效果之上）
        this.drawGameUI();

        // 手动锁模式下绘制准心（在失明效果之上）
        if (gameState.lockMode === 'manual') {
            this.drawCrosshair();
        }

        // 绘制暂停界面（在失明效果之上）
        if (gameState.paused) {
            this.drawPauseScreen();
        }

        // 绘制游戏结束界面（在失明效果之上）
        if (gameState.gameOver) {
            this.drawGameOver();
        }

        // 绘制胜利界面（在失明效果之上）
        if (gameState.victory) {
            this.drawVictoryScreen();
        }
    }

    drawModeSelection() {
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        // Screen frame markers (4 corners)
        uiDrawScreenFrame(ctx, W, H);

        // Status header bar (top-left)
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `13px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// SYSTEM ONLINE', 50, 38);
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.fillText('STATUS: STANDBY  //  PILOT: AUTHORIZED', 50, 58);
        ctx.restore();

        // Title block
        const titleY = H * 0.22;
        uiDrawTitle(ctx, W / 2, titleY, 'MECH COMBAT', 'TACTICAL OPERATIONS TERMINAL');

        // Buttons stack
        const btnW = 460;
        const btnH = 96;
        const btnX = W / 2 - btnW / 2;
        const gap = 22;
        let by = H / 2 - 40;

        // Boss battle button
        this.bossButton = uiDrawButton(ctx, btnX, by, btnW, btnH, t('menu.startBoss'), {
            accentColor: UI_THEME.color.danger,
            subLabel: t('menu.startBossDesc'),
            labelFont: `bold 26px ${UI_THEME.font.display}`,
            labelLetterSpacing: 2
        });

        // Training ground button
        by += btnH + gap;
        this.trainingButton = uiDrawButton(ctx, btnX, by, btnW, btnH, t('menu.startTraining'), {
            accentColor: '#5fa3ff',
            subLabel: t('menu.startTrainingDesc'),
            labelFont: `bold 24px ${UI_THEME.font.display}`,
            labelLetterSpacing: 2
        });

        // Customize mech button
        by += btnH + gap;
        this.customButton = uiDrawButton(ctx, btnX, by, btnW, btnH, t('menu.customizeMech'), {
            accentColor: UI_THEME.color.primary,
            subLabel: t('menu.customizeDesc'),
            labelFont: `bold 24px ${UI_THEME.font.display}`,
            labelLetterSpacing: 2
        });

        // Guide button (smaller, secondary)
        by += btnH + gap;
        const guideH = 56;
        this.guideButton = uiDrawButton(ctx, btnX, by, btnW, guideH, t('menu.guide'), {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `18px ${UI_THEME.font.display}`,
            labelLetterSpacing: 3,
            chamfer: 10
        });

        // Settings button (smaller, secondary, sits next to guide)
        by += guideH + 12;
        this.settingsButton = uiDrawButton(ctx, btnX, by, btnW, guideH, t('menu.settings'), {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `18px ${UI_THEME.font.display}`,
            labelLetterSpacing: 3,
            chamfer: 10
        });

        // Language toggle (top-right)
        const langBtnW = 90;
        const langBtnH = 36;
        const langBtnX = W - langBtnW - 30;
        const langBtnY = 24;
        this.langButton = uiDrawButton(ctx, langBtnX, langBtnY, langBtnW, langBtnH, t('ui.langToggle'), {
            accentColor: UI_THEME.color.primary,
            labelFont: `bold 14px ${UI_THEME.font.mono}`,
            chamfer: 6
        });

        // Footer hint
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textMuted;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('// SELECT OPERATION TO PROCEED', W / 2, H - 40);
        ctx.restore();

        // Light scanlines overlay for retro CRT feel
        uiDrawScanlines(ctx, W, H);

        // Clear stale buttons from other screens
        this.backButton = null;
        this.mainMenuButton = null;
        this.pauseButton = null;
    }

    drawLevelSelection() {
        this.pauseButton = null;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        const scrollY = gameState.levelScrollOffset || 0;
        const headerHeight = 160;

        // Scrollable content area
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, headerHeight, W, H - headerHeight);
        ctx.clip();

        const levels = Object.values(BOSS_LEVELS);
        const buttonWidth = 540;
        const buttonHeight = 124;
        const buttonSpacing = 144;
        const startY = 200;

        this.levelButtons = [];

        levels.forEach((level, index) => {
            const buttonX = W / 2 - buttonWidth / 2;
            const buttonY = startY + index * buttonSpacing - scrollY;

            if (buttonY + buttonHeight < headerHeight || buttonY > H) return;

            const rect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
            const hovered = level.unlocked && uiIsHovered(rect);
            const accent = level.unlocked ? UI_THEME.color.danger : UI_THEME.color.textMuted;

            uiDrawPanel(ctx, buttonX, buttonY, buttonWidth, buttonHeight, {
                chamfer: 16,
                fill: {
                    from: level.unlocked
                        ? (hovered ? 'rgba(40, 12, 16, 0.95)' : 'rgba(20, 8, 12, 0.85)')
                        : 'rgba(15, 18, 22, 0.7)',
                    to: level.unlocked
                        ? (hovered ? 'rgba(60, 16, 22, 0.95)' : 'rgba(28, 10, 14, 0.85)')
                        : 'rgba(20, 24, 28, 0.7)'
                },
                stroke: accent,
                strokeWidth: hovered ? 2.5 : 1.5,
                glow: hovered,
                glowColor: UI_THEME.color.dangerGlow
            });

            // Left status strip with level number
            ctx.save();
            ctx.fillStyle = accent;
            ctx.fillRect(buttonX + 8, buttonY + 16, 4, buttonHeight - 32);

            ctx.fillStyle = level.unlocked ? UI_THEME.color.textSecondary : UI_THEME.color.textMuted;
            ctx.font = `12px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`OP.${String(index + 1).padStart(2, '0')}`, buttonX + 26, buttonY + 16);
            ctx.restore();

            if (level.unlocked) {
                // Boss name
                ctx.save();
                ctx.fillStyle = UI_THEME.color.textPrimary;
                ctx.font = `bold 26px ${UI_THEME.font.display}`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                if (hovered) {
                    ctx.shadowColor = UI_THEME.color.dangerGlow;
                    ctx.shadowBlur = 10;
                }
                ctx.fillText(t('boss.' + level.id), buttonX + 26, buttonY + 36);
                ctx.restore();

                // Description
                ctx.save();
                ctx.fillStyle = UI_THEME.color.textSecondary;
                ctx.font = `13px ${UI_THEME.font.body}`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(t('bossDesc.' + level.id), buttonX + 26, buttonY + 70);
                ctx.restore();

                // Engage indicator (right edge)
                ctx.save();
                ctx.fillStyle = hovered ? UI_THEME.color.danger : UI_THEME.color.dangerDim;
                ctx.font = `bold 14px ${UI_THEME.font.mono}`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText('▶ ENGAGE', buttonX + buttonWidth - 24, buttonY + 22);
                ctx.restore();

                this.levelButtons[index] = { ...rect, levelId: level.id };
            } else {
                ctx.save();
                ctx.fillStyle = UI_THEME.color.textMuted;
                ctx.font = `bold 22px ${UI_THEME.font.display}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t('menu.locked'), buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
                ctx.restore();
            }
        });

        ctx.restore();

        // Fixed header (drawn on top of scroll content)
        ctx.save();
        ctx.fillStyle = UI_THEME.color.bgDeep;
        ctx.fillRect(0, 0, W, headerHeight);
        // Header bottom divider
        ctx.strokeStyle = UI_THEME.color.primaryDim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, headerHeight - 1);
        ctx.lineTo(W - 40, headerHeight - 1);
        ctx.stroke();
        ctx.restore();

        // Title
        uiDrawTitle(ctx, W / 2, 70, t('menu.selectLevel'), t('menu.bossModeSub'), {
            mainFont: `bold 38px ${UI_THEME.font.display}`,
            subFont: `13px ${UI_THEME.font.mono}`
        });

        // Scroll indicators
        const contentHeight = startY + levels.length * buttonSpacing;
        const maxScroll = Math.max(0, contentHeight - H + 60);
        if (maxScroll > 0) {
            const trackX = W - 18;
            const trackTop = headerHeight + 10;
            const trackHeight = H - headerHeight - 20;

            ctx.fillStyle = 'rgba(0, 230, 200, 0.08)';
            ctx.fillRect(trackX, trackTop, 4, trackHeight);

            const thumbRatio = (H - headerHeight) / contentHeight;
            const thumbHeight = Math.max(30, trackHeight * thumbRatio);
            const thumbY = trackTop + (scrollY / maxScroll) * (trackHeight - thumbHeight);

            ctx.fillStyle = UI_THEME.color.primary;
            ctx.fillRect(trackX, thumbY, 4, thumbHeight);
        }

        // Back button (top-left)
        const backW = 130;
        const backH = 44;
        this.backButton = uiDrawButton(ctx, 40, 50, backW, backH, t('menu.backArrow'), {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `bold 14px ${UI_THEME.font.mono}`,
            chamfer: 8
        });

        // Frame markers + scanlines
        uiDrawScreenFrame(ctx, W, H);
        uiDrawScanlines(ctx, W, H);

        this.bossButton = null;
        this.trainingButton = null;
        this.customButton = null;
        this.mainMenuButton = null;
        this.pauseButton = null;
    }

    drawWeaponConfig() {
        this.pauseButton = null;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        // Header status line
        const currentMode = GAME_MODES[gameState.selectedGameMode];
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// LOADOUT CONFIGURATION', 50, 38);
        ctx.fillStyle = currentMode.color;
        ctx.fillText(t('cfg.selected', t('mode.' + gameState.selectedGameMode)).toUpperCase(), 50, 58);
        ctx.restore();

        // Title
        uiDrawTitle(ctx, W / 2, 95, 'WEAPON CONFIG', t('cfg.configHint'), {
            mainFont: `bold 36px ${UI_THEME.font.display}`,
            subFont: `12px ${UI_THEME.font.mono}`
        });

        const { weaponOptions, shoulderWeaponOptions, hiddenAbilityOptions } = this.getWeaponOptions();

        const weaponSlots = [
            { key: 'leftHand', name: t('cfg.leftHand'), keyHint: t('cfg.leftKey'), color: UI_THEME.color.primary, options: weaponOptions, currentValue: gameState.weaponConfig.leftHand },
            { key: 'rightHand', name: t('cfg.rightHand'), keyHint: t('cfg.rightKey'), color: '#ff7575', options: weaponOptions, currentValue: gameState.weaponConfig.rightHand },
            { key: 'leftShoulder', name: t('cfg.leftShoulder'), keyHint: t('cfg.qKey'), color: UI_THEME.color.danger, options: shoulderWeaponOptions, currentValue: gameState.weaponConfig.leftShoulder },
            { key: 'rightShoulder', name: t('cfg.rightShoulder'), keyHint: t('cfg.eKey'), color: UI_THEME.color.accent, options: shoulderWeaponOptions, currentValue: gameState.weaponConfig.rightShoulder },
            { key: 'hiddenAbility', name: t('cfg.hiddenAbility'), keyHint: t('cfg.shiftKey'), color: '#7df9ff', options: hiddenAbilityOptions, currentValue: gameState.weaponConfig.hiddenAbility }
        ];

        const slotW = 200;
        const slotH = 130;
        const totalW = slotW * 5 + 14 * 4;
        const startX = (W - totalW) / 2;
        const startY = H / 2 - 90;

        this.weaponSlotButtons = [];

        weaponSlots.forEach((slot, index) => {
            const x = startX + index * (slotW + 14);
            const y = startY;
            const currentWeapon = slot.options.find(w => w.type === slot.currentValue);
            const displayName = currentWeapon ? currentWeapon.name : t('cfg.none');
            const rect = { x, y, width: slotW, height: slotH };
            const hovered = uiIsHovered(rect);

            uiDrawPanel(ctx, x, y, slotW, slotH, {
                chamfer: 12,
                fill: { from: 'rgba(8, 14, 20, 0.9)', to: 'rgba(14, 22, 30, 0.9)' },
                stroke: slot.color,
                strokeWidth: hovered ? 2.5 : 1.5,
                glow: hovered,
                glowColor: slot.color
            });

            // Slot ID + key hint header
            ctx.save();
            ctx.fillStyle = slot.color;
            ctx.font = `11px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`SLOT.0${index + 1}`, x + 14, y + 12);
            ctx.textAlign = 'right';
            ctx.fillStyle = UI_THEME.color.textMuted;
            ctx.fillText(slot.keyHint, x + slotW - 14, y + 12);
            ctx.restore();

            // Divider
            ctx.save();
            ctx.strokeStyle = slot.color;
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 14, y + 32);
            ctx.lineTo(x + slotW - 14, y + 32);
            ctx.stroke();
            ctx.restore();

            // Slot name
            ctx.save();
            ctx.fillStyle = UI_THEME.color.textPrimary;
            ctx.font = `bold 16px ${UI_THEME.font.display}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(slot.name, x + slotW / 2, y + 52);
            ctx.restore();

            // Equipped weapon
            ctx.save();
            ctx.fillStyle = currentWeapon ? slot.color : UI_THEME.color.textMuted;
            ctx.font = `14px ${UI_THEME.font.body}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            wrapAndDrawText(ctx, displayName, x + slotW / 2, y + 86, slotW - 24, 18);
            ctx.restore();

            // Cycle indicator
            ctx.save();
            ctx.fillStyle = UI_THEME.color.textMuted;
            ctx.font = `10px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('◀ CLICK TO CYCLE ▶', x + slotW / 2, y + slotH - 10);
            ctx.restore();

            this.weaponSlotButtons.push({
                x, y, width: slotW, height: slotH,
                slotKey: slot.key, options: slot.options
            });
        });

        // Invincible toggle
        const toggleW = 220;
        const toggleH = 44;
        const toggleX = W / 2 - toggleW / 2;
        const toggleY = startY + slotH + 40;
        const invOn = gameState.invincibleMode;
        this.invincibleToggleButton = uiDrawButton(ctx, toggleX, toggleY, toggleW, toggleH,
            invOn ? t('cfg.invincibleOn') : t('cfg.invincibleOff'), {
                accentColor: invOn ? UI_THEME.color.warning : UI_THEME.color.textMuted,
                labelFont: `bold 14px ${UI_THEME.font.mono}`,
                chamfer: 8
            });

        // Start game button
        const startW = 280;
        const startH = 60;
        const startBX = W / 2 - startW / 2;
        const startBY = toggleY + toggleH + 24;
        this.startGameButton = uiDrawButton(ctx, startBX, startBY, startW, startH, t('cfg.startGame'), {
            accentColor: UI_THEME.color.success,
            labelFont: `bold 22px ${UI_THEME.font.display}`,
            labelLetterSpacing: 3,
            chamfer: 12
        });

        // Frame + scanlines
        uiDrawScreenFrame(ctx, W, H);
        uiDrawScanlines(ctx, W, H);

        // Back button
        this.drawBackButton();
    }

    drawMechCustomization() {
        this.pauseButton = null;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        // Header
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// MECH CUSTOMIZATION', 50, 38);
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.fillText('PERSISTENT LOADOUT // PERSISTS BETWEEN MISSIONS', 50, 58);
        ctx.restore();

        uiDrawTitle(ctx, W / 2, 95, t('menu.customizeMech'), t('cfg.customHint'), {
            mainFont: `bold 36px ${UI_THEME.font.display}`,
            subFont: `12px ${UI_THEME.font.mono}`
        });

        const { weaponOptions, shoulderWeaponOptions, hiddenAbilityOptions } = this.getWeaponOptions();

        const weaponSlots = [
            { key: 'leftHand', name: t('cfg.leftHand'), keyHint: t('cfg.leftKey'), color: UI_THEME.color.primary, options: weaponOptions },
            { key: 'rightHand', name: t('cfg.rightHand'), keyHint: t('cfg.rightKey'), color: '#ff7575', options: weaponOptions },
            { key: 'leftShoulder', name: t('cfg.leftShoulder'), keyHint: t('cfg.qKey'), color: UI_THEME.color.danger, options: shoulderWeaponOptions },
            { key: 'rightShoulder', name: t('cfg.rightShoulder'), keyHint: t('cfg.eKey'), color: UI_THEME.color.accent, options: shoulderWeaponOptions },
            { key: 'hiddenAbility', name: t('cfg.hiddenAbility'), keyHint: t('cfg.shiftKey'), color: '#7df9ff', options: hiddenAbilityOptions }
        ];

        const slotW = 200;
        const slotH = 130;
        const totalW = slotW * 5 + 14 * 4;
        const startX = (W - totalW) / 2;
        const startY = H / 2 - 70;

        this.mechCustomSlotButtons = [];

        weaponSlots.forEach((slot, index) => {
            const x = startX + index * (slotW + 14);
            const y = startY;
            const currentWeapon = slot.options.find(w => w.type === gameState.weaponConfig[slot.key]);
            const displayName = currentWeapon ? currentWeapon.name : t('cfg.none');
            const rect = { x, y, width: slotW, height: slotH };
            const hovered = uiIsHovered(rect);

            uiDrawPanel(ctx, x, y, slotW, slotH, {
                chamfer: 12,
                fill: { from: 'rgba(8, 14, 20, 0.9)', to: 'rgba(14, 22, 30, 0.9)' },
                stroke: slot.color,
                strokeWidth: hovered ? 2.5 : 1.5,
                glow: hovered,
                glowColor: slot.color
            });

            ctx.save();
            ctx.fillStyle = slot.color;
            ctx.font = `11px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`SLOT.0${index + 1}`, x + 14, y + 12);
            ctx.textAlign = 'right';
            ctx.fillStyle = UI_THEME.color.textMuted;
            ctx.fillText(slot.keyHint, x + slotW - 14, y + 12);
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = slot.color;
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 14, y + 32);
            ctx.lineTo(x + slotW - 14, y + 32);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = UI_THEME.color.textPrimary;
            ctx.font = `bold 16px ${UI_THEME.font.display}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(slot.name, x + slotW / 2, y + 52);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = currentWeapon ? slot.color : UI_THEME.color.textMuted;
            ctx.font = `14px ${UI_THEME.font.body}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            wrapAndDrawText(ctx, displayName, x + slotW / 2, y + 86, slotW - 24, 18);
            ctx.restore();

            ctx.save();
            ctx.fillStyle = UI_THEME.color.textMuted;
            ctx.font = `10px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('◀ CLICK TO CYCLE ▶', x + slotW / 2, y + slotH - 10);
            ctx.restore();

            this.mechCustomSlotButtons.push({
                x, y, width: slotW, height: slotH,
                slotKey: slot.key, options: slot.options
            });
        });

        uiDrawScreenFrame(ctx, W, H);
        uiDrawScanlines(ctx, W, H);
        this.drawBackButton();
    }

    // drawMechSelection方法已删除，机甲选择界面已移除
    
    drawExplosions() {
        if (!this.explosions) {
            this.explosions = [];
            return;
        }

        const now = Date.now();
        const ctx = this.ctx;

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            // First-frame initialization: spawn physics particles + shockwave + flash + shake
            if (!explosion._initialized) {
                this._initExplosionFX(explosion);
                explosion._initialized = true;
            }

            // Stretch the visual lifetime so the tail lingers.
            // The original `duration` controls the main blast; we add a fade tail.
            const mainDuration = explosion.duration || 500;
            const tailDuration = Math.floor(mainDuration * 1.6); // smoke / glow fade
            const totalDuration = mainDuration + tailDuration;
            const elapsed = now - explosion.startTime;

            if (elapsed >= totalDuration) {
                this.explosions.splice(i, 1);
                continue;
            }

            // Two-phase progress: blast (0..1) then tail (0..1)
            const blastT = Math.min(1, elapsed / mainDuration);
            const tailT = elapsed > mainDuration
                ? (elapsed - mainDuration) / tailDuration
                : 0;

            // Color palette by missile type
            const palette = this._explosionPalette(explosion);
            const maxRadius = explosion.explosionRadius || 80;

            // Eased blast scale: punchy out, slow settle
            const scale = blastT < 1
                ? 1 - Math.pow(1 - blastT, 3) // easeOutCubic
                : 1;
            const r = maxRadius * scale;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Layer 1: outer fireball (radial gradient, fading with tail)
            const fireballAlpha = (1 - blastT * 0.4) * (1 - tailT) * 0.85;
            if (fireballAlpha > 0.01) {
                const grad = ctx.createRadialGradient(
                    explosion.x, explosion.y, r * 0.05,
                    explosion.x, explosion.y, r
                );
                grad.addColorStop(0, palette.core);
                grad.addColorStop(0.35, palette.inner);
                grad.addColorStop(0.75, palette.outer);
                grad.addColorStop(1, palette.transparent);
                ctx.globalAlpha = fireballAlpha;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(explosion.x, explosion.y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            // Layer 2: white-hot core flash (very brief, only first 30% of blast)
            if (blastT < 0.35) {
                const flashT = blastT / 0.35;
                const flashAlpha = (1 - flashT) * 0.95;
                const flashR = r * (0.15 + flashT * 0.25);
                const fg = ctx.createRadialGradient(
                    explosion.x, explosion.y, 0,
                    explosion.x, explosion.y, flashR
                );
                fg.addColorStop(0, '#ffffff');
                fg.addColorStop(0.4, palette.core);
                fg.addColorStop(1, palette.transparent);
                ctx.globalAlpha = flashAlpha;
                ctx.fillStyle = fg;
                ctx.beginPath();
                ctx.arc(explosion.x, explosion.y, flashR, 0, Math.PI * 2);
                ctx.fill();
            }

            // Layer 3: expanding ring (impact wavefront)
            if (blastT < 0.8) {
                const ringT = blastT / 0.8;
                const ringR = maxRadius * (0.4 + ringT * 0.85);
                const ringAlpha = (1 - ringT) * 0.85;
                ctx.globalAlpha = ringAlpha;
                ctx.strokeStyle = palette.ringHot;
                ctx.lineWidth = 4 + (1 - ringT) * 4;
                ctx.beginPath();
                ctx.arc(explosion.x, explosion.y, ringR, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Layer 4: lingering smoke / heat shimmer (the "tail" that prevents poof)
            if (tailT > 0) {
                const smokeR = r * (1 + tailT * 0.4);
                const smokeAlpha = (1 - tailT) * (1 - tailT) * 0.45; // quadratic fade
                const sg = ctx.createRadialGradient(
                    explosion.x, explosion.y, 0,
                    explosion.x, explosion.y, smokeR
                );
                sg.addColorStop(0, palette.smoke);
                sg.addColorStop(0.7, palette.smokeFade);
                sg.addColorStop(1, palette.transparent);
                ctx.globalAlpha = smokeAlpha;
                ctx.fillStyle = sg;
                ctx.beginPath();
                ctx.arc(explosion.x, explosion.y, smokeR, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    // Color palette per explosion type
    _explosionPalette(explosion) {
        if (explosion.isSuperMissile) {
            return {
                core: '#ffffff',
                inner: '#d8a0ff',
                outer: '#7a30c8',
                ringHot: '#c896ff',
                smoke: 'rgba(120, 60, 180, 0.6)',
                smokeFade: 'rgba(60, 20, 100, 0.2)',
                transparent: 'rgba(50, 0, 100, 0)',
                particleColors: ['#ffffff', '#d8a0ff', '#9370DB', '#7a30c8'],
                shake: 12,
                shakeMs: 240
            };
        } else if (explosion.isBossMissile) {
            return {
                core: '#ffffff',
                inner: '#ffb060',
                outer: '#c52020',
                ringHot: '#ff7050',
                smoke: 'rgba(140, 30, 20, 0.55)',
                smokeFade: 'rgba(60, 10, 5, 0.15)',
                transparent: 'rgba(80, 0, 0, 0)',
                particleColors: ['#ffffff', '#ffd070', '#ff7030', '#b21010'],
                shake: 6,
                shakeMs: 160
            };
        } else {
            return {
                core: '#ffffff',
                inner: '#ffe080',
                outer: '#ff5520',
                ringHot: '#ffb060',
                smoke: 'rgba(140, 80, 30, 0.5)',
                smokeFade: 'rgba(80, 40, 10, 0.15)',
                transparent: 'rgba(80, 30, 0, 0)',
                particleColors: ['#ffffff', '#ffe080', '#ff8030', '#c54010'],
                shake: 5,
                shakeMs: 140
            };
        }
    }

    // Spawn physics particles + shockwave + screen shake the moment the explosion is born.
    _initExplosionFX(explosion) {
        if (typeof bossFX === 'undefined') return;
        const palette = this._explosionPalette(explosion);
        const r = explosion.explosionRadius || 80;
        const isLarge = explosion.isSuperMissile;
        const sizeMul = isLarge ? 1.8 : 1.0;

        // Hot debris — fast, short-lived white/yellow shards
        for (let k = 0; k < (isLarge ? 28 : 18); k++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = (5 + Math.random() * 9) * sizeMul;
            bossFX.particles.push({
                x: explosion.x, y: explosion.y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                size: 2 + Math.random() * 3,
                color: palette.particleColors[Math.floor(Math.random() * 2)],
                lifeMs: 380 + Math.random() * 220,
                gravity: 0.05,
                drag: 0.92,
                alpha: 1,
                startedAt: Date.now()
            });
        }
        // Slower embers — longer life, color drifts to dark
        for (let k = 0; k < (isLarge ? 22 : 14); k++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = (1.5 + Math.random() * 4.5) * sizeMul;
            bossFX.particles.push({
                x: explosion.x, y: explosion.y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                size: 3 + Math.random() * 4,
                color: palette.particleColors[2 + Math.floor(Math.random() * 2)],
                lifeMs: 700 + Math.random() * 500,
                gravity: 0.02,
                drag: 0.95,
                alpha: 0.85,
                startedAt: Date.now()
            });
        }
        // Shockwave ring (separate from the in-explosion ring; flies further out)
        bossFX.addShockwave(
            explosion.x, explosion.y,
            r * 0.5, r * 1.9,
            palette.ringHot,
            isLarge ? 700 : 450,
            isLarge ? 5 : 3,
            0.7
        );
        // Punch flash (very short, additive, sells the impact)
        bossFX.addFlash(explosion.x, explosion.y, r * 0.7, palette.core, 180, 0.9);
        // Screen shake
        bossFX.addShake(palette.shake * sizeMul, palette.shakeMs);
    }
    
    drawSpinSlashEffects() {
        if (!this.spinSlashEffects) {
            this.spinSlashEffects = [];
            return;
        }

        const now = Date.now();
        const ctx = this.ctx;

        for (let i = this.spinSlashEffects.length - 1; i >= 0; i--) {
            const effect = this.spinSlashEffects[i];
            const elapsed = now - effect.startTime;

            if (elapsed > effect.duration) {
                this.spinSlashEffects.splice(i, 1);
                continue;
            }

            const progress = elapsed / effect.duration;
            const ease = 1 - Math.pow(1 - progress, 2.4);
            const fade = Math.pow(1 - progress, 1.4);
            const radius = effect.radius * (0.85 + ease * 0.6);
            const phase = effect.phase || 1;
            const scheme = phase === 1 ? 'azure' : 'cyan';

            const x = effect.x;
            const y = effect.y;

            // 1) Big radial impact flash (fades fast)
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const flashAlpha = fade;
            const flashGrad = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius * 1.15);
            const haloRGB = phase === 1 ? '120,200,255' : '160,230,255';
            flashGrad.addColorStop(0, `rgba(255,255,255,${0.55 * flashAlpha})`);
            flashGrad.addColorStop(0.35, `rgba(${haloRGB},${0.5 * flashAlpha})`);
            flashGrad.addColorStop(1, `rgba(${haloRGB},0)`);
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.15, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 2) Multi-layer crescent slash arcs (use weapon FX helper if available)
            // Two opposing arcs sweep around the boss to convey rotational slash.
            const sweepDir = phase === 1 ? 1 : -1;
            const sweep = Math.PI * 1.15 * (0.6 + ease * 0.4); // 沿圆周的扫过角度
            const baseAngle = (phase === 1 ? -Math.PI / 4 : Math.PI / 4) +
                              elapsed / 90 * sweepDir;
            const thickness = (phase === 1 ? 8 : 11) * (1.0 - progress * 0.4);

            for (let k = 0; k < 2; k++) {
                const start = baseAngle + k * Math.PI;
                const end = start + sweep * sweepDir;
                if (typeof drawSlashArc === 'function') {
                    drawSlashArc(ctx, {
                        x, y,
                        radius: radius * 0.92,
                        startAngle: Math.min(start, end),
                        endAngle: Math.max(start, end),
                        thickness,
                        scheme,
                        alpha: 1,
                        progress
                    });
                } else {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = fade * 0.9;
                    ctx.strokeStyle = phase === 1 ? '#80c8ff' : '#a8e8ff';
                    ctx.lineWidth = thickness;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(x, y, radius * 0.92, Math.min(start, end), Math.max(start, end));
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // 3) Outer expanding shock ring (additive, soft)
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = fade * 0.7;
            const ringR = radius * (0.95 + progress * 0.3);
            ctx.strokeStyle = phase === 1 ? '#a0d8ff' : '#c0f0ff';
            ctx.lineWidth = Math.max(1.5, 4 * fade);
            ctx.beginPath();
            ctx.arc(x, y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            // Secondary thin ring offset behind
            ctx.globalAlpha = fade * 0.4;
            ctx.lineWidth = Math.max(1, 2 * fade);
            ctx.beginPath();
            ctx.arc(x, y, ringR * 0.85, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 4) Bright inner core disc (diminishes quickly)
            if (progress < 0.6) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const coreAlpha = (0.6 - progress) * 1.6;
                const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.5);
                coreGrad.addColorStop(0, `rgba(255,255,255,${coreAlpha})`);
                coreGrad.addColorStop(0.6, `rgba(${haloRGB},${coreAlpha * 0.7})`);
                coreGrad.addColorStop(1, `rgba(${haloRGB},0)`);
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // 5) Radial slash streaks (sharp lines, only briefly visible)
            if (progress < 0.55) {
                const streakAlpha = (0.55 - progress) * 1.8;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = streakAlpha;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                const streaks = 6;
                const baseStreakAng = elapsed / 60 * sweepDir;
                for (let s = 0; s < streaks; s++) {
                    const a = baseStreakAng + (s / streaks) * Math.PI * 2;
                    const r1 = radius * (0.45 + Math.random() * 0.1);
                    const r2 = radius * (1.05 + Math.random() * 0.1);
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
                    ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // One-time burst of impact sparks at slash creation (phase 2 = bigger)
            if (!effect._sparked) {
                effect._sparked = true;
                if (typeof drawImpactSparks === 'function' && typeof bossFX !== 'undefined') {
                    drawImpactSparks({
                        x, y,
                        count: phase === 1 ? 14 : 22,
                        scheme,
                        speed: phase === 1 ? 5 : 7,
                        lifeMs: 460
                    });
                }
                if (typeof bossFX !== 'undefined') {
                    bossFX.addShockwave(x, y, radius * 0.35, radius * 1.0,
                        phase === 1 ? '#80c8ff' : '#a8e8ff',
                        300, phase === 1 ? 4 : 5, 0.6);
                    bossFX.addShake(phase === 1 ? 3 : 5, phase === 1 ? 140 : 200);
                }
            }
        }
    }
    
    drawTeleportEffects() {
        if (!this.teleportEffects) {
            this.teleportEffects = [];
            return;
        }

        const now = Date.now();
        for (let i = this.teleportEffects.length - 1; i >= 0; i--) {
            const effect = this.teleportEffects[i];
            const elapsed = now - effect.startTime;

            if (elapsed > effect.duration) {
                this.teleportEffects.splice(i, 1);
                continue;
            }

            this._drawTeleportEffect(effect, elapsed);
        }
    }

    // Modern, multi-layer teleport burst (replaces the old dashed-circle version).
    // Two palettes: ember (UglyEmperor) and frost (everything else, e.g. SublimeMoon).
    _drawTeleportEffect(effect, elapsed) {
        const ctx = this.ctx;
        const t = Math.min(1, elapsed / effect.duration);
        const isArrival = effect.type === 'arrival';
        // Departure: things contract toward a point and pop. Arrival: things
        // explode outward from a point and settle. We invert progress for
        // departure so visuals "implode" instead of "expand".
        const p = isArrival ? t : t;       // for outward growth (rings, sparks)
        const pIn = isArrival ? t : 1 - t; // for inward collapse layers
        const fade = 1 - t;
        const ease = (k) => 1 - (1 - k) * (1 - k); // easeOutQuad

        // Scheme
        const ember = !!effect.isUglyEmperor;
        const C = ember
            ? { hot: '#fff2c8', mid: '#ff8a3a', edge: '#ff4500', glow: 'rgba(255,140,40,', ring: '#ffb56b' }
            : { hot: '#f0fbff', mid: '#9fd8ff', edge: '#3aa9ff', glow: 'rgba(120,200,255,', ring: '#bfeaff' };

        ctx.save();

        // ---- 1) Outer expanding shock ring (additive) -----------------------
        ctx.globalCompositeOperation = 'lighter';
        const ringR = (isArrival ? 12 + ease(p) * 56 : 60 - ease(t) * 50);
        const ringAlpha = fade * 0.85;
        const ringGrad = ctx.createRadialGradient(effect.x, effect.y, ringR * 0.6, effect.x, effect.y, ringR);
        ringGrad.addColorStop(0, C.glow + '0)');
        ringGrad.addColorStop(0.7, C.glow + (0.5 * fade).toFixed(3) + ')');
        ringGrad.addColorStop(1, C.glow + '0)');
        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, ringR, 0, Math.PI * 2);
        ctx.fill();

        // Crisp inner ring stroke for definition
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = C.ring;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, ringR * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // ---- 2) Bright core flash (very brief, peaks early) -----------------
        const corePeak = isArrival ? Math.max(0, 1 - t * 1.6) : Math.max(0, 1 - (1 - t) * 1.6);
        if (corePeak > 0) {
            const coreR = 22 * corePeak + 6;
            const coreGrad = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, coreR);
            coreGrad.addColorStop(0, C.hot);
            coreGrad.addColorStop(0.4, C.mid);
            coreGrad.addColorStop(1, C.glow + '0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, coreR, 0, Math.PI * 2);
            ctx.fill();
        }

        // ---- 3) Vertical light pillar (taller on arrival, fades fast) -------
        const pillarLife = isArrival ? Math.max(0, 1 - t * 1.4) : Math.max(0, 1 - (1 - t) * 1.4);
        if (pillarLife > 0) {
            const pillarH = 110 * pillarLife;
            const pillarW = 18 * pillarLife + 4;
            const pillarGrad = ctx.createLinearGradient(effect.x, effect.y - pillarH, effect.x, effect.y + pillarH * 0.3);
            pillarGrad.addColorStop(0, C.glow + '0)');
            pillarGrad.addColorStop(0.5, C.glow + (0.55 * pillarLife).toFixed(3) + ')');
            pillarGrad.addColorStop(1, C.glow + '0)');
            ctx.fillStyle = pillarGrad;
            ctx.fillRect(effect.x - pillarW / 2, effect.y - pillarH, pillarW, pillarH * 1.3);
        }

        // ---- 4) Radial sparks / shards --------------------------------------
        const sparkCount = 10;
        const sparkLen = (isArrival ? 14 + ease(p) * 28 : 6 + ease(1 - t) * 30);
        ctx.lineWidth = 1.4;
        for (let i = 0; i < sparkCount; i++) {
            const seedAngle = (i / sparkCount) * Math.PI * 2 + (effect.startTime % 1000) * 0.001;
            const wob = Math.sin((effect.startTime + i * 137) * 0.01 + t * 8) * 0.15;
            const a = seedAngle + wob;
            const r0 = isArrival ? 8 : sparkLen + 4;
            const r1 = isArrival ? sparkLen + 8 : 8;
            const x0 = effect.x + Math.cos(a) * r0;
            const y0 = effect.y + Math.sin(a) * r0;
            const x1 = effect.x + Math.cos(a) * r1;
            const y1 = effect.y + Math.sin(a) * r1;
            const lg = ctx.createLinearGradient(x0, y0, x1, y1);
            lg.addColorStop(0, C.glow + '0)');
            lg.addColorStop(0.5, C.hot);
            lg.addColorStop(1, C.glow + '0)');
            ctx.strokeStyle = lg;
            ctx.globalAlpha = fade;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ---- 5) Drifting particles (ember motes / ice flakes) ---------------
        const motes = 14;
        for (let i = 0; i < motes; i++) {
            const seed = (i * 73 + (effect.startTime % 977)) * 0.01;
            const a = (i / motes) * Math.PI * 2 + Math.sin(seed) * 0.4;
            const r = (isArrival ? 6 + ease(p) * 46 : 50 - ease(t) * 44) + Math.cos(seed * 2) * 4;
            const px = effect.x + Math.cos(a) * r;
            const py = effect.y + Math.sin(a) * r - (isArrival ? 0 : t * 18);
            const moteR = (1.4 + Math.sin(seed * 5) * 0.6) * (isArrival ? (1 - t * 0.4) : (1 - t));
            if (moteR <= 0) continue;
            const mg = ctx.createRadialGradient(px, py, 0, px, py, moteR * 3);
            mg.addColorStop(0, C.hot);
            mg.addColorStop(0.5, C.glow + (0.6 * fade).toFixed(3) + ')');
            mg.addColorStop(1, C.glow + '0)');
            ctx.fillStyle = mg;
            ctx.beginPath();
            ctx.arc(px, py, moteR * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    
    drawBoomerangHitEffects() {
        if (!this.boomerangHitEffects) {
            this.boomerangHitEffects = [];
            return;
        }
        
        for (let i = this.boomerangHitEffects.length - 1; i >= 0; i--) {
            const effect = this.boomerangHitEffects[i];
            const elapsed = Date.now() - effect.startTime;
            
            if (elapsed > effect.duration) {
                this.boomerangHitEffects.splice(i, 1);
                continue;
            }
            
            const progress = elapsed / effect.duration;
            const alpha = 1 - progress;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            
            // 回旋镖命中的月牙形爆炸效果
            for (let j = 0; j < 4; j++) {
                const angle = (Math.PI / 2) * j + progress * Math.PI;
                const distance = progress * 20;
                
                this.ctx.translate(effect.x + Math.cos(angle) * distance, 
                                 effect.y + Math.sin(angle) * distance);
                this.ctx.rotate(angle);
                
                // 小月牙形状
                this.ctx.strokeStyle = '#00CCFF';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 6, 0, Math.PI);
                this.ctx.arc(0, -2, 4, Math.PI, 0, true);
                this.ctx.closePath();
                this.ctx.stroke();
                
                this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
            }

            this.ctx.restore();
        }
    }

    drawGameUI() {
        if (!this.player) return;
        const ctx = this.ctx;
        const W = GAME_CONFIG.WIDTH;

        // ---------- LEFT: Mech status panel ----------
        const panelX = 14;
        const panelY = 14;
        const panelW = 320;
        const panelH = 268;

        uiDrawPanel(ctx, panelX, panelY, panelW, panelH, {
            chamfer: 10,
            fill: { from: 'rgba(6, 12, 16, 0.78)', to: 'rgba(10, 18, 24, 0.78)' },
            stroke: UI_THEME.color.primaryDim,
            strokeWidth: 1
        });

        // Panel header: mech name
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// PILOT STATUS', panelX + 14, panelY + 16);

        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `bold 16px ${UI_THEME.font.display}`;
        // Pilot's mech callsign (e.g. "Scorchfrost") sits where the
        // mech-type readout used to be — the chassis archetype is now
        // shown as a smaller subtitle right beneath it.
        const _callsign = (gameState && gameState.mechName) ? gameState.mechName : 'Scorchfrost';
        ctx.fillText(_callsign, panelX + 14, panelY + 36);
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.fillText(t('hud.mech', t('mech.' + this.player.mechType)), panelX + 14, panelY + 56);
        ctx.restore();

        // Divider (sits just below the chassis subtitle)
        ctx.strokeStyle = UI_THEME.color.primaryDim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(panelX + 14, panelY + 70);
        ctx.lineTo(panelX + panelW - 14, panelY + 70);
        ctx.stroke();
        ctx.restore();

        // ---------- HP bar (top of panel) ----------
        const hpBarX = panelX + 14;
        const hpBarY = panelY + 80;
        const hpBarW = panelW - 28;
        const hpBarH = 18;
        const hpPct = Math.max(0, this.player.health / this.player.maxHealth);
        let hpColor = UI_THEME.color.success;
        if (hpPct <= 0.3) hpColor = UI_THEME.color.danger;
        else if (hpPct <= 0.6) hpColor = UI_THEME.color.warning;

        ctx.save();
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('HP', hpBarX, hpBarY - 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = hpColor;
        ctx.fillText(`${this.player.health} / ${this.player.maxHealth}`, hpBarX + hpBarW, hpBarY - 2);
        ctx.restore();

        // HP bar background + fill (segmented)
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH);
        ctx.fillStyle = hpColor;
        if (hpPct < 0.3) {
            const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 150);
            ctx.globalAlpha = pulse;
        }
        ctx.fillRect(hpBarX, hpBarY, hpBarW * hpPct, hpBarH);
        ctx.globalAlpha = 1;
        // Segment ticks
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 10; i++) {
            const sx = hpBarX + (hpBarW / 10) * i;
            ctx.beginPath();
            ctx.moveTo(sx, hpBarY);
            ctx.lineTo(sx, hpBarY + hpBarH);
            ctx.stroke();
        }
        // Border
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH);

        // Overflow HP overlay (Repair Protocol bank): green chevrons stacked
        // on top of the HP bar, scaled to overflowHpMax (not maxHealth) so it
        // visually reads as "extra shield".
        if (this.player.overflowHp > 0 && this.player.overflowHpMax > 0) {
            const ovFrac = Math.min(1, this.player.overflowHp / this.player.overflowHpMax);
            const ovW = hpBarW * 0.45 * ovFrac;
            ctx.fillStyle = 'rgba(80,255,140,0.85)';
            ctx.fillRect(hpBarX, hpBarY, ovW, 4);
            ctx.strokeStyle = 'rgba(120,255,170,0.9)';
            ctx.strokeRect(hpBarX, hpBarY, ovW, 4);
        }
        ctx.restore();

        // Invincible badge under HP bar
        if (this.player.isInvincible) {
            ctx.save();
            ctx.fillStyle = UI_THEME.color.warning;
            ctx.font = `bold 11px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText('● ' + t('hud.invincible'), hpBarX + hpBarW, hpBarY + hpBarH + 4);
            ctx.restore();
        }

        // ---------- Weapon / utility rows ----------
        const rowStartY = panelY + 116;
        const rowH = 18;
        const labelX = panelX + 14;
        const statusX = panelX + 78;
        let row = 0;

        const drawRow = (key, label, status, isActive) => {
            const y = rowStartY + row * rowH;
            row++;
            // Key cap
            ctx.save();
            ctx.fillStyle = isActive ? UI_THEME.color.primary : UI_THEME.color.textMuted;
            ctx.font = `bold 11px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(key, labelX, y + rowH / 2);
            // Label/status text
            ctx.fillStyle = isActive ? UI_THEME.color.textPrimary : UI_THEME.color.textMuted;
            ctx.font = `12px ${UI_THEME.font.body}`;
            ctx.fillText(label, labelX + 28, y + rowH / 2);
            // Status (right-aligned)
            ctx.fillStyle = status.color || UI_THEME.color.textSecondary;
            ctx.font = `11px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'right';
            ctx.fillText(status.text, panelX + panelW - 14, y + rowH / 2);
            ctx.restore();
        };

        // Helper: build display text for a weapon
        const weaponStatus = (weapon, fallbackKey) => {
            if (!weapon) return { text: t(fallbackKey), color: UI_THEME.color.textMuted };
            if (!this.player.canAttack()) return { text: t('hud.dodgeLimit'), color: UI_THEME.color.warning };
            const s = weapon.getStatus();
            return { text: `${t('weapon.' + weapon.type)} · ${s.text}`, color: s.color };
        };

        const leftWeapon = this.player.getLeftHandWeapon();
        drawRow('LMB', t('hud.leftKey').replace(/[:：]/g, '').trim(), weaponStatus(leftWeapon, 'hud.noWeapon'), !!leftWeapon);

        const rightWeapon = this.player.getRightHandWeapon();
        drawRow('RMB', t('hud.rightKey').replace(/[:：]/g, '').trim(), weaponStatus(rightWeapon, 'hud.noWeapon'), !!rightWeapon);

        const leftShoulder = this.player.getLeftShoulderWeapon();
        drawRow('Q', t('hud.qKey').replace(/[:：]/g, '').trim(), weaponStatus(leftShoulder, 'hud.noLeftShoulder'), !!leftShoulder);

        const rightShoulder = this.player.getRightShoulderWeapon();
        drawRow('E', t('hud.eKey').replace(/[:：]/g, '').trim(), weaponStatus(rightShoulder, 'hud.noRightShoulder'), !!rightShoulder);

        const hidden = this.player.getHiddenAbilityWeapon();
        drawRow('SHIFT', t('hud.shiftKey').replace(/[:：]/g, '').trim(), weaponStatus(hidden, 'hud.noHidden'), !!hidden);

        // Dodge
        const dodgeStatus = this.player.getDodgeStatus();
        drawRow('SPACE', t('hud.dodgeKey').replace(/[:：]/g, '').trim(),
            { text: dodgeStatus.text, color: dodgeStatus.color }, true);

        // Lock mode
        const lockText = this.player.getLockModeText();
        drawRow('F', t('hud.lockKey').replace(/[:：]/g, '').trim(),
            { text: lockText, color: gameState.lockMode === 'manual' ? UI_THEME.color.warning : UI_THEME.color.primary },
            true);

        // Hard-lock target switch hint
        if (gameState.lockMode === 'hard') {
            drawRow('C', t('hud.cKey').replace(/[:：]/g, '').trim(),
                { text: t('hud.switchTarget'), color: '#87CEEB' }, true);
        }

        // Repair kit
        if (gameState.repairKits > 0) {
            drawRow('CTRL', t('hud.ctrlKey').replace(/[:：]/g, '').trim(),
                { text: `${gameState.repairKits} / ${gameState.maxRepairKits}`, color: UI_THEME.color.success }, true);
        } else {
            drawRow('CTRL', t('hud.ctrlKey').replace(/[:：]/g, '').trim(),
                { text: t('hud.repairEmpty'), color: UI_THEME.color.danger }, false);
        }

        // ---------- TOP-RIGHT: mode info ----------
        const infoW = 240;
        const infoH = 64;
        const infoX = W - infoW - 14;
        const infoY = 14;
        uiDrawPanel(ctx, infoX, infoY, infoW, infoH, {
            chamfer: 10,
            fill: { from: 'rgba(6, 12, 16, 0.78)', to: 'rgba(10, 18, 24, 0.78)' },
            stroke: UI_THEME.color.primaryDim,
            strokeWidth: 1
        });
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// MISSION', infoX + 14, infoY + 16);
        const currentMode = GAME_MODES[gameState.selectedGameMode];
        ctx.fillStyle = currentMode.color;
        ctx.font = `bold 14px ${UI_THEME.font.display}`;
        ctx.fillText(t('hud.mode', t('mode.' + gameState.selectedGameMode)), infoX + 14, infoY + 36);
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.fillText(t('hud.bossKills', gameState.bossKillCount), infoX + 14, infoY + 52);
        ctx.restore();

        // Boss HP bar (top center)
        if (this.boss) {
            this.drawBossHealthBar();
            this.drawBossDamageStream();
        } else if (this.bossDamageStream && this.bossDamageStream.length > 0) {
            // Boss is gone but the last hits are still flying — keep
            // drawing the stream until they expire (fade-out).
            this.drawBossDamageStream();
        }

        // Bottom-left pause button (the redundant Main Menu button has
        // been removed — pausing the game already exposes a Return-to-
        // Menu CTA, and ESC also goes home; the HUD button on top of
        // that was redundant clutter.)
        this.drawPauseButton();

        // Blindness overlay
        if (gameState.playerBlinded) {
            this.drawBlindnessStatusText();
        }
    }
    
    // Pull every pending hitIndicator off the active boss and any
    // sub-boss components, convert them into entries on the unified
    // damage stream, and clear the source arrays so nothing else
    // (e.g. a boss's own draw method) tries to render them in the
    // world. This is what gives us a single, top-of-screen damage
    // readout no matter which boss class fired the hit.
    _drainBossHitIndicators() {
        if (!this.boss) return;
        const sources = [];
        sources.push(this.boss);
        // Triumvirate: container has its own (rarely used) array, plus
        // each surviving member, plus the Voidborn after transition.
        if (this.boss.isTriumvirate) {
            if (Array.isArray(this.boss.members)) {
                for (const m of this.boss.members) if (m) sources.push(m);
            }
            if (this.boss.voidborn) sources.push(this.boss.voidborn);
        }
        // Magnus: shoulder pods take damage independently and have
        // their own hitIndicators arrays.
        if (this.boss.shoulderPods && Array.isArray(this.boss.shoulderPods)) {
            for (const p of this.boss.shoulderPods) if (p) sources.push(p);
        }
        for (const src of sources) {
            const arr = src && src.hitIndicators;
            if (!Array.isArray(arr) || arr.length === 0) continue;
            for (const ind of arr) {
                if (!ind || ind._streamed) continue;
                this.bossDamageStream.push({
                    dmg: Math.max(1, Math.round(ind.damage || 0)),
                    startTime: ind.startTime || Date.now(),
                    lifeMs: 1100,
                    // Alternate left / right of the bar so adjacent hits
                    // don't pile on top of each other.
                    side: (this._bossDamageStreamLaneCursor++ % 2 === 0) ? -1 : 1,
                    lane: (this._bossDamageStreamLaneCursor % 4),
                });
                ind._streamed = true;
            }
            // Clear the source so the boss's own draw can't double-render
            // these in the world.
            arr.length = 0;
        }
        // Expire stream entries.
        const now = Date.now();
        this.bossDamageStream = this.bossDamageStream.filter(
            e => now - e.startTime < e.lifeMs
        );
    }

    // Render the unified hostile-target damage readout directly under
    // the top boss HP bar. High-contrast typography, additive glow, and
    // alternating left / right lanes so it reads as a real combat-log
    // ticker rather than scattered floating numbers.
    drawBossDamageStream() {
        if (!Array.isArray(this.bossDamageStream) || this.bossDamageStream.length === 0) return;
        const ctx = this.ctx;
        const W = GAME_CONFIG.WIDTH;
        const barW = 480;
        const barH = 22;
        const barX = (W - barW) / 2;
        const barY = 32;
        // Anchor the stream just below the HP-number row (which sits
        // at barY + barH + 6 with 13px text → ~+22 below the bar).
        const anchorY = barY + barH + 28;
        const anchorX = W / 2;
        const now = Date.now();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const e of this.bossDamageStream) {
            const age = now - e.startTime;
            const t = Math.min(1, Math.max(0, age / e.lifeMs));
            // Easing: pop in fast, drift out slow.
            const popIn = Math.min(1, age / 90);
            const fadeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
            const alpha = popIn * fadeOut;
            if (alpha <= 0.02) continue;

            // Lateral drift outward from center, with a small upward rise.
            const driftX = e.side * (12 + 64 * t);
            const driftY = -16 * t + (e.lane % 2 === 0 ? 0 : 12);
            const x = anchorX + driftX;
            const y = anchorY + driftY;

            // Scale punch: starts a touch larger, settles.
            const scale = 1.15 - 0.15 * popIn;

            const big = e.dmg >= 50;       // crits get extra emphasis
            const huge = e.dmg >= 150;
            const baseSize = huge ? 28 : (big ? 24 : 20);
            const fontSize = Math.round(baseSize * scale);

            const text = `-${e.dmg}`;

            // Shadow / outer glow (additive layer).
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = alpha * 0.85;
            ctx.shadowColor = huge ? '#ffffaa' : (big ? '#ffd060' : '#ff5050');
            ctx.shadowBlur = huge ? 18 : (big ? 14 : 10);
            ctx.fillStyle = huge ? '#fff5b0' : (big ? '#ffd060' : '#ff7878');
            ctx.font = `900 ${fontSize}px ${UI_THEME.font.display}`;
            ctx.fillText(text, x, y);

            // Sharp core (normal blending) for legibility against bright BG.
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 0;
            // Heavy black stroke ring → makes the number readable on
            // any backdrop (explosions, fire, lightning, etc.).
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(text, x, y);
            ctx.fillStyle = huge ? '#ffffff' : (big ? '#fff2c8' : '#ffd0d0');
            ctx.fillText(text, x, y);

            // Tiny tick mark linking the number to the bar so it reads
            // as "this is bar damage" rather than a random score popup.
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = alpha * 0.55;
            ctx.strokeStyle = huge ? '#ffe080' : (big ? '#ffb050' : '#ff5050');
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            const tickStartX = x;
            const tickStartY = barY + barH + 4;
            const tickEndX = x;
            const tickEndY = y - fontSize / 2 - 2;
            if (tickEndY > tickStartY) {
                ctx.moveTo(tickStartX, tickStartY);
                ctx.lineTo(tickEndX, tickEndY);
                ctx.stroke();
            }
        }

        ctx.restore();
        ctx.textAlign = 'left';
    }

    drawBossHealthBar() {
        if (!this.boss) return;
        const ctx = this.ctx;
        const W = GAME_CONFIG.WIDTH;

        const barW = 480;
        const barH = 22;
        const x = (W - barW) / 2;
        const y = 32;

        // Boss name (above bar)
        let bossName = t('boss.CRIMSON_KING');
        if (this.boss instanceof SublimeMoon) bossName = t('boss.SUBLIME_MOON');
        else if (this.boss instanceof StarDevourer) bossName = t('boss.STAR_DEVOURER');
        else if (this.boss instanceof UglyEmperor) bossName = t('boss.UGLY_EMPEROR');
        else if (this.boss instanceof Magnus) bossName = t('boss.MAGNUS_EXEC');
        else if (this.boss instanceof HiveMind) bossName = t('boss.HIVE_MIND');
        else if (this.boss instanceof Yukikon) bossName = t('boss.YUKIKON');
        else if (this.boss instanceof Proteus) bossName = t('boss.PROTEUS');
        else if (this.boss instanceof Triumvirate) bossName = t('boss.TRIUMVIRATE');

        ctx.save();
        ctx.fillStyle = UI_THEME.color.danger;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('// HOSTILE TARGET', W / 2, y - 16);

        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `bold 18px ${UI_THEME.font.display}`;
        ctx.shadowColor = UI_THEME.color.dangerGlow;
        ctx.shadowBlur = 10;
        ctx.fillText(bossName, W / 2, y - 2);
        ctx.restore();

        const hpPct = Math.max(0, this.boss.health / this.boss.maxHealth);
        const displayHealth = Math.max(0, this.boss.health);

        // Bar BG
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, barW, barH);

        // Fill
        let fillColor = UI_THEME.color.danger;
        if (hpPct < 0.3) fillColor = '#ff8a3d';
        const grad = ctx.createLinearGradient(x, y, x + barW, y);
        grad.addColorStop(0, fillColor);
        grad.addColorStop(1, '#ff7575');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW * hpPct, barH);

        // Segment ticks
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 20; i++) {
            const sx = x + (barW / 20) * i;
            ctx.beginPath();
            ctx.moveTo(sx, y);
            ctx.lineTo(sx, y + barH);
            ctx.stroke();
        }

        // Border + corner brackets
        ctx.strokeStyle = UI_THEME.color.danger;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, barW, barH);
        ctx.restore();
        uiDrawCornerBrackets(ctx, x, y, barW, barH, { size: 10, offset: 4, color: UI_THEME.color.danger, lineWidth: 1.5 });

        // HP number under bar
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `13px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`HP ${displayHealth} / ${this.boss.maxHealth}`, W / 2, y + barH + 6);
        ctx.restore();

        // StarDevourer special status
        if (this.boss instanceof StarDevourer && this.boss.blindnessSkill) {
            const skill = this.boss.blindnessSkill;
            const params = this.boss.getBlindnessParams();
            const now = Date.now();

            let statusText = '';
            let statusColor = UI_THEME.color.textPrimary;

            if (skill.isActive) {
                const remaining = Math.max(0, params.duration - (now - skill.startTime));
                statusText = t('boss.blindActive', (remaining / 1000).toFixed(1));
                statusColor = '#b066ff';
            } else if (!skill.unlocked) {
                const damageTaken = this.boss.maxHealth - this.boss.health;
                const damageNeeded = 50 - damageTaken;
                if (damageNeeded > 0) {
                    statusText = t('boss.blindUnlockNeed', damageNeeded);
                    statusColor = UI_THEME.color.textMuted;
                } else {
                    statusText = t('boss.blindUnlocked');
                    statusColor = UI_THEME.color.warning;
                }
            } else {
                const cd = Math.max(0, params.cooldown - (now - skill.lastUse));
                const phaseInfo = this.boss.phaseTwo.activated ? t('boss.phase2label') : t('boss.phase1');
                if (cd > 0) {
                    statusText = t('boss.blindCooldown', (cd / 1000).toFixed(1), phaseInfo);
                    statusColor = '#ff8888';
                } else {
                    statusText = t('boss.blindReady', phaseInfo);
                    statusColor = UI_THEME.color.success;
                }
            }

            ctx.save();
            ctx.fillStyle = statusColor;
            ctx.font = `12px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(statusText, W / 2, y + barH + 24);
            ctx.restore();

            if (this.boss.phaseTwo) {
                let phaseText = '';
                let phaseColor = UI_THEME.color.textPrimary;

                if (this.boss.phaseTwo.activated) {
                    const withinRange = this.boss.isWithinDetectionRange();
                    const distance = Math.floor(this.boss.getDistanceToPlayer());
                    const maxRange = this.boss.phaseTwo.detectionRange;
                    if (withinRange) {
                        phaseText = t('boss.phase2Visible', distance, maxRange);
                        phaseColor = UI_THEME.color.success;
                    } else {
                        phaseText = t('boss.phase2Cloaked', distance, maxRange);
                        phaseColor = UI_THEME.color.danger;
                    }
                } else {
                    const triggerHealth = this.boss.phaseTwo.triggerHealth;
                    if (this.boss.health > triggerHealth) {
                        const damageNeeded = this.boss.health - triggerHealth;
                        phaseText = t('boss.phase2Trigger', damageNeeded);
                        phaseColor = UI_THEME.color.accent;
                    }
                }

                if (phaseText) {
                    ctx.save();
                    ctx.fillStyle = phaseColor;
                    ctx.font = `bold 12px ${UI_THEME.font.mono}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(phaseText, W / 2, y + barH + 42);
                    ctx.restore();
                }
            }
        }

        ctx.textAlign = 'left';
    }

    drawPauseButton() {
        const W = 88;
        const H = 36;
        const X = GAME_CONFIG.WIDTH - W - 14;
        const Y = 90;
        this.pauseButton = uiDrawButton(this.ctx, X, Y, W, H, t('ui.pauseBtn'), {
            accentColor: UI_THEME.color.warning,
            labelFont: `bold 13px ${UI_THEME.font.mono}`,
            chamfer: 6
        });
    }
    
    getGuideData() {
        return getLocalizedGuideData();
    }

    // ----- Settings page ----------------------------------------------------
    // Minimal settings screen. Currently only one feature: name your mech.
    // Implemented with a real DOM <input> overlaid on top of the canvas so
    // the player gets all the usual text-input affordances (IME, copy/paste,
    // selection, cursor) for free.
    _ensureSettingsInput() {
        if (this._settingsInputEl) return this._settingsInputEl;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.maxLength = 24;
        inp.spellcheck = false;
        inp.autocomplete = 'off';
        inp.style.position = 'fixed';
        inp.style.zIndex = '9999';
        inp.style.padding = '10px 14px';
        inp.style.fontFamily = UI_THEME.font.mono;
        inp.style.fontSize = '20px';
        inp.style.fontWeight = '600';
        inp.style.letterSpacing = '1px';
        inp.style.color = '#e8f4ff';
        inp.style.background = 'rgba(6, 14, 22, 0.92)';
        inp.style.border = `1.5px solid ${UI_THEME.color.primary}`;
        inp.style.borderRadius = '4px';
        inp.style.outline = 'none';
        inp.style.boxShadow = '0 0 12px rgba(95, 163, 255, 0.35) inset, 0 0 8px rgba(95, 163, 255, 0.25)';
        inp.style.display = 'none';
        inp.addEventListener('keydown', (e) => {
            // Stop game-wide handlers from also reacting to typing in
            // the settings field.
            e.stopPropagation();
            if (e.key === 'Enter') {
                this._commitSettingsInput();
                this.closeSettings(false);
            } else if (e.key === 'Escape') {
                this.closeSettings(true);
            }
        });
        document.body.appendChild(inp);
        this._settingsInputEl = inp;
        return inp;
    }

    _openSettingsInput() {
        const inp = this._ensureSettingsInput();
        inp.value = (gameState.mechName || 'Scorchfrost').slice(0, 24);
        inp.style.display = 'block';
        // Position is recomputed every frame in drawSettings() so it
        // tracks canvas resizes.
        this._settingsToast = '';
        this._settingsToastUntil = 0;
        // Defer focus to after the click handler returns so the click
        // doesn't immediately blur the field on some browsers.
        setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) {} }, 0);
    }

    _commitSettingsInput() {
        if (!this._settingsInputEl) return;
        let v = (this._settingsInputEl.value || '').trim();
        if (v.length === 0) v = 'Scorchfrost';
        if (v.length > 24) v = v.slice(0, 24);
        gameState.mechName = v;
        try { localStorage.setItem('mechName', v); } catch (_) { /* private mode */ }
        this._settingsToast = t('settings.saved');
        this._settingsToastUntil = Date.now() + 1400;
    }

    closeSettings(persist) {
        if (persist) this._commitSettingsInput();
        if (this._settingsInputEl) {
            this._settingsInputEl.style.display = 'none';
            try { this._settingsInputEl.blur(); } catch (_) {}
        }
        gameState.showSettings = false;
        gameState.showModeSelection = true;
    }

    drawSettings() {
        const ctx = this.ctx;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;

        // Title block (matches Guide / mode-select look)
        const titleY = Math.max(120, H * 0.18);
        if (typeof uiDrawTitle === 'function') {
            uiDrawTitle(ctx, W / 2, titleY, t('settings.title'), t('settings.subtitle'));
        }

        // Central panel
        const panelW = 620;
        const panelH = 320;
        const panelX = (W - panelW) / 2;
        const panelY = titleY + 70;
        uiDrawPanel(ctx, panelX, panelY, panelW, panelH, {
            chamfer: 12,
            fill: { from: 'rgba(6, 12, 16, 0.78)', to: 'rgba(10, 18, 24, 0.78)' },
            stroke: UI_THEME.color.primaryDim,
            strokeWidth: 1
        });

        // Section header
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// PILOT IDENTIFICATION', panelX + 22, panelY + 26);
        ctx.restore();

        // Field label
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `bold 22px ${UI_THEME.font.display}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(t('settings.mechNameLabel'), panelX + 22, panelY + 60);

        ctx.fillStyle = UI_THEME.color.textMuted;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.fillText(t('settings.mechNameHint'), panelX + 22, panelY + 92);
        ctx.restore();

        // DOM input position — overlay over the canvas in screen space.
        // Canvas is full-window in this game so canvas coords ≈ viewport.
        const inputW = panelW - 44;
        const inputH = 44;
        const inputCanvasX = panelX + 22;
        const inputCanvasY = panelY + 122;

        // Decorative frame underneath the DOM input (so even if the
        // DOM element is briefly missing the screen still looks right).
        ctx.save();
        ctx.fillStyle = 'rgba(6, 14, 22, 0.92)';
        ctx.strokeStyle = UI_THEME.color.primary;
        ctx.lineWidth = 1.5;
        ctx.fillRect(inputCanvasX, inputCanvasY, inputW, inputH);
        ctx.strokeRect(inputCanvasX, inputCanvasY, inputW, inputH);
        ctx.restore();

        const inp = this._ensureSettingsInput();
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        inp.style.left = (rect.left + inputCanvasX * scaleX) + 'px';
        inp.style.top = (rect.top + inputCanvasY * scaleY) + 'px';
        inp.style.width = (inputW * scaleX - 28) + 'px';
        inp.style.height = (inputH * scaleY - 20) + 'px';
        if (inp.style.display === 'none') inp.style.display = 'block';

        // Action buttons
        const btnY = panelY + panelH - 64;
        const btnH = 44;
        const saveW = 140;
        const resetW = 160;
        const backW = 140;
        const totalBtnW = saveW + resetW + backW + 24;
        let bx = panelX + (panelW - totalBtnW) / 2;
        this.settingsSaveButton = uiDrawButton(ctx, bx, btnY, saveW, btnH, t('settings.save'), {
            accentColor: UI_THEME.color.primary,
            labelFont: `bold 16px ${UI_THEME.font.display}`,
            chamfer: 8
        });
        bx += saveW + 12;
        this.settingsResetButton = uiDrawButton(ctx, bx, btnY, resetW, btnH, t('settings.reset'), {
            accentColor: UI_THEME.color.warning,
            labelFont: `bold 14px ${UI_THEME.font.display}`,
            chamfer: 8
        });
        bx += resetW + 12;
        this.settingsBackButton = uiDrawButton(ctx, bx, btnY, backW, btnH, t('settings.back'), {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `bold 16px ${UI_THEME.font.display}`,
            chamfer: 8
        });

        // Toast (shown briefly on save).
        if (this._settingsToast && Date.now() < this._settingsToastUntil) {
            ctx.save();
            ctx.fillStyle = UI_THEME.color.success || '#7df9ff';
            ctx.font = `12px ${UI_THEME.font.mono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('// ' + this._settingsToast, W / 2, btnY - 18);
            ctx.restore();
        }

        // ----- Contact card -----
        // Lightweight info-only panel that sits below the main settings
        // panel. Lists the author's contact channels (currently just
        // Bilibili). No interactive elements — players can read and
        // copy the UID manually.
        const contactW = panelW;
        const contactH = 116;
        const contactX = panelX;
        const contactY = panelY + panelH + 18;
        // Make sure it fits above the footer hint.
        if (contactY + contactH < H - 60) {
            uiDrawPanel(ctx, contactX, contactY, contactW, contactH, {
                chamfer: 10,
                fill: { from: 'rgba(8, 14, 18, 0.72)', to: 'rgba(12, 20, 26, 0.72)' },
                stroke: UI_THEME.color.primaryDim,
                strokeWidth: 1
            });

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // Section header
            ctx.fillStyle = UI_THEME.color.primary;
            ctx.font = `12px ${UI_THEME.font.mono}`;
            ctx.fillText(t('settings.contactHeader'), contactX + 18, contactY + 22);

            // Friendly greeting
            ctx.fillStyle = UI_THEME.color.textPrimary;
            ctx.font = `bold 16px ${UI_THEME.font.display}`;
            ctx.fillText(t('settings.contactGreeting'), contactX + 18, contactY + 50);

            // Bilibili handle (highlighted)
            ctx.fillStyle = '#7df9ff';
            ctx.font = `bold 14px ${UI_THEME.font.mono}`;
            ctx.fillText(t('settings.contactBili'), contactX + 18, contactY + 76);

            // UID line (mono, muted)
            ctx.fillStyle = UI_THEME.color.textSecondary;
            ctx.font = `13px ${UI_THEME.font.mono}`;
            ctx.fillText(t('settings.contactBiliUid'), contactX + 18, contactY + 98);

            ctx.restore();
        }

        // Footer hint (ESC to go back, Enter to save)
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textMuted;
        ctx.font = `11px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('// ENTER = SAVE  //  ESC = BACK', W / 2, H - 40);
        ctx.restore();

        if (typeof uiDrawScreenFrame === 'function') uiDrawScreenFrame(ctx, W, H);
        if (typeof uiDrawScanlines === 'function') uiDrawScanlines(ctx, W, H);
    }

    drawGuide() {
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        // Top status header
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('// FIELD MANUAL', 50, 32);
        ctx.restore();

        this.guideButtons = [];

        if (!gameState.guideCategory) {
            // Main catalog
            uiDrawTitle(ctx, W / 2, 70, t('menu.guide'), 'TACTICAL DATABASE', {
                mainFont: `bold 32px ${UI_THEME.font.display}`,
                subFont: `12px ${UI_THEME.font.mono}`
            });

            const categories = this.getGuideData();
            const btnW = 420;
            const btnH = 56;
            const startY = 150;
            const gap = 12;

            categories.forEach((cat, i) => {
                const bx = W / 2 - btnW / 2;
                const by = startY + i * (btnH + gap);
                const rect = uiDrawButton(ctx, bx, by, btnW, btnH, cat.name, {
                    accentColor: cat.color,
                    labelFont: `bold 18px ${UI_THEME.font.display}`,
                    labelLetterSpacing: 1,
                    chamfer: 8
                });
                // Index marker on the right
                ctx.save();
                ctx.fillStyle = UI_THEME.color.textMuted;
                ctx.font = `11px ${UI_THEME.font.mono}`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(`SEC.0${i + 1} ▶`, bx + btnW - 16, by + btnH / 2);
                ctx.restore();
                this.guideButtons.push({ ...rect, action: 'category', id: cat.id });
            });

            this._drawGuideBackButton(t('menu.backToMenu'));

        } else if (gameState.guideSubItem === null) {
            const categories = this.getGuideData();
            const cat = categories.find(c => c.id === gameState.guideCategory);
            if (!cat) return;

            // Section title with accent strip
            ctx.save();
            ctx.fillStyle = cat.color;
            ctx.fillRect(W / 2 - 240, 56, 4, 28);
            ctx.fillStyle = cat.color;
            ctx.font = `bold 26px ${UI_THEME.font.display}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            if (cat.color) {
                ctx.shadowColor = cat.color;
                ctx.shadowBlur = 10;
            }
            ctx.fillText(cat.name, W / 2 - 224, 70);
            ctx.restore();

            if (cat.content) {
                // Text page (scrollable)
                const startY = 110;
                const lineH = 26;
                const textX = W / 2 - 240;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                cat.content.forEach((line, i) => {
                    const y = startY + i * lineH - gameState.guideScrollOffset;
                    if (y < 95 || y > H - 70) return;
                    if (line.startsWith('【')) {
                        ctx.fillStyle = UI_THEME.color.textPrimary;
                        ctx.font = `bold 16px ${UI_THEME.font.display}`;
                    } else if (line.startsWith('—')) {
                        ctx.fillStyle = cat.color;
                        ctx.font = `bold 15px ${UI_THEME.font.body}`;
                    } else {
                        ctx.fillStyle = UI_THEME.color.textSecondary;
                        ctx.font = `15px ${UI_THEME.font.body}`;
                    }
                    ctx.fillText(line, textX, y);
                });
            } else if (cat.items) {
                // Sub-item list
                const btnW = 420;
                const btnH = 50;
                const startY = 110;
                const gap = 10;

                cat.items.forEach((item, i) => {
                    const bx = W / 2 - btnW / 2;
                    const by = startY + i * (btnH + gap);
                    const rect = uiDrawButton(ctx, bx, by, btnW, btnH, item.name, {
                        accentColor: item.color,
                        labelFont: `bold 16px ${UI_THEME.font.display}`,
                        chamfer: 8
                    });
                    ctx.save();
                    ctx.fillStyle = UI_THEME.color.textMuted;
                    ctx.font = `11px ${UI_THEME.font.mono}`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`#${String(i + 1).padStart(2, '0')} ▶`, bx + btnW - 16, by + btnH / 2);
                    ctx.restore();
                    this.guideButtons.push({ ...rect, action: 'subitem', index: i });
                });
            }

            this._drawGuideBackButton(t('menu.backToCatalog'));

        } else {
            // Sub-item detail
            const categories = this.getGuideData();
            const cat = categories.find(c => c.id === gameState.guideCategory);
            if (!cat || !cat.items) return;
            const item = cat.items[gameState.guideSubItem];
            if (!item) return;

            ctx.save();
            ctx.fillStyle = item.color;
            ctx.fillRect(W / 2 - 240, 56, 4, 28);
            ctx.fillStyle = item.color;
            ctx.font = `bold 24px ${UI_THEME.font.display}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            if (item.color) {
                ctx.shadowColor = item.color;
                ctx.shadowBlur = 10;
            }
            ctx.fillText(item.name, W / 2 - 224, 70);
            ctx.restore();

            const startY = 110;
            const lineH = 26;
            const textX = W / 2 - 240;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            item.lines.forEach((line, i) => {
                const y = startY + i * lineH - gameState.guideScrollOffset;
                if (y < 95 || y > H - 70) return;
                if (line === '') return;
                if (line.startsWith('—')) {
                    ctx.fillStyle = item.color;
                    ctx.font = `bold 15px ${UI_THEME.font.body}`;
                } else {
                    ctx.fillStyle = UI_THEME.color.textSecondary;
                    ctx.font = `15px ${UI_THEME.font.body}`;
                }
                ctx.fillText(line, textX, y);
            });

            this._drawGuideBackButton(t('menu.backTo', cat.name));
        }

        // Frame + scanlines on top
        uiDrawScreenFrame(ctx, W, H);
        uiDrawScanlines(ctx, W, H);
    }

    _drawGuideBackButton(text) {
        const W = 160;
        const H = 40;
        const X = 40;
        const Y = GAME_CONFIG.HEIGHT - 60;
        this.guideBackBtn = uiDrawButton(this.ctx, X, Y, W, H, text, {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `13px ${UI_THEME.font.mono}`,
            chamfer: 8
        });
    }
    
    drawBackButton() {
        const W = 130;
        const H = 44;
        const X = 40;
        const Y = GAME_CONFIG.HEIGHT - 64;
        this.backButton = uiDrawButton(this.ctx, X, Y, W, H, t('menu.backArrow'), {
            accentColor: UI_THEME.color.textSecondary,
            labelFont: `bold 14px ${UI_THEME.font.mono}`,
            chamfer: 8
        });
    }
    
    drawCrosshair() {
        // Modern sci-fi HUD reticle:
        //   - Outer rotating dashed ring (slow CW)
        //   - Counter-rotating inner dash ring (CCW, faster)
        //   - Four animated bracket corners that breathe inward/outward
        //   - Inner static crosshair gap with thin tick marks
        //   - Tiny center dot with glow
        //   - Color shifts when locked vs free aim, and pulses while firing
        const ctx = this.ctx;
        const cx = gameState.manualLockX || mouse.x;
        const cy = gameState.manualLockY || mouse.y;
        const now = Date.now();
        const t = now / 1000;

        // Detect "locked" (right mouse held / locked target) — manualLockX/Y
        // are non-zero while a target is locked. We pulse color in that case.
        const isLocked = !!(gameState.manualLockX || gameState.manualLockY);
        const isFiring = !!(typeof mouse !== 'undefined' && mouse.isDown);

        const baseColor = isLocked ? '#FF4040' : '#FFD700';
        const accentColor = isLocked ? '#ffb0b0' : '#fff5b0';
        const dimColor = isLocked
            ? 'rgba(255, 80, 80, 0.55)'
            : 'rgba(255, 215, 0, 0.55)';

        // Breathing offset (pulse in when firing, out when idle)
        const breath = isFiring
            ? -2 + Math.sin(now * 0.025) * 1.5
            :  Math.sin(now * 0.004) * 1.8;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // ---- Soft glow disk (subtle, additive) ------------------------
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
        glow.addColorStop(0, isLocked ? 'rgba(255, 60, 60, 0.35)' : 'rgba(255, 215, 0, 0.32)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // ---- Outer rotating dashed ring (slow CW) ---------------------
        const outerR = 26;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.6);
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, outerR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // ---- Inner counter-rotating dashed ring (faster CCW) ----------
        const innerR = 16;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-t * 1.4);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, innerR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // ---- 4 breathing corner brackets [ ] ┐ ┘ ----------------------
        const bSize = 9;             // bracket leg length
        const bDist = 22 + breath;   // distance from center
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(cx - bDist, cy - bDist + bSize);
        ctx.lineTo(cx - bDist, cy - bDist);
        ctx.lineTo(cx - bDist + bSize, cy - bDist);
        // Top-right
        ctx.moveTo(cx + bDist - bSize, cy - bDist);
        ctx.lineTo(cx + bDist, cy - bDist);
        ctx.lineTo(cx + bDist, cy - bDist + bSize);
        // Bottom-right
        ctx.moveTo(cx + bDist, cy + bDist - bSize);
        ctx.lineTo(cx + bDist, cy + bDist);
        ctx.lineTo(cx + bDist - bSize, cy + bDist);
        // Bottom-left
        ctx.moveTo(cx - bDist + bSize, cy + bDist);
        ctx.lineTo(cx - bDist, cy + bDist);
        ctx.lineTo(cx - bDist, cy + bDist - bSize);
        ctx.stroke();

        // ---- Cross-hair tick marks (with center gap) ------------------
        const tickGap = 6;
        const tickLen = 6;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        // Top tick
        ctx.moveTo(cx, cy - tickGap);
        ctx.lineTo(cx, cy - tickGap - tickLen);
        // Bottom tick
        ctx.moveTo(cx, cy + tickGap);
        ctx.lineTo(cx, cy + tickGap + tickLen);
        // Left tick
        ctx.moveTo(cx - tickGap, cy);
        ctx.lineTo(cx - tickGap - tickLen, cy);
        // Right tick
        ctx.moveTo(cx + tickGap, cy);
        ctx.lineTo(cx + tickGap + tickLen, cy);
        ctx.stroke();

        // ---- Tiny diagonal accent ticks at 45° (decoration) -----------
        ctx.strokeStyle = dimColor;
        ctx.lineWidth = 1;
        const diagInner = innerR + 2;
        const diagOuter = innerR + 6;
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * diagInner, cy + Math.sin(a) * diagInner);
            ctx.lineTo(cx + Math.cos(a) * diagOuter, cy + Math.sin(a) * diagOuter);
            ctx.stroke();
        }

        // ---- Center dot + halo ----------------------------------------
        ctx.globalCompositeOperation = 'lighter';
        const dotGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5);
        dotGlow.addColorStop(0, '#ffffff');
        dotGlow.addColorStop(0.5, baseColor);
        dotGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dotGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // ---- Locked indicator: small "LOCK" label below the reticle ---
        if (isLocked) {
            ctx.fillStyle = baseColor;
            ctx.font = `bold 10px ${UI_THEME && UI_THEME.font ? UI_THEME.font.mono : 'monospace'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('● LOCK', cx, cy + 36);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        ctx.restore();
    }
    
    isButtonClicked(button, mouseX, mouseY) {
        return button && 
               mouseX >= button.x && 
               mouseX <= button.x + button.width && 
               mouseY >= button.y && 
               mouseY <= button.y + button.height;
    }
    
    handleClick(mouseX, mouseY) {
        // 检查游戏简介界面点击
        if (gameState.showGuide) {
            if (this.guideBackBtn && this.isButtonClicked(this.guideBackBtn, mouseX, mouseY)) {
                if (gameState.guideSubItem !== null) {
                    gameState.guideSubItem = null;
                    gameState.guideScrollOffset = 0;
                } else if (gameState.guideCategory) {
                    gameState.guideCategory = null;
                    gameState.guideScrollOffset = 0;
                } else {
                    gameState.showGuide = false;
                    gameState.showModeSelection = true;
                }
                return true;
            }
            if (this.guideButtons) {
                for (const btn of this.guideButtons) {
                    if (this.isButtonClicked(btn, mouseX, mouseY)) {
                        if (btn.action === 'category') {
                            gameState.guideCategory = btn.id;
                            gameState.guideSubItem = null;
                            gameState.guideScrollOffset = 0;
                        } else if (btn.action === 'subitem') {
                            gameState.guideSubItem = btn.index;
                            gameState.guideScrollOffset = 0;
                        }
                        return true;
                    }
                }
            }
            return true;
        }
        
        // 检查模式选择按钮点击
        if (gameState.showModeSelection) {
            if (this.langButton && this.isButtonClicked(this.langButton, mouseX, mouseY)) {
                gameState.language = gameState.language === 'zh' ? 'en' : 'zh';
                document.title = t('ui.gameTitle');
                document.documentElement.lang = gameState.language === 'zh' ? 'zh-CN' : 'en';
                return true;
            }
            
            if (this.bossButton && this.isButtonClicked(this.bossButton, mouseX, mouseY)) {
                this.selectGameMode('BOSS_BATTLE');
                return true;
            }

            if (this.trainingButton && this.isButtonClicked(this.trainingButton, mouseX, mouseY)) {
                this.selectGameMode('TRAINING');
                return true;
            }

            if (this.customButton && this.isButtonClicked(this.customButton, mouseX, mouseY)) {
                this.showMechCustomization();
                return true;
            }
            
            if (this.guideButton && this.isButtonClicked(this.guideButton, mouseX, mouseY)) {
                gameState.showModeSelection = false;
                gameState.showGuide = true;
                gameState.guideCategory = null;
                gameState.guideSubItem = null;
                gameState.guideScrollOffset = 0;
                return true;
            }

            if (this.settingsButton && this.isButtonClicked(this.settingsButton, mouseX, mouseY)) {
                gameState.showModeSelection = false;
                gameState.showSettings = true;
                this._openSettingsInput();
                return true;
            }
        }
        
        // 检查关卡选择按钮点击
        if (gameState.showLevelSelection) {
            if (this.levelButtons) {
                for (const button of this.levelButtons) {
                    if (button && this.isButtonClicked(button, mouseX, mouseY)) {
                        this.selectLevel(button.levelId);
                return true;
                    }
                }
            }
        }

        // Settings page button clicks.
        if (gameState.showSettings) {
            if (this.settingsSaveButton && this.isButtonClicked(this.settingsSaveButton, mouseX, mouseY)) {
                this._commitSettingsInput();
                return true;
            }
            if (this.settingsResetButton && this.isButtonClicked(this.settingsResetButton, mouseX, mouseY)) {
                if (this._settingsInputEl) this._settingsInputEl.value = 'Scorchfrost';
                this._commitSettingsInput();
                if (this._settingsInputEl) {
                    try { this._settingsInputEl.focus(); this._settingsInputEl.select(); } catch (_) {}
                }
                return true;
            }
            if (this.settingsBackButton && this.isButtonClicked(this.settingsBackButton, mouseX, mouseY)) {
                this.closeSettings(true);
                return true;
            }
        }
        
        // 检查返回按钮点击
        if (this.backButton && this.isButtonClicked(this.backButton, mouseX, mouseY)) {
            if (gameState.showLevelSelection) {
                // 从关卡选择返回到模式选择
                gameState.showLevelSelection = false;
                gameState.showModeSelection = true;
                gameState.selectedGameMode = null;
            } else if (gameState.showWeaponConfig) {
                this.backToModeSelection();
            } else if (gameState.showMechCustomization) {
                this.backToMainMenu();
            }
            return true;
        }
        
        // 检查主菜单按钮点击
        if (this.mainMenuButton && this.isButtonClicked(this.mainMenuButton, mouseX, mouseY)) {
            if (gameState.paused) {
                // 从暂停状态返回主菜单
                gameState.paused = false;
            }
            this.backToMainMenu();
            return true;
        }
        
        // 检查暂停按钮点击
        if (this.pauseButton && this.isButtonClicked(this.pauseButton, mouseX, mouseY)) {
            gameState.paused = !gameState.paused;
            return true;
        }
        
        // 胜利画面只允许空格键退出，不响应点击
        if (gameState.victory) {
            return true;
        }
        
        // 检查武器配置界面中的武器按钮点击
        if (gameState.showWeaponConfig) {
            // 检查武器槽位按钮
            if (this.weaponSlotButtons) {
                for (const button of this.weaponSlotButtons) {
                    if (this.isButtonClicked(button, mouseX, mouseY)) {
                        // 获取当前槽位的所有选项
                        const options = button.options;
                        const currentValue = gameState.weaponConfig[button.slotKey];
                        
                        // 找到当前选项的索引
                        const currentIndex = options.findIndex(option => option.type === currentValue);
                        
                        // 切换到下一个选项（循环）
                        const nextIndex = (currentIndex + 1) % (options.length + 1); // +1 是为了包含"无"选项
                        
                        let newWeaponType = null;
                        if (nextIndex === options.length) {
                            // 设置为"无"
                            newWeaponType = null;
                        } else {
                            // 设置为下一个武器
                            newWeaponType = options[nextIndex].type;
                        }
                        
                        this.applyWeaponSlotLinkage(button.slotKey, newWeaponType);
                        
                        return true;
                    }
                }
            }
            
            // 检查无敌模式开关
            if (this.invincibleToggleButton && this.isButtonClicked(this.invincibleToggleButton, mouseX, mouseY)) {
                gameState.invincibleMode = !gameState.invincibleMode;
                return true;
            }
            
            // 检查开始游戏按钮
            if (this.startGameButton && this.isButtonClicked(this.startGameButton, mouseX, mouseY)) {
                this.selectWeaponConfig();
                return true;
            }
        }
        
        // 检查机甲定制界面中的武器槽位按钮点击（与武器配置界面相同的循环切换逻辑）
        if (gameState.showMechCustomization) {
            if (this.mechCustomSlotButtons) {
                for (const button of this.mechCustomSlotButtons) {
                    if (this.isButtonClicked(button, mouseX, mouseY)) {
                        const options = button.options;
                        const currentValue = gameState.weaponConfig[button.slotKey];
                        const currentIndex = options.findIndex(option => option.type === currentValue);
                        const nextIndex = (currentIndex + 1) % (options.length + 1);
                        
                        let newWeaponType = null;
                        if (nextIndex === options.length) {
                            newWeaponType = null;
                        } else {
                            newWeaponType = options[nextIndex].type;
                        }
                        
                        this.applyWeaponSlotLinkage(button.slotKey, newWeaponType);
                        
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    drawPauseScreen() {
        this.backButton = null;
        this.pauseButton = null;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        // Dim overlay
        ctx.fillStyle = 'rgba(2, 6, 10, 0.78)';
        ctx.fillRect(0, 0, W, H);
        uiDrawScanlines(ctx, W, H, { spacing: 4 });

        // Center modal panel
        const panelW = 460;
        const panelH = 280;
        const panelX = W / 2 - panelW / 2;
        const panelY = H / 2 - panelH / 2;

        uiDrawPanel(ctx, panelX, panelY, panelW, panelH, {
            chamfer: 18,
            fill: { from: 'rgba(8, 16, 22, 0.95)', to: 'rgba(4, 10, 14, 0.95)' },
            stroke: UI_THEME.color.primary,
            strokeWidth: 2,
            glow: true
        });
        uiDrawCornerBrackets(ctx, panelX, panelY, panelW, panelH);

        // Status header inside panel
        ctx.save();
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `12px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('// SYSTEM HALTED', W / 2, panelY + 38);
        ctx.restore();

        // Title
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `bold 48px ${UI_THEME.font.display}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = UI_THEME.color.primaryGlow;
        ctx.shadowBlur = 16;
        ctx.fillText(t('ui.paused'), W / 2, panelY + 90);
        ctx.restore();

        // Hint
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `14px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('ui.pauseHint'), W / 2, panelY + 140);
        ctx.restore();

        // Return-to-menu button
        const btnW = 220;
        const btnH = 52;
        const btnX = W / 2 - btnW / 2;
        const btnY = panelY + panelH - btnH - 28;
        this.mainMenuButton = uiDrawButton(ctx, btnX, btnY, btnW, btnH, t('menu.backToMenu'), {
            accentColor: UI_THEME.color.danger,
            labelFont: `bold 16px ${UI_THEME.font.display}`,
            labelLetterSpacing: 2,
            chamfer: 10
        });
    }

    drawGameOver() {
        this.backButton = null;
        this.pauseButton = null;
        this.mainMenuButton = null;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        ctx.fillStyle = 'rgba(2, 4, 6, 0.88)';
        ctx.fillRect(0, 0, W, H);

        // Red warning side stripes
        ctx.save();
        ctx.fillStyle = UI_THEME.color.dangerDim;
        ctx.fillRect(0, H / 2 - 130, W, 2);
        ctx.fillRect(0, H / 2 + 90, W, 2);
        ctx.restore();

        uiDrawScanlines(ctx, W, H, { spacing: 4 });

        // Status code
        ctx.save();
        ctx.fillStyle = UI_THEME.color.danger;
        ctx.font = `13px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('// CRITICAL FAILURE - SIGNAL LOST', W / 2, H / 2 - 160);
        ctx.restore();

        // Big title
        ctx.save();
        ctx.fillStyle = UI_THEME.color.danger;
        ctx.font = `bold 72px ${UI_THEME.font.display}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = UI_THEME.color.dangerGlow;
        ctx.shadowBlur = 24;
        ctx.fillText(t('ui.gameOver'), W / 2, H / 2 - 80);
        ctx.restore();

        // Damage
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `22px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('ui.totalDamage', Math.floor(gameState.totalDamage)), W / 2, H / 2 - 10);
        ctx.restore();

        // Hint
        ctx.save();
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `14px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('ui.spaceReturn'), W / 2, H / 2 + 60);
        ctx.restore();

        uiDrawScreenFrame(ctx, W, H, { color: UI_THEME.color.dangerDim });
    }
    
    drawBlindnessEffect() {
        // TV static "snow" jam effect — replaces the old all-black screen.
        // Multi-layer composite:
        //   1) Dark backing (lets the world bleed through faintly)
        //   2) Per-frame procedural noise via a small offscreen canvas (cheap)
        //   3) Rolling scanline distortion bands
        //   4) Vignette + chromatic edge flicker for "broken signal" feel
        const ctx = this.ctx;
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const now = Date.now();

        // 1) Dark backing — heavy but not opaque so the player can sense
        //    motion shapes underneath. Adjust alpha to taste.
        ctx.save();
        ctx.fillStyle = 'rgba(8, 8, 12, 0.82)';
        ctx.fillRect(0, 0, W, H);

        // 2) Procedural noise. We render to a tiny offscreen canvas (1/4 res)
        //    then upscale — keeps it fast and gives chunky retro pixels.
        if (!this._noiseCanvas) {
            this._noiseCanvas = document.createElement('canvas');
            this._noiseCanvas.width = 240;
            this._noiseCanvas.height = 135;
            this._noiseCtx = this._noiseCanvas.getContext('2d');
            this._noiseImageData = this._noiseCtx.createImageData(
                this._noiseCanvas.width, this._noiseCanvas.height);
        }
        const nc = this._noiseCanvas;
        const nctx = this._noiseCtx;
        const idata = this._noiseImageData;
        const buf = idata.data;
        // Fill with white-noise grayscale + occasional bright sparks
        for (let i = 0; i < buf.length; i += 4) {
            const v = (Math.random() * 255) | 0;
            const spark = Math.random() < 0.012 ? 255 : v;
            buf[i] = spark;
            buf[i + 1] = spark;
            buf[i + 2] = spark;
            buf[i + 3] = 200 + ((Math.random() * 55) | 0);
        }
        nctx.putImageData(idata, 0, 0);
        ctx.globalCompositeOperation = 'screen';   // additive-ish over the dark backing
        ctx.globalAlpha = 0.85;
        ctx.imageSmoothingEnabled = false;          // chunky pixels
        ctx.drawImage(nc, 0, 0, W, H);
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // 3) Rolling distortion bands (a few horizontal "tear" lines)
        const bandCount = 3;
        for (let i = 0; i < bandCount; i++) {
            const speed = 60 + i * 90;
            const phase = ((now / speed) + i * 0.37) % 1;
            const y = phase * H;
            const bandH = 18 + (i * 6);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + Math.random() * 0.05})`;
            ctx.fillRect(0, y, W, bandH);
            // Thin tear line in the middle of the band
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fillRect(0, y + bandH / 2 - 1, W, 2);
        }

        // 4) Vignette + tinted edge flicker (broken signal vibe)
        const vignette = ctx.createRadialGradient(
            W / 2, H / 2, Math.min(W, H) * 0.25,
            W / 2, H / 2, Math.max(W, H) * 0.7);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

        // Subtle red/blue chromatic flicker every few frames
        if (Math.random() < 0.18) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.06 + Math.random() * 0.05;
            ctx.fillStyle = (Math.random() < 0.5) ? '#ff3030' : '#3070ff';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        // Scanlines for "CRT" feel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        for (let y = 0; y < H; y += 3) {
            ctx.fillRect(0, y, W, 1);
        }

        ctx.restore();
    }
    
    drawBlindnessStatusText() {
        // 绘制失明状态提示文字（在失明效果之上）
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(t('ui.blindStatus'), GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2);
        
        // 绘制剩余时间提示（如果有Boss的话）
        if (this.boss && this.boss.blindnessSkill && this.boss.blindnessSkill.isActive) {
            const params = this.boss.getBlindnessParams(); // 获取当前阶段参数
            const remaining = Math.max(0, params.duration - (Date.now() - this.boss.blindnessSkill.startTime));
            const remainingSeconds = (remaining / 1000).toFixed(1);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '18px Arial';
            this.ctx.fillText(t('ui.blindRemaining', remainingSeconds), GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 40);
        }
        
        // 重置文字对齐方式
        this.ctx.textAlign = 'left';
    }

    drawVictoryScreen() {
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;

        ctx.save();
        ctx.fillStyle = 'rgba(2, 6, 10, 0.92)';
        ctx.fillRect(0, 0, W, H);

        // Subtle gold-tinted scanlines
        uiDrawScanlines(ctx, W, H, { spacing: 4, color: 'rgba(255, 215, 0, 0.04)' });

        // Status header
        ctx.fillStyle = UI_THEME.color.success;
        ctx.font = `13px ${UI_THEME.font.mono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('// MISSION COMPLETE - TARGET NEUTRALIZED', W / 2, H / 2 - 200);

        // VICTORY title (gold + glow)
        ctx.fillStyle = '#FFD54F';
        ctx.font = `bold 78px ${UI_THEME.font.display}`;
        ctx.shadowColor = 'rgba(255, 213, 79, 0.6)';
        ctx.shadowBlur = 28;
        ctx.fillText(t('ui.victory'), W / 2, H / 2 - 110);

        // Accent bar
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFD54F';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 160, H / 2 - 60);
        ctx.lineTo(W / 2 + 160, H / 2 - 60);
        ctx.stroke();

        // Defeated boss
        ctx.fillStyle = UI_THEME.color.textPrimary;
        ctx.font = `bold 32px ${UI_THEME.font.display}`;
        const victoryBossDisplay = t('boss.' + gameState.victoryBossLevel) || gameState.victoryBossName;
        ctx.fillText(t('ui.defeated', victoryBossDisplay), W / 2, H / 2 - 20);

        // Score
        ctx.fillStyle = UI_THEME.color.primary;
        ctx.font = `24px ${UI_THEME.font.mono}`;
        ctx.fillText(t('ui.finalScore', gameState.score), W / 2, H / 2 + 30);

        // Hint
        ctx.fillStyle = UI_THEME.color.textSecondary;
        ctx.font = `14px ${UI_THEME.font.mono}`;
        ctx.fillText(t('ui.spaceReturn'), W / 2, H / 2 + 100);

        ctx.restore();

        uiDrawScreenFrame(ctx, W, H, { color: 'rgba(255, 213, 79, 0.4)' });
    }

    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    restart() {
        gameState.score = 0;
        gameState.totalDamage = 0;
        gameState.gameOver = false;
        gameState.playerDying = false;
        gameState.bossDying = false;
        gameState._deathClimaxFired = false;
        gameState._deathLastBurstAt = 0;
        gameState.damageFrozen = false;
        gameState.showModeSelection = true;
        gameState.showLevelSelection = false;
        gameState.showWeaponConfig = false;
        gameState.selectedGameMode = null;
        gameState.selectedLevel = null;
        gameState.bossSpawned = false;
        gameState.bossKillCount = 0;
        // Reset blindness status
        gameState.playerBlinded = false;
        // Reset repair kit count
        gameState.repairKits = gameState.maxRepairKits;
        // Mech and weapon loadout are intentionally NOT reset on defeat —
        // the pilot keeps their previously configured chassis + weapons so
        // they can jump straight back into battle without re-picking
        // everything from scratch every time they die.
        this.resetAllWeaponStates();
        
        this.player = null;
        this.clearAllGameObjects();
        
        // 清除所有键盘状态，防止角色不由自主移动
        for (let key in keys) {
            keys[key] = false;
        }
        
        // 清除鼠标状态
        mouse.leftClick = false;
        mouse.rightClick = false;
        
        // 重新显示点击提示
        const clickHint = document.querySelector('.click-hint');
        if (clickHint) {
            clickHint.style.display = 'block';
        }
        
        updateUI();
    }
} 