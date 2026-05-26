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

        // 1) Filled sweep fan behind the blade (soft plasma green afterimage).
        // Drawn with normal compositing so multiple overlapping slashes
        // can't accumulate to white.
        ctx.globalCompositeOperation = 'source-over';
        const sweepAlpha = (0.18 - progress * 0.12);
        if (sweepAlpha > 0) {
            const fanGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.range);
            fanGrad.addColorStop(0, `rgba(180,240,210,${sweepAlpha * 1.2})`);
            fanGrad.addColorStop(0.6, `rgba(60,200,150,${sweepAlpha * 0.7})`);
            fanGrad.addColorStop(1, 'rgba(20,140,100,0)');
            ctx.fillStyle = fanGrad;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, this.range, startAngleRad, currentAngleRad);
            ctx.closePath();
            ctx.fill();
        }

        // 2) Curved blade arc trail removed by request — the procedural
        // flame body alone reads cleanly without an extra circular trail.

        // 3) Current blade body — flame-shaped plasma blade.
        const bladeAlpha = 1 - progress * 0.6;
        this.drawFlameBlade(ctx, cx, cy, tipX, tipY, currentAngleRad, bladeAlpha, elapsed);

        // 4) Tip plasma ball — additive but with a lower-saturation core
        // so it doesn't blow out when overlapped with bloom layers.
        ctx.globalCompositeOperation = 'lighter';
        const tipPulse = 0.8 + 0.2 * Math.sin(elapsed * 0.05);
        const tipR = (this.slashWidth * 1.3) * tipPulse;
        const tipGrad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tipR * 2);
        tipGrad.addColorStop(0, `rgba(180,240,210,${0.55 * bladeAlpha})`);
        tipGrad.addColorStop(0.5, `rgba(80,210,170,${0.35 * bladeAlpha})`);
        tipGrad.addColorStop(1, 'rgba(20,160,120,0)');
        ctx.fillStyle = tipGrad;
        ctx.beginPath(); ctx.arc(tipX, tipY, tipR * 2, 0, Math.PI * 2); ctx.fill();

        // 5) Plasma motes flying off the blade tip
        if (typeof bossFX !== 'undefined' && Math.random() < 0.55 && progress < 0.95) {
            const sp = 2 + Math.random() * 3;
            const ang = currentAngleRad + (Math.random() - 0.5) * 1.4;
            bossFX.particles.push({
                x: tipX, y: tipY,
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                size: 1.2 + Math.random() * 1.6,
                color: Math.random() < 0.5 ? '#d8ffe8' : '#5fffb0',
                lifeMs: 220 + Math.random() * 200,
                gravity: 0,
                drag: 0.9,
                alpha: 0.9,
                startedAt: Date.now()
            });
        }

        ctx.restore();
    }

    // Draw a stylized plasma-flame blade from (cx, cy) to (tipX, tipY).
    // The shape is built procedurally from a centerline + a "thickness
    // profile" (fattest near the hilt, sharp at the tip) modulated by
    // a couple of sin waves so the silhouette wobbles like a live flame.
    // We render four passes (outer halo, mid body, hot core, white spine)
    // plus a few leaping tongues to break the silhouette and read as
    // "fire", not "lightsaber".
    drawFlameBlade(ctx, cx, cy, tipX, tipY, ang, bladeAlpha, elapsed) {
        SwordSlash.renderFlameBlade(ctx, {
            cx, cy, tipX, tipY, ang, bladeAlpha, elapsed,
            baseW: (this.slashWidth || 8) + 4,
            seed: this.startTime
        });
    }

    // Static, stateless flame-blade renderer so dash/idle/whatever
    // visuals can share the exact same blade silhouette as the slash.
    static renderFlameBlade(ctx, opts) {
        const { cx, cy, tipX, tipY, ang, bladeAlpha, elapsed, baseW, seed } = opts;
        if (bladeAlpha <= 0.02) return;
        const dx = tipX - cx, dy = tipY - cy;
        const length = Math.hypot(dx, dy);
        if (length < 4) return;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);

        const ph = elapsed * 0.012 + (seed % 1000) * 0.001;

        // Sample N points along the blade and compute upper/lower edges.
        // Thickness profile peaks ~25% from the hilt, then tapers to 0
        // at the tip. Two-octave sine wobble breaks the outline.
        const N = 26;
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            const x = u * length;
            const profile = (0.18 + 4.2 * u * Math.pow(1 - u, 1.4)) * baseW;
            const wob1 = Math.sin(u * 9 + ph * 3.4) * 0.35;
            const wob2 = Math.sin(u * 17 - ph * 5.1) * 0.18;
            const wob3 = Math.sin(u * 4 + ph * 1.6) * 0.25;
            const upper = -profile * (1 + wob1 + wob2);
            const lower =  profile * (1 + wob3 - wob2);
            pts.push({ x, upper, lower });
        }
        pts[0].upper = -baseW * 0.18;
        pts[0].lower =  baseW * 0.18;
        pts[N].upper = 0;
        pts[N].lower = 0;

        const tracePath = (offset) => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].upper - offset);
            for (let i = 1; i < pts.length; i++) {
                const p = pts[i];
                const pp = pts[i - 1];
                const mx = (pp.x + p.x) / 2;
                const my = ((pp.upper - offset) + (p.upper - offset)) / 2;
                ctx.quadraticCurveTo(pp.x, pp.upper - offset, mx, my);
            }
            ctx.lineTo(pts[N].x, pts[N].upper - offset);
            ctx.lineTo(pts[N].x + offset * 1.2, 0);
            ctx.lineTo(pts[N].x, pts[N].lower + offset);
            for (let i = pts.length - 2; i >= 0; i--) {
                const p = pts[i];
                const pn = pts[i + 1];
                const mx = (pn.x + p.x) / 2;
                const my = ((pn.lower + offset) + (p.lower + offset)) / 2;
                ctx.quadraticCurveTo(pn.x, pn.lower + offset, mx, my);
            }
            ctx.closePath();
        };

        // ---- Soft outer bloom (additive). Only the bloom uses
        // 'lighter' so we get a halo glow, but the actual blade body
        // is drawn with normal compositing to prevent runaway additive
        // saturation when many slashes/ghosts overlap.
        ctx.globalCompositeOperation = 'lighter';

        // Soft outer bloom: a wide, soft halo for the "逸散感". Alpha
        // values kept low so multiple overlapping blades don't
        // accumulate into pure white.
        const bloomOffset = baseW * 1.6;
        const bloomGrad = ctx.createLinearGradient(0, -bloomOffset, 0, bloomOffset);
        bloomGrad.addColorStop(0,    'rgba(20,140,110,0)');
        bloomGrad.addColorStop(0.25, `rgba(40,180,140,${0.10 * bladeAlpha})`);
        bloomGrad.addColorStop(0.5,  `rgba(80,200,160,${0.16 * bladeAlpha})`);
        bloomGrad.addColorStop(0.75, `rgba(40,180,140,${0.10 * bladeAlpha})`);
        bloomGrad.addColorStop(1,    'rgba(20,140,110,0)');
        ctx.fillStyle = bloomGrad;
        tracePath(bloomOffset);
        ctx.fill();

        // Second softer bloom pass.
        const bloom2 = baseW * 1.05;
        const bloomGrad2 = ctx.createLinearGradient(0, -bloom2, 0, bloom2);
        bloomGrad2.addColorStop(0,   'rgba(20,160,120,0)');
        bloomGrad2.addColorStop(0.5, `rgba(80,210,170,${0.22 * bladeAlpha})`);
        bloomGrad2.addColorStop(1,   'rgba(20,160,120,0)');
        ctx.fillStyle = bloomGrad2;
        tracePath(bloom2);
        ctx.fill();

        // From here on draw the blade body OPAQUELY — no additive
        // accumulation. This is what stops the "screen flashes pure
        // white" issue when many bright layers stack up.
        ctx.globalCompositeOperation = 'source-over';

        // ---- Outer halo: deep teal-cyan ----
        ctx.globalAlpha = 0.55 * bladeAlpha;
        tracePath(baseW * 0.55);
        ctx.fillStyle = '#0e90b0';
        ctx.fill();

        // ---- Mid body: aqua-green plasma ----
        ctx.globalAlpha = 0.85 * bladeAlpha;
        tracePath(baseW * 0.18);
        ctx.fillStyle = '#30e8b0';
        ctx.fill();

        // ---- Hot core: pale mint-green (NOT pure white to avoid
        // saturation when overlapped with bloom). ----
        ctx.globalAlpha = 0.95 * bladeAlpha;
        tracePath(-baseW * 0.10);
        ctx.fillStyle = '#a8f0d0';
        ctx.fill();

        // Bright spine — pale, not pure white, drawn opaquely so it
        // can't accumulate.
        ctx.globalAlpha = bladeAlpha;
        ctx.strokeStyle = '#e0fff0';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, baseW * 0.35);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i];
            const wob = Math.sin(p.x * 0.06 + ph * 4.2) * baseW * 0.18 * (1 - i / N);
            ctx.lineTo(p.x, wob);
        }
        ctx.stroke();

        // Tongues + streaks + motes are all drawn additively (lighter)
        // but with very low per-layer alpha so total accumulation stays
        // under control even when many slashes overlap.
        ctx.globalCompositeOperation = 'lighter';

        // Leaping tongues — short curls peeling off the silhouette so it
        // doesn't read as a clean flame body. More tongues + wider range
        // for a more alive, dancing look.
        const tongueCount = 9;
        for (let k = 0; k < tongueCount; k++) {
            const u = 0.10 + 0.85 * ((k * 0.137 + ph * 0.18) % 1);
            const idx = Math.min(pts.length - 1, Math.floor(u * pts.length));
            const p = pts[idx];
            const side = (k % 2 === 0) ? 1 : -1;
            const root = side > 0 ? p.lower : p.upper;
            const tipOff = baseW * (0.55 + 0.85 * Math.abs(Math.sin(ph * 3.2 + k * 1.3)));
            const curl = (Math.sin(ph * 4.4 + k * 1.7)) * baseW * 0.7;
            const tx = p.x + curl * 0.5;
            const ty = root + side * tipOff;
            ctx.globalAlpha = 0.22 * bladeAlpha * (0.55 + 0.45 * Math.abs(Math.sin(ph * 5 + k)));
            ctx.fillStyle = side > 0 ? '#7fdfb0' : '#30c8a0';
            ctx.beginPath();
            ctx.moveTo(p.x - baseW * 0.3, root);
            ctx.quadraticCurveTo(p.x + baseW * 0.1, root + side * baseW * 0.45, tx, ty);
            ctx.quadraticCurveTo(p.x + baseW * 0.05, root + side * baseW * 0.18, p.x + baseW * 0.3, root);
            ctx.closePath();
            ctx.fill();
        }

        // Flowing light streaks along the blade — bright streaks that
        // travel from hilt to tip every cycle. This is what gives the
        // blade a clear "energy is moving through it" feel rather than
        // a static glow.
        const streakCount = 3;
        for (let s = 0; s < streakCount; s++) {
            const phase = (ph * 0.45 + s / streakCount) % 1;
            const sx = phase * length;
            const sIdx = Math.min(pts.length - 1, Math.floor(phase * pts.length));
            const sp = pts[sIdx];
            const sw = baseW * 0.6 * Math.sin(phase * Math.PI);
            if (sw <= 0) continue;
            const sg = ctx.createRadialGradient(sx, 0, 0, sx, 0, sw * 2.2);
            sg.addColorStop(0, `rgba(200,255,220,${0.35 * bladeAlpha})`);
            sg.addColorStop(0.5, `rgba(110,230,180,${0.18 * bladeAlpha})`);
            sg.addColorStop(1, 'rgba(40,200,140,0)');
            ctx.fillStyle = sg;
            ctx.globalAlpha = bladeAlpha;
            ctx.beginPath();
            ctx.ellipse(sx, 0, sw * 2.2, Math.max(2, (sp.lower - sp.upper) * 0.7), 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Tiny aqua/white plasma motes shedding off the blade body.
        if (Math.random() < 0.85) {
            const moteCount = 3;
            for (let s = 0; s < moteCount; s++) {
                const u = Math.random();
                const idx = Math.floor(u * pts.length);
                const p = pts[idx];
                const side = Math.random() < 0.5 ? -1 : 1;
                const yEdge = side > 0 ? p.lower : p.upper;
                const ex = p.x + (Math.random() - 0.5) * baseW * 0.4;
                const ey = yEdge + side * Math.random() * baseW * 1.0;
                const r = 1.4 + Math.random() * 1.4;
                const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 1.8);
                grad.addColorStop(0, `rgba(180,240,210,${0.55 * bladeAlpha})`);
                grad.addColorStop(1, 'rgba(40,200,140,0)');
                ctx.fillStyle = grad;
                ctx.globalAlpha = bladeAlpha;
                ctx.beginPath();
                ctx.arc(ex, ey, r * 1.8, 0, Math.PI * 2);
                ctx.fill();
            }
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
                color: Math.random() < 0.5 ? '#9fffc8' : '#5fffb0'
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

        // 1) Wide sweep fan behind the blade — same plasma green as the
        // standard beam saber, just covering a much bigger area.
        ctx.globalCompositeOperation = 'source-over';
        const sweepAlpha = 0.22 * (1 - progress * 0.3);
        const fanGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.range);
        fanGrad.addColorStop(0,    `rgba(180,240,210,${sweepAlpha * 1.2})`);
        fanGrad.addColorStop(0.55, `rgba(60,200,150,${sweepAlpha * 0.8})`);
        fanGrad.addColorStop(1,    'rgba(20,140,100,0)');
        ctx.fillStyle = fanGrad;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, this.range, startAngleRad, currentAngleRad);
        ctx.closePath();
        ctx.fill();

        // 2) Plasma flame blade — identical to the standard beam saber
        // (SwordSlash) but rendered with a much bigger baseW so it
        // reads as an oversized greatsword version of the same weapon.
        if (typeof SwordSlash !== 'undefined' && SwordSlash.renderFlameBlade) {
            SwordSlash.renderFlameBlade(ctx, {
                cx, cy,
                tipX: endX, tipY: endY,
                ang: currentAngleRad,
                bladeAlpha,
                elapsed,
                baseW: this.slashWidth + 8,
                seed: this.startTime
            });
        }

        // 3) Tip plasma ball — additive but desaturated so it doesn't
        // blow out when overlapping with the bloom layer.
        ctx.globalCompositeOperation = 'lighter';
        const tipPulse = 0.7 + 0.3 * Math.sin(elapsed * 0.02);
        const tipR = (this.slashWidth * 1.5) * tipPulse;
        const tipGrad = ctx.createRadialGradient(endX, endY, 0, endX, endY, tipR * 2);
        tipGrad.addColorStop(0,   `rgba(180,240,210,${0.6 * bladeAlpha})`);
        tipGrad.addColorStop(0.5, `rgba(80,210,170,${0.35 * bladeAlpha})`);
        tipGrad.addColorStop(1,   'rgba(20,160,120,0)');
        ctx.fillStyle = tipGrad;
        ctx.beginPath(); ctx.arc(endX, endY, tipR * 2, 0, Math.PI * 2); ctx.fill();

        // 4) Float particles — recolored to plasma green to match.
        for (const p of this.particles) {
            ctx.globalAlpha = p.life * 0.5;
            const pGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            pGrad.addColorStop(0, p.color);
            pGrad.addColorStop(1, 'rgba(40,200,140,0)');
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}