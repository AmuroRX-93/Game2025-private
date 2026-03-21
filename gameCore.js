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
            { type: 'gun', name: '自动步枪', color: '#4169E1', desc: '远程射击 | 高射速 | 预瞄功能' },
            { type: 'sword', name: '脉冲光束军刀', color: '#ff6b6b', desc: '近战攻击 | 高伤害 | 刀推功能' },
            { type: 'laser_spear', name: '镭射长枪', color: '#00FFFF', desc: '中距离突刺 | 蓄力攻击 | 推进功能' },
            { type: 'cluster_missile', name: '分裂飞弹', color: '#FFD700', desc: '大弹近炸分裂8子弹 | 持续索敌 | 高追踪' },
            { type: 'laser_rifle', name: '镭射步枪', color: '#FF4444', desc: '长按蓄力 | 预瞄射线 | 过热系统' }
        ];
        const shoulderWeaponOptions = [
            { type: 'missile_launcher', name: '15连导弹发射器', color: '#FFD700', desc: '强追踪1.1秒 | 范围爆炸 | 高伤害' },
            { type: 'ciws', name: '近防炮', color: '#00FF88', desc: '自动拦截制导武器 | 30发弹仓 | 优先打导弹' },
            { type: 'plasma_missile', name: '6连电浆飞弹', color: '#00FFCC', desc: '近炸引信 | 电浆场持续伤害 | 可叠加' },
            { type: 'super_weapon', name: '超级导弹', color: '#FF0000', desc: '100伤害 | 一次战斗只能用一次 | 占用双槽位' },
            { type: 'moonlight_greatsword', name: '月光大剑', color: '#88CCFF', desc: '200伤害 | 超大范围光刃 | 占用4槽位 | 一次性' }
        ];
        const hiddenAbilityOptions = [
            { type: 'pulse_shield', name: '脉冲护盾', color: '#00FFFF', desc: '70%伤害减免 | 15秒持续 | 40秒冷却' },
            { type: 'emp', name: 'EMP电磁脉冲', color: '#66CCFF', desc: '范围伤害+僵直 | 距离越远伤害越低 | 30秒冷却' },
            { type: 'counter_mech', name: '反制重击', color: '#FF8C00', desc: '3秒减伤40% | 反射50%伤害 | 50秒冷却' },
            { type: 'decoy_clone', name: '诱饵分身', color: '#4488FF', desc: '释放3诱饵 | 4秒隐身 | 35秒冷却' },
            { type: 'moonlight_greatsword', name: '月光大剑', color: '#88CCFF', desc: '200伤害 | 超大范围光刃 | 占用4槽位 | 一次性' }
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
        this.iceClones = [];
        this.mines = [];
        this.molotovs = [];
        this.chaosBullets = [];
        this.starDevourerBullets = [];
        this.ciwsBullets = [];
        this.plasmaMissiles = [];
        this.plasmaFields = [];
        this.clusterMissiles = [];
        this.decoys = [];
        this.boss = null;
    }

    init() {
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
    
    selectGameMode(gameMode) {
        gameState.selectedGameMode = gameMode;
        gameState.showModeSelection = false;
        
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
        
        // 清除所有键盘状态，确保游戏开始时角色不会不由自主移动
        for (let key in keys) {
            keys[key] = false;
        }
        
        // 清除鼠标状态
        mouse.leftClick = false;
        mouse.rightClick = false;
        
        // 强制切换到软锁模式
        gameState.lockMode = 'soft';
        
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
        gameState.victoryBossName = BOSS_LEVELS[gameState.selectedLevel]?.name || '未知Boss';
        
        if (this._victoryTimer) clearTimeout(this._victoryTimer);
        this._victoryTimer = setTimeout(() => {
            this._victoryTimer = null;
            if (gameState.victory) {
                this.backToMainMenu();
            }
        }, 5000);
    }

    backToMainMenu() {
        if (this._victoryTimer) {
            clearTimeout(this._victoryTimer);
            this._victoryTimer = null;
        }
        gameState.gameOver = false;
        gameState.paused = false;
        gameState.showModeSelection = true;
        gameState.showLevelSelection = false;
        gameState.showWeaponConfig = false;
        gameState.showMechCustomization = false;
        gameState.showGuide = false;
        gameState.guideCategory = null;
        gameState.guideSubItem = null;
        gameState.guideScrollOffset = 0;
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
        if (gameState.paused || gameState.showModeSelection || gameState.showWeaponConfig || gameState.showMechCustomization || gameState.showGuide) return;
        if (!this.player) return;
        
        // 游戏结束时只更新UI，不更新游戏对象
        if (gameState.gameOver) {
            this.clearAllGameObjects();
            updateUI();
            return;
        }

        // 更新玩家
        this.player.update();

        // 更新敌人 - 从后往前遍历避免索引问题
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update();
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
        if (this.boss && this.bullets.length > 0) {
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
            this.boss.update();
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
    }

    draw() {
        // 清空画布 - 灰色背景
        this.ctx.fillStyle = '#404040';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);

        // 显示游戏简介界面
        if (gameState.showGuide) {
            this.drawGuide();
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
        try {
        // 绘制玩家
        if (this.player) {
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
        // 在方法末尾设置按钮，这里先不清除
        
        // 移除了"选择游戏模式"标题
        
        // Boss战模式按钮（现在是唯一选项）
        const bossButtonWidth = 400;
        const bossButtonHeight = 100;
        const bossButtonX = GAME_CONFIG.WIDTH / 2 - bossButtonWidth / 2;
        const bossButtonY = GAME_CONFIG.HEIGHT / 2 - 80;
        
        // 绘制Boss战模式按钮
        this.ctx.fillStyle = 'rgba(255, 68, 68, 0.8)';
        this.ctx.fillRect(bossButtonX, bossButtonY, bossButtonWidth, bossButtonHeight);
        
        this.ctx.strokeStyle = GAME_MODES.BOSS_BATTLE.color;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(bossButtonX, bossButtonY, bossButtonWidth, bossButtonHeight);
        
        // Boss战模式文字
        this.ctx.fillStyle = 'white';
        this.ctx.font = '32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('开始 Boss 战', bossButtonX + bossButtonWidth / 2, bossButtonY + 45);
        
        this.ctx.font = '16px Arial';
        this.ctx.fillText('挑战强大的Boss敌人', bossButtonX + bossButtonWidth / 2, bossButtonY + 75);
        
        // 定制机甲按钮
        const customButtonWidth = 400;
        const customButtonHeight = 100;
        const customButtonX = GAME_CONFIG.WIDTH / 2 - customButtonWidth / 2;
        const customButtonY = GAME_CONFIG.HEIGHT / 2 + 40;
        
        // 绘制定制机甲按钮
        this.ctx.fillStyle = 'rgba(68, 68, 255, 0.8)';
        this.ctx.fillRect(customButtonX, customButtonY, customButtonWidth, customButtonHeight);
        
        this.ctx.strokeStyle = '#4169E1';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(customButtonX, customButtonY, customButtonWidth, customButtonHeight);
        
        // 定制机甲文字
        this.ctx.fillStyle = 'white';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('定制机甲', customButtonX + customButtonWidth / 2, customButtonY + 35);
        
        this.ctx.font = '14px Arial';
        this.ctx.fillText('配置武器装备，自定义作战风格', customButtonX + customButtonWidth / 2, customButtonY + 65);
        
        // 游戏简介按钮
        const guideButtonWidth = 400;
        const guideButtonHeight = 60;
        const guideButtonX = GAME_CONFIG.WIDTH / 2 - guideButtonWidth / 2;
        const guideButtonY = GAME_CONFIG.HEIGHT / 2 + 160;
        
        this.ctx.fillStyle = 'rgba(100, 100, 100, 0.6)';
        this.ctx.fillRect(guideButtonX, guideButtonY, guideButtonWidth, guideButtonHeight);
        this.ctx.strokeStyle = '#AAAAAA';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(guideButtonX, guideButtonY, guideButtonWidth, guideButtonHeight);
        
        this.ctx.fillStyle = '#DDDDDD';
        this.ctx.font = '22px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('游戏简介', guideButtonX + guideButtonWidth / 2, guideButtonY + 38);
        
        // 存储按钮位置供点击检测使用
        this.bossButton = { x: bossButtonX, y: bossButtonY, width: bossButtonWidth, height: bossButtonHeight };
        this.customButton = { x: customButtonX, y: customButtonY, width: customButtonWidth, height: customButtonHeight };
        this.guideButton = { x: guideButtonX, y: guideButtonY, width: guideButtonWidth, height: guideButtonHeight };
        
        // 清除其他界面的按钮
        this.trainingButton = null;
        this.backButton = null;
        this.mainMenuButton = null;
        this.pauseButton = null;
    }

    drawLevelSelection() {
        this.pauseButton = null;
        
        this.ctx.fillStyle = '#2D1B69';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        
        const scrollY = gameState.levelScrollOffset || 0;
        
        // Scrollable content area (clip to avoid drawing over the fixed header)
        const headerHeight = 160;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, headerHeight, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT - headerHeight);
        this.ctx.clip();
        
        const levels = Object.values(BOSS_LEVELS);
        const buttonWidth = 500;
        const buttonHeight = 120;
        const buttonSpacing = 140;
        const startY = 200;
        
        this.levelButtons = [];
        
        levels.forEach((level, index) => {
            const buttonX = GAME_CONFIG.WIDTH / 2 - buttonWidth / 2;
            const buttonY = startY + index * buttonSpacing - scrollY;
            
            if (buttonY + buttonHeight < headerHeight || buttonY > GAME_CONFIG.HEIGHT) return;
            
            if (level.unlocked) {
                this.ctx.fillStyle = 'rgba(139, 0, 0, 0.8)';
            } else {
                this.ctx.fillStyle = 'rgba(60, 60, 60, 0.8)';
            }
            
            this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
            
            this.ctx.strokeStyle = level.unlocked ? '#FF0000' : '#666666';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
            
            if (level.unlocked) {
                this.ctx.fillStyle = 'white';
                this.ctx.font = '28px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(level.name, buttonX + buttonWidth / 2, buttonY + 40);
                
                this.ctx.font = '16px Arial';
                this.ctx.fillStyle = '#DDDDDD';
                this.ctx.fillText(level.description, buttonX + buttonWidth / 2, buttonY + 70);
                
                this.ctx.font = '14px Arial';
                this.ctx.fillStyle = '#FFAA00';
                this.ctx.fillText(`难度: ${'★'.repeat(level.difficulty)}`, buttonX + buttonWidth / 2, buttonY + 95);
            } else {
                this.ctx.fillStyle = '#999999';
                this.ctx.font = '24px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('🔒 未解锁', buttonX + buttonWidth / 2, buttonY + 60);
            }
            
            if (level.unlocked) {
                this.levelButtons[index] = { 
                    x: buttonX, 
                    y: buttonY, 
                    width: buttonWidth, 
                    height: buttonHeight,
                    levelId: level.id
                };
            }
        });
        
        this.ctx.restore();
        
        // Fixed header background (drawn on top so scroll content doesn't bleed through)
        this.ctx.fillStyle = '#2D1B69';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, headerHeight);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '36px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('选择关卡', GAME_CONFIG.WIDTH / 2, 100);
        
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = '#CCCCCC';
        this.ctx.fillText('Boss战模式 - 挑战强大的敌人', GAME_CONFIG.WIDTH / 2, 140);
        
        // Scroll indicators
        const contentHeight = startY + levels.length * buttonSpacing;
        const maxScroll = Math.max(0, contentHeight - GAME_CONFIG.HEIGHT + 60);
        if (maxScroll > 0) {
            const trackX = GAME_CONFIG.WIDTH - 16;
            const trackTop = headerHeight + 10;
            const trackHeight = GAME_CONFIG.HEIGHT - headerHeight - 20;
            
            this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
            this.ctx.fillRect(trackX, trackTop, 8, trackHeight);
            
            const thumbRatio = (GAME_CONFIG.HEIGHT - headerHeight) / contentHeight;
            const thumbHeight = Math.max(30, trackHeight * thumbRatio);
            const thumbY = trackTop + (scrollY / maxScroll) * (trackHeight - thumbHeight);
            
            this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
            this.ctx.fillRect(trackX, thumbY, 8, thumbHeight);
            
            if (scrollY > 5) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('▲', GAME_CONFIG.WIDTH / 2, headerHeight + 20);
            }
            if (scrollY < maxScroll - 5) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('▼', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT - 10);
            }
        }
        
        // Fixed back button
        const backButtonWidth = 120;
        const backButtonHeight = 50;
        const backButtonX = 50;
        const backButtonY = 50;
        
        this.ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
        this.ctx.fillRect(backButtonX, backButtonY, backButtonWidth, backButtonHeight);
        
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(backButtonX, backButtonY, backButtonWidth, backButtonHeight);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('返回', backButtonX + backButtonWidth / 2, backButtonY + 32);
        
        this.backButton = { x: backButtonX, y: backButtonY, width: backButtonWidth, height: backButtonHeight };
        
        this.bossButton = null;
        this.trainingButton = null;
        this.customButton = null;
        this.mainMenuButton = null;
        this.pauseButton = null;
    }

    drawWeaponConfig() {
        // 清除不需要的按钮状态
        this.pauseButton = null;
        
        // 绘制武器配置界面
        this.ctx.fillStyle = '#6B46C1';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        
        // 选择的游戏模式提示
        const currentMode = GAME_MODES[gameState.selectedGameMode];
        this.ctx.fillStyle = currentMode.color;
        this.ctx.font = '18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`已选择：${currentMode.name}`, GAME_CONFIG.WIDTH / 2, 50);
        
        const { weaponOptions, shoulderWeaponOptions, hiddenAbilityOptions } = this.getWeaponOptions();
        
        // 五个武器槽位配置
        const weaponSlots = [
            { 
                key: 'leftHand', 
                name: '左手武器', 
                keyHint: '(左键)', 
                color: '#4169E1',
                options: weaponOptions,
                currentValue: gameState.weaponConfig.leftHand
            },
            { 
                key: 'rightHand', 
                name: '右手武器', 
                keyHint: '(右键)', 
                color: '#ff6b6b',
                options: weaponOptions,
                currentValue: gameState.weaponConfig.rightHand
            },
            { 
                key: 'leftShoulder', 
                name: '左肩武器', 
                keyHint: '(Q键)', 
                color: '#FF4444',
                options: shoulderWeaponOptions,
                currentValue: gameState.weaponConfig.leftShoulder
            },
            { 
                key: 'rightShoulder', 
                name: '右肩武器', 
                keyHint: '(E键)', 
                color: '#FF8800',
                options: shoulderWeaponOptions,
                currentValue: gameState.weaponConfig.rightShoulder
            },
            { 
                key: 'hiddenAbility', 
                name: '隐藏机能', 
                keyHint: '(Shift键)', 
                color: '#00FFFF',
                options: hiddenAbilityOptions,
                currentValue: gameState.weaponConfig.hiddenAbility
            }
        ];
        
        // 计算按钮布局
        const centerX = GAME_CONFIG.WIDTH / 2;
        const centerY = GAME_CONFIG.HEIGHT / 2;
        const buttonWidth = 200;
        const buttonHeight = 80;
        const buttonSpacing = 220;
        
        // 绘制五个武器槽位按钮
        this.weaponSlotButtons = [];
        
        weaponSlots.forEach((slot, index) => {
            const x = centerX + (index - 2) * buttonSpacing; // 居中布局，index-2让中间按钮在中心
            const y = centerY - 50;
            
            // 获取当前选中的武器名称
            const currentWeapon = slot.options.find(w => w.type === slot.currentValue);
            const displayName = currentWeapon ? currentWeapon.name : '无';
            
            // 绘制按钮背景
            this.ctx.fillStyle = slot.color;
            this.ctx.fillRect(x - buttonWidth/2, y, buttonWidth, buttonHeight);
            
            // 绘制按钮边框
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x - buttonWidth/2, y, buttonWidth, buttonHeight);
            
            // 绘制槽位标题
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
            this.ctx.fillText(slot.name, x, y + 20);
            this.ctx.fillText(slot.keyHint, x, y + 40);
            
            // 绘制当前武器名称
            this.ctx.font = '14px Arial';
            this.ctx.fillText(displayName, x, y + 60);
            
            // 存储按钮位置供点击检测使用
            this.weaponSlotButtons.push({
                x: x - buttonWidth/2,
                y: y,
                width: buttonWidth,
                height: buttonHeight,
                slotKey: slot.key,
                options: slot.options
            });
        });
        
        // 当前配置显示
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('当前配置：', centerX, centerY + 100);
        
        // 显示所有槽位的配置
        weaponSlots.forEach((slot, index) => {
            const currentWeapon = slot.options.find(w => w.type === slot.currentValue);
            const displayName = currentWeapon ? currentWeapon.name : '无';
        
        this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`${slot.name}：${displayName}`, centerX + (index - 2) * buttonSpacing, centerY + 130);
        });
        
        // 无敌模式开关
        const toggleWidth = 200;
        const toggleHeight = 40;
        const toggleX = centerX - toggleWidth / 2;
        const toggleY = centerY + 160;
        const invOn = gameState.invincibleMode;
        
        this.ctx.fillStyle = invOn ? 'rgba(255, 215, 0, 0.8)' : 'rgba(100, 100, 100, 0.6)';
        this.ctx.fillRect(toggleX, toggleY, toggleWidth, toggleHeight);
        this.ctx.strokeStyle = invOn ? '#FFD700' : '#666666';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(toggleX, toggleY, toggleWidth, toggleHeight);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(invOn ? '无敌模式：开启' : '无敌模式：关闭', centerX, toggleY + 26);
        
        this.invincibleToggleButton = {
            x: toggleX, y: toggleY, width: toggleWidth, height: toggleHeight
        };
        
        // 开始游戏按钮
        const startButtonWidth = 200;
        const startButtonHeight = 50;
        const startButtonX = centerX - startButtonWidth / 2;
        const startButtonY = centerY + 220;
        
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        this.ctx.fillRect(startButtonX, startButtonY, startButtonWidth, startButtonHeight);
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(startButtonX, startButtonY, startButtonWidth, startButtonHeight);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('开始游戏', centerX, startButtonY + 32);
        
        // 存储开始游戏按钮位置
        this.startGameButton = {
            x: startButtonX,
            y: startButtonY,
            width: startButtonWidth,
            height: startButtonHeight
        };
        
        // 底部提示
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('点击武器槽位选择武器，然后点击开始游戏', centerX, GAME_CONFIG.HEIGHT - 60);
        
        // 返回按钮
        this.drawBackButton();
    }

    drawMechCustomization() {
        this.pauseButton = null;
        
        this.ctx.fillStyle = '#6B46C1';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 36px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('定制机甲', GAME_CONFIG.WIDTH / 2, 50);
        
        const { weaponOptions, shoulderWeaponOptions, hiddenAbilityOptions } = this.getWeaponOptions();
        
        const weaponSlots = [
            { key: 'leftHand', name: '左手武器', keyHint: '(左键)', color: '#4169E1', options: weaponOptions },
            { key: 'rightHand', name: '右手武器', keyHint: '(右键)', color: '#ff6b6b', options: weaponOptions },
            { key: 'leftShoulder', name: '左肩武器', keyHint: '(Q键)', color: '#FF4444', options: shoulderWeaponOptions },
            { key: 'rightShoulder', name: '右肩武器', keyHint: '(E键)', color: '#FF8800', options: shoulderWeaponOptions },
            { key: 'hiddenAbility', name: '隐藏机能', keyHint: '(Shift键)', color: '#00FFFF', options: hiddenAbilityOptions }
        ];
        
        const centerX = GAME_CONFIG.WIDTH / 2;
        const centerY = GAME_CONFIG.HEIGHT / 2;
        const buttonWidth = 200;
        const buttonHeight = 80;
        const buttonSpacing = 220;
        
        this.mechCustomSlotButtons = [];
        
        weaponSlots.forEach((slot, index) => {
            const x = centerX + (index - 2) * buttonSpacing;
            const y = centerY - 50;
            
            const currentWeapon = slot.options.find(w => w.type === gameState.weaponConfig[slot.key]);
            const displayName = currentWeapon ? currentWeapon.name : '无';
            
            this.ctx.fillStyle = slot.color;
            this.ctx.fillRect(x - buttonWidth/2, y, buttonWidth, buttonHeight);
            
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x - buttonWidth/2, y, buttonWidth, buttonHeight);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(slot.name, x, y + 20);
            this.ctx.fillText(slot.keyHint, x, y + 40);
            
            this.ctx.font = '14px Arial';
            this.ctx.fillText(displayName, x, y + 60);
            
            this.mechCustomSlotButtons.push({
                x: x - buttonWidth/2,
                y: y,
                width: buttonWidth,
                height: buttonHeight,
                slotKey: slot.key,
                options: slot.options
            });
        });
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('当前配置：', centerX, centerY + 100);
        
        weaponSlots.forEach((slot, index) => {
            const currentWeapon = slot.options.find(w => w.type === gameState.weaponConfig[slot.key]);
            const displayName = currentWeapon ? currentWeapon.name : '无';
            this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial';
            this.ctx.fillText(`${slot.name}：${displayName}`, centerX + (index - 2) * buttonSpacing, centerY + 130);
        });
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('点击武器槽位选择武器，然后返回主菜单', centerX, GAME_CONFIG.HEIGHT - 60);
        
        this.drawBackButton();
    }

    // drawMechSelection方法已删除，机甲选择界面已移除
    
    drawExplosions() {
        if (!this.explosions) {
            this.explosions = [];
            return;
        }

        // 绘制并更新爆炸效果
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            const elapsed = Date.now() - explosion.startTime;
            const progress = elapsed / explosion.duration;

            if (progress >= 1) {
                // 爆炸动画结束，移除
                this.explosions.splice(i, 1);
                continue;
            }

            // 根据导弹类型选择爆炸颜色
            const isBoss = explosion.isBossMissile;
            const isSuper = explosion.isSuperMissile;
            
            let outerColor, innerColor, centerColor, particleColor;
            
            if (isSuper) {
                // 超级导弹：紫色主题
                outerColor = '#4B0082';  // 深紫色
                innerColor = '#9370DB';  // 中紫色
                centerColor = '#FFFFFF'; // 白色中心
                particleColor = '#8A2BE2'; // 蓝紫色
            } else if (isBoss) {
                // Boss导弹：红色主题
                outerColor = '#8B0000';  // 暗红色
                innerColor = '#DC143C';  // 深红色
                centerColor = '#FF0000'; // 亮红色
                particleColor = '#B22222'; // 火砖红
            } else {
                // 普通导弹：橙色主题
                outerColor = '#FF4500';  // 橙红色
                innerColor = '#FFD700';  // 金黄色
                centerColor = '#FFFFFF'; // 白色
                particleColor = '#FF6600'; // 橙色
            }

            // 绘制爆炸效果
            this.ctx.save();
            
            // 透明度从1到0
            const alpha = 1 - progress;
            this.ctx.globalAlpha = alpha;

            // 爆炸半径从0增长到最大
            const maxRadius = explosion.explosionRadius || 80;
            const currentRadius = progress * maxRadius;

            // 外层爆炸环
            this.ctx.strokeStyle = outerColor;
            this.ctx.lineWidth = isSuper ? 8 : 6; // 超级导弹线条更粗
            this.ctx.beginPath();
            this.ctx.arc(explosion.x, explosion.y, currentRadius, 0, Math.PI * 2);
            this.ctx.stroke();

            // 内层爆炸环
            this.ctx.strokeStyle = innerColor;
            this.ctx.lineWidth = isSuper ? 6 : 4; // 超级导弹线条更粗
            this.ctx.beginPath();
            this.ctx.arc(explosion.x, explosion.y, currentRadius * 0.6, 0, Math.PI * 2);
            this.ctx.stroke();

            // 中心闪光
            if (progress < 0.3) {
                this.ctx.fillStyle = centerColor;
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, currentRadius * 0.3, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // Boss导弹额外的血红色波纹效果
            if (isBoss && progress < 0.6) {
                this.ctx.strokeStyle = '#FF4444';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]); // 虚线效果
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, currentRadius * 1.2, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]); // 重置虚线
            }

            // 超级导弹额外的紫色扩散波纹效果
            if (isSuper && progress < 0.8) {
                this.ctx.strokeStyle = '#9370DB';
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([8, 4]); // 虚线效果
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, currentRadius * 1.5, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]); // 重置虚线
                
                // 第二层扩散波纹
                this.ctx.strokeStyle = '#8A2BE2';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([12, 6]); // 更长的虚线
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, currentRadius * 2.0, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]); // 重置虚线
            }

            // 爆炸粒子
            const particleCount = isSuper ? 20 : 12; // 超级导弹更多粒子
            for (let j = 0; j < particleCount; j++) {
                const angle = (Math.PI * 2 / particleCount) * j;
                const distance = currentRadius * 0.8;
                const particleX = explosion.x + Math.cos(angle) * distance;
                const particleY = explosion.y + Math.sin(angle) * distance;

                this.ctx.fillStyle = particleColor;
                this.ctx.fillRect(particleX - 2, particleY - 2, 4, 4);
            }

            this.ctx.restore();
        }
    }
    
    drawSpinSlashEffects() {
        if (!this.spinSlashEffects) {
            this.spinSlashEffects = [];
            return;
        }
        
        for (let i = this.spinSlashEffects.length - 1; i >= 0; i--) {
            const effect = this.spinSlashEffects[i];
            const elapsed = Date.now() - effect.startTime;
            
            if (elapsed > effect.duration) {
                this.spinSlashEffects.splice(i, 1);
                continue;
            }
            
            const progress = elapsed / effect.duration;
            const alpha = 1 - progress;
            const radius = effect.radius * (1 + progress * 0.3);
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            
            // 青蓝色回旋斩特效
            const color = effect.phase === 1 ? '#4682B4' : '#00BFFF'; // 第一段钢蓝色，第二段深天蓝
            
            // 绘制旋转的斩击圆环
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 4;
            this.ctx.setLineDash([8, 4]); // 虚线效果
            this.ctx.beginPath();
            this.ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // 绘制内部填充
            this.ctx.fillStyle = `rgba(70, 130, 180, ${alpha * 0.3})`;
            this.ctx.beginPath();
            this.ctx.arc(effect.x, effect.y, radius * 0.7, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 绘制旋转的刀光效果
            const rotation = (elapsed / 100) * Math.PI; // 旋转动画
            for (let j = 0; j < 4; j++) { // 四条刀光
                const angle = rotation + (j * Math.PI / 2);
                const x1 = effect.x + Math.cos(angle) * (radius * 0.3);
                const y1 = effect.y + Math.sin(angle) * (radius * 0.3);
                const x2 = effect.x + Math.cos(angle) * radius;
                const y2 = effect.y + Math.sin(angle) * radius;
                
                this.ctx.strokeStyle = '#00CCFF';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([]);
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
            
            this.ctx.restore();
        }
    }
    
    drawTeleportEffects() {
        if (!this.teleportEffects) {
            this.teleportEffects = [];
            return;
        }
        
        for (let i = this.teleportEffects.length - 1; i >= 0; i--) {
            const effect = this.teleportEffects[i];
            const elapsed = Date.now() - effect.startTime;
            
            if (elapsed > effect.duration) {
                this.teleportEffects.splice(i, 1);
                continue;
            }
            
            const progress = elapsed / effect.duration;
            const alpha = 1 - progress;
            const radius = 30 + progress * 20; // 传送圆环扩散
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            
            // 根据是否为丑皇的传送特效选择颜色
            let strokeColor, fillColor;
            if (effect.isUglyEmperor) {
                // 丑皇：橙红色传送特效
                strokeColor = '#FF4500';
                fillColor = `rgba(255, 69, 0, ${alpha * 0.4})`;
            } else {
                // 其他Boss：青蓝色传送特效
                strokeColor = '#00CCFF';
                fillColor = `rgba(70, 130, 180, ${alpha * 0.3})`;
            }
            
            // 传送圆环
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // 内部光芒
            this.ctx.fillStyle = fillColor;
            this.ctx.beginPath();
            this.ctx.arc(effect.x, effect.y, radius * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 传送粒子效果
            for (let j = 0; j < 8; j++) {
                const angle = (Math.PI * 2 / 8) * j + progress * Math.PI;
                const particleRadius = radius * 0.8;
                const particleX = effect.x + Math.cos(angle) * particleRadius;
                const particleY = effect.y + Math.sin(angle) * particleRadius;
                
                // 根据是否为丑皇的传送特效选择粒子颜色
                if (effect.isUglyEmperor) {
                    this.ctx.fillStyle = '#FF4500'; // 丑皇：橙红色粒子
                } else {
                    this.ctx.fillStyle = '#00CCFF'; // 其他Boss：青蓝色粒子
                }
                this.ctx.fillRect(particleX - 2, particleY - 2, 4, 4);
            }
            
            this.ctx.restore();
        }
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
        
        // 绘制机甲信息
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`机甲: ${this.player.mech.name}`, 10, 25);
        
        // 生命值显示
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('❤️ 生命值: ', 10, 245);
        
        // 生命条背景
        const healthBarX = 90;
        const healthBarY = 230;
        const healthBarWidth = 200;
        const healthBarHeight = 15;
        
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        
        // 生命条
        const healthPercentage = this.player.health / this.player.maxHealth;
        const currentHealthWidth = healthBarWidth * healthPercentage;
        
        // 根据生命值比例改变颜色
        if (healthPercentage > 0.6) {
            this.ctx.fillStyle = '#00FF00';
        } else if (healthPercentage > 0.3) {
            this.ctx.fillStyle = '#FFD700';
        } else {
            this.ctx.fillStyle = '#FF0000';
        }
        
        this.ctx.fillRect(healthBarX, healthBarY, currentHealthWidth, healthBarHeight);
        
        // 生命条边框
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        
        // 生命值数字
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${this.player.health}/${this.player.maxHealth}`, healthBarX + healthBarWidth/2, healthBarY + healthBarHeight/2 + 4);
        
        // 无敌状态显示
        if (this.player.isInvincible) {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 18px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText('⭐ 无敌模式 ⭐', 10, 270);
        }
        
        // 左手武器状态 (左键)
        const leftWeapon = this.player.getLeftHandWeapon();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('��️ 左键 - ', 10, 45);
        
        if (leftWeapon) {
            // 检查是否因为闪避而无法攻击
            if (!this.player.canAttack()) {
                this.ctx.fillStyle = '#CC6666';
                this.ctx.fillText(`${leftWeapon.name}: 闪避限制`, 90, 45);
            } else {
                const leftStatus = leftWeapon.getStatus();
                this.ctx.fillStyle = leftStatus.color;
                this.ctx.fillText(`${leftWeapon.name}: ${leftStatus.text}`, 90, 45);
            }
        } else {
            this.ctx.fillStyle = '#666666';
            this.ctx.fillText('无武器', 90, 45);
        }
        
        // 右手武器状态 (右键)
        const rightWeapon = this.player.getRightHandWeapon();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🖐️ 右键 - ', 10, 85);
        
        if (rightWeapon) {
            // 检查是否因为闪避而无法攻击
            if (!this.player.canAttack()) {
                this.ctx.fillStyle = '#CC6666';
                this.ctx.fillText(`${rightWeapon.name}: 闪避限制`, 90, 85);
            } else {
                const rightStatus = rightWeapon.getStatus();
                this.ctx.fillStyle = rightStatus.color;
                this.ctx.fillText(`${rightWeapon.name}: ${rightStatus.text}`, 90, 85);
            }
        } else {
            this.ctx.fillStyle = '#666666';
            this.ctx.fillText('无武器', 90, 85);
        }
        
        // 闪避状态 (空格键)
        const dodgeStatus = this.player.getDodgeStatus();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('⚡ 空格 - ', 10, 105);
        this.ctx.fillStyle = dodgeStatus.color;
        this.ctx.fillText(`闪避: ${dodgeStatus.text}`, 90, 105);
        
        // 锁定模式 (F键切换)
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🎯 F键 - ', 10, 125);
        const lockModeText = this.player.getLockModeText();
        this.ctx.fillStyle = gameState.lockMode === 'manual' ? '#FFD700' : 'white';
        this.ctx.fillText(`锁定模式: ${lockModeText}`, 90, 125);
        
        // 隐藏机能状态 (Shift键)
        const hiddenAbility = this.player.getHiddenAbilityWeapon();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🛡️ Shift键 - ', 10, 145);
        
        if (hiddenAbility) {
            const hiddenStatus = hiddenAbility.getStatus();
            this.ctx.fillStyle = hiddenStatus.color;
            this.ctx.fillText(`${hiddenAbility.name}: ${hiddenStatus.text}`, 90, 145);
        } else {
            this.ctx.fillStyle = '#666666';
            this.ctx.fillText('无隐藏机能', 90, 145);
        }
        
        // 硬锁模式下的C键提示
        if (gameState.lockMode === 'hard') {
            this.ctx.fillStyle = 'white';
            this.ctx.fillText('🔄 C键 - ', 10, 165);
            this.ctx.fillStyle = '#87CEEB';
            this.ctx.fillText('切换目标', 90, 165);
        }
        
        // 左肩武器状态 (Q键)
        const leftShoulderWeapon = this.player.getLeftShoulderWeapon();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🚀 Q键 - ', 10, 185);
        
        if (leftShoulderWeapon) {
            const leftShoulderStatus = leftShoulderWeapon.getStatus();
            this.ctx.fillStyle = leftShoulderStatus.color;
            this.ctx.fillText(`${leftShoulderWeapon.name}: ${leftShoulderStatus.text}`, 90, 185);
        } else {
            this.ctx.fillStyle = '#666666';
            this.ctx.fillText('无左肩武器', 90, 185);
        }
        
        // 右肩武器状态 (E键)
        const rightShoulderWeapon = this.player.getRightShoulderWeapon();
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🚀 E键 - ', 10, 205);
        
        if (rightShoulderWeapon) {
            const rightShoulderStatus = rightShoulderWeapon.getStatus();
            this.ctx.fillStyle = rightShoulderStatus.color;
            this.ctx.fillText(`${rightShoulderWeapon.name}: ${rightShoulderStatus.text}`, 90, 205);
        } else {
            this.ctx.fillStyle = '#666666';
            this.ctx.fillText('无右肩武器', 90, 205);
        }
        
        // 维修包状态 (Control键)
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('🛠️ Ctrl键 - ', 10, 225);
        if (gameState.repairKits > 0) {
            this.ctx.fillStyle = '#00FF00'; // 绿色，有维修包
            this.ctx.fillText(`维修包: ${gameState.repairKits}/${gameState.maxRepairKits}`, 90, 225);
        } else {
            this.ctx.fillStyle = '#FF6666'; // 红色，无维修包
            this.ctx.fillText('维修包: 已用完', 90, 225);
        }
        
        // 根据游戏模式显示不同的统计信息
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'right';
        
        // 显示当前游戏模式
        const currentMode = GAME_MODES[gameState.selectedGameMode];
        this.ctx.fillStyle = currentMode.color;
        this.ctx.fillText(`模式: ${currentMode.name}`, GAME_CONFIG.WIDTH - 10, 25);
        
        // Boss战模式：显示Boss击杀数
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(`Boss击杀数: ${gameState.bossKillCount}`, GAME_CONFIG.WIDTH - 10, 45);
            
        // Boss血条显示在屏幕上方中央
            if (this.boss) {
            this.drawBossHealthBar();
        }
        
        // 返回主菜单提示

        
        // 返回主菜单按钮
        this.drawMainMenuButton();
        
        // 暂停按钮
        this.drawPauseButton();
        
        // 失明状态提示（在UI最上层）
        if (gameState.playerBlinded) {
            this.drawBlindnessStatusText();
        }
    }
    
    drawBossHealthBar() {
        if (!this.boss) return;
        
        const healthBarWidth = 400;
        const healthBarHeight = 20;
        const x = (GAME_CONFIG.WIDTH - healthBarWidth) / 2;
        const y = 30;
        
        // 血条背景
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 5, y - 5, healthBarWidth + 10, healthBarHeight + 10);
        
        // 血条边框
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, healthBarWidth, healthBarHeight);
        
        // 血条填充
        const healthPercentage = this.boss.health / this.boss.maxHealth;
        const fillWidth = healthBarWidth * healthPercentage;
        
        // 血条颜色根据血量变化
        if (healthPercentage > 0.6) {
            this.ctx.fillStyle = '#FF4444'; // 血红色
        } else if (healthPercentage > 0.3) {
            this.ctx.fillStyle = '#FF8844'; // 橙红色
        } else {
            this.ctx.fillStyle = '#FF0000'; // 深红色
        }
        
        this.ctx.fillRect(x, y, fillWidth, healthBarHeight);
        
        // 血条文字 - 根据Boss类型显示不同名字
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        let bossName = '血红之王'; // 默认名字
        if (this.boss instanceof SublimeMoon) {
            bossName = '冰之姬';
        } else if (this.boss instanceof StarDevourer) {
            bossName = '噬星者';
        } else if (this.boss instanceof UglyEmperor) {
            bossName = '丑皇';
        }
        // 确保血量显示不为负数
        const displayHealth = Math.max(0, this.boss.health);
        this.ctx.fillText(`${bossName} - ${displayHealth}/${this.boss.maxHealth}`, GAME_CONFIG.WIDTH / 2, y + healthBarHeight + 20);
        
        // 绘制噬星者失明技能状态
        if (this.boss instanceof StarDevourer && this.boss.blindnessSkill) {
            const skill = this.boss.blindnessSkill;
            const params = this.boss.getBlindnessParams(); // 获取当前阶段参数
            const now = Date.now();
            
            let statusText = '';
            let statusColor = '#ffffff';
            
            if (skill.isActive) {
                const remaining = Math.max(0, params.duration - (now - skill.startTime));
                const remainingSeconds = (remaining / 1000).toFixed(1);
                statusText = `失明激活中 ${remainingSeconds}s`;
                statusColor = '#8B00FF';
            } else if (!skill.unlocked) {
                const damageTaken = this.boss.maxHealth - this.boss.health;
                const damageNeeded = 50 - damageTaken;
                if (damageNeeded > 0) {
                    statusText = `失明技能解锁: 还需 ${damageNeeded} 伤害`;
                    statusColor = '#aaaaaa';
                } else {
                    statusText = '失明技能已解锁';
                    statusColor = '#ffff00';
                }
            } else {
                const cooldownRemaining = Math.max(0, params.cooldown - (now - skill.lastUse));
                if (cooldownRemaining > 0) {
                    const cooldownSeconds = (cooldownRemaining / 1000).toFixed(1);
                    const phaseInfo = this.boss.phaseTwo.activated ? '(二阶段)' : '(一阶段)';
                    statusText = `失明冷却中 ${cooldownSeconds}s ${phaseInfo}`;
                    statusColor = '#ff8888';
                } else {
                    const phaseInfo = this.boss.phaseTwo.activated ? '(二阶段)' : '(一阶段)';
                    statusText = `失明技能准备就绪 ${phaseInfo}`;
                    statusColor = '#88ff88';
                }
            }
            
            this.ctx.fillStyle = statusColor;
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(statusText, GAME_CONFIG.WIDTH / 2, y + healthBarHeight + 40);
            
            // 绘制二阶段状态
            if (this.boss.phaseTwo) {
                let phaseText = '';
                let phaseColor = '#ffffff';
                
                if (this.boss.phaseTwo.activated) {
                    // 检查是否在检测范围内
                    const withinRange = this.boss.isWithinDetectionRange();
                    const distance = Math.floor(this.boss.getDistanceToPlayer());
                    const maxRange = this.boss.phaseTwo.detectionRange;
                    
                    if (withinRange) {
                        phaseText = `二阶段 - 距离 ${distance}/${maxRange} - 可见可锁定`;
                        phaseColor = '#00ff00'; // 绿色，可见状态
                    } else {
                        phaseText = `二阶段 - 距离 ${distance}/${maxRange} - 隐身状态`;
                        phaseColor = '#ff0000'; // 红色，隐身状态
                    }
                } else {
                    const currentHealth = this.boss.health;
                    const triggerHealth = this.boss.phaseTwo.triggerHealth;
                    if (currentHealth > triggerHealth) {
                        const damageNeeded = currentHealth - triggerHealth;
                        phaseText = `二阶段触发: 还需 ${damageNeeded} 伤害`;
                        phaseColor = '#ffaa00'; // 橙色提示
                    }
                }
                
                if (phaseText) {
                    this.ctx.fillStyle = phaseColor;
                    this.ctx.font = 'bold 14px Arial';
                    this.ctx.fillText(phaseText, GAME_CONFIG.WIDTH / 2, y + healthBarHeight + 60);
                }
            }
        }
        
        // 重置文字对齐方式
        this.ctx.textAlign = 'left';
    }
    
    drawPauseButton() {
        const buttonWidth = 80;
        const buttonHeight = 40;
        const buttonX = GAME_CONFIG.WIDTH - buttonWidth - 20;
        const buttonY = 20;
        
        // 绘制按钮背景
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮边框
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮文字
        this.ctx.fillStyle = 'black';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('暂停', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 6);
        
        // 存储按钮位置供点击检测使用
        this.pauseButton = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    }
    
    getGuideData() {
        return [
            {
                id: 'controls', name: '操作说明', color: '#4488FF',
                content: [
                    '【移动】 WASD / 方向键',
                    '【左手武器】 鼠标左键',
                    '【右手武器】 鼠标右键',
                    '【左肩武器】 Q键',
                    '【右肩武器】 E键',
                    '【隐藏机能】 Shift键',
                    '【闪避】 空格 + 方向键（0.15秒，冷却0.35秒）',
                    '【切换锁定】 F键（软锁→硬锁→手动锁）',
                    '【切换目标】 C键（硬锁模式下）',
                    '【重装弹药】 R键',
                    '【维修包】 Ctrl键（+60HP，共3个）',
                    '【暂停】 P键',
                    '【返回主菜单】 ESC键',
                    '',
                    '— 锁定系统 —',
                    '软锁：自动瞄准最近敌人',
                    '硬锁：锁定当前目标不放，C键切换',
                    '手动锁：鼠标控制瞄准方向',
                ]
            },
            {
                id: 'hand_weapons', name: '手部武器', color: '#4169E1',
                items: [
                    { name: '自动步枪', color: '#4169E1', lines: [
                        '伤害 6/发 | 射速 5发/秒',
                        '弹匣 30发 | 重装 2秒',
                        '自动预瞄：根据目标速度预判落点',
                    ]},
                    { name: '脉冲光束军刀', color: '#ff6b6b', lines: [
                        '伤害 50 | 120°扇形范围',
                        '冷却 4.8秒',
                        '刀推：距目标过远时自动冲刺接近',
                    ]},
                    { name: '镭射长枪', color: '#00FFFF', lines: [
                        '伤害 25 | 冲锋距离 400像素',
                        '冲锋速度 40 | 冷却 5秒',
                        '可扎穿敌人并带其一起移动',
                    ]},
                    { name: '镭射步枪', color: '#FF4444', lines: [
                        '伤害 18 | 蓄力 1秒后发射',
                        '射击间隔 0.7秒 | 射程无限',
                        '过热系统：每发+50热量，≥200过热',
                        '过热后强制散热7秒',
                    ]},
                    { name: '分裂飞弹', color: '#FFD700', lines: [
                        '发射1枚母弹，持续索敌（8秒无目标自爆）',
                        '接近敌人120px分裂为8枚子弹',
                        '子弹伤害 3 | 高追踪性 | 冷却 4秒',
                        '分裂后先扇形散开再制导',
                    ]},
                ]
            },
            {
                id: 'shoulder_weapons', name: '肩部武器', color: '#FF8800',
                items: [
                    { name: '15连导弹发射器', color: '#FFD700', lines: [
                        '每次齐射 15枚 | 每枚 3伤害',
                        '前1.1秒强追踪 | 爆炸半径 80px',
                        '冷却 4秒',
                    ]},
                    { name: '近防炮 (CIWS)', color: '#00FF88', lines: [
                        '全自动射击 30发/秒 | 弹仓 30发',
                        '优先级：导弹 > 月牙弹 > 策反弹 > 机雷 > 敌人',
                        '对制导武器一发摧毁',
                        '对敌人本体 40%概率造成伤害',
                    ]},
                    { name: '6连电浆飞弹', color: '#00FFCC', lines: [
                        '6枚连射 | 近炸引信（55px引爆）',
                        '生成电浆场：持续1秒，每0.25秒造成3伤害',
                        '多个电浆场可叠加 | 冷却 5秒',
                    ]},
                    { name: '超级导弹', color: '#FF0000', lines: [
                        '伤害 100 | 占用左右肩双槽位',
                        '爆炸半径 400px | 超强追踪 4.1秒',
                        '每场战斗限用1次',
                    ]},
                    { name: '月光大剑', color: '#88CCFF', lines: [
                        '伤害 200 | 占用右手+双肩+隐藏机能共4槽位',
                        '光刃长度为光束军刀的7倍（1050px）',
                        '机体朝向±90°共180°范围 | 1秒完成扫击',
                        '无法秒杀Boss（最低保留1HP）',
                        '每场战斗限用1次',
                    ]},
                ]
            },
            {
                id: 'hidden', name: '隐藏机能', color: '#00FFFF',
                items: [
                    { name: '脉冲护盾', color: '#00FFFF', lines: [
                        '70%伤害减免 | 持续 15秒',
                        '冷却 40秒',
                    ]},
                    { name: 'EMP电磁脉冲', color: '#66CCFF', lines: [
                        '范围 490px | 最大伤害 100',
                        '距离越远伤害越低 | 附加0.5秒僵直',
                        '冷却 30秒',
                    ]},
                    { name: '反制重击', color: '#FF8C00', lines: [
                        '持续 3秒 | 受伤减少 40%',
                        '将受到伤害的50%反射给最近敌人',
                        '冷却 50秒',
                    ]},
                    { name: '诱饵分身', color: '#4488FF', lines: [
                        '释放 3 个全息诱饵（等边三角形散开）',
                        '诱饵 40HP | 最多存活 7秒',
                        '玩家进入 4秒不可锁定状态',
                        '敌方AI/导弹/子弹转向攻击诱饵',
                        '冷却 35秒',
                    ]},
                ]
            },
            {
                id: 'bosses', name: 'Boss图鉴', color: '#FF4444',
                items: [
                    { name: '★ 血红之王', color: '#8B0000', lines: [
                        'HP 300 | 导弹洗地型',
                        '',
                        '— 攻击方式 —',
                        '60枚导弹齐射，四方向轮流，每枚6伤害',
                        '导弹带延迟制导，0.3秒后开始追踪',
                        '',
                        '— 特殊机制 —',
                        '累积减伤：1秒内受伤越多减伤越高（不归零）',
                        '导弹闪避：被追踪时80%闪避',
                        '回血：每3秒 45%概率恢复6-20HP',
                        '',
                        '— 建议 —',
                        '近防炮拦截导弹，配合近战输出',
                        '避免短时间集中火力触发高减伤',
                    ]},
                    { name: '★★ 冰之姬', color: '#4682B4', lines: [
                        'HP 200 | 高机动刺客型',
                        '',
                        '— 攻击方式 —',
                        '月牙追踪弹：5发齐射，10伤害+僵直',
                        '回旋斩：两段(12+18)伤害，可摧毁附近导弹',
                        '回旋镖形态：5个回旋镖，每个30伤害',
                        '分身：4个分身，每1.5秒发射15伤害月牙弹',
                        '',
                        '— 特殊机制 —',
                        '瞬移：距远或导弹靠近时瞬移到玩家背后',
                        '极高导弹闪避：90%概率闪避',
                        '',
                        '— 建议 —',
                        '近防炮拦截月牙弹，导弹对她效果有限',
                        '注意瞬移后的背刺，保持移动',
                    ]},
                    { name: '★★★ 噬星者', color: '#333333', lines: [
                        'HP 300 | 战术压制型',
                        '',
                        '— 攻击方式 —',
                        '光束步枪：25伤害+0.7秒僵直',
                        '自动步枪：近距离6伤害/发，30发/秒',
                        '浮游炮×3：各70HP，镭射15伤害+僵直',
                        '',
                        '— 特殊机制 —',
                        '失明：屏幕全黑，无法切换锁定',
                        '二阶段(≤80HP)：隐身(200px内可见)',
                        '导弹反转：75%玩家导弹被策反攻击玩家',
                        '',
                        '— 建议 —',
                        '优先摧毁浮游炮，近防炮拦截策反导弹',
                        '失明时保持移动，二阶段需近距离作战',
                    ]},
                    { name: '★★★★ 丑皇', color: '#8B4513', lines: [
                        'HP 250 | 区域控制型',
                        '',
                        '— 攻击方式 —',
                        '混沌弹幕：8发/波，4伤害/发',
                        '扭曲光环：半径80px持续伤害场',
                        '机雷(一阶段)：引爆15伤害',
                        '燃烧瓶(二阶段)：产生燃烧区域',
                        '',
                        '— 特殊机制 —',
                        '一阶段：免疫导弹伤害',
                        '二阶段(≤100HP)：仅受导弹伤害，伤害×2',
                        '混沌传送：每8秒传送到玩家附近',
                        '',
                        '— 建议 —',
                        '一阶段用步枪/激光/近战，近防炮清机雷',
                        '二阶段全力导弹输出（伤害翻倍）',
                        '两阶段需完全不同的武器策略',
                    ]},
                ]
            },
            {
                id: 'status', name: '状态效果', color: '#AAAAAA',
                content: [
                    '【僵直】 短暂无法移动和行动',
                    '【燃烧】 持续5秒，每0.1秒受2伤害，移速-20%',
                    '【失明】 噬星者专属，屏幕全黑，无法切换锁定',
                    '',
                    '— 玩家属性 —',
                    '生命值：150',
                    '移动速度：20',
                    '维修包：3个，每个恢复60HP',
                    '闪避：0.15秒，冷却0.35秒',
                ]
            },
        ];
    }

    drawGuide() {
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const ctx = this.ctx;
        
        ctx.fillStyle = '#111118';
        ctx.fillRect(0, 0, W, H);
        
        this.guideButtons = [];
        
        if (!gameState.guideCategory) {
            // 主目录
            ctx.fillStyle = 'white';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('游戏简介', W / 2, 55);
            
            const categories = this.getGuideData();
            const btnW = 360;
            const btnH = 55;
            const startY = 100;
            const gap = 12;
            
            categories.forEach((cat, i) => {
                const bx = W / 2 - btnW / 2;
                const by = startY + i * (btnH + gap);
                
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fillRect(bx, by, btnW, btnH);
                ctx.strokeStyle = cat.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, btnW, btnH);
                
                ctx.fillStyle = cat.color;
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(cat.name, W / 2, by + 35);
                
                this.guideButtons.push({ x: bx, y: by, width: btnW, height: btnH, action: 'category', id: cat.id });
            });
            
            // 返回按钮
            this._drawGuideBackButton('返回主菜单');
            
        } else if (gameState.guideSubItem === null) {
            const categories = this.getGuideData();
            const cat = categories.find(c => c.id === gameState.guideCategory);
            if (!cat) return;
            
            ctx.fillStyle = cat.color;
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(cat.name, W / 2, 50);
            
            if (cat.content) {
                // 纯文字页面（操作说明、状态效果）
                const startY = 85;
                const lineH = 26;
                ctx.font = '16px Arial';
                ctx.textAlign = 'left';
                const textX = W / 2 - 240;
                
                cat.content.forEach((line, i) => {
                    const y = startY + i * lineH - gameState.guideScrollOffset;
                    if (y < 65 || y > H - 60) return;
                    if (line.startsWith('【')) {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.font = 'bold 16px Arial';
                    } else if (line.startsWith('—')) {
                        ctx.fillStyle = cat.color;
                        ctx.font = 'bold 16px Arial';
                    } else {
                        ctx.fillStyle = '#CCCCCC';
                        ctx.font = '16px Arial';
                    }
                    ctx.fillText(line, textX, y);
                });
            } else if (cat.items) {
                // 子项目列表
                const btnW = 360;
                const btnH = 50;
                const startY = 80;
                const gap = 10;
                
                cat.items.forEach((item, i) => {
                    const bx = W / 2 - btnW / 2;
                    const by = startY + i * (btnH + gap);
                    
                    ctx.fillStyle = 'rgba(255,255,255,0.06)';
                    ctx.fillRect(bx, by, btnW, btnH);
                    ctx.strokeStyle = item.color;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(bx, by, btnW, btnH);
                    
                    ctx.fillStyle = item.color;
                    ctx.font = 'bold 18px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(item.name, W / 2, by + 32);
                    
                    this.guideButtons.push({ x: bx, y: by, width: btnW, height: btnH, action: 'subitem', index: i });
                });
            }
            
            this._drawGuideBackButton('返回目录');
            
        } else {
            // 子项目详情
            const categories = this.getGuideData();
            const cat = categories.find(c => c.id === gameState.guideCategory);
            if (!cat || !cat.items) return;
            const item = cat.items[gameState.guideSubItem];
            if (!item) return;
            
            ctx.fillStyle = item.color;
            ctx.font = 'bold 26px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.name, W / 2, 50);
            
            const startY = 85;
            const lineH = 26;
            ctx.textAlign = 'left';
            const textX = W / 2 - 240;
            
            item.lines.forEach((line, i) => {
                const y = startY + i * lineH - gameState.guideScrollOffset;
                if (y < 65 || y > H - 60) return;
                if (line === '') {
                    return;
                } else if (line.startsWith('—')) {
                    ctx.fillStyle = item.color;
                    ctx.font = 'bold 16px Arial';
                } else {
                    ctx.fillStyle = '#CCCCCC';
                    ctx.font = '16px Arial';
                }
                ctx.fillText(line, textX, y);
            });
            
            this._drawGuideBackButton('返回' + cat.name);
        }
    }
    
    _drawGuideBackButton(text) {
        const btnW = 140;
        const btnH = 36;
        const bx = 40;
        const by = GAME_CONFIG.HEIGHT - 55;
        
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.fillRect(bx, by, btnW, btnH);
        this.ctx.strokeStyle = '#888888';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(bx, by, btnW, btnH);
        
        this.ctx.fillStyle = '#CCCCCC';
        this.ctx.font = '15px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, bx + btnW / 2, by + 24);
        
        this.guideBackBtn = { x: bx, y: by, width: btnW, height: btnH };
    }
    
    drawBackButton() {
        const buttonWidth = 120;
        const buttonHeight = 40;
        const buttonX = 50;
        const buttonY = GAME_CONFIG.HEIGHT - 60;
        
        // 绘制按钮背景
        this.ctx.fillStyle = 'rgba(255, 165, 0, 0.8)';
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮边框
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮文字
        this.ctx.fillStyle = 'black';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('← 返回', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 6);
        
        // 存储按钮位置供点击检测使用
        this.backButton = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    }
    
    drawMainMenuButton() {
        const buttonWidth = 120;
        const buttonHeight = 40;
        const buttonX = 50;
        const buttonY = GAME_CONFIG.HEIGHT - 100;
        
        // 绘制按钮背景
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮边框
        this.ctx.strokeStyle = '#FF4444';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        // 绘制按钮文字
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('主菜单', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 6);
        
        // 存储按钮位置供点击检测使用
        this.mainMenuButton = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    }
    
    drawCrosshair() {
        // 获取鼠标位置或手动锁定位置
        const crosshairX = gameState.manualLockX || mouse.x;
        const crosshairY = gameState.manualLockY || mouse.y;
        
        // 绘制准心
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([]);
        
        // 外圆
        this.ctx.beginPath();
        this.ctx.arc(crosshairX, crosshairY, 20, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 内圆
        this.ctx.beginPath();
        this.ctx.arc(crosshairX, crosshairY, 5, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // 十字线
        this.ctx.beginPath();
        // 水平线
        this.ctx.moveTo(crosshairX - 30, crosshairY);
        this.ctx.lineTo(crosshairX - 20, crosshairY);
        this.ctx.moveTo(crosshairX + 20, crosshairY);
        this.ctx.lineTo(crosshairX + 30, crosshairY);
        // 垂直线
        this.ctx.moveTo(crosshairX, crosshairY - 30);
        this.ctx.lineTo(crosshairX, crosshairY - 20);
        this.ctx.moveTo(crosshairX, crosshairY + 20);
        this.ctx.lineTo(crosshairX, crosshairY + 30);
        this.ctx.stroke();
        
        // 中心点
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(crosshairX - 1, crosshairY - 1, 2, 2);
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
            if (this.bossButton && this.isButtonClicked(this.bossButton, mouseX, mouseY)) {
                this.selectGameMode('BOSS_BATTLE');
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
        // 清除不需要的按钮状态
        this.backButton = null;
        this.pauseButton = null;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('游戏暂停', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 60);

        this.ctx.font = '18px Arial';
        this.ctx.fillText('按 P 继续游戏', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 20);
        
        // 返回主菜单按钮
        const buttonWidth = 150;
        const buttonHeight = 50;
        const buttonX = GAME_CONFIG.WIDTH / 2 - buttonWidth / 2;
        const buttonY = GAME_CONFIG.HEIGHT / 2 + 20;
        
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        this.ctx.strokeStyle = '#FF4444';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('返回主菜单', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 6);
        
        this.mainMenuButton = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };
    }

    drawGameOver() {
        // 清除不需要的按钮状态
        this.backButton = null;
        this.pauseButton = null;
        this.mainMenuButton = null;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('游戏结束', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 80);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(`造成总伤害: ${Math.floor(gameState.totalDamage)}`, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 30);

        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = '#888888';
        this.ctx.fillText('按空格键返回主菜单', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 30);
    }
    
    drawBlindnessEffect() {
        // 绘制纯黑色的失明遮挡（无透明度）
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
    }
    
    drawBlindnessStatusText() {
        // 绘制失明状态提示文字（在失明效果之上）
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 32px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('失明状态', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2);
        
        // 绘制剩余时间提示（如果有Boss的话）
        if (this.boss && this.boss.blindnessSkill && this.boss.blindnessSkill.isActive) {
            const params = this.boss.getBlindnessParams(); // 获取当前阶段参数
            const remaining = Math.max(0, params.duration - (Date.now() - this.boss.blindnessSkill.startTime));
            const remainingSeconds = (remaining / 1000).toFixed(1);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '18px Arial';
            this.ctx.fillText(`剩余时间: ${remainingSeconds}秒`, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 40);
        }
        
        // 重置文字对齐方式
        this.ctx.textAlign = 'left';
    }

    drawVictoryScreen() {
        // 绘制半透明黑色背景
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        this.ctx.fillRect(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
        
        // 绘制胜利标题（更大更明显）
        this.ctx.fillStyle = '#FFD700'; // 金色
        this.ctx.font = 'bold 72px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🎉 胜利！🎉', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 120);
        
        // 绘制击败的Boss名称
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 36px Arial';
        this.ctx.fillText(`击败了 ${gameState.victoryBossName}！`, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 40);
        
        // 绘制分数
        this.ctx.font = '28px Arial';
        this.ctx.fillStyle = '#CCCCCC';
        this.ctx.fillText(`最终分数: ${gameState.score}`, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 20);
        
        // 绘制返回提示
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = '#888888';
        this.ctx.fillText('按空格键返回主菜单', GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 80);
        
        this.ctx.restore();
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
        gameState.showModeSelection = true;
        gameState.showLevelSelection = false;
        gameState.showWeaponConfig = false;
        gameState.selectedMech = null;
        gameState.selectedGameMode = null;
        gameState.selectedLevel = null;
        gameState.bossSpawned = false;
        gameState.bossKillCount = 0;
        // 重置失明状态
        gameState.playerBlinded = false;
        // 重置维修包数量
        gameState.repairKits = gameState.maxRepairKits;
        // 武器配置重置为默认
        gameState.weaponConfig = {
            leftHand: 'gun',
            rightHand: 'sword',
            hiddenAbility: 'pulse_shield'
        };
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