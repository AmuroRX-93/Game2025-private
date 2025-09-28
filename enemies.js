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
            ctx.fillText('扎穿!', this.x + this.width/2, this.y - 15);
            
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
        ctx.fillText('精英', this.x + this.width/2, this.y - 12);
        
        // 锁定标识：红色跳动倒三角（继承自父类）
        if (game.player && (gameState.lockMode === 'soft' || gameState.lockMode === 'hard')) {
            const lockedTarget = game.player.getCurrentTarget();
            if (lockedTarget === this) {
                this.drawLockIndicator(ctx);
            }
        }
    }
}

// Boss类
class Boss extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 50, '#8B0000'); // 深红色，更大尺寸
        this.maxHealth = 300;
        this.health = this.maxHealth;
        this.speed = 40; // 血红之王：40单位每秒
        this.setRandomDirection();
        this.lastDirectionChange = 0;
        this.directionChangeInterval = 2000; // 2秒改变一次方向
        
        // Boss闪避系统
        this.dodgeChance = 0.20; // 20%近战闪避概率
        this.missileDodgeChance = 0.80; // 80%导弹闪避概率（血红之王对导弹威胁反应很强）
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200; // 0.2秒
        this.dodgeSpeed = 30; // 血红之王：30单位/秒回避速度
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
        
        // Boss导弹系统 - 基于时间的自动发射
        this.missileDamage = 6; // 每枚导弹6点伤害（翻倍）
        this.missilesPerSalvo = 60; // 每次发射60枚导弹（翻倍）
        this.missileSpeed = 24; // 导弹飞行速度（翻倍）
        this.launchDelay = 25; // 导弹发射间隔（毫秒）- 血红之王发射更快（减半）
        this.missileCooldown = 500; // 0.5秒导弹冷却时间
        this.firstLaunchDelay = 300; // 第一次发射延迟0.3秒
        this.spawnTime = Date.now(); // Boss生成时间
        this.lastLaunchCompleteTime = 0; // 上次发射完成时间
        this.isLaunchingMissiles = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
        this.hasLaunchedFirst = false; // 是否已经发射过第一轮
        
        // 受击提示系统
        this.hitIndicators = []; // 存储多个受击提示
        this.hitIndicatorDuration = 600; // 受击提示持续时间：0.6秒
    }

    setRandomDirection() {
        this.vx = (Math.random() - 0.5) * 2 * this.speed;
        this.vy = (Math.random() - 0.5) * 2 * this.speed;
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
        
        // Boss闪避系统优先处理
        this.checkDodge();  // 近战闪避
        this.checkBulletDodge();  // 子弹闪避
        this.checkMissileDodge();  // 导弹闪避
        this.updateDodge();
        
        // Boss导弹发射系统
        this.checkMissileLaunch();
        this.updateMissileLaunch();
        
        // 如果正在闪避，跳过正常AI行为
        if (!this.isDodging) {
            // 保持原来的随机移动模式，让Boss能在全图范围内打出弹幕
            if (Date.now() - this.lastDirectionChange > this.directionChangeInterval) {
                this.setRandomDirection();
                this.lastDirectionChange = Date.now();
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
        
        // 智能边界处理：如果Boss太靠近边缘，让它向中央移动
        this.handleSmartBoundary();
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
        // 找到玩家作为目标
        if (game.player) {
            this.currentTarget = game.player;
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
        // 检查与玩家的碰撞
        if (game.player) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const bulletCenterX = this.x + this.width / 2;
            const bulletCenterY = this.y + this.height / 2;
            
            const distance = Math.sqrt(
                Math.pow(playerCenterX - bulletCenterX, 2) + 
                Math.pow(playerCenterY - bulletCenterY, 2)
            );
            
            if (distance < 20) { // 碰撞检测半径
                // 对玩家造成伤害和僵直
                game.player.takeDamage(this.damage);
                game.player.setStunned(450); // 0.45秒僵直
                updateUI();
                this.shouldDestroy = true;
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
        
        // 计算与玩家的距离
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
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
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 添加一些随机散布，使导弹不会完全重叠
        const spreadAngle = (Math.random() - 0.5) * Math.PI / 6; // ±30度散布
        const baseAngle = Math.atan2(playerCenterY - bossCenterY, playerCenterX - bossCenterX);
        const missileAngle = baseAngle + spreadAngle;
        
        // 计算导弹发射位置（从Boss边缘发射）
        const launchDistance = this.width / 2 + 10;
        const launchX = bossCenterX + Math.cos(missileAngle) * launchDistance;
        const launchY = bossCenterY + Math.sin(missileAngle) * launchDistance;
        
        // 计算目标位置（玩家当前位置 + 一些预测）
        const playerVx = game.player.vx || 0;
        const playerVy = game.player.vy || 0;
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
        
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
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
        if (!game.player) return Infinity;
        
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        return Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
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
        
        // 计算突进目标（玩家附近随机位置）
        const playerX = game.player.x + game.player.width / 2;
        const playerY = game.player.y + game.player.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const distance = 40 + Math.random() * 30; // 玩家周围40-70像素
        
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
        
        // 设置攻击目标为玩家当前位置 + 预测
        const playerX = game.player.x + game.player.width / 2;
        const playerY = game.player.y + game.player.height / 2;
        const playerVx = game.player.vx || 0;
        const playerVy = game.player.vy || 0;
        
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
        
        // 常规玩家距离检查
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        // 增加预判范围，考虑玩家的移动速度
        const playerSpeed = Math.sqrt(game.player.vx * game.player.vx + game.player.vy * game.player.vy);
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
        
        // 计算与玩家的距离
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        // 如果玩家距离太远，执行瞬移
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
        
        // 计算玩家背后的位置
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 获取玩家的朝向（从玩家的direction属性）
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
        
        // 计算与玩家的距离
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        
        // 如果玩家在安全攻击区域内，发射月牙追踪弹
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
        for (let i = 0; i < this.crescentBulletsPerSalvo; i++) {
            const spreadAngle = (i - 2) * (Math.PI / 8); // -π/4到π/4的扇形散布
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
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
        
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const radius = 250; // 围绕玩家的半径（增加距离）
        
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
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 跳动效果
        const time = Date.now() * 0.008;
        const bounce = Math.sin(time) * 3;
        const y = this.y - 40 + bounce;
        
        // 绘制青色跳动倒三角
        ctx.fillStyle = '#00CCFF';
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX - 10, y - 15);
        ctx.lineTo(centerX + 10, y - 15);
        ctx.closePath();
        ctx.fill();
        
        // 添加白色边框使其更醒目
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2; // Boss的边框更粗
        ctx.stroke();
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
        
        // 跟随玩家移动，保持相对位置
        if (game.player) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            
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
        
        // 确保月牙弹数组存在
        if (!game.crescentBullets) {
            game.crescentBullets = [];
        }
        
        // 计算向玩家的方向
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
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
        // 浮游炮的更新逻辑（类似原来的attacking状态）
        const now = Date.now();
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
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
        
        // 镭射碰撞检测
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        const laserDx = Math.cos(angle);
        const laserDy = Math.sin(angle);
        
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
        
        // 添加镭射视觉效果
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
        
        this.spawnTime = Date.now(); // 记录生成时间
        
        // 机雷系统
        this.minePlacementInterval = 500; // 0.5秒放置一颗机雷
        this.lastMinePlacementTime = 0;
    }
    
    // 机雷放置检查
    checkMinePlacement() {
        const now = Date.now();
        if (now - this.lastMinePlacementTime >= this.minePlacementInterval) {
            console.log('StarDevourer放置地雷');
            this.placeMine();
            this.lastMinePlacementTime = now;
        }
    }
    
    // 放置机雷
    placeMine() {
        if (!game.mines) {
            game.mines = [];
        }
        
        // 在Boss当前位置放置一颗机雷
        game.mines.push(new Mine(this.x, this.y));
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
                const playerCenterX = game.player.x + game.player.width / 2;
                const playerCenterY = game.player.y + game.player.height / 2;
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
        
        // 更新光束步枪
        this.updateBeamRifle();
        
        // 更新导弹反转系统（二阶段）
        this.updateMissileReversal();
        
        // 闪避系统检测
        this.checkDodge(); // 近战闪避
        this.checkMissileDodge(); // 导弹闪避
        this.checkBulletDodge(); // 子弹闪避（新增）
        this.updateDodge(); // 更新闪避状态（新增）
        
        // 更新受击提示
        this.updateHitIndicators();
        
        super.update();
        this.checkBounds();
        
        // 智能边界处理：如果Boss太靠近边缘，让它向中央移动
        this.handleSmartBoundary();
        
        // 机雷放置逻辑
        this.checkMinePlacement();
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
        if (!this.missileReversal.enabled || !game.missiles) return;
        
        const now = Date.now();
        
        // 检测玩家导弹发射
        if (game.missiles.length > 0) {
            // 检查是否有新的导弹发射（通过比较导弹数量变化）
            const currentMissileCount = game.missiles.length;
            
            // 如果导弹数量增加，说明有新导弹发射
            if (currentMissileCount > this.missileReversal.lastMissileCount) {
                this.missileReversal.lastMissileLaunchTime = now;
                this.missileReversal.lastMissileCount = currentMissileCount;
            }
        }
        
        // 检查是否到了反转时间
        if (this.missileReversal.lastMissileLaunchTime > 0 && 
            now - this.missileReversal.lastMissileLaunchTime >= this.missileReversal.reversalDelay) {
            
            // 反转导弹
            this.reverseMissiles();
            
            // 重置发射时间，避免重复反转
            this.missileReversal.lastMissileLaunchTime = 0;
            this.missileReversal.lastMissileCount = game.missiles.length;
        }
    }
    
    // 反转导弹
    reverseMissiles() {
        if (!game.missiles || game.missiles.length === 0) return;
        
        // 只反转玩家导弹，不反转Boss导弹
        const playerMissiles = game.missiles.filter(missile => !missile.isBossMissile);
        
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
        
        // 将导弹标记为紫色（反转状态）
        missile.isReversed = true;
        missile.color = '#800080'; // 紫色
        
        // 反转导弹方向，使其攻击玩家
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 计算从导弹到玩家的方向
        const dx = playerCenterX - missile.x;
        const dy = playerCenterY - missile.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // 设置导弹速度为攻击玩家的方向
            missile.vx = (dx / distance) * missile.maxSpeed;
            missile.vy = (dy / distance) * missile.maxSpeed;
            
            // 更新目标为玩家
            missile.targetX = playerCenterX;
            missile.targetY = playerCenterY;
            missile.currentTarget = game.player;
            
            // 重置导弹的追踪时间，使其有更强的追踪能力
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
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
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
            // 如果没有历史记录，返回当前位置
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
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 简化碰撞检测：检查玩家中心是否接近光束路径
        const beamDx = Math.cos(this.beamRifle.targetAngle);
        const beamDy = Math.sin(this.beamRifle.targetAngle);
        
        // 计算玩家相对于Boss的位置
        const playerDx = playerCenterX - bossCenterX;
        const playerDy = playerCenterY - bossCenterY;
        
        // 计算玩家在光束方向上的投影
        const projectionLength = playerDx * beamDx + playerDy * beamDy;
        
        // 检查投影是否在有效范围内
        if (projectionLength > 0 && projectionLength <= this.beamRifle.range) {
            // 计算玩家到光束路径的垂直距离
            const projectionX = bossCenterX + beamDx * projectionLength;
            const projectionY = bossCenterY + beamDy * projectionLength;
            
            const distanceToBeam = Math.sqrt(
                Math.pow(playerCenterX - projectionX, 2) + 
                Math.pow(playerCenterY - projectionY, 2)
            );
            
            // 检查是否在光束宽度内
            if (distanceToBeam <= this.beamRifle.width / 2 + 10) { // 增加一些容差
                // 命中玩家
                game.player.takeDamage(this.beamRifle.damage);
                game.player.setStunned(700); // 0.7秒僵直
                updateUI();
                // 停止发射避免重复伤害
                this.beamRifle.isFiring = false;
                this.beamRifle.lastFire = Date.now();
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
                    // 动态阵型追踪模式：每炮后重新追踪玩家，射击前后静止
                    const now = Date.now();
                    const playerCenterX = game.player.x + game.player.width / 2;
                    const playerCenterY = game.player.y + game.player.height / 2;
                    
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
        
        const laserRange = 500; // 增加射程
        const laserWidth = 4;
        
        // 计算镭射终点
        const endX = ball.x + Math.cos(angle) * laserRange;
        const endY = ball.y + Math.sin(angle) * laserRange;
        
        // 检查玩家是否在镭射路径上
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 简化碰撞检测：点到线段的距离
        const laserDx = Math.cos(angle);
        const laserDy = Math.sin(angle);
        
        const playerDx = playerCenterX - ball.x;
        const playerDy = playerCenterY - ball.y;
        
        const projection = playerDx * laserDx + playerDy * laserDy;
        
        if (projection > 0 && projection <= laserRange) {
            const projX = ball.x + laserDx * projection;
            const projY = ball.y + laserDy * projection;
            
            const distanceToLaser = Math.sqrt(
                Math.pow(playerCenterX - projX, 2) + 
                Math.pow(playerCenterY - projY, 2)
            );
            
            if (distanceToLaser <= laserWidth + 10) { // 容差
                // 命中玩家
                game.player.takeDamage(15);
                game.player.setStunned(700); // 0.7秒僵直
                updateUI();
            }
        }
        
        // 添加镭射视觉效果
        ball.laserEffect = {
            endX: endX,
            endY: endY,
            angle: angle,
            startTime: Date.now(),
            duration: 300 // 0.3秒显示时间
        };
    }
    
    // 闪避系统（基础版本）
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
        this.lastDodgeTime = this.dodgeStartTime; // 更新全局闪避时间
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
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
    
    // 导弹闪避（基础版本）
    checkMissileDodge() {
        if (this.isDodging) return;
        
        // 检查全局闪避冷却时间
        const now = Date.now();
        if (now - this.lastDodgeTime < this.dodgeCooldown) return;
        
        if (!game.missiles || game.missiles.length === 0) return;

        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const missileDodgeDistance = 120; // 基础导弹闪避距离

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
    
    // 计算与玩家的距离（新增）
    getDistanceToPlayer() {
        if (!game.player) return Infinity;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        return Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
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
    
    // 绘制锁定指示器
    drawLockIndicator(ctx) {
        const centerX = this.x + this.width / 2;
        
        // 跳动效果
        const time = Date.now() * 0.008;
        const bounce = Math.sin(time) * 3;
        const y = this.y - 40 + bounce;
        
        // 绘制白色跳动倒三角
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX - 10, y - 15);
        ctx.lineTo(centerX + 10, y - 15);
        ctx.closePath();
        ctx.fill();
        
        // 添加黑色边框使其更醒目
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
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

// 丑皇Boss类 - 丑陋扭曲的混沌统治者
class UglyEmperor extends GameObject {
    constructor(x, y) {
        super(x, y, 21, 21, '#8B4513'); // 棕色基调，缩小尺寸（玩家的一半面积）
        
        // Boss基本属性
        this.maxHealth = 250; // 基础血量
        this.health = this.maxHealth;
        this.speed = 25; // 丑皇：25单位每秒（快速移动）
        this.setRandomDirection();
        this.lastDirectionChange = 0;
        this.directionChangeInterval = 2500; // 2.5秒改变一次方向
        
        // Boss闪避系统
        this.dodgeChance = 0.60; // 60%近战闪避概率
        this.missileDodgeChance = 0.70; // 70%导弹闪避概率
        this.bulletDodgeChance = 0.50; // 50%子弹闪避概率
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200; // 0.2秒
        this.dodgeSpeed = 25; // 丑皇：25单位/秒回避速度
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0; // 上次闪避时间
        this.dodgeCooldown = 700; // 闪避冷却时间：0.7秒
        
        // 扎穿系统
        this.isImpaled = false; // 是否被长枪扎穿
        this.impaledBy = null; // 扎穿的武器引用
        this.stunned = false; // 是否硬直
        this.stunEndTime = 0; // 硬直结束时间
        
        // 受击提示系统
        this.hitIndicators = [];
        
        // 丑皇特殊视觉效果
        this.distortionEffect = {
            intensity: 0.3, // 扭曲强度
            frequency: 0.02, // 扭曲频率
            offset: 0 // 扭曲偏移
        };
        
        // 混沌推进器粒子系统
        this.thrusterParticles = [];
        this.particleSpawnTimer = 0;
        this.particleSpawnInterval = 50; // 每50ms生成一个粒子
        
        // 混沌弹幕系统
        this.chaosBarrage = {
            enabled: false, // 是否启用混沌弹幕
            bulletDamage: 4, // 每发子弹4点伤害
            bulletSpeed: 28, // 子弹速度（大幅提升）
            bulletsPerWave: 8, // 每波8发子弹
            waveInterval: 800, // 波次间隔0.8秒
            lastWave: 0, // 上次发射时间
            bulletLifetime: 4000 // 子弹存活时间4秒
        };
        
        // 扭曲光环系统
        this.distortionAura = {
            radius: 80, // 光环半径（适应缩小后的尺寸）
            damage: 2, // 光环伤害
            pulseSpeed: 0.005, // 脉冲速度
            pulseOffset: 0 // 脉冲偏移
        };
        
        // 混沌传送系统
        this.chaosTeleport = {
            cooldown: 8000, // 8秒冷却
            lastUse: 0, // 上次使用时间
            teleportRange: 300, // 传送范围
            isTeleporting: false, // 是否正在传送
            teleportStartTime: 0, // 传送开始时间
            teleportDuration: 500 // 传送持续时间0.5秒
        };
        
        // 二阶段系统
        this.phaseTwo = {
            activated: false, // 是否已激活二阶段
            triggerHealth: 100, // 触发血量（五分之二）
            enhancedChaos: false, // 增强混沌模式
            permanentDistortion: false, // 永久扭曲效果
            lastMineClearTime: 0, // 上次清除地雷的时间
            // 燃烧瓶系统
            molotovSystem: {
                enabled: false, // 是否启用燃烧瓶
                cooldown: 3000, // 3秒冷却
                lastUse: 0, // 上次使用时间
                projectileSpeed: 15, // 燃烧瓶飞行速度
                rotationSpeed: 0.3, // 旋转速度
                explosionDelay: 1000 // 着地后1秒爆炸
            }
        };
        
        // 机雷系统
        this.mineSystem = {
            lastMineTime: 0, // 上次放置机雷的时间
            mineInterval: 500, // 每0.5秒放置一颗机雷
            mineCount: 0 // 已放置的机雷数量
        };
        
        this.spawnTime = Date.now(); // 记录生成时间
    }
    
    // 更新扭曲效果
    updateDistortionEffect() {
        this.distortionEffect.offset += this.distortionEffect.frequency;
        if (this.distortionEffect.offset >= Math.PI * 2) {
            this.distortionEffect.offset = 0;
        }
    }
    
    // 混沌弹幕攻击
    fireChaosBarrage() {
        if (!game.player) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 计算到玩家的角度
        const dx = playerCenterX - bossCenterX;
        const dy = playerCenterY - bossCenterY;
        const baseAngle = Math.atan2(dy, dx);
        
        // 发射多方向子弹
        for (let i = 0; i < this.chaosBarrage.bulletsPerWave; i++) {
            const angleOffset = (i * 2 * Math.PI) / this.chaosBarrage.bulletsPerWave;
            const angle = baseAngle + angleOffset;
            
            // 计算子弹目标位置
            const targetX = bossCenterX + Math.cos(angle) * 500;
            const targetY = bossCenterY + Math.sin(angle) * 500;
            
            // 创建混沌子弹
            const bullet = new ChaosBullet(
                bossCenterX, 
                bossCenterY, 
                targetX, 
                targetY, 
                this.chaosBarrage.bulletDamage, 
                this.chaosBarrage.bulletSpeed
            );
            
            // 确保混沌子弹数组存在
            if (!game.chaosBullets) {
                game.chaosBullets = [];
            }
            
            game.chaosBullets.push(bullet);
        }
    }
    
    // 混沌传送
    performChaosTeleport() {
        if (!game.player) return;
        
        const now = Date.now();
        if (now - this.chaosTeleport.lastUse < this.chaosTeleport.cooldown) {
            return;
        }
        
        // 计算传送目标位置（玩家附近随机位置）
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * this.chaosTeleport.teleportRange;
        
        const targetX = playerCenterX + Math.cos(angle) * distance;
        const targetY = playerCenterY + Math.sin(angle) * distance;
        
        // 确保传送位置在屏幕内
        const finalX = Math.max(50, Math.min(GAME_CONFIG.WIDTH - 100, targetX));
        const finalY = Math.max(50, Math.min(GAME_CONFIG.HEIGHT - 100, targetY));
        
        // 开始传送
        this.chaosTeleport.isTeleporting = true;
        this.chaosTeleport.teleportStartTime = now;
        this.chaosTeleport.lastUse = now;
        
        // 创建传送特效
        this.createTeleportEffect(this.x + this.width/2, this.y + this.height/2, 'start');
        
        // 延迟传送到目标位置
        setTimeout(() => {
            this.x = finalX - this.width / 2;
            this.y = finalY - this.height / 2;
            this.createTeleportEffect(finalX, finalY, 'end');
            
            // 结束传送
            setTimeout(() => {
                this.chaosTeleport.isTeleporting = false;
            }, 200);
        }, 300);
    }
    
    // 创建传送特效
    createTeleportEffect(x, y, type) {
        if (!game.teleportEffects) {
            game.teleportEffects = [];
        }
        
        game.teleportEffects.push({
            x: x,
            y: y,
            type: type,
            startTime: Date.now(),
            duration: 500,
            particles: [],
            isUglyEmperor: true // 标记为丑皇的传送特效
        });
    }
    
    // 更新二阶段
    updatePhaseTwo() {
        // 添加调试信息
        if (this.health <= 0) {
            console.log('警告：丑皇血量为负数或零：', this.health);
        }
        
        if (!this.phaseTwo.activated && this.health <= this.phaseTwo.triggerHealth) {
            console.log('触发二阶段！当前血量：', this.health, '触发阈值：', this.phaseTwo.triggerHealth);
            this.activatePhaseTwo();
        }
        
        if (this.phaseTwo.activated) {
            console.log('二阶段已激活，正在清除地雷...');
            // 二阶段增强效果
            this.chaosBarrage.bulletsPerWave = 12; // 增加子弹数量
            this.chaosBarrage.bulletSpeed = 35; // 二阶段进一步提升弹速
            this.chaosBarrage.waveInterval = 600; // 减少发射间隔
            this.chaosBarrage.bulletDamage = 2; // 二阶段伤害降低到原来的一半（从4降到2）
            this.distortionAura.radius = 100; // 增大光环半径（适应缩小后的尺寸）
            this.distortionAura.damage = 3; // 增加光环伤害
            
            // 二阶段每0.01秒清除所有地雷（简单粗暴）
            const now = Date.now();
            if (now - this.phaseTwo.lastMineClearTime >= 10) { // 10毫秒 = 0.01秒
                if (game.mines && game.mines.length > 0) {
                    console.log('清除地雷，原有数量：', game.mines.length);
                    game.mines = [];
                }
                this.phaseTwo.lastMineClearTime = now;
            }
        }
    }
    
    // 激活二阶段
    activatePhaseTwo() {
        console.log('丑皇进入二阶段！血量：', this.health, '位置：', this.x, this.y);
        this.phaseTwo.activated = true;
        this.phaseTwo.enhancedChaos = true;
        this.phaseTwo.permanentDistortion = true;
        
        // 清除所有已存在的地雷
        if (game.mines) {
            console.log('清除所有地雷，原有地雷数量：', game.mines.length);
            game.mines = [];
        }
        
        // 二阶段视觉效果
        this.color = '#4B0082'; // 变为深紫色
        this.distortionEffect.intensity = 0.5; // 增强扭曲效果
    }
    
    // 检查混沌弹幕发射
    checkChaosBarrage() {
        const now = Date.now();
        if (now - this.chaosBarrage.lastWave >= this.chaosBarrage.waveInterval) {
            this.fireChaosBarrage();
            this.chaosBarrage.lastWave = now;
        }
    }
    
    // 检查混沌传送
    checkChaosTeleport() {
        if (!this.chaosTeleport.isTeleporting) {
            this.performChaosTeleport();
        }
    }
    
    // 更新混沌传送状态
    updateChaosTeleport() {
        if (this.chaosTeleport.isTeleporting) {
            const now = Date.now();
            if (now - this.chaosTeleport.teleportStartTime >= this.chaosTeleport.teleportDuration) {
                this.chaosTeleport.isTeleporting = false;
            }
        }
    }
    
    // 检查机雷放置
    checkMinePlacement() {
        // 简单粗暴：不是二阶段才放地雷
        if (this.phaseTwo.activated) {
            console.log('二阶段已激活，跳过地雷放置');
            return; // 二阶段不放地雷
        }
        
        const now = Date.now();
        if (now - this.mineSystem.lastMineTime >= this.mineSystem.mineInterval) {
            console.log('放置地雷，当前血量：', this.health, '二阶段状态：', this.phaseTwo.activated);
            this.placeMine();
            this.mineSystem.lastMineTime = now;
            this.mineSystem.mineCount++;
        }
    }
    
    // 放置机雷
    placeMine() {
        if (!game.mines) {
            game.mines = [];
        }
        
        // 在丑皇当前位置放置机雷（使用丑皇的中心位置）
        const mineX = this.x + this.width / 2;
        const mineY = this.y + this.height / 2;
        const mine = new Mine(mineX, mineY);
        game.mines.push(mine);
    }
    
    // 检查燃烧瓶投掷
    checkMolotovThrow() {
        if (!this.phaseTwo.activated || !game.player) return;
        
        const now = Date.now();
        if (now - this.phaseTwo.molotovSystem.lastUse >= this.phaseTwo.molotovSystem.cooldown) {
            this.throwMolotov();
            this.phaseTwo.molotovSystem.lastUse = now;
        }
    }
    
    // 投掷燃烧瓶
    throwMolotov() {
        if (!game.player) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        // 预测玩家位置（根据玩家当前速度和方向）
        const playerSpeed = Math.sqrt(game.player.vx * game.player.vx + game.player.vy * game.player.vy);
        const playerDirection = Math.atan2(game.player.vy, game.player.vx);
        
        // 计算燃烧瓶飞行时间
        const distance = Math.sqrt(
            Math.pow(playerCenterX - bossCenterX, 2) + 
            Math.pow(playerCenterY - bossCenterY, 2)
        );
        const flightTime = distance / this.phaseTwo.molotovSystem.projectileSpeed;
        
        // 预测着弹点
        const predictedX = playerCenterX + Math.cos(playerDirection) * playerSpeed * flightTime;
        const predictedY = playerCenterY + Math.sin(playerDirection) * playerSpeed * flightTime;
        
        // 确保着弹点在屏幕内
        const finalTargetX = Math.max(50, Math.min(GAME_CONFIG.WIDTH - 50, predictedX));
        const finalTargetY = Math.max(50, Math.min(GAME_CONFIG.HEIGHT - 50, predictedY));
        
        // 创建燃烧瓶
        const molotov = new MolotovCocktail(
            bossCenterX, 
            bossCenterY, 
            finalTargetX, 
            finalTargetY, 
            this.phaseTwo.molotovSystem.projectileSpeed,
            this.phaseTwo.molotovSystem.rotationSpeed
        );
        
        // 确保燃烧瓶数组存在
        if (!game.molotovs) {
            game.molotovs = [];
        }
        
        game.molotovs.push(molotov);
    }
    
    // 检查光环伤害
    checkAuraDamage() {
        if (!game.player) return;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(bossCenterX - playerCenterX, 2) + 
            Math.pow(bossCenterY - playerCenterY, 2)
        );
        
        if (distance <= this.distortionAura.radius) {
            // 玩家在光环范围内，造成伤害
            game.player.takeDamage(this.distortionAura.damage);
        }
    }
    
    // 继承自Boss的闪避系统
    checkDodge() {
        if (this.isDodging || Date.now() - this.lastDodgeTime < this.dodgeCooldown) {
            return;
        }
        
        if (game.player) {
            const playerWeapons = game.player.getAllWeapons();
            const now = Date.now();
            
            for (let weapon of playerWeapons) {
                if (weapon.type === 'sword' && weapon.isAttacking) {
                    // 检查剑攻击
                    const distance = this.getDistanceToPlayer();
                    if (distance <= 60 && Math.random() < this.dodgeChance) {
                        this.startDodge();
                        return;
                    }
                }
            }
        }
    }
    
    startDodge() {
        if (this.isDodging) return;
        
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = Date.now();
        
        // 保存原始速度
        this.originalVx = this.vx;
        this.originalVy = this.vy;
        
        // 计算闪避方向（远离玩家）
        if (game.player) {
            const dx = this.x - game.player.x;
            const dy = this.y - game.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                this.vx = (dx / distance) * this.dodgeSpeed;
                this.vy = (dy / distance) * this.vx;
            } else {
                // 如果距离为0，随机方向闪避
                const angle = Math.random() * 2 * Math.PI;
                this.vx = Math.cos(angle) * this.dodgeSpeed;
                this.vy = Math.sin(angle) * this.dodgeSpeed;
            }
        }
    }
    
    updateDodge() {
        if (this.isDodging) {
            const now = Date.now();
            if (now - this.dodgeStartTime >= this.dodgeDuration) {
                // 闪避结束，恢复原始速度
                this.isDodging = false;
                this.vx = this.originalVx;
                this.vy = this.originalVy;
            }
        }
    }
    
    getDistanceToPlayer() {
        if (!game.player) return Infinity;
        
        const bossCenterX = this.x + this.width / 2;
        const bossCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        
        return Math.sqrt(
            Math.pow(bossCenterX - playerCenterX, 2) + 
            Math.pow(bossCenterY - playerCenterY, 2)
        );
    }
    
    setRandomDirection() {
        const angle = Math.random() * 2 * Math.PI;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }
    
    update() {
        const now = Date.now();
        
        // 强制血量保护
        if (this.health < 0) {
            console.log('警告：血量被设置为负数，强制修正为0');
            this.health = 0;
        }
        if (this.health > this.maxHealth) {
            this.health = this.maxHealth;
        }
        
        // 更新扭曲效果
        this.updateDistortionEffect();
        
        // 更新二阶段
        this.updatePhaseTwo();
        
        // 扎穿状态处理
        if (this.isImpaled) {
            super.update();
            this.checkBounds();
            return;
        }
        
        // 硬直状态处理
        if (this.stunned) {
            if (now >= this.stunEndTime) {
                this.stunned = false;
            } else {
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        // 闪避系统
        this.checkDodge();
        this.updateDodge();
        
        // 混沌弹幕系统
        this.checkChaosBarrage();
        
        // 混沌传送系统
        this.checkChaosTeleport();
        this.updateChaosTeleport();
        
        // 机雷系统
        this.checkMinePlacement();
        
        // 燃烧瓶系统（二阶段）
        this.checkMolotovThrow();
        
        // 光环伤害检查
        this.checkAuraDamage();
        
        // 正常移动
        if (!this.isDodging && !this.chaosTeleport.isTeleporting) {
            if (now - this.lastDirectionChange > this.directionChangeInterval) {
                this.setRandomDirection();
                this.lastDirectionChange = now;
            }
        }
        
        // 边界检查
        this.checkBounds();
        super.update();
        
        // 更新受击提示
        this.updateHitIndicators();
        
        // 更新推进器粒子系统
        this.updateThrusterParticles();
    }
    
    checkBounds() {
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
    
    takeDamage(damage, damageSource = 'unknown') {
        // 丑皇特殊伤害机制
        let shouldTakeDamage = false;
        
        if (!this.phaseTwo.activated) {
            // 一阶段：只有导弹不能造成伤害（其他攻击都能造成伤害）
            if (damageSource !== 'missile') {
                shouldTakeDamage = true;
            }
        } else {
            // 二阶段：只有导弹能造成伤害（其他攻击都不能造成伤害）
            if (damageSource === 'missile') {
                shouldTakeDamage = true;
            }
        }
        
        if (shouldTakeDamage) {
            this.health -= damage;
            
            // 防止血量变成负数
            if (this.health < 0) {
                this.health = 0;
            }
            
            // 添加受击提示
            this.addHitIndicator(damage);
            
            if (this.health <= 0) {
                this.health = 0;
                return true; // 死亡
            }
            return false; // 存活
        } else {
            // 不受伤害，但仍然显示受击提示（0伤害）
            this.addHitIndicator(0);
            return false;
        }
    }
    
    addHitIndicator(damage) {
        this.hitIndicators.push({
            damage: damage,
            x: this.x + this.width / 2,
            y: this.y - 20,
            startTime: Date.now(),
            duration: 600,
            isImmune: damage === 0 // 标记是否为免疫提示
        });
    }
    
    updateHitIndicators() {
        const now = Date.now();
        this.hitIndicators = this.hitIndicators.filter(indicator => 
            now - indicator.startTime < indicator.duration
        );
    }
    
    drawHitIndicators(ctx) {
        const now = Date.now();
        this.hitIndicators.forEach(indicator => {
            const elapsed = now - indicator.startTime;
            const alpha = 1 - (elapsed / indicator.duration);
            
            ctx.save();
            ctx.globalAlpha = alpha;
            
            if (indicator.isImmune) {
                // 免疫提示：显示"免疫"文字
                ctx.fillStyle = '#FFFF00'; // 黄色
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('免疫', indicator.x, indicator.y - (elapsed / 10));
            } else {
                // 正常伤害提示
                ctx.fillStyle = '#FF0000';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`-${indicator.damage}`, indicator.x, indicator.y - (elapsed / 10));
            }
            
            ctx.restore();
        });
    }
    
    draw(ctx) {
        ctx.save();
        
        // 应用扭曲效果
        if (this.distortionEffect.intensity > 0) {
            const centerX = this.x + this.width / 2;
            const centerY = this.y + this.height / 2;
            
            ctx.translate(centerX, centerY);
            ctx.rotate(Math.sin(this.distortionEffect.offset) * this.distortionEffect.intensity);
            ctx.translate(-centerX, -centerY);
        }
        
        // 绘制丑皇主体（扭曲的色块）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制扭曲边框
        ctx.strokeStyle = '#FF6B35';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // 绘制扭曲纹理
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) { // 减少纹理线条数量
            const offset = Math.sin(this.distortionEffect.offset + i) * 1; // 减小偏移量
            ctx.beginPath();
            ctx.moveTo(this.x + offset, this.y + i * 10); // 调整间距
            ctx.lineTo(this.x + this.width + offset, this.y + i * 10);
            ctx.stroke();
        }
        
        ctx.restore();
        
        // 绘制推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 绘制扭曲光环
        this.drawDistortionAura(ctx);
        
        // 绘制血量条
        const barWidth = this.width;
        const barHeight = 4; // 减小血量条高度
        const barY = this.y - 8; // 调整血量条位置
        
        // 背景
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, barY, barWidth, barHeight);
        
        // 血量
        const healthRatio = this.health / this.maxHealth;
        const red = Math.floor(255 * (1 - healthRatio));
        const green = Math.floor(255 * healthRatio);
        ctx.fillStyle = `rgb(${red}, ${green}, 0)`;
        ctx.fillRect(this.x, barY, barWidth * healthRatio, barHeight);
        
        // Boss标识
        ctx.fillStyle = '#FF6B35';
        ctx.font = '10px Arial'; // 减小字体大小
        ctx.textAlign = 'center';
        ctx.fillText('丑皇', this.x + this.width/2, this.y - 12); // 调整标识位置
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
        
        // 被扎穿状态视觉效果
        if (this.isImpaled) {
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            ctx.strokeStyle = '#00CCFF';
            ctx.lineWidth = 4; // 减小线条宽度
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(this.x - 3, this.y - 3, this.width + 6, this.height + 6); // 调整边框大小
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px Arial'; // 减小字体大小
            ctx.textAlign = 'center';
            ctx.fillText('扎穿!', this.x + this.width/2, this.y - 18); // 调整文字位置
            
            ctx.setLineDash([]);
            ctx.restore();
        }
    }
    
    drawDistortionAura(ctx) {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        ctx.save();
        ctx.globalAlpha = 0.3;
        
        // 绘制扭曲光环
        ctx.strokeStyle = '#FF6B35';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        const pulseRadius = this.distortionAura.radius + 
            Math.sin(this.distortionAura.pulseOffset) * 10;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, 2 * Math.PI);
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.restore();
        
        // 更新脉冲偏移
        this.distortionAura.pulseOffset += this.distortionAura.pulseSpeed;
    }
    
    drawThrusterFlames(ctx) {
        // 绘制丑皇特有的混沌推进特效
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 计算移动角度
        const moveAngle = Math.atan2(this.vy, this.vx);
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        if (speed > 0) {
            ctx.save();
            
            // 混沌火焰效果
            const flameLength = Math.min(18, speed * 2.5);
            const flameStartX = centerX - Math.cos(moveAngle) * (this.width / 2 + 2);
            const flameStartY = centerY - Math.sin(moveAngle) * (this.height / 2 + 2);
            
            // 绘制多层扭曲火焰
            for (let layer = 0; layer < 3; layer++) {
                const alpha = 0.8 - layer * 0.2;
                const layerLength = flameLength * (1 - layer * 0.2);
                const lineWidth = 4 - layer;
                
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = layer === 0 ? '#FF4500' : layer === 1 ? '#FF6B35' : '#FF8C42';
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                
                // 绘制扭曲的火焰线条
                for (let i = 0; i < 4; i++) {
                    const timeOffset = this.distortionEffect.offset + i * 0.5;
                    const distortion = Math.sin(timeOffset) * 2 + Math.cos(timeOffset * 0.7) * 1.5;
                    const angleOffset = Math.sin(timeOffset * 1.3) * 0.3;
                    
                    const flameEndX = flameStartX - Math.cos(moveAngle + angleOffset) * (layerLength + distortion);
                    const flameEndY = flameStartY - Math.sin(moveAngle + angleOffset) * (layerLength + distortion);
                    
                    ctx.beginPath();
                    ctx.moveTo(flameStartX, flameStartY);
                    ctx.lineTo(flameEndX, flameEndY);
                    ctx.stroke();
                }
            }
            
            // 绘制混沌粒子效果
            ctx.globalAlpha = 0.6;
            for (let i = 0; i < 6; i++) {
                const particleAngle = moveAngle + (Math.random() - 0.5) * 0.8;
                const particleDistance = Math.random() * flameLength * 0.8;
                const particleX = flameStartX - Math.cos(particleAngle) * particleDistance;
                const particleY = flameStartY - Math.sin(particleAngle) * particleDistance;
                
                ctx.fillStyle = `hsl(${30 + Math.random() * 20}, 100%, 60%)`;
                ctx.beginPath();
                ctx.arc(particleX, particleY, Math.random() * 2 + 1, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // 绘制扭曲光环
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#FF4500';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            
            const auraRadius = 8 + Math.sin(this.distortionEffect.offset * 2) * 3;
            ctx.beginPath();
            ctx.arc(flameStartX, flameStartY, auraRadius, 0, 2 * Math.PI);
            ctx.stroke();
            
            ctx.setLineDash([]);
            ctx.restore();
        }
        
        // 绘制推进器粒子
        this.drawThrusterParticles(ctx);
    }
    
    updateThrusterParticles() {
        const now = Date.now();
        
        // 生成新粒子
        if (now - this.particleSpawnTimer > this.particleSpawnInterval) {
            this.spawnThrusterParticle();
            this.particleSpawnTimer = now;
        }
        
        // 更新现有粒子
        this.thrusterParticles = this.thrusterParticles.filter(particle => {
            particle.life -= 16; // 假设60FPS
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.size *= 0.98; // 逐渐缩小
            
            return particle.life > 0 && particle.size > 0.5;
        });
    }
    
    spawnThrusterParticle() {
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 计算移动角度
        const moveAngle = Math.atan2(this.vy, this.vx);
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        if (speed > 0) {
            const flameStartX = centerX - Math.cos(moveAngle) * (this.width / 2 + 2);
            const flameStartY = centerY - Math.sin(moveAngle) * (this.height / 2 + 2);
            
            // 添加随机偏移
            const offsetX = (Math.random() - 0.5) * 4;
            const offsetY = (Math.random() - 0.5) * 4;
            
            this.thrusterParticles.push({
                x: flameStartX + offsetX,
                y: flameStartY + offsetY,
                vx: -Math.cos(moveAngle) * (2 + Math.random() * 3),
                vy: -Math.sin(moveAngle) * (2 + Math.random() * 3),
                size: 2 + Math.random() * 3,
                life: 100 + Math.random() * 50,
                color: `hsl(${30 + Math.random() * 30}, 100%, ${60 + Math.random() * 20}%)`,
                distortion: Math.random() * Math.PI * 2
            });
        }
    }
    
    drawThrusterParticles(ctx) {
        ctx.save();
        
        this.thrusterParticles.forEach(particle => {
            const alpha = particle.life / 150;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color;
            
            // 应用扭曲效果
            const distortionX = Math.sin(particle.distortion) * 2;
            const distortionY = Math.cos(particle.distortion) * 2;
            
            ctx.beginPath();
            ctx.arc(particle.x + distortionX, particle.y + distortionY, particle.size, 0, 2 * Math.PI);
            ctx.fill();
            
            // 绘制扭曲轨迹
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = particle.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(particle.x - particle.vx * 2, particle.y - particle.vy * 2);
            ctx.stroke();
        });
        
        ctx.restore();
    }
}

// 混沌子弹类
class ChaosBullet extends GameObject {
    constructor(x, y, targetX, targetY, damage, speed) {
        super(x, y, 6, 6, '#FF6B35'); // 橙色子弹
        
        this.targetX = targetX;
        this.targetY = targetY;
        this.damage = damage;
        this.speed = speed;
        this.startTime = Date.now();
        this.lifetime = 4000; // 4秒存活时间
        
        // 计算初始方向
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.vx = (dx / distance) * this.speed;
            this.vy = (dy / distance) * this.speed;
        } else {
            this.vx = 0;
            this.vy = this.speed;
        }
        
        // 扭曲效果
        this.distortionOffset = Math.random() * Math.PI * 2;
        this.distortionSpeed = 0.1;
    }
    
    update() {
        // 更新扭曲偏移
        this.distortionOffset += this.distortionSpeed;
        
        // 检查存活时间
        if (Date.now() - this.startTime > this.lifetime) {
            this.shouldDestroy = true;
            return;
        }
        
        // 检查边界
        if (this.x < 0 || this.x > GAME_CONFIG.WIDTH || 
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
            return;
        }
        
        // 检查与玩家的碰撞
        if (game.player && this.collidesWith(game.player)) {
            game.player.takeDamage(this.damage);
            this.shouldDestroy = true;
            return;
        }
        
        super.update();
    }
    
    draw(ctx) {
        ctx.save();
        
        // 应用扭曲效果
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(Math.sin(this.distortionOffset) * 0.3);
        ctx.translate(-centerX, -centerY);
        
        // 绘制扭曲的子弹
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制扭曲边框
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        ctx.restore();
    }
}

// 机雷类
class Mine extends GameObject {
    constructor(x, y) {
        super(x - 7.5, y - 7.5, 15, 15, '#FF6B35'); // 橙色机雷，15x15像素，以中心点定位
        
        // 机雷属性
        this.damage = 15; // 爆炸伤害15点
        this.explosionRadius = 175; // 有效杀伤半径175像素
        this.triggerDistance = 125; // 引爆距离125像素
        this.visibilityDistance = 200; // 可见距离200像素（算法上250像素内可见）
        this.isVisible = false; // 是否可见
        this.isExploded = false; // 是否已爆炸
        this.explosionStartTime = 0; // 爆炸开始时间
        this.explosionDuration = 300; // 爆炸持续时间0.3秒
        
        // 机雷特效
        this.pulseEffect = {
            intensity: 0.3,
            frequency: 0.02,
            offset: 0
        };
    }
    
    update() {
        if (this.isExploded) {
            // 爆炸状态，检查爆炸是否结束
            const now = Date.now();
            if (now - this.explosionStartTime >= this.explosionDuration) {
                // 爆炸结束，移除机雷
                if (game.mines) {
                    const index = game.mines.indexOf(this);
                    if (index > -1) {
                        game.mines.splice(index, 1);
                    }
                }
            }
            return;
        }
        
        // 更新脉冲效果
        this.pulseEffect.offset += this.pulseEffect.frequency;
        if (this.pulseEffect.offset >= Math.PI * 2) {
            this.pulseEffect.offset = 0;
        }
        
        // 检查玩家距离，决定是否可见
        if (game.player) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const mineCenterX = this.x + this.width / 2;
            const mineCenterY = this.y + this.height / 2;
            
            const distance = Math.sqrt(
                Math.pow(playerCenterX - mineCenterX, 2) + 
                Math.pow(playerCenterY - mineCenterY, 2)
            );
            
            // 更新可见性（算法上250像素内可见，但实际显示200像素）
            this.isVisible = distance <= 250;
            
            // 检查是否应该引爆
            if (distance <= this.triggerDistance) {
                this.explode();
            }
        }
    }
    
    explode() {
        if (this.isExploded) return; // 防止重复爆炸
        
        this.isExploded = true;
        this.explosionStartTime = Date.now();
        
        // 对玩家造成伤害
        if (game.player) {
            const playerCenterX = game.player.x + game.player.width / 2;
            const playerCenterY = game.player.y + game.player.height / 2;
            const mineCenterX = this.x + this.width / 2;
            const mineCenterY = this.y + this.height / 2;
            
            const distance = Math.sqrt(
                Math.pow(playerCenterX - mineCenterX, 2) + 
                Math.pow(playerCenterY - mineCenterY, 2)
            );
            
            // 在爆炸半径内造成伤害
            if (distance <= this.explosionRadius) {
                game.player.takeDamage(this.damage, 'mine');
            }
        }
        
        // 创建爆炸特效
        this.createExplosionEffect();
    }
    
    createExplosionEffect() {
        if (!game.explosions) {
            game.explosions = [];
        }
        
        // 创建机雷爆炸特效
        game.explosions.push({
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            radius: this.explosionRadius,
            startTime: Date.now(),
            duration: this.explosionDuration,
            type: 'mine', // 标记为机雷爆炸
            damage: this.damage
        });
    }
    
    draw(ctx) {
        if (this.isExploded) {
            // 爆炸状态，绘制爆炸效果
            this.drawExplosion(ctx);
            return;
        }
        
        // 只有在可见时才绘制机雷
        if (!this.isVisible) return;
        
        ctx.save();
        
        // 应用脉冲效果
        const pulseScale = 1 + Math.sin(this.pulseEffect.offset) * this.pulseEffect.intensity;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        ctx.translate(centerX, centerY);
        ctx.scale(pulseScale, pulseScale);
        ctx.translate(-centerX, -centerY);
        
        // 绘制机雷主体（圆形）
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制机雷边框
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制机雷纹理（十字形）
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - 3, centerY);
        ctx.lineTo(centerX + 3, centerY);
        ctx.moveTo(centerX, centerY - 3);
        ctx.lineTo(centerX, centerY + 3);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawExplosion(ctx) {
        const now = Date.now();
        const elapsed = now - this.explosionStartTime;
        const progress = elapsed / this.explosionDuration;
        
        if (progress >= 1) return;
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const currentRadius = this.explosionRadius * progress;
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // 绘制爆炸圆环
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 绘制爆炸中心
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(centerX, centerY, currentRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// 燃烧瓶类
class MolotovCocktail extends GameObject {
    constructor(x, y, targetX, targetY, speed, rotationSpeed) {
        super(x, y, 8, 8, '#FF4500'); // 橙红色燃烧瓶
        
        this.targetX = targetX;
        this.targetY = targetY;
        this.speed = speed;
        this.rotationSpeed = rotationSpeed;
        this.rotation = 0; // 当前旋转角度
        this.startTime = Date.now();
        this.flightTime = 0;
        this.estimatedFlightTime = 0;
        this.isExploded = false;
        this.explosionStartTime = 0;
        this.explosionDelay = 1000; // 着地后1秒爆炸
        
        // 计算飞行方向和距离
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        this.estimatedFlightTime = distance / speed;
        
        // 设置速度
        if (distance > 0) {
            this.vx = (dx / distance) * speed;
            this.vy = (dy / distance) * speed;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
    }
    
    update() {
        if (this.isExploded) {
            // 爆炸状态，检查爆炸是否结束
            const now = Date.now();
            if (now - this.explosionStartTime >= this.explosionDelay) {
                this.shouldDestroy = true;
            }
            return;
        }
        
        // 更新飞行时间
        this.flightTime = (Date.now() - this.startTime) / 1000;
        
        // 检查是否到达目标位置
        if (this.flightTime >= this.estimatedFlightTime) {
            // 着地，开始爆炸倒计时
            this.isExploded = true;
            this.explosionStartTime = Date.now();
            this.vx = 0;
            this.vy = 0;
            return;
        }
        
        // 正常飞行
        super.update();
        this.rotation += this.rotationSpeed;
        
        // 边界检查
        if (this.x < 0 || this.x > GAME_CONFIG.WIDTH || 
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
        }
    }
    
    draw(ctx) {
        if (this.isExploded) {
            // 爆炸状态，绘制爆炸效果
            this.drawExplosion(ctx);
            return;
        }
        
        ctx.save();
        
        // 应用旋转
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(this.rotation);
        ctx.translate(-centerX, -centerY);
        
        // 绘制燃烧瓶主体（瓶子形状）
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制瓶口
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x + 2, this.y - 2, 4, 2);
        
        // 绘制瓶身纹理
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x + 1, this.y + 2);
        ctx.lineTo(this.x + this.width - 1, this.y + 2);
        ctx.moveTo(this.x + 1, this.y + 5);
        ctx.lineTo(this.x + this.width - 1, this.y + 5);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawExplosion(ctx) {
        const now = Date.now();
        const elapsed = now - this.explosionStartTime;
        const progress = elapsed / this.explosionDelay;
        
        if (progress >= 1) return;
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const alpha = 1 - progress;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // 绘制火焰效果
        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20 * progress, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制火焰中心
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10 * progress, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}