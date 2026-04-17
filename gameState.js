// 游戏状态
const gameState = {
    score: 0,
    totalDamage: 0, // 专门记录总伤害
    gameOver: false,
    paused: false,
    selectedMech: null,
    selectedGameMode: null,
    selectedLevel: null, // 选中的关卡
    showModeSelection: true,
    showLevelSelection: false,
    levelScrollOffset: 0,
    showWeaponConfig: false,
    showMechCustomization: false,
    bossSpawned: false,
    bossKillCount: 0, // Boss击杀计数
    // 武器配置
    weaponConfig: {
        leftHand: 'gun',    // 左手武器：'gun' 或 'sword'
        rightHand: 'sword', // 右手武器：'gun' 或 'sword'
        hiddenAbility: 'pulse_shield', // 隐藏机能：'pulse_shield'
        leftShoulder: 'missile_launcher_15', // 左肩武器：'missile_launcher_15'
        rightShoulder: null // 右肩武器：暂时为空
    },
    // 锁定系统
    lockMode: 'soft', // 'soft' | 'hard' | 'manual'
    hardLockTarget: null, // 硬锁模式的锁定目标
    manualLockX: 0, // 手动锁模式的锁定位置
    manualLockY: 0,
    // 失明系统
    playerBlinded: false, // 玩家是否处于失明状态
    // 胜利系统
    victory: false, // 是否胜利
    victoryBossName: '', // 击败的Boss名称
    // 维修包系统
    repairKits: 3, // 维修包数量
    maxRepairKits: 3, // 最大维修包数量
    // 无敌模式
    invincibleMode: true,
    // 语言设置
    language: 'zh',
    // 游戏简介系统
    showGuide: false,
    guideCategory: null,
    guideSubItem: null,
    guideScrollOffset: 0
};

// 键盘输入状态
const keys = {};

// 鼠标输入状态
const mouse = {
    leftClick: false,
    rightClick: false,
    x: 0,
    y: 0
}; 