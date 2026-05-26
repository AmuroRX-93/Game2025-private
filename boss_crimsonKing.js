// 血红之王 Boss (Crimson King)
// Boss类
class Boss extends GameObject {
    constructor(x, y) {
        super(x, y, 50, 50, '#8B0000');
        this.maxHealth = 300;
        this.health = this.maxHealth;
        this.speed = 40;
        this.dodgeSpeed = 55;
        
        // Boss闪避系统
        this.dodgeChance = 0.20;
        this.missileDodgeChance = 0.80;
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 200;
        this.originalVx = 0;
        this.originalVy = 0;
        this.lastPlayerAttackCheck = 0;
        this.lastDodgeTime = 0;
        this.dodgeCooldown = 600;
        
        // 累积减伤系统：1秒内受到越多伤害减伤越高，每秒重置
        this.damageWindow = {
            accumulated: 0,
            windowStart: Date.now()
        };
        
        // 扎穿系统
        this.isImpaled = false;
        this.impaledBy = null;
        this.stunned = false;
        this.stunEndTime = 0;
        
        // Boss missile damage / shared params (used by salvo move below)
        this.missileDamage = 6;
        this.missileSpeed = 24;
        this.spawnTime = Date.now();
        
        // Hit indicators
        this.hitIndicators = [];
        this.hitIndicatorDuration = 600;
        
        // AAA-style AI: maintain distance + strafe around player
        this.aiState = 'strafe'; // strafe | retreat | approach | rush
        this.aiStateTimer = 0;
        this.idealDistance = 420;
        this.minDistance = 300;
        this.maxDistance = 550;
        this.strafeDirection = Math.random() < 0.5 ? 1 : -1;
        this.strafeAngle = 0;
        this.lastAiUpdate = Date.now();
        this.rushCooldown = 0;
        this.rushDuration = 0;
        this.rushTarget = null;
        
        // ----- Combat AI (utility move selector) -----
        // Phase: 'idle' = free to pick a move; 'commit' = locked into a move; 'recover' = post-move stun
        this.combatPhase = 'idle';
        this.activeMove = null;       // currently executing move state
        this.combatRecoverUntil = 0;
        this.aiMemory = createBossAIMemory();
        this.telegraphs = [];
        this.firstDecisionAt = this.spawnTime + 600; // brief grace period after spawn
        this.movesTable = this._buildMovesTable();
        
        this.setRandomDirection();
    }

    setRandomDirection() {
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
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
    
    // === Combat AI: utility-driven move selector ============================
        
    updateCombatAI() {
        if (!game.player) return;
        const now = Date.now();
        
        // Tick active move (commit phase)
        if (this.combatPhase === 'commit' && this.activeMove) {
            const m = this.activeMove;
            if (m.tick) m.tick(this, now);
            if (m.isDone(this, now)) {
                if (m.onEnd) m.onEnd(this);
                this.activeMove = null;
                this.combatPhase = 'recover';
                this.combatRecoverUntil = now + (m.recoveryMs || 250);
            }
            return;
        }
        
        // Recovery (post-move slowdown / vulnerability window)
        if (this.combatPhase === 'recover') {
            if (now >= this.combatRecoverUntil) {
                this.combatPhase = 'idle';
            } else {
                return; // Stay in recovery; movement FSM repositions slowly
            }
        }
        
        // Idle: pick next move (after a small initial grace + spacing between picks)
        if (now < this.firstDecisionAt) return;
        if (now - this.aiMemory.lastMoveTime < 350) return;
        
        const ctx = buildBossAIContext(this);
        const chosen = selectBossMove(this.movesTable, this.aiMemory, ctx);
        if (!chosen) return;
        
        commitBossMove(chosen, this.aiMemory, now);
        const state = chosen.start(this, ctx);
        if (!state) {
            // Move chose to abort silently
            this.combatPhase = 'idle';
            return;
        }
        this.activeMove = state;
        this.combatPhase = 'commit';
    }
    
    _buildMovesTable() {
        const boss = this;
        return [
            // ---- Move 1: Salvo Volley (replacement for old missile spam) ----
            // 24 missiles fanned at player over ~0.9s, telegraphed.
            {
                id: 'salvoVolley',
                cooldown: 5500,
                canUse: (ctx) => ctx.dist > 150,
                score: (ctx) => {
                    let s = 1.4;
                    if (ctx.dist > 250 && ctx.dist < 600) s += 0.6;
                    if (ctx.hpPct > 0.6) s += 0.2;
                    return s;
                },
                start: (b, ctx) => {
                    const telegraphMs = 450;
                    const fireMs = 900;
                    const startedAt = Date.now();
                    b.telegraphs.push(createTelegraphAura(
                        b.x + b.width / 2, b.y + b.height / 2, b.width * 1.7,
                        telegraphMs, '#ff4040'
                    ));
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 350,
                        target: 24,
                        fired: 0,
                        nextFireAt: startedAt + telegraphMs,
                        intervalMs: fireMs / 24,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) return;
                            while (st.fired < st.target && now >= st.nextFireAt) {
                                boss._fireSalvoMissile(st.fired);
                                st.fired++;
                                st.nextFireAt += st.intervalMs;
                            }
                        },
                        isDone: (b2, now) => {
                            const st = b2.activeMove;
                            return st.fired >= st.target || now - st.startedAt >= st.totalMs;
                        }
                    };
                }
            },
            // ---- Move 2: Grid Barrage ----
            // Telegraphs a wide grid of horizontal/vertical beams, then fires
            // fast bullets along each lane. Massive area-denial that forces
            // the player into the few open cells between the lanes.
            {
                id: 'gridBarrage',
                cooldown: 7000,
                canUse: (ctx) => true,
                score: (ctx) => {
                    let s = 1.1;
                    if (ctx.dist < 250) s += 0.5; // good area-denial when player is close
                    if (ctx.hpPct < 0.5) s += 0.4;
                    return s;
                },
                start: (b, ctx) => {
                    const telegraphMs = 850;
                    const fireMs = 700;
                    const startedAt = Date.now();
                    const W = GAME_CONFIG.WIDTH;
                    const H = GAME_CONFIG.HEIGHT;
                    // Build an evenly-spaced grid: 4 vertical + 3 horizontal
                    // lanes (numbers tuned so the gaps are still dodgeable).
                    const vLaneCount = 4;
                    const hLaneCount = 3;
                    const vLanesX = [];
                    const hLanesY = [];
                    // Margin keeps lanes off the very edges where the player
                    // can't reach.
                    const marginX = W * 0.12;
                    const marginY = H * 0.15;
                    for (let i = 0; i < vLaneCount; i++) {
                        const t = (i + 1) / (vLaneCount + 1);
                        vLanesX.push(marginX + (W - marginX * 2) * t);
                    }
                    for (let i = 0; i < hLaneCount; i++) {
                        const t = (i + 1) / (hLaneCount + 1);
                        hLanesY.push(marginY + (H - marginY * 2) * t);
                    }
                    for (const lx of vLanesX) {
                        b.telegraphs.push(createTelegraphBeam(lx, 0, lx, H, 14, telegraphMs, '#ff5555'));
                    }
                    for (const ly of hLanesY) {
                        b.telegraphs.push(createTelegraphBeam(0, ly, W, ly, 14, telegraphMs, '#ff5555'));
                    }
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 500,
                        fired: false,
                        vLanesX,
                        hLanesY,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (!st.fired && now >= st.startedAt + st.telegraphMs) {
                                boss._fireGridBarrage(st.vLanesX, st.hLanesY);
                                st.fired = true;
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            },
            // ---- Move 2.5: Plasma Mine Seed ----
            // Boss flies to a random arena-edge position and drops a
            // dormant plasma orb. With several orbs seeded around the
            // map, the next move (plasmaActivate) wakes them all up.
            {
                id: 'plasmaSeed',
                cooldown: 2200,
                canUse: () => {
                    const dormantCount = (game.plasmaMissiles || [])
                        .filter(m => m.dormant && m.bossOwned).length;
                    return dormantCount < 8; // cap at 8 mines on the field
                },
                score: () => {
                    const dormantCount = (game.plasmaMissiles || [])
                        .filter(m => m.dormant && m.bossOwned).length;
                    // Strongly prioritize seeding until the field is
                    // populated; back off only when we already have a
                    // lot of mines waiting to be activated.
                    if (dormantCount < 3) return 3.2;
                    if (dormantCount < 6) return 2.4;
                    return 1.6;
                },
                start: (b, ctx) => {
                    const W = GAME_CONFIG.WIDTH;
                    const H = GAME_CONFIG.HEIGHT;
                    const margin = 60;
                    // Pick a random edge + random position along it.
                    const edge = Math.floor(Math.random() * 4); // 0..3
                    let dropX, dropY;
                    if (edge === 0) {        // top
                        dropX = margin + Math.random() * (W - margin * 2);
                        dropY = margin;
                    } else if (edge === 1) { // right
                        dropX = W - margin;
                        dropY = margin + Math.random() * (H - margin * 2);
                    } else if (edge === 2) { // bottom
                        dropX = margin + Math.random() * (W - margin * 2);
                        dropY = H - margin;
                    } else {                 // left
                        dropX = margin;
                        dropY = margin + Math.random() * (H - margin * 2);
                    }
                    const moveSpeed = b.speed * 1.05; // a bit faster than normal traverse
                    const startedAt = Date.now();
                    const maxTravelMs = 2200; // hard timeout if we get stuck
                    return {
                        startedAt,
                        totalMs: maxTravelMs + 500,
                        recoveryMs: 200,
                        dropX, dropY,
                        moveSpeed,
                        seeded: false,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (st.seeded) return;
                            const bcx = b2.x + b2.width / 2;
                            const bcy = b2.y + b2.height / 2;
                            const dx = st.dropX - bcx;
                            const dy = st.dropY - bcy;
                            const d = Math.hypot(dx, dy);
                            // Arrived (or timed out) — seed the dormant mine.
                            if (d < Math.max(20, st.moveSpeed * 0.6) || now - st.startedAt > maxTravelMs) {
                                b2.vx = 0; b2.vy = 0;
                                if (typeof PlasmaMissile !== 'function') {
                                    st.seeded = true;
                                    return;
                                }
                                const orb = new PlasmaMissile(bcx, bcy, bcx, bcy, 7, {
                                    hostile: true,
                                    fuseRadius: 80,
                                    fieldRadius: 110,
                                    fieldDuration: 2200,
                                    fieldDamageInterval: 250,
                                    fieldDamage: 4,
                                    contactDamage: b2.missileDamage + 4,
                                    armingDelay: 250,
                                    strongTrackingDuration: 1500,
                                    maxLifetime: 2000,
                                    detonateOnExpire: true,
                                    dormant: true
                                });
                                orb.bossOwned = true;
                                orb.vx = 0;
                                orb.vy = 0;
                                if (!game.plasmaMissiles) game.plasmaMissiles = [];
                                game.plasmaMissiles.push(orb);
                                bossFX.addFlash(bcx, bcy, 50, '#ff4070', 280, 0.8);
                                bossFX.addShockwave(bcx, bcy, 18, 80, '#ff4070', 360, 3, 0.55);
                                bossFX.spawnBurst(bcx, bcy, 14, {
                                    color: '#ff4070',
                                    speedMin: 1, speedMax: 3,
                                    sizeMin: 1.5, sizeMax: 3,
                                    lifeMs: 480,
                                    spreadAngle: Math.PI * 2,
                                    baseAngle: 0,
                                    drag: 0.92
                                });
                                st.seeded = true;
                                return;
                            }
                            // Travel toward drop point.
                            const inv = 1 / d;
                            b2.vx = dx * inv * st.moveSpeed;
                            b2.vy = dy * inv * st.moveSpeed;
                        },
                        isDone: (b2, now) => {
                            const st = b2.activeMove;
                            return st.seeded || now - st.startedAt >= st.totalMs;
                        },
                        onEnd: (b2) => { b2.vx = 0; b2.vy = 0; }
                    };
                }
            },
            // ---- Move 2.6: Plasma Mine Activation ----
            // Wakes all dormant boss-owned plasma orbs and sends them
            // homing toward the player. Only meaningful when 3..8 mines
            // are seeded; rolled probabilistically.
            {
                id: 'plasmaActivate',
                cooldown: 4000,
                canUse: () => {
                    const dormantCount = (game.plasmaMissiles || [])
                        .filter(m => m.dormant && m.bossOwned).length;
                    return dormantCount >= 3;
                },
                score: () => {
                    const dormantCount = (game.plasmaMissiles || [])
                        .filter(m => m.dormant && m.bossOwned).length;
                    if (dormantCount < 3) return 0;
                    // Probabilistic activation: 3..8 mines may activate,
                    // 9+ almost certainly do. The score-based picker
                    // doesn't roll dice on its own, so we bake the
                    // probability into the score itself.
                    let p;
                    if (dormantCount >= 9) p = 0.95;
                    else p = 0.20 + (dormantCount - 3) * 0.10; // 0.20..0.70
                    if (Math.random() > p) return 0;
                    return 1.5 + dormantCount * 0.1;
                },
                start: (b, ctx) => {
                    const telegraphMs = 450;
                    const startedAt = Date.now();
                    const dormantOrbs = (game.plasmaMissiles || [])
                        .filter(m => m.dormant && m.bossOwned);
                    // Brief pre-activation aura on each dormant orb so
                    // the player has a chance to scatter.
                    for (const orb of dormantOrbs) {
                        b.telegraphs.push(createTelegraphAura(orb.x, orb.y, 36, telegraphMs, '#ff4070'));
                    }
                    return {
                        startedAt,
                        telegraphMs,
                        totalMs: telegraphMs + 200,
                        recoveryMs: 250,
                        dormantOrbs,
                        activated: false,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (st.activated) return;
                            if (now < st.startedAt + st.telegraphMs) return;
                            const tc = (typeof getBossTargetCenter === 'function')
                                ? getBossTargetCenter(b2.x + b2.width / 2, b2.y + b2.height / 2) : null;
                            const tx = tc ? tc.x : (game.player ? game.player.x + game.player.width / 2 : b2.x);
                            const ty = tc ? tc.y : (game.player ? game.player.y + game.player.height / 2 : b2.y);
                            // Re-fetch the dormant set in case some were
                            // destroyed during telegraph.
                            const live = (game.plasmaMissiles || [])
                                .filter(m => m.dormant && m.bossOwned);
                            for (const orb of live) {
                                if (typeof orb.activate === 'function') {
                                    orb.activate(tx, ty, {
                                        speed: 8.4,
                                        maxSpeed: 13.2,
                                        armingDelay: 150,
                                        strongTrackingDuration: 1500,
                                        maxLifetime: 2200,
                                        detonateOnExpire: true
                                    });
                                }
                                bossFX.addFlash(orb.x, orb.y, 32, '#ff4070', 240, 0.85);
                            }
                            const bcx = b2.x + b2.width / 2;
                            const bcy = b2.y + b2.height / 2;
                            bossFX.addFlash(bcx, bcy, 80, '#ff3060', 320, 0.85);
                            bossFX.addShake(4, 220);
                            st.activated = true;
                        },
                        isDone: (b2, now) => {
                            const st = b2.activeMove;
                            return st.activated || now - st.startedAt >= st.totalMs;
                        }
                    };
                }
            },
            // Crimson laser beam — fast, low-damage, no stun. Replaces the
            // old red-arrow dash with a Star-Devourer-style precision
            // laser, but blood-red and snappier (short telegraph, no
            // recovery freeze).
            {
                id: 'crimsonLaser',
                cooldown: 2400,
                canUse: (ctx) => ctx.dist > 60 && ctx.dist < 900,
                score: (ctx) => {
                    let s = 1.4;
                    if (ctx.dist > 220 && ctx.dist < 600) s += 0.5;
                    if (ctx.hpPct < 0.7) s += 0.3;
                    return s;
                },
                start: (b, ctx) => {
                    const telegraphMs = 350;
                    const fireMs = 280;
                    const startedAt = Date.now();
                    const cx = b.x + b.width / 2;
                    const cy = b.y + b.height / 2;
                    // Lock onto the player's CURRENT position. The
                    // telegraph circle marks that exact spot, so if the
                    // player moves out of it they dodge cleanly. No
                    // lead — that caused the beam to consistently miss
                    // even when the player stood still in the marker.
                    const lockX = ctx.playerCX;
                    const lockY = ctx.playerCY;
                    const aimAngle = Math.atan2(lockY - cy, lockX - cx);
                    const range = 900;
                    // Telegraph: a red lock-on circle on the player's
                    // locked position so it's easy to spot against the
                    // boss' red body.
                    b.telegraphs.push(createTelegraphCircle(lockX, lockY, 42, telegraphMs, '#ff4040'));
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 0,
                        aimAngle,
                        lockX,
                        lockY,
                        range,
                        beamWidth: 6,
                        hitRadius: 24,
                        damage: 8,
                        fired: false,
                        hit: false,
                        laserEffect: null,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            // Crimson King keeps moving — no freeze during
                            // telegraph or fire (this is a "snap shot",
                            // not a committed dash).
                            if (now < st.startedAt + st.telegraphMs) return;
                            if (!st.fired) {
                                st.fired = true;
                                const bcx = b2.x + b2.width / 2;
                                const bcy = b2.y + b2.height / 2;
                                // Recompute aim from boss' CURRENT position
                                // toward the locked spot — boss may have
                                // drifted during the telegraph window, so
                                // the original aimAngle would now miss.
                                const fireAngle = Math.atan2(st.lockY - bcy, st.lockX - bcx);
                                const lDx = Math.cos(fireAngle);
                                const lDy = Math.sin(fireAngle);
                                // Hit check: line-segment vs player (no stun).
                                if (game.player && !game.player.isUntargetable) {
                                    const pcx = game.player.x + game.player.width / 2;
                                    const pcy = game.player.y + game.player.height / 2;
                                    const proj = (pcx - bcx) * lDx + (pcy - bcy) * lDy;
                                    if (proj > 0 && proj <= st.range) {
                                        const px = bcx + lDx * proj;
                                        const py = bcy + lDy * proj;
                                        const d = Math.hypot(pcx - px, pcy - py);
                                        if (d <= st.hitRadius) {
                                            game.player.takeDamage(st.damage);
                                            st.hit = true;
                                            updateUI();
                                        }
                                    }
                                }
                                // Hit check vs decoys.
                                if (game.decoys) {
                                    for (const decoy of game.decoys) {
                                        const dcx = decoy.x + decoy.width / 2;
                                        const dcy = decoy.y + decoy.height / 2;
                                        const dproj = (dcx - bcx) * lDx + (dcy - bcy) * lDy;
                                        if (dproj > 0 && dproj <= st.range) {
                                            const dpx = bcx + lDx * dproj;
                                            const dpy = bcy + lDy * dproj;
                                            const dd = Math.hypot(dcx - dpx, dcy - dpy);
                                            if (dd <= st.hitRadius) {
                                                decoy.takeDamage(st.damage);
                                            }
                                        }
                                    }
                                }
                                // Visual + impact FX.
                                bossFX.addFlash(bcx, bcy, 36, '#ff2020', 180, 0.85);
                                bossFX.addShake(2, 90);
                                b2.crimsonLaserFX = {
                                    sx: bcx, sy: bcy,
                                    ex: bcx + lDx * st.range,
                                    ey: bcy + lDy * st.range,
                                    startedAt: now,
                                    durationMs: st.fireMs
                                };
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs,
                    };
                }
            },
            // ---- Move 4: Homing Missile (small batch) ----
            // 6 strong tracking missiles, slower interval, tracks player firmly.
            {
                id: 'homingMissile',
                cooldown: 6500,
                canUse: (ctx) => true,
                score: (ctx) => {
                    let s = 1.0;
                    if (ctx.dist > 350) s += 0.5;
                    if (ctx.hpPct < 0.7) s += 0.3;
                    return s;
                },
                start: (b, ctx) => {
                    const telegraphMs = 350;
                    const fireMs = 720;
                    const startedAt = Date.now();
                    b.telegraphs.push(createTelegraphAura(
                        b.x + b.width / 2, b.y + b.height / 2, b.width * 1.3,
                        telegraphMs, '#ff8030'
                    ));
                    return {
                        startedAt,
                        telegraphMs,
                        fireMs,
                        totalMs: telegraphMs + fireMs,
                        recoveryMs: 300,
                        target: 6,
                        fired: 0,
                        nextFireAt: startedAt + telegraphMs,
                        intervalMs: 720 / 6,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            if (now < st.startedAt + st.telegraphMs) return;
                            while (st.fired < st.target && now >= st.nextFireAt) {
                                boss._fireHomingMissile(st.fired);
                                st.fired++;
                                st.nextFireAt += st.intervalMs;
                            }
                        },
                        isDone: (b2, now) => {
                            const st = b2.activeMove;
                            return st.fired >= st.target || now - st.startedAt >= st.totalMs;
                        }
                    };
                }
            },
            // ---- Move 5: Blood Surge (heal + brief armor) ----
            // Only triggers when wounded; commits boss for ~1s with red aura, restores HP.
            {
                id: 'bloodSurge',
                cooldown: 12000,
                canUse: (ctx) => ctx.hpPct < 0.55 && ctx.dist > 220,
                score: (ctx) => {
                    let s = 0.5;
                    s += (1 - ctx.hpPct) * 2.2; // hungrier when hurt
                    if (ctx.dist > 350) s += 0.4;
                    return s;
                },
                start: (b, ctx) => {
                    if (b.health >= b.maxHealth) return null;
                    const telegraphMs = 350;
                    const surgeMs = 700;
                    const startedAt = Date.now();
                    const healAmount = Math.floor(b.maxHealth * 0.12); // heal 12% maxHP
                    b.telegraphs.push(createTelegraphAura(
                        b.x + b.width / 2, b.y + b.height / 2, b.width * 2.0,
                        telegraphMs + surgeMs, '#aa0030'
                    ));
                    return {
                        startedAt,
                        telegraphMs,
                        surgeMs,
                        totalMs: telegraphMs + surgeMs,
                        recoveryMs: 250,
                        healAmount,
                        healed: false,
                        tick: (b2, now) => {
                            const st = b2.activeMove;
                            freezeBoss(b2);
                            const cx = b2.x + b2.width / 2;
                            const cy = b2.y + b2.height / 2;
                            // Continuous blood mist rising during whole move
                            if (!st.lastMistAt || now - st.lastMistAt > 60) {
                                st.lastMistAt = now;
                                bossFX.spawnBurst(cx, cy, 3, {
                                    color: '#cc0030',
                                    speedMin: 0.4, speedMax: 1.6,
                                    sizeMin: 3, sizeMax: 6,
                                    lifeMs: 900,
                                    spreadAngle: Math.PI * 1.6,
                                    baseAngle: -Math.PI / 2,
                                    gravity: -0.06,
                                    drag: 0.96
                                });
                            }
                            if (!st.healed && now >= st.startedAt + st.telegraphMs) {
                                const before = b2.health;
                                b2.health = Math.min(b2.maxHealth, b2.health + st.healAmount);
                                const gained = b2.health - before;
                                if (gained > 0) b2._showHealIndicator(gained);
                                st.healed = true;
                                // Surge burst at heal moment
                                bossFX.addFlash(cx, cy, 130, '#aa0030', 480, 1.0);
                                bossFX.addShockwave(cx, cy, 20, 160, '#cc0040', 700, 5, 0.8);
                                bossFX.spawnBurst(cx, cy, 28, {
                                    color: '#ee2050',
                                    speedMin: 1, speedMax: 4,
                                    sizeMin: 2.5, sizeMax: 5,
                                    lifeMs: 800,
                                    spreadAngle: Math.PI * 2,
                                    gravity: -0.08,
                                    drag: 0.93
                                });
                                bossFX.addShake(3, 220);
                            }
                        },
                        isDone: (b2, now) => now - b2.activeMove.startedAt >= b2.activeMove.totalMs
                    };
                }
            }
        ];
    }
    
    // ----- Move execution helpers -----
    
    _fireSalvoMissile(index) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        // Aim the salvo cone at the current valid target (player or decoy)
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const playerCX = tc.x;
        const playerCY = tc.y;
        const baseAngle = Math.atan2(playerCY - cy, playerCX - cx);
        const coneRad = Math.PI * 140 / 180;
        const t = 24 > 1 ? index / (24 - 1) : 0.5;
        const offset = (t - 0.5) * coneRad;
        const angle = baseAngle + offset;
        const launchDist = this.width / 2 + 10;
        const launchX = cx + Math.cos(angle) * launchDist;
        const launchY = cy + Math.sin(angle) * launchDist;
        const initialTargetX = launchX + Math.cos(angle) * 200;
        const initialTargetY = launchY + Math.sin(angle) * 200;
        const m = new Missile(launchX, launchY, initialTargetX, initialTargetY, this.missileDamage, this.missileSpeed);
        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'salvo';
        m.delayStartTime = Date.now();
        m.delayDuration = 300;
        m.guideRange = 600;
        if (!game.bossMissiles) game.bossMissiles = [];
        game.bossMissiles.push(m);

        // VFX: muzzle puff in the launch direction
        bossFX.spawnBurst(launchX, launchY, 5, {
            color: '#ff4530',
            speedMin: 1.5, speedMax: 4.5,
            sizeMin: 1.5, sizeMax: 3.5,
            lifeMs: 380,
            spreadAngle: Math.PI / 3,
            baseAngle: angle,
            drag: 0.9
        });
        // Big impact for the first shot of the volley
        if (index === 0) {
            bossFX.addFlash(cx, cy, 90, '#ff3020', 320, 0.85);
            bossFX.addShockwave(cx, cy, 30, 140, '#ff5040', 460, 4, 0.7);
            bossFX.addShake(4, 200);
        }
    }
    
    _fireHomingMissile(index) {
        if (!game.player) return;
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const tc = (typeof getBossTargetCenter === 'function')
            ? getBossTargetCenter(cx, cy) : null;
        if (!tc) return;
        const playerCX = tc.x;
        const playerCY = tc.y;

        // Spawn from one of the four faces of the boss square. With 6
        // missiles in a salvo this gives top/bottom 2 each, left/right
        // 1 each (rotating starting face per salvo for variety). The
        // missile launches outward along the face normal so it visibly
        // peels off the boss before its homing kicks in.
        const sides = ['top', 'right', 'bottom', 'left'];
        if (this._homingSideOrder === undefined) this._homingSideOrder = 0;
        if (index === 0) this._homingSideOrder = (this._homingSideOrder + 1) % 4;
        const side = sides[(this._homingSideOrder + index) % 4];

        // Position along the chosen face. Multiple missiles on the same
        // face spread along that edge so they don't stack.
        // sameFaceCount counts how many earlier missiles in this salvo
        // already used this face.
        let sameFaceCount = 0;
        let sameFaceIndex = 0;
        for (let i = 0; i < 6; i++) {
            const s = sides[(this._homingSideOrder + i) % 4];
            if (s === side) {
                if (i < index) sameFaceIndex++;
                sameFaceCount++;
            }
        }
        const slotT = sameFaceCount > 1
            ? (sameFaceIndex + 1) / (sameFaceCount + 1) // 1/(N+1) .. N/(N+1)
            : 0.5;
        const offsetAlong = (slotT - 0.5) * this.width;

        let launchX, launchY, normalAngle;
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const lip = 8; // small outward lip so the muzzle puff is visible
        if (side === 'top') {
            launchX = cx + offsetAlong;
            launchY = cy - halfH - lip;
            normalAngle = -Math.PI / 2;
        } else if (side === 'bottom') {
            launchX = cx + offsetAlong;
            launchY = cy + halfH + lip;
            normalAngle = Math.PI / 2;
        } else if (side === 'left') {
            launchX = cx - halfW - lip;
            launchY = cy + offsetAlong;
            normalAngle = Math.PI;
        } else { // 'right'
            launchX = cx + halfW + lip;
            launchY = cy + offsetAlong;
            normalAngle = 0;
        }

        const m = new Missile(launchX, launchY, playerCX, playerCY, this.missileDamage + 6, this.missileSpeed * 0.84);
        // Override initial velocity so the missile shoots straight out
        // of the face (outward normal). The Missile constructor seeds
        // velocity toward the target, which would have pulled it
        // diagonally back toward the player and looked wrong.
        const initialSpeed = Math.hypot(m.vx, m.vy) || (this.missileSpeed * 0.84);
        m.vx = Math.cos(normalAngle) * initialSpeed;
        m.vy = Math.sin(normalAngle) * initialSpeed;

        m.isBossMissile = true;
        m.isBossMissileDelayed = true;
        m.bossMissileType = 'homing';
        m.delayStartTime = Date.now();
        m.delayDuration = 120;
        m.guideRange = 800;
        m.enhancedHoming = true;
        // Guide-time bumped to 150% of the previous halved values.
        m.strongTrackingDuration = 1650;
        m.fadeOutDuration = 675;
        m.size = 1.35; // visually thicker than salvo missiles
        if (!game.bossMissiles) game.bossMissiles = [];
        game.bossMissiles.push(m);

        // VFX: orange muzzle puff blasting outward from the face.
        bossFX.spawnBurst(launchX, launchY, 6, {
            color: '#ff8030',
            speedMin: 1.5, speedMax: 4.5,
            sizeMin: 1.5, sizeMax: 3,
            lifeMs: 420,
            spreadAngle: Math.PI / 4,
            baseAngle: normalAngle,
            drag: 0.9
        });
        if (index === 0) {
            bossFX.addFlash(cx, cy, 70, '#ff7020', 300, 0.8);
            bossFX.addShockwave(cx, cy, 20, 100, '#ff8030', 420, 3, 0.6);
            bossFX.addShake(3, 160);
        }
    }

    _fireGridBarrage(vLanesX, hLanesY) {
        const W = GAME_CONFIG.WIDTH;
        const H = GAME_CONFIG.HEIGHT;
        const speed = 22;
        // Each lane spawns one beam-bullet that travels its full length.
        // Vertical lanes alternate up/down so pairs of adjacent lanes can't
        // be safely sandwiched.
        for (let i = 0; i < vLanesX.length; i++) {
            const lx = vLanesX[i];
            const goingDown = i % 2 === 0;
            const startY = goingDown ? -20 : H + 20;
            const endY = goingDown ? H + 20 : -20;
            const m = new Missile(lx, startY, lx, endY, this.missileDamage, speed);
            m.isBossMissile = true;
            m.isBossMissileDelayed = false;
            m.bossMissileType = 'grid';
            m.guideRange = 0;
            if (!game.bossMissiles) game.bossMissiles = [];
            game.bossMissiles.push(m);
            const axisAngle = goingDown ? Math.PI / 2 : -Math.PI / 2;
            bossFX.spawnBurst(lx, startY, 10, {
                color: '#ff5050',
                speedMin: 2.5, speedMax: 6,
                sizeMin: 2, sizeMax: 3.5,
                lifeMs: 420,
                spreadAngle: Math.PI / 5,
                baseAngle: axisAngle,
                drag: 0.92
            });
        }
        for (let i = 0; i < hLanesY.length; i++) {
            const ly = hLanesY[i];
            const goingRight = i % 2 === 0;
            const startX = goingRight ? -20 : W + 20;
            const endX = goingRight ? W + 20 : -20;
            const m = new Missile(startX, ly, endX, ly, this.missileDamage, speed);
            m.isBossMissile = true;
            m.isBossMissileDelayed = false;
            m.bossMissileType = 'grid';
            m.guideRange = 0;
            if (!game.bossMissiles) game.bossMissiles = [];
            game.bossMissiles.push(m);
            const axisAngle = goingRight ? 0 : Math.PI;
            bossFX.spawnBurst(startX, ly, 10, {
                color: '#ff5050',
                speedMin: 2.5, speedMax: 6,
                sizeMin: 2, sizeMax: 3.5,
                lifeMs: 420,
                spreadAngle: Math.PI / 5,
                baseAngle: axisAngle,
                drag: 0.92
            });
        }
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        bossFX.addFlash(cx, cy, 160, '#ff4040', 420, 1.0);
        bossFX.addShockwave(cx, cy, 30, 280, '#ff4040', 700, 6, 0.85);
        bossFX.addShockwave(cx, cy, 30, 380, '#ff8060', 950, 3, 0.45);
        bossFX.addShake(8, 360);
    }

    updateAI() {
        if (!game.player) return;
        
        const now = Date.now();
        const dt = (now - this.lastAiUpdate) / 1000;
        this.lastAiUpdate = now;
        
        const bossCX = this.x + this.width / 2;
        const bossCY = this.y + this.height / 2;
        const aiTarget = getBossTargetCenter(bossCX, bossCY);
        const playerCX = aiTarget ? aiTarget.x : bossCX;
        const playerCY = aiTarget ? aiTarget.y : bossCY;
        
        const dx = playerCX - bossCX;
        const dy = playerCY - bossCY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const toPlayerAngle = Math.atan2(dy, dx);
        
        // Decrement cooldowns
        if (this.rushCooldown > 0) this.rushCooldown -= dt;
        if (this.rushDuration > 0) this.rushDuration -= dt;
        this.aiStateTimer -= dt;
        
        // State transitions
        if (this.aiState === 'rush' && this.rushDuration <= 0) {
            this.aiState = 'retreat';
            this.aiStateTimer = 1.2 + Math.random() * 0.8;
        }
        
        if (this.aiState !== 'rush') {
            if (dist < this.minDistance) {
                this.aiState = 'retreat';
                this.aiStateTimer = 0.8 + Math.random() * 0.6;
            } else if (dist > this.maxDistance) {
                this.aiState = 'approach';
                this.aiStateTimer = 1.0 + Math.random() * 0.5;
            } else if (this.aiStateTimer <= 0) {
                // In comfort zone: mostly strafe, occasionally rush
                if (this.rushCooldown <= 0 && Math.random() < 0.15) {
                    this.aiState = 'rush';
                    this.rushDuration = 0.6 + Math.random() * 0.4;
                    this.rushCooldown = 4.0 + Math.random() * 3.0;
                    this.rushTarget = { x: playerCX, y: playerCY };
                } else {
                    this.aiState = 'strafe';
                    this.aiStateTimer = 2.0 + Math.random() * 2.0;
                    if (Math.random() < 0.35) this.strafeDirection *= -1;
                }
            }
        }
        
        let moveAngle = 0;
        let moveSpeed = this.speed;
        
        switch (this.aiState) {
            case 'strafe': {
                // Circle the player at ideal distance
                const perpAngle = toPlayerAngle + (Math.PI / 2) * this.strafeDirection;
                const distError = dist - this.idealDistance;
                const correctionWeight = Math.min(Math.abs(distError) / 150, 0.7);
                const correctionAngle = distError > 0 ? toPlayerAngle : toPlayerAngle + Math.PI;
                moveAngle = this.lerpAngle(perpAngle, correctionAngle, correctionWeight);
                moveSpeed = this.speed * 0.85;
                break;
            }
            case 'retreat': {
                const awayAngle = toPlayerAngle + Math.PI;
                const jitter = (Math.random() - 0.5) * 0.6;
                moveAngle = awayAngle + jitter;
                moveSpeed = this.speed * 1.15;
                break;
            }
            case 'approach': {
                moveAngle = toPlayerAngle + (Math.random() - 0.5) * 0.4;
                moveSpeed = this.speed * 0.9;
                break;
            }
            case 'rush': {
                if (this.rushTarget) {
                    const rushDx = this.rushTarget.x - bossCX;
                    const rushDy = this.rushTarget.y - bossCY;
                    moveAngle = Math.atan2(rushDy, rushDx);
                } else {
                    moveAngle = toPlayerAngle;
                }
                moveSpeed = this.speed * 1.6;
                break;
            }
        }
        
        // Apply boundary avoidance: steer away from edges
        const margin = 70;
        let bx = 0, by = 0;
        if (bossCX < margin) bx = (margin - bossCX) / margin;
        else if (bossCX > GAME_CONFIG.WIDTH - margin) bx = (GAME_CONFIG.WIDTH - margin - bossCX) / margin;
        if (bossCY < margin) by = (margin - bossCY) / margin;
        else if (bossCY > GAME_CONFIG.HEIGHT - margin) by = (GAME_CONFIG.HEIGHT - margin - bossCY) / margin;
        
        let finalVx = Math.cos(moveAngle) * moveSpeed + bx * moveSpeed * 1.5;
        let finalVy = Math.sin(moveAngle) * moveSpeed + by * moveSpeed * 1.5;
        
        // Smoothly interpolate velocity for natural movement
        const smoothing = 0.12;
        this.vx += (finalVx - this.vx) * smoothing;
        this.vy += (finalVy - this.vy) * smoothing;
    }
    
    lerpAngle(a, b, t) {
        let diff = b - a;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return a + diff * t;
    }

    update() {
        if (this.stunned) {
            if (Date.now() >= this.stunEndTime) {
                this.stunned = false;
            } else {
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        if (this.isImpaled && this.impaledBy) {
            super.update();
            this.checkBounds();
            return;
        }
        
        this.checkDodge();
        this.checkBulletDodge();
        this.checkMissileDodge();
        this.updateDodge();
        
        // Combat decision (utility-driven move selector + active move tick)
        this.updateCombatAI();
        
        if (!this.isDodging && this.combatPhase !== 'commit') {
            this.updateAI();
        }

        // Hard clamp to screen bounds
        if (this.x <= 0) { this.x = 1; this.vx = Math.abs(this.vx); }
        if (this.x + this.width >= GAME_CONFIG.WIDTH) { this.x = GAME_CONFIG.WIDTH - this.width - 1; this.vx = -Math.abs(this.vx); }
        if (this.y <= 0) { this.y = 1; this.vy = Math.abs(this.vy); }
        if (this.y + this.height >= GAME_CONFIG.HEIGHT) { this.y = GAME_CONFIG.HEIGHT - this.height - 1; this.vy = -Math.abs(this.vy); }

        super.update();
        this.checkBounds();
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
        damage = (typeof applyOverdriveBoost === 'function') ? applyOverdriveBoost(damage) : damage;
        const now = Date.now();
        
        // 每秒重置累积伤害窗口
        if (now - this.damageWindow.windowStart >= 1000) {
            this.damageWindow.accumulated = 0;
            this.damageWindow.windowStart = now;
        }
        
        // 根据本窗口已累积伤害计算减伤比例
        // 累积越多减伤越高，但永远不会减到0
        const reductionFactor = this.damageWindow.accumulated / (this.damageWindow.accumulated + 30);
        const actualDamage = Math.max(1, Math.round(damage * (1 - reductionFactor)));
        
        this.damageWindow.accumulated += damage;
        
        this.health -= actualDamage;
        
        this.addHitIndicator(actualDamage);
        
        return this.health <= 0;
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
    
    // Floating green +HP text (used by bloodSurge move)
    _showHealIndicator(amount) {
        this.hitIndicators.push({
            damage: amount,
            startTime: Date.now(),
            x: this.x + this.width / 2 + (Math.random() - 0.5) * 30,
            y: this.y - 10,
            isHeal: true
        });
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
            
            // Heal indicators render in green; damage in red.
            const isHeal = !!indicator.isHeal;
            ctx.fillStyle = isHeal ? '#00ff66' : '#FF0000';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3;
            
            const displayY = indicator.y - offsetY;
            const text = isHeal ? `+${indicator.damage}` : `HIT ${indicator.damage}`;
            
            // 绘制文字描边（白色）
            ctx.strokeText(text, indicator.x, displayY);
            // 绘制文字填充
            ctx.fillText(text, indicator.x, displayY);
            
            ctx.restore();
        });
    }

    draw(ctx) {
        // Render active attack telegraphs UNDER the boss so the boss draws on top
        renderBossTelegraphs(ctx, this.telegraphs);

        // Active crimson-laser beam (fired by the crimsonLaser move).
        // Drawn under the boss body so the boss block reads on top.
        this._drawCrimsonLaser(ctx);

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
                ctx.fillText(t('boss.CRIMSON_KING'), this.x + this.width/2, this.y - 16);
        
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
            ctx.fillText(t('boss.pierce'), this.x + this.width/2, this.y - 25);
            
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

    // Crimson laser beam visual — Star-Devourer style line beam recolored
    // blood-red. Cleared automatically when its duration expires.
    _drawCrimsonLaser(ctx) {
        const fx = this.crimsonLaserFX;
        if (!fx) return;
        const t = Date.now() - fx.startedAt;
        if (t >= fx.durationMs) {
            this.crimsonLaserFX = null;
            return;
        }
        const a = 1 - (t / fx.durationMs);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
        // Outer glow — wide, soft, deep red.
        ctx.globalAlpha = a * 0.45;
        ctx.strokeStyle = '#ff2020';
        ctx.lineWidth = 14;
            ctx.beginPath();
        ctx.moveTo(fx.sx, fx.sy);
        ctx.lineTo(fx.ex, fx.ey);
            ctx.stroke();
        // Mid body
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = '#ff5050';
        ctx.lineWidth = 5;
            ctx.beginPath();
        ctx.moveTo(fx.sx, fx.sy);
        ctx.lineTo(fx.ex, fx.ey);
            ctx.stroke();
        // Bright core — pale red, not pure white, so it can't blow out
        // when stacked with other additive layers.
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffc8c8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx.sx, fx.sy);
        ctx.lineTo(fx.ex, fx.ey);
        ctx.stroke();
        ctx.restore();
    }

    // Crimson King thruster: shared multi-layer additive jet flame.
    // Boss is drawn in WORLD coordinates (no parent translate), so origin is absolute.
    drawThrusterFlames(ctx) {
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;
        
        const moveAngle = Math.atan2(this.vy, this.vx);
        const thrusterAngle = moveAngle + Math.PI; // flame points opposite movement
        const dodging = !!this.isDodging;
        const intensity = dodging ? 1.0 : 0.78;
        const length = dodging ? 95 : 62;
        const width = dodging ? 26 : 18;
        const thrusterCount = 2;
        const thrusterSpacing = dodging ? 18 : 14;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const startDistance = this.width / 2 + 5;
        const perpAngle = thrusterAngle + Math.PI / 2;
        for (let i = 0; i < thrusterCount; i++) {
            const offsetPerp = (i - (thrusterCount - 1) / 2) * thrusterSpacing;
            const ox = cx + Math.cos(thrusterAngle) * startDistance + Math.cos(perpAngle) * offsetPerp;
            const oy = cy + Math.sin(thrusterAngle) * startDistance + Math.sin(perpAngle) * offsetPerp;
            drawJetFlame(ctx, {
                originX: ox,
                originY: oy,
                angle: thrusterAngle,
                length, width,
                intensity,
                scheme: 'crimson',
                spawnEmbers: true,
                emberDensity: dodging ? 1.0 : 0.6,
                id: i + (dodging ? 20 : 0)
            });
        }
    }
    
    drawLockIndicator(ctx) {
        drawBossLockIndicator(ctx, this, '#FF0000', 'white', { tipYOffset: -8, height: 24, halfWidth: 12, bounceAmp: 4, speed: 0.01 });
    }
}
