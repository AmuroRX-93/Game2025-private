// 基础敌人类
class Enemy extends GameObject {
    constructor(x, y) {
        super(x, y, 25, 25, '#8B4513');
        this.maxHealth = 5;
        this.health = this.maxHealth;
        this.changeDirectionTimer = 0;
        this.directionChangeInterval = 40 + Math.random() * 80; // 40-120帧之间随机
        
        // 闪避系统
        this.dodgeChance = 0.20; // 20%近战闪避概率
        this.missileDodgeChance = 0.12; // 12%导弹闪避概率（普通敌人对导弹反应一般）
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200; // 0.2秒
        this.dodgeSpeed = 15; // 15单位/秒
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0; // 上次闪避时间
        this.dodgeCooldown = 800; // 全局闪避冷却时间：0.8秒
        
        // 扎穿系统
        this.isImpaled = false; // 是否被长枪扎穿
        this.impaledBy = null; // 扎穿的武器引用
        this.stunned = false; // 是否硬直
        this.stunEndTime = 0; // 硬直结束时间
        
        this.setRandomDirection();
    }

    setRandomDirection() {
        // 8个方向移动（包括对角线）
        const angle = Math.random() * Math.PI * 2; // 随机角度
        const speed = GAME_CONFIG.ENEMY_SPEED * (0.8 + Math.random() * 0.4); // 速度有一些随机性
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // 重新设置下次改变方向的时间间隔
        this.directionChangeInterval = 40 + Math.random() * 80; // 40-120帧之间
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
        if (target !== this) return; // 玩家没有锁定这个敌人
        
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
        
        // 计算从敌人指向玩家的角度
        const playerX = game.player.x + game.player.width / 2;
        const playerY = game.player.y + game.player.height / 2;
        const enemyX = this.x + this.width / 2;
        const enemyY = this.y + this.height / 2;
        
        const dx = playerX - enemyX;
        const dy = playerY - enemyY;
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

    // 检测并躲避子弹
    checkBulletDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.bullets || game.bullets.length === 0) return;

        const enemyCenterX = this.x + this.width / 2;
        const enemyCenterY = this.y + this.height / 2;
        const dodgeDistance = 80; // 子弹距离80像素内时触发闪避

        for (const bullet of game.bullets) {
            const bulletCenterX = bullet.x + bullet.width / 2;
            const bulletCenterY = bullet.y + bullet.height / 2;
            
            // 计算子弹到敌人的当前距离
            const currentDistance = Math.sqrt(
                Math.pow(bulletCenterX - enemyCenterX, 2) + 
                Math.pow(bulletCenterY - enemyCenterY, 2)
            );

            // 只有子弹足够接近时才考虑闪避
            if (currentDistance > dodgeDistance) continue;

            const bulletVx = bullet.vx || 0;
            const bulletVy = bullet.vy || 0;
            
            if (bulletVx === 0 && bulletVy === 0) continue;

            // 检查子弹是否朝着敌人飞行
            const toBulletX = bulletCenterX - enemyCenterX;
            const toBulletY = bulletCenterY - enemyCenterY;
            const dotProduct = toBulletX * bulletVx + toBulletY * bulletVy;
            
            // 如果子弹不是朝着敌人飞行，跳过
            if (dotProduct > 0) continue;

            // 计算子弹轨迹与敌人的最短距离
            const bulletSpeed = Math.sqrt(bulletVx * bulletVx + bulletVy * bulletVy);
            if (bulletSpeed === 0) continue;

            // 从子弹位置到敌人位置的向量
            const toEnemyX = enemyCenterX - bulletCenterX;
            const toEnemyY = enemyCenterY - bulletCenterY;

            // 子弹方向的单位向量
            const bulletDirX = bulletVx / bulletSpeed;
            const bulletDirY = bulletVy / bulletSpeed;

            // 计算敌人在子弹轨迹上的投影点
            const projectionLength = toEnemyX * bulletDirX + toEnemyY * bulletDirY;
            const projectionX = bulletCenterX + projectionLength * bulletDirX;
            const projectionY = bulletCenterY + projectionLength * bulletDirY;

            // 计算敌人到子弹轨迹的垂直距离
            const perpendicularDistance = Math.sqrt(
                Math.pow(enemyCenterX - projectionX, 2) + 
                Math.pow(enemyCenterY - projectionY, 2)
            );

            // 如果垂直距离小于阈值，且子弹正在靠近，进行闪避
            if (perpendicularDistance < 25 && projectionLength > 0) { // 子弹轨迹会击中敌人
                if (Math.random() < this.dodgeChance) {
                    this.startBulletDodge(bulletVx, bulletVy);
                    break;
                }
            }
        }
    }

    // 开始子弹闪避
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
        
        // 添加一些随机变化，避免完全垂直闪避
        const angleVariation = (Math.random() - 0.5) * Math.PI / 6; // ±15度随机变化
        const dodgeAngle = perpendicularAngle + angleVariation;
        
        this.vx = Math.cos(dodgeAngle) * this.dodgeSpeed;
        this.vy = Math.sin(dodgeAngle) * this.dodgeSpeed;
    }

    // 检测并躲避导弹
    checkMissileDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.missiles || game.missiles.length === 0) return;

        const enemyCenterX = this.x + this.width / 2;
        const enemyCenterY = this.y + this.height / 2;
        const dodgeDistance = 120; // 导弹距离120像素内时触发闪避

        for (const missile of game.missiles) {
            const missileCenterX = missile.x + missile.width / 2;
            const missileCenterY = missile.y + missile.height / 2;
            
            // 计算导弹到敌人的当前距离
            const currentDistance = Math.sqrt(
                Math.pow(missileCenterX - enemyCenterX, 2) + 
                Math.pow(missileCenterY - enemyCenterY, 2)
            );

            // 只有导弹足够接近时才考虑闪避
            if (currentDistance > dodgeDistance) continue;

            const missileVx = missile.vx || 0;
            const missileVy = missile.vy || 0;
            
            if (missileVx === 0 && missileVy === 0) continue;

            // 检查导弹是否朝着敌人飞行
            const toMissileX = missileCenterX - enemyCenterX;
            const toMissileY = missileCenterY - enemyCenterY;
            const dotProduct = toMissileX * missileVx + toMissileY * missileVy;
            
            // 如果导弹不是朝着敌人飞行，跳过
            if (dotProduct > 0) continue;

            // 计算导弹轨迹与敌人的最短距离
            const missileSpeed = Math.sqrt(missileVx * missileVx + missileVy * missileVy);
            if (missileSpeed === 0) continue;

            // 从导弹位置到敌人位置的向量
            const toEnemyX = enemyCenterX - missileCenterX;
            const toEnemyY = enemyCenterY - missileCenterY;

            // 导弹方向的单位向量
            const missileDirX = missileVx / missileSpeed;
            const missileDirY = missileVy / missileSpeed;

            // 计算敌人在导弹轨迹上的投影点
            const projectionLength = toEnemyX * missileDirX + toEnemyY * missileDirY;
            const projectionX = missileCenterX + projectionLength * missileDirX;
            const projectionY = missileCenterY + projectionLength * missileDirY;

            // 计算敌人到导弹轨迹的垂直距离
            const perpendicularDistance = Math.sqrt(
                Math.pow(enemyCenterX - projectionX, 2) + 
                Math.pow(enemyCenterY - projectionY, 2)
            );

            // 如果垂直距离小于阈值，且导弹正在靠近，进行闪避
            if (perpendicularDistance < 30 && projectionLength > 0) { // 导弹轨迹会击中敌人
                if (Math.random() < this.missileDodgeChance) {
                    this.startMissileDodge(missile);
                    break;
                }
            }
        }
    }

    // 开始导弹闪避
    startMissileDodge(missile) {
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        // 计算导弹飞行方向的角度
        const missileAngle = Math.atan2(missile.vy, missile.vx);
        
        // 计算垂直于导弹方向的闪避角度（左右各50%概率）
        const perpendicularAngle = missileAngle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        
        // 添加一些随机变化，避免完全垂直闪避
        const angleVariation = (Math.random() - 0.5) * Math.PI / 6; // ±15度随机变化
        const dodgeAngle = perpendicularAngle + angleVariation;
        
        this.vx = Math.cos(dodgeAngle) * this.dodgeSpeed;
        this.vy = Math.sin(dodgeAngle) * this.dodgeSpeed;
    }

    update() {
        // 扎穿状态处理
        if (this.isImpaled) {
            super.update();
            return;
        }
        
        // 硬直状态处理
        if (this.stunned) {
            const now = Date.now();
            if (now >= this.stunEndTime) {
                this.stunned = false;
            } else {
                this.vx = 0;
                this.vy = 0;
                super.update();
                return;
            }
        }
        
        // 闪避系统
        this.checkDodge();
        this.updateDodge();
        this.checkBulletDodge();
        this.checkMissileDodge();
        
        // 正常移动
        if (!this.isDodging) {
            // 随机改变方向
            this.changeDirectionTimer++;
            if (this.changeDirectionTimer >= this.directionChangeInterval) {
                this.setRandomDirection();
                this.changeDirectionTimer = 0;
            }
        }
        
        super.update();
        
        // 边界检查
        if (this.x <= 0 || this.x + this.width >= GAME_CONFIG.WIDTH) {
            this.vx = -this.vx;
        }
        if (this.y <= 0 || this.y + this.height >= GAME_CONFIG.HEIGHT) {
            this.vy = -this.vy;
        }
    }
    
    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        this.vx = 0;
        this.vy = 0;
    }
    
    releaseImpale() {
        this.isImpaled = false;
        this.impaledBy = null;
    }
    
    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0; // 返回是否死亡
    }
    
    draw(ctx) {
        // 扎穿状态的特殊绘制
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.restore();
            return;
        }
        
        // 硬直状态的视觉效果
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 闪避状态的视觉效果
        if (this.isDodging) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#00FFFF';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.restore();
        }
        
        // 正常绘制
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制锁定指示器
        this.drawLockIndicator(ctx);
    }
    
    drawThrusterFlames(ctx) {
        // 根据移动方向绘制推进器火焰
        if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
            const moveAngle = Math.atan2(this.vy, this.vx);
            const flameLength = 8;
            
            // 计算火焰起点（敌人中心）
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            
            // 计算火焰终点（与移动方向相反）
            const flameEndX = centerX - Math.cos(moveAngle) * flameLength;
            const flameEndY = centerY - Math.sin(moveAngle) * flameLength;
            
            // 绘制火焰
            ctx.save();
            ctx.strokeStyle = '#FF6B35';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(flameEndX, flameEndY);
            ctx.stroke();
            ctx.restore();
        }
    }
    
    drawLockIndicator(ctx) {
        // 检查是否被玩家锁定
        if (game.player) {
            const target = game.player.getCurrentTarget();
            if (target === this) {
                // 绘制锁定指示器
                ctx.save();
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(this.x - 5, this.y - 5, this.width + 10, this.height + 10);
                ctx.setLineDash([]);
                ctx.restore();
            }
        }
    }
}

// 精英敌人类
class EliteEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.maxHealth = 15;
        this.health = this.maxHealth;
        this.color = '#FF4500'; // 橙色
        
        // 精英敌人更强的闪避能力
        this.dodgeChance = 0.35; // 35%近战闪避概率
        this.missileDodgeChance = 0.25; // 25%导弹闪避概率
    }
    
    setRandomDirection() {
        // 精英敌人移动更快
        const angle = Math.random() * Math.PI * 2;
        const speed = GAME_CONFIG.ENEMY_SPEED * 1.2 * (0.8 + Math.random() * 0.4);
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        this.directionChangeInterval = 30 + Math.random() * 60; // 30-90帧之间
    }
    
    update() {
        super.update();
        
        // 精英敌人特殊行为
        if (game.player) {
            const dx = game.player.x - this.x;
            const dy = game.player.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 如果距离玩家太远，会主动追击
            if (distance > 200 && !this.isDodging) {
                const angle = Math.atan2(dy, dx);
                const speed = GAME_CONFIG.ENEMY_SPEED * 1.1;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
            }
        }
    }
    
    draw(ctx) {
        // 精英敌人有特殊的外观
        ctx.save();
        
        // 主体
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 精英标识
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 中心标识
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x + this.width/2 - 2, this.y + this.height/2 - 2, 4, 4);
        
        ctx.restore();
        
        // 绘制推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制锁定指示器
        this.drawLockIndicator(ctx);
    }
} 