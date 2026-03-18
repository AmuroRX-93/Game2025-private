// 血红之王 Boss (Crimson King)
// Boss类
class Boss extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 50, '#8B0000');
        this.maxHealth = 300;
        this.health = this.maxHealth;
        this.speed = 40;
        this.dodgeSpeed = 55;
        
        // Boss闪避系统
        this.dodgeChance = 0.20;
        this.missileDodgeChance = 0.80;
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200;
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0;
        this.dodgeCooldown = 600;
        
        // 累积减伤系统：1秒内受到越多伤害减伤越高，每秒重置
        this.damageWindow = {
            accumulated: 0,
            windowStart: Date.now()
        };
        
        // 扎穿系统
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = false;
        this.stunEndTime = 0;
        
        // Boss导弹系统
        this.missileDamage = 6;
        this.missilesPerSalvo = 60;
        this.missileSpeed = 24;
        this.launchDelay = 25;
        this.missileCooldown = 500;
        this.firstLaunchDelay = 300;
        this.spawnTime = Date.now();
        this.lastLaunchCompleteTime = 0;
        this.isLaunchingMissiles = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
        this.hasLaunchedFirst = false;
        
        // 受击提示系统
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;
        
        // AAA-style AI: maintain distance + strafe around player
        this.aiState = 'strafe'; // strafe | retreat | approach | rush
        this.aiStateTimer = 0;
        this.idealDistance = 420;
        this.minDistance = 300;
        this.maxDistance = 550;
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.strafeAngle = 0;
        this.lastAiUpdate = Date.now();
        this.rushCooldown = 0;
        this.rushDuration = 0;
        this.rushTarget = null;
        
        // 回血系统
        this.healSystem = {
            interval: 3000,
            chance: 0.45,
            minHeal: 6,
            maxHeal: 20,
            lastAttempt: Date.now()
        };
        
        this.setRandomDirection();
    }

    setRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }
    
    checkDodge() {
        // 如果正在闪避，不检测新的闪避
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        // 检查玩家是否锁定并攻击
        if (!game.player) return;
        
        const target = game.player.getCurrentTarget();
        if (target !== this) return; // 玩家没有锁定这个Boss
        
        if (!game.player.isUsingMeleeWeapon()) return; // 玩家没有使用近战武器
        
        // 防止重复触发闪避
        if (now - this.lastPlayerAttackCheck < 300) return; // 300ms内只能触发一次
        this.lastPlayerAttackCheck = now;
        
        // 概率检测
        if (Math.random() < this.dodgeChance) {
            this.startDodge();
        }
    }
    
    startDodge() {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 计算从Boss指向玩家的角度
        const playerX = game.player.x + game.player.width / 2;
        const playerY = game.player.y + game.player.height / 2;
        const bossX = this.x + this.width / 2;
        const bossY = this.y + this.height / 2;
        
        const dx = playerX - bossX;
        const dy = playerY - bossY;
        const toPlayerAngle = Math.atan2(dy, dx);
        
        // 向背离主角的180度方向闪避（后退闪避）
        const awayFromPlayerAngle = toPlayerAngle + Math.PI; // 相反方向
        // 添加一些随机变化，避免完全直线后退（在后退方向±30度范围内）
        const angleVariation = (Math.random() - 0.5) * Math.PI / 3; // ±30度随机变化
        const dodgeAngle = awayFromPlayerAngle + angleVariation;
        
        this.vx = Math.cos(dodgeAngle) * this.dodgeSpeed;
        this.vy = Math.sin(dodgeAngle) * this.dodgeSpeed;
    }
    
    updateDodge() {
        if (!this.isDodging) return;
        
        const elapsed = Date.now() - this.dodgeStartTime;
        if (elapsed >= this.dodgeDuration) {
            // 闪避结束，恢复原始移动
            this.isDodging = false;
            this.vx = this.originalVx;
            this.vy = this.originalVy;
        }
    }

    // 检测并躲避子弹 (Boss版本)
    checkBulletDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.bullets || game.bullets.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const dodgeDistance = 100; // Boss检测距离

        for (const bullet of game.bullets) {
            const bulletCenterX = bullet.x + bullet.width / 2;
            const bulletCenterY = bullet.y + bullet.height / 2;
            
            // 计算子弹到Boss的当前距离
            const currentDistance = Math.sqrt(
                Math.pow(bulletCenterX - bossCenterX, 2) + 
                Math.pow(bulletCenterY - bossCenterY, 2)
            );

            // 只有子弹足够接近时才考虑闪避
            if (currentDistance > dodgeDistance) continue;

            const bulletVx = bullet.vx || 0;
            const bulletVy = bullet.vy || 0;
            
            if (bulletVx === 0 && bulletVy === 0) continue;

            // 检查子弹是否朝着Boss飞行
            const toBulletX = bulletCenterX - bossCenterX;
            const toBulletY = bulletCenterY - bossCenterY;
            const dotProduct = toBulletX * bulletVx + toBulletY * bulletVy;
            
            // 如果子弹不是朝着Boss飞行，跳过
            if (dotProduct > 0) continue;

            // 计算子弹轨迹与Boss的最短距离
            const bulletSpeed = Math.sqrt(bulletVx * bulletVx + bulletVy * bulletVy);
            if (bulletSpeed === 0) continue;

            // 从子弹位置到Boss位置的向量
            const toBossX = bossCenterX - bulletCenterX;
            const toBossY = bossCenterY - bulletCenterY;

            // 子弹方向的单位向量
            const bulletDirX = bulletVx / bulletSpeed;
            const bulletDirY = bulletVy / bulletSpeed;

            // 计算Boss在子弹轨迹上的投影点
            const projectionLength = toBossX * bulletDirX + toBossY * bulletDirY;
            const projectionX = bulletCenterX + projectionLength * bulletDirX;
            const projectionY = bulletCenterY + projectionLength * bulletDirY;

            // 计算Boss到子弹轨迹的垂直距离
            const perpendicularDistance = Math.sqrt(
                Math.pow(bossCenterX - projectionX, 2) + 
                Math.pow(bossCenterY - projectionY, 2)
            );

            // 如果垂直距离小于阈值，且子弹正在靠近，进行闪避 (Boss体型更大)
            if (perpendicularDistance < 30 && projectionLength > 0) { // Boss体型更大，阈值也更大
                if (Math.random() < this.dodgeChance) {
                    this.startBulletDodge(bulletVx, bulletVy);
                    break;
                }
            }
        }
    }

    // 开始子弹闪避 (Boss版本)
    startBulletDodge(bulletVx, bulletVy) {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        // 计算子弹飞行方向的角度
        const bulletAngle = Math.atan2(bulletVy, bulletVx);
        
        // 计算垂直于子弹方向的闪避角度（左右各50%概率）
        const perpendicularAngle = bulletAngle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        
        this.vx = Math.cos(perpendicularAngle) * this.dodgeSpeed;
        this.vy = Math.sin(perpendicularAngle) * this.dodgeSpeed;
    }

    // 检查导弹闪避 (Boss版本)
    checkMissileDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.missiles || game.missiles.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const missileDodgeDistance = 150; // Boss的导弹闪避距离更大

        for (const missile of game.missiles) {
            // 计算导弹到Boss的距离
            const distanceToMissile = Math.sqrt(
                Math.pow(missile.x - bossCenterX, 2) + 
                Math.pow(missile.y - bossCenterY, 2)
            );

            // 只有导弹足够接近时才考虑闪避
            if (distanceToMissile > missileDodgeDistance) continue;

            // 检查导弹是否正在追踪这个Boss
            const isTargetingThisBoss = missile.currentTarget === this;
            
            // 计算导弹的当前飞行方向
            const missileSpeed = Math.sqrt(missile.vx * missile.vx + missile.vy * missile.vy);
            if (missileSpeed === 0) continue;

            // 检查导弹是否朝着Boss飞行
            const toBossX = bossCenterX - missile.x;
            const toBossY = bossCenterY - missile.y;
            const dotProduct = toBossX * missile.vx + toBossY * missile.vy;
            
            // 如果导弹不是朝着Boss飞行，跳过
            if (dotProduct <= 0) continue;

            // 调整闪避概率：Boss对导弹威胁反应更强
            let adjustedDodgeChance = this.missileDodgeChance;
            
            if (isTargetingThisBoss) {
                adjustedDodgeChance *= 2.0; // 被追踪时闪避概率提高100%
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

    // 开始导弹闪避 (Boss版本)
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
            // Boss使用更智能的闪避策略
            const baseAngle = Math.atan2(awayFromMissileY, awayFromMissileX);
            
            // 寻找没有玩家导弹的安全方向
            let bestDodgeAngle = baseAngle;
            let bestSafetyScore = 0;
            
            // 检查8个方向的安全性
            for (let i = 0; i < 8; i++) {
                const testAngle = baseAngle + (i * Math.PI / 4);
                const safetyScore = this.calculateDirectionSafety(testAngle, bossCenterX, bossCenterY);
                
                if (safetyScore > bestSafetyScore) {
                    bestSafetyScore = safetyScore;
                    bestDodgeAngle = testAngle;
                }
            }
            
            // 检查边界，避免闪避到墙边
            const futureX = bossCenterX + Math.cos(bestDodgeAngle) * this.dodgeSpeed * 0.5;
            const futureY = bossCenterY + Math.sin(bestDodgeAngle) * this.dodgeSpeed * 0.5;
            
            if (futureX < 50 || futureX > GAME_CONFIG.WIDTH - 50 || 
                futureY < 50 || futureY > GAME_CONFIG.HEIGHT - 50) {
                // 如果会碰到边界，寻找安全的替代方向
                for (let i = 0; i < 8; i++) {
                    const alternativeAngle = baseAngle + (i * Math.PI / 4);
                    const alternativeX = bossCenterX + Math.cos(alternativeAngle) * this.dodgeSpeed * 0.5;
                    const alternativeY = bossCenterY + Math.sin(alternativeAngle) * this.dodgeSpeed * 0.5;
                    
                    if (alternativeX >= 50 && alternativeX <= GAME_CONFIG.WIDTH - 50 && 
                        alternativeY >= 50 && alternativeY <= GAME_CONFIG.HEIGHT - 50) {
                        const safetyScore = this.calculateDirectionSafety(alternativeAngle, bossCenterX, bossCenterY);
                        if (safetyScore > bestSafetyScore) {
                            bestSafetyScore = safetyScore;
                            bestDodgeAngle = alternativeAngle;
                        }
                    }
                }
            }
            
            // Boss的导弹闪避速度更快
            const bossMissileDodgeSpeed = this.dodgeSpeed * 1.8;
            this.vx = Math.cos(bestDodgeAngle) * bossMissileDodgeSpeed;
            this.vy = Math.sin(bestDodgeAngle) * bossMissileDodgeSpeed;
        }
    }
    
    // 计算某个方向的安全性（没有玩家导弹的方向得分更高）
    calculateDirectionSafety(angle, bossCenterX, bossCenterY) {
        if (!game.missiles || game.missiles.length === 0) return 1.0;
        
        let safetyScore = 1.0;
        const checkDistance = 100; // 检查100像素范围内的导弹
        
        for (const missile of game.missiles) {
            // 计算导弹到Boss的距离
            const distanceToMissile = Math.sqrt(
                Math.pow(missile.x - bossCenterX, 2) + 
                Math.pow(missile.y - bossCenterY, 2)
            );
            
            if (distanceToMissile > checkDistance) continue;
            
            // 计算导弹相对于Boss的角度
            const missileAngle = Math.atan2(missile.y - bossCenterY, missile.x - bossCenterX);
            
            // 计算角度差异
            let angleDiff = Math.abs(angle - missileAngle);
            if (angleDiff > Math.PI) {
                angleDiff = 2 * Math.PI - angleDiff;
            }
            
            // 如果导弹在测试方向附近，降低安全性得分
            if (angleDiff < Math.PI / 3) { // 60度范围内
                const distanceFactor = 1 - (distanceToMissile / checkDistance);
                const angleFactor = 1 - (angleDiff / (Math.PI / 3));
                safetyScore -= (distanceFactor * angleFactor * 0.3); // 最多降低30%的安全性
            }
        }
        
        return Math.max(0.1, safetyScore); // 确保至少有10%的安全性
    }
    
    // Boss导弹系统检查 - 基于时间的自动发射
    checkMissileLaunch() {
        if (!game.player || this.isLaunchingMissiles) return;
        
        const now = Date.now();
        
        // 第一次发射：生成后0.3秒
        if (!this.hasLaunchedFirst) {
            if (now - this.spawnTime >= this.firstLaunchDelay) {
                this.startMissileLaunch();
                this.hasLaunchedFirst = true;
            }
            return;
        }
        
        // 后续发射：上次发射完成后0.5秒
        if (this.lastLaunchCompleteTime > 0) {
            if (now - this.lastLaunchCompleteTime >= this.missileCooldown) {
                this.startMissileLaunch();
            }
        }
    }
    
    startMissileLaunch() {
        this.isLaunchingMissiles = true;
        this.launchStartTime = Date.now();
        this.missilesFired = 0;
    }
    
    fireBossMissile() {
        if (!game.player) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 从四个面发射导弹（上、下、左、右）
        const directions = [
            { x: 0, y: -1, name: 'top' },    // 上
            { x: 0, y: 1, name: 'bottom' },  // 下
            { x: -1, y: 0, name: 'left' },   // 左
            { x: 1, y: 0, name: 'right' }    // 右
        ];
        
        // 根据发射的导弹数量选择发射方向
        const directionIndex = this.missilesFired % 4;
        const direction = directions[directionIndex];
        
        // 计算导弹发射位置（从Boss边缘发射）
        const launchDistance = this.width / 2 + 10;
        const launchX = bossCenterX + direction.x * launchDistance;
        const launchY = bossCenterY + direction.y * launchDistance;
        
        // 初始目标位置（直线飞行，不制导）
        const initialTargetX = launchX + direction.x * 200; // 初始飞行200像素
        const initialTargetY = launchY + direction.y * 200;
        
        // 创建Boss导弹（延迟制导）
        const bossMissile = new Missile(launchX, launchY, initialTargetX, initialTargetY, this.missileDamage, this.missileSpeed);
        bossMissile.isBossMissile = true; // 标记为Boss导弹
        bossMissile.isBossMissileDelayed = true; // 标记为延迟制导的Boss导弹
        bossMissile.delayStartTime = Date.now(); // 记录发射时间
        bossMissile.delayDuration = 300; // 0.3秒延迟
        bossMissile.guideRange = 600; // 制导范围600像素
        
        // 确保Boss导弹数组存在
        if (!game.bossMissiles) {
            game.bossMissiles = [];
        }
        
        game.bossMissiles.push(bossMissile);
        this.missilesFired++;
    }
    
    updateMissileLaunch() {
        if (!this.isLaunchingMissiles) return;
        
        const elapsed = Date.now() - this.launchStartTime;
        const expectedMissiles = Math.floor(elapsed / this.launchDelay);
        
        // 发射到达时间的导弹
        while (this.missilesFired < expectedMissiles && this.missilesFired < this.missilesPerSalvo) {
            this.fireBossMissile();
        }
        
        // 检查是否发射完所有导弹
        if (this.missilesFired >= this.missilesPerSalvo) {
            this.isLaunchingMissiles = false;
            // 记录发射完成时间，用于计算下次发射
            this.lastLaunchCompleteTime = Date.now();
        }
    }

    updateAI() {
        if (!game.player) return;
        
        const now = Date.now();
        const dt = (now - this.lastAiUpdate) / 1000;
        this.lastAiUpdate = now;
        
        const bossCX = this.x + this.width / 2;
        const bossCY = this.y + this.height / 2;
        const aiTarget = getBossTargetCenter();
        const playerCX = aiTarget ? aiTarget.x : bossCX;
        const playerCY = aiTarget ? aiTarget.y : bossCY;
        
        const dx = playerCX - bossCX;
        const dy = playerCY - bossCY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const toPlayerAngle = Math.atan2(dy, dx);
        
        // Decrement cooldowns
        if (this.rushCooldown > 0) this.rushCooldown -= dt;
        if (this.rushDuration > 0) this.rushDuration -= dt;
        this.aiStateTimer -= dt;
        
        // State transitions
        if (this.aiState === 'rush' && this.rushDuration <= 0) {
            this.aiState = 'retreat';
            this.aiStateTimer = 1.2 + Math.random() * 0.8;
        }
        
        if (this.aiState !== 'rush') {
            if (dist < this.minDistance) {
                this.aiState = 'retreat';
                this.aiStateTimer = 0.8 + Math.random() * 0.6;
            } else if (dist > this.maxDistance) {
                this.aiState = 'approach';
                this.aiStateTimer = 1.0 + Math.random() * 0.5;
            } else if (this.aiStateTimer <= 0) {
                // In comfort zone: mostly strafe, occasionally rush
                if (this.rushCooldown <= 0 && Math.random() < 0.15) {
                    this.aiState = 'rush';
                    this.rushDuration = 0.6 + Math.random() * 0.4;
                    this.rushCooldown = 4.0 + Math.random() * 3.0;
                    this.rushTarget = { x: playerCX, y: playerCY };
                } else {
                    this.aiState = 'strafe';
                    this.aiStateTimer = 2.0 + Math.random() * 2.0;
                    if (Math.random() < 0.35) this.strafeDirection *= -1;
                }
            }
        }
        
        let moveAngle = 0;
        let moveSpeed = this.speed;
        
        switch (this.aiState) {
            case 'strafe': {
                // Circle the player at ideal distance
                const perpAngle = toPlayerAngle + (Math.PI / 2) * this.strafeDirection;
                const distError = dist - this.idealDistance;
                const correctionWeight = Math.min(Math.abs(distError) / 150, 0.7);
                const correctionAngle = distError > 0 ? toPlayerAngle : toPlayerAngle + Math.PI;
                moveAngle = this.lerpAngle(perpAngle, correctionAngle, correctionWeight);
                moveSpeed = this.speed * 0.85;
                break;
            }
            case 'retreat': {
                const awayAngle = toPlayerAngle + Math.PI;
                const jitter = (Math.random() - 0.5) * 0.6;
                moveAngle = awayAngle + jitter;
                moveSpeed = this.speed * 1.15;
                break;
            }
            case 'approach': {
                moveAngle = toPlayerAngle + (Math.random() - 0.5) * 0.4;
                moveSpeed = this.speed * 0.9;
                break;
            }
            case 'rush': {
                if (this.rushTarget) {
                    const rushDx = this.rushTarget.x - bossCX;
                    const rushDy = this.rushTarget.y - bossCY;
                    moveAngle = Math.atan2(rushDy, rushDx);
                } else {
                    moveAngle = toPlayerAngle;
                }
                moveSpeed = this.speed * 1.6;
                break;
            }
        }
        
        // Apply boundary avoidance: steer away from edges
        const margin = 70;
        let bx = 0, by = 0;
        if (bossCX < margin) bx = (margin - bossCX) / margin;
        else if (bossCX > GAME_CONFIG.WIDTH - margin) bx = (GAME_CONFIG.WIDTH - margin - bossCX) / margin;
        if (bossCY < margin) by = (margin - bossCY) / margin;
        else if (bossCY > GAME_CONFIG.HEIGHT - margin) by = (GAME_CONFIG.HEIGHT - margin - bossCY) / margin;
        
        let finalVx = Math.cos(moveAngle) * moveSpeed + bx * moveSpeed * 1.5;
        let finalVy = Math.sin(moveAngle) * moveSpeed + by * moveSpeed * 1.5;
        
        // Smoothly interpolate velocity for natural movement
        const smoothing = 0.12;
        this.vx += (finalVx - this.vx) * smoothing;
        this.vy += (finalVy - this.vy) * smoothing;
    }
    
    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return a + diff * t;
    }

    update() {
        if (this.stunned) {
            if (Date.now() >= this.stunEndTime) {
                this.stunned = false;
            } else {
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        if (this.isImpaled && this.impaledBy) {
            super.update();
            this.checkBounds();
            return;
        }
        
        this.checkDodge();
        this.checkBulletDodge();
        this.checkMissileDodge();
        this.updateDodge();
        
        this.checkMissileLaunch();
        this.updateMissileLaunch();
        this.tryHeal();
        
        if (!this.isDodging) {
            this.updateAI();
        }

        // Hard clamp to screen bounds
        if (this.x <= 0) { this.x = 1; this.vx = Math.abs(this.vx); }
        if (this.x + this.width >= GAME_CONFIG.WIDTH) { this.x = GAME_CONFIG.WIDTH - this.width - 1; this.vx = -Math.abs(this.vx); }
        if (this.y <= 0) { this.y = 1; this.vy = Math.abs(this.vy); }
        if (this.y + this.height >= GAME_CONFIG.HEIGHT) { this.y = GAME_CONFIG.HEIGHT - this.height - 1; this.vy = -Math.abs(this.vy); }

        super.update();
        this.checkBounds();
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
    
    // 被长枪扎穿 (Boss版本)
    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        // 停止当前移动
        this.vx = 0;
        this.vy = 0;
    }
    
    // 释放扎穿状态并进入硬直 (Boss版本)
    releaseImpale() {
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = true;
        this.stunEndTime = Date.now() + 200; // 0.2秒硬直
        // 停止移动
        this.vx = 0;
        this.vy = 0;
    }

    takeDamage(damage) {
        const now = Date.now();
        
        // 每秒重置累积伤害窗口
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        
        // 根据本窗口已累积伤害计算减伤比例
        // 累积越多减伤越高，但永远不会减到0
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        const actualDamage = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        
        this.damageWindow.accumulated += damage;
        
        this.health -= actualDamage;
        
        this.addHitIndicator(actualDamage);
        
        return this.health <= 0;
    }
    
    // 添加受击提示
    addHitIndicator(damage) {
        const now = Date.now();
        this.hitIndicators.push({
            damage: damage,
            startTime: now,
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 60, // 在Boss周围随机位置，范围稍大
            y: this.y + this.height + 15 + Math.random() * 10 // Boss下方，血条更下面的位置
        });
        
        // 清理过期的受击提示
        this.hitIndicators = this.hitIndicators.filter(indicator => 
            now - indicator.startTime < this.hitIndicatorDuration
        );
    }
    
    // 绘制受击提示
    drawHitIndicators(ctx) {
        const now = Date.now();
        
        // 清理过期的受击提示
        this.hitIndicators = this.hitIndicators.filter(indicator => 
            now - indicator.startTime < this.hitIndicatorDuration
        );
        
        // 绘制每个受击提示
        this.hitIndicators.forEach(indicator => {
            const elapsed = now - indicator.startTime;
            const progress = elapsed / this.hitIndicatorDuration;
            
            // 计算透明度和上浮效果
            const alpha = 1 - progress; // 透明度从1到0
            const offsetY = progress * 30; // 上浮30像素
            
            ctx.save();
            ctx.globalAlpha = alpha;
            
            // 绘制红色的受击文字
            ctx.fillStyle = '#FF0000';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            
            const displayY = indicator.y - offsetY;
            const text = `HIT ${indicator.damage}`;
            
            // 绘制文字描边（白色）
            ctx.strokeText(text, indicator.x, displayY);
            // 绘制文字填充（红色）
            ctx.fillText(text, indicator.x, displayY);
            
            ctx.restore();
        });
    }

    draw(ctx) {
        // 绘制Boss主体（简单深红色大色块）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 红色边框表示Boss
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 绘制Boss推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制血量条
        const barWidth = this.width;
        const barHeight = 6;
        const barY = this.y - 12;
        
        // 背景（灰色）
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // 血量（红色到绿色渐变）
        const healthRatio = this.health / this.maxHealth;
        const red = Math.floor(255 * (1 - healthRatio));
        const green = Math.floor(255 * healthRatio);
        ctx.fillStyle = `rgb(${red}, ${green}, 0)`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // Boss标识
        ctx.fillStyle = '#FF0000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
                ctx.fillText('血红之王', this.x + this.width/2, this.y - 16);
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
        
        // 被扎穿状态视觉效果 (Boss版本)
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 绘制青蓝色扎穿光效 (Boss更大)
            ctx.strokeStyle = '#00CCFF';
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
        
        // 硬直状态视觉效果 (Boss版本)
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 绘制黄色硬直效果 (Boss更大)
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 锁定标识：红色跳动倒三角
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
    }

    // 绘制Boss推进器火焰效果 - 血红之王专属火箭推进器
    drawThrusterFlames(ctx) {
        // 检查是否有移动
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;
        
        // 计算移动方向
        const moveAngle = Math.atan2(this.vy, this.vx);
        
        // 血红之王火箭推进器参数（简化版本）
        let thrusterCount, thrusterSpacing, flameLength, innerWidth, outerWidth;
        
        if (this.isDodging) {
            // Boss闪避时的双推进器
            thrusterCount = 2;
            thrusterSpacing = 15;
            flameLength = 80;
            innerWidth = 10;
            outerWidth = 20;
        } else {
            // Boss普通移动时的双推进器
            thrusterCount = 2;
            thrusterSpacing = 12;
            flameLength = 50;
            innerWidth = 6;
            outerWidth = 12;
        }
        
        // 计算推进器方向
        const thrusterAngle = moveAngle + Math.PI; // 相反方向
        
        // 绘制多个巨大的并排推进器喷射口
        for (let i = 0; i < thrusterCount; i++) {
            const offsetPerp = (i - (thrusterCount - 1) / 2) * thrusterSpacing;
            
            // 计算垂直于推进方向的偏移
            const perpAngle = thrusterAngle + Math.PI / 2;
            const offsetX = Math.cos(perpAngle) * offsetPerp;
            const offsetY = Math.sin(perpAngle) * offsetPerp;
            
            // Boss推进器喷射口位置
            const startDistance = this.width / 2 + 5;
            const startX = this.x + this.width / 2 + Math.cos(thrusterAngle) * startDistance + offsetX;
            const startY = this.y + this.height / 2 + Math.sin(thrusterAngle) * startDistance + offsetY;
            
            // 每个推进器的火焰长度有轻微变化（Boss的更加规律）
            const currentFlameLength = flameLength + (Math.sin(Date.now() * 0.015 + i) * 8);
            const endX = startX + Math.cos(thrusterAngle) * currentFlameLength;
            const endY = startY + Math.sin(thrusterAngle) * currentFlameLength;
            
            // 绘制外层火焰（血红到橙红渐变）
            const outerGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            if (this.isDodging) {
                // Boss闪避时的炽热火焰
                outerGradient.addColorStop(0, 'rgba(139, 0, 0, 1.0)');     // 血红色
                outerGradient.addColorStop(0.2, 'rgba(200, 0, 0, 0.95)');  // 亮红色
                outerGradient.addColorStop(0.5, 'rgba(255, 69, 0, 0.85)'); // 橙红色
                outerGradient.addColorStop(0.8, 'rgba(255, 140, 0, 0.6)'); // 橙色
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            } else {
                // Boss普通移动时的强烈火焰
                outerGradient.addColorStop(0, 'rgba(120, 0, 0, 0.9)');     // 暗红色
                outerGradient.addColorStop(0.3, 'rgba(180, 20, 0, 0.8)');  // 深红色
                outerGradient.addColorStop(0.6, 'rgba(220, 50, 0, 0.7)');  // 深橙红
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            }
            
            ctx.strokeStyle = outerGradient;
            ctx.lineWidth = outerWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // 绘制内层火焰（白色/黄色高温核心）
            const coreEndX = startX + Math.cos(thrusterAngle) * (currentFlameLength * 0.6);
            const coreEndY = startY + Math.sin(thrusterAngle) * (currentFlameLength * 0.6);
            
            const innerGradient = ctx.createLinearGradient(startX, startY, coreEndX, coreEndY);
            if (this.isDodging) {
                // Boss闪避时的白热核心
                innerGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)'); // 纯白色
                innerGradient.addColorStop(0.4, 'rgba(255, 255, 150, 0.9)'); // 淡黄白
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            } else {
                // Boss普通时的高温核心
                innerGradient.addColorStop(0, 'rgba(255, 200, 100, 0.9)'); // 黄橙色
                innerGradient.addColorStop(0.5, 'rgba(255, 255, 150, 0.7)'); // 淡黄色
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            }
            
            ctx.strokeStyle = innerGradient;
            ctx.lineWidth = innerWidth;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(coreEndX, coreEndY);
            ctx.stroke();
        }
        
        // Boss专属火焰粒子效果
        this.drawBossRocketFlameParticles(ctx, moveAngle, flameLength);
    }
    
    // 绘制Boss火箭火焰粒子效果
    drawBossRocketFlameParticles(ctx, moveAngle, flameLength) {
        // 根据闪避状态调整粒子参数（Boss的粒子更多更强）
        const particleCount = this.isDodging ? 40 : 25;
        const particleIntensity = this.isDodging ? 0.7 : 0.5;
        const particleSizeMultiplier = this.isDodging ? 1.5 : 1.0;
        
        const time = Date.now() * 0.01; // 用于动画
        
        // 计算推进器方向
        const thrusterAngle = moveAngle + Math.PI;
        
        for (let i = 0; i < particleCount; i++) {
            // Boss粒子在火焰区域内随机分布，范围更大
            const spreadAngle = (Math.random() - 0.5) * 0.8; // Boss粒子散布角度更大
            const particleAngle = thrusterAngle + spreadAngle;
            
            // 粒子距离随机分布在火焰长度内
            const distance = this.width / 2 + 12 + Math.random() * (flameLength * 0.9);
            
            // 计算粒子位置
            const x = this.x + this.width / 2 + Math.cos(particleAngle) * distance;
            const y = this.y + this.height / 2 + Math.sin(particleAngle) * distance;
            
            // 根据距离调整粒子颜色和大小
            const distanceRatio = (distance - this.width / 2 - 12) / (flameLength * 0.9);
            const alpha = (Math.sin(time * 1.5 + i) + 1) * particleIntensity * (1 - distanceRatio * 0.6);
            
            // Boss粒子大小更大
            const size = (3 + Math.random() * 4) * particleSizeMultiplier * (1 - distanceRatio * 0.4);
            
            // Boss火焰粒子颜色 - 血红色主调，根据距离渐变
            let red, green, blue;
            if (distanceRatio < 0.25) {
                // 近处：血红色
                red = 139 + distanceRatio * 116; // 139到255
                green = 0 + distanceRatio * 50;   // 0到50
                blue = 0;
            } else if (distanceRatio < 0.6) {
                // 中间：红橙色
                red = 255;
                green = 50 + (distanceRatio - 0.25) * 90; // 50到140
                blue = 0 + (distanceRatio - 0.25) * 50;   // 0到50
            } else {
                // 远处：橙黄色
                red = 255;
                green = 140 + (distanceRatio - 0.6) * 115; // 140到255
                blue = 50 + (distanceRatio - 0.6) * 155;   // 50到205
            }
            
            ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
            ctx.fillRect(x - size/2, y - size/2, size, size);
            
            // 添加一些白色高温粒子（核心区域）
            if (Math.random() < 0.3 && distanceRatio < 0.3) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                const whiteSize = size * 0.6;
                ctx.fillRect(x - whiteSize/2, y - whiteSize/2, whiteSize, whiteSize);
            }
            
            // Boss专属：血红色烟雾效果（远距离粒子）
            if (Math.random() < 0.15 && distanceRatio > 0.7) {
                ctx.fillStyle = `rgba(139, 0, 0, ${alpha * 0.4})`;
                const smokeSize = size * 1.5;
                ctx.fillRect(x - smokeSize/2, y - smokeSize/2, smokeSize, smokeSize);
            }
        }
    }
    
    drawLockIndicator(ctx) {
        // 计算跳动效果
        const time = Date.now();
        const bounce = Math.sin(time * 0.01) * 4; // Boss的跳动幅度稍大
        
        // 倒三角的位置（Boss头顶上方）
        const triangleX = this.x + this.width / 2;
        const triangleY = this.y - 20 + bounce; // Boss的三角位置更高
        const size = 12; // Boss的三角更大
        
        // 绘制红色倒三角
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.moveTo(triangleX, triangleY + size); // 顶点（下）
        ctx.lineTo(triangleX - size, triangleY - size); // 左上
        ctx.lineTo(triangleX + size, triangleY - size); // 右上
        ctx.closePath();
        ctx.fill();
        
        // 添加白色边框使其更醒目
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2; // Boss的边框更粗
        ctx.stroke();
    }
}
