// Floating debug panel for tuning Proteus.
//
// Usage: it auto-attaches whenever a Proteus boss exists and shows in the
// top-right of the page. Hidden otherwise. Lets the designer:
//   - toggle debugMode (freeze auto form-switching)
//   - force-switch to halberd / skirmish / turret immediately
//   - inspect live state: current form, dist to player, active move,
//     CDs of every halberd move
//
// Implementation notes:
//   - Pure DOM overlay; lives outside the canvas so it survives resizes.
//   - Polls game.boss every frame via rAF; does nothing if not a Proteus.
//   - Refresh of stat read-outs throttled to ~10Hz to keep paints cheap.

(function () {
    if (typeof window === 'undefined') return;

    let panel = null;
    let stateBox = null;
    let toggleAuto = null;
    let lastUiUpdate = 0;

    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = 'proteus-debug-panel';
        panel.style.cssText = [
            'position:fixed',
            'bottom:12px',
            'right:12px',
            'z-index:9999',
            'background:rgba(8,18,28,0.92)',
            'border:1px solid #7fdfff',
            'border-radius:8px',
            'padding:10px 12px',
            'min-width:220px',
            'color:#d8f0ff',
            'font:12px/1.4 monospace',
            'box-shadow:0 4px 18px rgba(0,0,0,0.6)',
            'user-select:none',
            'pointer-events:auto',
            'display:none'
        ].join(';');

        const title = document.createElement('div');
        title.textContent = 'Proteus Debug';
        title.style.cssText = 'font-weight:bold;color:#7fdfff;margin-bottom:6px;letter-spacing:1px';
        panel.appendChild(title);

        // Auto-switch toggle
        const autoRow = document.createElement('label');
        autoRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;cursor:pointer';
        toggleAuto = document.createElement('input');
        toggleAuto.type = 'checkbox';
        toggleAuto.checked = true; // boss.debugMode default = false → auto ON
        toggleAuto.addEventListener('change', () => {
            const boss = currentProteus();
            if (!boss) return;
            // checkbox checked = AUTO on  = debugMode false
            boss.debugMode = !toggleAuto.checked;
        });
        autoRow.appendChild(toggleAuto);
        const autoLbl = document.createElement('span');
        autoLbl.textContent = 'Auto form-switch';
        autoRow.appendChild(autoLbl);
        panel.appendChild(autoRow);

        // Form picker buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
        const mkBtn = (label, form, accent) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = [
                'flex:1',
                `background:${accent}`,
                'color:#02101a',
                'border:none',
                'border-radius:4px',
                'padding:6px 4px',
                'font:bold 11px monospace',
                'cursor:pointer'
            ].join(';');
            b.addEventListener('click', () => {
                const boss = currentProteus();
                if (!boss) return;
                // Auto OFF when user manually picks a form, otherwise the
                // 20s timer will yank it back.
                boss.debugMode = true;
                if (toggleAuto) toggleAuto.checked = false;
                if (boss.form === form && !boss.reconfiguring) return;
                if (typeof boss._beginReconfigure === 'function') {
                    boss._beginReconfigure(form, Date.now());
                }
            });
            return b;
        };
        btnRow.appendChild(mkBtn('Halberd', 'halberd', '#ffd86b'));
        btnRow.appendChild(mkBtn('Skirmish', 'skirmish', '#a0ffc0'));
        btnRow.appendChild(mkBtn('Turret', 'turret', '#7fdfff'));
        panel.appendChild(btnRow);

        // Reset CDs (fire any move immediately)
        const cdRow = document.createElement('div');
        cdRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset CDs';
        resetBtn.style.cssText = 'flex:1;background:#22384a;color:#d8f0ff;border:1px solid #44607a;border-radius:4px;padding:5px;font:11px monospace;cursor:pointer';
        resetBtn.addEventListener('click', () => {
            const boss = currentProteus();
            if (!boss) return;
            boss.lastHalberdThrustAt = 0;
            boss.lastHalberdSwingAt = 0;
            boss.lastHalberdWaveAt = 0;
            boss.lastSkirmishBlastAt = 0;
            boss.lastSkirmishDashAt = 0;
            boss.lastSkirmishMissileAt = 0;
            boss.lastSkirmishBlinkAt = 0;
            boss.lastSkirmishEmpAt = 0;
            boss.lastSkirmishHealAt = 0;
            boss.lastDroneSwarmAt = 0;
            boss.lastTurretShotAt = 0;
            boss.lastTurretMissileAt = 0;
        });
        cdRow.appendChild(resetBtn);
        panel.appendChild(cdRow);

        // Live state read-out
        stateBox = document.createElement('pre');
        stateBox.style.cssText = 'margin:0;padding:6px;background:rgba(0,0,0,0.35);border-radius:4px;font:11px/1.5 monospace;white-space:pre;color:#bfe8ff';
        panel.appendChild(stateBox);

        document.body.appendChild(panel);
        return panel;
    }

    function currentProteus() {
        if (typeof game === 'undefined' || !game.boss) return null;
        // Identify by shape rather than instanceof so this file doesn't
        // need a hard dependency on the Proteus class load order.
        if (typeof Proteus !== 'undefined' && game.boss instanceof Proteus) {
            return game.boss;
        }
        return null;
    }

    function fmt(ms) {
        if (ms === undefined || ms === null) return '—';
        return ms < 0 ? 'ready' : (ms / 1000).toFixed(1) + 's';
    }

    function tickPanel() {
        requestAnimationFrame(tickPanel);
        const boss = currentProteus();
        if (!boss) {
            if (panel) panel.style.display = 'none';
            return;
        }
        ensurePanel();
        panel.style.display = 'block';
        // Sync Auto checkbox if AI changed debugMode externally.
        if (toggleAuto && toggleAuto.checked === !!boss.debugMode) {
            toggleAuto.checked = !boss.debugMode;
        }
        const now = Date.now();
        if (now - lastUiUpdate < 100) return;
        lastUiUpdate = now;

        const px = game.player ? (game.player.x + game.player.width / 2) : 0;
        const py = game.player ? (game.player.y + game.player.height / 2) : 0;
        const cx = boss.x + boss.width / 2;
        const cy = boss.y + boss.height / 2;
        const dist = Math.round(Math.hypot(px - cx, py - cy));

        const active = boss.activeThrust ? 'thrust'
                     : boss.activeSwing ? 'swing'
                     : boss.activeWave ? 'wave'
                     : boss.activeDash ? 'dash'
                     : '—';

        const since = (last, cd) => (last === 0 ? -1 : Math.max(0, cd - (now - last)));
        const lines = [
            `form    : ${boss.form}${boss.reconfiguring ? ' → ' + boss.targetForm : ''}`,
            `dist    : ${dist}px`,
            `active  : ${active}`,
            `dwell   : ${((now - boss.formEnteredAt) / 1000).toFixed(1)}s`,
            `--- halberd CDs ---`,
            `thrust  : ${fmt(since(boss.lastHalberdThrustAt, 900))}  band <220`,
            `swing   : ${fmt(since(boss.lastHalberdSwingAt, 1700))}  band <220`,
            `wave    : ${fmt(since(boss.lastHalberdWaveAt, 4500))}  band >200`,
            `--- shield ---`,
            `active  : ${!!boss.shieldActive}`,
            `hp      : ${Math.round(boss.shieldHp || 0)}/${boss.shieldMaxHp || 0}`
        ];
        stateBox.textContent = lines.join('\n');
    }

    requestAnimationFrame(tickPanel);
})();
