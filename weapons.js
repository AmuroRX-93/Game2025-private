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
            damage: 150,
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
            damage: 150, // 提高攻击力到150
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

// 镭射长枪类
class LaserSpear extends Weapon {
    constructor() {
        super({
            type: 'laser_spear',
            name: '镭射长枪',
            damage: 25,
            cooldown: 2500 // 2.5秒冷却
        });
        
        this.chargeRange = 6 * 50; // 冲锋距离：6单位 (转换为像素)
        
        // 冲锋攻击状态
        this.isCharging = false; // 冲锋状态
        this.chargeStartTime = 0;
        this.chargeDuration = 500; // 冲锋持续时间：0.5秒
        this.chargeSpeed = 25; // 冲锋速度：25单位/秒
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
            
            const hitDistance = (player.width + enemy.width) / 2 + 15; // 长枪额外触及距离
            
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
        this.trackingRadius = 100; // 追踪半径
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
            trackingRadius = this.isSuperMissile ? 630 : 450; // 超级导弹追踪范围更大
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
                allEnemies.push(game.boss);
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
        if (!this.isBossMissile && game.boss) {
            allEnemies.push(game.boss);
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
        this.missileSpeed = 12; // 导弹飞行速度
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
        this.missileSpeed = 12; // 导弹飞行速度
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

// 填充武器类型映射
WEAPON_TYPES.sword = Sword;
WEAPON_TYPES.gun = Gun; 
WEAPON_TYPES.laser_spear = LaserSpear;
WEAPON_TYPES.missile_launcher = MissileLauncher; 
WEAPON_TYPES.pulse_shield = PulseShield;
WEAPON_TYPES.super_weapon = SuperWeapon; 