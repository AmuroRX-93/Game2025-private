// 玩家类
class Player extends GameObject {
    constructor(x, y, mechType) {
        const mech = MECH_TYPES[mechType];
        super(x, y, 30, 30, mech.color);
        this.mechType = mechType;
        this.mech = mech;
        this.direction = 0; // 角度值，0度为右，90度为下，180度为左，270度为上
        
        // 生命值系统
        this.maxHealth = mech.health;
        this.health = this.maxHealth;
        
        // 武器系统 - 左右手分离 + 隐藏机能 + 肩部武器
        this.leftHandWeapon = null;
        this.rightHandWeapon = null;
        this.hiddenAbilityWeapon = null;
        this.leftShoulderWeapon = null;
        this.rightShoulderWeapon = null;
        this.weaponSlots = mech.weaponSlots;
        
        // 闪避系统
        this.isDodging = false;
        this.dodgeStartTime = 0;
        this.dodgeDuration = 150; // 0.15秒
        this.dodgeCooldown = 350; // 0.35秒
        this.lastDodgeTime = 0;
        this.dodgeSpeed = 30; // 30单位每秒
        this.dodgeDirection = { x: 0, y: 0 }; // 闪避方向
        this.lastSpaceKeyState = false; // 跟踪空格键的前一帧状态
        
        // 移动速度
        this.speed = mech.speed;
        
        // 僵直系统
        this.stunned = false; // 是否僵直
        this.stunEndTime = 0; // 僵直结束时间
        
        // 燃烧状态
        this.burning = false;
        this.burnEndTime = 0;
        this.burnLastTick = 0;
        this.burnDamageInterval = 100; // 每0.1秒
        this.burnDamagePerTick = 2;
        this.burnSpeedMultiplier = 0.8; // 移速降至80%
        this.burnDuration = 5000; // 5秒
        
        // 根据机甲配置创建武器实例
        this.loadDefaultWeapons();
        
        // 无敌模式
        this.isInvincible = gameState.invincibleMode;
        
        // 诱饵分身 - 不可锁定状态
        this.isUntargetable = false;
        this.untargetableEndTime = 0;
        
        // 受击提示系统
        this.hitIndicators = [];
    }
    
    loadDefaultWeapons() {
        this.leftHandWeapon = null;
        this.rightHandWeapon = null;
        this.hiddenAbilityWeapon = null;
        this.leftShoulderWeapon = null;
        this.rightShoulderWeapon = null;
        
        const leftWeaponType = gameState.weaponConfig.leftHand;
        const rightWeaponType = gameState.weaponConfig.rightHand;
        const hiddenAbilityType = gameState.weaponConfig.hiddenAbility;
        const leftShoulderType = gameState.weaponConfig.leftShoulder;
        const rightShoulderType = gameState.weaponConfig.rightShoulder;
        
        const allTypes = [leftWeaponType, rightWeaponType, hiddenAbilityType, leftShoulderType, rightShoulderType];
        if (allTypes.includes('moonlight_greatsword')) {
            const mg = new MoonlightGreatsword();
            this.rightHandWeapon = mg;
            this.leftShoulderWeapon = mg;
            this.rightShoulderWeapon = mg;
            this.hiddenAbilityWeapon = mg;
            if (leftWeaponType && leftWeaponType !== 'moonlight_greatsword' && WEAPON_TYPES[leftWeaponType]) {
                this.leftHandWeapon = new WEAPON_TYPES[leftWeaponType]();
            }
            return;
        }
        
        if (leftWeaponType && WEAPON_TYPES[leftWeaponType]) {
            this.leftHandWeapon = new WEAPON_TYPES[leftWeaponType]();
        }
        
        if (rightWeaponType && WEAPON_TYPES[rightWeaponType]) {
            this.rightHandWeapon = new WEAPON_TYPES[rightWeaponType]();
        }
        
        if (hiddenAbilityType && WEAPON_TYPES[hiddenAbilityType]) {
            this.hiddenAbilityWeapon = new WEAPON_TYPES[hiddenAbilityType]();
        }
        
        if (leftShoulderType && WEAPON_TYPES[leftShoulderType]) {
            this.leftShoulderWeapon = new WEAPON_TYPES[leftShoulderType](true);
        }
        
        if (rightShoulderType && WEAPON_TYPES[rightShoulderType]) {
            this.rightShoulderWeapon = new WEAPON_TYPES[rightShoulderType](true);
        }
    }
    
    // 获取左手武器
    getLeftHandWeapon() {
        return this.leftHandWeapon;
    }
    
    // 获取右手武器
    getRightHandWeapon() {
        return this.rightHandWeapon;
    }
    
    // 获取隐藏机能武器
    getHiddenAbilityWeapon() {
        return this.hiddenAbilityWeapon;
    }
    
    // 获取左肩武器
    getLeftShoulderWeapon() {
        return this.leftShoulderWeapon;
    }
    
    // 获取右肩武器
    getRightShoulderWeapon() {
        return this.rightShoulderWeapon;
    }
    
    // 获取所有武器（用于统一更新）
    getAllWeapons() {
        const seen = new Set();
        const weapons = [];
        [this.leftHandWeapon, this.rightHandWeapon, this.hiddenAbilityWeapon, this.leftShoulderWeapon, this.rightShoulderWeapon].forEach(w => {
            if (w && !seen.has(w)) { seen.add(w); weapons.push(w); }
        });
        return weapons;
    }
    
    // 获取特定类型的武器（兼容性方法）
    getWeaponByType(type) {
        if (this.leftHandWeapon && this.leftHandWeapon.type === type) {
            return this.leftHandWeapon;
        }
        if (this.rightHandWeapon && this.rightHandWeapon.type === type) {
            return this.rightHandWeapon;
        }
        return null;
    }
    
    // 获取剑武器（兼容性方法）
    getSword() {
        return this.getWeaponByType('sword');
    }
    
    // 获取枪武器（兼容性方法）
    getGun() {
        return this.getWeaponByType('gun');
    }

    findNearestEnemy() {
        const allEnemies = [...game.enemies];
        if (game.boss) {
            let bossTargetable = true;
            if (game.boss instanceof StarDevourer) {
                // 失明技能激活时不可锁定
                if (game.boss.blindnessSkill && game.boss.blindnessSkill.isActive) {
                    bossTargetable = false;
                }
            }
            if (bossTargetable) {
                if (!game.boss.phaseTwo || !game.boss.phaseTwo.activated) {
                    allEnemies.push(game.boss);
                } else if (!game.boss.isWithinDetectionRange || game.boss.isWithinDetectionRange()) {
                    allEnemies.push(game.boss);
                }
            }
        }
        
        if (allEnemies.length === 0) return null;
        
        let nearestEnemy = null;
        let minDistance = Infinity;
        
        const playerCenterX = this.x + this.width / 2;
        const playerCenterY = this.y + this.height / 2;
        
        allEnemies.forEach(enemy => {
            const enemyCenterX = enemy.x + enemy.width / 2;
            const enemyCenterY = enemy.y + enemy.height / 2;
            const distance = Math.sqrt(
                Math.pow(playerCenterX - enemyCenterX, 2) + 
                Math.pow(playerCenterY - enemyCenterY, 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemy;
            }
        });
        
        return nearestEnemy;
    }
    
    getCurrentTarget() {
        // 检查左右手武器是否有锁定目标（优先级最高）
        if (this.leftHandWeapon && this.leftHandWeapon.dashTarget) {
            return this.leftHandWeapon.dashTarget;
        }
        if (this.rightHandWeapon && this.rightHandWeapon.dashTarget) {
            return this.rightHandWeapon.dashTarget;
        }
        
        // 根据锁定模式返回目标
        switch (gameState.lockMode) {
            case 'soft':
                return this.findNearestEnemy();
            case 'hard':
                // 硬锁模式：检查硬锁目标是否还存在且可锁定
                if (gameState.hardLockTarget) {
                    let targetValid = false;
                    
                    // 检查目标是否为普通敌人
                    if (game.enemies.includes(gameState.hardLockTarget)) {
                        targetValid = true;
                    }
                    else if (game.boss && gameState.hardLockTarget === game.boss) {
                        // 噬星者失明技能激活时不可锁定
                        if (game.boss instanceof StarDevourer &&
                            game.boss.blindnessSkill && game.boss.blindnessSkill.isActive) {
                            targetValid = false;
                        } else if (!game.boss.phaseTwo || !game.boss.phaseTwo.activated) {
                            targetValid = true;
                        } else if (!game.boss.isWithinDetectionRange || game.boss.isWithinDetectionRange()) {
                            targetValid = true;
                        }
                    }
                    
                    if (targetValid) {
                        return gameState.hardLockTarget;
                    } else {
                        // 目标无效（不存在或Boss进入二阶段），自动切换到最近敌人
                        gameState.hardLockTarget = this.findNearestEnemy();
                        return gameState.hardLockTarget;
                    }
                } else {
                    // 没有硬锁目标，锁定最近敌人
                    gameState.hardLockTarget = this.findNearestEnemy();
                    return gameState.hardLockTarget;
                }
            case 'manual':
                return null; // 手动锁模式不返回敌人目标
            default:
                return this.findNearestEnemy();
        }
    }
    
    isCurrentlyAttacking() {
        // 检查是否有任何武器正在攻击（只检查限制移动的攻击）
        const weapons = this.getAllWeapons();
        return weapons.some(weapon => {
            if (weapon.type === 'sword') {
                return weapon.isAttacking || weapon.isDashing;
            } else if (weapon.type === 'laser_spear') {
                return weapon.isCharging;
            } else if (weapon.type === 'moonlight_greatsword') {
                return weapon.isAttacking;
            }
            return false;
        });
    }
    
    isUsingAnyWeapon() {
        // 检查是否有任何武器正在被使用（用于敌人闪避检测）
        const weapons = this.getAllWeapons();
        return weapons.some(weapon => {
            if (weapon.type === 'sword') {
                return weapon.isAttacking || weapon.isDashing;
            } else if (weapon.type === 'gun') {
                return Date.now() - weapon.lastUseTime < 100;
            } else if (weapon.type === 'laser_spear') {
                return weapon.isCharging;
            }
            return false;
        });
    }
    
    // 检查是否正在使用近战武器（专门用于近战闪避检测）
    isUsingMeleeWeapon() {
        const weapons = this.getAllWeapons();
        return weapons.some(weapon => {
            if (weapon.type === 'sword') {
                return weapon.isAttacking || weapon.isDashing;
            } else if (weapon.type === 'laser_spear') {
                return weapon.isCharging;
            }
            return false;
        });
    }
    
    // 检查是否可以攻击（闪避和闪避冷却期间不能攻击）
    canAttack() {
        // 如果正在闪避，不能攻击
        if (this.isDodging) return false;
        
        // 如果在闪避冷却中，不能攻击
        if (!this.canDodge()) return false;
        
        return true;
    }
    
    updateDirection() {
        const playerCenterX = this.x + this.width / 2;
        const playerCenterY = this.y + this.height / 2;
        
        // 根据锁定模式确定朝向
        switch (gameState.lockMode) {
            case 'soft':
            case 'hard':
                const target = this.getCurrentTarget();
                if (target) {
                    // 有目标时，朝向目标
                    const targetCenterX = target.x + target.width / 2;
                    const targetCenterY = target.y + target.height / 2;
                    
                    const dx = targetCenterX - playerCenterX;
                    const dy = targetCenterY - playerCenterY;
                    
                    // 计算角度（弧度转角度）
                    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    // 确保角度在0-360范围内
                    if (angle < 0) angle += 360;
                    
                    this.direction = angle;
                } else {
                    // 没有目标时，朝向移动方向
                    if (this.vx !== 0 || this.vy !== 0) {
                        let angle = Math.atan2(this.vy, this.vx) * 180 / Math.PI;
                        // 确保角度在0-360范围内
                        if (angle < 0) angle += 360;
                        this.direction = angle;
                    }
                    // 如果没有移动，保持当前朝向
                }
                break;
            case 'manual':
                // 手动锁模式：玩家朝向鼠标，子弹也朝向鼠标
                const targetX = mouse.x;
                const targetY = mouse.y;
                
                const dx = targetX - playerCenterX;
                const dy = targetY - playerCenterY;
                
                // 计算角度（弧度转角度）
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                // 确保角度在0-360范围内
                if (angle < 0) angle += 360;
                
                this.direction = angle;
                
                // 更新手动锁定位置为当前鼠标位置
                gameState.manualLockX = mouse.x;
                gameState.manualLockY = mouse.y;
                break;
        }
    }

    update() {
        // 检查僵直状态
        if (this.stunned) {
            if (Date.now() >= this.stunEndTime) {
                this.stunned = false;
            } else {
                // 僵直期间不能移动和行动
                this.vx = 0;
                this.vy = 0;
                super.update();
                this.checkBounds();
                return;
            }
        }
        
        // 更新燃烧状态
        this.updateBurning();
        
        // 锁定系统 - 自动朝向最近的敌人
        this.updateDirection();
        
        // 重置速度
        this.vx = 0;
        this.vy = 0;

        // 检查是否能接受键盘输入（任何武器冲刺期间、攻击中都不能接受键盘输入）
        const canAcceptKeyboardInput = !this.isCurrentlyAttacking();
        
        // 强制重置异常的武器状态
            const weapons = this.getAllWeapons();
            weapons.forEach(weapon => {
                if (weapon.type === 'sword') {
                    // 检查剑是否卡在攻击状态
                    if (weapon.isAttacking && weapon.slashes.length === 0) {
                        weapon.isAttacking = false;
                    }
                // 检查剑是否超时卡在冲刺状态（只在真正超时时重置）
                const now = Date.now();
                if (weapon.isDashing && now - weapon.dashStartTime > weapon.maxDashDuration + 1000) {
                        weapon.isDashing = false;
                    weapon.dashTarget = null;
                    }
                }
                if (weapon.type === 'laser_spear') {
                // 检查激光矛是否卡在冲锋状态（只在真正超时时重置）
                    const now = Date.now();
                    if (weapon.isCharging && now - weapon.chargeStartTime > weapon.chargeDuration + 1000) {
                        weapon.isCharging = false;
                        weapon.impaledEnemies.clear();
                    }
                }
            });

        // 更新所有武器（武器可能会设置冲刺速度）
        this.getAllWeapons().forEach(weapon => weapon.update(this));

        // 更新闪避状态
        this.updateDodge();

        // 检查是否有武器正在冲刺（剑的刀推或镭射长枪的冲锋）
        const isWeaponDashing = this.getAllWeapons().some(weapon => 
            (weapon.type === 'sword' && weapon.isDashing) ||
            (weapon.type === 'laser_spear' && weapon.isCharging)
        );

        // 强制重置移动控制逻辑（彻底修复失控问题）
        // 检查是否有武器正在控制玩家移动
        const isWeaponControllingMovement = weapons.some(weapon => 
            (weapon.type === 'laser_spear' && weapon.isCharging) ||
            (weapon.type === 'sword' && weapon.isDashing) ||
            (weapon.type === 'moonlight_greatsword' && weapon.isAttacking)
        );
        
        // 移动控制
        if (this.isDodging) {
            // 闪避移动
            this.vx = this.dodgeDirection.x * this.dodgeSpeed;
            this.vy = this.dodgeDirection.y * this.dodgeSpeed;
        } else if (!isWeaponControllingMovement) {
            // 正常移动（当武器不控制移动时由键盘控制）
            const moveSpeed = this.burning ? this.speed * this.burnSpeedMultiplier : this.speed;
            if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
                this.vx = -moveSpeed;
            }
            if (keys['ArrowRight'] || keys['d'] || keys['D']) {
                this.vx = moveSpeed;
            }
            if (keys['ArrowUp'] || keys['w'] || keys['W']) {
                this.vy = -moveSpeed;
            }
            if (keys['ArrowDown'] || keys['s'] || keys['S']) {
                this.vy = moveSpeed;
            }
        }
        // 当武器控制移动时（如镭射长枪冲锋），让武器设置速度

        // 处理闪避输入（镭射长枪冲锋时不能闪避）
        // 使用边缘触发：只在空格键从未按下变为按下的瞬间触发闪避
        const currentSpaceKeyState = keys[' '];
        if (!isWeaponControllingMovement && currentSpaceKeyState && !this.lastSpaceKeyState && this.canDodge()) {
            this.startDodge();
        }
        this.lastSpaceKeyState = currentSpaceKeyState;

        // 攻击 - 左键控制左手武器，右键控制右手武器
        // 只有在可以攻击时才处理攻击输入（闪避和闪避冷却期间不能攻击）
        if (this.canAttack()) {
            if (mouse.leftClick) {
                this.useLeftHandWeapon();
            }
            if (mouse.rightClick) {
                this.useRightHandWeapon();
            }
        }

        // 重装 (R键) - 只有在能接受键盘输入且可以攻击时才处理
        if (canAcceptKeyboardInput && this.canAttack() && (keys['r'] || keys['R'])) {
            // 重装左手武器（通常是枪）
            if (this.leftHandWeapon && this.leftHandWeapon.canReload) {
                this.leftHandWeapon.reload();
            }
            // 重装右手武器（如果有重装功能）
            if (this.rightHandWeapon && this.rightHandWeapon.canReload) {
                this.rightHandWeapon.reload();
            }
        }
        
        // 隐藏机能 (Shift键) - 只有在能接受键盘输入时才处理
        if (canAcceptKeyboardInput && keys['Shift']) {
            this.useHiddenAbility();
        }

        super.update();
        this.checkBounds();
        
        // 更新受击提示
        this.updateHitIndicators();
    }
    
    // 使用左手武器
    useLeftHandWeapon() {
        if (this.leftHandWeapon) {
            this.leftHandWeapon.use(this);
        }
    }
    
    // 使用右手武器
    useRightHandWeapon() {
        if (this.rightHandWeapon) {
            this.rightHandWeapon.use(this);
        }
    }

    // 使用隐藏机能
    useHiddenAbility() {
        if (this.hiddenAbilityWeapon) {
            this.hiddenAbilityWeapon.use(this);
        }
    }
    
    // 使用左肩武器
    useLeftShoulderWeapon() {
        if (this.leftShoulderWeapon) {
            this.leftShoulderWeapon.use(this);
        }
    }
    
    // 使用右肩武器
    useRightShoulderWeapon() {
        if (this.rightShoulderWeapon) {
            this.rightShoulderWeapon.use(this);
        }
    }
    
    // 使用超级武器（Q键或E键都可以触发）
    useSuperWeapon() {
        // 检查左肩或右肩是否有超级武器
        if (this.leftShoulderWeapon && this.leftShoulderWeapon.type === 'super_weapon') {
            this.leftShoulderWeapon.use(this);
            // 超级武器使用后，两个肩部槽位都标记为已使用
            if (this.leftShoulderWeapon.isUsed) {
                this.leftShoulderWeapon.isUsed = true;
                if (this.rightShoulderWeapon) {
                    this.rightShoulderWeapon.isUsed = true;
                }
            }
        } else if (this.rightShoulderWeapon && this.rightShoulderWeapon.type === 'super_weapon') {
            this.rightShoulderWeapon.use(this);
            // 超级武器使用后，两个肩部槽位都标记为已使用
            if (this.rightShoulderWeapon.isUsed) {
                this.rightShoulderWeapon.isUsed = true;
                if (this.leftShoulderWeapon) {
                    this.leftShoulderWeapon.isUsed = true;
                }
            }
        }
    }
    
    // 使用维修包
    useRepairKit() {
        if (gameState.repairKits > 0 && this.health < this.maxHealth) {
            gameState.repairKits--;
            this.health = Math.min(this.maxHealth, this.health + 60);
            return true; // 使用成功
        }
        return false; // 使用失败
    }

    takeDamage(damage = 1) {
        // 无敌模式下不受伤害
        if (this.isInvincible) {
            return;
        }
        
        // 检查护盾减伤
        let actualDamage = damage;
        if (this.hiddenAbilityWeapon && this.hiddenAbilityWeapon.isDamageReduced && this.hiddenAbilityWeapon.isDamageReduced()) {
            const reduction = this.hiddenAbilityWeapon.getDamageReduction();
            actualDamage = damage * (1 - reduction);
            // 确保伤害值为整数，且最小为1点
            actualDamage = Math.max(1, Math.round(actualDamage));
        }
        
        // 反制重击：反射伤害给攻击者
        if (this.hiddenAbilityWeapon && this.hiddenAbilityWeapon.reflectDamage && 
            this.hiddenAbilityWeapon.isActive) {
            this.hiddenAbilityWeapon.reflectDamage(actualDamage);
        }
        
        // 扣除生命值
        this.health -= actualDamage;
        
        // 添加受击提示
        this.addHitIndicator(actualDamage);
        
        // 确保生命值不低于0
        if (this.health <= 0) {
            this.health = 0;
            gameState.gameOver = true;
            // 玩家死亡时重置失明状态
            gameState.playerBlinded = false;
        }
        
        // 可以在这里添加受伤效果或声音
        // 例如：屏幕闪烁、受伤音效等
    }
    
    // 施加燃烧状态
    applyBurn() {
        this.burning = true;
        this.burnEndTime = Date.now() + this.burnDuration;
        this.burnLastTick = Date.now();
    }
    
    // 更新燃烧效果
    updateBurning() {
        if (!this.burning) return;
        const now = Date.now();
        if (now >= this.burnEndTime) {
            this.burning = false;
            return;
        }
        if (now - this.burnLastTick >= this.burnDamageInterval) {
            const ticks = Math.floor((now - this.burnLastTick) / this.burnDamageInterval);
            this.takeDamage(this.burnDamagePerTick * ticks);
            this.burnLastTick += ticks * this.burnDamageInterval;
        }
    }
    
    // 设置僵直状态
    setStunned(duration = 400) {
        // 如果已经在僵直状态中，不重复设置或延长僵直
        if (this.stunned) {
            return;
        }
        
        this.stunned = true;
        this.stunEndTime = Date.now() + duration;
        // 停止移动
        this.vx = 0;
        this.vy = 0;
    }
    
    // 添加受击提示
    addHitIndicator(damage) {
        this.hitIndicators.push({
            damage: damage,
            x: this.x + this.width / 2,
            y: this.y - 50, // 在玩家上方显示，位置更高一些
            startTime: Date.now(),
            duration: 2000, // 持续2秒
            offsetY: 0 // 用于动画效果
        });
    }
    
    // 更新受击提示
    updateHitIndicators() {
        const now = Date.now();
        this.hitIndicators = this.hitIndicators.filter(indicator => {
            const elapsed = now - indicator.startTime;
            if (elapsed >= indicator.duration) {
                return false; // 移除过期的提示
            }
            
            // 更新动画效果
            const progress = elapsed / indicator.duration;
            indicator.offsetY = -progress * 30; // 向上移动30像素
            return true;
        });
    }
    
    // 绘制受击提示
    drawHitIndicators(ctx) {
        const now = Date.now();
        this.hitIndicators.forEach(indicator => {
            const elapsed = now - indicator.startTime;
            const progress = elapsed / indicator.duration;
            const alpha = 1 - progress; // 逐渐消失
            
            ctx.save();
            ctx.globalAlpha = alpha;
            
            // 绘制伤害数字背景（黑色描边效果）
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.strokeText(`-${indicator.damage}`, indicator.x, indicator.y + indicator.offsetY);
            
            // 绘制伤害数字
            ctx.fillStyle = '#FF0000'; // 红色
            ctx.fillText(`-${indicator.damage}`, indicator.x, indicator.y + indicator.offsetY);
            
            ctx.restore();
        });
    }

    draw(ctx) {
        // 保存当前canvas状态
        ctx.save();
        
        const centerX = this.x + this.width / 2;
        const centerY = this.y + this.height / 2;
        
        // 移动到角色中心并旋转
        ctx.translate(centerX, centerY);
        ctx.rotate(this.direction * Math.PI / 180);
        
        // 隐身闪烁效果（诱饵分身）
        if (this.isUntargetable) {
            const now = Date.now();
            const flick = 0.15 + 0.12 * Math.sin(now * 0.025) + 0.08 * Math.sin(now * 0.063);
            const glitch = Math.random() < 0.08 ? 0 : 1;
            ctx.globalAlpha = flick * glitch;
            ctx.shadowColor = '#4488FF';
            ctx.shadowBlur = 10;
        }
        
        // 无敌状态的视觉效果
        if (this.isInvincible && !this.isUntargetable) {
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            const time = Date.now();
            const alpha = 0.7 + 0.3 * Math.sin(time * 0.01);
            ctx.globalAlpha = alpha;
        }
        
        // 绘制旋转后的角色主体
        let bodyColor = this.color;
        if (this.isUntargetable) bodyColor = '#4488FF';
        else if (this.isInvincible) bodyColor = '#FFD700';
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // 绘制推进器火焰效果
        this.drawThrusterFlames(ctx);
        
        // 恢复canvas状态
        ctx.restore();

        // 绘制武器效果
        this.getAllWeapons().forEach(weapon => {
            weapon.draw(ctx, this);
        });

        // 硬直状态视觉效果
        if (this.stunned) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            
            // 绘制红色硬直效果
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 3;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
            
            ctx.setLineDash([]);
            ctx.restore();
        }

        // 燃烧状态视觉效果
        if (this.burning) {
            ctx.save();
            const bCenterX = this.x + this.width / 2;
            const bCenterY = this.y + this.height / 2;
            const flicker = Math.sin(Date.now() * 0.03) * 3;
            
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#FF6600';
            ctx.beginPath();
            ctx.arc(bCenterX, bCenterY, this.width / 2 + 6 + flicker, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#FFAA00';
            ctx.beginPath();
            ctx.arc(bCenterX, bCenterY, this.width / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#FF4400';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.globalAlpha = 1;
            ctx.fillText('燃烧', bCenterX, this.y - 8);
            ctx.restore();
        }

        // 绘制机甲类型标识（不受旋转影响）
        const labelCenterX = this.x + this.width / 2;
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.mech.name, labelCenterX, this.y - 5);
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
    }
    
    // 绘制推进器火焰效果 - 火箭风格多喷射口
    drawThrusterFlames(ctx) {
        // 检查是否有移动
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;
        
        // 计算移动方向（相对于机甲本体坐标系）
        const moveAngle = Math.atan2(this.vy, this.vx);
        const machRotation = this.direction * Math.PI / 180; // 机甲旋转角度
        
        // 火箭推进器参数（简化版本）
        let thrusterCount, thrusterSpacing, flameLength, innerWidth, outerWidth;
        
        if (this.isDodging) {
            // 闪避时的双推进器
            thrusterCount = 2;
            thrusterSpacing = 10;
            flameLength = 45;
            innerWidth = 6;
            outerWidth = 12;
        } else {
            // 普通移动时的双推进器
            thrusterCount = 2;
            thrusterSpacing = 8;
            flameLength = 25;
            innerWidth = 4;
            outerWidth = 8;
        }
        
        // 计算推进器方向（相对于机甲本体）
        const relativeAngle = moveAngle - machRotation + Math.PI;
        
        // 绘制多个并排的推进器喷射口
        for (let i = 0; i < thrusterCount; i++) {
            const offsetPerp = (i - (thrusterCount - 1) / 2) * thrusterSpacing;
            
            // 计算垂直于推进方向的偏移
            const perpAngle = relativeAngle + Math.PI / 2;
            const offsetX = Math.cos(perpAngle) * offsetPerp;
            const offsetY = Math.sin(perpAngle) * offsetPerp;
            
            // 推进器喷射口位置
            const startDistance = this.width / 2 + 3;
            const startX = Math.cos(relativeAngle) * startDistance + offsetX;
            const startY = Math.sin(relativeAngle) * startDistance + offsetY;
            
            // 每个推进器的火焰长度有轻微随机变化
            const currentFlameLength = flameLength + (Math.sin(Date.now() * 0.02 + i) * 5);
            const endX = startX + Math.cos(relativeAngle) * currentFlameLength;
            const endY = startY + Math.sin(relativeAngle) * currentFlameLength;
            
            // 绘制外层火焰（橙红色）
            const outerGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            if (this.isDodging) {
                // 闪避时更强烈的橙黄火焰
                outerGradient.addColorStop(0, 'rgba(255, 100, 0, 0.9)');   // 强橙色
                outerGradient.addColorStop(0.3, 'rgba(255, 150, 0, 0.8)'); // 亮橙色
                outerGradient.addColorStop(0.7, 'rgba(255, 200, 100, 0.6)'); // 黄橙色
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            } else {
                // 普通移动时的橙红火焰
                outerGradient.addColorStop(0, 'rgba(255, 69, 0, 0.8)');    // 橙红色
                outerGradient.addColorStop(0.4, 'rgba(255, 140, 0, 0.7)'); // 橙色
                outerGradient.addColorStop(0.8, 'rgba(255, 215, 0, 0.5)'); // 金橙色
                outerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            }
            
            ctx.strokeStyle = outerGradient;
            ctx.lineWidth = outerWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // 绘制内层火焰（白色/黄色核心）
            const coreEndX = startX + Math.cos(relativeAngle) * (currentFlameLength * 0.7);
            const coreEndY = startY + Math.sin(relativeAngle) * (currentFlameLength * 0.7);
            
            const innerGradient = ctx.createLinearGradient(startX, startY, coreEndX, coreEndY);
            if (this.isDodging) {
                // 闪避时的白色高温核心
                innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); // 白色
                innerGradient.addColorStop(0.5, 'rgba(255, 255, 200, 0.8)'); // 淡黄白
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            } else {
                // 普通移动时的黄色核心
                innerGradient.addColorStop(0, 'rgba(255, 255, 150, 0.8)'); // 淡黄色
                innerGradient.addColorStop(0.6, 'rgba(255, 255, 200, 0.6)'); // 更淡黄
                innerGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');   // 透明白
            }
            
            ctx.strokeStyle = innerGradient;
            ctx.lineWidth = innerWidth;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(coreEndX, coreEndY);
            ctx.stroke();
        }
        
        // 添加火焰粒子效果
        this.drawRocketFlameParticles(ctx, moveAngle, machRotation, flameLength);
    }
    
    // 绘制火箭火焰粒子效果
    drawRocketFlameParticles(ctx, moveAngle, machRotation, flameLength) {
        const particleCount = this.isDodging ? 25 : 15;
        const time = Date.now() * 0.01; // 用于动画
        
        // 计算推进器方向
        const relativeAngle = moveAngle - machRotation + Math.PI;
        
        for (let i = 0; i < particleCount; i++) {
            // 粒子在火焰区域内随机分布
            const spreadAngle = (Math.random() - 0.5) * 0.6; // 粒子散布角度
            const particleAngle = relativeAngle + spreadAngle;
            
            // 粒子距离随机分布在火焰长度内
            const distance = this.width / 2 + 8 + Math.random() * (flameLength * 0.8);
            
            // 计算粒子位置
            const x = Math.cos(particleAngle) * distance;
            const y = Math.sin(particleAngle) * distance;
            
            // 根据距离调整粒子颜色和大小
            const distanceRatio = (distance - this.width / 2 - 8) / (flameLength * 0.8);
            const alpha = (Math.sin(time * 2 + i) + 1) * 0.4 * (1 - distanceRatio * 0.7);
            
            // 粒子大小
            const size = (2 + Math.random() * 2) * (1 - distanceRatio * 0.5);
            
            // 火焰粒子颜色 - 根据距离从橙色渐变到黄白色
            let red, green, blue;
            if (distanceRatio < 0.3) {
                // 近处：橙红色
                red = 255;
                green = 100 + distanceRatio * 100;
                blue = 0;
            } else if (distanceRatio < 0.7) {
                // 中间：橙黄色
                red = 255;
                green = 140 + distanceRatio * 80;
                blue = distanceRatio * 100;
            } else {
                // 远处：黄白色
                red = 255;
                green = 255;
                blue = 150 + distanceRatio * 105;
            }
            
            ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
            ctx.fillRect(x - size/2, y - size/2, size, size);
            
            // 添加一些白色高温粒子（核心区域）
            if (Math.random() < 0.2 && distanceRatio < 0.4) {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
            ctx.fillRect(x - 1, y - 1, 2, 2);
            }
        }
    }
    
    // 更新闪避状态
    updateDodge() {
        if (this.isDodging) {
            const now = Date.now();
            if (now - this.dodgeStartTime >= this.dodgeDuration) {
                this.isDodging = false;
                // 闪避结束时重置速度
                this.vx = 0;
                this.vy = 0;
            }
        }
    }
    
    // 检查是否可以闪避
    canDodge() {
        const now = Date.now();
        return !this.isDodging && (now - this.lastDodgeTime >= this.dodgeCooldown);
    }
    
    // 开始闪避
    startDodge() {
        // 确定闪避方向（基于当前移动输入）
        let dodgeX = 0;
        let dodgeY = 0;
        
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            dodgeX = -1;
        }
        if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            dodgeX = 1;
        }
        if (keys['ArrowUp'] || keys['w'] || keys['W']) {
            dodgeY = -1;
        }
        if (keys['ArrowDown'] || keys['s'] || keys['S']) {
            dodgeY = 1;
        }
        
        // 如果没有移动输入，则不能闪避
        if (dodgeX === 0 && dodgeY === 0) {
            return;
        }
        
        // 标准化闪避方向
        const magnitude = Math.sqrt(dodgeX * dodgeX + dodgeY * dodgeY);
        this.dodgeDirection.x = dodgeX / magnitude;
        this.dodgeDirection.y = dodgeY / magnitude;
        
        // 开始闪避
        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = Date.now();
    }
    
    // 获取闪避状态
    getDodgeStatus() {
        if (this.isDodging) {
            return { text: '闪避中...', color: 'white' };
        }
        
        const cooldownRemaining = Math.max(0, this.dodgeCooldown - (Date.now() - this.lastDodgeTime));
        if (cooldownRemaining > 0) {
            return { text: `闪避冷却: ${(cooldownRemaining / 1000).toFixed(1)}秒`, color: '#CC6666' };
        }
        
        return { text: '闪避就绪', color: 'white' };
    }
    
    // 冲刺相关方法已删除
    
    // 切换锁定模式
    toggleLockMode() {
        // 失明状态下禁止切换锁定模式
        if (gameState.playerBlinded) {
            return;
        }
        
        switch (gameState.lockMode) {
            case 'soft':
                gameState.lockMode = 'hard';
                // 硬锁模式：锁定当前目标
                gameState.hardLockTarget = this.findNearestEnemy();
                break;
            case 'hard':
                gameState.lockMode = 'manual';
                // 手动锁模式：清除硬锁目标，设置手动锁定位置
                gameState.hardLockTarget = null;
                gameState.manualLockX = mouse.x;
                gameState.manualLockY = mouse.y;
                break;
            case 'manual':
                gameState.lockMode = 'soft';
                // 软锁模式：清除所有锁定状态
                gameState.hardLockTarget = null;
                gameState.manualLockX = 0;
                gameState.manualLockY = 0;
                break;
        }
    }
    
    // 硬锁模式下切换目标
    switchHardLockTarget() {
        // 失明状态下禁止切换硬锁目标
        if (gameState.playerBlinded) {
            return;
        }
        
        if (gameState.lockMode === 'hard') {
            gameState.hardLockTarget = this.findNearestEnemy();
        }
    }
    
    // 获取锁定模式显示文本
    getLockModeText() {
        switch (gameState.lockMode) {
            case 'soft':
                return '软锁';
            case 'hard':
                return '硬锁';
            case 'manual':
                return '手动锁';
            default:
                return '软锁';
        }
    }
} 