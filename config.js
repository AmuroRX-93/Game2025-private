// 游戏配置
const GAME_CONFIG = {
    WIDTH: window.innerWidth,
    HEIGHT: window.innerHeight,
    ENEMY_SPEED: 2.5
};

// 游戏模式配置（现在只有Boss战模式）
const GAME_MODES = {
    BOSS_BATTLE: {
        name: 'Boss战模式',
        description: '挑战强大的Boss敌人',
        key: 'BOSS_BATTLE',
        color: '#FF4444'
    }
};

// Boss战关卡配置
const BOSS_LEVELS = {
    CRIMSON_KING: {
        id: 'CRIMSON_KING',
        name: '血红之王',
        description: '深红色的恐怖统治者，掌控着黑暗的力量',
        bossClass: 'Boss', // 使用的Boss类
        difficulty: 1,
        color: '#8B0000',
        unlocked: true // 第一关默认解锁
    },
    SUBLIME_MOON: {
        id: 'SUBLIME_MOON',
        name: '冰之姬',
        description: '青蓝色的神秘支配者，散发着冰冷的月光之力',
        bossClass: 'SublimeMoon', // 使用的Boss类
        difficulty: 2,
        color: '#4682B4',
        unlocked: true // 第二关解锁
    },
    STAR_DEVOURER: {
        id: 'STAR_DEVOURER',
        name: '噬星者',
        description: '黑白相间的虚无毁灭者，吞噬一切光明与黑暗',
        bossClass: 'StarDevourer', // 使用的Boss类
        difficulty: 3,
        color: '#000000', // 黑色主色调
        unlocked: true // 第三关解锁
    },
    UGLY_EMPEROR: {
        id: 'UGLY_EMPEROR',
        name: '丑皇',
        description: '丑陋扭曲的混沌统治者，掌控着扭曲与混乱的力量',
        bossClass: 'UglyEmperor', // 使用的Boss类
        difficulty: 4,
        color: '#8B4513', // 棕色主色调
        unlocked: true // 第四关解锁
    }
    // 未来可以添加更多关卡
    // SHADOW_LORD: {
    //     id: 'SHADOW_LORD', 
    //     name: '暗影领主',
    //     description: '隐藏在阴影中的神秘存在',
    //     bossClass: 'ShadowBoss',
    //     difficulty: 2,
    //     color: '#2F2F2F',
    //     unlocked: false
    // }
};

// 机甲配置
const MECH_TYPES = {
    HYBRID: {
        name: '混合机甲',
        speed: 20, // 快速移动
        health: 150, // 生命值
        color: '#8A2BE2', // 紫色
        weaponSlots: {
            leftHand: 1,  // 左手武器槽
            rightHand: 1, // 右手武器槽
            hiddenAbility: 1 // 隐藏机能槽
        },
        defaultWeapons: {
            leftHand: 'gun',    // 左手默认装备枪（远程武器）
            rightHand: 'sword', // 右手默认装备剑（近战武器）
            hiddenAbility: 'pulse_shield' // 隐藏机能默认装备脉冲护盾
        }
    }
};

// 武器配置映射（用于创建武器实例）
// 注意：这个对象将在weapons.js加载后被填充
const WEAPON_TYPES = {}; 