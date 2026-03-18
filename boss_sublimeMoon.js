// 冰之姬 Boss + CrescentBullet + IceClone
// 月牙追踪弹类
class CrescentBullet extends GameObject {
    constructor(x, y, targetX, targetY, damage, speed) {
        super(x, y, 8, 8, '#87CEEB'); // 天蓝色，8x8像素
        
        this.damage = damage;
        this.speed = speed;
        this.currentSpeed = speed * 0.6; // 初始速度为最大速度的60%
        this.maxSpeed = speed;
        this.shouldDestroy = false;
        
        // 追踪系统
        this.currentTarget = null;
        this.trackingStrength = 0.08; // 追踪强度
        this.maxLifetime = 8000; // 8秒生命周期
        this.startTime = Date.now();
        
        // 初始方向朝向目标
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.vx = (dx / distance) * this.currentSpeed;
            this.vy = (dy / distance) * this.currentSpeed;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
        
        // 视觉效果
        this.rotation = 0;
        this.rotationSpeed = 0.1;
    }
    
    findTarget() {
        const target = getBossTarget();
        if (target) {
            this.currentTarget = target;
        }
    }
    
    trackTarget() {
        if (!this.currentTarget) return;
        
        const targetCenterX = this.currentTarget.x + this.currentTarget.width / 2;
        const targetCenterY = this.currentTarget.y + this.currentTarget.height / 2;
        
        // 计算到目标的方向
        const dx = targetCenterX - this.x;
        const dy = targetCenterY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // 目标方向的单位向量
            const targetVx = (dx / distance) * this.currentSpeed;
            const targetVy = (dy / distance) * this.currentSpeed;
            
            // 平滑地调整当前速度朝向目标
            this.vx = this.vx * (1 - this.trackingStrength) + targetVx * this.trackingStrength;
            this.vy = this.vy * (1 - this.trackingStrength) + targetVy * this.trackingStrength;
            
            // 保持速度大小
            const currentSpeedMag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeedMag > 0) {
                this.vx = (this.vx / currentSpeedMag) * this.currentSpeed;
                this.vy = (this.vy / currentSpeedMag) * this.currentSpeed;
            }
        }
    }
    
    updateSpeed() {
        // 月牙弹逐渐加速
        if (this.currentSpeed < this.maxSpeed) {
            this.currentSpeed += 0.1;
            this.currentSpeed = Math.min(this.currentSpeed, this.maxSpeed);
        }
    }
    
    checkCollisions() {
        const bulletCenterX = this.x + this.width / 2;
        const bulletCenterY = this.y + this.height / 2;
        
        if (game.player) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const distance = Math.sqrt(
                Math.pow(playerCenterX - bulletCenterX, 2) + 
                Math.pow(playerCenterY - bulletCenterY, 2)
            );
            if (distance < 20) {
                game.player.takeDamage(this.damage);
                game.player.setStunned(600);
                updateUI();
                this.shouldDestroy = true;
                return;
            }
        }
        
        if (game.decoys) {
            for (const decoy of game.decoys) {
                const dcx = decoy.x + decoy.width / 2;
                const dcy = decoy.y + decoy.height / 2;
                const dist = Math.sqrt(Math.pow(dcx - bulletCenterX, 2) + Math.pow(dcy - bulletCenterY, 2));
                if (dist < 20) {
                    decoy.takeDamage(this.damage);
                    this.shouldDestroy = true;
                    return;
                }
            }
        }
    }
    
    update() {
        // 检查是否超时
        if (Date.now() - this.startTime > this.maxLifetime) {
            this.shouldDestroy = true;
            return;
        }
        
        // 更新速度
        this.updateSpeed();
        
        // 寻找目标
        this.findTarget();
        
        // 追踪目标
        if (this.currentTarget) {
            this.trackTarget();
        }
        
        // 更新位置
        this.x += this.vx;
        this.y += this.vy;
        
        // 更新旋转
        this.rotation += this.rotationSpeed;
        
        // 检查边界
        if (this.x < -20 || this.x > GAME_CONFIG.WIDTH + 20 || 
            this.y < -20 || this.y > GAME_CONFIG.HEIGHT + 20) {
            this.shouldDestroy = true;
        }
        
        // 检查碰撞
        this.checkCollisions();
    }
    
    draw(ctx) {
        ctx.save();
        
        // 移动到月牙弹中心并旋转
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(this.rotation);
        
        // 绘制雪花样式的月牙弹
        const size = 8;
        
        // 主体 - 月牙形状
        ctx.fillStyle = '#87CEEB'; // 天蓝色
        ctx.beginPath();
        ctx.arc(-size/4, 0, size/2, 0, Math.PI * 2);
        ctx.fill();
        
        // 月牙缺口
        ctx.fillStyle = '#404040'; // 灰色背景色，造成月牙效果
        ctx.beginPath();
        ctx.arc(size/6, -size/6, size/3, 0, Math.PI * 2);
        ctx.fill();
        
        // 雪花装饰 - 6条射线
        ctx.strokeStyle = '#B0E0E6'; // 淡蓝色
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const lineLength = size * 0.6;
            
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * lineLength, Math.sin(angle) * lineLength);
            ctx.stroke();
            
            // 射线末端的小分支
            const branchAngle1 = angle + Math.PI / 6;
            const branchAngle2 = angle - Math.PI / 6;
            const branchLength = size * 0.2;
            
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * lineLength, Math.sin(angle) * lineLength);
            ctx.lineTo(
                Math.cos(angle) * lineLength + Math.cos(branchAngle1) * branchLength,
                Math.sin(angle) * lineLength + Math.sin(branchAngle1) * branchLength
            );
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * lineLength, Math.sin(angle) * lineLength);
            ctx.lineTo(
                Math.cos(angle) * lineLength + Math.cos(branchAngle2) * branchLength,
                Math.sin(angle) * lineLength + Math.sin(branchAngle2) * branchLength
            );
            ctx.stroke();
        }
        
        // 中心光点
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// 冰之姬Boss类 - 基于血红之王但改为青蓝色主题，玩刀的Boss
class SublimeMoon extends GameObject {
    constructor(x, y) {
        super(x, y, 35, 35, '#4682B4'); // 青蓝色，较小尺寸（35x35而不是50x50）
        this.maxHealth = 200;
        this.health = this.maxHealth;
        this.speed = 13; // 冰之姬：13单位每秒（较慢的平滑移动）
        this.setRandomDirection();
        this.lastDirectionChange = 0;
        this.directionChangeInterval = 2000; // 2秒改变一次方向
        
        // 回血系统
        this.healSystem = {
            interval: 3000,
            chance: 0.45,
            minHeal: 6,
            maxHeal: 20,
            lastAttempt: Date.now()
        };
        
        // Boss闪避系统
        this.dodgeChance = 0.20; // 20%近战闪避概率
        this.missileDodgeChance = 0.90; // 90%导弹闪避概率（冰之姬对导弹威胁反应极强）
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200; // 0.2秒
        this.dodgeSpeed = 20; // 冰之姬：20单位/秒回避速度（较慢的闪避）
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0; // 上次闪避时间
        this.dodgeCooldown = 600; // Boss闪避冷却时间更短：0.6秒
        
        // 扎穿系统
        this.isImpaled = false; // 是否被长枪扎穿
        this.impaledBy = null; // 扎穿的武器引用
        this.stunned = false; // 是否硬直
        this.stunEndTime = 0; // 硬直结束时间
        
        // Boss导弹系统（冰之姬：较少导弹，更长冷却）
        this.missileDamage = 3; // 每枚导弹3点伤害
        this.missilesPerSalvo = 4; // 每次发射4枚导弹（原来30枚）
        this.missileSpeed = 12; // 导弹飞行速度
        this.launchDelay = 80; // 导弹发射间隔（毫秒）
        this.missileCooldown = 5000; // 5秒导弹冷却时间（原来3秒）
        this.lastMissileTime = 0; // 上次发射导弹时间
        this.isLaunchingMissiles = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
        
        // 受击提示系统
        this.hitIndicators = []; // 存储多个受击提示
        this.hitIndicatorDuration = 600; // 受击提示持续时间：0.6秒
        
        // 新的AI系统
        this.aiMode = 'normal'; // AI模式：'normal', 'dash_attack', 'teleport_slash', 'boomerang_form'
        this.aiCooldown = 3000; // AI行动冷却时间
        this.lastAiAction = 0; // 上次AI行动时间
        
        // 闪避突进系统
        this.dashCount = 0; // 当前突进次数
        this.maxDashCount = 3; // 最大突进次数
        this.isDashing = false; // 是否正在突进
        this.dashSpeed = 50; // 突进速度
        this.dashDuration = 200; // 突进持续时间
        this.dashStartTime = 0;
        this.dashTarget = null;
        
        // 传送回旋斩系统
        this.canTeleportSlash = true; // 是否可以传送回旋斩
        this.teleportSlashCooldown = 10000; // 传送回旋斩冷却时间
        this.lastTeleportSlash = 0;
        
        // 回旋镖形态系统
        this.isBoomerangForm = false; // 是否处于回旋镖形态
        this.boomerangCount = 5; // 回旋镖数量
        this.boomerangs = []; // 回旋镖数组
        this.boomerangAttackCooldown = 15000; // 回旋镖攻击冷却时间
        this.lastBoomerangAttack = 0;
        this.boomerangFormDuration = 8000; // 回旋镖形态持续时间
        this.boomerangFormStartTime = 0;
        
        // 回旋斩系统（简化版）
        this.isSpinSlashing = false;
        this.spinSlashDamagePhase1 = 12; // 降低伤害：20->12
        this.spinSlashDamagePhase2 = 18; // 降低伤害：30->18
        this.spinSlashCooldown = 100; // 0.1秒短冷却，允许快速防御导弹
        this.lastSpinSlash = 0;
        this.spinSlashRange = 60; // 回旋斩触发距离（缩小到60）
        
        // 瞬移系统
        this.teleportRange = 400; // 超过400像素时触发瞬移
        this.teleportCooldown = 600; // 0.6秒瞬移冷却时间
        this.lastTeleport = 0;
        this.teleportProtectionTime = 10000; // 10秒保护期，期间不会瞬移
        this.spawnTime = Date.now(); // 记录生成时间
        
        // 月牙追踪弹系统
        this.crescentBulletsPerSalvo = 5; // 每次发射5颗月牙弹
        this.crescentBulletDamage = 10; // 每颗月牙弹10点伤害
        this.crescentBulletSpeed = 8; // 月牙弹飞行速度
        this.crescentBulletCooldown = 4000; // 4秒冷却时间
        this.lastCrescentBullet = 0;
        this.safeAttackRangeMin = 70; // 安全攻击区域最小距离
        this.safeAttackRangeMax = 400; // 安全攻击区域最大距离
        
        // 分身召唤系统
        this.cloneSummonCooldown = 10000; // 10秒召唤一次分身
        this.lastCloneSummon = -8000; // 游戏开始2秒后召唤第一次分身
        this.canSummonClones = true;
        
        // 机雷系统
        this.minePlacementInterval = 500; // 0.5秒放置一颗机雷
        this.lastMinePlacementTime = 0;
    }

    setRandomDirection() {
        this.vx = (Math.random() - 0.5) * 2 * this.speed;
        this.vy = (Math.random() - 0.5) * 2 * this.speed;
    }
    
    checkDodge() {
        checkBossMeleeDodge(this);
    }
    
    startDodge() {
        startBossDodge(this);
    }
    
    updateDodge() {
        if (!this.isDodging) return;
        
        const elapsed = Date.now() - this.dodgeStartTime;
        if (elapsed >= this.dodgeDuration) {
            this.isDodging = false;
            this.vx = this.originalVx;
            this.vy = this.originalVy;
        }
    }

    // 检测并躲避子弹 (SublimeMoon版本)
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
    
    // 开始子弹闪避 (SublimeMoon版本)
    startBulletDodge(bulletVx, bulletVy) {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        // 计算垂直于子弹方向的闪避方向
        const perpAngle1 = Math.atan2(bulletVy, bulletVx) + Math.PI / 2;
        const perpAngle2 = Math.atan2(bulletVy, bulletVx) - Math.PI / 2;
        
        // 随机选择左闪避还是右闪避
        const dodgeAngle = Math.random() < 0.5 ? perpAngle1 : perpAngle2;
        
        this.vx = Math.cos(dodgeAngle) * this.dodgeSpeed;
        this.vy = Math.sin(dodgeAngle) * this.dodgeSpeed;
    }

    // 检查导弹瞬移 (SublimeMoon版本) - 简化版
    checkMissileTeleport() {
        // 检查瞬移冷却时间
        const now = Date.now();
        if (now - this.lastTeleport < this.teleportCooldown) return;
        
        if (!game.missiles || game.missiles.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const missileTeleportDistance = 120; // 导弹距离120像素内时立刻瞬移

        for (const missile of game.missiles) {
            // 计算导弹到Boss的距离
            const distanceToMissile = Math.sqrt(
                Math.pow(missile.x - bossCenterX, 2) + 
                Math.pow(missile.y - bossCenterY, 2)
            );

            // 只要120像素内有玩家导弹就立刻瞬移
            if (distanceToMissile <= missileTeleportDistance) {
                this.performTeleport();
                break; // 瞬移后停止检查其他导弹
            }
        }
    }

    // 检查子弹瞬移 (SublimeMoon版本)
    checkBulletTeleport() {
        // 检查瞬移冷却时间
        const now = Date.now();
        if (now - this.lastTeleport < this.teleportCooldown) return;
        
        if (!game.bullets || game.bullets.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const bulletTeleportDistance = 80; // 子弹距离80像素内时考虑瞬移

        for (const bullet of game.bullets) {
            // 计算子弹到Boss的距离
            const distanceToBullet = Math.sqrt(
                Math.pow(bullet.x - bossCenterX, 2) + 
                Math.pow(bullet.y - bossCenterY, 2)
            );

            // 子弹在80像素内时，50%概率瞬移
            if (distanceToBullet <= bulletTeleportDistance) {
                if (Math.random() < 0.5) { // 50%概率
                    this.performTeleport();
                    break; // 瞬移后停止检查其他子弹
                }
            }
        }
    }

    // 原导弹闪避方法已被导弹瞬移替代
    // startMissileDodge(missile) { ... }
    
    // Boss导弹系统检查
    canLaunchMissiles() {
        const now = Date.now();
        return !this.isLaunchingMissiles && (now - this.lastMissileTime) >= this.missileCooldown;
    }
    
    checkMissileLaunch() {
        if (!game.player || !this.canLaunchMissiles()) return;
        
        const missileTC = getBossTargetCenter();
        if (!missileTC) return;
        const playerCenterX = missileTC.x;
        const playerCenterY = missileTC.y;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const distanceToPlayer = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        // 在合适距离内发射导弹
        const maxLaunchDistance = 400; // Boss导弹发射距离
        const minLaunchDistance = 100; // 最小发射距离，避免太近时发射
        
        if (distanceToPlayer <= maxLaunchDistance && distanceToPlayer >= minLaunchDistance) {
            // 根据距离调整发射概率
            const launchChance = 0.02; // 每帧2%概率
            
            if (Math.random() < launchChance) {
                this.startMissileLaunch();
            }
        }
    }
    
    startMissileLaunch() {
        this.isLaunchingMissiles = true;
        this.launchStartTime = Date.now();
        this.lastMissileTime = this.launchStartTime;
        this.missilesFired = 0;
    }
    
    fireBossMissile() {
        if (!game.player) return;
        
        const fireTC = getBossTargetCenter();
        if (!fireTC) return;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = fireTC.x;
        const playerCenterY = fireTC.y;
        
        const spreadAngle = (Math.random() - 0.5) * Math.PI / 6;
        const baseAngle = Math.atan2(playerCenterY - bossCenterY, playerCenterX - bossCenterX);
        const missileAngle = baseAngle + spreadAngle;
        
        const launchDistance = this.width / 2 + 10;
        const launchX = bossCenterX + Math.cos(missileAngle) * launchDistance;
        const launchY = bossCenterY + Math.sin(missileAngle) * launchDistance;
        
        const playerVx = fireTarget.vx || 0;
        const playerVy = fireTarget.vy || 0;
        const predictionTime = 0.5; // 0.5秒预测
        const targetX = playerCenterX + playerVx * predictionTime;
        const targetY = playerCenterY + playerVy * predictionTime;
        
        // 创建Boss导弹
        const bossMissile = new Missile(launchX, launchY, targetX, targetY, this.missileDamage, this.missileSpeed);
        bossMissile.isBossMissile = true; // 标记为Boss导弹
        
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
        }
    }
    
    // 新的AI决策系统
    updateAI() {
        if (!game.player || this.isDodging || this.stunned || this.isImpaled) return;
        
        const now = Date.now();
        
        // 处理回旋镖形态
        if (this.isBoomerangForm) {
            this.updateBoomerangForm();
            return;
        }
        
        // 处理突进攻击模式
        if (this.aiMode === 'dash_attack') {
            this.updateDashAttack();
            return;
        }
        
        // 处理传送回旋斩模式
        if (this.aiMode === 'teleport_slash') {
            this.updateTeleportSlash();
            return;
        }
        
        // 检查是否可以进行AI行动
        if (now - this.lastAiAction < this.aiCooldown) return;
        
        // 检测玩家远程攻击并尝试传送回旋斩
        if (this.shouldTeleportSlash()) {
            this.startTeleportSlash();
            return;
        }
        
        const distanceToPlayer = this.getDistanceToPlayer();
        
        // 决策AI行动
        if (distanceToPlayer > 100 && distanceToPlayer < 250) {
            // 中等距离：可能开始突进攻击或回旋镖攻击
            const actionChance = Math.random();
            if (actionChance < 0.4) {
                this.startDashAttack();
            } else if (actionChance < 0.7 && this.canUseBoomerangAttack()) {
                this.startBoomerangForm();
            }
        }
        
        // 不在特殊能力状态时，一直冲刺向玩家
        if (this.aiMode === 'normal') {
            this.chargeTowardsPlayer();
        }
    }
    
    // 冲刺向玩家
    chargeTowardsPlayer() {
        if (!game.player) return;
        const chargeTC = getBossTargetCenter();
        if (!chargeTC) return;
        const playerCenterX = chargeTC.x;
        const playerCenterY = chargeTC.y;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const dx = playerCenterX - bossCenterX;
        const dy = playerCenterY - bossCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // 设置冲刺速度朝向玩家
            const chargeSpeed = this.speed * 1.2; // 比普通移动稍快
            this.vx = (dx / distance) * chargeSpeed;
            this.vy = (dy / distance) * chargeSpeed;
        }
    }
    
    // 获取与玩家的距离
    getDistanceToPlayer() {
        return getDistanceFromBoss(this);
    }
    
    // 检查是否应该传送回旋斩（检测玩家远程攻击）
    shouldTeleportSlash() {
        if (!this.canTeleportSlash) return false;
        
        const now = Date.now();
        if (now - this.lastTeleportSlash < this.teleportSlashCooldown) return false;
        
        // 检测是否有子弹或导弹朝向Boss
        const hasIncomingProjectiles = this.detectIncomingProjectiles();
        
        if (hasIncomingProjectiles && Math.random() < 0.8) { // 80%概率传送回旋斩
            return true;
        }
        
        return false;
    }
    
    // 检测incoming projectiles
    detectIncomingProjectiles() {
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const detectionRange = 150;
        
        // 检查子弹
        if (game.bullets) {
            for (const bullet of game.bullets) {
                const distance = Math.sqrt(
                    Math.pow(bullet.x - bossCenterX, 2) + 
                    Math.pow(bullet.y - bossCenterY, 2)
                );
                if (distance < detectionRange) {
                    return true;
                }
            }
        }
        
        // 检查导弹
        if (game.missiles) {
            for (const missile of game.missiles) {
                if (missile.currentTarget === this) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // 开始突进攻击
    startDashAttack() {
        this.aiMode = 'dash_attack';
        this.dashCount = 0;
        this.lastAiAction = Date.now();
        this.performDash();
    }
    
    // 执行单次突进
    performDash() {
        if (!game.player || this.dashCount >= this.maxDashCount) {
            this.finishDashAttack();
            return;
        }
        
        this.isDashing = true;
        this.dashStartTime = Date.now();
        this.dashCount++;
        
        const dashTC = getBossTargetCenter();
        if (!dashTC) return;
        const playerX = dashTC.x;
        const playerY = dashTC.y;
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 30;
        
        this.dashTarget = {
            x: playerX + Math.cos(angle) * distance,
            y: playerY + Math.sin(angle) * distance
        };
        
        // 计算突进方向
        const dx = this.dashTarget.x - (this.x + this.width / 2);
        const dy = this.dashTarget.y - (this.y + this.height / 2);
        const distance_to_target = Math.sqrt(dx * dx + dy * dy);
        
        if (distance_to_target > 0) {
            this.vx = (dx / distance_to_target) * this.dashSpeed;
            this.vy = (dy / distance_to_target) * this.dashSpeed;
        }
    }
    
    // 更新突进攻击
    updateDashAttack() {
        if (this.isDashing) {
            const elapsed = Date.now() - this.dashStartTime;
            if (elapsed > this.dashDuration) {
                this.isDashing = false;
                this.vx = 0;
                this.vy = 0;
                
                // 短暂停顿后进行下一次突进或结束
                setTimeout(() => {
                    if (this.dashCount < this.maxDashCount) {
                        this.performDash();
                    } else {
                        this.finishDashAttack();
                    }
                }, 300);
            }
        }
    }
    
    // 结束突进攻击并进行回旋斩
    finishDashAttack() {
        this.aiMode = 'normal';
        this.dashCount = 0;
        this.performSpinSlash();
    }
    
    // 开始传送回旋斩
    startTeleportSlash() {
        this.aiMode = 'teleport_slash';
        this.lastTeleportSlash = Date.now();
        this.lastAiAction = Date.now();
        
        // 传送到玩家身后
        this.teleportBehindPlayer();
        
        // 立即进行回旋斩
        setTimeout(() => {
            this.performSpinSlash();
            this.aiMode = 'normal';
        }, 100);
    }
    
    // 传送到玩家身后
    teleportBehindPlayer() {
        if (!game.player) return;
        
        const playerX = game.player.x + game.player.width / 2;
        const playerY = game.player.y + game.player.height / 2;
        
        // 计算玩家移动方向，传送到相反方向
        const playerVx = game.player.vx || 0;
        const playerVy = game.player.vy || 0;
        
        let angle;
        if (playerVx !== 0 || playerVy !== 0) {
            angle = Math.atan2(playerVy, playerVx) + Math.PI; // 相反方向
        } else {
            angle = Math.random() * Math.PI * 2; // 随机方向
        }
        
        const distance = 120; // 玩家身后120像素（增加距离）
        this.x = playerX + Math.cos(angle) * distance - this.width / 2;
        this.y = playerY + Math.sin(angle) * distance - this.height / 2;
        
        // 创建传送特效
        this.createTeleportEffect();
    }
    
    // 更新传送回旋斩（占位符）
    updateTeleportSlash() {
        // 传送回旋斩的更新逻辑在startTeleportSlash中处理
    }
    
    // 执行回旋斩（简化版）
    performSpinSlash() {
        const distanceToPlayer = this.getDistanceToPlayer();
        
        if (distanceToPlayer <= 70) { // 攻击范围
            // 两段攻击
            game.player.takeDamage(this.spinSlashDamagePhase1);
            
            setTimeout(() => {
                if (this.getDistanceToPlayer() <= 70) {
                    game.player.takeDamage(this.spinSlashDamagePhase2);
                }
            }, 300);
            
            // 创建回旋斩特效
            this.createSpinSlashEffect(1);
            setTimeout(() => {
                this.createSpinSlashEffect(2);
            }, 300);
            
            updateUI();
        }
    }
    
    // 创建传送特效
    createTeleportEffect() {
        if (!game.teleportEffects) {
            game.teleportEffects = [];
        }
        
        const effect = {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            startTime: Date.now(),
            duration: 300
        };
        
        game.teleportEffects.push(effect);
    }
    
    // 创建回旋斩视觉效果
    createSpinSlashEffect(phase) {
        if (!game.spinSlashEffects) {
            game.spinSlashEffects = [];
        }
        
        const effect = {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            phase: phase,
            startTime: Date.now(),
            duration: 500,
            radius: phase === 1 ? 40 : 60
        };
        
        game.spinSlashEffects.push(effect);
    }
    
    // 检查是否可以使用回旋镖攻击
    canUseBoomerangAttack() {
        const now = Date.now();
        return now - this.lastBoomerangAttack > this.boomerangAttackCooldown;
    }
    
    // 开始回旋镖形态
    startBoomerangForm() {
        this.isBoomerangForm = true;
        this.boomerangFormStartTime = Date.now();
        this.lastBoomerangAttack = Date.now();
        this.lastAiAction = Date.now();
        
        // 创建5个月牙形回旋镖
        this.createBoomerangs();
        
        // 隐藏本体（变成透明）
        this.alpha = 0.1;
    }
    
    // 创建回旋镖
    createBoomerangs() {
        this.boomerangs = [];
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const radius = 80; // 围绕Boss的半径
        
        for (let i = 0; i < this.boomerangCount; i++) {
            const angle = (Math.PI * 2 / this.boomerangCount) * i;
            const boomerang = {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                angle: angle,
                orbitRadius: radius,
                orbitSpeed: 0.03, // 轨道旋转速度
                attackTarget: null,
                isAttacking: false,
                attackStartTime: 0,
                attackDuration: 2000, // 攻击持续2秒
                damage: 30,
                hasHitPlayer: false,
                returnToOrbit: false,
                returnSpeed: 0.1
            };
            this.boomerangs.push(boomerang);
        }
        
        // 开始回旋镖攻击序列
        this.startBoomerangAttackSequence();
    }
    
    // 开始回旋镖攻击序列
    startBoomerangAttackSequence() {
        let attackIndex = 0;
        const attackInterval = 800; // 每800ms发射一个回旋镖
        
        const launchNextBoomerang = () => {
            if (attackIndex < this.boomerangs.length && this.isBoomerangForm) {
                this.launchBoomerang(attackIndex);
                attackIndex++;
                
                if (attackIndex < this.boomerangs.length) {
                    setTimeout(launchNextBoomerang, attackInterval);
                }
            }
        };
        
        launchNextBoomerang();
    }
    
    // 发射单个回旋镖
    launchBoomerang(index) {
        if (index >= this.boomerangs.length || !game.player) return;
        
        const boomerang = this.boomerangs[index];
        boomerang.isAttacking = true;
        boomerang.attackStartTime = Date.now();
        boomerang.hasHitPlayer = false;
        
        const boomTC = getBossTargetCenter();
        if (!boomTC) return;
        const playerX = boomTC.x;
        const playerY = boomTC.y;
        const playerVx = boomTC.entity.vx || 0;
        const playerVy = boomTC.entity.vy || 0;
        
        boomerang.attackTarget = {
            x: playerX + playerVx * 0.5, // 0.5秒预测
            y: playerY + playerVy * 0.5
        };
    }
    
    // 更新回旋镖形态
    updateBoomerangForm() {
        const now = Date.now();
        const elapsed = now - this.boomerangFormStartTime;
        
        // 检查是否结束回旋镖形态
        if (elapsed > this.boomerangFormDuration) {
            this.endBoomerangForm();
            return;
        }
        
        // 更新每个回旋镖
        this.boomerangs.forEach(boomerang => {
            this.updateBoomerang(boomerang);
        });
        
        // 检查回旋镖与玩家的碰撞
        this.checkBoomerangCollisions();
    }
    
    // 更新单个回旋镖
    updateBoomerang(boomerang) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        if (boomerang.isAttacking && !boomerang.returnToOrbit) {
            // 攻击模式：朝向目标移动
            const elapsed = Date.now() - boomerang.attackStartTime;
            
            if (elapsed > boomerang.attackDuration) {
                // 攻击时间结束，开始返回轨道
                boomerang.returnToOrbit = true;
            } else {
                // 继续朝向目标移动
                const dx = boomerang.attackTarget.x - boomerang.x;
                const dy = boomerang.attackTarget.y - boomerang.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
                    const speed = 150; // 回旋镖攻击速度（像素/秒）
                    const moveDistance = speed * (1/60); // 假设60FPS
                    boomerang.x += (dx / distance) * moveDistance;
                    boomerang.y += (dy / distance) * moveDistance;
                }
            }
        } else if (boomerang.returnToOrbit) {
            // 返回轨道模式
            const targetX = centerX + Math.cos(boomerang.angle) * boomerang.orbitRadius;
            const targetY = centerY + Math.sin(boomerang.angle) * boomerang.orbitRadius;
            
            const dx = targetX - boomerang.x;
            const dy = targetY - boomerang.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 5) {
                // 回到轨道位置
                boomerang.x = targetX;
                boomerang.y = targetY;
                boomerang.returnToOrbit = false;
                boomerang.isAttacking = false;
            } else {
                // 继续返回
                boomerang.x += dx * boomerang.returnSpeed;
                boomerang.y += dy * boomerang.returnSpeed;
            }
        } else {
            // 轨道模式：围绕Boss旋转
            boomerang.angle += boomerang.orbitSpeed;
            boomerang.x = centerX + Math.cos(boomerang.angle) * boomerang.orbitRadius;
            boomerang.y = centerY + Math.sin(boomerang.angle) * boomerang.orbitRadius;
        }
    }
    
    // 检查回旋镖碰撞
    checkBoomerangCollisions() {
        if (!game.player) return;
        
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        this.boomerangs.forEach(boomerang => {
            if (boomerang.isAttacking && !boomerang.hasHitPlayer) {
                const distance = Math.sqrt(
                    Math.pow(boomerang.x - playerCenterX, 2) + 
                    Math.pow(boomerang.y - playerCenterY, 2)
                );
                
                if (distance < 25) { // 碰撞检测范围
                    boomerang.hasHitPlayer = true;
                    game.player.takeDamage(boomerang.damage);
                    updateUI();
                    
                    // 创建回旋镖命中特效
                    this.createBoomerangHitEffect(boomerang.x, boomerang.y);
                }
            }
        });
    }
    
    // 创建回旋镖命中特效
    createBoomerangHitEffect(x, y) {
        if (!game.boomerangHitEffects) {
            game.boomerangHitEffects = [];
        }
        
        const effect = {
            x: x,
            y: y,
            startTime: Date.now(),
            duration: 300
        };
        
        game.boomerangHitEffects.push(effect);
    }
    
    // 结束回旋镖形态
    endBoomerangForm() {
        this.isBoomerangForm = false;
        this.boomerangs = [];
        this.alpha = 1.0; // 恢复本体可见性
        this.aiMode = 'normal';
    }

    update() {
        // 检查硬直状态
        if (this.stunned) {
            if (Date.now() >= this.stunEndTime) {
                this.stunned = false;
            } else {
                // 硬直期间不能移动和行动
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        // 检查是否被长枪扎穿
        if (this.isImpaled && this.impaledBy) {
            // 被扎穿时不能自主移动，跟随长枪移动
            // 速度会由长枪武器控制
            super.update();
            this.checkBounds();
            return;
        }
        
        // 冰之姬保持静止，只在特定情况下瞬移
        this.vx = 0;
        this.vy = 0;
        
        this.tryHeal();
        
        // 检查回旋斩攻击
        this.checkSpinSlashAttack();
        
        // 检查瞬移攻击
        this.checkTeleportAttack();
        
        // 检查分身召唤（分身会发射追踪弹）
        this.checkCloneSummon();
        
        // 检查导弹瞬移
        this.checkMissileTeleport();
        
        // 检查子弹瞬移
        this.checkBulletTeleport();

        super.update();
        this.checkBounds();
    }
    
    // 检查回旋斩攻击
    checkSpinSlashAttack() {
        if (!game.player || this.isSpinSlashing) return;
        
        const now = Date.now();
        if (now - this.lastSpinSlash < this.spinSlashCooldown) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 优先检查导弹防御：如果导弹靠近且瞬移冷却中，使用回旋斩打掉导弹
        const isTeleportOnCooldown = (now - this.lastTeleport < this.teleportCooldown);
        if (isTeleportOnCooldown && game.missiles && game.missiles.length > 0) {
            for (const missile of game.missiles) {
                const distanceToMissile = Math.sqrt(
                    Math.pow(missile.x - bossCenterX, 2) + 
                    Math.pow(missile.y - bossCenterY, 2)
                );
                
                // 导弹在120像素内且瞬移冷却时，立刻回旋斩
                if (distanceToMissile <= 120) {
                    this.performSpinSlash();
                    return; // 执行回旋斩后立即返回
                }
            }
        }
        
        const slashTC = getBossTargetCenter();
        if (!slashTC) return;
        const playerCenterX = slashTC.x;
        const playerCenterY = slashTC.y;
        
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        const pvx = slashTarget ? (slashTarget.vx || 0) : (game.player.vx || 0);
        const pvy = slashTarget ? (slashTarget.vy || 0) : (game.player.vy || 0);
        const playerSpeed = Math.sqrt(pvx * pvx + pvy * pvy);
        const extendedRange = this.spinSlashRange + Math.max(playerSpeed * 1.5, 10); // 根据玩家速度扩展检测范围，最少增加10像素
        
        // 如果玩家在扩展范围内，立即执行回旋斩（非常激进的检测）
        if (distance <= extendedRange) {
            this.performSpinSlash();
        }
    }
    
    // 执行回旋斩
    performSpinSlash() {
        this.isSpinSlashing = true;
        this.lastSpinSlash = Date.now();
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 回旋斩可以打掉范围内的导弹
        if (game.missiles && game.missiles.length > 0) {
            for (let i = game.missiles.length - 1; i >= 0; i--) {
                const missile = game.missiles[i];
                const distanceToMissile = Math.sqrt(
                    Math.pow(missile.x - bossCenterX, 2) + 
                    Math.pow(missile.y - bossCenterY, 2)
                );
                
                // 回旋斩可以摧毁更大范围内的导弹（120像素，与导弹检测范围一致）
                if (distanceToMissile <= 120) {
                    game.missiles.splice(i, 1); // 移除导弹
                }
            }
        }
        
        // 对玩家造成伤害和僵直效果
        if (game.player) {
            const playerDistance = Math.sqrt(
                Math.pow(game.player.x + game.player.width / 2 - bossCenterX, 2) + 
                Math.pow(game.player.y + game.player.height / 2 - bossCenterY, 2)
            );
            
            // 只有玩家在回旋斩范围内才受伤害
            if (playerDistance <= this.spinSlashRange) {
                game.player.takeDamage(this.spinSlashDamagePhase1); // 造成12点伤害
                game.player.setStunned(400); // 0.4秒僵直
                updateUI(); // 更新界面显示
            }
        }
        
        // 创建回旋斩视觉效果
        this.createSpinSlashEffect('phase1');
        
        // 设置回旋斩结束时间
        setTimeout(() => {
            this.isSpinSlashing = false;
        }, 150); // 回旋斩持续0.15秒，允许快速连续攻击
    }
    
    // 检查瞬移攻击
    checkTeleportAttack() {
        if (!game.player || this.isSpinSlashing) return;
        
        const now = Date.now();
        
        // 取消保护期，允许立即瞬移
        // if (now - this.spawnTime < this.teleportProtectionTime) return;
        
        // 检查瞬移冷却
        if (now - this.lastTeleport < this.teleportCooldown) return;
        
        const teleTC = getBossTargetCenter();
        if (!teleTC) return;
        const playerCenterX = teleTC.x;
        const playerCenterY = teleTC.y;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        if (distance > this.teleportRange) {
            this.performTeleport();
        }
    }
    
    // 执行瞬移到玩家背后
    performTeleport() {
        if (!game.player) return;
        
        this.lastTeleport = Date.now();
        
        // 创建瞬移前的特效
        this.createTeleportEffect(this.x + this.width / 2, this.y + this.height / 2, 'departure');
        
        const tpTC = getBossTargetCenter();
        if (!tpTC) return;
        const playerCenterX = tpTC.x;
        const playerCenterY = tpTC.y;
        
        const playerDirection = game.player.direction * Math.PI / 180; // 转换为弧度
        
        // 在玩家背后120像素的位置出现（增加距离）
        const behindDistance = 120;
        const behindAngle = playerDirection + Math.PI; // 背后就是朝向+180度
        
        const newX = playerCenterX + Math.cos(behindAngle) * behindDistance - this.width / 2;
        const newY = playerCenterY + Math.sin(behindAngle) * behindDistance - this.height / 2;
        
        // 确保瞬移位置在屏幕范围内
        this.x = Math.max(0, Math.min(GAME_CONFIG.WIDTH - this.width, newX));
        this.y = Math.max(0, Math.min(GAME_CONFIG.HEIGHT - this.height, newY));
        
        // 创建瞬移后的特效
        this.createTeleportEffect(this.x + this.width / 2, this.y + this.height / 2, 'arrival');
    }
    
    // 创建瞬移特效
    createTeleportEffect(x, y, type) {
        // 确保特效数组存在
        if (!game.teleportEffects) {
            game.teleportEffects = [];
        }
        
        // 根据类型创建不同的特效
        const effect = {
            x: x,
            y: y,
            type: type, // 'departure' 或 'arrival'
            startTime: Date.now(),
            duration: 500, // 0.5秒特效时间
            radius: 0,
            maxRadius: type === 'departure' ? 50 : 40,
            color: '#4682B4', // 青蓝色
            alpha: 1.0
        };
        
        game.teleportEffects.push(effect);
    }
    
    // 检查月牙追踪弹攻击
    checkCrescentBulletAttack() {
        if (!game.player || this.isSpinSlashing) return;
        
        const now = Date.now();
        if (now - this.lastCrescentBullet < this.crescentBulletCooldown) return;
        
        const cbTC = getBossTargetCenter();
        if (!cbTC) return;
        const cbTX = cbTC.x;
        const cbTY = cbTC.y;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(cbTX - bossCenterX, 2) + 
            Math.pow(cbTY - bossCenterY, 2)
        );
        
        if (distance >= this.safeAttackRangeMin && distance <= this.safeAttackRangeMax) {
            this.fireCrescentBullets();
        }
    }
    
    // 发射月牙追踪弹
    fireCrescentBullets() {
        if (!game.player) return;
        
        this.lastCrescentBullet = Date.now();
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        // 确保月牙弹数组存在
        if (!game.crescentBullets) {
            game.crescentBullets = [];
        }
        
        // 发射5颗月牙弹，呈扇形散布
        const crescentTC = getBossTargetCenter();
        if (!crescentTC) return;
        for (let i = 0; i < this.crescentBulletsPerSalvo; i++) {
            const spreadAngle = (i - 2) * (Math.PI / 8);
            const playerCenterX = crescentTC.x;
            const playerCenterY = crescentTC.y;
            const baseAngle = Math.atan2(playerCenterY - bossCenterY, playerCenterX - bossCenterX);
            const bulletAngle = baseAngle + spreadAngle;
            
            // 计算发射位置（从Boss边缘）
            const launchDistance = this.width / 2 + 15;
            const launchX = bossCenterX + Math.cos(bulletAngle) * launchDistance;
            const launchY = bossCenterY + Math.sin(bulletAngle) * launchDistance;
            
            // 创建月牙弹
            const crescentBullet = new CrescentBullet(
                launchX, 
                launchY, 
                playerCenterX, 
                playerCenterY, 
                this.crescentBulletDamage, 
                this.crescentBulletSpeed
            );
            
            game.crescentBullets.push(crescentBullet);
        }
    }
    
    // 检查分身召唤
    checkCloneSummon() {
        if (!game.player || !this.canSummonClones) return;
        
        const now = Date.now();
        if (now - this.lastCloneSummon < this.cloneSummonCooldown) return;
        
        // 召唤分身
        this.summonClones();
        this.lastCloneSummon = now;
    }
    
    // 召唤4个分身围绕玩家
    summonClones() {
        if (!game.player) return;
        
        // 确保分身数组存在
        if (!game.iceClones) {
            game.iceClones = [];
        }
        
        // 清除旧的分身
        game.iceClones = [];
        
        const spawnTC = getBossTargetCenter();
        if (!spawnTC) return;
        const playerCenterX = spawnTC.x;
        const playerCenterY = spawnTC.y;
        const radius = 250;
        
        // 创建4个分身，等距分布在玩家周围
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI * 2) / 4; // 90度间隔
            const cloneX = playerCenterX + Math.cos(angle) * radius - 17.5; // 减去分身宽度的一半
            const cloneY = playerCenterY + Math.sin(angle) * radius - 17.5; // 减去分身高度的一半
            
            // 确保分身不超出游戏边界
            const boundedX = Math.max(0, Math.min(GAME_CONFIG.WIDTH - 35, cloneX));
            const boundedY = Math.max(0, Math.min(GAME_CONFIG.HEIGHT - 35, cloneY));
            
            const clone = new IceClone(boundedX, boundedY, angle, radius);
            game.iceClones.push(clone);
        }
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
    
    // 被长枪扎穿 (SublimeMoon版本)
    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        // 停止当前移动
        this.vx = 0;
        this.vy = 0;
    }
    
    // 释放扎穿状态并进入硬直 (SublimeMoon版本)
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
        this.health -= damage;
        
        // 添加受击提示
        this.addHitIndicator(damage);
        
        return this.health <= 0; // 返回是否死亡
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
            
            // 绘制青色的受击文字（冰之姬主题）
            ctx.fillStyle = '#00CCFF';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            
            const displayY = indicator.y - offsetY;
            const text = `HIT ${indicator.damage}`;
            
            // 绘制文字描边（白色）
            ctx.strokeText(text, indicator.x, displayY);
            // 绘制文字填充（青色）
            ctx.fillText(text, indicator.x, displayY);
            
            ctx.restore();
        });
    }

    draw(ctx) {
        // 保存当前上下文
        ctx.save();
        
        // 设置透明度（回旋镖形态时本体变透明）
        if (this.alpha !== undefined) {
            ctx.globalAlpha = this.alpha;
        }
        
        // 绘制Boss主体（青蓝色大色块）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 青蓝色边框表示冰之姬
        ctx.strokeStyle = '#00CCFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 恢复上下文（重置透明度）
        ctx.restore();
        
        // 绘制Boss推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制血量条
        const barWidth = this.width;
        const barHeight = 6;
        const barY = this.y - 12;
        
        // 背景（灰色）
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // 血量（青色到蓝色渐变）
        const healthRatio = this.health / this.maxHealth;
        const blue = Math.floor(255 * healthRatio);
        const green = Math.floor(200 * healthRatio);
        ctx.fillStyle = `rgb(0, ${green}, ${blue})`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // Boss标识
        ctx.fillStyle = '#00CCFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('冰之姬', this.x + this.width/2, this.y - 16);
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
        
        // 被扎穿状态视觉效果 (冰之姬版本)
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
        
        // 硬直状态视觉效果 (冰之姬版本)
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 绘制青色硬直效果 (Boss更大)
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 锁定标识：青色跳动倒三角
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
        
        // 绘制回旋斩状态效果
        if (this.isSpinSlashing) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 绘制青蓝色回旋斩光环
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            const radius = this.spinSlashRange;
            
            // 创建旋转效果
            const time = Date.now() * 0.01;
            ctx.strokeStyle = '#4682B4';
            ctx.lineWidth = 5;
            ctx.setLineDash([10, 5]);
            ctx.lineDashOffset = time * 10;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // 绘制内圈光环
            ctx.strokeStyle = '#87CEEB';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -time * 15;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.setLineDash([]);
            ctx.restore();
        }

        // 绘制回旋镖
        if (this.isBoomerangForm && this.boomerangs) {
            this.drawBoomerangs(ctx);
        }
    }
    
    // 绘制回旋镖
    drawBoomerangs(ctx) {
        this.boomerangs.forEach(boomerang => {
            ctx.save();
            
            // 月牙形回旋镖绘制
            ctx.translate(boomerang.x, boomerang.y);
            
            // 计算回旋镖的旋转角度
            let rotation = Date.now() * 0.01; // 持续旋转
            if (boomerang.isAttacking) {
                // 攻击时根据移动方向旋转
                if (boomerang.attackTarget) {
                    const dx = boomerang.attackTarget.x - boomerang.x;
                    const dy = boomerang.attackTarget.y - boomerang.y;
                    rotation = Math.atan2(dy, dx);
                }
            }
            ctx.rotate(rotation);
            
            // 绘制月牙形状
            ctx.strokeStyle = '#00CCFF';
            ctx.fillStyle = 'rgba(70, 130, 180, 0.8)';
            ctx.lineWidth = 2;
            
            // 月牙形路径
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI); // 上半圆
            ctx.arc(0, -3, 8, Math.PI, 0, true); // 下半月牙
            ctx.closePath();
            
            ctx.fill();
            ctx.stroke();
            
            // 添加青蓝色光效
            if (boomerang.isAttacking) {
                ctx.shadowColor = '#00CCFF';
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            
            ctx.restore();
        });
    }
    
    // 绘制Boss推进器火焰效果 - 冰之姬专属火箭推进器（青蓝色主题）
    drawThrusterFlames(ctx) {
        // 检查是否有移动
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;
        
        // 计算移动方向
        const moveAngle = Math.atan2(this.vy, this.vx);
        
        // 冰之姬火箭推进器参数（简化版本，青蓝色主题）
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
        
        // 绘制多个巨大的并排推进器喷射口（青蓝色主题）
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
            
            // 绘制外层火焰（青蓝到青白渐变）
            const outerGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            if (this.isDodging) {
                // Boss闪避时的炽热青蓝火焰
                outerGradient.addColorStop(0, 'rgba(70, 130, 180, 1.0)');   // 钢蓝色
                outerGradient.addColorStop(0.2, 'rgba(0, 191, 255, 0.95)'); // 深天蓝
                outerGradient.addColorStop(0.5, 'rgba(0, 206, 209, 0.85)'); // 暗青色
                outerGradient.addColorStop(0.8, 'rgba(175, 238, 238, 0.6)'); // 苍白青绿
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');    // 透明白
            } else {
                // Boss普通移动时的青蓝火焰
                outerGradient.addColorStop(0, 'rgba(65, 105, 225, 0.9)');   // 皇家蓝
                outerGradient.addColorStop(0.3, 'rgba(0, 149, 182, 0.8)');  // 深青色
                outerGradient.addColorStop(0.6, 'rgba(72, 209, 204, 0.7)'); // 中青绿
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');    // 透明白
            }
            
            ctx.strokeStyle = outerGradient;
            ctx.lineWidth = outerWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // 绘制内层火焰（白色/青白色高温核心）
            const coreEndX = startX + Math.cos(thrusterAngle) * (currentFlameLength * 0.6);
            const coreEndY = startY + Math.sin(thrusterAngle) * (currentFlameLength * 0.6);
            
            const innerGradient = ctx.createLinearGradient(startX, startY, coreEndX, coreEndY);
            if (this.isDodging) {
                // Boss闪避时的白热核心
                innerGradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');   // 纯白色
                innerGradient.addColorStop(0.4, 'rgba(240, 248, 255, 0.9)'); // 爱丽丝蓝
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');     // 透明白
            } else {
                // Boss普通时的高温核心
                innerGradient.addColorStop(0, 'rgba(224, 255, 255, 0.9)');   // 淡青色
                innerGradient.addColorStop(0.5, 'rgba(240, 248, 255, 0.7)'); // 爱丽丝蓝
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');     // 透明白
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
    
    // 绘制冰之姬火箭火焰粒子效果（青蓝色主题）
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
            
            // 冰之姬火焰粒子颜色 - 青蓝色主调，根据距离渐变
            let red, green, blue;
            if (distanceRatio < 0.25) {
                // 近处：钢蓝色
                red = 70 + distanceRatio * 60;   // 70到130
                green = 130 + distanceRatio * 50; // 130到180
                blue = 180 + distanceRatio * 75; // 180到255
            } else if (distanceRatio < 0.6) {
                // 中间：青色
                red = 0 + (distanceRatio - 0.25) * 72;  // 0到72
                green = 180 + (distanceRatio - 0.25) * 75; // 180到255
                blue = 255; // 保持255
            } else {
                // 远处：青白色
                red = 72 + (distanceRatio - 0.6) * 183;   // 72到255
                green = 255; // 保持255
                blue = 255; // 保持255
            }
            
            ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
            ctx.fillRect(x - size/2, y - size/2, size, size);
            
            // 添加一些白色高温粒子（核心区域）
            if (Math.random() < 0.3 && distanceRatio < 0.3) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                const whiteSize = size * 0.6;
                ctx.fillRect(x - whiteSize/2, y - whiteSize/2, whiteSize, whiteSize);
            }
            
            // 冰之姬专属：青蓝色月光效果（远距离粒子）
            if (Math.random() < 0.15 && distanceRatio > 0.7) {
                ctx.fillStyle = `rgba(70, 130, 180, ${alpha * 0.4})`;
                const moonSize = size * 1.5;
                ctx.fillRect(x - moonSize/2, y - moonSize/2, moonSize, moonSize);
            }
        }
    }

    drawLockIndicator(ctx) {
        drawBossLockIndicator(ctx, this, '#00CCFF', 'white');
    }
} 

// 冰之姬分身类 - 外观与冰之姬相同但无功能
class IceClone extends GameObject {
    constructor(x, y, relativeAngle, radius) {
        super(x, y, 35, 35, '#4682B4'); // 和冰之姬相同的尺寸和颜色
        this.alpha = 0.8; // 略微透明以示区别
        this.canBeTargeted = false; // 无法被锁定
        this.health = 0; // 无血量
        this.maxHealth = 0;
        this.isClone = true; // 标记为分身
        
        // 相对位置系统
        this.relativeAngle = relativeAngle; // 相对于玩家的角度
        this.radius = radius; // 与玩家的距离
        
        // 月牙弹发射系统
        this.crescentBulletDamage = 15; // 分身发射的月牙弹伤害
        this.crescentBulletSpeed = 10; // 分身月牙弹速度
        this.fireTimer = 0; // 发射计时器
        this.fireInterval = 1500; // 每1.5秒发射一次
        this.lastFire = 0;
        
        // 生存时间
        this.lifetime = 8000; // 8秒后消失
        this.spawnTime = Date.now();
    }
    
    update() {
        const now = Date.now();
        
        // 检查是否超过生存时间
        if (now - this.spawnTime > this.lifetime) {
            this.shouldRemove = true;
            return;
        }
        
        if (game.player) {
            const followTC = getBossTargetCenter();
            const playerCenterX = followTC ? followTC.x : this.x;
            const playerCenterY = followTC ? followTC.y : this.y;
            
            // 根据相对角度和半径计算新位置
            const newX = playerCenterX + Math.cos(this.relativeAngle) * this.radius - this.width / 2;
            const newY = playerCenterY + Math.sin(this.relativeAngle) * this.radius - this.height / 2;
            
            // 确保分身不超出游戏边界
            this.x = Math.max(0, Math.min(GAME_CONFIG.WIDTH - this.width, newX));
            this.y = Math.max(0, Math.min(GAME_CONFIG.HEIGHT - this.height, newY));
        }
        
        // 定期向玩家发射月牙弹
        if (now - this.lastFire > this.fireInterval && game.player) {
            this.fireCrescentBullet();
            this.lastFire = now;
        }
        
        super.update();
    }
    
    // 发射月牙追踪弹
    fireCrescentBullet() {
        if (!game.player) return;
        
        if (!game.crescentBullets) {
            game.crescentBullets = [];
        }
        
        const cloneFireTC = getBossTargetCenter();
        if (!cloneFireTC) return;
        const playerCenterX = cloneFireTC.x;
        const playerCenterY = cloneFireTC.y;
        const cloneCenterX = this.x + this.width / 2;
        const cloneCenterY = this.y + this.height / 2;
        
        // 创建月牙弹
        const crescentBullet = new CrescentBullet(
            cloneCenterX,
            cloneCenterY,
            playerCenterX,
            playerCenterY,
            this.crescentBulletDamage,
            this.crescentBulletSpeed
        );
        
        game.crescentBullets.push(crescentBullet);
    }
    
    // 分身不受伤害
    takeDamage(damage) {
        return false; // 不受伤害
    }
    
    draw(ctx) {
        // 保存当前上下文
        ctx.save();
        
        // 设置透明度
        ctx.globalAlpha = this.alpha;
        
        // 绘制主体（和冰之姬相同的外观）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 青蓝色边框
        ctx.strokeStyle = '#00CCFF';
        ctx.lineWidth = 2; // 稍细的边框表示是分身
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 分身标识（小字）
        ctx.fillStyle = '#87CEEB';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('分身', this.x + this.width/2, this.y - 8);
        
        // 恢复上下文
        ctx.restore();
    }
} 
