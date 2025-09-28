// 游戏对象基类
class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    // 边界检查
    checkBounds() {
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > GAME_CONFIG.WIDTH) {
            this.x = GAME_CONFIG.WIDTH - this.width;
        }
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > GAME_CONFIG.HEIGHT) {
            this.y = GAME_CONFIG.HEIGHT - this.height;
        }
    }

    // 碰撞检测
    collidesWith(other) {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

// 子弹类
class Bullet extends GameObject {
    constructor(x, y, direction, speed, damage, range) {
        super(x, y, 4, 4, '#FFD700');
        this.direction = direction;
        this.speed = speed;
        this.damage = damage;
        this.maxRange = range;
        this.distanceTraveled = 0;
        this.startX = x;
        this.startY = y;
        
        // 根据角度设置速度
        const angleRad = direction * Math.PI / 180;
        this.vx = Math.cos(angleRad) * speed;
        this.vy = Math.sin(angleRad) * speed;
    }
    
    update() {
        super.update();
        
        // 计算移动距离
        this.distanceTraveled = Math.sqrt(
            Math.pow(this.x - this.startX, 2) + 
            Math.pow(this.y - this.startY, 2)
        );
        
        // 超出射程或边界则标记为销毁
        if (this.distanceTraveled > this.maxRange || 
            this.x < 0 || this.x > GAME_CONFIG.WIDTH ||
            this.y < 0 || this.y > GAME_CONFIG.HEIGHT) {
            this.shouldDestroy = true;
        }
    }
    
    draw(ctx) {
        super.draw(ctx);
        
        // 绘制子弹轨迹
        ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.fillRect(this.x - 1, this.y - 1, 6, 6);
    }
} 