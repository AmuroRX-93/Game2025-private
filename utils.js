// 工具函数

// 获取Boss的攻击目标（玩家不可锁定时转向诱饵）
function getBossTarget() {
    if (!game || !game.player) return null;
    if (game.player.isUntargetable && game.decoys && game.decoys.length > 0) {
        return game.decoys[Math.floor(Math.random() * game.decoys.length)];
    }
    return game.player;
}

function getBossTargetCenter() {
    const target = getBossTarget();
    if (!target) return null;
    return { x: target.x + target.width / 2, y: target.y + target.height / 2, entity: target };
}

function drawBossLockIndicator(ctx, entity, fillColor, strokeColor, opts = {}) {
    const tipYOffset = opts.tipYOffset || -40;
    const halfWidth = opts.halfWidth || 10;
    const height = opts.height || 15;
    const bounceAmp = opts.bounceAmp || 3;
    const speed = opts.speed || 0.008;
    const lineWidth = opts.lineWidth || 2;

    const cx = entity.x + entity.width / 2;
    const bounce = Math.sin(Date.now() * speed) * bounceAmp;
    const tipY = entity.y + tipYOffset + bounce;

    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - halfWidth, tipY - height);
    ctx.lineTo(cx + halfWidth, tipY - height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function checkBossMeleeDodge(boss) {
    if (boss.isDodging) return;
    const now = Date.now();
    if (now - boss.lastDodgeTime < boss.dodgeCooldown) return;
    if (!game.player) return;
    const target = game.player.getCurrentTarget();
    if (target !== boss) return;
    if (!game.player.isUsingMeleeWeapon()) return;
    if (now - boss.lastPlayerAttackCheck < 300) return;
    boss.lastPlayerAttackCheck = now;
    if (Math.random() < boss.dodgeChance) {
        startBossDodge(boss);
    }
}

function startBossDodge(boss) {
    boss.isDodging = true;
    boss.dodgeStartTime = Date.now();
    boss.originalVx = boss.vx;
    boss.originalVy = boss.vy;
    boss.lastDodgeTime = boss.dodgeStartTime;

    const playerX = game.player.x + game.player.width / 2;
    const playerY = game.player.y + game.player.height / 2;
    const bossX = boss.x + boss.width / 2;
    const bossY = boss.y + boss.height / 2;
    const dx = playerX - bossX;
    const dy = playerY - bossY;
    const toPlayerAngle = Math.atan2(dy, dx);
    const awayAngle = toPlayerAngle + Math.PI;
    const variation = (Math.random() - 0.5) * Math.PI / 3;
    const dodgeAngle = awayAngle + variation;

    boss.vx = Math.cos(dodgeAngle) * boss.dodgeSpeed;
    boss.vy = Math.sin(dodgeAngle) * boss.dodgeSpeed;
}

function handleBossKill() {
    game.boss = null;
    gameState.score += 100;
    gameState.bossKillCount++;
    if (gameState.selectedGameMode === 'BOSS_BATTLE') {
        gameState.bossSpawned = false;
        game.showVictoryAndReturnToMenu();
    }
}

function getDistanceFromBoss(boss) {
    const tc = getBossTargetCenter();
    if (!tc) return Infinity;
    const bcx = boss.x + boss.width / 2;
    const bcy = boss.y + boss.height / 2;
    return Math.sqrt((tc.x - bcx) * (tc.x - bcx) + (tc.y - bcy) * (tc.y - bcy));
}

function updateUI() {
    document.getElementById('score').textContent = Math.floor(gameState.score);
}

// 初始化游戏
let game;
document.addEventListener('DOMContentLoaded', () => {
    // 设置canvas全屏
    const canvas = document.getElementById('gameCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    game = new Game();
    updateUI();
    
    // 确保Canvas获得焦点
    canvas.focus();
    
    // 处理窗口大小变化
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        GAME_CONFIG.WIDTH = window.innerWidth;
        GAME_CONFIG.HEIGHT = window.innerHeight;
    });
    
    // 点击Canvas时获得焦点
    canvas.addEventListener('click', () => {
        canvas.focus();
    });
    
    // 键盘事件处理 - 在游戏对象创建后绑定
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        if (e.key.length === 1) {
            keys[e.key.toLowerCase()] = true;
            keys[e.key.toUpperCase()] = true;
        }
        
        // 游戏简介界面导航
        if (gameState.showGuide) {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
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
            }
            return;
        }
        
        // 游戏模式选择（支持键盘和点击）
        if (gameState.showModeSelection) {
            if (e.key === '1') {
                if (game) {
                    game.selectGameMode('BOSS_BATTLE');
                }
            } else if (e.key === '2') {
                if (game) {
                    game.showMechCustomization();
                }
            }
            return;
        }
        
        // 武器配置选择（现在只处理返回按键）
        if (gameState.showWeaponConfig) {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
                // 返回模式选择
                if (game) {
                    game.backToModeSelection();
                }
            }
            return;
        }
        
        // 机甲定制选择（现在只处理返回按键）
        if (gameState.showMechCustomization) {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
                // 返回主菜单
                if (game) {
                    game.backToMainMenu();
                }
            }
            return;
        }

        // 机甲选择已删除
        
        if (e.key === ' ') {
            if (gameState.gameOver) {
                game.restart();
                return;
            }
            if (gameState.victory) {
                game.backToMainMenu();
                return;
            }
        }
        
        // 死亡/胜利画面只响应空格键（已在上方处理）
        if (gameState.gameOver || gameState.victory) {
            return;
        }
        
        // 游戏中的按键处理
        if (!gameState.gameOver && !gameState.showModeSelection && !gameState.showWeaponConfig && !gameState.showMechCustomization && !gameState.victory) {
            if (e.key === 'Escape') {
                // ESC键返回主菜单
                if (game) {
                    game.backToMainMenu();
                }
            } else if (e.key === 'p' || e.key === 'P') {
                // P键暂停游戏
                gameState.paused = !gameState.paused;
            } else if (e.key === 'f' || e.key === 'F') {
                // F键切换锁定模式
                if (game && game.player) {
                    game.player.toggleLockMode();
                }
            } else if (e.key === 'c' || e.key === 'C') {
                // C键切换硬锁目标（仅在硬锁模式下有效）
                if (game && game.player) {
                    game.player.switchHardLockTarget();
                }
            } else if (e.key === 'Control') {
                // Control键使用维修包
                if (game && game.player) {
                    const used = game.player.useRepairKit();
                    if (used) {
                        updateUI(); // 更新UI显示
                    }
                }
            } else if (e.key === 'Shift') {
                // Shift键使用隐藏技能
                if (game && game.player) {
                    game.player.useHiddenAbility();
                }
            } else if (e.key === 'q' || e.key === 'Q') {
                if (game && game.player) {
                    const leftWeapon = game.player.getLeftShoulderWeapon();
                    const rightWeapon = game.player.getRightShoulderWeapon();
                    if ((leftWeapon && leftWeapon.type === 'super_weapon') || 
                        (rightWeapon && rightWeapon.type === 'super_weapon')) {
                        game.player.useSuperWeapon();
                    } else {
                        game.player.useLeftShoulderWeapon();
                    }
                }
            } else if (e.key === 'e' || e.key === 'E') {
                if (game && game.player) {
                    const leftWeapon = game.player.getLeftShoulderWeapon();
                    const rightWeapon = game.player.getRightShoulderWeapon();
                    if ((leftWeapon && leftWeapon.type === 'super_weapon') || 
                        (rightWeapon && rightWeapon.type === 'super_weapon')) {
                        game.player.useSuperWeapon();
                    } else {
                        game.player.useRightShoulderWeapon();
                    }
                }
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        if (e.key.length === 1) {
            keys[e.key.toLowerCase()] = false;
            keys[e.key.toUpperCase()] = false;
        }
        
        // Shift键处理现在由玩家自己在update中检查keys['Shift']
        // 不再直接修改 player.isSprinting
    });

    // 鼠标事件处理
    document.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // 左键
            // 总是检查是否点击了按钮（所有界面）
            if (game) {
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                if (game.handleClick(mouseX, mouseY)) {
                    return; // 如果点击了按钮，不执行武器攻击
                }
            }
            
            mouse.leftClick = true;
        } else if (e.button === 2) { // 右键
            mouse.rightClick = true;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) { // 左键s
            mouse.leftClick = false;
        } else if (e.button === 2) { // 右键
            mouse.rightClick = false;
        }
    });
    
    // 禁用右键菜单
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        const rect = game.canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    document.addEventListener('wheel', (e) => {
        if (gameState.showLevelSelection) {
            e.preventDefault();
            gameState.levelScrollOffset += e.deltaY * 0.6;
            const levels = Object.values(BOSS_LEVELS);
            const contentHeight = 200 + levels.length * 140;
            const maxScroll = Math.max(0, contentHeight - GAME_CONFIG.HEIGHT + 60);
            gameState.levelScrollOffset = Math.max(0, Math.min(gameState.levelScrollOffset, maxScroll));
        }
        if (gameState.showGuide && (gameState.guideCategory || gameState.guideSubItem !== null)) {
            e.preventDefault();
            gameState.guideScrollOffset += e.deltaY * 0.5;
            gameState.guideScrollOffset = Math.max(0, gameState.guideScrollOffset);
        }
    }, { passive: false });
}); 