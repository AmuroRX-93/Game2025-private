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

        // Slow status (movement-only debuff, e.g. SublimeMoon's spin slash)
        this.slowEndTime = 0;
        this.slowMultiplier = 1; // <1 means slowed; resets to 1 when expired
        
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
        
        // Overdrive Burst (hidden ability): outgoing dmg ×3, move speed ×3,
        // incoming dmg ×2. Color turns red and afterimages trail behind.
        this.outgoingDamageMultiplier = 1;
        this.incomingDamageMultiplier = 1;
        this.overdriveActive = false;
        this.overdriveEndTime = 0;
        this.afterimages = []; // [{x, y, dir, life, maxLife}]
        
        // Repair Protocol (hidden ability): regen + speed buff at the cost of
        // being unable to attack. Excess regen banks "overflow HP" used as a
        // damage buffer beyond max health.
        this.repairProtocolActive = false;
        this.repairProtocolEndTime = 0;
        this.overflowHp = 0;
        this.overflowHpMax = 0;
        
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
        const allEnemies = game.enemies.filter(e => !e.notTargetable);
        if (game.boss && !game.boss.notTargetable) {
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
            // Yukikon shadow clones — surface them as targetable decoys so
            // the player's auto-aim is forced onto a clone while they're up.
            // They live on the boss (not in game.enemies) so weapons can't
            // damage them; the clones simply yank attention.
            if (typeof Yukikon !== 'undefined' && game.boss instanceof Yukikon &&
                game.boss.shadowActive && Array.isArray(game.boss.clones)) {
                for (const c of game.boss.clones) {
                    if (c && !c.shouldDestroy) allEnemies.push(c);
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
                    if (game.enemies.includes(gameState.hardLockTarget) &&
                        !gameState.hardLockTarget.notTargetable) {
                        targetValid = true;
                    }
                    else if (game.boss && gameState.hardLockTarget === game.boss) {
                        // Boss-level untargetable flag (e.g. HiveMind ghost mode)
                        if (game.boss.notTargetable) {
                            targetValid = false;
                        }
                        // 噬星者失明技能激活时不可锁定
                        else if (game.boss instanceof StarDevourer &&
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
        
        // Repair Protocol locks out offensive actions in exchange for regen.
        if (this.repairProtocolActive) return false;
        
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
            // Expire slow if its window passed.
            if (this.slowMultiplier !== 1 && Date.now() >= this.slowEndTime) {
                this.slowMultiplier = 1;
            }
            const burnMul = this.burning ? this.burnSpeedMultiplier : 1;
            const overdriveMul = this.overdriveActive ? 3 : 1;
            const repairMul = this.repairProtocolActive ? 1.5 : 1;
            const moveSpeed = this.speed * burnMul * this.slowMultiplier * overdriveMul * repairMul;
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
        
        this.updateOverdrive();
        
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
        if (this.repairProtocolActive) return;
        if (this.leftShoulderWeapon) {
            this.leftShoulderWeapon.use(this);
        }
    }
    
    // 使用右肩武器
    useRightShoulderWeapon() {
        if (this.repairProtocolActive) return;
        if (this.rightShoulderWeapon) {
            this.rightShoulderWeapon.use(this);
        }
    }
    
    // 使用超级武器（Q键或E键都可以触发）
    useSuperWeapon() {
        if (this.repairProtocolActive) return;
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
        
        // Overdrive Burst: incoming damage amplified
        if (this.incomingDamageMultiplier && this.incomingDamageMultiplier !== 1) {
            damage = Math.max(1, Math.round(damage * this.incomingDamageMultiplier));
        }
        
        // 检查护盾减伤
        let actualDamage = damage;
        if (this.hiddenAbilityWeapon && this.hiddenAbilityWeapon.isDamageReduced && this.hiddenAbilityWeapon.isDamageReduced()) {
            const reduction = this.hiddenAbilityWeapon.getDamageReduction();
            // Full immunity (reduction >= 1) skips the damage entirely instead
            // of being clamped to the 1-damage minimum below.
            if (reduction >= 1) {
                return;
            }
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
        // Overflow HP (Repair Protocol bank) eats damage first.
        if (this.overflowHp > 0 && actualDamage > 0) {
            const absorbed = Math.min(this.overflowHp, actualDamage);
            this.overflowHp -= absorbed;
            actualDamage -= absorbed;
        }
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
        if (this.stunned) return;
        
        // 月光大剑释放期间免疫控制
        const weapons = this.getAllWeapons();
        if (weapons.some(w => w.type === 'moonlight_greatsword' && w.isAttacking)) return;
        
        this.stunned = true;
        this.stunEndTime = Date.now() + duration;
        this.vx = 0;
        this.vy = 0;
    }

    // Apply a movement slow. multiplier should be in (0, 1]; lower = slower.
    // Stronger or longer pending slows take precedence over weaker active ones.
    applySlow(duration = 1500, multiplier = 0.55) {
        const now = Date.now();
        const newEnd = now + duration;
        const currentlyActive = now < this.slowEndTime && this.slowMultiplier < 1;
        if (!currentlyActive || multiplier < this.slowMultiplier) {
            this.slowMultiplier = multiplier;
        }
        if (newEnd > this.slowEndTime) this.slowEndTime = newEnd;
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
    
    // Overdrive Burst lifecycle: spawn afterimages while active, expire flags when window ends.
    updateOverdrive() {
        const now = Date.now();
        // Tick afterimages regardless of active state so trails fade out cleanly.
        if (this.afterimages.length > 0) {
            for (const a of this.afterimages) a.life -= 16;
            this.afterimages = this.afterimages.filter(a => a.life > 0);
        }
        if (!this.overdriveActive) return;
        if (now >= this.overdriveEndTime) {
            this.overdriveActive = false;
            this.outgoingDamageMultiplier = 1;
            this.incomingDamageMultiplier = 1;
            return;
        }
        // Spawn an afterimage every ~50ms while moving.
        if (!this._lastAfterimageAt || now - this._lastAfterimageAt > 50) {
            this._lastAfterimageAt = now;
            this.afterimages.push({
                x: this.x,
                y: this.y,
                w: this.width,
                h: this.height,
                dir: this.direction,
                life: 320,
                maxLife: 320
            });
            if (this.afterimages.length > 18) this.afterimages.shift();
        }
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
        // Overdrive afterimages (drawn behind the body)
        if (this.afterimages && this.afterimages.length > 0) {
            for (const a of this.afterimages) {
                const t = Math.max(0, a.life / a.maxLife);
                ctx.save();
                ctx.globalAlpha = 0.18 + 0.4 * t;
                ctx.globalCompositeOperation = 'lighter';
                ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
                ctx.rotate(a.dir * Math.PI / 180);
                ctx.fillStyle = '#ff2030';
                ctx.shadowColor = '#ff4040';
                ctx.shadowBlur = 18;
                ctx.fillRect(-a.w / 2, -a.h / 2, a.w, a.h);
                ctx.restore();
            }
        }

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
        else if (this.overdriveActive) {
            // Pulsing crimson while in Overdrive Burst.
            const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.02);
            bodyColor = '#ff2030';
            ctx.shadowColor = '#ff4040';
            ctx.shadowBlur = 22 * pulse;
        }
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

        // Frostbite slow VFX — pale-blue aura ring while slowMultiplier < 1.
        if (this.slowMultiplier < 1 && Date.now() < this.slowEndTime) {
            ctx.save();
            const sCenterX = this.x + this.width / 2;
            const sCenterY = this.y + this.height / 2;
            const t = Date.now() * 0.005;
            const ringR = this.width / 2 + 4 + Math.sin(t) * 1.2;
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(sCenterX, sCenterY, ringR * 0.4, sCenterX, sCenterY, ringR + 4);
            grad.addColorStop(0, 'rgba(160, 220, 255, 0)');
            grad.addColorStop(0.7, 'rgba(120, 200, 255, 0.45)');
            grad.addColorStop(1, 'rgba(80, 160, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sCenterX, sCenterY, ringR + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = '#aee0ff';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(sCenterX, sCenterY, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // 燃烧状态视觉效果
        if (this.burning) {            ctx.save();
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
            ctx.fillText(t('boss.burn'), bCenterX, this.y - 8);
            ctx.restore();
        }

        // 绘制机甲类型标识（不受旋转影响）
        const labelCenterX = this.x + this.width / 2;
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(t('mech.' + this.mechType), labelCenterX, this.y - 5);
        
        // 绘制受击提示
        this.drawHitIndicators(ctx);
    }
    
    // Thruster flames (multi-layer additive flame via shared drawJetFlame).
    // Called inside the already-translated/rotated mech-local coordinate space.
    drawThrusterFlames(ctx) {
        const isMoving = this.vx !== 0 || this.vy !== 0;
        if (!isMoving) return;

        const moveAngle = Math.atan2(this.vy, this.vx);
        const machRotation = this.direction * Math.PI / 180;
        // Direction the flame points (away from movement, in mech-local space)
        const relAngle = moveAngle - machRotation + Math.PI;

        const dodging = !!this.isDodging;
        const intensity = dodging ? 1.0 : 0.65;
        const length = dodging ? 52 : 30;
        const width = dodging ? 16 : 11;
        const thrusterCount = 2;
        const thrusterSpacing = dodging ? 11 : 9;

        const startDistance = this.width / 2 + 3;
        const perpAngle = relAngle + Math.PI / 2;
        for (let i = 0; i < thrusterCount; i++) {
            const offsetPerp = (i - (thrusterCount - 1) / 2) * thrusterSpacing;
            const ox = Math.cos(relAngle) * startDistance + Math.cos(perpAngle) * offsetPerp;
            const oy = Math.sin(relAngle) * startDistance + Math.sin(perpAngle) * offsetPerp;
            drawJetFlame(ctx, {
                originX: ox,
                originY: oy,
                angle: relAngle,
                length, width,
                intensity,
                scheme: dodging ? 'orange' : 'orange',
                spawnEmbers: true,
                emberDensity: dodging ? 0.85 : 0.45,
                id: i + (dodging ? 10 : 0)
            });
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
        // Dodge speed = 400% of the player's current effective move speed
        // (was 200%, doubled per request). Captured at activation so any
        // active multipliers (overdrive / repair / burn / slow) carry
        // through into the dodge.
        const burnMul = this.burning ? this.burnSpeedMultiplier : 1;
        const overdriveMul = this.overdriveActive ? 3 : 1;
        const repairMul = this.repairProtocolActive ? 1.5 : 1;
        const currentMoveSpeed = this.speed * burnMul * this.slowMultiplier * overdriveMul * repairMul;
        this.dodgeSpeed = currentMoveSpeed * 4;

        this.isDodging = true;
        this.dodgeStartTime = Date.now();
        this.lastDodgeTime = Date.now();
    }
    
    // 获取闪避状态
    getDodgeStatus() {
        if (this.isDodging) {
            return { text: t('player.dodging'), color: 'white' };
        }
        
        const cooldownRemaining = Math.max(0, this.dodgeCooldown - (Date.now() - this.lastDodgeTime));
        if (cooldownRemaining > 0) {
            return { text: t('player.dodgeCooldown', (cooldownRemaining / 1000).toFixed(1)), color: '#CC6666' };
        }
        
        return { text: t('player.dodgeReady'), color: 'white' };
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
                return t('player.softLock');
            case 'hard':
                return t('player.hardLock');
            case 'manual':
                return t('player.manualLock');
            default:
                return t('player.softLock');
        }
    }
} 