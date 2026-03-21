// 噬星者 Boss + FloatingDrone
// 浮游炮类 - 可锁定的独立单位
class FloatingDrone extends Enemy {
    constructor(x, y, parentBoss, originalBall) {
        super(x, y); // 调用Enemy构造函数
        
        // 覆盖Enemy的默认属性
        this.width = 16;
        this.height = 16;
        this.color = '#000000'; // 16x16像素的黑色浮游炮
        this.health = 70; // 浮游炮血量
        this.maxHealth = 70;
        this.speed = originalBall.moveSpeed;
        
        this.parentBoss = parentBoss; // 父级Boss引用
        this.originalBall = originalBall; // 原始球体数据的引用
        
        // 攻击属性
        this.laserCooldown = originalBall.laserCooldown;
        this.lastLaser = originalBall.lastLaser;
        this.attackRange = originalBall.attackRange;
        this.stillDuration = originalBall.stillDuration;
        
        // 状态管理
        this.preFireStillTime = 0;
        this.postFireStillTime = 0;
        this.formationAngle = originalBall.originalAngle; // 保持原始阵型角度
        
        // 视觉效果
        this.laserEffect = null;
    }
    
    update() {
        const now = Date.now();
        const fgTC = getBossTargetCenter(this.x, this.y);
        if (!fgTC) return;
        const playerCenterX = fgTC.x;
        const playerCenterY = fgTC.y;
        
        // 计算理想攻击位置
        const idealX = playerCenterX + Math.cos(this.formationAngle) * this.attackRange;
        const idealY = playerCenterY + Math.sin(this.formationAngle) * this.attackRange;
        
        // 检查是否在静止状态
        const inPreFireStill = this.preFireStillTime > 0 && (now - this.preFireStillTime) < this.stillDuration;
        const inPostFireStill = this.postFireStillTime > 0 && (now - this.postFireStillTime) < this.stillDuration;
        const inStillState = inPreFireStill || inPostFireStill;
        
        // 移动到理想位置（如果不在静止状态）
        if (!inStillState) {
            const distanceToIdeal = Math.sqrt(
                Math.pow(idealX - this.x, 2) + 
                Math.pow(idealY - this.y, 2)
            );
            
            if (distanceToIdeal > 15) {
                const dx = idealX - this.x;
                const dy = idealY - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    this.x += (dx / distance) * this.speed;
                    this.y += (dy / distance) * this.speed;
                }
            }
        }
        
        // 攻击逻辑
        const distanceToPlayer = Math.sqrt(
            Math.pow(playerCenterX - this.x, 2) + 
            Math.pow(playerCenterY - this.y, 2)
        );
        
        if (distanceToPlayer <= this.attackRange + 20) {
            if (now - this.lastLaser >= this.laserCooldown) {
                if (!inPreFireStill && this.preFireStillTime === 0) {
                    this.preFireStillTime = now;
                } else if (this.preFireStillTime > 0 && (now - this.preFireStillTime) >= this.stillDuration) {
                    this.fireLaser();
                    this.lastLaser = now;
                    this.preFireStillTime = 0;
                    this.postFireStillTime = now;
                }
            }
        }
        
        // 重置射击后静止状态
        if (this.postFireStillTime > 0 && (now - this.postFireStillTime) >= this.stillDuration) {
            this.postFireStillTime = 0;
        }
    }
    
    fireLaser() {
        if (!game.player) return;
        
        // 使用父Boss的延迟瞄准系统
        const targetPosition = this.parentBoss.getPlayerPositionDelay(70);
        
        const dx = targetPosition.x - this.x;
        const dy = targetPosition.y - this.y;
        const angle = Math.atan2(dy, dx);
        
        this.checkLaserHit(angle);
    }
    
    checkLaserHit(angle) {
        if (!game.player) return;
        
        const laserRange = 500;
        const laserWidth = 4;
        const laserDx = Math.cos(angle);
        const laserDy = Math.sin(angle);
        
        if (!game.player.isUntargetable) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const playerDx = playerCenterX - this.x;
            const playerDy = playerCenterY - this.y;
            const projection = playerDx * laserDx + playerDy * laserDy;
            
            if (projection > 0 && projection <= laserRange) {
                const projX = this.x + laserDx * projection;
                const projY = this.y + laserDy * projection;
                const distanceToLaser = Math.sqrt(
                    Math.pow(playerCenterX - projX, 2) + 
                    Math.pow(playerCenterY - projY, 2)
                );
                if (distanceToLaser <= laserWidth + 10) {
                    game.player.takeDamage(15);
                    game.player.setStunned(700);
                    updateUI();
                }
            }
        }
        
        if (game.decoys) {
            for (const decoy of game.decoys) {
                const dcx = decoy.x + decoy.width / 2;
                const dcy = decoy.y + decoy.height / 2;
                const ddx = dcx - this.x;
                const ddy = dcy - this.y;
                const proj = ddx * laserDx + ddy * laserDy;
                if (proj > 0 && proj <= laserRange) {
                    const px = this.x + laserDx * proj;
                    const py = this.y + laserDy * proj;
                    const dist = Math.sqrt((dcx - px) * (dcx - px) + (dcy - py) * (dcy - py));
                    if (dist <= laserWidth + 10) {
                        decoy.takeDamage(15);
                    }
                }
            }
        }
        
        this.laserEffect = {
            endX: this.x + Math.cos(angle) * laserRange,
            endY: this.y + Math.sin(angle) * laserRange,
            angle: angle,
            startTime: Date.now(),
            duration: 300
        };
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.shouldDestroy = true; // 设置销毁标志
            return true; // 死亡
        }
        return false;
    }
    
    draw(ctx) {
        // 绘制浮游炮主体（圆形）
        ctx.save();
        
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, 2 * Math.PI);
        ctx.fill();
        
        // 绘制镭射效果
        if (this.laserEffect) {
            const now = Date.now();
            const elapsed = now - this.laserEffect.startTime;
            
            if (elapsed < this.laserEffect.duration) {
                const alpha = 1 - (elapsed / this.laserEffect.duration);
                
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                
                ctx.beginPath();
                ctx.moveTo(this.x + this.width/2, this.y + this.height/2);
                ctx.lineTo(this.laserEffect.endX, this.laserEffect.endY);
                ctx.stroke();
                
                ctx.strokeStyle = '#FFFF00';
                ctx.lineWidth = 1;
                
                ctx.beginPath();
                ctx.moveTo(this.x + this.width/2, this.y + this.height/2);
                ctx.lineTo(this.laserEffect.endX, this.laserEffect.endY);
                ctx.stroke();
            } else {
                this.laserEffect = null;
            }
        }
        
        // 绘制血条
        const barWidth = this.width;
        const barHeight = 3;
        const barY = this.y - 8;
        
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        const healthRatio = this.health / this.maxHealth;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // 被扎穿状态视觉效果（继承自Enemy）
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 绘制青蓝色扎穿光效
            ctx.strokeStyle = '#00CCFF';
            ctx.lineWidth = 4;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 3, this.y - 3, this.width + 6, this.height + 6);
            
            // 绘制扎穿特效
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('扎穿!', this.x + this.width/2, this.y - 15);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 硬直状态视觉效果（继承自Enemy）
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 绘制黄色硬直效果
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 2;
            ctx.setLineDash([1, 1]);
            ctx.strokeRect(this.x - 1, this.y - 1, this.width + 2, this.height + 2);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 锁定指示器
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
        
        ctx.restore();
    }
}

// 噬星者Boss类 - 黑白相间条纹的虚无毁灭者
class StarDevourer extends GameObject {
    constructor(x, y) {
        super(x, y, 40, 40, '#000000'); // 40x40像素，黑色基调
        
        // Boss基本属性
        this.maxHealth = 300; // 基础血量
        this.health = this.maxHealth;
        this.speed = 8; // 噬星者：8单位每秒（中等速度）
        this.setRandomDirection();
        this.lastDirectionChange = 0;
        this.directionChangeInterval = 3000; // 3秒改变一次方向
        
        // Boss闪避系统
        this.dodgeChance = 0.80; // 80%近战闪避概率（提升）
        this.missileDodgeChance = 0.30; // 30%导弹闪避概率
        this.bulletDodgeChance = 0.30; // 30%子弹闪避概率（新增）
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200; // 0.2秒
        this.dodgeSpeed = 20; // 噬星者：20单位/秒回避速度
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0; // 上次闪避时间
        this.dodgeCooldown = 800; // 闪避冷却时间：0.8秒
        
        // 扎穿系统
        this.isImpaled = false; // 是否被长枪扎穿
        this.impaledBy = null; // 扎穿的武器引用
        this.stunned = false; // 是否硬直
        this.stunEndTime = 0; // 硬直结束时间
        
        // 受击提示系统
        this.hitIndicators = [];
        
        // 条纹视觉效果
        this.stripeWidth = 4; // 条纹宽度
        this.stripeOffset = 0; // 条纹偏移（用于动画）
        this.stripeSpeed = 0.5; // 条纹滚动速度
        
        // 光束步枪系统
        this.beamRifle = {
            damage: 25, // 光束伤害
            range: 2000, // 光束射程（全图覆盖）
            width: 8, // 光束宽度
            chargeDuration: 1500, // 蓄力时间1.5秒
            preFirePauseDuration: 50, // 开火前停顿0.05秒
            fireDuration: 500, // 发射持续时间0.5秒
            postFirePauseDuration: 50, // 开火后停顿0.05秒
            cooldown: 2000, // 冷却时间2秒
            lastFire: 0,
            isCharging: false,
            isPreFirePause: false,
            isFiring: false,
            isPostFirePause: false,
            chargeStartTime: 0,
            preFirePauseStartTime: 0,
            fireStartTime: 0,
            postFirePauseStartTime: 0,
            targetAngle: 0 // 瞄准角度
        };
        
        // 环绕浮游炮系统
        this.orbitBalls = [];
        for (let i = 0; i < 3; i++) {
            const angle = (i * 2 * Math.PI) / 3;
            const ballX = x + this.width/2 + Math.cos(angle) * 80;
            const ballY = y + this.height/2 + Math.sin(angle) * 80;
            
            this.orbitBalls.push({
                angle: angle, // 120度间隔
                originalAngle: angle, // 保存原始角度
                radius: 80, // 围绕半径
                size: 8, // 浮游炮大小
                speed: 0.03, // 旋转速度
                
                // 攻击状态
                state: 'orbiting', // 'orbiting', 'attacking', 'returning'
                x: ballX, // 当前实际位置
                y: ballY,
                targetX: 0, // 返回时的目标位置
                targetY: 0,
                moveSpeed: 20, // 移动速度（提升到20单位每秒）
                laserCooldown: 1000, // 镭射冷却时间（1秒间隔）
                lastLaser: 0,
                laserCount: 0, // 已发射镭射次数
                maxLasers: 4, // 最大镭射次数
                attackFinishTime: 0, // 攻击完成时间（用于延迟返回）
                attackRange: 120, // 理想攻击距离（增加锁定距离）
                preFireStillTime: 0, // 射击前静止时间
                postFireStillTime: 0, // 射击后静止时间
                stillDuration: 70 // 静止持续时间（0.07秒）
            });
        }
        
        // 浮游炮攻击系统
        this.ballAttackCooldown = 10000; // 10秒攻击间隔
        this.lastBallAttack = 0;
        this.ballsInAttack = false;
        
        // 玩家位置历史记录系统（用于延迟瞄准）
        this.playerPositionHistory = [];
        this.maxHistoryDuration = 300; // 保存300毫秒的历史记录
        
        // 失明技能系统
        this.blindnessSkill = {
            unlocked: false, // 是否解锁失明技能（血量减少50点后）
            isActive: false, // 失明是否激活
            // 一阶段参数
            phaseOneDuration: 5000, // 一阶段持续时间5秒
            phaseOneCooldown: 5000, // 一阶段冷却时间5秒
            // 二阶段参数
            phaseTwoDuration: 2000, // 二阶段持续时间2秒
            phaseTwoCooldown: 20000, // 二阶段冷却时间20秒
            lastUse: 0, // 上次使用时间
            startTime: 0, // 开始时间
            originalLockMode: null // 保存原始锁定模式
        };
        
        // 二阶段系统
        this.phaseTwo = {
            activated: false, // 是否已激活二阶段
            triggerHealth: 80, // 触发血量（五分之二）
            isInvisible: true, // 二阶段时隐身
            permanentDrones: false, // 浮游炮永久化
            detectionRange: 200 // 二阶段隐身时的检测距离
        };
        
        // 导弹反转系统
        this.missileReversal = {
            enabled: false, // 是否启用导弹反转
            reversalDelay: 1000, // 导弹发射后1秒开始反转
            reversalRatio: 0.75, // 75%的导弹被反转
            reversedMissiles: [], // 已反转的导弹列表
            lastMissileLaunchTime: 0, // 上次导弹发射时间
            lastMissileCount: 0 // 上次导弹数量
        };
        
        // 回血系统
        this.healSystem = {
            interval: 3000,
            chance: 0.45,
            minHeal: 6,
            maxHeal: 20,
            lastAttempt: Date.now()
        };
        
        // 自动步枪系统（近距离武器）
        this.autoRifle = {
            damage: 6,
            bulletSpeed: 50, // 玩家步枪弹速(25)的两倍
            fireRate: 30, // 每秒30发
            lastFire: 0,
            range: 800 // 子弹最大射程
        };
        this.weaponDistanceThreshold = 250; // 距离阈值：低于此值用步枪，高于用光束
        
        this.spawnTime = Date.now();
    }

    // 强制重置浮游炮到标准等边三角形阵型
    resetBallsToStandardFormation() {
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        this.orbitBalls.forEach((ball, index) => {
            // 计算精确的120度间隔角度：0度、120度、240度
            const standardAngle = (index * 2 * Math.PI) / 3;
            
            // 强制设置角度和位置
            ball.angle = standardAngle;
            ball.originalAngle = standardAngle;
            ball.x = bossCenterX + Math.cos(standardAngle) * ball.radius;
            ball.y = bossCenterY + Math.sin(standardAngle) * ball.radius;
            
            // 确保状态为环绕
            ball.state = 'orbiting';
        });
    }

    setRandomDirection() {
        // 智能移动系统：让Boss在屏幕中央区域也有更多活动
        const screenCenterX = GAME_CONFIG.WIDTH / 2;
        const screenCenterY = GAME_CONFIG.HEIGHT / 2;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 计算Boss到屏幕中心的距离
        const distanceToCenter = Math.sqrt(
            Math.pow(bossCenterX - screenCenterX, 2) + 
            Math.pow(bossCenterY - screenCenterY, 2)
        );
        
        let targetX, targetY;
        const randomMovementSpeed = 10; // 10单位每秒的随机平移速度
        
        // 如果Boss距离屏幕边缘太近，让它向中央移动
        const edgeThreshold = 150; // 距离边缘150像素时开始向中央移动
        const isNearEdge = this.x < edgeThreshold || this.x > GAME_CONFIG.WIDTH - edgeThreshold ||
                          this.y < edgeThreshold || this.y > GAME_CONFIG.HEIGHT - edgeThreshold;
        
        if (isNearEdge) {
            // 向屏幕中央移动
            targetX = screenCenterX + (Math.random() - 0.5) * 200; // 中央区域±100像素
            targetY = screenCenterY + (Math.random() - 0.5) * 200;
        } else {
            // 在屏幕中央区域随机移动
            const centerArea = 300; // 中央区域范围
            targetX = screenCenterX + (Math.random() - 0.5) * centerArea;
            targetY = screenCenterY + (Math.random() - 0.5) * centerArea;
        }
        
        // 计算移动方向
        const dx = targetX - bossCenterX;
        const dy = targetY - bossCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.vx = (dx / distance) * randomMovementSpeed;
            this.vy = (dy / distance) * randomMovementSpeed;
        } else {
            // 如果目标就在当前位置，随机选择一个方向
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * randomMovementSpeed;
            this.vy = Math.sin(angle) * randomMovementSpeed;
        }
        
        // 重新设置下次改变方向的时间间隔
        this.directionChangeInterval = 2000 + Math.random() * 2000; // 2-4秒之间
    }
    
    update() {
        const now = Date.now();
        
        // 记录玩家位置历史
        this.recordPlayerPosition();
        
        // 更新条纹动画
        this.stripeOffset += this.stripeSpeed;
        if (this.stripeOffset >= this.stripeWidth * 2) {
            this.stripeOffset = 0;
        }
        
        // 更新浮游炮攻击系统
        this.updateBallAttack();
        
        // 更新环绕浮游炮
        this.updateOrbitBalls();
        
        // 扎穿状态处理
        if (this.isImpaled) {
            // 被扎穿时不能自主移动，跟随长枪移动
            // 速度会由长枪武器控制
            super.update();
            this.checkBounds();
            return;
        }
        
        // 硬直状态处理
        if (this.stunned) {
            if (now >= this.stunEndTime) {
                this.stunned = false;
            } else {
                // 硬直期间不能移动
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        // 噬星者随机平移 (10单位每秒)
        // 检查是否在光束步枪停顿状态
        const isBeamPausing = this.beamRifle.isPreFirePause || this.beamRifle.isPostFirePause;
        
        if (!this.isDodging && !isBeamPausing) {
            // 二阶段：距离玩家过近时远离玩家
            if (this.phaseTwo.activated && game.player) {
                const bossCenterX = this.x + this.width / 2;
                const bossCenterY = this.y + this.height / 2;
                const p2TC = getBossTargetCenter(bossCenterX, bossCenterY);
                const playerCenterX = p2TC ? p2TC.x : this.x + this.width / 2;
                const playerCenterY = p2TC ? p2TC.y : this.y + this.height / 2;
                const dx = playerCenterX - bossCenterX;
                const dy = playerCenterY - bossCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 300) {
                    // 有30%概率远离玩家到500像素距离
                    if (Math.random() < 0.3) {
                        // 计算远离玩家的方向
                        const awayAngle = Math.atan2(-dy, -dx);
                        // 计算目标位置（距离玩家500像素）
                        const targetDistance = 500;
                        const targetX = playerCenterX + Math.cos(awayAngle) * targetDistance;
                        const targetY = playerCenterY + Math.sin(awayAngle) * targetDistance;
                        
                        // 朝目标位置移动
                        const targetDx = targetX - bossCenterX;
                        const targetDy = targetY - bossCenterY;
                        const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);
                        
                        if (targetDist > 0) {
                            this.vx = (targetDx / targetDist) * this.speed;
                            this.vy = (targetDy / targetDist) * this.speed;
                            // 立即更新时间，防止下一帧又切换方向
                            this.lastDirectionChange = now;
                        }
                    } else {
                        // 不远离时，继续正常随机移动
                        if (now - this.lastDirectionChange > this.directionChangeInterval) {
                            this.setRandomDirection();
                            this.lastDirectionChange = now;
                        }
                    }
                } else {
                    // 距离正常时，继续正常随机移动
                    if (now - this.lastDirectionChange > this.directionChangeInterval) {
                        this.setRandomDirection();
                        this.lastDirectionChange = now;
                    }
                }
            } else {
                // 一阶段或没有玩家时，继续正常随机移动
                if (now - this.lastDirectionChange > this.directionChangeInterval) {
                    this.setRandomDirection();
                    this.lastDirectionChange = now;
                }
            }
        } else if (isBeamPausing) {
            // 开火前后停顿期间完全停止移动
            this.vx = 0;
            this.vy = 0;
        } else {
            // 闪避中保持闪避速度，不改变方向
        }
        
        // 更新二阶段系统
        this.updatePhaseTwo();
        
        // 更新失明技能
        this.updateBlindnessSkill();
        
        // 根据距离切换武器：远距离用光束狙击，近距离用自动步枪
        // 光束正在蓄力/发射中时必须完成当前动作
        const beamBusy = this.beamRifle.isCharging || this.beamRifle.isPreFirePause ||
                         this.beamRifle.isFiring || this.beamRifle.isPostFirePause;
        const distToPlayer = this.getDistanceToPlayer();
        if (beamBusy) {
            this.updateBeamRifle();
        } else if (distToPlayer <= this.weaponDistanceThreshold) {
            this.updateAutoRifle();
        } else {
            this.updateBeamRifle();
        }
        
        // 更新导弹反转系统（二阶段）
        this.updateMissileReversal();
        
        // 闪避系统检测
        this.checkDodge(); // 近战闪避
        this.checkMissileDodge(); // 导弹闪避
        this.checkBulletDodge(); // 子弹闪避（新增）
        this.updateDodge(); // 更新闪避状态（新增）
        
        this.tryHeal();
        
        // 更新受击提示
        this.updateHitIndicators();
        
        super.update();
        this.checkBounds();
        
        // 智能边界处理：如果Boss太靠近边缘，让它向中央移动
        this.handleSmartBoundary();
    }
    
    tryHeal() {
        const now = Date.now();
        const hs = this.healSystem;
        if (now - hs.lastAttempt < hs.interval) return;
        hs.lastAttempt = now;
        if (this.health >= this.maxHealth) return;
        if (Math.random() > hs.chance) return;
        const amount = Math.floor(Math.random() * (hs.maxHeal - hs.minHeal + 1)) + hs.minHeal;
        this.health = Math.min(this.maxHealth, this.health + amount);
    }
    
    // 自动步枪系统（近距离）
    updateAutoRifle() {
        if (!game.player) return;
        const now = Date.now();
        const fireInterval = 1000 / this.autoRifle.fireRate;
        if (now - this.autoRifle.lastFire < fireInterval) return;
        this.autoRifle.lastFire = now;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const rifleTC = getBossTargetCenter(bossCenterX, bossCenterY);
        if (!rifleTC) return;
        const playerCenterX = rifleTC.x;
        const playerCenterY = rifleTC.y;
        const dx = playerCenterX - bossCenterX;
        const dy = playerCenterY - bossCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const flightTime = dist / this.autoRifle.bulletSpeed;
        const predictedX = playerCenterX + (rifleTC.entity.vx || 0) * flightTime;
        const predictedY = playerCenterY + (rifleTC.entity.vy || 0) * flightTime;
        
        const pdx = predictedX - bossCenterX;
        const pdy = predictedY - bossCenterY;
        const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
        
        const direction = pDist > 0 ? Math.atan2(pdy, pdx) * 180 / Math.PI : 0;
        
        const bullet = new StarDevourerBullet(
            bossCenterX, bossCenterY,
            direction,
            this.autoRifle.bulletSpeed,
            this.autoRifle.damage,
            this.autoRifle.range
        );
        
        if (!game.starDevourerBullets) game.starDevourerBullets = [];
        game.starDevourerBullets.push(bullet);
    }
    
    // 光束步枪系统
    updateBeamRifle() {
        const now = Date.now();
        
        // 检查是否正在蓄力
        if (this.beamRifle.isCharging) {
            // 蓄力期间持续追踪玩家
            this.updateBeamTargeting();
            
            // 蓄力时间到了，开始开火前停顿
            if (now - this.beamRifle.chargeStartTime >= this.beamRifle.chargeDuration) {
                this.startPreFirePause();
            }
        }
        // 检查开火前停顿
        else if (this.beamRifle.isPreFirePause) {
            // 开火前停顿期间停止移动但继续瞄准
            this.updateBeamTargeting();
            
            // 开火前停顿时间到了，开始发射
            if (now - this.beamRifle.preFirePauseStartTime >= this.beamRifle.preFirePauseDuration) {
                this.fireBeam();
            }
        }
        // 检查是否正在发射
        else if (this.beamRifle.isFiring) {
            // 发射时间结束，开始开火后停顿
            if (now - this.beamRifle.fireStartTime >= this.beamRifle.fireDuration) {
                this.startPostFirePause();
            } else {
                // 发射期间检查碰撞
                this.checkBeamCollision();
            }
        }
        // 检查开火后停顿
        else if (this.beamRifle.isPostFirePause) {
            // 开火后停顿期间停止移动
            // 开火后停顿时间到了，结束攻击
            if (now - this.beamRifle.postFirePauseStartTime >= this.beamRifle.postFirePauseDuration) {
                this.endBeamAttack();
            }
        }
        // 检查是否可以开始新的攻击
        else if (now - this.beamRifle.lastFire >= this.beamRifle.cooldown) {
            this.checkBeamAttack();
        }
    }
    
    checkBeamAttack() {
        if (!game.player) return;
        
        // 全图攻击，直接开始蓄力
        this.startBeamCharge();
    }
    
    startBeamCharge() {
        if (!game.player) return;
        
        // 开始蓄力，瞄准角度将持续更新
        this.beamRifle.isCharging = true;
        this.beamRifle.chargeStartTime = Date.now();
        
        // 初始瞄准
        this.updateBeamTargeting();
    }
    
    // 二阶段系统
    updatePhaseTwo() {
        // 检查是否应该触发二阶段
        if (!this.phaseTwo.activated && this.health <= this.phaseTwo.triggerHealth) {
            this.activatePhaseTwo();
        }
    }
    
    activatePhaseTwo() {
        this.phaseTwo.activated = true;
        this.phaseTwo.permanentDrones = true;
        
        // 启用导弹反转系统
        this.missileReversal.enabled = true;
        
        // 将所有浮游炮转换为独立的FloatingDrone对象
        this.orbitBalls.forEach(ball => {
            // 转换所有状态的浮游炮（orbiting、attacking、returning）
            // 创建FloatingDrone对象
            const drone = new FloatingDrone(ball.x, ball.y, this, ball);
            
            // 添加到游戏的敌人数组中，使其可以被锁定
            game.enemies.push(drone);
            
            // 隐藏原始球体（不再绘制和更新）
            ball.permanent = true;
            ball.hidden = true;
        });
        
        // 停止浮游炮攻击的循环系统
        this.ballsInAttack = true; // 永久保持攻击状态，阻止新的攻击循环
    }
    
    // 导弹反转系统
    updateMissileReversal() {
        if (!this.missileReversal.enabled) return;
        
        const now = Date.now();
        
        // 检测所有未反转的玩家导弹（包括普通导弹和分裂飞弹母弹）
        const allPlayerMissiles = [];
        if (game.missiles) {
            allPlayerMissiles.push(...game.missiles.filter(m => !m.isBossMissile && !m.isReversed));
        }
        if (game.clusterMissiles) {
            allPlayerMissiles.push(...game.clusterMissiles.filter(m => !m.isReversed));
        }
        
        if (allPlayerMissiles.length > 0) {
            if (this.missileReversal.lastMissileLaunchTime === 0) {
                this.missileReversal.lastMissileLaunchTime = now;
            }
            
            if (now - this.missileReversal.lastMissileLaunchTime >= this.missileReversal.reversalDelay) {
                this.reverseMissiles();
                this.missileReversal.lastMissileLaunchTime = 0;
            }
        } else {
            this.missileReversal.lastMissileLaunchTime = 0;
        }
        
        // 清理已销毁的导弹引用
        this.missileReversal.reversedMissiles = this.missileReversal.reversedMissiles.filter(m => {
            if (m.shouldDestroy) return false;
            if (game.missiles && game.missiles.includes(m)) return true;
            if (game.clusterMissiles && game.clusterMissiles.includes(m)) return true;
            return false;
        });
    }
    
    // 反转导弹
    reverseMissiles() {
        // 收集所有可反转的玩家导弹
        const playerMissiles = [];
        if (game.missiles) {
            playerMissiles.push(...game.missiles.filter(m => !m.isBossMissile && !m.isReversed));
        }
        if (game.clusterMissiles) {
            playerMissiles.push(...game.clusterMissiles.filter(m => !m.isReversed));
        }
        
        if (playerMissiles.length === 0) return;
        
        // 计算需要反转的导弹数量（75%）
        const totalMissiles = playerMissiles.length;
        const missilesToReverse = Math.floor(totalMissiles * this.missileReversal.reversalRatio);
        
        // 随机选择导弹进行反转
        const missilesToProcess = [...playerMissiles];
        
        for (let i = 0; i < missilesToReverse && missilesToProcess.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * missilesToProcess.length);
            const missile = missilesToProcess.splice(randomIndex, 1)[0];
            
            if (missile && !this.missileReversal.reversedMissiles.includes(missile)) {
                // 反转导弹
                this.reverseMissile(missile);
                this.missileReversal.reversedMissiles.push(missile);
            }
        }
    }
    
    // 反转单个导弹
    reverseMissile(missile) {
        if (!missile || !game.player) return;
        
        missile.isReversed = true;
        missile.color = '#800080';
        
        const reverseTarget = getBossTarget(missile.x, missile.y);
        const targetCX = reverseTarget.x + reverseTarget.width / 2;
        const targetCY = reverseTarget.y + reverseTarget.height / 2;
        
        const dx = targetCX - missile.x;
        const dy = targetCY - missile.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            missile.vx = (dx / distance) * missile.maxSpeed;
            missile.vy = (dy / distance) * missile.maxSpeed;
            
            missile.targetX = targetCX;
            missile.targetY = targetCY;
            missile.currentTarget = reverseTarget;
            
            missile.startTime = Date.now();
        }
    }

    // 获取当前阶段的失明技能参数
    getBlindnessParams() {
        if (this.phaseTwo.activated) {
            return {
                duration: this.blindnessSkill.phaseTwoDuration,
                cooldown: this.blindnessSkill.phaseTwoCooldown
            };
        } else {
            return {
                duration: this.blindnessSkill.phaseOneDuration,
                cooldown: this.blindnessSkill.phaseOneCooldown
            };
        }
    }

    // 失明技能系统
    updateBlindnessSkill() {
        const now = Date.now();
        const params = this.getBlindnessParams();
        
        // 检查是否应该解锁失明技能（血量减少50点）
        if (!this.blindnessSkill.unlocked && (this.maxHealth - this.health) >= 50) {
            this.blindnessSkill.unlocked = true;
        }
        
        // 如果失明技能已激活，检查是否应该结束
        if (this.blindnessSkill.isActive) {
            if (now - this.blindnessSkill.startTime >= params.duration) {
                this.endBlindness();
            }
            return; // 失明期间不触发新的失明
        }
        
        // 检查是否可以使用失明技能
        if (this.blindnessSkill.unlocked && 
            now - this.blindnessSkill.lastUse >= params.cooldown) {
            this.activateBlindness();
        }
    }
    
    activateBlindness() {
        if (!game.player) return;
        
        const now = Date.now();
        this.blindnessSkill.isActive = true;
        this.blindnessSkill.startTime = now;
        this.blindnessSkill.lastUse = now;
        
        // 保存并强制设置锁定模式为手动
        this.blindnessSkill.originalLockMode = gameState.lockMode;
        gameState.lockMode = 'manual';
        
        // 设置全局失明状态
        gameState.playerBlinded = true;
    }
    
    endBlindness() {
        this.blindnessSkill.isActive = false;
        
        // 更新lastUse为当前时间，确保冷却期正确计算
        this.blindnessSkill.lastUse = Date.now();
        
        // 恢复原始锁定模式
        if (this.blindnessSkill.originalLockMode) {
            gameState.lockMode = this.blindnessSkill.originalLockMode;
            this.blindnessSkill.originalLockMode = null;
        }
        
        // 解除全局失明状态
        gameState.playerBlinded = false;
    }

    // 记录玩家位置历史
    recordPlayerPosition() {
        if (!game.player) return;
        
        const now = Date.now();
        const recordTC = getBossTargetCenter(this.x + this.width / 2, this.y + this.height / 2);
        if (!recordTC) return;
        const playerCenterX = recordTC.x;
        const playerCenterY = recordTC.y;
        
        // 添加当前位置到历史记录
        this.playerPositionHistory.push({
            x: playerCenterX,
            y: playerCenterY,
            timestamp: now
        });
        
        // 清理过期的历史记录
        this.playerPositionHistory = this.playerPositionHistory.filter(
            pos => now - pos.timestamp <= this.maxHistoryDuration
        );
    }
    
    // 获取0.2秒前的玩家位置
    getPlayerPositionDelay(delayMs = 200) {
        if (!game.player || this.playerPositionHistory.length === 0) {
            const tc = getBossTargetCenter(this.x + this.width / 2, this.y + this.height / 2);
            if (tc) return { x: tc.x, y: tc.y };
            if (!game.player) return { x: this.x, y: this.y };
            return {
                x: game.player.x + game.player.width / 2,
                y: game.player.y + game.player.height / 2
            };
        }
        
        const now = Date.now();
        const targetTime = now - delayMs;
        
        // 寻找最接近目标时间的位置
        let closestPosition = this.playerPositionHistory[0];
        for (const pos of this.playerPositionHistory) {
            if (Math.abs(pos.timestamp - targetTime) < Math.abs(closestPosition.timestamp - targetTime)) {
                closestPosition = pos;
            }
        }
        
        return {
            x: closestPosition.x,
            y: closestPosition.y
        };
    }

    updateBeamTargeting() {
        if (!game.player) return;
        
        // 瞄准0.07秒前的玩家位置
        const targetPosition = this.getPlayerPositionDelay(70);
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        this.beamRifle.targetAngle = Math.atan2(
            targetPosition.y - bossCenterY,
            targetPosition.x - bossCenterX
        );
    }
    
    // 开始开火前停顿（新增）
    startPreFirePause() {
        this.beamRifle.isCharging = false;
        this.beamRifle.isPreFirePause = true;
        this.beamRifle.preFirePauseStartTime = Date.now();
    }
    
    fireBeam() {
        this.beamRifle.isPreFirePause = false;
        this.beamRifle.isFiring = true;
        this.beamRifle.fireStartTime = Date.now();
    }
    
    // 开始开火后停顿（新增）
    startPostFirePause() {
        this.beamRifle.isFiring = false;
        this.beamRifle.isPostFirePause = true;
        this.beamRifle.postFirePauseStartTime = Date.now();
    }
    
    // 结束光束攻击（新增）
    endBeamAttack() {
        this.beamRifle.isPostFirePause = false;
        this.beamRifle.lastFire = Date.now();
    }
    
    checkBeamCollision() {
        if (!game.player) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const beamDx = Math.cos(this.beamRifle.targetAngle);
        const beamDy = Math.sin(this.beamRifle.targetAngle);
        const range = this.beamRifle.range;
        const halfWidth = this.beamRifle.width / 2 + 10;
        
        if (!game.player.isUntargetable) {
            const pcx = game.player.x + game.player.width / 2;
            const pcy = game.player.y + game.player.height / 2;
            const pdx = pcx - bossCenterX;
            const pdy = pcy - bossCenterY;
            const proj = pdx * beamDx + pdy * beamDy;
            if (proj > 0 && proj <= range) {
                const px = bossCenterX + beamDx * proj;
                const py = bossCenterY + beamDy * proj;
                const dist = Math.sqrt((pcx - px) * (pcx - px) + (pcy - py) * (pcy - py));
                if (dist <= halfWidth) {
                    game.player.takeDamage(this.beamRifle.damage);
                    game.player.setStunned(700);
                    updateUI();
                    this.beamRifle.isFiring = false;
                    this.beamRifle.lastFire = Date.now();
                    return;
                }
            }
        }
        
        if (game.decoys) {
            for (const decoy of game.decoys) {
                const dcx = decoy.x + decoy.width / 2;
                const dcy = decoy.y + decoy.height / 2;
                const ddx = dcx - bossCenterX;
                const ddy = dcy - bossCenterY;
                const proj = ddx * beamDx + ddy * beamDy;
                if (proj > 0 && proj <= range) {
                    const px = bossCenterX + beamDx * proj;
                    const py = bossCenterY + beamDy * proj;
                    const dist = Math.sqrt((dcx - px) * (dcx - px) + (dcy - py) * (dcy - py));
                    if (dist <= halfWidth) {
                        decoy.takeDamage(this.beamRifle.damage);
                        this.beamRifle.isFiring = false;
                        this.beamRifle.lastFire = Date.now();
                        return;
                    }
                }
            }
        }
    }
    
    // 浮游炮攻击系统
    updateBallAttack() {
        const now = Date.now();
        
        // 二阶段时不启动新的攻击循环，浮游炮已经永久化
        if (this.phaseTwo.activated && this.phaseTwo.permanentDrones) {
            return;
        }
        
        // 检查是否该开始新的攻击
        if (!this.ballsInAttack && now - this.lastBallAttack >= this.ballAttackCooldown) {
            this.startBallAttack();
        }
    }
    
    startBallAttack() {
        if (!game.player) return;
        
        this.ballsInAttack = true;
        this.lastBallAttack = Date.now();
        
        // 让所有浮游炮开始追踪攻击
        this.orbitBalls.forEach((ball, index) => {
            ball.state = 'attacking'; // 直接进入攻击状态，自动追踪玩家
            ball.laserCount = 0;
            ball.attackFinishTime = 0; // 重置攻击完成时间
            ball.preFireStillTime = 0; // 重置射击前静止时间
            ball.postFireStillTime = 0; // 重置射击后静止时间
            
            // 如果在二阶段，立即转换为FloatingDrone
            if (this.phaseTwo.activated && this.phaseTwo.permanentDrones) {
                // 创建FloatingDrone对象
                const drone = new FloatingDrone(ball.x, ball.y, this, ball);
                
                // 添加到游戏的敌人数组中，使其可以被锁定
                game.enemies.push(drone);
                
                // 隐藏原始球体
                ball.permanent = true;
                ball.hidden = true;
            }
            
            // 确保当前位置已经设置（从精确的轨道位置开始移动）
            if (ball.x === 0 && ball.y === 0) {
                const bossCenterX = this.x + this.width / 2;
                const bossCenterY = this.y + this.height / 2;
                const ballIndex = this.orbitBalls.indexOf(ball);
                const standardAngle = (ballIndex * 2 * Math.PI) / 3;
                ball.x = bossCenterX + Math.cos(standardAngle) * ball.radius;
                ball.y = bossCenterY + Math.sin(standardAngle) * ball.radius;
            }
        });
    }
    
    updateOrbitBalls() {
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        this.orbitBalls.forEach(ball => {
            // 跳过隐藏的球体（已转换为FloatingDrone）
            if (ball.hidden) return;
            
            switch (ball.state) {
                case 'orbiting':
                    // 正常围绕旋转
                    ball.angle += ball.speed;
                    if (ball.angle >= 2 * Math.PI) {
                        ball.angle -= 2 * Math.PI;
                    }
                    ball.x = bossCenterX + Math.cos(ball.angle) * ball.radius;
                    ball.y = bossCenterY + Math.sin(ball.angle) * ball.radius;
                    break;
                

                
                case 'attacking':
                    const now = Date.now();
                    const ballTC = getBossTargetCenter(this.x + this.width / 2, this.y + this.height / 2);
                    if (!ballTC) break;
                    const playerCenterX = ballTC.x;
                    const playerCenterY = ballTC.y;
                    
                    // 计算当前浮游炮在阵型中的理想位置（基于标准120度间隔）
                    const ballIndex = this.orbitBalls.indexOf(ball);
                    const formationAngle = (ballIndex * 2 * Math.PI) / 3; // 精确的120度间隔
                    const idealX = playerCenterX + Math.cos(formationAngle) * ball.attackRange;
                    const idealY = playerCenterY + Math.sin(formationAngle) * ball.attackRange;
                    
                    // 计算到玩家的实际距离
                    const distanceToPlayer = Math.sqrt(
                        Math.pow(playerCenterX - ball.x, 2) + 
                        Math.pow(playerCenterY - ball.y, 2)
                    );
                    
                    // 检查是否在射击前或射击后的静止状态
                    const inPreFireStill = ball.preFireStillTime > 0 && (now - ball.preFireStillTime) < ball.stillDuration;
                    const inPostFireStill = ball.postFireStillTime > 0 && (now - ball.postFireStillTime) < ball.stillDuration;
                    const inStillState = inPreFireStill || inPostFireStill;
                    
                    // 检查是否应该持续追踪（不在静止状态且前三炮后继续移动）
                    const shouldTrack = !inStillState && 
                                       (ball.laserCount < ball.maxLasers || 
                                       (ball.laserCount >= ball.maxLasers && ball.attackFinishTime === 0));
                    
                    if (shouldTrack) {
                        // 计算到理想位置的距离
                        const distanceToIdeal = Math.sqrt(
                            Math.pow(idealX - ball.x, 2) + 
                            Math.pow(idealY - ball.y, 2)
                        );
                        
                        // 如果距离理想位置太远，移动到理想位置
                        if (distanceToIdeal > 15) { // 15像素容差
                            const dx = idealX - ball.x;
                            const dy = idealY - ball.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance > 0) {
                                ball.x += (dx / distance) * ball.moveSpeed;
                                ball.y += (dy / distance) * ball.moveSpeed;
                            }
                        }
                    }
                    
                    // 射击逻辑
                    if (distanceToPlayer <= ball.attackRange + 20 && ball.laserCount < ball.maxLasers) {
                        if (now - ball.lastLaser >= ball.laserCooldown) {
                            // 如果没有在射击前静止，开始射击前静止
                            if (!inPreFireStill && ball.preFireStillTime === 0) {
                                ball.preFireStillTime = now;
                            }
                            // 射击前静止完成，进行射击
                            else if (ball.preFireStillTime > 0 && (now - ball.preFireStillTime) >= ball.stillDuration) {
                                this.fireBallLaser(ball);
                                ball.lastLaser = now;
                                ball.laserCount++;
                                ball.preFireStillTime = 0; // 重置射击前静止时间
                                ball.postFireStillTime = now; // 开始射击后静止
                                
                                // 如果是第四轮射击，记录完成时间
                                if (ball.laserCount >= ball.maxLasers) {
                                    ball.attackFinishTime = now;
                                }
                            }
                        }
                    }
                    
                    // 射击后静止完成，重置状态以便下次射击
                    if (ball.postFireStillTime > 0 && (now - ball.postFireStillTime) >= ball.stillDuration) {
                        ball.postFireStillTime = 0;
                    }
                    
                    // 第四轮射击完成后的处理
                    if (ball.laserCount >= ball.maxLasers && ball.attackFinishTime > 0) {
                        const waitTime = 1000; // 等待1秒
                        if (now - ball.attackFinishTime >= waitTime) {
                            // 检查是否为永久浮游炮（已转换为FloatingDrone的不会到达这里）
                            if (ball.permanent && !ball.hidden) {
                                // 永久浮游炮：重置攻击状态，继续攻击
                                ball.laserCount = 0;
                                ball.attackFinishTime = 0;
                                ball.preFireStillTime = 0;
                                ball.postFireStillTime = 0;
                                ball.lastLaser = now - ball.laserCooldown; // 立即可以攻击
                            } else if (!ball.hidden) {
                                // 普通浮游炮：返回Boss身边
                                ball.state = 'returning';
                                // 强制返回到精确的120度间隔位置
                                const ballIndex = this.orbitBalls.indexOf(ball);
                                const standardAngle = (ballIndex * 2 * Math.PI) / 3;
                                ball.targetX = bossCenterX + Math.cos(standardAngle) * ball.radius;
                                ball.targetY = bossCenterY + Math.sin(standardAngle) * ball.radius;
                            }
                        }
                    }
                    break;
                
                case 'returning':
                    // 返回本体身边，保持等边三角形阵型
                    const returnDx = ball.targetX - ball.x;
                    const returnDy = ball.targetY - ball.y;
                    const returnDistance = Math.sqrt(returnDx * returnDx + returnDy * returnDy);
                    
                    if (returnDistance > ball.moveSpeed) {
                        ball.x += (returnDx / returnDistance) * ball.moveSpeed;
                        ball.y += (returnDy / returnDistance) * ball.moveSpeed;
                    } else {
                        // 强制回到精确的120度间隔位置
                        const ballIndex = this.orbitBalls.indexOf(ball);
                        const standardAngle = (ballIndex * 2 * Math.PI) / 3;
                        ball.angle = standardAngle;
                        ball.originalAngle = standardAngle;
                        ball.x = bossCenterX + Math.cos(standardAngle) * ball.radius;
                        ball.y = bossCenterY + Math.sin(standardAngle) * ball.radius;
                        ball.state = 'orbiting';
                        
                        // 重置所有攻击相关状态
                        ball.laserCount = 0;
                        ball.attackFinishTime = 0;
                        ball.preFireStillTime = 0;
                        ball.postFireStillTime = 0;
                        ball.lastLaser = 0;
                        ball.laserEffect = null;
                        
                        // 检查是否所有球都返回了
                        const allReturned = this.orbitBalls.every(b => b.state === 'orbiting');
                        if (allReturned) {
                            this.ballsInAttack = false;
                            // 强制重置所有浮游炮到精确的120度间隔位置
                            this.resetBallsToStandardFormation();
                        }
                    }
                    break;
            }
        });
    }
    
    fireBallLaser(ball) {
        if (!game.player) return;
        
        // 瞄准0.07秒前的玩家位置
        const targetPosition = this.getPlayerPositionDelay(70);
        
        const dx = targetPosition.x - ball.x;
        const dy = targetPosition.y - ball.y;
        const angle = Math.atan2(dy, dx);
        
        // 创建镭射效果并检查碰撞
        this.checkBallLaserHit(ball, angle);
    }
    
    checkBallLaserHit(ball, angle) {
        if (!game.player) return;
        
        const laserRange = 500;
        const laserWidth = 4;
        const laserDx = Math.cos(angle);
        const laserDy = Math.sin(angle);
        const endX = ball.x + laserDx * laserRange;
        const endY = ball.y + laserDy * laserRange;
        
        if (!game.player.isUntargetable) {
            const pcx = game.player.x + game.player.width / 2;
            const pcy = game.player.y + game.player.height / 2;
            const pdx = pcx - ball.x;
            const pdy = pcy - ball.y;
            const proj = pdx * laserDx + pdy * laserDy;
            if (proj > 0 && proj <= laserRange) {
                const px = ball.x + laserDx * proj;
                const py = ball.y + laserDy * proj;
                const dist = Math.sqrt((pcx - px) * (pcx - px) + (pcy - py) * (pcy - py));
                if (dist <= laserWidth + 10) {
                    game.player.takeDamage(15);
                    game.player.setStunned(700);
                    updateUI();
                }
            }
        }
        
        if (game.decoys) {
            for (const decoy of game.decoys) {
                const dcx = decoy.x + decoy.width / 2;
                const dcy = decoy.y + decoy.height / 2;
                const ddx = dcx - ball.x;
                const ddy = dcy - ball.y;
                const proj = ddx * laserDx + ddy * laserDy;
                if (proj > 0 && proj <= laserRange) {
                    const px = ball.x + laserDx * proj;
                    const py = ball.y + laserDy * proj;
                    const dist = Math.sqrt((dcx - px) * (dcx - px) + (dcy - py) * (dcy - py));
                    if (dist <= laserWidth + 10) {
                        decoy.takeDamage(15);
                    }
                }
            }
        }
        
        ball.laserEffect = {
            endX: endX,
            endY: endY,
            angle: angle,
            startTime: Date.now(),
            duration: 300
        };
    }
    
    checkDodge() {
        checkBossMeleeDodge(this);
    }
    
    startDodge() {
        startBossDodge(this);
    }
    
    // 导弹闪避（基础版本）
    checkMissileDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        const allMissiles = [];
        if (game.missiles) allMissiles.push(...game.missiles);
        if (game.clusterMissiles) allMissiles.push(...game.clusterMissiles);
        if (allMissiles.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const missileDodgeDistance = 120;

        for (const missile of allMissiles) {
            // 计算导弹到Boss的距离
            const distanceToMissile = Math.sqrt(
                Math.pow(missile.x - bossCenterX, 2) + 
                Math.pow(missile.y - bossCenterY, 2)
            );

            // 只有导弹足够接近时才考虑闪避
            if (distanceToMissile > missileDodgeDistance) continue;

            // 检查导弹是否正在追踪这个Boss
            const isTargetingThisBoss = missile.currentTarget === this;
            
            // 调整闪避概率
            let adjustedDodgeChance = this.missileDodgeChance;
            
            if (isTargetingThisBoss) {
                adjustedDodgeChance *= 1.5; // 被追踪时闪避概率提高50%
            }
            
            // 距离越近，闪避概率越高
            const distanceMultiplier = Math.max(0.5, 1 - (distanceToMissile / missileDodgeDistance));
            adjustedDodgeChance *= distanceMultiplier;

            if (Math.random() < adjustedDodgeChance) {
                this.startMissileDodge(missile);
                break;
            }
        }
    }
    
    startMissileDodge(missile) {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 计算从导弹指向Boss的方向
        const awayFromMissileX = bossCenterX - missile.x;
        const awayFromMissileY = bossCenterY - missile.y;
        const awayDistance = Math.sqrt(awayFromMissileX * awayFromMissileX + awayFromMissileY * awayFromMissileY);
        
        if (awayDistance > 0) {
            const baseAngle = Math.atan2(awayFromMissileY, awayFromMissileX);
            
            // 添加一些随机性避免过于机械
            const angleVariation = (Math.random() - 0.5) * Math.PI / 4; // ±45度变化
            const dodgeAngle = baseAngle + angleVariation;
            
            const dodgeSpeed = this.dodgeSpeed * 1.2; // 导弹闪避速度稍快
            this.vx = Math.cos(dodgeAngle) * dodgeSpeed;
            this.vy = Math.sin(dodgeAngle) * dodgeSpeed;
        }
    }
    
    // 子弹闪避检测（新增）
    checkBulletDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.bullets || game.bullets.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const bulletDodgeDistance = 100; // 子弹距离100像素内时触发闪避

        for (const bullet of game.bullets) {
            const bulletCenterX = bullet.x + bullet.width / 2;
            const bulletCenterY = bullet.y + bullet.height / 2;
            
            // 计算子弹到Boss的当前距离
            const currentDistance = Math.sqrt(
                Math.pow(bulletCenterX - bossCenterX, 2) + 
                Math.pow(bulletCenterY - bossCenterY, 2)
            );

            // 只有子弹足够接近时才考虑闪避
            if (currentDistance > bulletDodgeDistance) continue;

            const bulletVx = bullet.vx || 0;
            const bulletVy = bullet.vy || 0;
            
            if (bulletVx === 0 && bulletVy === 0) continue;

            // 检查子弹是否朝着Boss飞行
            const toBossX = bossCenterX - bulletCenterX;
            const toBossY = bossCenterY - bulletCenterY;
            const dotProduct = toBossX * bulletVx + toBossY * bulletVy;
            
            // 如果子弹不是朝着Boss飞行，跳过
            if (dotProduct <= 0) continue;

            // 计算子弹轨迹与Boss的最短距离
            const bulletSpeed = Math.sqrt(bulletVx * bulletVx + bulletVy * bulletVy);
            if (bulletSpeed === 0) continue;

            // 从子弹位置到Boss位置的向量
            const toBossVectorX = bossCenterX - bulletCenterX;
            const toBossVectorY = bossCenterY - bulletCenterY;

            // 子弹方向的单位向量
            const bulletDirX = bulletVx / bulletSpeed;
            const bulletDirY = bulletVy / bulletSpeed;

            // 计算Boss在子弹轨迹上的投影点
            const projectionLength = toBossVectorX * bulletDirX + toBossVectorY * bulletDirY;
            const projectionX = bulletCenterX + projectionLength * bulletDirX;
            const projectionY = bulletCenterY + projectionLength * bulletDirY;

            // 计算Boss到子弹轨迹的垂直距离
            const perpendicularDistance = Math.sqrt(
                Math.pow(bossCenterX - projectionX, 2) + 
                Math.pow(bossCenterY - projectionY, 2)
            );

            // 如果垂直距离小于阈值，且子弹正在靠近，进行闪避
            if (perpendicularDistance < 30 && projectionLength > 0) { // 子弹轨迹会击中Boss
                if (Math.random() < this.bulletDodgeChance) {
                    this.startBulletDodge(bulletVx, bulletVy);
                    break;
                }
            }
        }
    }
    
    // 开始子弹横向闪避（新增）
    startBulletDodge(bulletVx, bulletVy) {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        // 计算子弹方向的单位向量
        const bulletSpeed = Math.sqrt(bulletVx * bulletVx + bulletVy * bulletVy);
        if (bulletSpeed > 0) {
            const bulletDirX = bulletVx / bulletSpeed;
            const bulletDirY = bulletVy / bulletSpeed;
            
            // 计算垂直于子弹方向的横向向量（90度旋转）
            const perpendicularX = -bulletDirY; // 垂直方向
            const perpendicularY = bulletDirX;
            
            // 随机选择左侧或右侧闪避
            const dodgeDirection = Math.random() < 0.5 ? 1 : -1;
            
            // 设置横向闪避速度
            const dodgeSpeed = this.dodgeSpeed * 1.1; // 子弹闪避速度稍快
            this.vx = perpendicularX * dodgeDirection * dodgeSpeed;
            this.vy = perpendicularY * dodgeDirection * dodgeSpeed;
        }
    }
    
    // 更新闪避状态（新增）
    updateDodge() {
        if (!this.isDodging) return;
        
        const elapsed = Date.now() - this.dodgeStartTime;
        if (elapsed >= this.dodgeDuration) {
            // 闪避结束，恢复原始移动状态
            this.isDodging = false;
            this.vx = this.originalVx;
            this.vy = this.originalVy;
        }
    }
    
    getDistanceToPlayer() {
        return getDistanceFromBoss(this);
    }
    
    // 检查是否在二阶段检测范围内（新增）
    isWithinDetectionRange() {
        if (!this.phaseTwo.activated) return true; // 一阶段时总是可见
        
        const distanceToPlayer = this.getDistanceToPlayer();
        return distanceToPlayer <= this.phaseTwo.detectionRange;
    }
    
    // 扎穿相关方法
    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        // 停止当前移动
        this.vx = 0;
        this.vy = 0;
    }
    
    releaseImpale() {
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = true;
        this.stunEndTime = Date.now() + 800; // 硬直0.8秒
    }
    
    // 受击方法
    takeDamage(damage) {
        this.health -= damage;
        
        // 添加受击提示
        this.addHitIndicator(damage);
        
        if (this.health <= 0) {
            this.health = 0;
            // 噬星者死亡时结束失明效果
            if (this.blindnessSkill && this.blindnessSkill.isActive) {
                this.endBlindness();
            }
            // 死亡时清理二阶段效果和FloatingDrone
            if (this.phaseTwo && this.phaseTwo.activated) {
                this.phaseTwo.activated = false;
                this.phaseTwo.permanentDrones = false;
                
                // 清理所有FloatingDrone
                for (let i = game.enemies.length - 1; i >= 0; i--) {
                    if (game.enemies[i] instanceof FloatingDrone && game.enemies[i].parentBoss === this) {
                        game.enemies.splice(i, 1);
                    }
                }
            }
            return true; // 死亡
        }
        return false; // 存活
    }
    
    // 受击提示系统
    addHitIndicator(damage) {
        const indicator = {
            damage: damage,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 20,
            y: this.y,
            startTime: Date.now(),
            duration: 1000 // 1秒显示时间
        };
        this.hitIndicators.push(indicator);
    }
    
    updateHitIndicators() {
        const now = Date.now();
        this.hitIndicators = this.hitIndicators.filter(indicator => {
            return (now - indicator.startTime) < indicator.duration;
        });
    }
    
    drawHitIndicators(ctx) {
        const now = Date.now();
        
        this.hitIndicators.forEach(indicator => {
            const elapsed = now - indicator.startTime;
            const progress = elapsed / indicator.duration;
            
            // 向上移动和渐隐效果
            const offsetY = progress * 40; // 向上移动40像素
            const alpha = 1 - progress; // 逐渐透明
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FFFFFF'; // 白色受击文字
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            
            const displayY = indicator.y - offsetY;
            const text = `HIT ${indicator.damage}`;
            
            // 绘制文字描边（黑色）
            ctx.strokeText(text, indicator.x, displayY);
            // 绘制文字填充（白色）
            ctx.fillText(text, indicator.x, displayY);
            
            ctx.restore();
        });
    }

    draw(ctx) {
        // 检查是否在检测范围内
        const withinDetectionRange = this.isWithinDetectionRange();
        
        // 绘制Boss主体（受隐身效果和距离影响）
        ctx.save();
        
        // 二阶段隐身效果 - 根据距离决定可见性
        if (this.phaseTwo.activated && this.phaseTwo.isInvisible && !withinDetectionRange) {
            ctx.globalAlpha = 0; // Boss主体完全隐身
        }
        
        // 绘制黑白相间的条纹
        this.drawStripedPattern(ctx);
        
        // 绘制边框
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 恢复上下文
        ctx.restore();
        
        // 绘制血量条（只有在检测范围内才显示）
        if (withinDetectionRange) {
            const barWidth = this.width;
            const barHeight = 6;
            const barY = this.y - 12;
            
            // 背景（灰色）
            ctx.fillStyle = 'gray';
            ctx.fillRect(this.x, barY, barWidth, barHeight);
            
            // 血量（黑白渐变）
            const healthRatio = this.health / this.maxHealth;
            const grayValue = Math.floor(255 * healthRatio);
            ctx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
            ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
            
            // Boss标识
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('噬星者', this.x + this.width/2, this.y - 16);
        }
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
        
        // 被扎穿状态视觉效果
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 绘制白色扎穿光效
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 6;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
            
            // 绘制扎穿特效
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('扎穿!', this.x + this.width/2, this.y - 25);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 硬直状态视觉效果
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 绘制灰色硬直效果
            ctx.strokeStyle = '#808080';
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 绘制环绕浮游炮
        this.drawOrbitBalls(ctx);
        
        // 绘制光束步枪效果（隐身时也会显示，创造神秘感）
        this.drawBeamRifle(ctx);
        
        // 锁定标识：白色跳动倒三角（只有在检测范围内才显示）
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard') && withinDetectionRange) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
        
        // 失明技能状态指示器
        if (this.blindnessSkill && this.blindnessSkill.isActive) {
            ctx.save();
            
            // 绘制失明技能激活的视觉效果（紫色光环）
            ctx.strokeStyle = '#8B00FF';
            ctx.lineWidth = 4;
            const pulseSize = 5 + Math.sin(Date.now() * 0.01) * 3;
            
            ctx.beginPath();
            ctx.arc(this.x + this.width/2, this.y + this.height/2, 25 + pulseSize, 0, 2 * Math.PI);
            ctx.stroke();
            
            // 绘制失明技能标识文字
            ctx.fillStyle = '#8B00FF';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('失明', this.x + this.width/2, this.y - 35);
            
            ctx.restore();
        }
    }
    
    // 绘制黑白条纹图案
    drawStripedPattern(ctx) {
        // 保存上下文
        ctx.save();
        
        // 设置裁剪区域为Boss的边界
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.width, this.height);
        ctx.clip();
        
        // 绘制条纹背景
        ctx.fillStyle = '#000000';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制白色条纹
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < this.width; i += this.stripeWidth * 2) {
            const stripePosX = i + this.stripeOffset;
            
            // 绘制垂直条纹
            if (stripePosX >= 0 && stripePosX < this.width) {
                ctx.fillRect(
                    this.x + stripePosX, 
                    this.y, 
                    this.stripeWidth, 
                    this.height
                );
            }
        }
        
        // 恢复上下文
        ctx.restore();
    }
    
    // 绘制环绕浮游炮
    drawOrbitBalls(ctx) {
        this.orbitBalls.forEach(ball => {
            // 跳过隐藏的球体（已转换为FloatingDrone）
            if (ball.hidden) return;
            
            ctx.save();
            
            // 绘制镭射效果
            if (ball.laserEffect) {
                const now = Date.now();
                const elapsed = now - ball.laserEffect.startTime;
                
                if (elapsed < ball.laserEffect.duration) {
                    const alpha = 1 - (elapsed / ball.laserEffect.duration);
                    
                    // 绘制镭射光束
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = '#FF0000'; // 红色镭射
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    
                    ctx.beginPath();
                    ctx.moveTo(ball.x, ball.y);
                    ctx.lineTo(ball.laserEffect.endX, ball.laserEffect.endY);
                    ctx.stroke();
                    
                    // 绘制镭射内核
                    ctx.strokeStyle = '#FFFF00'; // 黄色内核
                    ctx.lineWidth = 1;
                    
                    ctx.beginPath();
                    ctx.moveTo(ball.x, ball.y);
                    ctx.lineTo(ball.laserEffect.endX, ball.laserEffect.endY);
                    ctx.stroke();
                } else {
                    // 镭射效果结束
                    ball.laserEffect = null;
                }
            }
            
            ctx.globalAlpha = 1;
            
            // 绘制浮游炮主体
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.size, 0, 2 * Math.PI);
            ctx.fill();
            
            // 绘制白色边框
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // 攻击状态时添加红色光晕
            if (ball.state === 'attacking') {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.size + 3, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                // 添加轻微的光晕效果
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#333333';
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.size + 2, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            ctx.restore();
        });
    }
    
    // 绘制光束步枪效果
    drawBeamRifle(ctx) {
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 绘制蓄力效果
        if (this.beamRifle.isCharging) {
            const now = Date.now();
            const chargeProgress = (now - this.beamRifle.chargeStartTime) / this.beamRifle.chargeDuration;
            
            ctx.save();
            
            // 绘制瞄准线
            ctx.strokeStyle = '#FF0000'; // 红色瞄准线
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            
            const aimEndX = bossCenterX + Math.cos(this.beamRifle.targetAngle) * this.beamRifle.range;
            const aimEndY = bossCenterY + Math.sin(this.beamRifle.targetAngle) * this.beamRifle.range;
            
            ctx.beginPath();
            ctx.moveTo(bossCenterX, bossCenterY);
            ctx.lineTo(aimEndX, aimEndY);
            ctx.stroke();
            
            // 绘制蓄力光环（收缩效果）
            ctx.strokeStyle = '#FFFF00'; // 黄色蓄力光环
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.globalAlpha = 1 - chargeProgress * 0.3; // 轻微透明度变化
            
            const chargeRadius = 60 - chargeProgress * 35; // 光环逐渐收缩（从60到25）
            ctx.beginPath();
            ctx.arc(bossCenterX, bossCenterY, chargeRadius, 0, 2 * Math.PI);
            ctx.stroke();
            
            // 添加内圈收缩效果
            ctx.strokeStyle = '#FF8800'; // 橙色内圈
            ctx.lineWidth = 2;
            ctx.globalAlpha = chargeProgress;
            
            const innerRadius = 40 - chargeProgress * 25; // 内圈收缩（从40到15）
            if (innerRadius > 0) {
                ctx.beginPath();
                ctx.arc(bossCenterX, bossCenterY, innerRadius, 0, 2 * Math.PI);
                ctx.stroke();
            }
            
            ctx.restore();
        }
        
        // 绘制开火前停顿效果（新增）
        if (this.beamRifle.isPreFirePause) {
            ctx.save();
            
            // 绘制准确瞄准线（实线）
            ctx.strokeStyle = '#FF0000'; // 红色瞄准线
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            
            const aimEndX = bossCenterX + Math.cos(this.beamRifle.targetAngle) * this.beamRifle.range;
            const aimEndY = bossCenterY + Math.sin(this.beamRifle.targetAngle) * this.beamRifle.range;
            
            ctx.beginPath();
            ctx.moveTo(bossCenterX, bossCenterY);
            ctx.lineTo(aimEndX, aimEndY);
            ctx.stroke();
            
            // 绘制警告光环（闪烁效果）
            const flashTime = Date.now() % 200; // 0.2秒闪烁周期
            const flashAlpha = flashTime < 100 ? 1.0 : 0.3;
            
            ctx.globalAlpha = flashAlpha;
            ctx.strokeStyle = '#FF0000'; // 红色警告
            ctx.lineWidth = 4;
            
            ctx.beginPath();
            ctx.arc(bossCenterX, bossCenterY, 25, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.restore();
        }
        
        // 绘制光束发射效果
        if (this.beamRifle.isFiring) {
            ctx.save();
            
            // 计算光束终点
            const beamEndX = bossCenterX + Math.cos(this.beamRifle.targetAngle) * this.beamRifle.range;
            const beamEndY = bossCenterY + Math.sin(this.beamRifle.targetAngle) * this.beamRifle.range;
            
            // 绘制主光束
            ctx.strokeStyle = '#00FFFF'; // 青色光束
            ctx.lineWidth = this.beamRifle.width;
            ctx.lineCap = 'round';
            
            ctx.beginPath();
            ctx.moveTo(bossCenterX, bossCenterY);
            ctx.lineTo(beamEndX, beamEndY);
            ctx.stroke();
            
            // 绘制光束内核
            ctx.strokeStyle = '#FFFFFF'; // 白色内核
            ctx.lineWidth = this.beamRifle.width / 2;
            
            ctx.beginPath();
            ctx.moveTo(bossCenterX, bossCenterY);
            ctx.lineTo(beamEndX, beamEndY);
            ctx.stroke();
            
            // 绘制发射点光效
            ctx.fillStyle = '#00FFFF';
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.arc(bossCenterX, bossCenterY, 8, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.restore();
        }
        
        // 绘制开火后停顿效果（新增）
        if (this.beamRifle.isPostFirePause) {
            ctx.save();
            
            // 绘制淡化的瞄准线残影
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#FFAA00'; // 橙色残影
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            
            const aimEndX = bossCenterX + Math.cos(this.beamRifle.targetAngle) * this.beamRifle.range;
            const aimEndY = bossCenterY + Math.sin(this.beamRifle.targetAngle) * this.beamRifle.range;
            
            ctx.beginPath();
            ctx.moveTo(bossCenterX, bossCenterY);
            ctx.lineTo(aimEndX, aimEndY);
            ctx.stroke();
            
            // 绘制冷却光环（收缩效果）
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#888888'; // 灰色冷却指示
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            
            const now = Date.now();
            const pauseProgress = (now - this.beamRifle.postFirePauseStartTime) / this.beamRifle.postFirePauseDuration;
            const cooldownRadius = 15 + pauseProgress * 10; // 光环逐渐扩大（表示冷却）
            
            ctx.beginPath();
            ctx.arc(bossCenterX, bossCenterY, cooldownRadius, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.restore();
        }
    }
    
    drawLockIndicator(ctx) {
        drawBossLockIndicator(ctx, this, '#FFFFFF', '#000000');
    }

    // 智能边界处理方法
    handleSmartBoundary() {
        const edgeThreshold = 100; // 距离边缘100像素时触发回中
        const screenCenterX = GAME_CONFIG.WIDTH / 2;
        const screenCenterY = GAME_CONFIG.HEIGHT / 2;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        let needAdjust = false;
        let targetX = bossCenterX;
        let targetY = bossCenterY;
        if (this.x < edgeThreshold) {
            targetX = screenCenterX;
            needAdjust = true;
        }
        if (this.x + this.width > GAME_CONFIG.WIDTH - edgeThreshold) {
            targetX = screenCenterX;
            needAdjust = true;
        }
        if (this.y < edgeThreshold) {
            targetY = screenCenterY;
            needAdjust = true;
        }
        if (this.y + this.height > GAME_CONFIG.HEIGHT - edgeThreshold) {
            targetY = screenCenterY;
            needAdjust = true;
        }
        if (needAdjust) {
            const dx = targetX - bossCenterX;
            const dy = targetY - bossCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > 0) {
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 10;
                this.vx = (dx / distance) * speed;
                this.vy = (dy / distance) * speed;
            }
        }
    }
}

// 噬星者自动步枪子弹类
class StarDevourerBullet extends GameObject {
    constructor(x, y, direction, speed, damage, range) {
        super(x, y, 4, 4, '#4488FF');
        this.direction = direction;
        this.speed = speed;
        this.damage = damage;
        this.maxRange = range;
        this.distanceTraveled = 0;
        this.startX = x;
        this.startY = y;
        
        const angleRad = direction * Math.PI / 180;
        this.vx = Math.cos(angleRad) * speed;
        this.vy = Math.sin(angleRad) * speed;
    }
    
    update() {
        super.update();
        
        this.distanceTraveled = Math.sqrt(
            Math.pow(this.x - this.startX, 2) +
            Math.pow(this.y - this.startY, 2)
        );
        
        if (this.distanceTraveled > this.maxRange ||
            this.x < 0 || this.x > GAME_CONFIG.WIDTH ||
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
            return;
        }
        
        if (game.player && !game.player.isUntargetable && this.collidesWith(game.player)) {
            game.player.takeDamage(this.damage);
            this.shouldDestroy = true;
        }
        
        // 碰撞检测：击中诱饵
        if (!this.shouldDestroy && game.decoys) {
            for (const decoy of game.decoys) {
                if (this.collidesWith(decoy)) {
                    decoy.takeDamage(this.damage);
                    this.shouldDestroy = true;
                    break;
                }
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#4488FF';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
