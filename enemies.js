// 敌人类
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
        
        // 机雷系统
        this.minePlacementInterval = 500; // 0.5秒放置一颗机雷
        this.lastMinePlacementTime = 0;
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
        
        this.vx = Math.cos(perpendicularAngle) * this.dodgeSpeed;
        this.vy = Math.sin(perpendicularAngle) * this.dodgeSpeed;
    }

    // 检查导弹闪避
    checkMissileDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.missiles || game.missiles.length === 0) return;

        const enemyCenterX = this.x + this.width / 2;
        const enemyCenterY = this.y + this.height / 2;
        const missileDodgeDistance = 120; // 导弹距离120像素内时触发闪避

        for (const missile of game.missiles) {
            // 计算导弹到敌人的距离
            const distanceToMissile = Math.sqrt(
                Math.pow(missile.x - enemyCenterX, 2) + 
                Math.pow(missile.y - enemyCenterY, 2)
            );

            // 只有导弹足够接近时才考虑闪避
            if (distanceToMissile > missileDodgeDistance) continue;

            // 检查导弹是否正在追踪这个敌人
            const isTargetingThisEnemy = missile.currentTarget === this;
            
            // 计算导弹的当前飞行方向
            const missileSpeed = Math.sqrt(missile.vx * missile.vx + missile.vy * missile.vy);
            if (missileSpeed === 0) continue;

            // 检查导弹是否朝着敌人飞行
            const toEnemyX = enemyCenterX - missile.x;
            const toEnemyY = enemyCenterY - missile.y;
            const dotProduct = toEnemyX * missile.vx + toEnemyY * missile.vy;
            
            // 如果导弹不是朝着敌人飞行，跳过
            if (dotProduct <= 0) continue;

            // 计算导弹轨迹与敌人的预测碰撞距离
            const missileRange = Math.sqrt(toEnemyX * toEnemyX + toEnemyY * toEnemyY);
            
            // 调整闪避概率：如果导弹正在追踪这个敌人，闪避概率更高
            let adjustedDodgeChance = this.missileDodgeChance || this.dodgeChance;
            
            if (isTargetingThisEnemy) {
                adjustedDodgeChance *= 2.5; // 被追踪时闪避概率提高150%
            }
            
            // 距离越近，闪避概率越高
            const distanceMultiplier = Math.max(0.5, 1 - (distanceToMissile / missileDodgeDistance));
            adjustedDodgeChance *= (1 + distanceMultiplier);
            
            // 限制最大闪避概率
            adjustedDodgeChance = Math.min(adjustedDodgeChance, 0.8);

            if (Math.random() < adjustedDodgeChance) {
                this.startMissileDodge(missile);
                break;
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
        
        const enemyCenterX = this.x + this.width / 2;
        const enemyCenterY = this.y + this.height / 2;
        
        // 计算从导弹指向敌人的方向
        const awayFromMissileX = enemyCenterX - missile.x;
        const awayFromMissileY = enemyCenterY - missile.y;
        const awayDistance = Math.sqrt(awayFromMissileX * awayFromMissileX + awayFromMissileY * awayFromMissileY);
        
        if (awayDistance > 0) {
            // 向远离导弹的方向闪避，添加一些随机性
            const baseAngle = Math.atan2(awayFromMissileY, awayFromMissileX);
            const randomOffset = (Math.random() - 0.5) * Math.PI / 3; // ±30度随机偏移
            const dodgeAngle = baseAngle + randomOffset;
            
            // 使用更高的闪避速度来躲避导弹
            const missileDodgeSpeed = this.dodgeSpeed * 1.5;
            this.vx = Math.cos(dodgeAngle) * missileDodgeSpeed;
            this.vy = Math.sin(dodgeAngle) * missileDodgeSpeed;
        }
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
        
        // 闪避系统优先处理
        this.checkDodge();  // 近战闪避
        this.checkBulletDodge();  // 子弹闪避
        this.checkMissileDodge();  // 导弹闪避
        this.updateDodge();
        
        // 如果正在闪避，跳过正常AI行为
        if (!this.isDodging) {
            // 增强AI：更频繁的随机方向改变
            this.changeDirectionTimer++;
            if (this.changeDirectionTimer > this.directionChangeInterval) {
                this.setRandomDirection();
                this.changeDirectionTimer = 0;
            }
            
            // 有概率进行微调方向（增加移动的不规律性）
            if (Math.random() < 0.02) { // 2%概率
                const angleAdjust = (Math.random() - 0.5) * 0.5; // 小幅度角度调整
                const currentAngle = Math.atan2(this.vy, this.vx);
                const newAngle = currentAngle + angleAdjust;
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                
                this.vx = Math.cos(newAngle) * currentSpeed;
                this.vy = Math.sin(newAngle) * currentSpeed;
            }
        }

        // 边界反弹
        if (this.x <= 0 || this.x + this.width >= GAME_CONFIG.WIDTH) {
            this.vx = -this.vx;
        }
        if (this.y <= 0 || this.y + this.height >= GAME_CONFIG.HEIGHT) {
            this.vy = -this.vy;
        }

        super.update();
        this.checkBounds();
        
        // 机雷放置逻辑
        this.checkMinePlacement();
    }
    
    // 被长枪扎穿
    getImpaled(weapon) {
        this.isImpaled = true;
        this.impaledBy = weapon;
        // 停止当前移动
        this.vx = 0;
        this.vy = 0;
    }
    
    // 释放扎穿状态并进入硬直
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
        return this.health <= 0; // 返回是否死亡
    }

    draw(ctx) {
        // 绘制敌人主体（简单色块）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制血量条
        const barWidth = this.width;
        const barHeight = 4;
        const barY = this.y - 8;
        
        // 背景（灰色）
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // 血量（红色到绿色渐变）
        const healthRatio = this.health / this.maxHealth;
        const red = Math.floor(255 * (1 - healthRatio));
        const green = Math.floor(255 * healthRatio);
                ctx.fillStyle = `rgb(${red}, ${green}, 0)`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // 被扎穿状态视觉效果
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
            ctx.fillText(t('boss.pierce'), this.x + this.width/2, this.y - 15);
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 硬直状态视觉效果
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
        
        // 锁定标识：红色跳动倒三角
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
    }

    // 绘制推进器火焰效果（敌人版本）
    drawThrusterFlames(ctx) {
        // 检查是否有移动
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;
        
        // 计算移动方向
        const moveAngle = Math.atan2(this.vy, this.vx);
        
        // 火焰参数（增强可见性）
        let flameLength, flameWidth, flameAlpha, flameCount;
        
        if (this.isDodging) {
            // 闪避时的大火焰
            flameLength = 35;
            flameWidth = 10;
            flameAlpha = 0.9;
            flameCount = 3;
        } else {
            // 普通移动时的火焰
            flameLength = 18;
            flameWidth = 6;
            flameAlpha = 0.8;
            flameCount = 2;
        }
        
        // 绘制火焰
        for (let i = 0; i < flameCount; i++) {
            const offsetAngle = (i - (flameCount - 1) / 2) * 0.4; // 火焰散开角度
            const currentAngle = moveAngle + Math.PI + offsetAngle; // 相反方向
            
            // 火焰起始位置（从敌人边缘开始）
            const startDistance = this.width / 2 + 1;
            const startX = this.x + this.width / 2 + Math.cos(currentAngle) * startDistance;
            const startY = this.y + this.height / 2 + Math.sin(currentAngle) * startDistance;
            
            // 火焰结束位置
            const endX = startX + Math.cos(currentAngle) * flameLength;
            const endY = startY + Math.sin(currentAngle) * flameLength;
            
            // 绘制火焰渐变（敌人用红橙色调）
            const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
            if (this.isDodging) {
                // 闪避时的亮红火焰
                gradient.addColorStop(0, `rgba(255, 100, 100, ${flameAlpha})`); // 亮红色
                gradient.addColorStop(0.5, `rgba(255, 150, 100, ${flameAlpha * 0.8})`); // 橙红
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // 透明白
            } else {
                // 普通移动时的暗红火焰
                gradient.addColorStop(0, `rgba(200, 50, 50, ${flameAlpha})`); // 暗红色
                gradient.addColorStop(0.5, `rgba(220, 80, 50, ${flameAlpha * 0.8})`); // 深橙红
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // 透明白
            }
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = flameWidth - i; // 每条火焰稍微细一点
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    }
    
    drawLockIndicator(ctx) {
        // 计算跳动效果
        const time = Date.now();
        const bounce = Math.sin(time * 0.01) * 3; // 3像素的上下跳动
        
        // 倒三角的位置（敌人头顶上方）
        const triangleX = this.x + this.width / 2;
        const triangleY = this.y - 15 + bounce;
        const size = 8;
        
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
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    checkMinePlacement() {
        const now = Date.now();
        if (now - this.lastMinePlacementTime >= this.minePlacementInterval) {
            this.placeMine();
            this.lastMinePlacementTime = now;
        }
    }
    
    placeMine() {
        if (!game.mines) {
            game.mines = [];
        }
        
        // 在敌人当前位置放置一颗机雷
        game.mines.push(new Mine(this.x, this.y));
    }
}

// 精英敌人类
class EliteEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.width = 35;
        this.height = 35;
        this.color = '#4B0082'; // 紫色，区分普通敌人
        this.maxHealth = 30;
        this.health = this.maxHealth;
        this.directionChangeInterval = 30 + Math.random() * 60; // 精英敌人改变方向更频繁
        this.dodgeChance = 0.35; // 35%近战闪避概率（提高）
        this.missileDodgeChance = 0.32; // 32%导弹闪避概率（精英怪对导弹更敏感）
        this.dodgeCooldown = 700; // 精英敌人闪避冷却时间稍短：0.7秒
        this.setRandomDirection(); // 重新设置初始方向以使用精英参数
    }

    setRandomDirection() {
        // 精英敌人移动更快
        const angle = Math.random() * Math.PI * 2;
        const speed = GAME_CONFIG.ENEMY_SPEED * 1.3 * (0.9 + Math.random() * 0.2); // 比普通敌人快30%
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // 精英敌人方向改变更频繁
        this.directionChangeInterval = 30 + Math.random() * 60; // 30-90帧之间
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
                GameObject.prototype.update.call(this);
                this.checkBounds();
                return;
            }
        }
        
        // 检查是否被长枪扎穿
        if (this.isImpaled && this.impaledBy) {
            // 被扎穿时不能自主移动，跟随长枪移动
            // 速度会由长枪武器控制
            GameObject.prototype.update.call(this);
            this.checkBounds();
            return;
        }
        
        // 闪避系统优先处理
        this.checkDodge();  // 近战闪避
        this.checkBulletDodge();  // 子弹闪避 (继承自父类)
        this.updateDodge();
        
        // 如果正在闪避，跳过正常AI行为
        if (!this.isDodging) {
            // 精英敌人有更高的微调概率
            this.changeDirectionTimer++;
            if (this.changeDirectionTimer > this.directionChangeInterval) {
                this.setRandomDirection();
                this.changeDirectionTimer = 0;
            }
            
            // 精英敌人有更高的方向微调概率
            if (Math.random() < 0.04) { // 4%概率，比普通敌人高
                const angleAdjust = (Math.random() - 0.5) * 0.7; // 更大的角度调整
                const currentAngle = Math.atan2(this.vy, this.vx);
                const newAngle = currentAngle + angleAdjust;
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                
                this.vx = Math.cos(newAngle) * currentSpeed;
                this.vy = Math.sin(newAngle) * currentSpeed;
            }
        }

        // 边界反弹
        if (this.x <= 0 || this.x + this.width >= GAME_CONFIG.WIDTH) {
            this.vx = -this.vx;
        }
        if (this.y <= 0 || this.y + this.height >= GAME_CONFIG.HEIGHT) {
            this.vy = -this.vy;
        }

        GameObject.prototype.update.call(this); // 调用GameObject的update方法
        this.checkBounds();
    }

    draw(ctx) {
        // 绘制精英敌人主体（简单紫色色块）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制金色边框表示精英
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 绘制推进器火焰效果（继承自父类）
        this.drawThrusterFlames(ctx);
        
        // 绘制血量条
        const barWidth = this.width;
        const barHeight = 4;
        const barY = this.y - 8;
        
        // 背景（灰色）
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // 血量（红色到绿色渐变）
        const healthRatio = this.health / this.maxHealth;
        const red = Math.floor(255 * (1 - healthRatio));
        const green = Math.floor(255 * healthRatio);
        ctx.fillStyle = `rgb(${red}, ${green}, 0)`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // 精英标识
        ctx.fillStyle = 'gold';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(t('enemy.elite'), this.x + this.width/2, this.y - 12);
        
        // 锁定标识：红色跳动倒三角（继承自父类）
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
    }
}
