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
            const distance = this.distanceToLineSegment(
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
            const distance = this.distanceToLineSegment(
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
                    // 判断当前Boss类型
                    const isBossType = (game.boss instanceof Boss || game.boss instanceof SublimeMoon || game.boss instanceof UglyEmperor);
                    if (isBossType) {
                    game.boss = null;
                    gameState.score += 100; // Boss击杀奖励
                    gameState.bossKillCount++; // 增加Boss击杀计数
                    
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
                    }
                }
                updateUI();
            }
        }
    }
    
    // 计算点到线段的距离
    distanceToLineSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
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