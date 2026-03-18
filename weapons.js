// 武器基类
class Weapon {
    constructor(config) {
        this.type = config.type;
        this.name = config.name;
        this.damage = config.damage;
        this.cooldown = config.cooldown || 0;
        this.lastUseTime = 0;
    }
    
    canUse() {
        const now = Date.now();
        return now - this.lastUseTime >= this.cooldown;
    }
    
    getCooldownRemaining() {
        const now = Date.now();
        return Math.max(0, this.cooldown - (now - this.lastUseTime));
    }
    
    // 子类需要实现的方法
    use(player) {
        throw new Error('Weapon.use() must be implemented by subclass');
    }
    
    update(player) {
        // 默认空实现，子类可以重写
    }
    
    draw(ctx, player) {
        // 默认空实现，子类可以重写
    }
}

// 剑武器类
class Sword extends Weapon {
    constructor() {
        super({
            type: 'sword',
            name: '脉冲光束军刀',
            damage: 50,
            cooldown: 4800 // 4.8秒冷却
        });
        
        this.range = 3 * 50; // 距离3 (转换为像素)
        this.angle = 120; // 120度扇形
        this.slashes = []; // 剑光效果数组
        this.isAttacking = false;
        this.attackEndTime = 0;
        this.attackRecoveryDuration = 500; // 攻击后僵直时间：0.5秒
        
        // 冲刺相关
        this.isDashing = false;
        this.dashTarget = null;
        this.dashSpeed = 22;
        this.dashStopDistance = 90;
        this.dashStartTime = 0;
        this.maxDashDuration = 500; // 最大刀推时间：0.5秒
        this.dashDirection = 0; // 冲刺方向（用于特效）
    }
    
    canUse() {
        // 在攻击中或僵直中不能使用
        if (this.isAttacking || Date.now() < this.attackEndTime) {
            return false;
        }
        return super.canUse();
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        // 根据锁定模式获取目标
        let targetEnemy = null;
        
        if (gameState.lockMode === 'manual') {
            // 手动锁模式：直接在当前朝向攻击，不需要目标
            this.attack(player);
            return true;
        } else {
            // 软锁和硬锁模式：获取锁定的目标
            targetEnemy = player.getCurrentTarget();
        }
        
        // 如果没有锁定目标，直接在当前朝向攻击
        if (!targetEnemy) {
            this.attack(player);
            return true;
        }
        
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        const enemyCenterX = targetEnemy.x + targetEnemy.width / 2;
        const enemyCenterY = targetEnemy.y + targetEnemy.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(enemyCenterX - playerCenterX, 2) + 
            Math.pow(enemyCenterY - playerCenterY, 2)
        );
        
        // 刀推逻辑：如果敌人不在攻击范围内，开始快速推进
        if (distance > this.dashStopDistance && !this.isDashing) {
            // 开始刀推
            this.isDashing = true;
            this.dashTarget = targetEnemy;
            this.dashStartTime = Date.now();
            return true;
        } else if (distance <= this.dashStopDistance) {
            // 距离足够近，直接攻击
            this.attack(player);
            return true;
        }
        
        return false;
    }
    
    attack(player) {
        const now = Date.now();
        if (!super.canUse()) return;
        
        this.lastUseTime = now;
        this.isAttacking = true;
        
        // 创建刀光效果
        const swordSlash = new SwordSlash(
            player.x, 
            player.y, 
            player.direction, 
            this.range * 0.7, // 距离缩短到70%
            this.damage
        );
        
        this.slashes.push(swordSlash);
    }
    
    update(player) {
        // 更新冲刺逻辑
        if (this.isDashing) {
            this.updateDash(player);
        }
        
        // 更新剑刀光效果
        for (let i = this.slashes.length - 1; i >= 0; i--) {
            const slash = this.slashes[i];
            slash.update();
            if (slash.isFinished) {
                this.slashes.splice(i, 1);
            }
        }
        
        // 检查攻击是否结束（所有刀光都消失了）
        if (this.isAttacking && this.slashes.length === 0) {
            this.isAttacking = false;
            this.attackEndTime = Date.now() + this.attackRecoveryDuration;
        }
    }
    
    updateDash(player) {
        if (!this.dashTarget) {
            this.isDashing = false;
            return;
        }
        
        // 检查目标是否还存在（包括Boss和普通敌人）
        const targetExists = game.enemies.includes(this.dashTarget) || 
                            (game.boss && this.dashTarget === game.boss);
        if (!targetExists) {
            this.isDashing = false;
            this.dashTarget = null;
            // 重置玩家速度
            player.vx = 0;
            player.vy = 0;
            return;
        }
        
        // 检查是否超过最大刀推时间（0.5秒）
        const currentTime = Date.now();
        const dashDuration = currentTime - this.dashStartTime;
        if (dashDuration >= this.maxDashDuration) {
            // 超过最大刀推时间，强制停止刀推并攻击
            this.isDashing = false;
            this.dashTarget = null;
            // 重置玩家速度
            player.vx = 0;
            player.vy = 0;
            this.attack(player);
            return;
        }
        
        const targetCenterX = this.dashTarget.x + this.dashTarget.width / 2;
        const targetCenterY = this.dashTarget.y + this.dashTarget.height / 2;
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(targetCenterX - playerCenterX, 2) + 
            Math.pow(targetCenterY - playerCenterY, 2)
        );
        
        // 如果到达刀推停止距离，停止冲刺并攻击
        if (distance <= this.dashStopDistance) {
            this.isDashing = false;
            this.dashTarget = null;
            // 重置玩家速度
            player.vx = 0;
            player.vy = 0;
            this.attack(player);
            return;
        }
        
        // 计算冲刺方向
        const dx = targetCenterX - playerCenterX;
        const dy = targetCenterY - playerCenterY;
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        
        if (magnitude > 0) {
            // 设置冲刺方向和速度
            this.dashDirection = Math.atan2(dy, dx);
            // 剑冲刺时控制玩家移动
            player.vx = (dx / magnitude) * this.dashSpeed;
            player.vy = (dy / magnitude) * this.dashSpeed;
        }
    }
    
    draw(ctx, player) {
        // 绘制剑刀光效果和冲刺效果
        if (this.slashes.length > 0 || this.isDashing) {
            // 绘制所有刀光
            this.slashes.forEach(slash => {
                slash.draw(ctx);
            });
            
            // 绘制冲刺效果
            if (this.isDashing) {
                const dashCenterX = player.x + player.width / 2;
                const dashCenterY = player.y + player.height / 2;
                
                ctx.save();
                ctx.globalAlpha = 0.7;
                
                // 冲刺尾迹
                const trailLength = 50;
                const trailEndX = dashCenterX - Math.cos(this.dashDirection) * trailLength;
                const trailEndY = dashCenterY - Math.sin(this.dashDirection) * trailLength;
                
                // 绘制冲刺尾迹（橙红渐变，符合光束军刀主题）
                const gradient = ctx.createLinearGradient(dashCenterX, dashCenterY, trailEndX, trailEndY);
                gradient.addColorStop(0, 'rgba(255, 69, 0, 0.9)'); // 橙红色
                gradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.7)'); // 深橙色
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // 透明白
                
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.moveTo(dashCenterX, dashCenterY);
                ctx.lineTo(trailEndX, trailEndY);
                ctx.stroke();
                
                // 冲刺光环
                ctx.strokeStyle = '#FF4500'; // 橙红色
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(dashCenterX, dashCenterY, 28, 0, Math.PI * 2);
                ctx.stroke();
                
                // 内层光环
                ctx.strokeStyle = '#FF8C00'; // 深橙色
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(dashCenterX, dashCenterY, 20, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.setLineDash([]);
                ctx.restore();
                
                // 能量爆发效果
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
                ctx.fillRect(player.x - 8, player.y - 8, player.width + 16, player.height + 16);
                ctx.restore();
            }
        }
    }
    
    getStatus() {
        if (this.isAttacking) return { text: '攻击中...', color: 'white' };
        
        const recoveryRemaining = Math.max(0, this.attackEndTime - Date.now());
        if (recoveryRemaining > 0) {
            return { text: `僵直: ${(recoveryRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        
        if (this.isDashing) return { text: '刀推中...', color: 'white' };
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: `冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        
        return { text: '准备就绪', color: 'white' };
    }
}

// 枪武器类
class Gun extends Weapon {
    constructor() {
        super({
            type: 'gun',
            name: '自动步枪',
            damage: 6,
            cooldown: 0 // 枪使用射速而不是冷却时间
        });
        
        this.fireRate = 3.5; // 提高射速到每秒3.5发
        this.magazineSize = 30;
        this.range = 35 * 50; // 射程35 (转换为像素)
        this.bulletSpeed = 25; // 提高弹速到每帧25像素
        
        this.currentAmmo = this.magazineSize;
        this.reloading = false;
        this.reloadStartTime = 0;
        this.reloadDuration = 2000; // 2秒重装时间
    }
    
    canUse() {
        const now = Date.now();
        const fireInterval = 1000 / this.fireRate;
        return (now - this.lastUseTime >= fireInterval) && !this.reloading;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        if (this.currentAmmo <= 0) {
            // 弹药耗尽，自动开始重装
            if (!this.reloading) {
                this.reload();
            }
            return false;
        }
        
        this.lastUseTime = Date.now();
        this.currentAmmo--;
        
        // 如果射击后弹药耗尽，自动开始重装
        if (this.currentAmmo <= 0) {
            this.reload();
        }
        
        // 创建子弹
        const bulletX = player.x + player.width / 2;
        const bulletY = player.y + player.height / 2;
        
        // 预瞄功能：计算射击角度
        const shootDirection = this.calculatePredictiveAiming(player, bulletX, bulletY);
        
        const bullet = new Bullet(
            bulletX, bulletY, 
            shootDirection, 
            this.bulletSpeed,
            this.damage,
            this.range
        );
        
        game.bullets.push(bullet);
        return true;
    }
    
    calculatePredictiveAiming(player, bulletX, bulletY) {
        // 手动锁模式：直接朝向鼠标位置射击
        if (gameState.lockMode === 'manual') {
            const targetX = gameState.manualLockX || mouse.x;
            const targetY = gameState.manualLockY || mouse.y;
            
            const dx = targetX - bulletX;
            const dy = targetY - bulletY;
            const aimAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            return aimAngle;
        }
        
        // 软锁和硬锁模式：使用当前锁定的目标
        const lockedTarget = player.getCurrentTarget();
        
        // 如果没有锁定目标，使用当前朝向
        if (!lockedTarget) {
            return player.direction;
        }
        
        // 目标当前位置
        const enemyX = lockedTarget.x + lockedTarget.width / 2;
        const enemyY = lockedTarget.y + lockedTarget.height / 2;
        
        // 目标速度
        const enemyVx = lockedTarget.vx || 0;
        const enemyVy = lockedTarget.vy || 0;
        
        // 计算距离
        const dx = enemyX - bulletX;
        const dy = enemyY - bulletY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 计算子弹飞行时间
        const flightTime = distance / this.bulletSpeed;
        
        // 预测目标位置
        const predictedX = enemyX + enemyVx * flightTime;
        const predictedY = enemyY + enemyVy * flightTime;
        
        // 计算射击角度
        const aimDx = predictedX - bulletX;
        const aimDy = predictedY - bulletY;
        const aimAngle = Math.atan2(aimDy, aimDx) * 180 / Math.PI;
        
        return aimAngle;
    }
    
    reload() {
        this.reloading = true;
        this.reloadStartTime = Date.now();
    }
    
    canReload() {
        return !this.reloading && this.currentAmmo < this.magazineSize;
    }
    
    update(player) {
        // 更新重装状态
        if (this.reloading) {
            if (Date.now() - this.reloadStartTime >= this.reloadDuration) {
                this.reloading = false;
                this.currentAmmo = this.magazineSize;
            }
        }
    }
    
    getStatus() {
        if (this.reloading) return { text: '重装中...', color: '#CC6666' };
        if (this.currentAmmo === 0) return { text: '弹药耗尽！自动重装', color: '#CC6666' };
        
        // 始终显示弹药数量，如果不满弹则提示可以重装
        let statusText = `弹药: ${this.currentAmmo}/${this.magazineSize}`;
        if (this.currentAmmo < this.magazineSize) {
            statusText += ' | 按R重装';
        }
        return { text: statusText, color: 'white' };
    }
}

// 镭射步枪类
class LaserRifle extends Weapon {
    constructor() {
        super({
            type: 'laser_rifle',
            name: '镭射步枪',
            damage: 20,
            cooldown: 0
        });
        
        this.chargeTime = 1000;
        this.fireInterval = 700;
        this.lastFireTime = 0;
        
        this.isCharging = false;
        this.chargeStartTime = 0;
        
        // 过热系统
        this.heat = 0;
        this.maxHeatBar = 170;
        this.overheatThreshold = 200;
        this.heatPerShot = 50;
        this.coolRate = 10;
        this.coolInterval = 100;
        this.lastCoolTime = 0;
        this.overheated = false;
        this.overheatStartTime = 0;
        this.overheatDuration = 7000;
        
        // 视觉效果
        this.beamEffect = null;
        this.chargeTarget = null;
    }
    
    use(player) {
        if (this.overheated) return false;
        
        const now = Date.now();
        if (now - this.lastFireTime < this.fireInterval) return false;
        
        if (!this.isCharging) {
            this.isCharging = true;
            this.chargeStartTime = now;
        }
        
        if (now - this.chargeStartTime >= this.chargeTime) {
            this.fire(player);
            return true;
        }
        
        return false;
    }
    
    fire(player) {
        this.isCharging = false;
        this.lastFireTime = Date.now();
        
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        
        // 预瞄目标
        const target = this.findTarget(player);
        let endX, endY;
        
        if (target) {
            const tx = target.x + target.width / 2;
            const ty = target.y + target.height / 2;
            const tvx = target.vx || 0;
            const tvy = target.vy || 0;
            
            const dist = Math.sqrt((tx - px) ** 2 + (ty - py) ** 2);
            const beamSpeed = 200;
            const flightTime = dist / beamSpeed;
            
            endX = tx + tvx * flightTime;
            endY = ty + tvy * flightTime;
        } else {
            const angle = player.direction * Math.PI / 180;
            endX = px + Math.cos(angle) * 2000;
            endY = py + Math.sin(angle) * 2000;
        }
        
        // 射线检测命中
        const dx = endX - px;
        const dy = endY - py;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / len;
        const ny = dy / len;
        
        let hitTarget = null;
        let hitDist = Infinity;
        
        const checkHit = (entity) => {
            if (!entity || entity.health <= 0) return;
            const ex = entity.x + entity.width / 2;
            const ey = entity.y + entity.height / 2;
            const hitSize = Math.max(entity.width, entity.height) / 2 + 5;
            
            // 点到射线的距离
            const toEx = ex - px;
            const toEy = ey - py;
            const proj = toEx * nx + toEy * ny;
            if (proj < 0) return;
            
            const perpX = toEx - nx * proj;
            const perpY = toEy - ny * proj;
            const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);
            
            if (perpDist < hitSize && proj < hitDist) {
                hitDist = proj;
                hitTarget = entity;
            }
        };
        
        if (game.boss) checkHit(game.boss);
        if (game.enemies) game.enemies.forEach(e => checkHit(e));
        
        if (hitTarget) {
            hitTarget.takeDamage(this.damage, 'laser_rifle');
            endX = hitTarget.x + hitTarget.width / 2;
            endY = hitTarget.y + hitTarget.height / 2;
        }
        
        // 光束视觉效果
        this.beamEffect = {
            startX: px, startY: py,
            endX, endY,
            startTime: Date.now(),
            duration: 400
        };
        
        // 增加热量
        this.heat += this.heatPerShot;
        if (this.heat >= this.overheatThreshold) {
            this.overheated = true;
            this.overheatStartTime = Date.now();
        }
    }
    
    findTarget(player) {
        if (gameState.lockMode === 'manual') return null;
        return player.getCurrentTarget();
    }
    
    update(player) {
        const now = Date.now();
        
        // 清理光束特效（必须在所有 return 之前）
        if (this.beamEffect && now - this.beamEffect.startTime >= this.beamEffect.duration) {
            this.beamEffect = null;
        }
        
        // 过热冷却
        if (this.overheated) {
            if (now - this.overheatStartTime >= this.overheatDuration) {
                this.overheated = false;
                this.heat = 0;
            }
            this.isCharging = false;
            return;
        }
        
        // 自然散热：不蓄力且射击冷却结束后才散热
        const isFiring = now - this.lastFireTime < this.fireInterval;
        if (!this.isCharging && !isFiring && this.heat > 0) {
            if (now - this.lastCoolTime >= this.coolInterval) {
                this.heat = Math.max(0, this.heat - this.coolRate);
                this.lastCoolTime = now;
            }
        }
        
        // 松开鼠标时取消蓄力
        const isLeftHand = player.leftHandWeapon === this;
        const isHeld = isLeftHand ? mouse.leftClick : mouse.rightClick;
        if (this.isCharging && !isHeld) {
            this.isCharging = false;
        }
    }
    
    draw(ctx, player) {
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        
        // 蓄力指示
        if (this.isCharging) {
            const now = Date.now();
            const progress = Math.min(1, (now - this.chargeStartTime) / this.chargeTime);
            
            ctx.save();
            
            // 外圈蓄力光环（脉动）
            const pulse = Math.sin(now * 0.015) * 3;
            const outerRadius = 30 + pulse + progress * 8;
            ctx.strokeStyle = `rgba(255, 80, 80, ${0.3 + progress * 0.4})`;
            ctx.lineWidth = 3;
            ctx.shadowColor = '#FF3333';
            ctx.shadowBlur = 8 + progress * 15;
            ctx.beginPath();
            ctx.arc(px, py, outerRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
            
            // 内圈进度环
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(255, 200, 150, ${0.6 + progress * 0.4})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.stroke();
            
            // 蓄力粒子（旋转光点）
            for (let i = 0; i < 4; i++) {
                const angle = now * 0.006 + (Math.PI * 2 / 4) * i;
                const r = 22 + progress * 10;
                const ptX = px + Math.cos(angle) * r;
                const ptY = py + Math.sin(angle) * r;
                ctx.fillStyle = `rgba(255, 150, 100, ${progress * 0.8})`;
                ctx.beginPath();
                ctx.arc(ptX, ptY, 2 + progress * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // 蓄力中心光点
            if (progress > 0.5) {
                const glow = (progress - 0.5) * 2;
                ctx.fillStyle = `rgba(255, 220, 200, ${glow * 0.6})`;
                ctx.shadowColor = '#FF6644';
                ctx.shadowBlur = 15 * glow;
                ctx.beginPath();
                ctx.arc(px, py, 4 + glow * 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            
            // 瞄准线
            const target = this.findTarget(player);
            if (target) {
                const tx = target.x + target.width / 2;
                const ty = target.y + target.height / 2;
                
                // 粗瞄准线
                ctx.strokeStyle = `rgba(255, 60, 60, ${0.15 + progress * 0.35})`;
                ctx.lineWidth = 2 + progress * 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.setLineDash([]);
                
                // 目标锁定框
                if (progress > 0.3) {
                    const lockAlpha = (progress - 0.3) / 0.7;
                    const lockSize = 12 + Math.sin(now * 0.01) * 2;
                    ctx.strokeStyle = `rgba(255, 80, 80, ${lockAlpha * 0.8})`;
                    ctx.lineWidth = 2;
                    // 四角标记
                    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
                    for (const [cx, cy] of corners) {
                        ctx.beginPath();
                        ctx.moveTo(tx + cx * lockSize, ty + cy * lockSize);
                        ctx.lineTo(tx + cx * lockSize * 0.5, ty + cy * lockSize);
                        ctx.moveTo(tx + cx * lockSize, ty + cy * lockSize);
                        ctx.lineTo(tx + cx * lockSize, ty + cy * lockSize * 0.5);
                        ctx.stroke();
                    }
                }
            }
            
            ctx.restore();
        }
        
        // 光束效果
        if (this.beamEffect) {
            const e = this.beamEffect;
            const elapsed = Date.now() - e.startTime;
            const alpha = 1 - elapsed / e.duration;
            
            ctx.save();
            
            // 外层光晕
            ctx.strokeStyle = `rgba(255, 40, 40, ${alpha * 0.3})`;
            ctx.lineWidth = 16 * alpha + 4;
            ctx.shadowColor = '#FF2222';
            ctx.shadowBlur = 25 * alpha;
            ctx.beginPath();
            ctx.moveTo(e.startX, e.startY);
            ctx.lineTo(e.endX, e.endY);
            ctx.stroke();
            
            // 主光束
            ctx.strokeStyle = `rgba(255, 80, 60, ${alpha * 0.9})`;
            ctx.lineWidth = 8 * alpha + 2;
            ctx.shadowBlur = 15 * alpha;
            ctx.beginPath();
            ctx.moveTo(e.startX, e.startY);
            ctx.lineTo(e.endX, e.endY);
            ctx.stroke();
            
            // 内芯（白热）
            ctx.strokeStyle = `rgba(255, 230, 220, ${alpha * 0.9})`;
            ctx.lineWidth = 3 * alpha + 1;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(e.startX, e.startY);
            ctx.lineTo(e.endX, e.endY);
            ctx.stroke();
            
            // 命中点闪光
            const flashSize = 20 * alpha;
            const gradient = ctx.createRadialGradient(e.endX, e.endY, 0, e.endX, e.endY, flashSize);
            gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.8})`);
            gradient.addColorStop(0.4, `rgba(255, 100, 50, ${alpha * 0.4})`);
            gradient.addColorStop(1, `rgba(255, 50, 30, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(e.endX, e.endY, flashSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // 过热条（玩家上方）
        if (this.heat > 0 || this.overheated) {
            ctx.save();
            const barWidth = 50;
            const barHeight = 5;
            const barX = px - barWidth / 2;
            const barY = player.y - 15;
            
            // 背景
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            
            const ratio = Math.min(1, this.heat / this.maxHeatBar);
            
            // 过热闪烁
            if (this.overheated) {
                const blink = Math.sin(Date.now() * 0.01) > 0;
                ctx.fillStyle = blink ? '#FF0000' : '#CC0000';
                ctx.fillRect(barX, barY, barWidth, barHeight);
            } else {
                // 渐变热量条
                const grad = ctx.createLinearGradient(barX, barY, barX + barWidth * ratio, barY);
                grad.addColorStop(0, '#FFCC00');
                grad.addColorStop(Math.min(1, ratio * 1.2), ratio > 0.7 ? '#FF3300' : '#FF8800');
                ctx.fillStyle = grad;
                ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
            }
            
            // 边框
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
            
            ctx.restore();
        }
    }
    
    getStatus() {
        if (this.overheated) {
            const remaining = this.overheatDuration - (Date.now() - this.overheatStartTime);
            return { text: `过热! ${(remaining / 1000).toFixed(1)}s`, color: '#FF0000' };
        }
        if (this.isCharging) {
            const progress = Math.min(1, (Date.now() - this.chargeStartTime) / this.chargeTime);
            return { text: `蓄力中 ${Math.round(progress * 100)}%`, color: '#FF6666' };
        }
        const now = Date.now();
        if (now - this.lastFireTime < this.fireInterval) {
            return { text: '冷却中...', color: '#CC6666' };
        }
        return { text: `热量: ${Math.round(this.heat)}/${this.maxHeatBar}`, color: '#FFAA00' };
    }
}

// 镭射长枪类
class LaserSpear extends Weapon {
    constructor() {
        super({
            type: 'laser_spear',
            name: '镭射长枪',
            damage: 25,
            cooldown: 5000 // 5秒冷却
        });
        
        this.chargeRange = 8 * 50; // 冲锋距离：8单位 (转换为像素)
        
        // 冲锋攻击状态
        this.isCharging = false; // 冲锋状态
        this.chargeStartTime = 0;
        this.chargeDuration = 500; // 冲锋持续时间：0.5秒
        this.chargeSpeed = 40; // 冲锋速度：40单位/秒
        this.chargeDirection = 0; // 冲锋方向
        this.attackEndTime = 0;
        this.attackRecoveryDuration = 300; // 攻击后恢复时间：0.3秒
        
        // 碰撞检测
        this.hitEnemies = new Set(); // 记录已击中的敌人（避免重复伤害）
        this.impaledEnemies = new Set(); // 记录被扎穿的敌人
        this.lastHitCheck = 0;
        
        // 视觉效果
        this.spearTrails = []; // 长枪轨迹特效
    }
    
    canUse() {
        // 在冲锋中或恢复期间不能使用
        if (this.isCharging || Date.now() < this.attackEndTime) {
            return false;
        }
        return super.canUse();
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        this.startCharge(player);
        return true;
    }
    
    startCharge(player) {
        this.isCharging = true;
        this.chargeStartTime = Date.now();
        
        // 清空之前击中的敌人记录
        this.hitEnemies.clear();
        this.impaledEnemies.clear();
        
        // 确定冲锋方向
        if (gameState.lockMode === 'manual') {
            // 手动锁模式：朝向鼠标
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const dx = mouse.x - playerCenterX;
            const dy = mouse.y - playerCenterY;
            this.chargeDirection = Math.atan2(dy, dx);
        } else {
            // 软锁和硬锁模式：朝向目标或当前方向
            const target = player.getCurrentTarget();
            if (target) {
                const playerCenterX = player.x + player.width / 2;
                const playerCenterY = player.y + player.height / 2;
                const targetCenterX = target.x + target.width / 2;
                const targetCenterY = target.y + target.height / 2;
                const dx = targetCenterX - playerCenterX;
                const dy = targetCenterY - playerCenterY;
                this.chargeDirection = Math.atan2(dy, dx);
            } else {
                // 没有目标，朝向当前方向
                this.chargeDirection = player.direction * Math.PI / 180;
            }
        }
    }
    
    checkChargeCollision(player) {
        // 获取所有敌人
        const allEnemies = [...game.enemies];
        if (game.boss) {
            allEnemies.push(game.boss);
        }
        
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        
        allEnemies.forEach(enemy => {
            // 跳过已经击中过的敌人
            if (this.hitEnemies.has(enemy)) return;
            
            const enemyCenterX = enemy.x + enemy.width / 2;
            const enemyCenterY = enemy.y + enemy.height / 2;
            
            // 检查距离碰撞
            const distance = Math.sqrt(
                Math.pow(enemyCenterX - playerCenterX, 2) + 
                Math.pow(enemyCenterY - playerCenterY, 2)
            );
            
            const hitDistance = (player.width + enemy.width) / 2 + 40; // 长枪额外触及距离
            
            if (distance <= hitDistance) {
                // 击中敌人
                this.hitEnemies.add(enemy);
                const isDead = enemy.takeDamage(this.damage);
                gameState.score += this.damage;
                gameState.totalDamage += this.damage;
                
                if (!isDead) {
                    // 敌人未死亡，扎穿并跟随移动
                    enemy.getImpaled(this);
                    this.impaledEnemies.add(enemy);
                    
                    // 让敌人跟随玩家的冲锋移动
                    const chargeVx = Math.cos(this.chargeDirection) * this.chargeSpeed;
                    const chargeVy = Math.sin(this.chargeDirection) * this.chargeSpeed;
                    enemy.vx = chargeVx;
                    enemy.vy = chargeVy;
                } else {
                    // 敌人死亡，正常处理
                    if (enemy instanceof Boss || enemy instanceof SublimeMoon || enemy instanceof UglyEmperor) {
                        game.boss = null;
                        gameState.score += 100;
                        gameState.bossKillCount++;
                        
                        // 根据游戏模式决定下一步
                        if (gameState.selectedGameMode === 'BOSS_BATTLE') {
                            // 特定关卡胜利，其他关卡继续
                            if (gameState.selectedLevel === 'CRIMSON_KING' || gameState.selectedLevel === 'SUBLIME_MOON' || gameState.selectedLevel === 'STAR_DEVOURER' || gameState.selectedLevel === 'UGLY_EMPEROR') {
                                // 关卡完成：胜利并回到主菜单
                                gameState.bossSpawned = false; // 确保不会生成新Boss
                                game.showVictoryAndReturnToMenu();
                            } else {
                                // 其他Boss战模式：立即生成新Boss
                            gameState.bossSpawned = false;
                                if (gameState.selectedLevel) {
                                    game.spawnBossForLevel(gameState.selectedLevel);
                        }
                            }
                        }
                        // Boss死亡后游戏可能结束或继续
                    } else {
                        // 普通敌人死亡，让游戏主循环处理清理
                            gameState.score += 10;
                    }
                }
                
                // 创建击中特效
                this.createHitEffect(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                updateUI();
            }
        });
    }
    

    
    createHitEffect(x, y) {
        // 创建长枪击中特效
        const effect = {
            x: x,
            y: y,
            startTime: Date.now(),
            duration: 300
        };
        this.spearTrails.push(effect);
    }
    
    update(player) {
        // 更新冲锋状态
        if (this.isCharging) {
            const chargeTime = Date.now() - this.chargeStartTime;
            
            if (chargeTime >= this.chargeDuration) {
                // 冲锋结束，释放所有被扎穿的敌人
                this.impaledEnemies.forEach(enemy => {
                    enemy.releaseImpale();
                });
                this.impaledEnemies.clear();
                
                this.isCharging = false;
                this.attackEndTime = Date.now() + this.attackRecoveryDuration;
            } else {
                // 冲锋中，控制玩家移动并检测碰撞
                const chargeVx = Math.cos(this.chargeDirection) * this.chargeSpeed;
                const chargeVy = Math.sin(this.chargeDirection) * this.chargeSpeed;
                
                // 检查是否会撞墙
                const nextX = player.x + chargeVx;
                const nextY = player.y + chargeVy;
                const willHitWall = nextX < 0 || nextX + player.width > window.innerWidth || 
                                   nextY < 0 || nextY + player.height > window.innerHeight;
                
                if (willHitWall) {
                    // 撞墙了，立即结束冲锋
                    this.impaledEnemies.forEach(enemy => {
                        enemy.releaseImpale();
                    });
                    this.impaledEnemies.clear();
                    
                    this.isCharging = false;
                    this.attackEndTime = Date.now() + this.attackRecoveryDuration;
                } else {
                    // 正常冲锋 - 镭射长枪需要控制玩家移动来实现冲锋效果
                    player.vx = chargeVx;
                    player.vy = chargeVy;
                    
                    // 让所有被扎穿的敌人跟随移动（仍然保持这个功能）
                    this.impaledEnemies.forEach(enemy => {
                        enemy.vx = chargeVx;
                        enemy.vy = chargeVy;
                    });
                    
                    // 检测与敌人的碰撞
                    this.checkChargeCollision(player);
                }
            }
        }
        
        // 清理过期的击中特效
        this.spearTrails = this.spearTrails.filter(effect => {
            return Date.now() - effect.startTime < effect.duration;
        });
    }
    
    draw(ctx, player) {
        // 绘制长枪冲锋特效
        if (this.isCharging) {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 绘制长枪轨迹
            const spearLength = 60;
            const spearEndX = playerCenterX + Math.cos(this.chargeDirection) * spearLength;
            const spearEndY = playerCenterY + Math.sin(this.chargeDirection) * spearLength;
            
            // 长枪主体（青蓝色光束）
            ctx.strokeStyle = '#00CCFF';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(playerCenterX, playerCenterY);
            ctx.lineTo(spearEndX, spearEndY);
            ctx.stroke();
            
            // 长枪锋刃（白色高亮）
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(spearEndX - Math.cos(this.chargeDirection) * 20, spearEndY - Math.sin(this.chargeDirection) * 20);
            ctx.lineTo(spearEndX, spearEndY);
            ctx.stroke();
            
            // 冲锋尾迹
            const trailLength = 50;
            const trailEndX = playerCenterX - Math.cos(this.chargeDirection) * trailLength;
            const trailEndY = playerCenterY - Math.sin(this.chargeDirection) * trailLength;
            
            const gradient = ctx.createLinearGradient(playerCenterX, playerCenterY, trailEndX, trailEndY);
            gradient.addColorStop(0, 'rgba(0, 204, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 204, 255, 0)');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(playerCenterX, playerCenterY);
            ctx.lineTo(trailEndX, trailEndY);
            ctx.stroke();
            
            // 冲锋能量场
            ctx.strokeStyle = '#00FFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(playerCenterX, playerCenterY, 30, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
        
        // 绘制击中特效
        this.spearTrails.forEach(effect => {
            const elapsed = Date.now() - effect.startTime;
            const alpha = Math.max(0, 1 - elapsed / effect.duration);
            
            ctx.save();
            ctx.globalAlpha = alpha;
            
            // 击中爆炸效果
            ctx.strokeStyle = '#FFFF00'; // 金黄色
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, 15 * (elapsed / effect.duration), 0, Math.PI * 2);
            ctx.stroke();
            
            // 击中火花
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI * 2 / 6) * i;
                const sparkX = effect.x + Math.cos(angle) * 10;
                const sparkY = effect.y + Math.sin(angle) * 10;
                ctx.fillRect(sparkX - 1, sparkY - 1, 2, 2);
            }
            
            ctx.restore();
        });
    }
    
    getStatus() {
        let statusText = '';
        let color = 'white';
        
        if (this.isCharging) {
            statusText = '冲锋中！';
            color = '#00CCFF';
        } else if (Date.now() < this.attackEndTime) {
            statusText = '恢复中';
            color = '#CC6666';
        } else if (!this.canUse()) {
            const cooldownRemaining = this.getCooldownRemaining();
            statusText = `冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`;
            color = '#CC6666';
        } else {
            statusText = '就绪';
            color = 'white';
        }
        
        return { text: statusText, color: color };
    }
}

// 导弹类
class Missile {
    constructor(x, y, targetX, targetY, damage, speed = 8, bossType = null) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.damage = damage;
        this.maxSpeed = speed; // 最大速度
        this.currentSpeed = speed * 0.6; // 初始速度为最大速度的60%
        this.shouldDestroy = false;
        this.bossType = bossType; // Boss类型：null(玩家), 'crimson_king'(血红之王), 'sublime_moon'(冰之姬)
        
        // 导弹追踪参数
        this.maxLifetime = 3000; // 3秒最大飞行时间
        this.startTime = Date.now();
        this.trackingRadius = 160; // 追踪半径
        this.currentTarget = null;
        
        // 加速参数
        this.accelerationDuration = 300; // 前0.3秒加速
        
        // 视觉效果
        this.trail = []; // 尾迹粒子
        this.maxTrailLength = 8;
        
        // 计算初始方向
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.vx = (dx / distance) * this.currentSpeed;
            this.vy = (dy / distance) * this.currentSpeed;
        } else {
            this.vx = 0;
            this.vy = this.currentSpeed;
        }
    }
    
    update() {
        // 检查是否超时
        if (Date.now() - this.startTime > this.maxLifetime) {
            this.explode();
            return;
        }
        
        // 处理加速逻辑
        this.updateSpeed();
        
        // 处理延迟制导逻辑
        if (this.isBossMissileDelayed) {
            this.updateDelayedGuidance();
        } else {
        // 寻找最近的敌人进行追踪
        this.findTarget();
        
        // 如果有目标，调整飞行方向
        if (this.currentTarget) {
            this.trackTarget();
            }
        }
        
        // 更新位置
        this.x += this.vx;
        this.y += this.vy;
        
        // 添加尾迹点
        this.trail.push({ x: this.x, y: this.y, time: Date.now() });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // 检查边界
        if (this.x < 0 || this.x > GAME_CONFIG.WIDTH || 
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.explode();
        }
        
        // 检查碰撞
        this.checkCollisions();
    }
    
    findTarget() {
        // 反转导弹专门追踪玩家
        if (this.isReversed) {
            if (game.player) {
                this.currentTarget = game.player;
            }
            return;
        }
        
        // 计算飞行时间和追踪范围
        const elapsedTime = Date.now() - this.startTime;
        const strongTrackingDuration = this.strongTrackingDuration || 1100; // 前1.1秒强追踪（超级导弹为4.1秒）
        
        let trackingRadius;
        if (elapsedTime <= strongTrackingDuration) {
            // 强追踪期间：大幅扩大追踪范围
            trackingRadius = this.isSuperMissile ? 630 : 580; // 超级导弹追踪范围更大
        } else {
            // 追踪衰减期间：保持原有范围，但会因为追踪强度降低而逐渐失效
            trackingRadius = this.trackingRadius; // 100像素（超级导弹为140像素）
        }
        
        let closestTarget = null;
        let closestDistance = trackingRadius;
        
        if (this.isBossMissile) {
            // Boss导弹追踪玩家
            if (game.player) {
                const dx = game.player.x + game.player.width / 2 - this.x;
                const dy = game.player.y + game.player.height / 2 - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < closestDistance) {
                    closestTarget = game.player;
                }
            }
        } else {
            // 玩家导弹追踪敌人和Boss
            const allEnemies = [...game.enemies];
            if (game.boss) {
                let bossTargetable = true;
                if (game.boss instanceof StarDevourer) {
                    // 隐身状态：二阶段且不在检测范围内
                    if (game.boss.phaseTwo.activated && game.boss.phaseTwo.isInvisible &&
                        !game.boss.isWithinDetectionRange()) {
                        bossTargetable = false;
                    }
                    // 失明技能激活时不可锁定
                    if (game.boss.blindnessSkill && game.boss.blindnessSkill.isActive) {
                        bossTargetable = false;
                    }
                }
                if (bossTargetable) {
                    allEnemies.push(game.boss);
                }
            }
            
            allEnemies.forEach(enemy => {
                const dx = enemy.x + enemy.width / 2 - this.x;
                const dy = enemy.y + enemy.height / 2 - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < closestDistance) {
                    closestTarget = enemy;
                    closestDistance = distance;
                }
            });
        }
        
        this.currentTarget = closestTarget;
    }
    
    updateSpeed() {
        const elapsedTime = Date.now() - this.startTime;
        
        if (elapsedTime <= this.accelerationDuration) {
            // 前0.3秒加速期间：从60%线性加速到100%最大速度
            const accelerationProgress = elapsedTime / this.accelerationDuration;
            const minSpeedRatio = 0.6; // 最小速度比例
            const speedRatio = minSpeedRatio + (1 - minSpeedRatio) * accelerationProgress;
            this.currentSpeed = this.maxSpeed * speedRatio;
        } else {
            // 0.3秒后：保持最大速度
            this.currentSpeed = this.maxSpeed;
        }
    }
    
    // 延迟制导更新逻辑
    updateDelayedGuidance() {
        const elapsedTime = Date.now() - this.delayStartTime;
        
        if (elapsedTime < this.delayDuration) {
            // 延迟期间：直线飞行
            return;
        }
        
        // 延迟结束：开始制导玩家
        if (!game.player) return;
        
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const missileCenterX = this.x;
        const missileCenterY = this.y;
        
        // 检查距离是否在制导范围内
        const distance = Math.sqrt(
            Math.pow(playerCenterX - missileCenterX, 2) + 
            Math.pow(playerCenterY - missileCenterY, 2)
        );
        
        if (distance <= this.guideRange) {
            // 在制导范围内，设置玩家为目标
            this.currentTarget = game.player;
            this.trackTarget();
        }
    }
    
    trackTarget() {
        if (!this.currentTarget) return;
        
        // 反转导弹有更强的追踪能力
        if (this.isReversed) {
            const targetX = this.currentTarget.x + this.currentTarget.width / 2;
            const targetY = this.currentTarget.y + this.currentTarget.height / 2;
            
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                // 反转导弹有更强的追踪转向率
                const turnRate = 0.25; // 反转导弹转向更快
                
                const newVx = (dx / distance) * this.currentSpeed;
                const newVy = (dy / distance) * this.currentSpeed;
                
                this.vx = this.vx * (1 - turnRate) + newVx * turnRate;
                this.vy = this.vy * (1 - turnRate) + newVy * turnRate;
                
                // 保持速度恒定
                const actualSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (actualSpeed > 0) {
                    this.vx = (this.vx / actualSpeed) * this.currentSpeed;
                    this.vy = (this.vy / actualSpeed) * this.currentSpeed;
                }
            }
            return;
        }
        
        // 计算飞行时间
        const elapsedTime = Date.now() - this.startTime;
        const strongTrackingDuration = this.strongTrackingDuration || 1100; // 前1.1秒强追踪（超级导弹为4.1秒）
        const fadeOutDuration = this.isSuperMissile ? 1000 : 500; // 超级导弹渐变时间更长
        
        // 计算追踪强度
        let trackingStrength = 0;
        
        if (elapsedTime <= strongTrackingDuration) {
            // 强追踪期间：强追踪
            trackingStrength = 1.0;
        } else if (elapsedTime <= strongTrackingDuration + fadeOutDuration) {
            // 追踪衰减期间：追踪强度线性减弱
            const fadeProgress = (elapsedTime - strongTrackingDuration) / fadeOutDuration;
            trackingStrength = 1.0 - fadeProgress;
        } else {
            // 衰减期后：完全失去追踪，直线飞行
            trackingStrength = 0;
        }
        
        // 如果追踪强度为0，直接返回（保持当前弹道）
        if (trackingStrength <= 0) return;
        
        const targetX = this.currentTarget.x + this.currentTarget.width / 2;
        const targetY = this.currentTarget.y + this.currentTarget.height / 2;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // 动态转向率：强追踪时更高，随时间减弱
            const baseTurnRate = 0.15; // 提升基础强追踪转向率
            const turnRate = baseTurnRate * trackingStrength;
            
            const newVx = (dx / distance) * this.currentSpeed;
            const newVy = (dy / distance) * this.currentSpeed;
            
            this.vx = this.vx * (1 - turnRate) + newVx * turnRate;
            this.vy = this.vy * (1 - turnRate) + newVy * turnRate;
            
            // 保持速度恒定
            const actualSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (actualSpeed > 0) {
                this.vx = (this.vx / actualSpeed) * this.currentSpeed;
                this.vy = (this.vy / actualSpeed) * this.currentSpeed;
            }
        }
    }
    
    checkCollisions() {
        // 检查反转导弹与玩家的碰撞
        if (this.isReversed && game.player) {
            const dx = game.player.x + game.player.width / 2 - this.x;
            const dy = game.player.y + game.player.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 碰撞检测
            if (distance < (game.player.width + game.player.height) / 4 + 8) {
                // 反转导弹击中玩家
                game.player.takeDamage(this.damage);
                this.explode();
                return;
            }
        }
        
        // 获取所有敌人
        const allEnemies = [...game.enemies];
        
        // 如果是Boss导弹，不要检测与Boss的碰撞；如果是玩家导弹，可以撞击Boss
        if (!this.isBossMissile && game.boss) {
            allEnemies.push(game.boss);
        }
        
        allEnemies.forEach(enemy => {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 碰撞检测
            if (distance < (enemy.width + enemy.height) / 4 + 8) {
                this.explode();
            }
        });
    }
    
    explode() {
        // 爆炸伤害范围
        const explosionRadius = this.isSuperMissile ? 400 : 80; // 超级导弹400像素范围
        
        // 获取所有敌人
        const allEnemies = [...game.enemies];
        
        // 如果是Boss导弹，不要伤害Boss自己；如果是玩家导弹，可以伤害Boss
        // 被拦截的导弹不对丑皇造成伤害
        if (!this.isBossMissile && game.boss) {
            if (this.intercepted && game.boss instanceof UglyEmperor) {
                // 被丑皇子弹/燃烧瓶拦截的导弹，不伤害丑皇
            } else {
                allEnemies.push(game.boss);
            }
        }
        
        // 对范围内的敌人造成伤害（反转导弹不伤害敌人）
        if (!this.isReversed) {
        allEnemies.forEach(enemy => {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= explosionRadius) {
                // 距离越近伤害越高
                const damageMultiplier = Math.max(0.3, 1 - distance / explosionRadius);
                    const actualDamage = Math.max(1, Math.round(this.damage * damageMultiplier));
                    
                    // 为丑皇添加伤害来源标识
                    let damageSource = 'missile';
                    if (enemy instanceof UglyEmperor) {
                        damageSource = 'missile'; // 导弹伤害
                    }
                
                    const isDead = enemy.takeDamage(actualDamage, damageSource);
                gameState.score += actualDamage;
                    gameState.totalDamage += actualDamage;
                
                if (isDead) {
                        if (enemy instanceof Boss || enemy instanceof SublimeMoon || enemy instanceof UglyEmperor) {
                        game.boss = null;
                        gameState.score += 100;
                        gameState.bossKillCount++;
                        
                        // 根据游戏模式决定下一步
                        if (gameState.selectedGameMode === 'BOSS_BATTLE') {
                                // 特定关卡胜利，其他关卡继续
                                if (gameState.selectedLevel === 'CRIMSON_KING' || gameState.selectedLevel === 'SUBLIME_MOON' || gameState.selectedLevel === 'STAR_DEVOURER' || gameState.selectedLevel === 'UGLY_EMPEROR') {
                                    // 关卡完成：胜利并回到主菜单
                                    gameState.bossSpawned = false; // 确保不会生成新Boss
                                    game.showVictoryAndReturnToMenu();
                                } else {
                                    // 其他Boss战模式：立即生成新Boss
                            gameState.bossSpawned = false;
                                    if (gameState.selectedLevel) {
                                        game.spawnBossForLevel(gameState.selectedLevel);
                                    }
                                }
                        }
                    } else {
                        const enemyIndex = game.enemies.indexOf(enemy);
                        if (enemyIndex > -1) {
                            game.enemies.splice(enemyIndex, 1);
                            gameState.score += 10;
                        }
                    }
                }
            }
        });
        }
        
        // 创建爆炸效果
        this.createExplosion();
        
        // 标记销毁
        this.shouldDestroy = true;
        updateUI();
    }
    
    createExplosion() {
        // 添加到全局爆炸效果数组（需要在game中处理）
        if (!game.explosions) {
            game.explosions = [];
        }
        
        game.explosions.push({
            x: this.x,
            y: this.y,
            startTime: Date.now(),
            duration: this.isSuperMissile ? 1000 : 500, // 超级导弹爆炸持续时间更长
            isBossMissile: this.isBossMissile || false, // 添加导弹类型标记
            isSuperMissile: this.isSuperMissile || false, // 添加超级导弹标记
            explosionRadius: this.isSuperMissile ? 400 : 80 // 爆炸范围
        });
    }
    
    draw(ctx) {
        // 根据导弹类型选择颜色
        const isBoss = this.isBossMissile;
        let trailColor, bodyColor, headColor, flameColor;
        
        // 检查是否为超级导弹（紫色）
        if (this.isSuperMissile) {
            trailColor = '#800080';  // 紫色尾迹
            bodyColor = '#4B0082';   // 深紫色
            headColor = '#9370DB';   // 中紫色
            flameColor = '#8A2BE2';  // 蓝紫色
        } else if (this.isReversed) {
            trailColor = '#800080';  // 紫色尾迹
            bodyColor = '#4B0082';   // 深紫色
            headColor = '#9370DB';   // 中紫色
            flameColor = '#8A2BE2';  // 蓝紫色
        } else if (this.bossType === 'sublime_moon') {
            // 冰之姬：青蓝色主题
            trailColor = '#4682B4';  // 钢蓝色
            bodyColor = '#1E90FF';   // 道奇蓝
            headColor = '#00BFFF';   // 深天蓝
            flameColor = '#4169E1';  // 皇家蓝
        } else if (isBoss || this.bossType === 'crimson_king') {
            // 血红之王：红色主题
            trailColor = '#DC143C';  // 深红色
            bodyColor = '#8B0000';   // 暗红色
            headColor = '#FF0000';   // 亮红色
            flameColor = '#B22222';  // 火砖红
        } else {
            // 玩家导弹：金色主题
            trailColor = '#FFD700';  // 金黄色
            bodyColor = '#FF4500';   // 橙色
            headColor = '#FFFFFF';   // 白色
            flameColor = '#FF8C00';  // 深橙色
        }
        
        // 绘制尾迹
        if (this.trail.length > 1) {
            ctx.save();
            
            // Boss导弹的尾迹更加血腥和威胁性
            if (isBoss) {
                // 绘制血红色渐变尾迹
                for (let i = 1; i < this.trail.length; i++) {
                    const alpha = (i / this.trail.length) * 0.8;
                    const width = 4 + (i / this.trail.length) * 2; // 渐变宽度
                    
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = trailColor;
                    ctx.lineWidth = width;
                    
                    ctx.beginPath();
                    ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
                    ctx.lineTo(this.trail[i].x, this.trail[i].y);
                    ctx.stroke();
                }
                
                // 添加Boss类型粒子效果
                ctx.globalAlpha = 0.6;
                this.trail.forEach((point, index) => {
                    const trailAlpha = index / this.trail.length;
                    if (trailAlpha > 0.5 && Math.random() < 0.3) { // 随机粒子
                        const particleColor = this.bossType === 'sublime_moon' ? '#87CEEB' : '#FF4444';
                        ctx.fillStyle = particleColor;
                        ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
                    }
                });
            } else {
                // 玩家导弹的金黄色尾迹
                ctx.strokeStyle = trailColor;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.7;
                
                ctx.beginPath();
                ctx.moveTo(this.trail[0].x, this.trail[0].y);
                for (let i = 1; i < this.trail.length; i++) {
                    const alpha = i / this.trail.length;
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.lineTo(this.trail[i].x, this.trail[i].y);
                }
                ctx.stroke();
            }
            
            ctx.restore();
        }
        
        // 计算导弹的运动角度
        const angle = Math.atan2(this.vy, this.vx);
        
        // 绘制旋转的导弹主体
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        
        // 根据导弹大小调整尺寸
        const size = this.size || 1; // 默认为1倍大小
        const bodyWidth = 8 * size;
        const bodyHeight = 4 * size;
        const headWidth = 3 * size;
        const headHeight = 2 * size;
        const flameWidth = 4 * size;
        const flameHeight = 2 * size;
        
        // 导弹主体
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-bodyWidth/2, -bodyHeight/2, bodyWidth, bodyHeight);
        
        // 导弹头部（朝向运动方向）
        ctx.fillStyle = headColor;
        ctx.fillRect(bodyWidth/2, -headHeight/2, headWidth, headHeight);
        
        // 导弹尾焰（朝向运动反方向）
        ctx.fillStyle = flameColor;
        ctx.fillRect(-bodyWidth/2 - flameWidth, -flameHeight/2, flameWidth, flameHeight);
        
        // Boss导弹额外的威胁效果
        if (isBoss) {
            ctx.globalAlpha = 0.5;
            const borderColor = this.bossType === 'sublime_moon' ? '#00CCFF' : '#FF0000';
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(-bodyWidth/2 - 1, -bodyHeight/2 - 1, bodyWidth + 2, bodyHeight + 2); // Boss边框
        }
        
        // 超级导弹额外的紫色光环效果
        if (this.isSuperMissile) {
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = '#9370DB';
            ctx.lineWidth = 2;
            ctx.strokeRect(-bodyWidth/2 - 2, -bodyHeight/2 - 2, bodyWidth + 4, bodyHeight + 4);
        }
        
        ctx.restore();
    }
    
    collidesWith(target) {
        const dx = target.x + target.width / 2 - this.x;
        const dy = target.y + target.height / 2 - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (target.width + target.height) / 4 + 8;
    }
}

// 8连导弹发射器类
class MissileLauncher extends Weapon {
    constructor(isShoulder = false) {
        super({
            type: 'missile_launcher',
            name: isShoulder ? '15连导弹发射器' : '8连导弹发射器',
            damage: 3, // 每枚导弹3点伤害
            cooldown: 4000 // 4秒冷却
        });
        
        this.missilesPerSalvo = isShoulder ? 15 : 8; // 肩部15连，手部8连
        this.range = 25 * 50; // 射程25单位
        this.missileSpeed = 16; // 导弹飞行速度
        this.launchDelay = 100; // 导弹发射间隔（毫秒）
        
        this.isLaunching = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
    }
    
    canUse() {
        return super.canUse() && !this.isLaunching;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        this.startLaunch(player);
        return true;
    }
    
    startLaunch(player) {
        this.isLaunching = true;
        this.launchStartTime = Date.now();
        this.missilesFired = 0;
        
        // 立即发射第一枚导弹
        this.fireMissile(player);
        this.missilesFired++;
    }
    
    fireMissile(player) {
        const launchX = player.x + player.width / 2;
        const launchY = player.y + player.height / 2;
        
        let targetX, targetY;
        
        // 根据锁定模式确定目标
        if (gameState.lockMode === 'manual') {
            targetX = mouse.x;
            targetY = mouse.y;
        } else {
            const target = player.getCurrentTarget();
            if (target) {
                targetX = target.x + target.width / 2;
                targetY = target.y + target.height / 2;
            } else {
                // 没有目标，朝向当前方向发射
                const angle = player.direction * Math.PI / 180;
                targetX = launchX + Math.cos(angle) * 300;
                targetY = launchY + Math.sin(angle) * 300;
            }
        }
        
        // 添加一些随机扩散，让4枚导弹不完全重叠
        const spread = 30;
        const randomOffsetX = (Math.random() - 0.5) * spread;
        const randomOffsetY = (Math.random() - 0.5) * spread;
        
        const missile = new Missile(
            launchX, 
            launchY, 
            targetX + randomOffsetX, 
            targetY + randomOffsetY, 
            this.damage, 
            this.missileSpeed
        );
        
        // 确保missiles数组存在
        if (!game.missiles) {
            game.missiles = [];
        }
        
        game.missiles.push(missile);
    }
    
    update(player) {
        // 更新发射状态
        if (this.isLaunching) {
            const elapsed = Date.now() - this.launchStartTime;
            const nextMissileTime = this.missilesFired * this.launchDelay;
            
            if (elapsed >= nextMissileTime && this.missilesFired < this.missilesPerSalvo) {
                this.fireMissile(player);
                this.missilesFired++;
            }
            
            if (this.missilesFired >= this.missilesPerSalvo) {
                this.isLaunching = false;
            }
        }
    }
    
    draw(ctx, player) {
        // 绘制发射效果
        if (this.isLaunching) {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 发射器光环
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(playerCenterX, playerCenterY, 35, 0, Math.PI * 2);
            ctx.stroke();
            
            // 内层发射光环
            ctx.strokeStyle = '#FF4500';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(playerCenterX, playerCenterY, 25, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
    }
    
    getStatus() {
        if (this.isLaunching) {
            const remaining = this.missilesPerSalvo - this.missilesFired;
            return { text: `发射中... (${remaining}枚)`, color: '#FFD700' };
        }
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: `冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        
        return { text: '准备就绪', color: 'white' };
    }
}

// 脉冲护盾类（隐藏机能）
class PulseShield extends Weapon {
    constructor() {
        super({
            type: 'pulse_shield',
            name: '脉冲护盾',
            damage: 0, // 护盾不造成伤害
            cooldown: 40000 // 40秒冷却
        });
        
        this.isActive = false;
        this.activationTime = 0;
        this.duration = 15000; // 15秒持续时间
        this.damageReduction = 0.7; // 70%伤害减免
        this.shieldEffect = {
            pulsePhase: 0,
            particles: []
        };
    }
    
    canUse() {
        return !this.isActive && super.canUse();
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        this.isActive = true;
        this.activationTime = Date.now();
        
        // 初始化护盾特效
        this.shieldEffect.pulsePhase = 0;
        this.shieldEffect.particles = [];
        
        return true;
    }
    
    update(player) {
        if (this.isActive) {
            const elapsed = Date.now() - this.activationTime;
            
            // 检查护盾是否过期
            if (elapsed >= this.duration) {
                this.isActive = false;
                this.shieldEffect.particles = [];
                return;
            }
            
            // 更新护盾特效
            this.shieldEffect.pulsePhase += 0.05;
            
            // 添加护盾粒子效果
            if (Math.random() < 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 40 + Math.sin(this.shieldEffect.pulsePhase) * 5;
                this.shieldEffect.particles.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    life: 1.0,
                    angle: angle
                });
            }
            
            // 更新粒子
            this.shieldEffect.particles = this.shieldEffect.particles.filter(particle => {
                particle.life -= 0.02;
                return particle.life > 0;
            });
        }
    }
    
    draw(ctx, player) {
        if (!this.isActive) return;
        
        const centerX = player.x + player.width / 2;
        const centerY = player.y + player.height / 2;
        
        ctx.save();
        
        // 绘制主护盾圆环
        const baseRadius = 40;
        const pulseRadius = baseRadius + Math.sin(this.shieldEffect.pulsePhase) * 5;
        
        // 外圈护盾环
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.6 + Math.sin(this.shieldEffect.pulsePhase) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 内圈护盾环
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.8 + Math.sin(this.shieldEffect.pulsePhase * 1.5) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulseRadius * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        
        // 绘制护盾粒子
        this.shieldEffect.particles.forEach(particle => {
            const x = centerX + particle.x;
            const y = centerY + particle.y;
            const alpha = particle.life * 0.7;
            
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // 绘制护盾能量波动效果
        for (let i = 0; i < 3; i++) {
            const waveRadius = pulseRadius * (0.3 + i * 0.25);
            const waveAlpha = 0.1 + Math.sin(this.shieldEffect.pulsePhase + i) * 0.05;
            
            ctx.fillStyle = `rgba(0, 255, 255, ${waveAlpha})`;
            ctx.beginPath();
            ctx.arc(centerX, centerY, waveRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    // 检查护盾是否激活
    isDamageReduced() {
        return this.isActive;
    }
    
    // 获取伤害减免比例
    getDamageReduction() {
        return this.isActive ? this.damageReduction : 0;
    }
    
    getStatus() {
        if (this.isActive) {
            const remaining = this.duration - (Date.now() - this.activationTime);
            return { text: `护盾中: ${(remaining / 1000).toFixed(1)}秒`, color: '#00FFFF' };
        }
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: `冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        
        return { text: '准备就绪', color: '#00FFFF' };
    }
}



// EMP电磁脉冲（隐藏机能）
class EMP extends Weapon {
    constructor() {
        super({
            type: 'emp',
            name: 'EMP电磁脉冲',
            damage: 100,
            cooldown: 30000
        });
        
        this.radius = 350;
        this.stunDuration = 500;
        this.empEffect = null;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        
        // 对范围内所有敌人造成伤害和僵直
        const targets = [];
        if (game.boss && game.boss.health > 0) targets.push(game.boss);
        if (game.enemies) {
            for (const e of game.enemies) {
                if (e.health > 0) targets.push(e);
            }
        }
        
        for (const t of targets) {
            const tx = t.x + t.width / 2;
            const ty = t.y + t.height / 2;
            const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
            if (dist >= this.radius) continue;
            
            const falloff = 1 - dist / this.radius;
            const dmg = Math.max(1, Math.round(this.damage * falloff));
            t.takeDamage(dmg);
            t.stunned = true;
            t.stunEndTime = Date.now() + this.stunDuration;
            t.vx = 0;
            t.vy = 0;
        }
        
        // 启动视觉特效
        this.empEffect = {
            x: cx,
            y: cy,
            startTime: Date.now(),
            duration: 400
        };
        
        return true;
    }
    
    update(player) {
        if (this.empEffect) {
            if (Date.now() - this.empEffect.startTime >= this.empEffect.duration) {
                this.empEffect = null;
            }
        }
    }
    
    draw(ctx, player) {
        if (!this.empEffect) return;
        
        const e = this.empEffect;
        const elapsed = Date.now() - e.startTime;
        const progress = elapsed / e.duration;
        
        ctx.save();
        
        // 扩散冲击波
        const waveRadius = this.radius * progress;
        const waveAlpha = 0.6 * (1 - progress);
        
        ctx.strokeStyle = `rgba(100, 200, 255, ${waveAlpha})`;
        ctx.lineWidth = 4 * (1 - progress) + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, waveRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 内圈光芒
        const innerAlpha = 0.4 * (1 - progress);
        const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, waveRadius * 0.6);
        gradient.addColorStop(0, `rgba(150, 220, 255, ${innerAlpha})`);
        gradient.addColorStop(1, `rgba(50, 100, 200, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(e.x, e.y, waveRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // 电弧效果
        if (progress < 0.7) {
            const arcCount = 8;
            ctx.strokeStyle = `rgba(180, 230, 255, ${0.8 * (1 - progress)})`;
            ctx.lineWidth = 1.5;
            for (let i = 0; i < arcCount; i++) {
                const angle = (Math.PI * 2 / arcCount) * i + progress * 3;
                const len = waveRadius * (0.3 + Math.random() * 0.5);
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                let px = e.x, py = e.y;
                const segments = 5;
                for (let s = 1; s <= segments; s++) {
                    const r = len * s / segments;
                    const jitter = (Math.random() - 0.5) * 20;
                    const nx = e.x + Math.cos(angle + jitter * 0.02) * r + jitter;
                    const ny = e.y + Math.sin(angle + jitter * 0.02) * r + jitter;
                    ctx.lineTo(nx, ny);
                    px = nx; py = ny;
                }
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
    
    getStatus() {
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: `冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        return { text: '准备就绪', color: '#66CCFF' };
    }
}

// 超级武器类 - 占用两个肩部槽位，使用导弹发射器逻辑但只发射1枚导弹
class SuperWeapon extends Weapon {
    constructor() {
        super({
            type: 'super_weapon',
            name: '超级导弹',
            damage: 100, // 100点伤害
            cooldown: 999999 // 一次战斗只能用一次，设置很长的冷却
        });
        
        this.isUsed = false; // 是否已经使用过
        this.missilesPerSalvo = 1; // 只发射1枚导弹
        this.range = 25 * 50; // 射程25单位
        this.missileSpeed = 16; // 导弹飞行速度
        this.launchDelay = 100; // 导弹发射间隔（毫秒）
        
        this.isLaunching = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
    }
    
    canUse() {
        // 如果已经使用过，就不能再使用
        if (this.isUsed) {
            return false;
        }
        return super.canUse() && !this.isLaunching;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        // 标记为已使用
        this.isUsed = true;
        this.lastUseTime = Date.now();
        this.startLaunch(player);
        return true;
    }
    
    startLaunch(player) {
        this.isLaunching = true;
        this.launchStartTime = Date.now();
        this.missilesFired = 0;
        
        // 立即发射第一枚导弹
        this.fireSuperMissile(player);
        this.missilesFired++;
    }
    
    fireSuperMissile(player) {
        const launchX = player.x + player.width / 2;
        const launchY = player.y + player.height / 2;
        
        let targetX, targetY;
        
        // 根据锁定模式确定目标
        if (gameState.lockMode === 'manual') {
            targetX = mouse.x;
            targetY = mouse.y;
        } else {
            const target = player.getCurrentTarget();
            if (target) {
                targetX = target.x + target.width / 2;
                targetY = target.y + target.height / 2;
            } else {
                // 没有目标，朝向当前方向发射
                const angle = player.direction * Math.PI / 180;
                targetX = launchX + Math.cos(angle) * 300;
                targetY = launchY + Math.sin(angle) * 300;
            }
        }
        
        // 创建超级导弹
        const missile = new Missile(
            launchX, 
            launchY, 
            targetX, 
            targetY, 
            this.damage, // 100点伤害
            this.missileSpeed * 0.85, // 速度减少15%
            null // 不是Boss导弹
        );
        
        // 设置超级导弹的特殊属性
        missile.isSuperMissile = true; // 标记为超级导弹
        missile.trackingRadius = 140; // 增强诱导性能到40%（从100增加到140）
        missile.strongTrackingDuration = 4100; // 强诱导时间增加到4.1秒（从1.1秒增加3秒）
        missile.size = 3; // 大小增大到原来的3倍
        
        // 确保missiles数组存在
        if (!game.missiles) {
            game.missiles = [];
        }
        
        game.missiles.push(missile);
    }
    
    update(player) {
        // 更新发射状态
        if (this.isLaunching) {
            const elapsed = Date.now() - this.launchStartTime;
            const nextMissileTime = this.missilesFired * this.launchDelay;
            
            if (elapsed >= nextMissileTime && this.missilesFired < this.missilesPerSalvo) {
                this.fireSuperMissile(player);
                this.missilesFired++;
            }
            
            if (this.missilesFired >= this.missilesPerSalvo) {
                this.isLaunching = false;
            }
        }
    }
    
    draw(ctx, player) {
        // 绘制发射效果
        if (this.isLaunching) {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            
            ctx.save();
            ctx.globalAlpha = 0.8;
            
            // 超级武器发射器光环 - 红色主题
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(playerCenterX, playerCenterY, 50, 0, Math.PI * 2);
            ctx.stroke();
            
            // 内层发射光环
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(playerCenterX, playerCenterY, 30, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
    }
    
    getStatus() {
        if (this.isUsed) {
            return { text: '已使用', color: '#FF6666' };
        } else if (this.isLaunching) {
            return { text: '发射中...', color: '#FFD700' };
        } else if (this.canUse()) {
            return { text: '准备就绪', color: '#FFD700' };
        } else {
            const cooldown = this.getCooldownRemaining();
            return { text: `冷却中 ${(cooldown / 1000).toFixed(1)}s`, color: '#FF6666' };
        }
    }
}

// 近防炮（CIWS）- 自动拦截制导武器
class CIWS extends Weapon {
    constructor() {
        super({
            type: 'ciws',
            name: '近防炮',
            damage: 1,
            cooldown: 0
        });
        
        this.fireRate = 30;
        this.magazineSize = 30;
        this.currentAmmo = this.magazineSize;
        this.reloading = false;
        this.reloadStartTime = 0;
        this.reloadDuration = 1400;
        this.bulletSpeed = 50;
        this.range = 800;
        this.lastFire = 0;
    }
    
    use(player) {
        // 近防炮完全自动，不需要手动触发
    }
    
    findPriorityTarget(player) {
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        
        const findNearest = (list, isGuided) => {
            if (!list) return null;
            let best = null;
            let bestDist = this.range;
            for (const t of list) {
                if (t.shouldDestroy) continue;
                const tx = (t.x != null ? t.x : 0) + (t.width || 0) / 2;
                const ty = (t.y != null ? t.y : 0) + (t.height || 0) / 2;
                const dist = Math.sqrt((tx - px) ** 2 + (ty - py) ** 2);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { obj: t, x: tx, y: ty, isGuidedWeapon: isGuided };
                }
            }
            return best;
        };
        
        // 严格优先级：有更高优先级目标时不攻击低优先级
        let target;
        
        // 优先级1：Boss导弹
        target = findNearest(game.bossMissiles, true);
        if (target) return target;
        
        // 优先级2：月牙追踪弹
        target = findNearest(game.crescentBullets, true);
        if (target) return target;
        
        // 优先级3：被噬星者策反的玩家导弹
        if (game.missiles) {
            target = findNearest(game.missiles.filter(m => m.isReversed), true);
            if (target) return target;
        }
        
        // 优先级4：机雷
        if (game.mines) {
            const activeMines = game.mines.filter(m => !m.isExploded && !m.shouldDestroy);
            target = findNearest(activeMines, true);
            if (target) return target;
        }
        
        // 优先级5：敌人本体（boss + 普通敌人）
        const enemies = [];
        if (game.boss && game.boss.health > 0) enemies.push(game.boss);
        if (game.enemies) {
            for (const e of game.enemies) {
                if (e.health > 0) enemies.push(e);
            }
        }
        return findNearest(enemies, false);
    }
    
    update(player) {
        if (this.reloading) {
            if (Date.now() - this.reloadStartTime >= this.reloadDuration) {
                this.reloading = false;
                this.currentAmmo = this.magazineSize;
            }
            return;
        }
        
        if (this.currentAmmo <= 0) {
            this.reloading = true;
            this.reloadStartTime = Date.now();
            return;
        }
        
        const now = Date.now();
        const fireInterval = 1000 / this.fireRate;
        if (now - this.lastFire < fireInterval) return;
        
        const target = this.findPriorityTarget(player);
        if (!target) return;
        
        this.lastFire = now;
        this.currentAmmo--;
        
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        
        const dx = target.x - px;
        const dy = target.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const direction = dist > 0 ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
        
        const bullet = new CIWSBullet(
            px, py, direction, this.bulletSpeed, this.damage, this.range, target.isGuidedWeapon
        );
        
        if (!game.ciwsBullets) game.ciwsBullets = [];
        game.ciwsBullets.push(bullet);
        
        if (this.currentAmmo <= 0) {
            this.reloading = true;
            this.reloadStartTime = Date.now();
        }
    }
    
    getStatus() {
        if (this.reloading) return { text: '重装中...', color: '#CC6666' };
        return { text: `弹药: ${this.currentAmmo}/${this.magazineSize}`, color: '#00FF88' };
    }
    
    draw(ctx, player) {
        // 近防炮无需特别的武器绘制
    }
}

// 近防炮子弹类
class CIWSBullet extends GameObject {
    constructor(x, y, direction, speed, damage, range, targetIsGuidedWeapon) {
        super(x, y, 3, 3, '#00FF88');
        this.direction = direction;
        this.speed = speed;
        this.damage = damage;
        this.maxRange = range;
        this.distanceTraveled = 0;
        this.startX = x;
        this.startY = y;
        this.targetIsGuidedWeapon = targetIsGuidedWeapon;
        
        const angleRad = direction * Math.PI / 180;
        this.vx = Math.cos(angleRad) * speed;
        this.vy = Math.sin(angleRad) * speed;
    }
    
    update() {
        const prevX = this.x;
        const prevY = this.y;
        super.update();
        
        this.distanceTraveled = Math.sqrt(
            (this.x - this.startX) ** 2 + (this.y - this.startY) ** 2
        );
        
        if (this.distanceTraveled > this.maxRange ||
            this.x < 0 || this.x > GAME_CONFIG.WIDTH ||
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
            return;
        }
        
        // 沿路径分步检测，防止高速子弹穿透目标
        const steps = Math.ceil(this.speed / 10);
        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const cx = prevX + (this.x - prevX) * t + this.width / 2;
            const cy = prevY + (this.y - prevY) * t + this.height / 2;
            const hitRadius = 14;
            
            // 检测击中Boss导弹（一发摧毁）
            if (game.bossMissiles) {
                for (let i = game.bossMissiles.length - 1; i >= 0; i--) {
                    const m = game.bossMissiles[i];
                    if (m.shouldDestroy) continue;
                    if (Math.sqrt((m.x - cx) ** 2 + (m.y - cy) ** 2) < hitRadius) {
                        m.shouldDestroy = true;
                        this.shouldDestroy = true;
                        return;
                    }
                }
            }
            
            // 检测击中月牙追踪弹（一发摧毁）
            if (game.crescentBullets) {
                for (let i = game.crescentBullets.length - 1; i >= 0; i--) {
                    const c = game.crescentBullets[i];
                    if (c.shouldDestroy) continue;
                    if (Math.sqrt((c.x + c.width / 2 - cx) ** 2 + (c.y + c.height / 2 - cy) ** 2) < hitRadius) {
                        c.shouldDestroy = true;
                        this.shouldDestroy = true;
                        return;
                    }
                }
            }
            
            // 检测击中被策反的导弹（一发摧毁）
            if (game.missiles) {
                for (let i = game.missiles.length - 1; i >= 0; i--) {
                    const m = game.missiles[i];
                    if (!m.isReversed || m.shouldDestroy) continue;
                    if (Math.sqrt((m.x - cx) ** 2 + (m.y - cy) ** 2) < hitRadius) {
                        m.shouldDestroy = true;
                        this.shouldDestroy = true;
                        return;
                    }
                }
            }
            
            // 检测击中机雷（100%伤害）
            if (game.mines) {
                for (let i = game.mines.length - 1; i >= 0; i--) {
                    const m = game.mines[i];
                    if (m.isExploded || m.shouldDestroy) continue;
                    const mx = m.x + m.width / 2;
                    const my = m.y + m.height / 2;
                    if (Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2) < hitRadius) {
                        m.takeDamage(this.damage);
                        this.shouldDestroy = true;
                        return;
                    }
                }
            }
        }
        
        // 对敌人本体造成伤害（40%概率造成1点伤害）
        if (game.boss && game.boss.health > 0 && this.collidesWith(game.boss)) {
            if (Math.random() < 0.4) game.boss.takeDamage(this.damage);
            this.shouldDestroy = true;
            return;
        }
        if (game.enemies) {
            for (const e of game.enemies) {
                if (e.health > 0 && this.collidesWith(e)) {
                    if (Math.random() < 0.4) e.takeDamage(this.damage);
                    this.shouldDestroy = true;
                    return;
                }
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#00FF88';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// 电浆场类
class PlasmaField {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = 1000;
        this.startTime = Date.now();
        this.damageInterval = 250;
        this.damage = 3;
        this.lastDamageTime = Date.now();
        this.shouldDestroy = false;
    }
    
    update() {
        if (Date.now() - this.startTime >= this.duration) {
            this.shouldDestroy = true;
            return;
        }
        
        if (Date.now() - this.lastDamageTime >= this.damageInterval) {
            this.lastDamageTime = Date.now();
            this.damageEnemies();
        }
    }
    
    damageEnemies() {
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0) {
            allEnemies.push(game.boss);
        }
        
        for (const enemy of allEnemies) {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= this.radius) {
                enemy.takeDamage(this.damage, 'plasma');
                gameState.score += this.damage;
                gameState.totalDamage += this.damage;
            }
        }
    }
    
    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;
        const alpha = Math.max(0, 0.7 * (1 - progress * 0.5));
        
        ctx.save();
        
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, `rgba(0, 255, 180, ${alpha * 0.6})`);
        gradient.addColorStop(0.4, `rgba(0, 200, 255, ${alpha * 0.35})`);
        gradient.addColorStop(0.7, `rgba(80, 120, 255, ${alpha * 0.2})`);
        gradient.addColorStop(1, 'rgba(0, 80, 200, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 电弧效果
        const arcCount = 4 + Math.floor(Math.random() * 3);
        ctx.strokeStyle = `rgba(100, 255, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00FFCC';
        ctx.shadowBlur = 6;
        for (let i = 0; i < arcCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const len = this.radius * (0.3 + Math.random() * 0.6);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            const segments = 3 + Math.floor(Math.random() * 3);
            for (let s = 1; s <= segments; s++) {
                const t = s / segments;
                const ax = this.x + Math.cos(angle) * len * t + (Math.random() - 0.5) * 12;
                const ay = this.y + Math.sin(angle) * len * t + (Math.random() - 0.5) * 12;
                ctx.lineTo(ax, ay);
            }
            ctx.stroke();
        }
        
        // 边缘脉冲环
        ctx.strokeStyle = `rgba(0, 220, 255, ${alpha * 0.4 * (0.5 + 0.5 * Math.sin(elapsed * 0.01))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (0.85 + 0.15 * Math.sin(elapsed * 0.008)), 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
}

// 电浆飞弹类 - 近炸引信
class PlasmaMissile {
    constructor(x, y, targetX, targetY, speed = 10) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.maxSpeed = speed;
        this.currentSpeed = speed * 0.6;
        this.shouldDestroy = false;
        
        this.fuseRadius = 55;
        this.fieldRadius = Math.round(this.fuseRadius * 1.3);
        
        this.maxLifetime = 3000;
        this.startTime = Date.now();
        this.trackingRadius = 160;
        this.currentTarget = null;
        this.strongTrackingDuration = 1100;
        this.accelerationDuration = 300;
        
        this.trail = [];
        this.maxTrailLength = 10;
        
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            this.vx = (dx / distance) * this.currentSpeed;
            this.vy = (dy / distance) * this.currentSpeed;
        } else {
            this.vx = 0;
            this.vy = this.currentSpeed;
        }
    }
    
    update() {
        if (Date.now() - this.startTime > this.maxLifetime) {
            this.detonate();
            return;
        }
        
        this.updateSpeed();
        this.findTarget();
        if (this.currentTarget) {
            this.trackTarget();
        }
        
        this.x += this.vx;
        this.y += this.vy;
        
        this.trail.push({ x: this.x, y: this.y, time: Date.now() });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        if (this.x < -20 || this.x > GAME_CONFIG.WIDTH + 20 ||
            this.y < -20 || this.y > GAME_CONFIG.HEIGHT + 20) {
            this.detonate();
            return;
        }
        
        this.checkProximity();
    }
    
    updateSpeed() {
        const elapsedTime = Date.now() - this.startTime;
        if (elapsedTime <= this.accelerationDuration) {
            const accelerationProgress = elapsedTime / this.accelerationDuration;
            const speedRatio = 0.6 + 0.4 * accelerationProgress;
            this.currentSpeed = this.maxSpeed * speedRatio;
        } else {
            this.currentSpeed = this.maxSpeed;
        }
    }
    
    findTarget() {
        const elapsedTime = Date.now() - this.startTime;
        let trackingRadius;
        if (elapsedTime <= this.strongTrackingDuration) {
            trackingRadius = 580;
        } else {
            trackingRadius = this.trackingRadius;
        }
        
        let closestTarget = null;
        let closestDistance = trackingRadius;
        
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0) {
            let bossTargetable = true;
            if (game.boss instanceof StarDevourer) {
                if (game.boss.phaseTwo.activated && game.boss.phaseTwo.isInvisible &&
                    !game.boss.isWithinDetectionRange()) {
                    bossTargetable = false;
                }
                if (game.boss.blindnessSkill && game.boss.blindnessSkill.isActive) {
                    bossTargetable = false;
                }
            }
            if (bossTargetable) allEnemies.push(game.boss);
        }
        
        allEnemies.forEach(enemy => {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
                closestTarget = enemy;
                closestDistance = distance;
            }
        });
        
        this.currentTarget = closestTarget;
    }
    
    trackTarget() {
        if (!this.currentTarget) return;
        
        const elapsedTime = Date.now() - this.startTime;
        const fadeOutDuration = 500;
        
        let trackingStrength = 0;
        if (elapsedTime <= this.strongTrackingDuration) {
            trackingStrength = 1.0;
        } else if (elapsedTime <= this.strongTrackingDuration + fadeOutDuration) {
            trackingStrength = 1.0 - (elapsedTime - this.strongTrackingDuration) / fadeOutDuration;
        }
        
        if (trackingStrength <= 0) return;
        
        const targetX = this.currentTarget.x + this.currentTarget.width / 2;
        const targetY = this.currentTarget.y + this.currentTarget.height / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            const turnRate = 0.15 * trackingStrength;
            const newVx = (dx / distance) * this.currentSpeed;
            const newVy = (dy / distance) * this.currentSpeed;
            this.vx = this.vx * (1 - turnRate) + newVx * turnRate;
            this.vy = this.vy * (1 - turnRate) + newVy * turnRate;
            
            const actualSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (actualSpeed > 0) {
                this.vx = (this.vx / actualSpeed) * this.currentSpeed;
                this.vy = (this.vy / actualSpeed) * this.currentSpeed;
            }
        }
    }
    
    checkProximity() {
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0) {
            allEnemies.push(game.boss);
        }
        
        for (const enemy of allEnemies) {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.fuseRadius) {
                this.detonate();
                return;
            }
        }
    }
    
    detonate() {
        if (this.shouldDestroy) return;
        
        if (!game.plasmaFields) game.plasmaFields = [];
        game.plasmaFields.push(new PlasmaField(this.x, this.y, this.fieldRadius));
        
        if (!game.explosions) game.explosions = [];
        game.explosions.push({
            x: this.x,
            y: this.y,
            startTime: Date.now(),
            duration: 350,
            isBossMissile: false,
            isSuperMissile: false,
            explosionRadius: this.fuseRadius,
            isPlasma: true
        });
        
        this.shouldDestroy = true;
    }
    
    draw(ctx) {
        // 尾迹
        if (this.trail.length > 1) {
            ctx.save();
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * 0.7;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#00CCA0';
                ctx.lineWidth = 2 + (i / this.trail.length) * 1.5;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        const angle = Math.atan2(this.vy, this.vx);
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        
        // 飞弹主体
        ctx.fillStyle = '#006666';
        ctx.fillRect(-5, -2.5, 10, 5);
        
        // 弹头
        ctx.fillStyle = '#00FFCC';
        ctx.fillRect(5, -1.5, 3, 3);
        
        // 尾焰
        ctx.fillStyle = '#00AA88';
        ctx.fillRect(-9, -1.5, 4, 3);
        
        // 电浆光晕
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(Date.now() * 0.015);
        ctx.strokeStyle = '#00FFCC';
        ctx.lineWidth = 1;
        ctx.strokeRect(-6, -3.5, 12, 7);
        
        ctx.restore();
    }
}

// 6连电浆飞弹发射器
class PlasmaMissileLauncher extends Weapon {
    constructor() {
        super({
            type: 'plasma_missile',
            name: '6连电浆飞弹',
            damage: 1,
            cooldown: 5000
        });
        
        this.missilesPerSalvo = 6;
        this.missileSpeed = 14;
        this.launchDelay = 100;
        
        this.isLaunching = false;
        this.launchStartTime = 0;
        this.missilesFired = 0;
    }
    
    canUse() {
        return super.canUse() && !this.isLaunching;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        this.lastUseTime = Date.now();
        this.isLaunching = true;
        this.launchStartTime = Date.now();
        this.missilesFired = 0;
        this.firePlasmaMissile(player);
        this.missilesFired++;
        return true;
    }
    
    firePlasmaMissile(player) {
        const launchX = player.x + player.width / 2;
        const launchY = player.y + player.height / 2;
        
        let targetX, targetY;
        if (gameState.lockMode === 'manual') {
            targetX = mouse.x;
            targetY = mouse.y;
        } else {
            const target = player.getCurrentTarget();
            if (target) {
                targetX = target.x + target.width / 2;
                targetY = target.y + target.height / 2;
            } else {
                const angle = player.direction * Math.PI / 180;
                targetX = launchX + Math.cos(angle) * 300;
                targetY = launchY + Math.sin(angle) * 300;
            }
        }
        
        const spread = 25;
        const randomOffsetX = (Math.random() - 0.5) * spread;
        const randomOffsetY = (Math.random() - 0.5) * spread;
        
        const missile = new PlasmaMissile(
            launchX, launchY,
            targetX + randomOffsetX,
            targetY + randomOffsetY,
            this.missileSpeed
        );
        
        if (!game.plasmaMissiles) game.plasmaMissiles = [];
        game.plasmaMissiles.push(missile);
    }
    
    update(player) {
        if (this.isLaunching) {
            const elapsed = Date.now() - this.launchStartTime;
            const nextMissileTime = this.missilesFired * this.launchDelay;
            
            if (elapsed >= nextMissileTime && this.missilesFired < this.missilesPerSalvo) {
                this.firePlasmaMissile(player);
                this.missilesFired++;
            }
            
            if (this.missilesFired >= this.missilesPerSalvo) {
                this.isLaunching = false;
            }
        }
    }
    
    draw(ctx, player) {
        if (this.isLaunching) {
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#00FFCC';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00FFCC';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(px, py, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
    
    getStatus() {
        if (this.isLaunching) return { text: '发射中...', color: '#00FFCC' };
        const remaining = Math.max(0, this.cooldown - (Date.now() - this.lastUseTime));
        if (remaining > 0) return { text: `冷却: ${(remaining / 1000).toFixed(1)}s`, color: '#888888' };
        return { text: '就绪', color: '#00FFCC' };
    }
}

// 分裂飞弹母弹类 - 靠近敌人后分裂成8枚子弹
class ClusterMissile {
    constructor(x, y, targetX, targetY, speed = 16) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.maxSpeed = speed;
        this.currentSpeed = speed * 0.5;
        this.shouldDestroy = false;
        
        this.splitRadius = 120;
        this.maxLifetime = 8000;
        this.startTime = Date.now();
        this.trackingRadius = 600;
        this.currentTarget = null;
        this.hasTarget = false;
        this.accelerationDuration = 400;
        
        this.trail = [];
        this.maxTrailLength = 12;
        this.size = 2;
        
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            this.vx = (dx / distance) * this.currentSpeed;
            this.vy = (dy / distance) * this.currentSpeed;
        } else {
            this.vx = 0;
            this.vy = this.currentSpeed;
        }
    }
    
    update() {
        if (Date.now() - this.startTime > this.maxLifetime) {
            this.selfDestruct();
            return;
        }
        
        this.updateSpeed();
        this.findTarget();
        if (this.currentTarget) {
            this.hasTarget = true;
            this.trackTarget();
        }
        
        this.x += this.vx;
        this.y += this.vy;
        
        this.trail.push({ x: this.x, y: this.y, time: Date.now() });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        if (this.x < -30 || this.x > GAME_CONFIG.WIDTH + 30 ||
            this.y < -30 || this.y > GAME_CONFIG.HEIGHT + 30) {
            this.selfDestruct();
            return;
        }
        
        this.checkProximityAndSplit();
    }
    
    updateSpeed() {
        const elapsedTime = Date.now() - this.startTime;
        if (elapsedTime <= this.accelerationDuration) {
            const progress = elapsedTime / this.accelerationDuration;
            this.currentSpeed = this.maxSpeed * (0.5 + 0.5 * progress);
        } else {
            this.currentSpeed = this.maxSpeed;
        }
    }
    
    findTarget() {
        let closestTarget = null;
        let closestDistance = this.trackingRadius;
        
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0) {
            let bossTargetable = true;
            if (game.boss instanceof StarDevourer) {
                if (game.boss.phaseTwo.activated && game.boss.phaseTwo.isInvisible &&
                    !game.boss.isWithinDetectionRange()) {
                    bossTargetable = false;
                }
                if (game.boss.blindnessSkill && game.boss.blindnessSkill.isActive) {
                    bossTargetable = false;
                }
            }
            if (bossTargetable) allEnemies.push(game.boss);
        }
        
        allEnemies.forEach(enemy => {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
                closestTarget = enemy;
                closestDistance = distance;
            }
        });
        
        this.currentTarget = closestTarget;
    }
    
    trackTarget() {
        if (!this.currentTarget) return;
        
        const targetX = this.currentTarget.x + this.currentTarget.width / 2;
        const targetY = this.currentTarget.y + this.currentTarget.height / 2;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            const turnRate = 0.18;
            const newVx = (dx / distance) * this.currentSpeed;
            const newVy = (dy / distance) * this.currentSpeed;
            this.vx = this.vx * (1 - turnRate) + newVx * turnRate;
            this.vy = this.vy * (1 - turnRate) + newVy * turnRate;
            
            const actualSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (actualSpeed > 0) {
                this.vx = (this.vx / actualSpeed) * this.currentSpeed;
                this.vy = (this.vy / actualSpeed) * this.currentSpeed;
            }
        }
    }
    
    checkProximityAndSplit() {
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0) {
            allEnemies.push(game.boss);
        }
        
        for (const enemy of allEnemies) {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.splitRadius) {
                this.split();
                return;
            }
        }
    }
    
    split() {
        if (this.shouldDestroy) return;
        
        if (!game.missiles) game.missiles = [];
        
        const childCount = 8;
        for (let i = 0; i < childCount; i++) {
            const angle = (Math.PI * 2 / childCount) * i + (Math.random() - 0.5) * 0.3;
            const spreadDist = 15;
            const childX = this.x + Math.cos(angle) * spreadDist;
            const childY = this.y + Math.sin(angle) * spreadDist;
            
            let targetX, targetY;
            if (this.currentTarget) {
                targetX = this.currentTarget.x + this.currentTarget.width / 2 + (Math.random() - 0.5) * 40;
                targetY = this.currentTarget.y + this.currentTarget.height / 2 + (Math.random() - 0.5) * 40;
            } else {
                targetX = this.x + Math.cos(angle) * 200;
                targetY = this.y + Math.sin(angle) * 200;
            }
            
            const child = new Missile(childX, childY, targetX, targetY, 3, 21);
            child.maxLifetime = 2000;
            child.trackingRadius = 220;
            child.strongTrackingDuration = 1800;
            child.isClusterChild = true;
            game.missiles.push(child);
        }
        
        if (!game.explosions) game.explosions = [];
        game.explosions.push({
            x: this.x,
            y: this.y,
            startTime: Date.now(),
            duration: 300,
            isBossMissile: false,
            isSuperMissile: false,
            explosionRadius: 30,
            isClusterSplit: true
        });
        
        this.shouldDestroy = true;
    }
    
    selfDestruct() {
        if (this.shouldDestroy) return;
        
        if (!game.explosions) game.explosions = [];
        game.explosions.push({
            x: this.x,
            y: this.y,
            startTime: Date.now(),
            duration: 400,
            isBossMissile: false,
            isSuperMissile: false,
            explosionRadius: 40
        });
        
        this.shouldDestroy = true;
    }
    
    draw(ctx) {
        if (this.trail.length > 1) {
            ctx.save();
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * 0.7;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#FFA500';
                ctx.lineWidth = 3 + (i / this.trail.length) * 2;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        const angle = Math.atan2(this.vy, this.vx);
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        
        // 大号导弹主体
        ctx.fillStyle = '#CC6600';
        ctx.fillRect(-8, -4, 16, 8);
        
        // 弹头
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(8, -4);
        ctx.lineTo(13, 0);
        ctx.lineTo(8, 4);
        ctx.fill();
        
        // 尾焰
        ctx.fillStyle = '#FF8C00';
        ctx.fillRect(-13, -2.5, 5, 5);
        
        // 分裂标记环
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
        ctx.globalAlpha = 0.3 + 0.2 * pulse;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
}

// 分裂飞弹发射器
class ClusterMissileLauncher extends Weapon {
    constructor() {
        super({
            type: 'cluster_missile',
            name: '分裂飞弹',
            damage: 3,
            cooldown: 4000
        });
        
        this.missileSpeed = 16;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        this.lastUseTime = Date.now();
        
        const launchX = player.x + player.width / 2;
        const launchY = player.y + player.height / 2;
        
        let targetX, targetY;
        if (gameState.lockMode === 'manual') {
            targetX = mouse.x;
            targetY = mouse.y;
        } else {
            const target = player.getCurrentTarget();
            if (target) {
                targetX = target.x + target.width / 2;
                targetY = target.y + target.height / 2;
            } else {
                const angle = player.direction * Math.PI / 180;
                targetX = launchX + Math.cos(angle) * 300;
                targetY = launchY + Math.sin(angle) * 300;
            }
        }
        
        const missile = new ClusterMissile(launchX, launchY, targetX, targetY, this.missileSpeed);
        
        if (!game.clusterMissiles) game.clusterMissiles = [];
        game.clusterMissiles.push(missile);
        
        return true;
    }
    
    update(player) {
    }
    
    draw(ctx, player) {
    }
    
    getStatus() {
        const remaining = Math.max(0, this.cooldown - (Date.now() - this.lastUseTime));
        if (remaining > 0) return { text: `冷却: ${(remaining / 1000).toFixed(1)}s`, color: '#888888' };
        return { text: '就绪', color: '#FFD700' };
    }
}

// 填充武器类型映射
WEAPON_TYPES.sword = Sword;
WEAPON_TYPES.gun = Gun; 
WEAPON_TYPES.laser_spear = LaserSpear;
WEAPON_TYPES.missile_launcher = MissileLauncher; 
WEAPON_TYPES.laser_rifle = LaserRifle;
WEAPON_TYPES.pulse_shield = PulseShield;
WEAPON_TYPES.emp = EMP;
WEAPON_TYPES.super_weapon = SuperWeapon;
WEAPON_TYPES.ciws = CIWS;
WEAPON_TYPES.plasma_missile = PlasmaMissileLauncher;
WEAPON_TYPES.cluster_missile = ClusterMissileLauncher;