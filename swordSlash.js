function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

// 刀光类
class SwordSlash {
    constructor(playerX, playerY, playerDirection, range, damage) {
        this.playerX = playerX;
        this.playerY = playerY;
        this.playerDirection = playerDirection; // 玩家朝向角度
        this.range = range;
        this.damage = damage;
        this.startTime = Date.now();
        this.duration = 250; // 0.25秒，更快的扫击
        this.totalAngle = 180; // 总扫击角度（从左90度到右90度）
        this.hitEnemies = new Set(); // 记录已经被击中的敌人，避免重复伤害
        this.slashWidth = 8; // 刀光宽度
    }
    
    update() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration; // 0 到 1
        
        if (progress >= 1) {
            this.isFinished = true;
            return;
        }
        
        // 计算当前刀光的角度（从左90度扫到右90度）
        const startAngle = this.playerDirection - 90; // 左侧90度
        const endAngle = this.playerDirection + 90;   // 右侧90度
        this.currentAngle = startAngle + (endAngle - startAngle) * progress;
        
        // 检测碰撞
        this.checkCollisions();
    }
    
    checkCollisions() {
        const playerCenterX = this.playerX + 15; // 玩家中心
        const playerCenterY = this.playerY + 15;
        
        // 计算刀光线段的端点
        const angleRad = this.currentAngle * Math.PI / 180;
        const endX = playerCenterX + Math.cos(angleRad) * this.range;
        const endY = playerCenterY + Math.sin(angleRad) * this.range;
        
        // 检查每个敌人是否与刀光线段相交
        game.enemies.forEach((enemy, index) => {
            if (this.hitEnemies.has(enemy)) return; // 已经被击中过
            
            const enemyCenterX = enemy.x + enemy.width / 2;
            const enemyCenterY = enemy.y + enemy.height / 2;
            
            // 检查点到线段的距离
            const distance = distanceToLineSegment(
                enemyCenterX, enemyCenterY,
                playerCenterX, playerCenterY,
                endX, endY
            );
            
            if (distance <= this.slashWidth + enemy.width / 2) {
                this.hitEnemies.add(enemy);
                const isDead = enemy.takeDamage(this.damage);
                gameState.score += this.damage;
                gameState.totalDamage += this.damage;
                if (isDead) {
                    game.enemies.splice(index, 1);
                    gameState.score += 10; // 击杀奖励
                }
                updateUI();
            }
        });
        
        // 检查Boss是否与刀光线段相交
        if (game.boss && !game.boss.notTargetable && !this.hitEnemies.has(game.boss)) {
            const bossCenterX = game.boss.x + game.boss.width / 2;
            const bossCenterY = game.boss.y + game.boss.height / 2;
            
            // 检查点到线段的距离
            const distance = distanceToLineSegment(
                bossCenterX, bossCenterY,
                playerCenterX, playerCenterY,
                endX, endY
            );
            
            if (distance <= this.slashWidth + game.boss.width / 2) {
                this.hitEnemies.add(game.boss);
                // 为丑皇添加伤害来源标识
                let damageSource = 'sword';
                if (game.boss instanceof UglyEmperor) {
                    damageSource = 'sword'; // 剑击伤害
                }
                
                const isDead = game.boss.takeDamage(this.damage, damageSource);
                gameState.score += this.damage;
                gameState.totalDamage += this.damage;
                if (isDead) {
                    handleBossKill();
                }
                updateUI();
            }
        }
    }
    
    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;
        if (progress >= 1) return;

        const cx = this.playerX + 15;
        const cy = this.playerY + 15;
        const startAngleRad = (this.playerDirection - 90) * Math.PI / 180;
        const currentAngleRad = this.currentAngle * Math.PI / 180;
        const tipX = cx + Math.cos(currentAngleRad) * this.range;
        const tipY = cy + Math.sin(currentAngleRad) * this.range;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 1) Filled sweep fan behind the blade (soft white afterimage)
        const sweepAlpha = (0.18 - progress * 0.12);
        if (sweepAlpha > 0) {
            const fanGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.range);
            fanGrad.addColorStop(0, `rgba(255,255,255,${sweepAlpha * 1.4})`);
            fanGrad.addColorStop(0.6, `rgba(255,240,180,${sweepAlpha * 0.8})`);
            fanGrad.addColorStop(1, 'rgba(255,200,100,0)');
            ctx.fillStyle = fanGrad;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, this.range, startAngleRad, currentAngleRad);
            ctx.closePath();
            ctx.fill();
        }

        // 2) Curved blade arc trail (uses drawSlashArc helper if available)
        const arcRadius = this.range * 0.85;
        if (typeof drawSlashArc === 'function') {
            drawSlashArc(ctx, {
                x: cx, y: cy,
                radius: arcRadius,
                startAngle: startAngleRad,
                endAngle: currentAngleRad,
                thickness: this.slashWidth + 2,
                scheme: 'white',
                alpha: 1,
                progress: progress * 0.7
            });
        }

        // 3) Current blade body (thick glowing line from center to tip, multi-layer)
        const bladeAlpha = 1 - progress * 0.6;
        // Outer halo
        ctx.strokeStyle = `rgba(255,210,80,${0.35 * bladeAlpha})`;
        ctx.lineWidth = this.slashWidth + 10;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
        // Mid
        ctx.strokeStyle = `rgba(255,240,160,${0.7 * bladeAlpha})`;
        ctx.lineWidth = this.slashWidth + 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();
        // Bright core
        ctx.strokeStyle = `rgba(255,255,255,${bladeAlpha})`;
        ctx.lineWidth = Math.max(2, this.slashWidth * 0.45);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY); ctx.stroke();

        // 4) Bright tip energy ball
        const tipPulse = 0.8 + 0.2 * Math.sin(elapsed * 0.05);
        const tipR = (this.slashWidth * 1.3) * tipPulse;
        const tipGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipR * 2);
        tipGrad.addColorStop(0, `rgba(255,255,255,${bladeAlpha})`);
        tipGrad.addColorStop(0.5, `rgba(255,220,120,${bladeAlpha * 0.7})`);
        tipGrad.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = tipGrad;
        ctx.beginPath(); ctx.arc(tipX, tipY, tipR * 2, 0, Math.PI * 2); ctx.fill();

        // 5) Spark particles flying off the blade tip (via bossFX if available)
        if (typeof bossFX !== 'undefined' && Math.random() < 0.55 && progress < 0.95) {
            const sp = 2 + Math.random() * 3;
            const ang = currentAngleRad + (Math.random() - 0.5) * 1.4;
            bossFX.particles.push({
                x: tipX, y: tipY,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                size: 1.2 + Math.random() * 1.6,
                color: Math.random() < 0.5 ? '#ffffff' : '#ffd060',
                lifeMs: 220 + Math.random() * 200,
                gravity: 0,
                drag: 0.9,
                alpha: 0.9,
                startedAt: Date.now()
            });
        }

        ctx.restore();
    }
}

class MoonlightSlash {
    constructor(playerX, playerY, playerDirection, range, damage) {
        this.playerX = playerX;
        this.playerY = playerY;
        this.playerDirection = playerDirection;
        this.range = range;
        this.damage = damage;
        this.startTime = Date.now();
        this.duration = 1000;
        this.totalAngle = 180;
        this.hitEnemies = new Set();
        this.slashWidth = 20;
        this.currentAngle = playerDirection - 90;
        this.isFinished = false;
        this.particles = [];
    }

    update() {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;

        if (progress >= 1) {
            this.isFinished = true;
            return;
        }

        const startAngle = this.playerDirection - 90;
        const endAngle = this.playerDirection + 90;
        this.currentAngle = startAngle + (endAngle - startAngle) * progress;

        this.checkCollisions();

        if (Math.random() < 0.7) {
            const angleRad = this.currentAngle * Math.PI / 180;
            const dist = this.range * (0.3 + Math.random() * 0.7);
            const cx = this.playerX + 15;
            const cy = this.playerY + 15;
            this.particles.push({
                x: cx + Math.cos(angleRad) * dist + (Math.random() - 0.5) * 30,
                y: cy + Math.sin(angleRad) * dist + (Math.random() - 0.5) * 30,
                life: 1.0, size: 2 + Math.random() * 4,
                color: Math.random() < 0.5 ? '#AADDFF' : '#FFFFFF'
            });
        }
        this.particles = this.particles.filter(p => {
            p.life -= 0.04;
            p.y -= 0.5;
            return p.life > 0;
        });
    }

    checkCollisions() {
        const playerCenterX = this.playerX + 15;
        const playerCenterY = this.playerY + 15;
        const angleRad = this.currentAngle * Math.PI / 180;
        const endX = playerCenterX + Math.cos(angleRad) * this.range;
        const endY = playerCenterY + Math.sin(angleRad) * this.range;

        game.enemies.forEach((enemy, index) => {
            if (this.hitEnemies.has(enemy)) return;
            const ecx = enemy.x + enemy.width / 2;
            const ecy = enemy.y + enemy.height / 2;
            const distance = distanceToLineSegment(ecx, ecy, playerCenterX, playerCenterY, endX, endY);
            if (distance <= this.slashWidth + enemy.width / 2) {
                this.hitEnemies.add(enemy);
                const isDead = enemy.takeDamage(this.damage);
                gameState.score += this.damage;
                gameState.totalDamage += this.damage;
                if (isDead) {
                    game.enemies.splice(index, 1);
                    gameState.score += 10;
                }
                updateUI();
            }
        });

        if (game.boss && !game.boss.notTargetable && !this.hitEnemies.has(game.boss)) {
            const bcx = game.boss.x + game.boss.width / 2;
            const bcy = game.boss.y + game.boss.height / 2;
            const distance = distanceToLineSegment(bcx, bcy, playerCenterX, playerCenterY, endX, endY);
            if (distance <= this.slashWidth + game.boss.width / 2) {
                this.hitEnemies.add(game.boss);

                let actualDamage = this.damage;
                let damageSource = 'moonlight';
                if (game.boss instanceof UglyEmperor) {
                    damageSource = 'sword';
                }

                if (game.boss.health - actualDamage <= 0) {
                    actualDamage = game.boss.health - 1;
                    if (actualDamage < 0) actualDamage = 0;
                }

                if (actualDamage > 0) {
                    game.boss.takeDamage(actualDamage, damageSource);
                    gameState.score += actualDamage;
                    gameState.totalDamage += actualDamage;
                }
                updateUI();
            }
        }
    }

    draw(ctx) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;
        if (progress >= 1) return;

        const cx = this.playerX + 15;
        const cy = this.playerY + 15;
        const startAngleRad = (this.playerDirection - 90) * Math.PI / 180;
        const currentAngleRad = this.currentAngle * Math.PI / 180;
        const endX = cx + Math.cos(currentAngleRad) * this.range;
        const endY = cy + Math.sin(currentAngleRad) * this.range;
        const bladeAlpha = 1 - progress * 0.4;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // 1) Wide moonlight sweep fan (cool blue afterimage)
        const sweepAlpha = 0.22 * (1 - progress * 0.3);
        const fanGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.range);
        fanGrad.addColorStop(0, `rgba(200,230,255,${sweepAlpha * 1.4})`);
        fanGrad.addColorStop(0.55, `rgba(120,180,255,${sweepAlpha})`);
        fanGrad.addColorStop(1, 'rgba(40,100,200,0)');
        ctx.fillStyle = fanGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, this.range, startAngleRad, currentAngleRad);
        ctx.closePath();
        ctx.fill();

        // 2) Curved blade arc trail at outer edge
        if (typeof drawSlashArc === 'function') {
            drawSlashArc(ctx, {
                x: cx, y: cy,
                radius: this.range * 0.9,
                startAngle: startAngleRad,
                endAngle: currentAngleRad,
                thickness: this.slashWidth + 4,
                scheme: 'azure',
                alpha: 1,
                progress: progress * 0.6
            });
        }

        // 3) Multi-layer glowing blade body
        // Outer halo
        ctx.strokeStyle = `rgba(80,160,255,${0.45 * bladeAlpha})`;
        ctx.lineWidth = this.slashWidth + 18;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke();
        // Mid
        ctx.strokeStyle = `rgba(160,210,255,${0.85 * bladeAlpha})`;
        ctx.lineWidth = this.slashWidth + 6;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke();
        // Inner
        ctx.strokeStyle = `rgba(220,240,255,${bladeAlpha})`;
        ctx.lineWidth = this.slashWidth;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke();
        // Bright core
        ctx.strokeStyle = `rgba(255,255,255,${bladeAlpha})`;
        ctx.lineWidth = this.slashWidth * 0.4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(endX, endY); ctx.stroke();

        // 4) Tip energy orb
        const tipPulse = 0.7 + 0.3 * Math.sin(elapsed * 0.02);
        const tipR = (this.slashWidth * 1.5) * tipPulse;
        const tipGrad = ctx.createRadialGradient(endX, endY, 0, endX, endY, tipR * 2);
        tipGrad.addColorStop(0, `rgba(255,255,255,${bladeAlpha})`);
        tipGrad.addColorStop(0.5, `rgba(180,220,255,${bladeAlpha * 0.7})`);
        tipGrad.addColorStop(1, 'rgba(40,120,220,0)');
        ctx.fillStyle = tipGrad;
        ctx.beginPath(); ctx.arc(endX, endY, tipR * 2, 0, Math.PI * 2); ctx.fill();

        // 5) Float particles
        for (const p of this.particles) {
            ctx.globalAlpha = p.life * 0.85;
            const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            pGrad.addColorStop(0, p.color);
            pGrad.addColorStop(1, 'rgba(80,160,240,0)');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}