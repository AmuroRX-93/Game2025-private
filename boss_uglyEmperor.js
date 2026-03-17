// 丑皇 Boss + ChaosBullet + Mine + MolotovCocktail
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
        
        // 回血系统
        this.healSystem = {
            interval: 3000,
            chance: 0.45,
            minHeal: 6,
            maxHeal: 20,
            lastAttempt: Date.now()
        };
        
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
        
        this.tryHeal();
        
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
        // 硬边界钳制，防止出界
        if (this.x < 0) { this.x = 1; this.vx = Math.abs(this.vx); }
        if (this.x + this.width > GAME_CONFIG.WIDTH) { this.x = GAME_CONFIG.WIDTH - this.width - 1; this.vx = -Math.abs(this.vx); }
        if (this.y < 0) { this.y = 1; this.vy = Math.abs(this.vy); }
        if (this.y + this.height > GAME_CONFIG.HEIGHT) { this.y = GAME_CONFIG.HEIGHT - this.height - 1; this.vy = -Math.abs(this.vy); }
        
        // 智能边界：靠近边缘时主动转向中央
        const edgeThreshold = 60;
        const centerX = GAME_CONFIG.WIDTH / 2;
        const centerY = GAME_CONFIG.HEIGHT / 2;
        const bx = this.x + this.width / 2;
        const by = this.y + this.height / 2;
        let needSteer = false;
        let targetX = bx, targetY = by;
        
        if (bx < edgeThreshold) { targetX = centerX; needSteer = true; }
        if (bx > GAME_CONFIG.WIDTH - edgeThreshold) { targetX = centerX; needSteer = true; }
        if (by < edgeThreshold) { targetY = centerY; needSteer = true; }
        if (by > GAME_CONFIG.HEIGHT - edgeThreshold) { targetY = centerY; needSteer = true; }
        
        if (needSteer && !this.isDodging) {
            const dx = targetX - bx;
            const dy = targetY - by;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.vx = (dx / dist) * this.speed;
                this.vy = (dy / dist) * this.speed;
            }
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
        let actualDamage = damage;
        
        if (!this.phaseTwo.activated) {
            // 一阶段：只有导弹不能造成伤害（其他攻击都能造成伤害）
            if (damageSource !== 'missile') {
                shouldTakeDamage = true;
            }
        } else {
            // 二阶段：只有导弹能造成伤害，1.5倍伤害
            if (damageSource === 'missile') {
                shouldTakeDamage = true;
                actualDamage = damage * 2;
            }
        }
        
        if (shouldTakeDamage) {
            this.health -= actualDamage;
            
            // 防止血量变成负数
            if (this.health < 0) {
                this.health = 0;
            }
            
            // 添加受击提示（显示实际伤害）
            this.addHitIndicator(actualDamage);
            
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
    
    tryHeal() {
        const now = Date.now();
        const hs = this.healSystem;
        const interval = this.phaseTwo.activated ? 2000 : hs.interval;
        if (now - hs.lastAttempt < interval) return;
        hs.lastAttempt = now;
        if (this.health >= this.maxHealth) return;
        if (Math.random() > hs.chance) return;
        const amount = Math.floor(Math.random() * (hs.maxHeal - hs.minHeal + 1)) + hs.minHeal;
        this.health = Math.min(this.maxHealth, this.health + amount);
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
        
        // 拦截玩家导弹：混沌子弹可以提前引爆导弹
        if (game.missiles) {
            for (let i = game.missiles.length - 1; i >= 0; i--) {
                const missile = game.missiles[i];
                if (missile.isBossMissile || missile.isReversed) continue;
                const dx = missile.x - (this.x + this.width / 2);
                const dy = missile.y - (this.y + this.height / 2);
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 15) {
                    missile.intercepted = true;
                    missile.explode();
                    this.shouldDestroy = true;
                    return;
                }
            }
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
        this.health = 3; // 3点生命值（近防炮3发清除）
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
    
    takeDamage(damage) {
        if (this.isExploded) return;
        this.health -= damage;
        if (this.health <= 0) {
            this.shouldDestroy = true;
            if (game.mines) {
                const index = game.mines.indexOf(this);
                if (index > -1) game.mines.splice(index, 1);
            }
        }
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
        this.rotation = 0;
        this.isExploded = false;
        this.explosionStartTime = 0;
        this.fireDuration = 3000;
        this.burnRadius = 80;
        this.totalDistance = 0;
        
        // 计算飞行方向和距离
        const dx = targetX - x;
        const dy = targetY - y;
        this.flightDistance = Math.sqrt(dx * dx + dy * dy);
        
        if (this.flightDistance > 0) {
            this.vx = (dx / this.flightDistance) * speed;
            this.vy = (dy / this.flightDistance) * speed;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
    }
    
    explode() {
        this.isExploded = true;
        this.explosionStartTime = Date.now();
        this.x = this.targetX - this.width / 2;
        this.y = this.targetY - this.height / 2;
        this.vx = 0;
        this.vy = 0;
        
        this.checkBurnInRange();
    }
    
    checkBurnInRange() {
        if (!game.player) return;
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const dx = playerCenterX - centerX;
        const dy = playerCenterY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= this.burnRadius) {
            game.player.applyBurn();
        }
    }
    
    update() {
        if (this.isExploded) {
            const now = Date.now();
            if (now - this.explosionStartTime >= this.fireDuration) {
                this.shouldDestroy = true;
                return;
            }
            this.checkBurnInRange();
            return;
        }
        
        // 累计飞行距离
        const stepDist = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        this.totalDistance += stepDist;
        
        // 到达目标距离则爆炸
        if (this.totalDistance >= this.flightDistance) {
            this.explode();
            return;
        }
        
        super.update();
        this.rotation += this.rotationSpeed;
        
        // 飞行中拦截玩家导弹
        if (game.missiles) {
            const myCenterX = this.x + this.width / 2;
            const myCenterY = this.y + this.height / 2;
            for (let i = game.missiles.length - 1; i >= 0; i--) {
                const missile = game.missiles[i];
                if (missile.isBossMissile || missile.isReversed) continue;
                const dx = missile.x - myCenterX;
                const dy = missile.y - myCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 15) {
                    missile.intercepted = true;
                    missile.explode();
                    this.shouldDestroy = true;
                    return;
                }
            }
        }
        
        if (this.x < 0 || this.x > GAME_CONFIG.WIDTH || 
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
        }
    }
    
    draw(ctx) {
        if (this.isExploded) {
            this.drawFireZone(ctx);
            return;
        }
        
        ctx.save();
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(this.rotation);
        ctx.translate(-centerX, -centerY);
        
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x + 2, this.y - 2, 4, 2);
        
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
    
    drawFireZone(ctx) {
        const now = Date.now();
        const elapsed = now - this.explosionStartTime;
        const progress = elapsed / this.fireDuration;
        if (progress >= 1) return;
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        const flicker = 0.6 + Math.sin(now * 0.02) * 0.15 + Math.sin(now * 0.05) * 0.1;
        const fadeAlpha = progress > 0.7 ? (1 - progress) / 0.3 : 1.0;
        
        ctx.save();
        ctx.globalAlpha = fadeAlpha * 0.4;
        
        // 外圈火焰区域
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.burnRadius);
        gradient.addColorStop(0, 'rgba(255, 200, 0, 0.8)');
        gradient.addColorStop(0.4, 'rgba(255, 100, 0, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.burnRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 内圈明亮火焰
        ctx.globalAlpha = fadeAlpha * flicker * 0.7;
        ctx.fillStyle = '#FFAA00';
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.burnRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
        
        // 火焰边缘虚线
        ctx.globalAlpha = fadeAlpha * 0.3;
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.burnRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
}