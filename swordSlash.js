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
        if (game.boss && !this.hitEnemies.has(game.boss)) {
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
        
        const playerCenterX = this.playerX + 15;
        const playerCenterY = this.playerY + 15;
        
        // 绘制刀光轨迹（半透明白光）
        const angleRad = this.currentAngle * Math.PI / 180;
        const endX = playerCenterX + Math.cos(angleRad) * this.range;
        const endY = playerCenterY + Math.sin(angleRad) * this.range;
        
        // 刀光主体
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 - progress * 0.5})`;
        ctx.lineWidth = this.slashWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(playerCenterX, playerCenterY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // 刀光外光晕
        ctx.strokeStyle = `rgba(255, 255, 0, ${0.6 - progress * 0.4})`;
        ctx.lineWidth = this.slashWidth + 4;
        ctx.beginPath();
        ctx.moveTo(playerCenterX, playerCenterY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // 绘制已扫过的轨迹（淡化效果）
        const trailIntensity = 0.3 - progress * 0.2;
        if (trailIntensity > 0) {
            const startAngle = this.playerDirection - 90;
            const currentAngleRange = this.currentAngle - startAngle;
            const steps = Math.floor(currentAngleRange / 5); // 每5度一段
            
            for (let i = 0; i < steps; i++) {
                const trailAngle = startAngle + (i * 5);
                const trailAngleRad = trailAngle * Math.PI / 180;
                const trailEndX = playerCenterX + Math.cos(trailAngleRad) * this.range;
                const trailEndY = playerCenterY + Math.sin(trailAngleRad) * this.range;
                
                const alpha = trailIntensity * (1 - i / steps);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(playerCenterX, playerCenterY);
                ctx.lineTo(trailEndX, trailEndY);
                ctx.stroke();
            }
        }
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

        if (game.boss && !this.hitEnemies.has(game.boss)) {
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
        const angleRad = this.currentAngle * Math.PI / 180;
        const endX = cx + Math.cos(angleRad) * this.range;
        const endY = cy + Math.sin(angleRad) * this.range;

        ctx.save();

        // 已扫过区域的月光面
        const startAngleRad = (this.playerDirection - 90) * Math.PI / 180;
        const currentAngleRad = this.currentAngle * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, this.range, startAngleRad, currentAngleRad);
        ctx.closePath();
        const sweepAlpha = 0.08 * (1 - progress * 0.5);
        ctx.fillStyle = `rgba(180, 220, 255, ${sweepAlpha})`;
        ctx.fill();

        // 光刃主体
        const gradient = ctx.createLinearGradient(cx, cy, endX, endY);
        gradient.addColorStop(0, `rgba(200, 230, 255, ${0.95 - progress * 0.3})`);
        gradient.addColorStop(0.6, `rgba(140, 200, 255, ${0.8 - progress * 0.3})`);
        gradient.addColorStop(1, `rgba(80, 160, 255, ${0.5 - progress * 0.2})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = this.slashWidth;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#88CCFF';
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 外层光晕
        ctx.strokeStyle = `rgba(140, 200, 255, ${0.4 - progress * 0.2})`;
        ctx.lineWidth = this.slashWidth + 12;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 刃尖光球
        const tipPulse = 0.7 + 0.3 * Math.sin(elapsed * 0.02);
        ctx.beginPath();
        ctx.arc(endX, endY, 8 + 4 * tipPulse, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 240, 255, ${0.7 * tipPulse})`;
        ctx.fill();

        // 粒子
        ctx.shadowBlur = 0;
        for (const p of this.particles) {
            ctx.globalAlpha = p.life * 0.6;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }

        ctx.restore();
    }
}