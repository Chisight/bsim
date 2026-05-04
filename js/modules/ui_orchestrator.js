/**
 * UI Orchestrator v1.26.01
 * [AUDIT: v1.26.01 | SEC_ARCH_LEAD] - Isolated UI rendering and orchestration from simulation core.
 */
const UIOrchestrator = {
    /**
     * Updates the visual representation of a node in the DOM.
     * @param {Object} sim - The simulator instance.
     * @param {Object} n - The node to update.
     */
    updateNodeVisual(sim, n) {
        const el = document.getElementById(n.id); if (!el) return;
        
        // [AUDIT: v1.26.20 | SEC_ARCH_LEAD] - Decoupled strict geometric pin bounds to permit independent macro chassis down-scaling regardless of terminal count.
        if (n.customWidth) { el.style.width = n.customWidth + 'px'; el.style.minWidth = n.customWidth + 'px'; }
        if (n.customHeight) { el.style.height = n.customHeight + 'px'; el.style.minHeight = n.customHeight + 'px'; }

        if (n.portY !== undefined || n.portH !== undefined || n.pinOffsets || n.pinScaleFactor) {
            const py = n.portY !== undefined ? n.portY : 24;
            const ph = n.portH !== undefined ? n.portH : (n.customHeight || parseInt(el.style.height) || 64) - 30;
            
            if (n.type === 'RAM') {
                const aBits = n.addressPins || 4;
                const dBits = 8;
                const leftPins = aBits + 1;
                const rightPins = dBits;
                const strideL = leftPins > 1 ? ph / (leftPins - 1) : 0;
                const strideR = rightPins > 1 ? ph / (rightPins - 1) : 0;
                
                const applyPin = (p) => {
                    const pid = p.dataset.port;
                    if (!pid) return;
                    // [AUDIT: v1.26.20 | SEC_ARCH_LEAD] - Apply dynamic parametric scaling and unhinged offsets to absolute terminal logic.
                    const scale = n.pinScaleFactor || 1;
                    const cStrideR = strideR * scale;
                    const cStrideL = strideL * scale;
                    const pOff = (n.pinOffsets && n.pinOffsets[pid]) || { x: 0, y: 0 };
                    
                    if (pid.startsWith('out')) {
                        const idx = parseInt(pid.replace('out',''));
                        const vIdx = (dBits - 1) - idx; 
                        p.style.top = (py + vIdx * cStrideR + pOff.y) + 'px';
                        if (pOff.x) p.style.left = pOff.x + 'px';
                    } else if (pid.startsWith('din')) {
                        const idx = parseInt(pid.replace('din',''));
                        const vIdx = (dBits - 1) - idx;
                        p.style.top = (py + vIdx * cStrideR + pOff.y) + 'px';
                        if (pOff.x) p.style.left = pOff.x + 'px';
                    } else if (pid === 'we') {
                        p.style.top = (py + aBits * cStrideL + pOff.y) + 'px';
                        if (pOff.x) p.style.left = pOff.x + 'px';
                    } else if (pid.startsWith('in')) {
                        const idx = parseInt(pid.replace('in',''));
                        const vIdx = (aBits - 1) - idx;
                        p.style.top = (py + vIdx * cStrideL + pOff.y) + 'px';
                        if (pOff.x) p.style.left = pOff.x + 'px';
                    }
                };
                el.querySelectorAll('.port').forEach(applyPin);
            } else {
                const alignPorts = (selector) => {
                    const ports = Array.from(el.querySelectorAll(selector));
                    const total = ports.length;
                    if (total === 0) return;
                    ports.forEach((p, i) => {
                        const topPct = total === 1 ? 0.5 : ((i + 0.5) / total);
                        p.style.top = (py + topPct * ph) + 'px';
                    });
                };
                alignPorts('.port.input');
                alignPorts('.port.output');
            }
        }

        if (n.portLabelX !== undefined) {
            el.querySelectorAll('.port.input > .port-label, .port.input .port-meta').forEach(l => l.style.left = n.portLabelX + 'px');
            el.querySelectorAll('.port.output > .port-label, .port.output .port-meta').forEach(l => l.style.right = n.portLabelX + 'px');
        }

        const lblCont = el.querySelector('.gate-label');
        if (lblCont && (n.labelX !== undefined || n.labelW !== undefined)) {
            lblCont.style.position = 'absolute';
            lblCont.style.margin = '0';
            if (n.labelX !== undefined) lblCont.style.left = n.labelX + 'px';
            if (n.labelY !== undefined) lblCont.style.top = n.labelY + 'px';
            if (n.labelW !== undefined) lblCont.style.width = n.labelW + 'px';
            if (n.labelH !== undefined) {
                lblCont.style.height = n.labelH + 'px';
                lblCont.style.fontSize = Math.max(8, Math.min(n.labelH * 0.6, (n.customHeight || parseInt(el.style.height) || 64) * 0.5)) + 'px';
                lblCont.style.lineHeight = (n.labelH - 8) + 'px';
            }
        }
        if (lblCont && n.labelSize !== undefined) {
            lblCont.style.fontSize = n.labelSize + 'px';
        }

        const bits = parseInt(n.type.split('-')[1]) || 1;
        if (bits >= 4) {
            const valArr = Array.isArray(n.val) ? n.val : (Array.isArray(n.state) ? n.state : [n.val]);
            const paddedArr = [...valArr];
            while (paddedArr.length < bits) paddedArr.push(0);

            const val = paddedArr.reduce((acc, b, i) => acc | ((b === 1 ? 1 : 0) << i), 0);
            
            if (!sim._domCacheMap) sim._domCacheMap = new Map();
            let cache = sim._domCacheMap.get(n.id);
            if (cache && cache.dec && !document.body.contains(cache.dec)) cache = null;
            
            if (!cache) {
                cache = {
                    dec: el.querySelector('.dec'),
                    hex: el.querySelector('.hex'),
                    bin: el.querySelector('.bin'),
                    dots: el.querySelectorAll('.bit-dot')
                };
                sim._domCacheMap.set(n.id, cache);
            }
            
            if (cache.dec) cache.dec.innerText = `D: ${val}`;
            if (cache.hex) cache.hex.innerText = `H: ${val.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')}`;
            if (cache.bin) cache.bin.innerText = `B: ${val.toString(2).padStart(bits, '0')}`;
            
            if (cache.dots) {
                cache.dots.forEach(dot => {
                    const bIdx = parseInt(dot.getAttribute('data-bit'));
                    dot.classList.toggle('on', paddedArr[bIdx] === 1);
                    dot.classList.toggle('off', paddedArr[bIdx] === 0 || paddedArr[bIdx] === null || paddedArr[bIdx] === 'Z');
                });
                const pinCont = el.querySelector('.pin-container');
                if (pinCont && (n.pinX !== undefined || n.pinW !== undefined)) {
                    pinCont.style.transform = 'none';
                    if (n.pinX !== undefined) pinCont.style.left = n.pinX + 'px';
                    if (n.pinY !== undefined) pinCont.style.top = n.pinY + 'px';
                    if (n.pinW !== undefined) pinCont.style.width = n.pinW + 'px';
                    if (n.pinH !== undefined) pinCont.style.height = n.pinH + 'px';
                }
            }

            const infoCont = el.querySelector('.visual-extra');
            if (infoCont && (n.infoX !== undefined || n.infoW !== undefined)) {
                infoCont.style.position = 'absolute';
                infoCont.style.margin = '0';
                infoCont.style.display = 'flex';
                infoCont.style.flexWrap = 'wrap';
                infoCont.style.alignItems = 'center';
                infoCont.style.justifyContent = 'center';
                if (n.infoX !== undefined) infoCont.style.left = n.infoX + 'px';
                if (n.infoY !== undefined) infoCont.style.top = n.infoY + 'px';
                if (n.infoW !== undefined) infoCont.style.width = n.infoW + 'px';
                if (n.infoH !== undefined) infoCont.style.height = n.infoH + 'px';
            }
            if (n._domCache) delete n._domCache;
        }

        let isActive = false, isZero = true, isFloat = false;
        if (Array.isArray(n.val)) {
            isActive = n.val.some(s => s === 1);
            isZero = n.val.every(s => s === 0);
            isFloat = n.val.every(s => s === null || s === 'Z');
        } else if (n.val !== null && typeof n.val === 'object') {
            const vals = Object.values(n.val);
            isActive = vals.some(s => s === 1);
            isZero = vals.every(s => s === 0);
            isFloat = vals.every(s => s === null || s === 'Z');
        } else {
            isActive = (n.val === 1);
            isZero = (n.val === 0);
            isFloat = (n.val === null || n.val === 'Z');
        }

        if (n.type === 'CLOCK') {
            isActive = (n.state === 1);
            isZero = (n.state === 0);
            isFloat = false;
            const arm = el.querySelector('.indicator-arm');
            if (arm) arm.style.transform = `rotate(${(n.state === 1) ? 180 : 90}deg)`;
        }

        el.classList.toggle('active', isActive && n.type !== 'CLOCK');
        el.classList.toggle('inactive', isZero && !isActive && !isFloat);
        el.classList.toggle('floating', isFloat);

        el.querySelectorAll('.port').forEach(p => {
            const pid = p.dataset.port;
            let drive = p.classList.contains('output') && !p.classList.contains('input') ? sim.getSignal(n.id, pid) : sim.getDrivingSignal(n.id, pid);
            p.classList.toggle('on', drive === 1);
            p.classList.toggle('off', drive === 0);
            p.classList.toggle('float', drive === null || drive === 'Z');
        });

        if (n._oscillating) el.classList.add('oscillating');
    },

    /**
     * Resynchronizes wire visuals and dirty-flags the layout for engine recognition.
     * @param {Object} sim - The simulator instance.
     */
    updateWireVisuals(sim) {
        sim._netlistDirty = true;
        if (sim.wires) {
            sim.wires.forEach(w => {
                if (w.midX === null || isNaN(w.midX)) delete w.midX;
                if (w.midY === null || isNaN(w.midY)) delete w.midY;
            });
        }
        if (typeof window.WireRenderer !== 'undefined') WireRenderer.drawWires();
    },

    /**
     * Refreshes the hierarchical chip library UI.
     * @param {Object} sim - The simulator instance.
     */
    updateLibraryUI(sim) {
        let menu = document.getElementById('context-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'context-menu';
            menu.style.cssText = 'position:fixed; background:#1a1a23; border:1px solid #334; box-shadow:0 10px 25px rgba(0,0,0,0.6); border-radius:6px; padding:5px 0; z-index:10000; display:none; min-width:140px;';
            document.body.appendChild(menu);

            document.addEventListener('click', (e) => {
                if (e.button !== 2 && menu) menu.style.display = 'none';
            });
        }

        const lib = document.getElementById('chip-lib');
        if (!lib) return;

        const collapsedFolders = new Set();
        lib.querySelectorAll('.lib-folder.collapsed .folder-title').forEach(el => collapsedFolders.add(el.innerText.replace('📁 ', '').trim()));

        lib.innerHTML = '';

        const nativeLib = [
            { label: 'NAND', type: 'NAND' },
            { label: 'TRISTATE', type: 'TRISTATE' },
            { label: 'INPUT', type: 'INPUT' },
            { label: 'OUTPUT', type: 'OUTPUT' },
            { label: 'CLOCK', type: 'CLOCK' },
            { label: 'RAM', type: 'RAM' },
            { label: '0', type: '0' }
        ];

        const primFolder = document.createElement('div');
        primFolder.className = 'lib-folder' + (collapsedFolders.has('primitives') ? ' collapsed' : '');
        primFolder.innerHTML = `<span class="folder-title" onclick="this.parentElement.classList.toggle('collapsed')">📁 primitives</span><div class="folder-contents"></div>`;
        lib.appendChild(primFolder);
        const primContainer = primFolder.querySelector('.folder-contents');

        nativeLib.forEach(it => {
            const span = document.createElement('span');
            span.className = 'status-chip native';
            span.innerText = it.label;
            span.onclick = (e) => {
                if (it.type === 'INPUT' || it.type === 'OUTPUT') {
                    e.stopPropagation();
                    const prefix = it.type === 'INPUT' ? 'IN' : 'OUT';
                    menu.style.display = 'block';
                    menu.style.left = e.clientX + 'px';
                    menu.style.top = (e.clientY - 120) + 'px';
                    menu.innerHTML = `
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-1'); document.getElementById('context-menu').style.display='none';">1-Bit Port</div>
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-4'); document.getElementById('context-menu').style.display='none';">4-Bit Port</div>
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-8'); document.getElementById('context-menu').style.display='none';">8-Bit Port</div>
                    `;
                } else {
                    sim.addNode(it.type);
                }
            };
            primContainer.appendChild(span);
        });

        const groups = { '': [] };
        Object.keys(sim.library).forEach(name => {
            const folder = sim.library[name].folder || '';
            if (!groups[folder]) groups[folder] = [];
            groups[folder].push(name);
        });

        Object.keys(groups).sort().forEach(folder => {
            let container = lib;
            if (folder !== '') {
                const fDiv = document.createElement('div');
                fDiv.className = 'lib-folder' + (collapsedFolders.has(folder) ? ' collapsed' : '');
                fDiv.innerHTML = `<span class="folder-title" onclick="this.parentElement.classList.toggle('collapsed')">📁 ${folder}</span><div class="folder-contents"></div>`;
                lib.appendChild(fDiv);
                container = fDiv.querySelector('.folder-contents');
            }

            groups[folder].sort().forEach(name => {
                const span = document.createElement('span');
                span.className = 'status-chip custom';
                span.innerText = name;

                if (name === sim.activeEditingChip) {
                    span.style.opacity = '0.3';
                    span.onclick = () => sim.toast('Cannot place a chip inside itself', 'warning');
                } else {
                    span.onclick = () => sim.addNode(name);
                    span.ondblclick = () => { if (typeof sim.uiEditChip === 'function') sim.uiEditChip(name); };
                }

                span.oncontextmenu = (e) => {
                    e.preventDefault();
                    menu.style.display = 'block';
                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';

                    const existingFolders = Object.keys(groups).filter(f => f !== '').map(f => 
                        `<div class="menu-item" onclick="Sim.library['${name}'].folder='${f}'; Sim.updateLibraryUI(); Sim.autoSave(); document.getElementById('context-menu').style.display='none';">📁 ${f}</div>`
                    ).join('');
                    
                    const moveMenu = `
                        <div class="menu-item has-sub keep-open" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;">
                            Move
                            <div class="sub-menu">
                                ${existingFolders}
                                <div class="menu-item" style="color:#00ffaa;" onclick="event.stopPropagation(); this.innerHTML='<input type=&quot;text&quot; placeholder=&quot;New Folder...&quot; style=&quot;width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #00ffaa;font-size:10px;padding:4px;outline:none;&quot; onclick=&quot;event.stopPropagation()&quot; onkeydown=&quot;if(event.key===\\'Enter\\'){ Sim.library[\\'${name}\\'].folder=this.value.trim(); Sim.updateLibraryUI(); Sim.autoSave(); document.getElementById(\\'context-menu\\').style.display=\\'none\\'; } else if(event.key===\\'Escape\\'){ document.getElementById(\\'context-menu\\').style.display=\\'none\\'; }&quot; onblur=&quot;if(this.value.trim()!==\\'\\'){ Sim.library[\\'${name}\\'].folder=this.value.trim(); Sim.updateLibraryUI(); Sim.autoSave(); } document.getElementById(\\'context-menu\\').style.display=\\'none\\';&quot;>'; this.querySelector('input').focus();">↳ New Folder...</div>
                                <div class="menu-item" style="color:#ff4757; border-top:1px solid #334; margin-top:4px; padding-top:4px;" onclick="Sim.library['${name}'].folder=''; Sim.updateLibraryUI(); Sim.autoSave(); document.getElementById('context-menu').style.display='none';">✖ Root</div>
                            </div>
                        </div>
                    `;

                    menu.innerHTML = `<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onclick="Sim.uiEditChip('${name}')">Edit Internals</div>` +
                        `<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onclick="Sim.modal('Rename Chip','New name:','prompt',nn=>{if(nn){Sim.renameMacroGlobally('${name}', nn);}},'${name}')">Rename</div>` +
                        moveMenu +
                        `<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#ff4757; cursor:pointer; font-weight:600; text-transform:uppercase;" onclick="if(Sim.activeEditingChip==='${name}') Sim.uiExitChipEdit(); Sim.uiDeleteChip('${name}')">Delete</div>`;
                        
                    menu.classList.remove('open-left', 'open-up');
                    const rect = menu.getBoundingClientRect();
                    if (rect.right > window.innerWidth) { menu.style.left = (window.innerWidth - rect.width - 5) + 'px'; menu.classList.add('open-left'); }
                    if (rect.bottom > window.innerHeight) { menu.style.top = (window.innerHeight - rect.height - 5) + 'px'; menu.classList.add('open-up'); }
                };
                container.appendChild(span);
            });
        });
    },

    /**
     * Displays a non-blocking toast notification.
     * @param {Object} sim - The simulator instance.
     * @param {string} msg - The message to display.
     * @param {string} type - Notification type (info, success, warning, danger).
     * @param {number} duration - Milliseconds to display.
     */
    toast(sim, msg, type = 'info', duration = 3000) {
        if (!sim.showToasts || (type === 'debug' && !sim.debugToasts)) return;

        let el = document.getElementById('ui-toast-el');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ui-toast-el'; el.className = 'ui-toast';
            document.body.appendChild(el);

            let holdTimer;
            let isDragging = false;
            let offsetX, offsetY;

            el.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'SPAN') return;
                holdTimer = setTimeout(() => {
                    isDragging = true;
                    el.classList.add('draggable', 'dragging');
                    const rect = el.getBoundingClientRect();
                    offsetX = e.clientX - rect.left;
                    offsetY = e.clientY - rect.top;
                }, 1000);
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                el.style.left = (e.clientX - offsetX) + 'px';
                el.style.top = (e.clientY - offsetY) + 'px';
                el.style.bottom = 'auto';
                el.style.transform = 'none';
            });

            window.addEventListener('mouseup', () => {
                clearTimeout(holdTimer);
                if (isDragging) {
                    isDragging = false;
                    el.classList.remove('draggable', 'dragging');
                    const rect = el.getBoundingClientRect();
                    sim.toastPos = { left: rect.left, top: rect.top };
                    sim.autoSave(); 
                }
            });
        }
        
        el.innerHTML = msg;
        el.className = `ui-toast show toast-${type}`;
        
        if (sim.toastPos) {
            el.style.left = sim.toastPos.left + 'px';
            el.style.top = sim.toastPos.top + 'px';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
        } else {
            el.style.left = '50%';
            el.style.bottom = '80px';
            el.style.top = 'auto';
            el.style.transform = 'translateX(-50%)';
        }

        clearTimeout(sim._toastTimer);
        if (duration > 0) {
            sim._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
        }
    },

    /**
     * Refreshes the tab bar UI.
     * @param {Object} sim - The simulator instance.
     */
    updateTabsUI(sim) {
        const tb = document.getElementById('tab-bar');
        if (!tb) return;
        let html = '';
        sim.tabs.forEach((t, i) => {
            html += `<div class="tab ${t.id === sim.activeTabId ? 'active' : ''}" onclick="Sim.uiSwitchTab('${t.id}')">
                ${t.name}
                ${sim.tabs.length > 1 ? `<span class="tab-close" onclick="event.stopPropagation(); Sim.uiCloseTab('${t.id}')">✖</span>` : ''}
            </div>`;
        });
        html += `<div class="tab-btn" onclick="Sim.uiNewTab()">+</div>`;
        tb.innerHTML = html;
    },

    /**
     * Orchestrates a standard UI modal dialog.
     * @param {Object} sim - The simulator instance.
     * @param {string} title - Modal title.
     * @param {string} content - Modal message/body.
     * @param {string} type - Dialog type (alert, confirm, prompt, danger).
     * @param {Function} callback - Result handler.
     * @param {string} val - Default value for prompt.
     */
    modal(sim, title, content, type, callback, val) {
        const overlay = document.getElementById('ui-overlay');
        const mTitle = document.getElementById('ui-title');
        const mMsg = document.getElementById('ui-msg');
        const mInputCont = document.getElementById('ui-input-container');
        const mInput = document.getElementById('ui-input-el');
        const mButtons = document.getElementById('ui-buttons');

        mTitle.innerText = title;
        mMsg.innerHTML = content;
        mInputCont.style.display = type === 'prompt' ? 'block' : 'none';
        if (type === 'prompt') mInput.value = val || '';

        mButtons.innerHTML = '';
        const btnCancel = document.createElement('button');
        btnCancel.className = 'ui-btn secondary';
        btnCancel.innerText = 'Cancel';
        btnCancel.onclick = () => { overlay.style.display = 'none'; overlay.querySelector('.ui-modal').classList.remove('show'); if (callback) callback(null); };

        const btnOk = document.createElement('button');
        btnOk.className = 'ui-btn ' + (type === 'danger' ? 'danger' : 'primary');
        btnOk.innerText = (type === 'danger' || title.toLowerCase().includes('delete')) ? 'Confirm' : 'OK';
        btnOk.onclick = () => { overlay.style.display = 'none'; overlay.querySelector('.ui-modal').classList.remove('show'); if (callback) callback(type === 'prompt' ? mInput.value : true); };

        mInput.onkeydown = (e) => { if (e.key === 'Enter') btnOk.click(); };

        if (type !== 'alert' && type !== 'custom') mButtons.appendChild(btnCancel);
        if (type !== 'custom') mButtons.appendChild(btnOk);

        overlay.style.display = 'flex';
        setTimeout(() => overlay.querySelector('.ui-modal').classList.add('show'), 10);
        if (type === 'prompt') { mInput.focus(); mInput.select(); }
    },

    /**
     * Consolidates global DOM interaction handlers.
     * @param {Object} sim - The simulator instance.
     */
    initHandlers(sim) {
        // [AUDIT: v1.26.01 | SEC_ARCH_LEAD] - Centralized global event delegation.
        window.addEventListener('keydown', (e) => {
            const overlay = document.getElementById('ui-overlay');
            if (overlay && overlay.style.display === 'flex') {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    const btnOk = document.querySelector('#ui-buttons .ui-btn.primary, #ui-buttons .ui-btn.danger');
                    if (btnOk) btnOk.click();
                } else if (e.key === 'Escape') {
                    const btnCancel = document.querySelector('#ui-buttons .ui-btn.secondary');
                    if (btnCancel) btnCancel.click();
                }
            }

            if (e.target.tagName === 'INPUT') return;
            const key = e.key.toLowerCase();
            const code = e.code;
            if ((e.ctrlKey || e.metaKey) && (key === 'z' || code === 'KeyZ')) { e.preventDefault(); window.History?.undo(); }
            if ((e.ctrlKey || e.metaKey) && (key === 'y' || code === 'KeyY')) { e.preventDefault(); window.History?.redo(); }
            if (key === 'delete' || key === 'backspace' || code === 'Delete' || code === 'Backspace') {
                if (sim.selection.size > 0) {
                    if (sim.confirmDelete) {
                        sim.modal('Delete Components', `Delete ${sim.selection.size} selected items?`, 'danger', ok => { 
                            if (ok) sim.deleteSelection(); 
                        });
                    } else {
                        sim.deleteSelection();
                    }
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            const hc = document.getElementById('hud-coords');
            if (hc && window.View) {
                const scene = document.getElementById('scene');
                if (scene) {
                    const sr = scene.getBoundingClientRect();
                    const bx = Math.round((e.clientX - sr.left) / View.scale);
                    const by = Math.round((e.clientY - sr.top) / View.scale);
                    hc.innerText = `${bx}, ${by}`;
                }
            }

            if (!sim.wiring.active) return;
            const SNAP_R = 60;
            let nearest = null, nearestDist = SNAP_R;
            document.querySelectorAll('.port').forEach(portEl => {
                const r = portEl.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

                if (dist < nearestDist) {
                    const nodeEl = portEl.closest('.gate');
                    if (nodeEl) {
                        const isStartPort = (nodeEl.id === sim.wiring.start.nodeId && portEl.dataset.port === sim.wiring.start.portId);
                        if (!isStartPort) {
                            nearestDist = dist;
                            nearest = { nodeId: nodeEl.id, portId: portEl.dataset.port, el: portEl };
                        }
                    }
                }
            });
            sim.wiring.mouseX = e.clientX;
            sim.wiring.mouseY = e.clientY;

            if (sim.wiring.snapTarget && sim.wiring.snapTarget.el !== nearest?.el) {
                sim.wiring.snapTarget.el.classList.remove('snap-hover');
            }

            sim.wiring.snapTarget = nearest;
            if (nearest) nearest.el.classList.add('snap-hover');

            sim.updateWireVisuals();
        });
    }
};

if (typeof module !== 'undefined') module.exports = UIOrchestrator;
