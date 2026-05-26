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
                            (game.boss && !game.boss.notTargetable && this.dashTarget === game.boss);
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
        if (this.slashes.length > 0 || this.isDashing) {
            this.slashes.forEach(slash => slash.draw(ctx));
            
            if (this.isDashing) {
                const dashCenterX = player.x + player.width / 2;
                const dashCenterY = player.y + player.height / 2;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                // Draw the plasma flame blade trailing BEHIND the player
                // during the dash push — the player is lunging forward
                // with the blade dragged back, ready to strike. Same
                // SwordSlash.renderFlameBlade so shape and color match
                // the slash visual exactly.
                const bladeLen = 56;
                // Tip points opposite the dash direction.
                const tipX = dashCenterX - Math.cos(this.dashDirection) * bladeLen;
                const tipY = dashCenterY - Math.sin(this.dashDirection) * bladeLen;
                const trailAng = this.dashDirection + Math.PI;
                const now = Date.now();

                // Two faint ghost blades AHEAD of the live blade (i.e.
                // closer to the dash direction) so the trail reads as
                // motion blur left behind by the lunge.
                if (typeof SwordSlash !== 'undefined' && SwordSlash.renderFlameBlade) {
                    for (let g = 2; g >= 1; g--) {
                        const forward = g * 18;
                        const gcx = dashCenterX + Math.cos(this.dashDirection) * forward;
                        const gcy = dashCenterY + Math.sin(this.dashDirection) * forward;
                        const gtx = gcx - Math.cos(this.dashDirection) * (bladeLen - g * 6);
                        const gty = gcy - Math.sin(this.dashDirection) * (bladeLen - g * 6);
                        SwordSlash.renderFlameBlade(ctx, {
                            cx: gcx, cy: gcy, tipX: gtx, tipY: gty,
                            ang: trailAng,
                            bladeAlpha: 0.32 / g,
                            elapsed: now - g * 30,
                            baseW: 9,
                            seed: this.dashStartTime + g
                        });
                    }
                    // Live blade — full alpha, slightly fatter, dragged
                    // straight back from the player.
                    SwordSlash.renderFlameBlade(ctx, {
                        cx: dashCenterX, cy: dashCenterY, tipX, tipY,
                        ang: trailAng,
                        bladeAlpha: 0.95,
                        elapsed: now,
                        baseW: 11,
                        seed: this.dashStartTime
                    });
                }

                // Energy ring around player (concentric, animated pulse,
                // matched to blade colors).
                const t = Date.now();
                const pulse = 0.7 + 0.3 * Math.sin(t / 60);
                const ringR = 26 * pulse;
                const ringGrad = ctx.createRadialGradient(dashCenterX, dashCenterY, ringR * 0.5, dashCenterX, dashCenterY, ringR * 1.6);
                ringGrad.addColorStop(0, 'rgba(120,255,200,0)');
                ringGrad.addColorStop(0.5, 'rgba(80,240,180,0.55)');
                ringGrad.addColorStop(1, 'rgba(20,160,120,0)');
                ctx.fillStyle = ringGrad;
                ctx.beginPath();
                ctx.arc(dashCenterX, dashCenterY, ringR * 1.6, 0, Math.PI * 2);
                ctx.fill();
                // Bright thin ring
                ctx.strokeStyle = 'rgba(220,255,235,0.8)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(dashCenterX, dashCenterY, ringR, 0, Math.PI * 2);
                ctx.stroke();
                
                // Spawn occasional plasma motes trailing behind the dash
                if (typeof bossFX !== 'undefined' && Math.random() < 0.7) {
                    const t2 = Math.random();
                    const sx = dashCenterX - Math.cos(this.dashDirection) * (40 * t2);
                    const sy = dashCenterY - Math.sin(this.dashDirection) * (40 * t2);
                    const sp = 1 + Math.random() * 1.5;
                    const ang = this.dashDirection + Math.PI + (Math.random() - 0.5) * 0.6;
                    bossFX.particles.push({
                        x: sx, y: sy,
                        vx: Math.cos(ang) * sp,
                        vy: Math.sin(ang) * sp,
                        size: 1 + Math.random() * 2,
                        color: ['#d8ffe8', '#5fffb0', '#30c8a0'][Math.floor(Math.random() * 3)],
                        lifeMs: 220 + Math.random() * 180,
                        gravity: 0,
                        drag: 0.92,
                        alpha: 0.9,
                        startedAt: Date.now()
                    });
                }
                ctx.restore();
            }
        }
    }
    
    getStatus() {
        if (this.isAttacking) return { text: t('ws.attacking'), color: 'white' };
        
        const recoveryRemaining = Math.max(0, this.attackEndTime - Date.now());
        if (recoveryRemaining > 0) {
            return { text: t('ws.stagger', (recoveryRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        
        if (this.isDashing) return { text: t('ws.dashPush'), color: 'white' };
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: t('ws.cooldown', (cooldownRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        
        return { text: t('ws.ready'), color: 'white' };
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
        
        this.fireRate = 5; // 每秒5发
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
        // Record muzzle flash for draw()
        this.lastMuzzleFlashTime = Date.now();
        this.lastMuzzleAngle = shootDirection * Math.PI / 180;
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

    draw(ctx, player) {
        // Muzzle flash burst right after firing (lifetime ~80ms)
        if (!this.lastMuzzleFlashTime) return;
        const dt = Date.now() - this.lastMuzzleFlashTime;
        if (dt > 90) return;
        const fade = 1 - dt / 90;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        // Position flash a bit out from the muzzle along firing direction
        const offset = player.width / 2 + 6;
        const fx = px + Math.cos(this.lastMuzzleAngle) * offset;
        const fy = py + Math.sin(this.lastMuzzleAngle) * offset;
        if (typeof drawMuzzleFlash === 'function') {
            drawMuzzleFlash(ctx, {
                x: fx, y: fy,
                angle: this.lastMuzzleAngle,
                size: 16,
                scheme: 'gold',
                alpha: fade
            });
        }
    }
    
    getStatus() {
        if (this.reloading) return { text: t('ws.reloading'), color: '#CC6666' };
        if (this.currentAmmo === 0) return { text: t('ws.ammoEmpty'), color: '#CC6666' };
        
        // 始终显示弹药数量，如果不满弹则提示可以重装
        let statusText = t('ws.ammo', this.currentAmmo, this.magazineSize);
        if (this.currentAmmo < this.magazineSize) {
            statusText += t('ws.pressR');
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
            damage: 18,
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
        
        if (game.boss && !game.boss.notTargetable) checkHit(game.boss);
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
            const eased = progress * progress; // accelerating curve

            // Aim direction (towards target if available, else mech facing).
            const aimTarget = this.findTarget(player);
            let aimAng;
            if (aimTarget) {
                aimAng = Math.atan2(
                    (aimTarget.y + aimTarget.height / 2) - py,
                    (aimTarget.x + aimTarget.width / 2) - px
                );
            } else {
                aimAng = (player.direction || 0) * Math.PI / 180;
            }
            
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // ---- Layer 1: incoming energy shards converging to the muzzle ----
            // Particles spawn far out and snap inward, pulled by an unseen lens.
            const shardSeed = Math.floor(now / 90);
            const shardCount = 7;
            for (let i = 0; i < shardCount; i++) {
                // Stable per-shard pseudo random based on seed+i.
                const seed = (shardSeed * 13 + i * 31) % 360;
                const ang = (seed / 360) * Math.PI * 2;
                // Local phase: each shard runs through 0..1 in 220ms.
                const phase = ((now + i * 60) % 220) / 220;
                const startR = 70 + (seed % 30);
                const r = startR * (1 - phase) + 6 * phase;
                const sx = px + Math.cos(ang) * r;
                const sy = py + Math.sin(ang) * r;
                // Each shard streaks tangentially as it falls in.
                const tail = 16 + 14 * (1 - phase);
                const tailAng = ang + Math.PI; // point back outward
                const ex = sx + Math.cos(tailAng) * tail;
                const ey = sy + Math.sin(tailAng) * tail;
                const shardA = (0.25 + 0.75 * (1 - phase)) * (0.4 + 0.6 * progress);
                const grad = ctx.createLinearGradient(sx, sy, ex, ey);
                grad.addColorStop(0, `rgba(255,230,180,${shardA})`);
                grad.addColorStop(0.5, `rgba(255,90,60,${shardA * 0.8})`);
                grad.addColorStop(1, 'rgba(180,20,10,0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.6 + progress * 1.4;
            ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
            ctx.stroke();
            }

            // ---- Layer 2: capacitor arcs around the muzzle (jagged short bolts) ----
            const arcCount = 3 + Math.floor(progress * 3);
            for (let i = 0; i < arcCount; i++) {
                const baseAng = (now * 0.004 + i * (Math.PI * 2 / arcCount)) % (Math.PI * 2);
                const r0 = 10 + progress * 6;
                const segs = 4;
                let prevX = px + Math.cos(baseAng) * r0;
                let prevY = py + Math.sin(baseAng) * r0;
                ctx.strokeStyle = `rgba(255,120,90,${0.55 * (0.4 + progress * 0.6)})`;
                ctx.lineWidth = 1.4;
                ctx.shadowColor = '#ff5040';
                ctx.shadowBlur = 8 + progress * 10;
            ctx.beginPath();
                ctx.moveTo(prevX, prevY);
                for (let s = 1; s <= segs; s++) {
                    const ang = baseAng + (s / segs) * 0.9 + (Math.random() - 0.5) * 0.35;
                    const r = r0 + s * (3 + progress * 4);
                    const xN = px + Math.cos(ang) * r;
                    const yN = py + Math.sin(ang) * r;
                    ctx.lineTo(xN, yN);
                }
            ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // ---- Layer 3: charging beam pre-aim (fan of compressing rays) ----
            // A flickering forward rays bundle showing where the shot will go.
            if (progress > 0.05) {
                const rayLen = 90 + progress * 110;
                const fanA = 0.18 * (1 - eased) + 0.02; // closes inward as it charges
                const rays = 5;
                for (let i = 0; i < rays; i++) {
                    const t = rays === 1 ? 0 : (i / (rays - 1)) - 0.5;
                    const ang = aimAng + t * fanA;
                    const ex = px + Math.cos(ang) * rayLen;
                    const ey = py + Math.sin(ang) * rayLen;
                    const a = (0.18 + eased * 0.5) * (1 - Math.abs(t) * 1.4);
                    const g = ctx.createLinearGradient(px, py, ex, ey);
                    g.addColorStop(0, `rgba(255,255,220,${a})`);
                    g.addColorStop(0.4, `rgba(255,80,60,${a * 0.85})`);
                    g.addColorStop(1, 'rgba(120,10,0,0)');
                    ctx.strokeStyle = g;
                    ctx.lineWidth = 1.2 + eased * 1.6;
                ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                }
                // Center prebeam (the thickest one once charge is high)
                if (eased > 0.3) {
                    const ex = px + Math.cos(aimAng) * (rayLen * 1.1);
                    const ey = py + Math.sin(aimAng) * (rayLen * 1.1);
                    const a = (eased - 0.3) * 1.2;
                    const g2 = ctx.createLinearGradient(px, py, ex, ey);
                    g2.addColorStop(0, `rgba(255,255,255,${Math.min(1, a)})`);
                    g2.addColorStop(0.3, `rgba(255,140,90,${a * 0.85})`);
                    g2.addColorStop(1, 'rgba(255,40,20,0)');
                    ctx.strokeStyle = g2;
                    ctx.lineWidth = 2 + eased * 3;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                }
            }

            // ---- Layer 4: pulsing core orb (the actual energy ball forming) ----
            const corePulse = 0.85 + 0.15 * Math.sin(now * 0.02);
            const coreR = (4 + progress * 9) * corePulse;
            const coreGrad = ctx.createRadialGradient(px, py, 0, px, py, coreR * 3.2);
            coreGrad.addColorStop(0, `rgba(255,255,255,${0.8 * (0.3 + progress * 0.7)})`);
            coreGrad.addColorStop(0.35, `rgba(255,180,140,${0.7 * progress})`);
            coreGrad.addColorStop(0.7, `rgba(255,60,40,${0.45 * progress})`);
            coreGrad.addColorStop(1, 'rgba(120,0,0,0)');
            ctx.fillStyle = coreGrad;
                ctx.beginPath();
            ctx.arc(px, py, coreR * 3.2, 0, Math.PI * 2);
                ctx.fill();
            // Hot white pinpoint
            ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * eased})`;
            ctx.beginPath();
            ctx.arc(px, py, 1.6 + eased * 2.2, 0, Math.PI * 2);
            ctx.fill();

            // ---- Layer 5: full-charge ready ring (only when nearly maxed) ----
            if (progress > 0.92) {
                const readyT = (progress - 0.92) / 0.08;
                const ringR = 18 + Math.sin(now * 0.03) * 3;
                ctx.strokeStyle = `rgba(255,240,210,${0.85 * readyT})`;
                ctx.lineWidth = 2;
                ctx.shadowColor = '#fff0a0';
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.arc(px, py, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            
            ctx.restore();

            // ---- Layer 6: refined target reticle (drawn separately, no additive) ----
            if (aimTarget) {
                const tx = aimTarget.x + aimTarget.width / 2;
                const ty = aimTarget.y + aimTarget.height / 2;
                ctx.save();

                // Subtle dashed lead line, fades with charge.
                ctx.strokeStyle = `rgba(255,90,70,${0.12 + progress * 0.28})`;
                ctx.lineWidth = 1.2;
                ctx.setLineDash([6, 8]);
                ctx.lineDashOffset = -now * 0.03;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.setLineDash([]);
                
                if (progress > 0.25) {
                    const lockAlpha = (progress - 0.25) / 0.75;
                    // Inner rotating diamond (reads as a tracking lock).
                    const rot = now * 0.0035;
                    const inner = 7 + Math.sin(now * 0.012) * 1.2;
                    ctx.save();
                    ctx.translate(tx, ty);
                    ctx.rotate(rot);
                    ctx.strokeStyle = `rgba(255,200,170,${lockAlpha})`;
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    ctx.moveTo(0, -inner);
                    ctx.lineTo(inner, 0);
                    ctx.lineTo(0, inner);
                    ctx.lineTo(-inner, 0);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();

                    // Outer L-bracket corners.
                    const lockSize = 14;
                    const arm = 5;
                    ctx.strokeStyle = `rgba(255,90,70,${lockAlpha * 0.95})`;
                    ctx.lineWidth = 1.6;
                    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
                    for (const [cx, cy] of corners) {
                        ctx.beginPath();
                        ctx.moveTo(tx + cx * lockSize, ty + cy * lockSize - cy * arm);
                        ctx.lineTo(tx + cx * lockSize, ty + cy * lockSize);
                        ctx.lineTo(tx + cx * lockSize - cx * arm, ty + cy * lockSize);
                        ctx.stroke();
                    }
                }
            ctx.restore();
            }
        }
        
        // Beam visual: multi-layer additive beam via shared drawBeam helper.
        if (this.beamEffect) {
            const e = this.beamEffect;
            const elapsed = Date.now() - e.startTime;
            const tNorm = Math.min(1, elapsed / e.duration);
            // Beam pops bright then fades out: fast early decay, long tail
            const alpha = Math.pow(1 - tNorm, 1.4);
            // Slight initial overcharge: width punch in the first 25% of life
            const charge = tNorm < 0.25 ? 1 + (1 - tNorm / 0.25) * 0.6 : 1;

            if (typeof drawBeam === 'function') {
                drawBeam(ctx, {
                    x1: e.startX, y1: e.startY,
                    x2: e.endX, y2: e.endY,
                    width: 7,
                    scheme: 'crimson',
                    alpha,
                    charge
                });
            }

            // Hit point burst: ring + sparks once at impact frame
            if (!e._sparked && elapsed < 60) {
                e._sparked = true;
                if (typeof bossFX !== 'undefined' && bossFX.addShockwave) {
                    bossFX.addShockwave(e.endX, e.endY, 4, 38, '#ff5040', 380, 3, 0.85);
                    bossFX.addFlash(e.endX, e.endY, 22, '#ffffff', 120);
                    bossFX.addShake(2, 120);
                }
                if (typeof drawImpactSparks === 'function') {
                    drawImpactSparks({
                        x: e.endX, y: e.endY,
                        count: 14,
                        scheme: 'crimson',
                        speed: 5,
                        lifeMs: 380
                    });
                }
            }
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
            return { text: t('ws.overheat', (remaining / 1000).toFixed(1)), color: '#FF0000' };
        }
        if (this.isCharging) {
            const progress = Math.min(1, (Date.now() - this.chargeStartTime) / this.chargeTime);
            return { text: t('ws.charging', Math.round(progress * 100)), color: '#FF6666' };
        }
        const now = Date.now();
        if (now - this.lastFireTime < this.fireInterval) {
            return { text: t('ws.coolingDown'), color: '#CC6666' };
        }
        return { text: t('ws.heat', Math.round(this.heat), this.maxHeatBar), color: '#FFAA00' };
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
        if (game.boss && !game.boss.notTargetable) {
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
                    if (enemy instanceof Boss || enemy instanceof SublimeMoon || enemy instanceof UglyEmperor || enemy instanceof Magnus || enemy instanceof HiveMind) {
                        handleBossKill();
                    } else {
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
        if (this.isCharging) {
            const playerCenterX = player.x + player.width / 2;
            const playerCenterY = player.y + player.height / 2;
            const dirX = Math.cos(this.chargeDirection);
            const dirY = Math.sin(this.chargeDirection);

            // Spear shaft (multi-layer azure beam pointing forward)
            const spearLength = 70;
            const spearEndX = playerCenterX + dirX * spearLength;
            const spearEndY = playerCenterY + dirY * spearLength;
            if (typeof drawBeam === 'function') {
                drawBeam(ctx, {
                    x1: playerCenterX, y1: playerCenterY,
                    x2: spearEndX, y2: spearEndY,
                    width: 5,
                    scheme: 'azure',
                    alpha: 1,
                    charge: 1.1
                });
            }

            // Spearhead diamond (drawn additively)
            ctx.save();
            ctx.translate(spearEndX, spearEndY);
            ctx.rotate(this.chargeDirection);
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(0, -6);
            ctx.lineTo(-6, 0);
            ctx.lineTo(0, 6);
            ctx.closePath();
            ctx.fill();
            // Outer halo around the spearhead
            const tipGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
            tipGrad.addColorStop(0, '#ffffff');
            tipGrad.addColorStop(0.5, 'rgba(120,200,255,0.7)');
            tipGrad.addColorStop(1, 'rgba(40,120,255,0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // Charge contrail behind player (azure glow streak)
            const trailLen = 60;
            const tx = playerCenterX - dirX * trailLen;
            const ty = playerCenterY - dirY * trailLen;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgba(80,160,255,0.4)';
            ctx.lineWidth = 16;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(playerCenterX, playerCenterY); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.strokeStyle = 'rgba(160,210,255,0.85)';
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(playerCenterX, playerCenterY); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(playerCenterX, playerCenterY); ctx.lineTo(tx, ty); ctx.stroke();

            // Energy field ring around player (animated)
            if (typeof drawEnergyRing === 'function') {
                drawEnergyRing(ctx, {
                    x: playerCenterX, y: playerCenterY,
                    radius: 30, thickness: 2.5,
                    scheme: 'azure', alpha: 0.85, segments: 4
                });
            }
            ctx.restore();

            // Constant ember spawn while charging
            if (typeof bossFX !== 'undefined' && Math.random() < 0.6) {
                const sp = 1.5 + Math.random() * 1.5;
                const ang = this.chargeDirection + Math.PI + (Math.random() - 0.5) * 0.6;
                bossFX.particles.push({
                    x: playerCenterX, y: playerCenterY,
                    vx: Math.cos(ang) * sp,
                    vy: Math.sin(ang) * sp,
                    size: 1 + Math.random() * 2,
                    color: ['#ffffff', '#a0d8ff', '#3080ff'][Math.floor(Math.random() * 3)],
                    lifeMs: 280 + Math.random() * 200,
                    gravity: 0,
                    drag: 0.92,
                    alpha: 0.9,
                    startedAt: Date.now()
                });
            }
        }

        // Hit effect: replace flat ring + sparks with radial burst
        this.spearTrails.forEach(effect => {
            const elapsed = Date.now() - effect.startTime;
            const tNorm = Math.min(1, elapsed / effect.duration);
            const fade = 1 - tNorm;

            // One-shot world FX on the first frame
            if (!effect._sparked) {
                effect._sparked = true;
                if (typeof bossFX !== 'undefined') {
                    if (bossFX.addShockwave) bossFX.addShockwave(effect.x, effect.y, 6, 38, '#a0d8ff', 360, 3, 0.85);
                    if (bossFX.addFlash) bossFX.addFlash(effect.x, effect.y, 22, '#ffffff', 140);
                    if (bossFX.addShake) bossFX.addShake(2, 110);
                }
                if (typeof drawImpactSparks === 'function') {
                    drawImpactSparks({
                        x: effect.x, y: effect.y,
                        count: 14, scheme: 'azure',
                        speed: 5, lifeMs: 380
                    });
                }
            }

            // Lingering soft glow at hit point
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const r = 8 + tNorm * 22;
            const g = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, r);
            g.addColorStop(0, `rgba(255,255,255,${fade * 0.7})`);
            g.addColorStop(0.5, `rgba(150,210,255,${fade * 0.45})`);
            g.addColorStop(1, 'rgba(40,120,220,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(effect.x, effect.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        });
    }
    
    getStatus() {
        let statusText = '';
        let color = 'white';
        
        if (this.isCharging) {
            statusText = t('ws.rushing');
            color = '#00CCFF';
        } else if (Date.now() < this.attackEndTime) {
            statusText = t('ws.recovering');
            color = '#CC6666';
        } else if (!this.canUse()) {
            const cooldownRemaining = this.getCooldownRemaining();
            statusText = t('ws.cooldown', (cooldownRemaining / 1000).toFixed(1));
            color = '#CC6666';
        } else {
            statusText = t('ws.readyShort');
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
        
        // 分裂子弹散开延迟：刚分裂时不制导，先扇形散开
        if (this.guidanceDelay && Date.now() - this.startTime < this.guidanceDelay) {
            // 散开阶段：不追踪，保持初始扇形方向飞行
        } else if (this.isBossMissileDelayed) {
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

        // Crimson King square plasma missiles use a proximity fuse so the
        // hefty warhead detonates near the player instead of skimming past.
        if (this.isBossMissile && this.bossMissileType === 'square' &&
            !this.shouldDestroy && game.player && !game.player.isUntargetable) {
            const px = game.player.x + game.player.width / 2;
            const py = game.player.y + game.player.height / 2;
            const dx = px - this.x;
            const dy = py - this.y;
            const fuse = 60;
            if (dx * dx + dy * dy < fuse * fuse) {
                this.explode();
            }
        }
    }
    
    findTarget() {
        if (this.isReversed) {
            this.currentTarget = getBossTarget(this.x, this.y) || game.player;
            return;
        }
        
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
            const bossTarget = getBossTarget(this.x, this.y);
            if (bossTarget) {
                const dx = bossTarget.x + bossTarget.width / 2 - this.x;
                const dy = bossTarget.y + bossTarget.height / 2 - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < closestDistance) {
                    closestTarget = bossTarget;
                }
            }
        } else {
            // 玩家导弹追踪敌人和Boss
            const allEnemies = game.enemies.filter(e => !e.notTargetable);
            if (game.boss && !game.boss.notTargetable) {
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
        
        const bossTarget = getBossTarget(this.x, this.y);
        if (!bossTarget) return;
        
        const targetCenterX = bossTarget.x + bossTarget.width / 2;
        const targetCenterY = bossTarget.y + bossTarget.height / 2;
        const missileCenterX = this.x;
        const missileCenterY = this.y;
        
        const distance = Math.sqrt(
            Math.pow(targetCenterX - missileCenterX, 2) + 
            Math.pow(targetCenterY - missileCenterY, 2)
        );
        
        if (distance <= this.guideRange) {
            this.currentTarget = bossTarget;
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
        const strongTrackingDuration = this.strongTrackingDuration
            || (this.enhancedHoming ? 2200 : 1100);
        const fadeOutDuration = this.fadeOutDuration
            || (this.isSuperMissile ? 1000 : (this.enhancedHoming ? 900 : 500));
        
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
            let baseTurnRate;
            if (this.isClusterChild) baseTurnRate = 0.28;
            else if (this.enhancedHoming) baseTurnRate = 0.352; // crimson king homing missile (boosted +10%)
            else baseTurnRate = 0.15;
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
        if (this.isReversed) {
            const target = getBossTarget(this.x, this.y);
            if (target) {
                const dx = target.x + target.width / 2 - this.x;
                const dy = target.y + target.height / 2 - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < (target.width + target.height) / 4 + 8) {
                    if (target === game.player) {
                        game.player.takeDamage(this.damage);
                    } else {
                        target.takeDamage(this.damage);
                    }
                    this.explode();
                    return;
                }
            }
        }
        
        // Boss导弹可以命中诱饵
        if (this.isBossMissile && game.decoys) {
            for (const decoy of game.decoys) {
                const ddx = decoy.x + decoy.width / 2 - this.x;
                const ddy = decoy.y + decoy.height / 2 - this.y;
                const dd = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dd < (decoy.width + decoy.height) / 4 + 8) {
                    decoy.takeDamage(this.damage);
                    this.explode();
                    return;
                }
            }
        }
        
        const allEnemies = [...game.enemies];
        
        if (!this.isBossMissile && game.boss && !game.boss.notTargetable) {
            allEnemies.push(game.boss);
        }
        
        for (const enemy of allEnemies) {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < (enemy.width + enemy.height) / 4 + 8) {
                // Yukikon shadow clones nullify missiles outright: the missile
                // pops harmlessly with no AoE damage (you can't use the decoy
                // as a free splash trigger).
                if (enemy.isYukikonClone) {
                    if (this.shouldDestroy) return;
                    this.shouldDestroy = true;
                    if (typeof bossFX !== 'undefined') {
                        bossFX.addFlash(this.x, this.y, 22, '#bfeaff', 220, 0.85);
                        bossFX.spawnBurst(this.x, this.y, 10, {
                            color: '#bfeaff',
                            speedMin: 1, speedMax: 3,
                            sizeMin: 1, sizeMax: 2,
                            lifeMs: 320,
                            spreadAngle: Math.PI * 2,
                            baseAngle: 0,
                            drag: 0.9
                        });
                    }
                    return;
                }
                this.explode();
                return;
            }
        }
    }
    
    explode() {
        if (this.shouldDestroy) return;
        // 爆炸伤害范围
        const explosionRadius = this.isSuperMissile ? 400 : 80; // 超级导弹400像素范围
        
        // 获取所有敌人
        const allEnemies = [...game.enemies];
        
        // 如果是Boss导弹，不要伤害Boss自己；如果是玩家导弹，可以伤害Boss
        // 被拦截的导弹不对丑皇造成伤害
        if (!this.isBossMissile && game.boss && !game.boss.notTargetable) {
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
                    const isBossEntity =
                        (typeof Boss !== 'undefined' && enemy instanceof Boss) ||
                        (typeof SublimeMoon !== 'undefined' && enemy instanceof SublimeMoon) ||
                        (typeof UglyEmperor !== 'undefined' && enemy instanceof UglyEmperor) ||
                        (typeof Magnus !== 'undefined' && enemy instanceof Magnus) ||
                        (typeof HiveMind !== 'undefined' && enemy instanceof HiveMind);
                    if (isBossEntity) {
                        handleBossKill();
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

        // Crimson King square plasma missile: leaves a hostile plasma field
        // at the impact site. Larger and longer-lived than the player's
        // plasma missile field so it forces the player to displace.
        if (this.spawnHostilePlasma) {
            const margin = 30;
            const inArena = this.x > -margin && this.x < GAME_CONFIG.WIDTH + margin &&
                            this.y > -margin && this.y < GAME_CONFIG.HEIGHT + margin;
            if (inArena && typeof PlasmaField !== 'undefined') {
                const fx = Math.max(40, Math.min(GAME_CONFIG.WIDTH - 40, this.x));
                const fy = Math.max(40, Math.min(GAME_CONFIG.HEIGHT - 40, this.y));
                if (!game.plasmaFields) game.plasmaFields = [];
                game.plasmaFields.push(new PlasmaField(fx, fy, 110, {
                    duration: 2500,
                    damageInterval: 250,
                    damage: 4,
                    hostile: true,
                    palette: 'crimson'
                }));
            }
        }
        
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
        // Pick a palette scheme keyed off the missile flavor.
        let scheme = 'gold';                  // player default
        let trailCol = '#ffd060';
        let bodyAccent = null; // optional body tint for boss missiles
        if (this.isSuperMissile || this.isReversed) { scheme = 'violet'; trailCol = '#c080ff'; }
        else if (this.bossType === 'sublime_moon') { scheme = 'azure'; trailCol = '#80c0ff'; }
        else if (this.isBossMissile || this.bossType === 'crimson_king') {
            scheme = 'crimson';
            const bmType = this.bossMissileType;
            if (bmType === 'homing') {
                trailCol = '#ffb040';      // amber/orange — laser-guided seeker
                bodyAccent = '#ff7020';
            } else if (bmType === 'square') {
                trailCol = '#ff60a0';      // pink-magenta — heavy plasma orb
                bodyAccent = '#ff2080';
            } else if (bmType === 'grid' || bmType === 'cross') {
                trailCol = '#ff5060';
        } else {
                trailCol = '#ff4040';      // salvo: pure crimson
                bodyAccent = '#cc1010';
            }
        }

        const size = this.size || 1;
        const angle = Math.atan2(this.vy, this.vx);

        // 1) Glowing additive trail using prior trail samples.
        if (this.trail && this.trail.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            // Outer halo pass
            ctx.lineCap = 'round';
            ctx.strokeStyle = trailCol;
                for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.45 * t;
                ctx.lineWidth = (3 + 4 * t) * size;
                    ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                    ctx.lineTo(this.trail[i].x, this.trail[i].y);
                    ctx.stroke();
                }
            // Bright core trail
            ctx.strokeStyle = '#ffffff';
                for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.9 * t;
                ctx.lineWidth = (1 + 1.6 * t) * size;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                    ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // 2) Continuous thruster jet at the tail (uses shared drawJetFlame).
        const tailX = this.x - Math.cos(angle) * (4 * size);
        const tailY = this.y - Math.sin(angle) * (4 * size);
        if (typeof drawJetFlame === 'function') {
            drawJetFlame(ctx, {
                originX: tailX,
                originY: tailY,
                angle: angle + Math.PI,
                length: 18 * size,
                width: 7 * size,
                intensity: 0.85,
                scheme: scheme === 'crimson' ? 'crimson' : (scheme === 'azure' ? 'azure' : (scheme === 'violet' ? 'violet' : 'orange')),
                spawnEmbers: true,
                emberDensity: 0.35,
                id: (this._fxId = this._fxId || Math.floor(Math.random() * 100))
            });
        }

        // 3) Missile body: rotated rounded rect + glowing nose tip.
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        
        const bmType = this.bossMissileType;
        if (bmType === 'square') {
            // Big plasma orb warhead — no metal shell, just a layered
            // glowing core with a swirling halo. Stands out clearly from
            // the salvo / homing missiles.
            ctx.globalCompositeOperation = 'lighter';
            const orbR = 9 * size;
            // Outer halo
            const haloGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR * 2.2);
            haloGrad.addColorStop(0, 'rgba(255,180,210,0.0)');
            haloGrad.addColorStop(0.45, 'rgba(255,80,150,0.55)');
            haloGrad.addColorStop(1, 'rgba(255,30,80,0)');
            ctx.fillStyle = haloGrad;
            ctx.beginPath(); ctx.arc(0, 0, orbR * 2.2, 0, Math.PI * 2); ctx.fill();
            // Core orb
            const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, orbR);
            coreGrad.addColorStop(0, '#ffffff');
            coreGrad.addColorStop(0.25, '#ffe0f0');
            coreGrad.addColorStop(0.55, trailCol);
            coreGrad.addColorStop(1, 'rgba(180,0,40,0)');
            ctx.fillStyle = coreGrad;
            ctx.beginPath(); ctx.arc(0, 0, orbR, 0, Math.PI * 2); ctx.fill();
            // Spinning energy ring
            const tnow = Date.now() * 0.012;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(255,255,255,0.8)`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = tnow + i * (Math.PI / 4);
                const rx = Math.cos(a) * orbR * 0.85;
                const ry = Math.sin(a) * orbR * 0.85;
                if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
            }
            ctx.closePath();
            ctx.stroke();
            // Bright pinpoint
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, orbR * 0.25, 0, Math.PI * 2); ctx.fill();
        } else {
            const bodyW = 10 * size;
            const bodyH = 5 * size;
            // Body shell with subtle highlight stripe
            const bodyGrad = ctx.createLinearGradient(0, -bodyH / 2, 0, bodyH / 2);
            bodyGrad.addColorStop(0, '#cccccc');
            bodyGrad.addColorStop(0.4, '#888');
            bodyGrad.addColorStop(0.6, '#555');
            bodyGrad.addColorStop(1, '#222');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            // Slight rounded rectangle
            const r = bodyH * 0.4;
            ctx.moveTo(-bodyW / 2 + r, -bodyH / 2);
            ctx.lineTo(bodyW / 2 - r, -bodyH / 2);
            ctx.quadraticCurveTo(bodyW / 2, -bodyH / 2, bodyW / 2, -bodyH / 2 + r);
            ctx.lineTo(bodyW / 2, bodyH / 2 - r);
            ctx.quadraticCurveTo(bodyW / 2, bodyH / 2, bodyW / 2 - r, bodyH / 2);
            ctx.lineTo(-bodyW / 2 + r, bodyH / 2);
            ctx.quadraticCurveTo(-bodyW / 2, bodyH / 2, -bodyW / 2, bodyH / 2 - r);
            ctx.lineTo(-bodyW / 2, -bodyH / 2 + r);
            ctx.quadraticCurveTo(-bodyW / 2, -bodyH / 2, -bodyW / 2 + r, -bodyH / 2);
            ctx.closePath();
            ctx.fill();

            // Boss-missile body accent: colored stripe along the spine so
            // salvo (deep red) and homing (amber) read differently at a
            // glance.
            if (bodyAccent) {
                ctx.fillStyle = bodyAccent;
                ctx.fillRect(-bodyW / 2 + 1, -bodyH * 0.18, bodyW - 2, bodyH * 0.36);
                if (bmType === 'homing') {
                    // Small fin tip lights for the seeker missile
                    ctx.fillStyle = '#fff0a0';
                    ctx.beginPath();
                    ctx.arc(-bodyW / 2 - 2 * size, -bodyH * 0.85, 0.9 * size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(-bodyW / 2 - 2 * size, bodyH * 0.85, 0.9 * size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Fins
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.moveTo(-bodyW / 2, -bodyH / 2);
            ctx.lineTo(-bodyW / 2 - 3 * size, -bodyH);
            ctx.lineTo(-bodyW / 2 + 1 * size, -bodyH / 2);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-bodyW / 2, bodyH / 2);
            ctx.lineTo(-bodyW / 2 - 3 * size, bodyH);
            ctx.lineTo(-bodyW / 2 + 1 * size, bodyH / 2);
            ctx.closePath();
            ctx.fill();

            // Glowing nose cone
            ctx.globalCompositeOperation = 'lighter';
            const noseGrad = ctx.createRadialGradient(bodyW / 2, 0, 0, bodyW / 2, 0, bodyH * 1.6);
            noseGrad.addColorStop(0, '#ffffff');
            noseGrad.addColorStop(0.5, trailCol);
            noseGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = noseGrad;
            ctx.beginPath();
            ctx.arc(bodyW / 2, 0, bodyH * 1.6, 0, Math.PI * 2);
            ctx.fill();
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
        // Record fire timing/direction for muzzle flash in draw()
        this.lastMissileFireTime = Date.now();
        this.lastMissileAngle = Math.atan2(targetY - launchY, targetX - launchX);
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
        if (this.isLaunching) {
            const cx = player.x + player.width / 2;
            const cy = player.y + player.height / 2;
            // Pulsing energy ring around the player while salvo fires
            if (typeof drawEnergyRing === 'function') {
                drawEnergyRing(ctx, {
                    x: cx, y: cy,
                    radius: 32, thickness: 2.5,
                    scheme: 'gold', alpha: 0.85, segments: 4
                });
            }
            // Spawn a brief muzzle flash on the player every time a missile leaves
            if (this.lastMissileFireTime && Date.now() - this.lastMissileFireTime < 90) {
                const fade = 1 - (Date.now() - this.lastMissileFireTime) / 90;
                const ang = (this.lastMissileAngle || 0);
                if (typeof drawMuzzleFlash === 'function') {
                    drawMuzzleFlash(ctx, {
                        x: cx + Math.cos(ang) * (player.width / 2 + 4),
                        y: cy + Math.sin(ang) * (player.width / 2 + 4),
                        angle: ang,
                        size: 14,
                        scheme: 'gold',
                        alpha: fade
                    });
                }
            }
        }
    }
    
    getStatus() {
        if (this.isLaunching) {
            const remaining = this.missilesPerSalvo - this.missilesFired;
            return { text: t('ws.launching', remaining), color: '#FFD700' };
        }
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: t('ws.cooldown', (cooldownRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        
        return { text: t('ws.ready'), color: 'white' };
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
        this.duration = 14400; // 14.4 seconds (80% of original 18s)
        this.damageReduction = 1; // Fully immune while shield is up
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
        
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const baseR = 40;
        const pulse = Math.sin(this.shieldEffect.pulsePhase) * 5;
        const r = baseR + pulse;
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 1) Soft inner volume fill (cyan plasma dome)
        const dome = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        dome.addColorStop(0, 'rgba(160,240,255,0.0)');
        dome.addColorStop(0.6, 'rgba(80,200,255,0.18)');
        dome.addColorStop(0.92, 'rgba(40,180,255,0.45)');
        dome.addColorStop(1, 'rgba(0,150,255,0)');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

        // 2) Multi-layer ring + rotating segment highlights
        if (typeof drawEnergyRing === 'function') {
            drawEnergyRing(ctx, {
                x: cx, y: cy,
                radius: r, thickness: 4,
                scheme: 'cyan', alpha: 0.95,
                segments: 6,
                spin: this.shieldEffect.pulsePhase * 0.4
            });
            // Inner thinner ring spinning the other way
            drawEnergyRing(ctx, {
                x: cx, y: cy,
                radius: r * 0.7, thickness: 2,
                scheme: 'cyan', alpha: 0.6,
                segments: 3,
                spin: -this.shieldEffect.pulsePhase * 0.6
            });
        }

        // 3) Floating shield particles (now glowing dots)
        this.shieldEffect.particles.forEach(p => {
            const x = cx + p.x;
            const y = cy + p.y;
            const alpha = p.life * 0.9;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, 4);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.5, `rgba(160,230,255,${alpha})`);
            grad.addColorStop(1, 'rgba(40,140,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        });
        
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
            return { text: t('ws.shielding', (remaining / 1000).toFixed(1)), color: '#00FFFF' };
        }
        
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: t('ws.cooldown', (cooldownRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        
        return { text: t('ws.ready'), color: '#00FFFF' };
    }
}



// EMP电磁脉冲（隐藏机能）
class EMP extends Weapon {
    constructor() {
        super({
            type: 'emp',
            name: 'EMP电磁脉冲',
            damage: 100,
            cooldown: 18000
        });
        
        this.radius = 490;
        this.stunDuration = 2000;
        this.empEffect = null;
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        
        // 对范围内所有敌人造成伤害和僵直
        const targets = [];
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) targets.push(game.boss);
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
        const progress = Math.min(1, elapsed / e.duration);
        const fade = 1 - progress;

        // One-shot world FX on first frame
        if (!e._sparked) {
            e._sparked = true;
            if (typeof bossFX !== 'undefined') {
                if (bossFX.addShockwave) bossFX.addShockwave(e.x, e.y, 8, this.radius, '#a8f0ff', 480, 4, 0.85);
                if (bossFX.addFlash) bossFX.addFlash(e.x, e.y, 60, '#ffffff', 240);
                if (bossFX.addShake) bossFX.addShake(4, 200);
            }
            if (typeof drawImpactSparks === 'function') {
                drawImpactSparks({
                    x: e.x, y: e.y,
                    count: 28, scheme: 'cyan',
                    speed: 7, lifeMs: 600
                });
            }
        }

        const waveR = this.radius * progress;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 1) Inner shockwave volume
        const dome = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, waveR);
        dome.addColorStop(0, `rgba(255,255,255,${fade * 0.4})`);
        dome.addColorStop(0.55, `rgba(120,210,255,${fade * 0.45})`);
        dome.addColorStop(0.95, `rgba(40,140,240,${fade * 0.35})`);
        dome.addColorStop(1, 'rgba(20,80,180,0)');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.arc(e.x, e.y, waveR, 0, Math.PI * 2); ctx.fill();

        // 2) Multi-layer shockwave ring
        ctx.strokeStyle = `rgba(80,180,255,${fade * 0.6})`;
        ctx.lineWidth = 12 * fade + 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, waveR, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(180,230,255,${fade})`;
        ctx.lineWidth = 4 * fade + 1.2;
        ctx.beginPath(); ctx.arc(e.x, e.y, waveR, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${fade})`;
            ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, waveR, 0, Math.PI * 2); ctx.stroke();

        // 3) Lightning arcs (kept but brighter & glow)
        if (progress < 0.75) {
            const arcCount = 10;
            for (let i = 0; i < arcCount; i++) {
                const angle = (Math.PI * 2 / arcCount) * i + progress * 4;
                const len = waveR * (0.4 + Math.random() * 0.6);
                // Outer halo
                ctx.strokeStyle = `rgba(120,200,255,${fade * 0.35})`;
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(e.x, e.y);
                let lastX = e.x, lastY = e.y;
                const segs = 6;
                const path = [];
                for (let s = 1; s <= segs; s++) {
                    const r = len * s / segs;
                    const j = (Math.random() - 0.5) * 18;
                    const nx = e.x + Math.cos(angle) * r + j;
                    const ny = e.y + Math.sin(angle) * r + j;
                    path.push([nx, ny]);
                    ctx.lineTo(nx, ny);
                    lastX = nx; lastY = ny;
                }
                ctx.stroke();
                // Bright core stroke
                ctx.strokeStyle = `rgba(255,255,255,${fade})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(e.x, e.y);
                path.forEach(([x, y]) => ctx.lineTo(x, y));
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
    
    getStatus() {
        const cooldownRemaining = this.getCooldownRemaining();
        if (cooldownRemaining > 0) {
            return { text: t('ws.cooldown', (cooldownRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        return { text: t('ws.ready'), color: '#66CCFF' };
    }
}

// 反制重击（隐藏机能）- 3秒减伤40% + 反射50%伤害
class CounterMech extends Weapon {
    constructor() {
        super({
            type: 'counter_mech',
            name: '反制重击',
            damage: 0,
            cooldown: 15000
        });
        
        this.isActive = false;
        this.activationTime = 0;
        this.duration = 3000;
        this.damageReduction = 0.4;
        this.reflectRatio = 2.5;
        this.effect = null;
    }
    
    canUse() {
        return !this.isActive && super.canUse();
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        this.isActive = true;
        this.activationTime = Date.now();
        this.effect = { particles: [], flashAlpha: 1.0 };
        
        return true;
    }
    
    isDamageReduced() {
        return this.isActive;
    }
    
    getDamageReduction() {
        return this.isActive ? this.damageReduction : 0;
    }
    
    reflectDamage(actualDamage) {
        if (!this.isActive) return;
        
        const reflectedDmg = Math.max(1, Math.round(actualDamage * this.reflectRatio));
        
        const targets = [];
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) targets.push(game.boss);
        if (game.enemies) {
            for (const e of game.enemies) {
                if (e.health > 0) targets.push(e);
            }
        }
        
        // 反射给距离最近的伤害来源
        if (targets.length === 0) return;
        
        const px = game.player.x + game.player.width / 2;
        const py = game.player.y + game.player.height / 2;
        
        let nearest = null;
        let nearestDist = Infinity;
        for (const t of targets) {
            const dx = t.x + t.width / 2 - px;
            const dy = t.y + t.height / 2 - py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = t;
            }
        }
        
        if (nearest) {
            nearest.takeDamage(reflectedDmg, 'reflect');
            gameState.score += reflectedDmg;
            gameState.totalDamage += reflectedDmg;
            
            // 反射闪光特效
            if (this.effect) {
                this.effect.flashAlpha = 1.0;
                const tx = nearest.x + nearest.width / 2;
                const ty = nearest.y + nearest.height / 2;
                this.effect.reflectLine = { tx, ty, alpha: 1.0 };
            }
        }
    }
    
    update(player) {
        if (this.isActive) {
            const elapsed = Date.now() - this.activationTime;
            if (elapsed >= this.duration) {
                this.isActive = false;
                this.effect = null;
                return;
            }
            
            if (this.effect) {
                this.effect.flashAlpha = Math.max(0, this.effect.flashAlpha - 0.05);
                if (this.effect.reflectLine) {
                    this.effect.reflectLine.alpha -= 0.08;
                    if (this.effect.reflectLine.alpha <= 0) {
                        this.effect.reflectLine = null;
                    }
                }
                
                if (Math.random() < 0.4) {
                    const angle = Math.random() * Math.PI * 2;
                    const r = 30 + Math.random() * 10;
                    this.effect.particles.push({
                        ox: Math.cos(angle) * r,
                        oy: Math.sin(angle) * r,
                        life: 1.0
                    });
                }
                this.effect.particles = this.effect.particles.filter(p => {
                    p.life -= 0.04;
                    return p.life > 0;
                });
            }
        }
    }
    
    draw(ctx, player) {
        if (!this.isActive || !this.effect) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const elapsed = Date.now() - this.activationTime;
        const remaining = 1 - elapsed / this.duration;
        const pulseR = 35 + 3 * Math.sin(Date.now() * 0.008);
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Inner volumetric heat dome
        const dome = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR);
        dome.addColorStop(0, `rgba(255,200,80,${remaining * 0.35})`);
        dome.addColorStop(0.7, `rgba(255,120,40,${remaining * 0.4})`);
        dome.addColorStop(1, 'rgba(180,40,0,0)');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.arc(cx, cy, pulseR, 0, Math.PI * 2); ctx.fill();

        // Hexagonal ward (multi-layer glow)
        const drawHex = (color, lw) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i - Math.PI / 2 + Date.now() * 0.0015;
                const px = cx + Math.cos(a) * pulseR;
                const py = cy + Math.sin(a) * pulseR;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        };
        drawHex(`rgba(255,90,0,${remaining * 0.55})`, 8);
        drawHex(`rgba(255,160,40,${remaining * 0.85})`, 3.5);
        drawHex(`rgba(255,255,200,${remaining})`, 1.4);

        // Glowing orbiting particles
        for (const p of this.effect.particles) {
            const x = cx + p.ox;
            const y = cy + p.oy;
            const a = p.life * 0.9;
            const g = ctx.createRadialGradient(x, y, 0, x, y, 4);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, `rgba(255,160,40,${a})`);
            g.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }

        // Reflect beam (multi-layer)
        if (this.effect.reflectLine && typeof drawBeam === 'function') {
            const rl = this.effect.reflectLine;
            drawBeam(ctx, {
                x1: cx, y1: cy,
                x2: rl.tx, y2: rl.ty,
                width: 5,
                scheme: 'orange',
                alpha: rl.alpha,
                charge: 1
            });
        }
        
        ctx.restore();
    }
    
    getStatus() {
        if (this.isActive) {
            const remaining = Math.max(0, this.duration - (Date.now() - this.activationTime));
            return { text: t('ws.countering', (remaining / 1000).toFixed(1)), color: '#FF8C00' };
        }
        const remaining = Math.max(0, this.cooldown - (Date.now() - this.lastUseTime));
        if (remaining > 0) return { text: t('ws.cooldownS', (remaining / 1000).toFixed(1)), color: '#888888' };
        return { text: t('ws.readyShort'), color: '#FF8C00' };
    }
}

// 诱饵实体类
class Decoy {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.width = 30;
        this.height = 30;
        
        this.maxHealth = 40;
        this.health = this.maxHealth;
        this.shouldDestroy = false;
        this.startTime = Date.now();
        this.maxLifetime = 7000;
        
        this.moveStartTime = Date.now();
        this.moveDuration = 400;
        this.startPosX = startX;
        this.startPosY = startY;
        this.arrived = false;
        
        this.flickerPhase = Math.random() * Math.PI * 2;
        this.particles = [];
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.shouldDestroy = true;
        }
        return this.shouldDestroy;
    }
    
    update() {
        if (Date.now() - this.startTime > this.maxLifetime) {
            this.shouldDestroy = true;
            return;
        }
        
        if (!this.arrived) {
            const elapsed = Date.now() - this.moveStartTime;
            const t = Math.min(1, elapsed / this.moveDuration);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            this.x = this.startPosX + (this.targetX - this.startPosX) * ease;
            this.y = this.startPosY + (this.targetY - this.startPosY) * ease;
            if (t >= 1) this.arrived = true;
        }
        
        if (Math.random() < 0.5) {
            const angle = Math.random() * Math.PI * 2;
            const r = 15 + Math.random() * 8;
            this.particles.push({
                ox: Math.cos(angle) * r,
                oy: Math.sin(angle) * r,
                life: 1.0,
                speed: 0.3 + Math.random() * 0.3
            });
        }
        this.particles = this.particles.filter(p => {
            p.life -= 0.03 + p.speed * 0.02;
            p.oy -= 0.3;
            return p.life > 0;
        });
    }
    
    draw(ctx) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const elapsed = Date.now() - this.startTime;
        const flicker = 0.4 + 0.3 * Math.sin(elapsed * 0.012 + this.flickerPhase);
        const glitch = Math.random() < 0.05 ? 0.1 : 0;
        const a = flicker - glitch;
        
        ctx.save();
        
        // 1) Soft additive glow under the hologram (gives it depth)
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.width * 1.6);
        glow.addColorStop(0, `rgba(160,210,255,${a * 0.55})`);
        glow.addColorStop(0.5, `rgba(60,140,255,${a * 0.3})`);
        glow.addColorStop(1, 'rgba(0,40,160,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cx, cy, this.width * 1.6, 0, Math.PI * 2); ctx.fill();

        // 2) Holographic body (semi-transparent, with scanline overlay)
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.fillStyle = '#4488FF';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        // Scan lines
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#FFFFFF';
        for (let sy = 0; sy < this.height; sy += 3) {
            if ((sy + Math.floor(elapsed * 0.05)) % 6 < 3) {
                ctx.fillRect(this.x, this.y + sy, this.width, 1);
            }
        }
        // Edge frame (additive)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#a0d0ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(this.x - 1, this.y - 1, this.width + 2, this.height + 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        // 3) Glowing particles
        for (const p of this.particles) {
            const x = cx + p.ox;
            const y = cy + p.oy;
            const lA = p.life * 0.85;
            const g = ctx.createRadialGradient(x, y, 0, x, y, 3);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, `rgba(160,220,255,${lA})`);
            g.addColorStop(1, 'rgba(40,100,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        }

        // 4) Health bar (kept simple, non-additive)
        ctx.globalCompositeOperation = 'source-over';
        if (this.health < this.maxHealth) {
            ctx.globalAlpha = 0.85;
            const barW = this.width, barH = 3;
            const barX = this.x, barY = this.y - 7;
            ctx.fillStyle = '#222';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#4488FF';
            ctx.fillRect(barX, barY, barW * (this.health / this.maxHealth), barH);
        }
        ctx.restore();
    }
    
    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

// Emergency Repair Protocol (hidden ability): trade firepower for sustain.
// Cannot attack while active, but moves faster and regenerates HP every second.
// Once HP is full, surplus regen is stored as overflow HP that absorbs the next
// hits (capped at +overflowHpMax). Each activation resets overflow before regen.
class RepairProtocol extends Weapon {
    constructor() {
        super({
            type: 'repair_protocol',
            name: '应急修复',
            damage: 0,
            cooldown: 35000
        });
        this.duration = 5000;
        this.regenPerSecond = 5;
        this.speedMul = 1.5;
        this.overflowCap = 50; // bonus HP beyond max
        this.isActive = false;
        this.activationTime = 0;
        this.lastTick = 0;
    }

    canUse() {
        if (this.isActive) return false;
        return super.canUse();
    }

    use(player) {
        if (!this.canUse()) return false;
        this.lastUseTime = Date.now();
        this.isActive = true;
        this.activationTime = Date.now();
        this.lastTick = this.activationTime;

        player.repairProtocolActive = true;
        player.repairProtocolEndTime = this.activationTime + this.duration;
        // Reset banked overflow on each activation (per spec).
        player.overflowHp = 0;
        player.overflowHpMax = this.overflowCap;

        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        if (typeof bossFX !== 'undefined') {
            if (bossFX.addFlash) bossFX.addFlash(cx, cy, 70, '#40ff80', 320, 0.9);
            if (bossFX.addShockwave) bossFX.addShockwave(cx, cy, 18, 180, '#60ff90', 420, 4, 0.7);
            if (bossFX.spawnBurst) bossFX.spawnBurst(cx, cy, 18, {
                color: '#80ffa0',
                speedMin: 2, speedMax: 5,
                sizeMin: 2, sizeMax: 3.5,
                lifeMs: 520, drag: 0.92
            });
        }
        return true;
    }

    update(player) {
        if (!this.isActive) return;
        const now = Date.now();

        // Tick regen every 200ms for smooth healing.
        const tickStep = 200;
        while (now - this.lastTick >= tickStep) {
            this.lastTick += tickStep;
            const heal = this.regenPerSecond * (tickStep / 1000);
            const missing = Math.max(0, player.maxHealth - player.health);
            const toHull = Math.min(missing, heal);
            const spill = heal - toHull;
            if (toHull > 0) player.health += toHull;
            if (spill > 0) {
                player.overflowHp = Math.min(player.overflowHpMax,
                    player.overflowHp + spill);
            }
        }

        if (now - this.activationTime >= this.duration) {
            this.isActive = false;
            player.repairProtocolActive = false;
        }
    }

    draw(ctx, player) {
        if (!this.isActive) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const now = Date.now();
        const remaining = 1 - (now - this.activationTime) / this.duration;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.7 + 0.3 * Math.sin(now * 0.012);
        const r = 34 * pulse;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(80,255,140,${0.35 * remaining})`);
        grad.addColorStop(0.6, `rgba(40,200,90,${0.22 * remaining})`);
        grad.addColorStop(1, 'rgba(0,80,30,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

        // Rotating cross "medic" insignia.
        ctx.strokeStyle = `rgba(120,255,160,${0.85 * remaining})`;
        ctx.lineWidth = 2;
        const ang = now * 0.003;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r);
        ctx.moveTo(cx + Math.cos(ang + Math.PI / 2) * r, cy + Math.sin(ang + Math.PI / 2) * r);
        ctx.lineTo(cx - Math.cos(ang + Math.PI / 2) * r, cy - Math.sin(ang + Math.PI / 2) * r);
        ctx.stroke();

        // Healing sparkles drifting upward.
        if (Math.random() < 0.5) {
            ctx.fillStyle = `rgba(180,255,200,${0.8 * remaining})`;
            const sx = cx + (Math.random() - 0.5) * r * 1.4;
            const sy = cy + (Math.random() - 0.5) * r * 1.4;
            ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    getStatus() {
        if (this.isActive) {
            const remaining = Math.max(0,
                (this.duration - (Date.now() - this.activationTime)) / 1000);
            return { text: t('ws.repairActive', remaining.toFixed(1)), color: '#60ff90' };
        }
        const cdRemaining = this.getCooldownRemaining();
        if (cdRemaining > 0) {
            return { text: t('ws.cooldown', (cdRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        return { text: t('ws.ready'), color: '#00FF88' };
    }
}

// Overdrive Burst (hidden ability): pay HP for a short window of triple damage,
// triple move speed, double incoming damage. Dangerous, high-reward "all-in" tool.
class OverdriveBurst extends Weapon {
    constructor() {
        super({
            type: 'overdrive_burst',
            name: '超限爆发',
            damage: 0,
            cooldown: 30000
        });
        this.duration = 6000;
        this.outgoingMul = 3;
        this.incomingMul = 2;
        this.speedMul = 3;
        this.hpCostRatio = 0.30; // pay 30% of current HP up-front (HP drops to 70%)
        this.isActive = false;
        this.activationTime = 0;
        this.effect = null;
    }

    canUse() {
        // Block re-entry while already active.
        if (this.isActive) return false;
        // Don't let the player suicide on activation.
        if (game && game.player && game.player.health <= 1) return false;
        return super.canUse();
    }

    use(player) {
        if (!this.canUse()) return false;
        this.lastUseTime = Date.now();
        this.isActive = true;
        this.activationTime = Date.now();

        // Drop HP to 70% of current; never kill the player on activation.
        const before = player.health;
        const after = Math.max(1, Math.floor(before * (1 - this.hpCostRatio)));
        const cost = before - after;
        player.health = after;
        if (cost > 0 && typeof player.addHitIndicator === 'function') {
            player.addHitIndicator(cost);
        }

        // Wire up player-side flags.
        player.outgoingDamageMultiplier = this.outgoingMul;
        player.incomingDamageMultiplier = this.incomingMul;
        player.overdriveActive = true;
        player.overdriveEndTime = this.activationTime + this.duration;
        player.afterimages = player.afterimages || [];

        // Activation FX
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        if (typeof bossFX !== 'undefined') {
            if (bossFX.addFlash) bossFX.addFlash(cx, cy, 80, '#ff3030', 360, 1.0);
            if (bossFX.addShockwave) bossFX.addShockwave(cx, cy, 20, 220, '#ff5040', 480, 5, 0.85);
            if (bossFX.addShake) bossFX.addShake(5, 240);
            if (bossFX.spawnBurst) bossFX.spawnBurst(cx, cy, 24, {
                color: '#ff4030',
                speedMin: 3, speedMax: 8,
                sizeMin: 2, sizeMax: 4,
                lifeMs: 480, drag: 0.92
            });
        }

        this.effect = { startTime: this.activationTime };
        return true;
    }

    update(player) {
        if (!this.isActive) return;
        const now = Date.now();
        if (now - this.activationTime >= this.duration) {
            this.isActive = false;
            this.effect = null;
            // Clear flags (player.updateOverdrive also does this defensively).
            player.outgoingDamageMultiplier = 1;
            player.incomingDamageMultiplier = 1;
            player.overdriveActive = false;
            // End-of-burst flash
            const cx = player.x + player.width / 2;
            const cy = player.y + player.height / 2;
            if (typeof bossFX !== 'undefined' && bossFX.addFlash) {
                bossFX.addFlash(cx, cy, 60, '#ff8050', 240, 0.7);
            }
        }
    }

    draw(ctx, player) {
        if (!this.isActive) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const now = Date.now();
        const remaining = 1 - (now - this.activationTime) / this.duration;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Pulsing crimson aura around the mech.
        const pulse = 0.7 + 0.3 * Math.sin(now * 0.02);
        const auraR = 38 * pulse;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
        grad.addColorStop(0, `rgba(255,80,40,${0.45 * remaining})`);
        grad.addColorStop(0.6, `rgba(255,40,30,${0.25 * remaining})`);
        grad.addColorStop(1, 'rgba(120,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, auraR, 0, Math.PI * 2); ctx.fill();

        // Outline ring
        ctx.strokeStyle = `rgba(255,90,60,${0.7 * remaining})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, auraR + 2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    getStatus() {
        if (this.isActive) {
            const remaining = Math.max(0,
                (this.duration - (Date.now() - this.activationTime)) / 1000);
            return { text: t('ws.overdriveActive', remaining.toFixed(1)), color: '#ff4040' };
        }
        const cdRemaining = this.getCooldownRemaining();
        if (cdRemaining > 0) {
            return { text: t('ws.cooldown', (cdRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        return { text: t('ws.ready'), color: '#00FF88' };
    }
}

// 诱饵分身（隐藏机能）- 释放3个诱饵 + 4秒不可锁定
class DecoyClone extends Weapon {
    constructor() {
        super({
            type: 'decoy_clone',
            name: '诱饵分身',
            damage: 0,
            cooldown: 35000
        });
        
        this.stealthDuration = 4000;
        this.isStealthActive = false;
        this.stealthStartTime = 0;
        this.decoySpread = 150;
    }
    
    canUse() {
        return !this.isStealthActive && super.canUse();
    }
    
    use(player) {
        if (!this.canUse()) return false;
        
        this.lastUseTime = Date.now();
        this.isStealthActive = true;
        this.stealthStartTime = Date.now();
        
        player.isUntargetable = true;
        player.untargetableEndTime = Date.now() + this.stealthDuration;
        
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        
        if (!game.decoys) game.decoys = [];
        
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 / 3) * i - Math.PI / 2;
            const tx = cx + Math.cos(angle) * this.decoySpread - 15;
            const ty = cy + Math.sin(angle) * this.decoySpread - 15;
            game.decoys.push(new Decoy(player.x, player.y, tx, ty));
        }
        
        // 解除所有敌方对玩家的锁定
        if (game.bossMissiles) {
            game.bossMissiles.forEach(m => {
                if (m.currentTarget === player) m.currentTarget = null;
            });
        }
        if (game.crescentBullets) {
            game.crescentBullets.forEach(b => {
                if (b.currentTarget === player) b.currentTarget = null;
            });
        }
        
        return true;
    }
    
    update(player) {
        if (this.isStealthActive) {
            if (Date.now() - this.stealthStartTime >= this.stealthDuration) {
                this.isStealthActive = false;
                player.isUntargetable = false;
            }
        }
        
        if (!this.isStealthActive && player.isUntargetable && 
            Date.now() >= (player.untargetableEndTime || 0)) {
            player.isUntargetable = false;
        }
    }
    
    draw(ctx, player) {
        if (!this.isStealthActive) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const elapsed = Date.now() - this.stealthStartTime;
        const remaining = 1 - elapsed / this.stealthDuration;
        const r = 26 + 3 * Math.sin(elapsed * 0.006);
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Soft cloak glow
        const cloak = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
        cloak.addColorStop(0, `rgba(80,160,255,${remaining * 0.25})`);
        cloak.addColorStop(0.7, `rgba(40,100,220,${remaining * 0.35})`);
        cloak.addColorStop(1, 'rgba(0,40,160,0)');
        ctx.fillStyle = cloak;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2); ctx.fill();

        // Diamond ward (multi-layer)
        const drawDiamond = (color, lw) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.stroke();
        };
        drawDiamond(`rgba(40,120,255,${remaining * 0.5})`, 8);
        drawDiamond(`rgba(140,200,255,${remaining * 0.85})`, 3.2);
        drawDiamond(`rgba(255,255,255,${remaining})`, 1.2);

        // Orbiting motes
        for (let i = 0; i < 4; i++) {
            const a = elapsed * 0.005 + i * Math.PI / 2;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            const g = ctx.createRadialGradient(px, py, 0, px, py, 4);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, `rgba(160,220,255,${remaining})`);
            g.addColorStop(1, 'rgba(40,120,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
        }
        
        ctx.restore();
    }
    
    getStatus() {
        if (this.isStealthActive) {
            const remaining = Math.max(0, this.stealthDuration - (Date.now() - this.stealthStartTime));
            return { text: t('ws.stealth', (remaining / 1000).toFixed(1)), color: '#4488FF' };
        }
        const remaining = Math.max(0, this.cooldown - (Date.now() - this.lastUseTime));
        if (remaining > 0) return { text: t('ws.cooldownS', (remaining / 1000).toFixed(1)), color: '#888888' };
        return { text: t('ws.readyShort'), color: '#4488FF' };
    }
}

// 月光大剑 - 占用双肩+右手+隐藏机能共4槽位
class MoonlightGreatsword extends Weapon {
    constructor() {
        super({
            type: 'moonlight_greatsword',
            name: '月光大剑',
            damage: 200,
            cooldown: 999999
        });
        this.isUsed = false;
        this.range = 3 * 50 * 7;
        this.slashes = [];
        this.isAttacking = false;
    }

    canUse() {
        if (this.isUsed) return false;
        return !this.isAttacking;
    }

    use(player) {
        if (!this.canUse()) return false;
        this.isUsed = true;
        this.lastUseTime = Date.now();
        this.isAttacking = true;

        const slash = new MoonlightSlash(
            player.x, player.y,
            player.direction,
            this.range,
            this.damage
        );
        this.slashes.push(slash);
        return true;
    }

    update(player) {
        for (let i = this.slashes.length - 1; i >= 0; i--) {
            this.slashes[i].update();
            if (this.slashes[i].isFinished) {
                this.slashes.splice(i, 1);
            }
        }
        if (this.isAttacking && this.slashes.length === 0) {
            this.isAttacking = false;
        }
    }

    draw(ctx, player) {
        for (const slash of this.slashes) {
            slash.draw(ctx);
        }
    }

    getStatus() {
        if (this.isAttacking) return { text: t('ws.slashing'), color: '#88CCFF' };
        if (this.isUsed) return { text: t('ws.used'), color: '#555555' };
        return { text: t('ws.readyShort'), color: '#88CCFF' };
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
        this.lastMissileFireTime = Date.now();
        this.lastMissileAngle = Math.atan2(targetY - launchY, targetX - launchX);
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
        if (!this.isLaunching) return;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;

        // Aggressive crimson energy ring + inner gold ring
        if (typeof drawEnergyRing === 'function') {
            drawEnergyRing(ctx, {
                x: cx, y: cy,
                radius: 48, thickness: 4,
                scheme: 'crimson', alpha: 1, segments: 6
            });
            drawEnergyRing(ctx, {
                x: cx, y: cy,
                radius: 28, thickness: 2.5,
                scheme: 'gold', alpha: 0.9, segments: 4
            });
        }
        // Per-missile flash (recorded by fireSuperMissile)
        if (this.lastMissileFireTime && Date.now() - this.lastMissileFireTime < 110) {
            const fade = 1 - (Date.now() - this.lastMissileFireTime) / 110;
            const ang = this.lastMissileAngle || 0;
            if (typeof drawMuzzleFlash === 'function') {
                drawMuzzleFlash(ctx, {
                    x: cx + Math.cos(ang) * (player.width / 2 + 6),
                    y: cy + Math.sin(ang) * (player.width / 2 + 6),
                    angle: ang,
                    size: 22,
                    scheme: 'crimson',
                    alpha: fade
                });
            }
        }
    }
    
    getStatus() {
        if (this.isUsed) {
            return { text: t('ws.used'), color: '#FF6666' };
        } else if (this.isLaunching) {
            return { text: t('ws.launchingSimple'), color: '#FFD700' };
        } else if (this.canUse()) {
            return { text: t('ws.ready'), color: '#FFD700' };
        } else {
            const cooldown = this.getCooldownRemaining();
            return { text: t('ws.cooldownRemaining', (cooldown / 1000).toFixed(1)), color: '#FF6666' };
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
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
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
            if (bossTargetable) enemies.push(game.boss);
        }
        if (game.enemies) {
            for (const e of game.enemies) {
                if (e.health > 0 && !e.notTargetable) enemies.push(e);
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
        if (this.reloading) return { text: t('ws.reloading'), color: '#CC6666' };
        return { text: t('ws.ammo', this.currentAmmo, this.magazineSize), color: '#00FF88' };
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
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable && this.collidesWith(game.boss)) {
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
        if (typeof drawTracer === 'function') {
            drawTracer(ctx, {
                x: this.x + this.width / 2,
                y: this.y + this.height / 2,
                vx: this.vx, vy: this.vy,
                length: 12,
                width: 2,
                scheme: 'green',
                alpha: 1
            });
        } else {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        }
    }
}

// 电浆场类
class PlasmaField {
    constructor(x, y, radius, options = {}) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.duration = options.duration != null ? options.duration : 1000;
        this.startTime = Date.now();
        this.damageInterval = options.damageInterval != null ? options.damageInterval : 250;
        this.damage = options.damage != null ? options.damage : 3;
        this.lastDamageTime = Date.now();
        this.shouldDestroy = false;

        // Hostile plasma fields (boss-spawned) damage the player instead of enemies.
        this.hostile = !!options.hostile;
        // Visual palette: 'cyan' (player default) or 'crimson' (boss).
        this.palette = options.palette || 'cyan';

        // Persistent visual state
        this._seed = Math.random() * 1000;
        this._rotA = Math.random() * Math.PI * 2;   // outer ring rotation
        this._rotB = Math.random() * Math.PI * 2;   // inner ring rotation (opposite)
        this._rotASpeed = 0.02 + Math.random() * 0.012;
        this._rotBSpeed = -(0.028 + Math.random() * 0.014);

        // Spawn-time impact: shockwave + particle burst (one-shot)
        if (typeof bossFX !== 'undefined') {
            const shock1 = this.palette === 'crimson' ? 'rgba(255,90,90,0.92)' : 'rgba(140,235,255,0.9)';
            const shock2 = this.palette === 'crimson' ? 'rgba(255,200,180,0.95)' : 'rgba(255,255,255,0.95)';
            const flashCol = this.palette === 'crimson' ? '#ffd0b0' : '#d6ffff';
            const burstCol = this.palette === 'crimson' ? '#ff7050' : '#88e6ff';
            bossFX.addShockwave(x, y, 6, this.radius * 1.15, shock1, 280, 4, 0.85);
            bossFX.addShockwave(x, y, 14, this.radius * 0.7, shock2, 220, 2, 0.75);
            bossFX.addFlash(x, y, this.radius * 0.55, flashCol, 180, 0.95);
            bossFX.spawnBurst(x, y, 14, {
                color: burstCol,
                speedMin: 1.6, speedMax: 5.5,
                sizeMin: 1.2, sizeMax: 2.6,
                lifeMs: 480, drag: 0.9
            });
        }

        // Persistent dribble particles (orbiting embers)
        this._embers = [];
        for (let i = 0; i < 14; i++) {
            this._embers.push({
                a: Math.random() * Math.PI * 2,
                r: this.radius * (0.45 + Math.random() * 0.5),
                aSpeed: (Math.random() - 0.5) * 0.05,
                rDrift: (Math.random() - 0.5) * 0.4,
                size: 0.9 + Math.random() * 1.6,
                hueT: Math.random()
            });
        }

        // Lightning arcs are regenerated every ~70ms instead of every frame
        // so flicker is rhythmic, not noisy.
        this._arcs = [];
        this._lastArcRefresh = 0;
        this._refreshArcs(Date.now());
    }

    _refreshArcs(now) {
        this._lastArcRefresh = now;
        this._arcs.length = 0;
        const arcCount = 7 + Math.floor(Math.random() * 4);
        for (let i = 0; i < arcCount; i++) {
            const baseAngle = Math.random() * Math.PI * 2;
            const len = this.radius * (0.5 + Math.random() * 0.55);
            const segs = 5 + Math.floor(Math.random() * 4);
            const path = [];
            const fork = Math.random() < 0.45;
            for (let s = 1; s <= segs; s++) {
                const t = s / segs;
                const jitter = this.radius * 0.09 * (1 - t * 0.4);
                path.push([
                    Math.cos(baseAngle) * len * t + (Math.random() - 0.5) * jitter,
                    Math.sin(baseAngle) * len * t + (Math.random() - 0.5) * jitter
                ]);
            }
            // Optional fork
            let forkPath = null;
            if (fork && segs >= 4) {
                const branchAt = Math.floor(segs * 0.55);
                const start = path[branchAt];
                const branchAngle = baseAngle + (Math.random() - 0.5) * 1.4;
                const branchLen = this.radius * 0.35 * (0.6 + Math.random() * 0.6);
                const branchSegs = 3 + Math.floor(Math.random() * 2);
                forkPath = [];
                for (let s = 1; s <= branchSegs; s++) {
                    const t = s / branchSegs;
                    forkPath.push([
                        start[0] + Math.cos(branchAngle) * branchLen * t + (Math.random() - 0.5) * 8,
                        start[1] + Math.sin(branchAngle) * branchLen * t + (Math.random() - 0.5) * 8
                    ]);
                }
            }
            this._arcs.push({ path, forkPath, born: now, life: 90 + Math.random() * 80 });
        }
    }
    
    update() {
        const now = Date.now();
        if (now - this.startTime >= this.duration) {
            this.shouldDestroy = true;
            return;
        }
        
        if (now - this.lastDamageTime >= this.damageInterval) {
            this.lastDamageTime = now;
            this.damageEnemies();
        }

        // Refresh lightning at a controlled rate
        if (now - this._lastArcRefresh > 75) this._refreshArcs(now);

        // Update embers
        for (const e of this._embers) {
            e.a += e.aSpeed;
            e.r += e.rDrift;
            if (e.r < this.radius * 0.2) e.rDrift = Math.abs(e.rDrift);
            if (e.r > this.radius * 0.95) e.rDrift = -Math.abs(e.rDrift);
        }
        this._rotA += this._rotASpeed;
        this._rotB += this._rotBSpeed;
    }
    
    damageEnemies() {
        if (this.hostile) {
            // Hostile (boss) plasma field: tick damage to the player instead.
            if (game.player && !game.player.shouldDestroy) {
                const px = game.player.x + game.player.width / 2;
                const py = game.player.y + game.player.height / 2;
                const dx = px - this.x;
                const dy = py - this.y;
                if (Math.sqrt(dx * dx + dy * dy) <= this.radius) {
                    if (typeof game.player.takeDamage === 'function') {
                        game.player.takeDamage(this.damage);
                    }
                }
            }
            return;
        }
        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
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
        const now = Date.now();
        const elapsed = now - this.startTime;
        const progress = Math.min(1, elapsed / this.duration);
        // Spawn ramp-up (first 15%) + linear fade
        const ramp = Math.min(1, elapsed / 150);
        const fade = ramp * Math.max(0, 1 - progress * 0.85);
        if (fade <= 0.01) return;

        // Palette presets keep the cyan player look default while letting
        // the boss spawn an angry red field with the same internal layout.
        const isCrimson = this.palette === 'crimson';
        const PAL = isCrimson ? {
            ground0: (a) => `rgba(255,90,70,${a * 0.40})`,
            ground1: (a) => `rgba(180,40,40,${a * 0.20})`,
            ground2: 'rgba(80,0,0,0)',
            orb0:    (a) => `rgba(255,255,230,${a * 0.95})`,
            orb1:    (a) => `rgba(255,180,140,${a * 0.82})`,
            orb2:    (a) => `rgba(255,90,60,${a * 0.55})`,
            orb3:    (a) => `rgba(200,40,40,${a * 0.32})`,
            orb4:    'rgba(80,10,10,0)',
            disc1:   'rgba(255,170,150,ALPHA)',
            disc2:   'rgba(255,255,230,ALPHA)',
            arcHalo: (a) => `rgba(255,140,90,${a})`,
            arcCore: (a) => `rgba(255,255,240,${a})`,
            arcFork: (a) => `rgba(255,180,150,${a})`,
            arcForkCore: (a) => `rgba(255,255,250,${a})`,
            tip0:    (a) => `rgba(255,255,240,${a})`,
            tip1:    'rgba(255,120,80,0)',
            ringHalo: (a) => `rgba(255,120,80,${a * 0.55})`,
            ringCore: (a) => `rgba(255,255,240,${a * 0.95})`,
            ringDash: (a) => `rgba(255,200,170,${a * 0.75})`,
            ember0: (a) => `rgba(255,255,240,${a * 0.95})`,
            ember1: (a) => `rgba(255,140,100,${a * 0.65})`,
            ember2: 'rgba(140,30,20,0)'
        } : {
            ground0: (a) => `rgba(80,200,255,${a * 0.35})`,
            ground1: (a) => `rgba(40,120,220,${a * 0.18})`,
            ground2: 'rgba(0,30,120,0)',
            orb0:    (a) => `rgba(255,255,255,${a * 0.95})`,
            orb1:    (a) => `rgba(180,255,240,${a * 0.8})`,
            orb2:    (a) => `rgba(80,220,255,${a * 0.55})`,
            orb3:    (a) => `rgba(60,120,240,${a * 0.3})`,
            orb4:    'rgba(20,50,180,0)',
            disc1:   'rgba(170,240,255,ALPHA)',
            disc2:   'rgba(255,255,255,ALPHA)',
            arcHalo: (a) => `rgba(140,230,255,${a})`,
            arcCore: (a) => `rgba(255,255,255,${a})`,
            arcFork: (a) => `rgba(180,240,255,${a})`,
            arcForkCore: (a) => `rgba(255,255,255,${a})`,
            tip0:    (a) => `rgba(255,255,255,${a})`,
            tip1:    'rgba(120,220,255,0)',
            ringHalo: (a) => `rgba(120,220,255,${a * 0.45})`,
            ringCore: (a) => `rgba(255,255,255,${a * 0.9})`,
            ringDash: (a) => `rgba(200,250,255,${a * 0.7})`,
            ember0: (a) => `rgba(255,255,255,${a * 0.95})`,
            ember1: (a) => `rgba(140,230,255,${a * 0.6})`,
            ember2: 'rgba(60,120,220,0)'
        };
        
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // === Layer 1: scorched ground halo (low alpha, soft) ===
        const groundGrad = ctx.createRadialGradient(
            this.x, this.y, this.radius * 0.2,
            this.x, this.y, this.radius * 1.25);
        groundGrad.addColorStop(0, PAL.ground0(fade));
        groundGrad.addColorStop(0.6, PAL.ground1(fade));
        groundGrad.addColorStop(1, PAL.ground2);
        ctx.fillStyle = groundGrad;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 1.25, 0, Math.PI * 2); ctx.fill();

        // === Layer 2: volumetric plasma orb ===
        const orbR = this.radius;
        const orb = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, orbR);
        orb.addColorStop(0, PAL.orb0(fade));
        orb.addColorStop(0.18, PAL.orb1(fade));
        orb.addColorStop(0.45, PAL.orb2(fade));
        orb.addColorStop(0.78, PAL.orb3(fade));
        orb.addColorStop(1, PAL.orb4);
        ctx.fillStyle = orb;
        ctx.beginPath(); ctx.arc(this.x, this.y, orbR, 0, Math.PI * 2); ctx.fill();

        // === Layer 3: rotating energy disc (outer + inner counter-rotating) ===
        const drawDisc = (rot, count, rOuter, rInner, alpha, color) => {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(rot);
            ctx.strokeStyle = color.replace('ALPHA', (fade * alpha).toFixed(3));
            ctx.lineWidth = 1.4;
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2;
        ctx.beginPath();
                ctx.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
                ctx.lineTo(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
                ctx.stroke();
            }
            ctx.restore();
        };
        drawDisc(this._rotA, 12, this.radius * 0.95, this.radius * 0.7, 0.55, PAL.disc1);
        drawDisc(this._rotB, 8, this.radius * 0.62, this.radius * 0.4, 0.7, PAL.disc2);

        // === Layer 4: lightning arcs (with optional forks) ===
        for (const arc of this._arcs) {
            const arcAge = (now - arc.born) / arc.life;
            const arcAlpha = Math.max(0, 1 - arcAge);
            // Outer halo
            ctx.strokeStyle = PAL.arcHalo(fade * 0.55 * arcAlpha);
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            for (const [px, py] of arc.path) ctx.lineTo(this.x + px, this.y + py);
            ctx.stroke();
            // Bright core
            ctx.strokeStyle = PAL.arcCore(fade * arcAlpha);
        ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            for (const [px, py] of arc.path) ctx.lineTo(this.x + px, this.y + py);
            ctx.stroke();
            // Fork
            if (arc.forkPath) {
                const last = arc.path[Math.floor(arc.path.length * 0.55)];
                ctx.strokeStyle = PAL.arcFork(fade * 0.5 * arcAlpha);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(this.x + last[0], this.y + last[1]);
                for (const [px, py] of arc.forkPath) ctx.lineTo(this.x + px, this.y + py);
                ctx.stroke();
                ctx.strokeStyle = PAL.arcForkCore(fade * 0.85 * arcAlpha);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.x + last[0], this.y + last[1]);
                for (const [px, py] of arc.forkPath) ctx.lineTo(this.x + px, this.y + py);
            ctx.stroke();
            }
            // Tip flash
            const tip = arc.path[arc.path.length - 1];
            const tipR = 6 + Math.random() * 3;
            const tipGrad = ctx.createRadialGradient(
                this.x + tip[0], this.y + tip[1], 0,
                this.x + tip[0], this.y + tip[1], tipR);
            tipGrad.addColorStop(0, PAL.tip0(fade * arcAlpha));
            tipGrad.addColorStop(1, PAL.tip1);
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.arc(this.x + tip[0], this.y + tip[1], tipR, 0, Math.PI * 2);
            ctx.fill();
        }

        // === Layer 5: pulsing edge ring (containment field) ===
        const pulse = 0.92 + 0.08 * Math.sin(elapsed * 0.018);
        // Outer halo ring
        ctx.strokeStyle = PAL.ringHalo(fade);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.stroke();
        // Bright thin ring
        ctx.strokeStyle = PAL.ringCore(fade);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.stroke();
        // Dashed inner ring (electric containment)
        ctx.save();
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -elapsed * 0.06;
        ctx.strokeStyle = PAL.ringDash(fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.78 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // === Layer 6: orbiting embers ===
        for (const e of this._embers) {
            const ex = this.x + Math.cos(e.a) * e.r;
            const ey = this.y + Math.sin(e.a) * e.r;
            const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, e.size * 4);
            eg.addColorStop(0, PAL.ember0(fade));
            eg.addColorStop(0.5, PAL.ember1(fade));
            eg.addColorStop(1, PAL.ember2);
            ctx.fillStyle = eg;
            ctx.beginPath();
            ctx.arc(ex, ey, e.size * 4, 0, Math.PI * 2);
            ctx.fill();
            // Bright core
            ctx.fillStyle = PAL.ember0(fade);
            ctx.beginPath();
            ctx.arc(ex, ey, e.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// 电浆飞弹类 - 近炸引信
class PlasmaMissile {
    constructor(x, y, targetX, targetY, speed = 10, options = {}) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.maxSpeed = speed;
        this.currentSpeed = speed * 0.6;
        this.shouldDestroy = false;
        
        // Hostile mode: boss-launched plasma missile that homes on
        // the player and leaves a hostile crimson plasma field
        // when it detonates. Same flight + fuse logic as the
        // player version.
        this.hostile = !!options.hostile;
        this.fuseRadius = options.fuseRadius || 55;
        this.fieldRadius = options.fieldRadius || Math.round(this.fuseRadius * 1.3);
        this.fieldDuration = options.fieldDuration || 1500;
        this.fieldDamageInterval = options.fieldDamageInterval || 250;
        this.fieldDamage = options.fieldDamage || 4;
        this.contactDamage = options.contactDamage || 0; // hostile: damage to player on detonate

        // Arming delay: real proximity-fused missiles arm only
        // after they have flown clear of the launcher. Without
        // this the missile can detonate on frame 0 against a
        // friendly/training target standing next to the player.
        this.armingDelay = options.armingDelay !== undefined ? options.armingDelay : 250;
        
        this.maxLifetime = options.maxLifetime || (this.hostile ? 5000 : 3000);
        // When true, expiring or going off-screen triggers detonate()
        // instead of a silent removal — used for hostile plasma orbs
        // that should always blanket their endpoint with a danger
        // field even if they never quite reach the player.
        this.detonateOnExpire = !!options.detonateOnExpire;
        // Dormant mode: the orb sits in place, no homing, no
        // proximity fuse, no lifetime decay. Used by Crimson King's
        // plasma-mine sequence — the boss seeds dormant orbs around
        // the arena and later "activates" them in a salvo.
        this.dormant = !!options.dormant;
        this.startTime = Date.now();
        this.trackingRadius = 160;
        this.currentTarget = null;
        this.strongTrackingDuration = options.strongTrackingDuration || (this.hostile ? 3000 : 1100);
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
        // Dormant orbs sit in place until activated. They don't age,
        // don't home, don't fuse, but they DO obey their seeded
        // velocity (normally 0) so they stay put.
        if (this.dormant) {
            this.x += this.vx;
            this.y += this.vy;
            return;
        }

        if (Date.now() - this.startTime > this.maxLifetime) {
            // Hostile (boss) plasma missiles silently expire on
            // timeout — we don't want them carpeting the arena
            // edges with hostile fields when they overshoot.
            // Exception: detonateOnExpire forces a detonation so the
            // orb always becomes a danger field at end-of-life.
            if (this.hostile && !this.detonateOnExpire) {
                this.shouldDestroy = true;
                return;
            }
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
            // Same rule for OOB hostile missiles — silently
            // disappear instead of dropping a plasma field at the
            // wall.
            if (this.hostile) {
                this.shouldDestroy = true;
                return;
            }
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
        if (this.hostile) {
            // Hostile plasma missile homes only on the player.
            if (game.player && !game.player.isUntargetable) {
                const elapsedTime = Date.now() - this.startTime;
                const trackingRadius = elapsedTime <= this.strongTrackingDuration ? 1600 : 600;
                const dx = (game.player.x + game.player.width / 2) - this.x;
                const dy = (game.player.y + game.player.height / 2) - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                this.currentTarget = (distance < trackingRadius) ? game.player : null;
            } else {
                this.currentTarget = null;
            }
            return;
        }

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
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
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
        // Don't trigger the proximity fuse during the arming
        // delay — otherwise enemies (or training dummies) standing
        // right next to the player make every shot self-detonate
        // on frame zero.
        if (Date.now() - this.startTime < this.armingDelay) return;

        if (this.hostile) {
            // Detonate near the player.
            if (!game.player || game.player.isUntargetable) return;
            const dx = (game.player.x + game.player.width / 2) - this.x;
            const dy = (game.player.y + game.player.height / 2) - this.y;
            if (dx * dx + dy * dy < this.fuseRadius * this.fuseRadius) {
                this.detonate();
            }
            return;
        }

        const allEnemies = [...game.enemies];
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
            allEnemies.push(game.boss);
        }
        
        for (const enemy of allEnemies) {
            const dx = enemy.x + enemy.width / 2 - this.x;
            const dy = enemy.y + enemy.height / 2 - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.fuseRadius) {
                // Yukikon shadow clones nullify the orb without spawning
                // a plasma field — the missile just pops harmlessly.
                if (enemy.isYukikonClone) {
                    this.shouldDestroy = true;
                    if (typeof bossFX !== 'undefined') {
                        bossFX.addFlash(this.x, this.y, 24, '#bfeaff', 220, 0.85);
                        bossFX.spawnBurst(this.x, this.y, 12, {
                            color: '#bfeaff',
                            speedMin: 1, speedMax: 3,
                            sizeMin: 1, sizeMax: 2,
                            lifeMs: 320,
                            spreadAngle: Math.PI * 2,
                            baseAngle: 0,
                            drag: 0.9
                        });
                    }
                    return;
                }
                this.detonate();
                return;
            }
        }
    }
    
    detonate() {
        if (this.shouldDestroy) return;
        
        if (!game.plasmaFields) game.plasmaFields = [];
        if (this.hostile) {
            // Hostile plasma field damages the player and uses the
            // crimson palette so it reads visually distinct from
            // friendly cyan fields.
            game.plasmaFields.push(new PlasmaField(this.x, this.y, this.fieldRadius, {
                duration: this.fieldDuration,
                damageInterval: this.fieldDamageInterval,
                damage: this.fieldDamage,
                hostile: true,
                palette: 'crimson'
            }));
            // Direct contact damage on detonation (hostile only).
            if (this.contactDamage > 0 && game.player && !game.player.isUntargetable) {
                const dx = (game.player.x + game.player.width / 2) - this.x;
                const dy = (game.player.y + game.player.height / 2) - this.y;
                if (dx * dx + dy * dy < this.fuseRadius * this.fuseRadius * 1.4 * 1.4) {
                    if (typeof game.player.takeDamage === 'function') {
                        game.player.takeDamage(this.contactDamage);
                    }
                }
            }
        } else {
        game.plasmaFields.push(new PlasmaField(this.x, this.y, this.fieldRadius));
        }
        
        if (!game.explosions) game.explosions = [];
        game.explosions.push({
            x: this.x,
            y: this.y,
            startTime: Date.now(),
            duration: 350,
            isBossMissile: !!this.hostile,
            isSuperMissile: false,
            explosionRadius: this.fuseRadius,
            isPlasma: true
        });
        
        this.shouldDestroy = true;
    }
    
    draw(ctx) {
        const angle = Math.atan2(this.vy, this.vx);

        // Color palette: cyan for friendly plasma missiles, hot
        // pink for the Crimson King's hostile orbs.
        const haloCol = this.hostile ? '#ff80a0' : '#80ffe0';
        const bodyCol1 = this.hostile ? '#ffb0c8' : '#9adcd0';
        const bodyCol2 = this.hostile ? '#a02040' : '#287a70';
        const bodyCol3 = this.hostile ? '#400010' : '#003030';
        const noseInner = '#ffffff';
        const noseMid = this.hostile ? '#ff60a0' : '#80ffe0';
        const noseOuter = this.hostile ? 'rgba(180,0,40,0)' : 'rgba(0,150,140,0)';
        const flameScheme = this.hostile ? 'crimson' : 'azure';

        // Glowing additive trail
        if (this.trail && this.trail.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            // Halo
            ctx.strokeStyle = haloCol;
            for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.45 * t;
                ctx.lineWidth = 2 + 4 * t;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            // Bright core
            ctx.strokeStyle = '#ffffff';
            for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.9 * t;
                ctx.lineWidth = 1 + 1.4 * t;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Tail jet flame
        if (typeof drawJetFlame === 'function') {
            drawJetFlame(ctx, {
                originX: this.x - Math.cos(angle) * 5,
                originY: this.y - Math.sin(angle) * 5,
                angle: angle + Math.PI,
                length: 16, width: 6,
                intensity: 0.8,
                scheme: flameScheme,
                spawnEmbers: true,
                emberDensity: 0.3,
                id: (this._fxId = this._fxId || Math.floor(Math.random() * 100))
            });
        }

        // Body + glowing nose
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        // Hostile orbs are visibly chunkier than friendly missiles.
        const sx = this.hostile ? 1.7 : 1.0;
        ctx.scale(sx, sx);
        const bodyGrad = ctx.createLinearGradient(0, -3, 0, 3);
        bodyGrad.addColorStop(0, bodyCol1);
        bodyGrad.addColorStop(0.5, bodyCol2);
        bodyGrad.addColorStop(1, bodyCol3);
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(-6, -2.5, 12, 5);
        ctx.globalCompositeOperation = 'lighter';
        const noseGrad = ctx.createRadialGradient(6, 0, 0, 6, 0, 8);
        noseGrad.addColorStop(0, noseInner);
        noseGrad.addColorStop(0.5, noseMid);
        noseGrad.addColorStop(1, noseOuter);
        ctx.fillStyle = noseGrad;
        ctx.beginPath(); ctx.arc(6, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // Wake a dormant orb up: reset its lifetime clock, give it homing
    // velocity toward the target (normally the player), and re-arm
    // the proximity fuse. Used by Crimson King's plasma-mine activation.
    activate(targetX, targetY, options = {}) {
        if (!this.dormant) return;
        this.dormant = false;
        this.startTime = Date.now();
        const launchSpeed = options.speed != null ? options.speed : (this.maxSpeed * 0.6);
        this.maxSpeed = options.maxSpeed != null ? options.maxSpeed : this.maxSpeed;
        this.currentSpeed = launchSpeed;
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            this.vx = (dx / dist) * launchSpeed;
            this.vy = (dy / dist) * launchSpeed;
        } else {
            this.vx = 0;
            this.vy = launchSpeed;
        }
        if (options.armingDelay != null) this.armingDelay = options.armingDelay;
        if (options.maxLifetime != null) this.maxLifetime = options.maxLifetime;
        if (options.strongTrackingDuration != null) {
            this.strongTrackingDuration = options.strongTrackingDuration;
        }
        if (options.detonateOnExpire != null) {
            this.detonateOnExpire = !!options.detonateOnExpire;
        }
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
            if (typeof drawEnergyRing === 'function') {
                drawEnergyRing(ctx, {
                    x: px, y: py,
                    radius: 30, thickness: 2.5,
                    scheme: 'cyan', alpha: 0.85, segments: 4
                });
            }
        }
    }
    
    getStatus() {
        if (this.isLaunching) return { text: t('ws.launchingSimple'), color: '#00FFCC' };
        const remaining = Math.max(0, this.cooldown - (Date.now() - this.lastUseTime));
        if (remaining > 0) return { text: t('ws.cooldownS', (remaining / 1000).toFixed(1)), color: '#888888' };
        return { text: t('ws.readyShort'), color: '#00FFCC' };
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
        
        if (this.isReversed) {
            this.checkPlayerCollision();
        } else {
            this.checkProximityAndSplit();
        }
    }
    
    checkPlayerCollision() {
        const target = getBossTarget(this.x, this.y);
        if (!target) return;
        const dx = target.x + target.width / 2 - this.x;
        const dy = target.y + target.height / 2 - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < (target.width + target.height) / 4 + 10) {
            if (target === game.player) {
                game.player.takeDamage(5);
            } else {
                target.takeDamage(5);
            }
            this.selfDestruct();
        }
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
        if (this.isReversed) {
            this.currentTarget = getBossTarget(this.x, this.y) || game.player;
            return;
        }
        
        let closestTarget = null;
        let closestDistance = this.trackingRadius;
        
        const allEnemies = game.enemies.filter(e => !e.notTargetable);
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
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
        const allEnemies = game.enemies.filter(e => !e.notTargetable);
        if (game.boss && game.boss.health > 0 && !game.boss.notTargetable) {
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
        const baseAngle = Math.atan2(this.vy, this.vx);
        for (let i = 0; i < childCount; i++) {
            // 以母弹飞行方向为中心，均匀扇形散开
            const fanSpread = Math.PI * 50 / 180;
            const angle = baseAngle - fanSpread / 2 + (fanSpread / (childCount - 1)) * i + (Math.random() - 0.5) * 0.15;
            const spreadDist = 12;
            const childX = this.x + Math.cos(angle) * spreadDist;
            const childY = this.y + Math.sin(angle) * spreadDist;
            
            // 初始目标设为扇形散开方向（散开阶段用）
            const targetX = this.x + Math.cos(angle) * 200;
            const targetY = this.y + Math.sin(angle) * 200;
            
            const child = new Missile(childX, childY, targetX, targetY, 3, 13);
            child.maxLifetime = 2500;
            child.trackingRadius = 250;
            child.strongTrackingDuration = 2200;
            child.isClusterChild = true;
            child.guidanceDelay = 200;
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
        const angle = Math.atan2(this.vy, this.vx);

        // Glowing additive trail
        if (this.trail && this.trail.length > 1) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#ffb060';
            for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.5 * t;
                ctx.lineWidth = 3 + 5 * t;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.strokeStyle = '#ffffff';
            for (let i = 1; i < this.trail.length; i++) {
                const t = i / this.trail.length;
                ctx.globalAlpha = 0.95 * t;
                ctx.lineWidth = 1.2 + 1.6 * t;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Tail jet
        if (typeof drawJetFlame === 'function') {
            drawJetFlame(ctx, {
                originX: this.x - Math.cos(angle) * 7,
                originY: this.y - Math.sin(angle) * 7,
                angle: angle + Math.PI,
                length: 24, width: 9,
                intensity: 0.95,
                scheme: 'orange',
                spawnEmbers: true,
                emberDensity: 0.5,
                id: (this._fxId = this._fxId || Math.floor(Math.random() * 100))
            });
        }

        // Body + animated split-warning ring
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        // Body
        const bodyGrad = ctx.createLinearGradient(0, -4, 0, 4);
        bodyGrad.addColorStop(0, '#cc7a30');
        bodyGrad.addColorStop(0.5, '#7a3a10');
        bodyGrad.addColorStop(1, '#2a1000');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(-8, -4, 16, 8);
        // Pointed nose
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(8, -4);
        ctx.lineTo(13, 0);
        ctx.lineTo(8, 4);
        ctx.fill();
        // Warning ring (additive pulse)
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.01);
        ctx.strokeStyle = `rgba(255,210,80,${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        // Glowing nose
        const noseGrad = ctx.createRadialGradient(11, 0, 0, 11, 0, 9);
        noseGrad.addColorStop(0, '#ffffff');
        noseGrad.addColorStop(0.5, '#ffb070');
        noseGrad.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = noseGrad;
        ctx.beginPath(); ctx.arc(11, 0, 9, 0, Math.PI * 2); ctx.fill();
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
        if (remaining > 0) return { text: t('ws.cooldownS', (remaining / 1000).toFixed(1)), color: '#888888' };
        return { text: t('ws.readyShort'), color: '#FFD700' };
    }
}

// ============================================================
// ShotgunPellet: Bullet variant whose damage decays linearly with distance.
// At point blank it deals full base damage; at max range it drops to 20%.
// Visual tracer also shortens/fades as the pellet loses energy.
// ============================================================
class ShotgunPellet extends Bullet {
    constructor(x, y, direction, speed, baseDamage, range) {
        super(x, y, direction, speed, baseDamage, range);
        this.color = '#ff9040';
        this._fxScheme = 'orange';
        this.baseDamage = baseDamage;
        // Minimum damage retained at max range (fraction of base).
        this.minDamageFactor = 0.2;
    }

    update() {
        super.update();
        // Recompute damage from current travel distance every frame so the
        // value read by collision code reflects falloff at impact moment.
        const progress = Math.min(1, this.distanceTraveled / this.maxRange);
        const factor = 1 - (1 - this.minDamageFactor) * progress;
        this.damage = Math.max(1, Math.round(this.baseDamage * factor));
    }

    draw(ctx) {
        if (typeof drawTracer !== 'function') {
            super.draw(ctx);
            return;
        }
        // Pellet visual fades with distance to telegraph the damage falloff.
        const progress = Math.min(1, this.distanceTraveled / this.maxRange);
        const length = 18 - progress * 9;   // shorter tracer late in flight
        const width = 3.6 - progress * 1.6; // thinner tail
        const alpha = 1 - progress * 0.55;  // fades but never invisible
        drawTracer(ctx, {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            vx: this.vx,
            vy: this.vy,
            length,
            width,
            scheme: 'orange',
            alpha
        });
    }
}

// ============================================================
// Shotgun: cone-spread pellet weapon, damage falls off with distance.
// ============================================================
// ============================================================
// Minigun: hand-held rotary cannon. Massive 200-round drum, each
// round hits twice as hard as the Auto Rifle, but the long belt
// takes 4× the rifle's reload time to swap. Spins up before
// firing, with a slight cone of inaccuracy and continuous muzzle
// flash for the rotating-barrel feel.
// ============================================================
class Minigun extends Weapon {
    constructor() {
        super({
            type: 'minigun',
            name: '加特林',
            damage: 12, // 2× the Auto Rifle's 6 dmg
            cooldown: 0
        });

        this.fireRate = 14; // rounds per second — high ROF
        this.magazineSize = 200;
        this.range = 32 * 50;
        this.bulletSpeed = 26;

        this.currentAmmo = this.magazineSize;
        this.reloading = false;
        this.reloadStartTime = 0;
        this.reloadDuration = 45000; // long belt-feed reload — pay for the firepower

        // Spin-up: barrel must rev up before reaching peak ROF.
        this.spinUpDuration = 350;
        this.spinUpStart = 0;
        this.isSpinning = false;
        this.spread = 4; // degrees of cone inaccuracy

        // Distance-based damage falloff: full damage up close, decays
        // to 30% at max range so the minigun rewards staying close.
        this.falloffStart = 32 * 8;   // ~8 tiles: full damage band
        this.falloffEnd = this.range; // fades all the way to max range
        this.falloffMinMul = 0.3;     // 30% damage at the far end

        this.lastMuzzleFlashTime = 0;
        this.lastMuzzleAngle = 0;
        this.barrelAngle = 0; // visual rotation
    }

    canUse() {
        const now = Date.now();
        const fireInterval = 1000 / this.fireRate;
        return (now - this.lastUseTime >= fireInterval) && !this.reloading;
    }

    use(player) {
        if (!this.canUse()) return false;

        if (this.currentAmmo <= 0) {
            if (!this.reloading) this.reload();
            return false;
        }

        const now = Date.now();
        // Track spin-up: if we haven't fired recently, restart the rev.
        if (!this.isSpinning) {
            this.isSpinning = true;
            this.spinUpStart = now;
        }

        this.lastUseTime = now;
        this.currentAmmo--;
        if (this.currentAmmo <= 0) this.reload();

        const bulletX = player.x + player.width / 2;
        const bulletY = player.y + player.height / 2;

        const aimAngle = this._calcAimAngle(player, bulletX, bulletY);
        const jitter = (Math.random() - 0.5) * this.spread * 2;
        const finalAngle = aimAngle + jitter;

        const bullet = new Bullet(
            bulletX, bulletY,
            finalAngle,
            this.bulletSpeed,
            this.damage,
            this.range,
            {
                falloffStart: this.falloffStart,
                falloffEnd: this.falloffEnd,
                falloffMinMul: this.falloffMinMul
            }
        );
        game.bullets.push(bullet);

        this.lastMuzzleFlashTime = now;
        this.lastMuzzleAngle = finalAngle * Math.PI / 180;
        return true;
    }

    _calcAimAngle(player, ox, oy) {
        if (gameState.lockMode === 'manual') {
            const tx = gameState.manualLockX || mouse.x;
            const ty = gameState.manualLockY || mouse.y;
            return Math.atan2(ty - oy, tx - ox) * 180 / Math.PI;
        }
        const tgt = player.getCurrentTarget();
        if (!tgt) return player.direction;
        const ex = tgt.x + tgt.width / 2;
        const ey = tgt.y + tgt.height / 2;

        const evx = tgt.vx || 0;
        const evy = tgt.vy || 0;
        const dx = ex - ox;
        const dy = ey - oy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const flightTime = dist / this.bulletSpeed;
        const px = ex + evx * flightTime;
        const py = ey + evy * flightTime;
        return Math.atan2(py - oy, px - ox) * 180 / Math.PI;
    }

    reload() {
        this.reloading = true;
        this.reloadStartTime = Date.now();
        this.isSpinning = false;
    }

    canReload() {
        return !this.reloading && this.currentAmmo < this.magazineSize;
    }

    update(player) {
        if (this.reloading) {
            if (Date.now() - this.reloadStartTime >= this.reloadDuration) {
                this.reloading = false;
                this.currentAmmo = this.magazineSize;
            }
        }
        // Drop spin if we haven't fired recently so the next burst rev-ups again.
        if (this.isSpinning && Date.now() - this.lastUseTime > 250) {
            this.isSpinning = false;
        }
        // Visual barrel spin: rotate faster while spinning, decay when idle.
        if (this.isSpinning) {
            this.barrelAngle += 0.6;
        } else {
            this.barrelAngle += 0.05;
        }
    }

    draw(ctx, player) {
        if (!this.lastMuzzleFlashTime) return;
        const dt = Date.now() - this.lastMuzzleFlashTime;
        if (dt > 70) return;
        const fade = 1 - dt / 70;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const offset = player.width / 2 + 6;
        const fx = px + Math.cos(this.lastMuzzleAngle) * offset;
        const fy = py + Math.sin(this.lastMuzzleAngle) * offset;
        if (typeof drawMuzzleFlash === 'function') {
            drawMuzzleFlash(ctx, {
                x: fx, y: fy,
                angle: this.lastMuzzleAngle,
                size: 20,
                scheme: 'gold',
                alpha: fade
            });
        }
    }

    getStatus() {
        if (this.reloading) return { text: t('ws.reloading'), color: '#CC6666' };
        if (this.currentAmmo === 0) return { text: t('ws.ammoEmpty'), color: '#CC6666' };
        let statusText = t('ws.ammo', this.currentAmmo, this.magazineSize);
        if (this.currentAmmo < this.magazineSize) statusText += t('ws.pressR');
        return { text: statusText, color: 'white' };
    }
}

// ============================================================
// Shotgun: cone spread of pellets, magazine + reload, heavy boom.
// ============================================================
class Shotgun extends Weapon {
    constructor() {
        super({
            type: 'shotgun',
            name: '霰弹枪',
            damage: 8,
            cooldown: 700
        });

        this.pelletsPerShot = 12;
        this.spreadAngle = 22;
        this.range = 14 * 50;
        this.bulletSpeed = 30;
        this.magazineSize = 6;
        this.currentAmmo = this.magazineSize;
        this.reloading = false;
        this.reloadStartTime = 0;
        this.reloadDuration = 1600;

        this.lastMuzzleFlashTime = 0;
        this.lastMuzzleAngle = 0;
        this.recoilEnd = 0;
    }

    canUse() {
        return super.canUse() && !this.reloading;
    }

    use(player) {
        if (!this.canUse()) return false;

        if (this.currentAmmo <= 0) {
            if (!this.reloading) this.reload();
            return false;
        }

        this.lastUseTime = Date.now();
        this.currentAmmo--;
        if (this.currentAmmo <= 0) this.reload();

        const muzzleX = player.x + player.width / 2;
        const muzzleY = player.y + player.height / 2;
        const aimAngleDeg = this._calcAimAngle(player, muzzleX, muzzleY);
        const aimRad = aimAngleDeg * Math.PI / 180;

        const spreadRad = this.spreadAngle * Math.PI / 180;
        for (let i = 0; i < this.pelletsPerShot; i++) {
            // Distribute pellets across the cone with slight randomness.
            const t = this.pelletsPerShot === 1 ? 0 : (i / (this.pelletsPerShot - 1)) - 0.5;
            const jitter = (Math.random() - 0.5) * spreadRad * 0.25;
            const pelletAngle = (aimAngleDeg + (t * this.spreadAngle) + jitter * 180 / Math.PI);
            const speedJitter = this.bulletSpeed * (0.85 + Math.random() * 0.25);
            const rangeJitter = this.range * (0.8 + Math.random() * 0.3);

            const pellet = new ShotgunPellet(muzzleX, muzzleY, pelletAngle, speedJitter, this.damage, rangeJitter);
            game.bullets.push(pellet);
        }

        this.lastMuzzleFlashTime = Date.now();
        this.lastMuzzleAngle = aimRad;
        this.recoilEnd = Date.now() + 140;

        // Screen feedback for the heavy boom.
        if (typeof bossFX !== 'undefined' && bossFX.addShake) {
            bossFX.addShake(2.4, 90);
        }
        return true;
    }

    _calcAimAngle(player, ox, oy) {
        if (gameState.lockMode === 'manual') {
            const tx = gameState.manualLockX || mouse.x;
            const ty = gameState.manualLockY || mouse.y;
            return Math.atan2(ty - oy, tx - ox) * 180 / Math.PI;
        }
        const tgt = player.getCurrentTarget();
        if (!tgt) return player.direction;
        const ex = tgt.x + tgt.width / 2;
        const ey = tgt.y + tgt.height / 2;
        return Math.atan2(ey - oy, ex - ox) * 180 / Math.PI;
    }

    reload() {
        this.reloading = true;
        this.reloadStartTime = Date.now();
    }

    canReload() {
        return !this.reloading && this.currentAmmo < this.magazineSize;
    }

    update(player) {
        if (this.reloading && Date.now() - this.reloadStartTime >= this.reloadDuration) {
            this.reloading = false;
            this.currentAmmo = this.magazineSize;
        }
    }

    draw(ctx, player) {
        if (!this.lastMuzzleFlashTime) return;
        const dt = Date.now() - this.lastMuzzleFlashTime;
        if (dt > 110) return;
        const fade = 1 - dt / 110;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const offset = player.width / 2 + 8;
        const fx = px + Math.cos(this.lastMuzzleAngle) * offset;
        const fy = py + Math.sin(this.lastMuzzleAngle) * offset;
        if (typeof drawMuzzleFlash === 'function') {
            drawMuzzleFlash(ctx, {
                x: fx, y: fy,
                angle: this.lastMuzzleAngle,
                size: 26,
                scheme: 'orange',
                alpha: fade
            });
        }
    }

    getStatus() {
        if (this.reloading) return { text: t('ws.reloading'), color: '#CC6666' };
        if (this.currentAmmo === 0) return { text: t('ws.ammoEmpty'), color: '#CC6666' };
        let txt = t('ws.ammo', this.currentAmmo, this.magazineSize);
        if (this.currentAmmo < this.magazineSize) txt += t('ws.pressR');
        return { text: txt, color: 'white' };
    }
}

// ============================================================
// RocketLauncher: single heavy projectile, AOE explosion on impact.
// Slow speed, long cooldown, small magazine, knockback shake.
// ============================================================
class RocketLauncher extends Weapon {
    constructor() {
        super({
            type: 'rocket_launcher',
            name: '火箭筒',
            damage: 30,
            cooldown: 0
        });

        this.fireInterval = 1100;
        this.range = 18 * 50;
        this.rocketSpeed = 13;
        this.explosionRadius = 180;
        // Single-shot tube: every fire forces a reload cycle.
        this.magazineSize = 1;
        this.currentAmmo = this.magazineSize;
        this.reloading = false;
        this.reloadStartTime = 0;
        this.reloadDuration = 2600;

        this.lastFireTime = 0;
        this.lastMuzzleFlashTime = 0;
        this.lastMuzzleAngle = 0;
    }

    canUse() {
        const now = Date.now();
        return (now - this.lastFireTime >= this.fireInterval) && !this.reloading;
    }

    use(player) {
        if (!this.canUse()) return false;
        if (this.currentAmmo <= 0) {
            if (!this.reloading) this.reload();
            return false;
        }

        this.lastFireTime = Date.now();
        this.lastUseTime = this.lastFireTime;
        this.currentAmmo--;
        if (this.currentAmmo <= 0) this.reload();

        const launchX = player.x + player.width / 2;
        const launchY = player.y + player.height / 2;

        let targetX, targetY;
        if (gameState.lockMode === 'manual') {
            targetX = gameState.manualLockX || mouse.x;
            targetY = gameState.manualLockY || mouse.y;
        } else {
            const tgt = player.getCurrentTarget();
            if (tgt) {
                targetX = tgt.x + tgt.width / 2;
                targetY = tgt.y + tgt.height / 2;
            } else {
                const ang = player.direction * Math.PI / 180;
                targetX = launchX + Math.cos(ang) * 400;
                targetY = launchY + Math.sin(ang) * 400;
            }
        }

        const rocket = new Rocket(launchX, launchY, targetX, targetY, this.damage, this.rocketSpeed, this.explosionRadius, this.range);
        if (!game.bossMissiles) game.bossMissiles = [];
        // Reuse the missiles array as the engine already updates it; rockets are player-owned.
        if (!game.missiles) game.missiles = [];
        game.missiles.push(rocket);

        this.lastMuzzleFlashTime = Date.now();
        this.lastMuzzleAngle = Math.atan2(targetY - launchY, targetX - launchX);

        if (typeof bossFX !== 'undefined' && bossFX.addShake) {
            bossFX.addShake(3.5, 130);
        }
        return true;
    }

    reload() {
        this.reloading = true;
        this.reloadStartTime = Date.now();
    }

    canReload() {
        return !this.reloading && this.currentAmmo < this.magazineSize;
    }

    update(player) {
        if (this.reloading && Date.now() - this.reloadStartTime >= this.reloadDuration) {
            this.reloading = false;
            this.currentAmmo = this.magazineSize;
        }
    }

    draw(ctx, player) {
        if (!this.lastMuzzleFlashTime) return;
        const dt = Date.now() - this.lastMuzzleFlashTime;
        if (dt > 160) return;
        const fade = 1 - dt / 160;
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const offset = player.width / 2 + 10;
        const fx = px + Math.cos(this.lastMuzzleAngle) * offset;
        const fy = py + Math.sin(this.lastMuzzleAngle) * offset;
        if (typeof drawMuzzleFlash === 'function') {
            drawMuzzleFlash(ctx, {
                x: fx, y: fy,
                angle: this.lastMuzzleAngle,
                size: 34,
                scheme: 'orange',
                alpha: fade
            });
        }
    }

    getStatus() {
        if (this.reloading) return { text: t('ws.reloading'), color: '#CC6666' };
        if (this.currentAmmo === 0) return { text: t('ws.ammoEmpty'), color: '#CC6666' };
        let txt = t('ws.ammo', this.currentAmmo, this.magazineSize);
        if (this.currentAmmo < this.magazineSize) txt += t('ws.pressR');
        return { text: txt, color: 'white' };
    }
}

// ============================================================
// Rocket projectile: straight-flying heavy round with AOE on impact.
// Lives in game.missiles so the existing pipeline updates/draws/prunes it.
// ============================================================
class Rocket extends GameObject {
    constructor(x, y, targetX, targetY, damage, speed, explosionRadius, maxRange) {
        super(x, y, 14, 14, '#ff8030');
        this.damage = damage;
        this.speed = speed;
        this.explosionRadius = explosionRadius;
        this.maxRange = maxRange || 1200;
        this.startX = x;
        this.startY = y;

        const dx = targetX - x;
        const dy = targetY - y;
        const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        this.angle = Math.atan2(dy, dx);
        this.vx = (dx / len) * speed;
        this.vy = (dy / len) * speed;

        this.exploded = false;
        this.spawnTime = Date.now();
        this._trail = [];
        // Tag so external code can recognize player rockets if needed.
        this.isPlayerRocket = true;
        // Compatibility fields with Missile pipeline.
        this.isBossMissile = false;
    }

    update() {
        if (this.exploded) return;
        super.update();

        // Track travel distance for max-range explode.
        const dx = this.x - this.startX;
        const dy = this.y - this.startY;
        const traveled = Math.sqrt(dx * dx + dy * dy);

        // Trail samples.
        this._trail.push({ x: this.x + this.width / 2, y: this.y + this.height / 2, t: Date.now() });
        if (this._trail.length > 14) this._trail.shift();

        // Out-of-bounds or out-of-range -> detonate.
        if (traveled > this.maxRange ||
            this.x < -40 || this.x > GAME_CONFIG.WIDTH + 40 ||
            this.y < -40 || this.y > GAME_CONFIG.HEIGHT + 40) {
            this._detonate();
            return;
        }

        // Direct hit: any enemy or boss.
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const targets = [...game.enemies];
        if (game.boss && !game.boss.notTargetable) targets.push(game.boss);
        for (const t of targets) {
            if (!t || t.shouldDestroy) continue;
            const ex = t.x + t.width / 2;
            const ey = t.y + t.height / 2;
            const r = (t.width + t.height) / 4 + 10;
            const ddx = ex - cx;
            const ddy = ey - cy;
            if (ddx * ddx + ddy * ddy <= r * r) {
                this._detonate();
                return;
            }
        }
    }

    _detonate() {
        if (this.exploded) return;
        this.exploded = true;
        this.shouldDestroy = true;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const radius = this.explosionRadius;

        // Build target list (player rocket damages enemies + boss).
        const targets = [...game.enemies];
        if (game.boss && !game.boss.notTargetable) targets.push(game.boss);

        targets.forEach(enemy => {
            if (!enemy || enemy.shouldDestroy) return;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dx = ex - cx;
            const dy = ey - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) return;

            // Falloff: full damage at center, fades to ~5% at the edge.
            // Quadratic curve gives a strong center punch and a softer rim.
            const norm = dist / radius;            // 0 at center .. 1 at edge
            const falloff = Math.max(0.05, 1 - norm * norm);
            const dmg = Math.max(1, Math.round(this.damage * falloff));
            // SublimeMoon halves bullet-class damage; rockets count as missile/explosive.
            const isDead = enemy.takeDamage(dmg, 'missile');
            gameState.score += dmg;
            gameState.totalDamage += dmg;

            if (isDead) {
                if (enemy instanceof Boss || enemy instanceof SublimeMoon || enemy instanceof UglyEmperor || enemy instanceof Magnus || enemy instanceof HiveMind) {
                    handleBossKill();
                } else {
                    const idx = game.enemies.indexOf(enemy);
                    if (idx > -1) {
                        game.enemies.splice(idx, 1);
                        gameState.score += 10;
                    }
                }
            }
        });

        // Spawn explosion VFX entry consumed by drawExplosions().
        if (!game.explosions) game.explosions = [];
        game.explosions.push({
            x: cx,
            y: cy,
            startTime: Date.now(),
            duration: 600,
            isBossMissile: false,
            isSuperMissile: false,
            explosionRadius: radius
        });

        if (typeof bossFX !== 'undefined') {
            if (bossFX.addShake) bossFX.addShake(5, 220);
            if (bossFX.addShockwave) bossFX.addShockwave(cx, cy, radius, 'orange');
        }

        updateUI();
    }

    draw(ctx) {
        if (this.exploded) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const now = Date.now();

        // Smoke trail (additive faded).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this._trail.length; i++) {
            const p = this._trail[i];
            const age = (now - p.t) / 320;
            if (age >= 1) continue;
            const a = (1 - age) * 0.55;
            const r = 6 + age * 14;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            grad.addColorStop(0, `rgba(255,200,120,${a})`);
            grad.addColorStop(0.5, `rgba(255,110,40,${a * 0.6})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Rocket body: chunky finned silhouette.
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        // ---- Dynamic exhaust flame: multi-layer animated jet ----
        // Combines a long outer plume, a hot inner core, sputtering side embers,
        // and a forward shock heat haze. Phase noise keeps it twitching.
        ctx.globalCompositeOperation = 'lighter';
        const phase = now * 0.025;
        // Dual sine for non-uniform pulsing (avoids robotic single-frequency).
        const flick = 0.78
            + 0.14 * Math.sin(phase)
            + 0.08 * Math.sin(phase * 2.7 + 1.3);
        const baseLen = 30;

        // Layer A: long outer plume (broad, faded orange).
        const outerLen = baseLen * flick * 1.6;
        const outerW = 6.5 + Math.sin(phase * 1.9) * 1.2;
        const outerGrad = ctx.createLinearGradient(-9, 0, -9 - outerLen, 0);
        outerGrad.addColorStop(0, 'rgba(255,200,120,0.55)');
        outerGrad.addColorStop(0.4, 'rgba(255,120,50,0.45)');
        outerGrad.addColorStop(1, 'rgba(80,10,0,0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.moveTo(-9, -outerW);
        // Wavy edge for a turbulent silhouette (top edge).
        const segs = 6;
        for (let i = 1; i <= segs; i++) {
            const tx = -9 - (outerLen * i / segs);
            const ripple = Math.sin(phase * 3 + i * 1.7) * 1.4;
            const w = outerW * (1 - i / segs) + ripple;
            ctx.lineTo(tx, -w);
        }
        ctx.lineTo(-9 - outerLen, 0);
        for (let i = segs; i >= 1; i--) {
            const tx = -9 - (outerLen * i / segs);
            const ripple = Math.sin(phase * 3 + i * 1.7 + 0.9) * 1.4;
            const w = outerW * (1 - i / segs) + ripple;
            ctx.lineTo(tx, w);
        }
        ctx.lineTo(-9, outerW);
        ctx.closePath();
        ctx.fill();

        // Layer B: hot inner core (white-hot, sharper).
        const coreLen = outerLen * 0.55;
        const coreW = 3 + Math.sin(phase * 2.3 + 0.4) * 0.8;
        const coreGrad = ctx.createLinearGradient(-9, 0, -9 - coreLen, 0);
        coreGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
        coreGrad.addColorStop(0.45, 'rgba(255,220,150,0.85)');
        coreGrad.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.moveTo(-9, -coreW);
        ctx.quadraticCurveTo(-9 - coreLen * 0.4, -coreW * 0.6, -9 - coreLen, 0);
        ctx.quadraticCurveTo(-9 - coreLen * 0.4, coreW * 0.6, -9, coreW);
        ctx.closePath();
        ctx.fill();

        // Layer C: side spit-flames (small darting tongues that flicker each frame).
        const sideCount = 3;
        for (let i = 0; i < sideCount; i++) {
            const sPhase = phase * 1.6 + i * 2.1;
            const len = 6 + (Math.sin(sPhase) * 0.5 + 0.5) * 8;
            const offY = (i - 1) * 2.8 + Math.sin(sPhase * 1.3) * 1.3;
            const a = 0.45 + 0.35 * Math.sin(sPhase * 0.9);
            ctx.fillStyle = `rgba(255,160,70,${Math.max(0, a)})`;
            ctx.beginPath();
            ctx.moveTo(-9, offY - 1.2);
            ctx.lineTo(-9 - len, offY);
            ctx.lineTo(-9, offY + 1.2);
            ctx.closePath();
            ctx.fill();
        }

        // Layer D: trailing ember sparks behind the flame.
        const emberSeed = Math.floor(now / 50);
        for (let i = 0; i < 4; i++) {
            const seed = (emberSeed * 7 + i * 13) % 200;
            const t01 = ((now + i * 80) % 240) / 240;
            const ex = -9 - outerLen * 0.4 - t01 * outerLen * 0.9;
            const ey = ((seed % 7) - 3) * 0.9 + Math.sin(phase * 2 + i) * 1.6;
            const a = (1 - t01) * 0.85;
            ctx.fillStyle = `rgba(255,${180 + (seed % 50)},${60 + (seed % 30)},${a})`;
            ctx.beginPath();
            ctx.arc(ex, ey, 1.1 + (1 - t01) * 0.9, 0, Math.PI * 2);
            ctx.fill();
        }

        // Layer E: forward heat-haze halo around the nose (subtle).
        const haloA = 0.18 + 0.08 * Math.sin(phase * 1.4);
        const haloGrad = ctx.createRadialGradient(11, 0, 0, 11, 0, 14);
        haloGrad.addColorStop(0, `rgba(255,200,140,${haloA})`);
        haloGrad.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(11, 0, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';

        // Body
        ctx.fillStyle = '#3a3a40';
        ctx.fillRect(-9, -4, 18, 8);
        // Nose cone
        ctx.fillStyle = '#ff7030';
        ctx.beginPath();
        ctx.moveTo(9, -4);
        ctx.lineTo(15, 0);
        ctx.lineTo(9, 4);
        ctx.closePath();
        ctx.fill();
        // Stripe
        ctx.fillStyle = '#ffd060';
        ctx.fillRect(-2, -4, 3, 8);
        // Fins
        ctx.fillStyle = '#5a5a60';
        ctx.beginPath();
        ctx.moveTo(-9, -4); ctx.lineTo(-13, -7); ctx.lineTo(-7, -4); ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-9, 4); ctx.lineTo(-13, 7); ctx.lineTo(-7, 4); ctx.closePath();
        ctx.fill();

        ctx.restore();
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
WEAPON_TYPES.counter_mech = CounterMech;
WEAPON_TYPES.decoy_clone = DecoyClone;
WEAPON_TYPES.moonlight_greatsword = MoonlightGreatsword;
WEAPON_TYPES.shotgun = Shotgun;
WEAPON_TYPES.rocket_launcher = RocketLauncher;
WEAPON_TYPES.minigun = Minigun;
WEAPON_TYPES.overdrive_burst = OverdriveBurst;
WEAPON_TYPES.repair_protocol = RepairProtocol;