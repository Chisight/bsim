/**
 * Interaction Handler Module
 */
const InteractionHandler = {
    activeContextNode: null,
    activeContextWire: null,
    activeContextX: null,
    activeContextY: null,
    customChipsList: [],

    saveDbsimSnapshot() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';

        try {
            let mainNodes = Sim.nodes;
            let mainWires = Sim.wires;
            if (Sim.workspaceStack && Sim.workspaceStack.length > 0) {
                mainNodes = Sim.workspaceStack[0].nodes;
                mainWires = Sim.workspaceStack[0].wires;
            }

            const cNodes = mainNodes.map(n => Sim._cleanNode(n)).filter(n => n !== null);
            const cWires = mainWires.map(w => Sim._cleanWire(w)).filter(w => w !== null);
            const cLib = {};
            Object.keys(Sim.library).forEach(k => {
                if (Sim.library[k]) {
                    cLib[k] = {
                        nodes: (Sim.library[k].nodes || []).map(n => Sim._cleanNode(n)).filter(n => n !== null),
                        wires: (Sim.library[k].wires || []).map(w => Sim._cleanWire(w)).filter(w => w !== null),
                        folder: Sim.library[k].folder || ''
                    };
                }
            });

            const snapshot = {
                nodes: cNodes,
                wires: cWires,
                library: cLib,
                meta: {
                    version: (window.LOADED_BSIM_VERSION || "1.27.27") + "-Modular",
                    exportedAt: new Date().toISOString(),
                    type: "dbsim_snapshot",
                    activeTabId: Sim.activeTabId,
                    activeEditingChip: Sim.activeEditingChip
                }
            };

            const filename = `debug_snapshot_${Date.now()}.dbsim`;
            const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            Sim.toast('DBSIM Snapshot saved successfully.', 'success');
        } catch (e) {
            console.error('Failed to save DBSIM Snapshot', e);
            Sim.toast('Failed to save DBSIM Snapshot.', 'danger');
        }
    },

    deleteActiveNode() {
        const node = this.activeContextNode;
        if (node) {
            console.log('[DEBUG] deleteActiveNode triggered for node:', node.id, node.type);
            const targetNode = Sim.nodes.find(n => n.id === node.id);
            if (targetNode) {
                try {
                    History.execute(new DeleteNodeCommand(targetNode));
                } catch (err) {
                    console.error('[InteractionHandler] DeleteNodeCommand threw an error. Initiating recovery/fallback deletion...', err);
                    // Fallback direct deletion
                    Sim.nodes = Sim.nodes.filter(n => n.id !== targetNode.id);
                    const el = document.getElementById(targetNode.id);
                    if (el) el.remove();
                    
                    Sim.wires = Sim.wires.filter(w => w.from.nodeId !== targetNode.id && w.to.nodeId !== targetNode.id);
                    if (typeof Sim.updateWireVisuals === 'function') Sim.updateWireVisuals();
                    if (typeof Sim.updateHUD === 'function') Sim.updateHUD();
                    if (typeof Sim.seedQueue === 'function') Sim.seedQueue();
                    if (typeof Sim.processQueue === 'function') Sim.processQueue();
                    if (typeof Sim.autoSave === 'function') Sim.autoSave();
                }
            } else {
                console.error('[InteractionHandler] Node not found in Sim.nodes. Attempting direct DOM fallback deletion for ID:', node.id);
                // Fallback direct DOM deletion in case of reference mismatches
                const el = document.getElementById(node.id);
                if (el) el.remove();
                Sim.nodes = Sim.nodes.filter(n => n.id !== node.id);
                Sim.wires = Sim.wires.filter(w => w.from.nodeId !== node.id && w.to.nodeId !== node.id);
                if (typeof Sim.updateWireVisuals === 'function') Sim.updateWireVisuals();
                if (typeof Sim.updateHUD === 'function') Sim.updateHUD();
                if (typeof Sim.seedQueue === 'function') Sim.seedQueue();
                if (typeof Sim.processQueue === 'function') Sim.processQueue();
                if (typeof Sim.autoSave === 'function') Sim.autoSave();
            }
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    renameActiveNode() {
        const node = this.activeContextNode;
        if (node) {
            const targetNode = Sim.nodes.find(n => n.id === node.id);
            if (targetNode) {
                this._isRenaming = true; // Signal to skip config dialogs and go straight to label edit
                InteractionHandler.handleNodeDblClick(new Event('dblclick'), targetNode, document.getElementById(node.id));
                this._isRenaming = false;
            }
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    editActiveNodeInternals() {
        const node = this.activeContextNode;
        if (node && node.isCustom) {
            Sim.uiEditChip(node.type);
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    scaleActiveNodeGeometry() {
        const node = this.activeContextNode;
        if (node && node.isCustom) {
            Sim.uiScaleChip(node.type);
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    configureClockFrequency() {
        const node = this.activeContextNode;
        if (node) {
            const targetNode = Sim.nodes.find(n => n.id === node.id);
            if (targetNode) {
                InteractionHandler.handleNodeDblClick(new Event('dblclick'), targetNode, document.getElementById(node.id));
            }
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    executeNodePref(prefType) {
        const node = this.activeContextNode;
        if (!node) return;

        if (prefType === 'pin-leds' || prefType === 'pin-labels' || prefType === 'pin-both' || prefType === 'info' || prefType === 'label' || prefType === 'icon') {
            Sim.enterNodeEditMode(node.id, prefType);
        } else if (prefType === 'flip-polarity') {
            Sim.toggleNodePolarity(node.id);
        } else if (prefType === 'relocate') {
            Sim.enterPinSelectMode(node.id, 'relocate');
        } else if (prefType === 'scale') {
            Sim.enterPinSelectMode(node.id, 'scale');
        } else if (prefType === 'mem-upload') {
            InteractionHandler.triggerMemoryUpload(node.id);
        }

        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    deleteActiveWire() {
        const wire = this.activeContextWire;
        if (wire) {
            const wTarget = Sim.wires.find(w => w.from.nodeId === wire.from.nodeId && w.to.nodeId === wire.to.nodeId && w.from.portId === wire.from.portId && w.to.portId === wire.to.portId);
            if (wTarget) {
                try {
                    History.execute(new DeleteWireCommand(wTarget));
                } catch (err) {
                    console.error('[InteractionHandler] DeleteWireCommand threw an error. Initiating fallback deletion...', err);
                    Sim.wires = Sim.wires.filter(w => w !== wTarget);
                    if (typeof Sim.updateWireVisuals === 'function') Sim.updateWireVisuals();
                    if (typeof Sim.seedQueue === 'function') Sim.seedQueue();
                    if (typeof Sim.processQueue === 'function') Sim.processQueue();
                    if (typeof Sim.autoSave === 'function') Sim.autoSave();
                }
            } else {
                console.error('[InteractionHandler] Wire target not found. Initiating fallback deletion by properties...');
                Sim.wires = Sim.wires.filter(w => !(w.from.nodeId === wire.from.nodeId && w.to.nodeId === wire.to.nodeId && w.from.portId === wire.from.portId && w.to.portId === wire.to.portId));
                if (typeof Sim.updateWireVisuals === 'function') Sim.updateWireVisuals();
                if (typeof Sim.seedQueue === 'function') Sim.seedQueue();
                if (typeof Sim.processQueue === 'function') Sim.processQueue();
                if (typeof Sim.autoSave === 'function') Sim.autoSave();
            }
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    splitActiveWire(clickX, clickY) {
        const wire = this.activeContextWire;
        if (wire) {
            InteractionHandler._splitWire(wire.from.nodeId, wire.from.portId, wire.to.nodeId, wire.to.portId, clickX, clickY);
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    spawnCustomChipByIndex(index) {
        if (this.customChipsList && this.customChipsList[index]) {
            const cName = this.customChipsList[index];
            const x = this.activeContextX;
            const y = this.activeContextY;
            Sim.addNode(cName, x, y);
        }
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    spawnGate(type) {
        const x = this.activeContextX;
        const y = this.activeContextY;
        Sim.addNode(type, x, y);
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    splitEditor(direction) {
        Sim.uiSplitEditor(direction);
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    openTerminal() {
        if (window.DebugTerminal) DebugTerminal.toggle(true);
        const menu = document.getElementById('context-menu');
        if (menu) menu.style.display = 'none';
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for node translation.
     */
    handleNodeDrag(e, node, div) {
        console.debug('[DEBUG] Node onmousedown triggered. Node ID:', node.id, '| Button pressed:', e.button);
        // [AUDIT: v1.26.24 | SEC_ARCH_LEAD] - Global freeze on node topological drags during layout configurations.
        if (document.body.classList.contains('edit-mode-active') || document.body.classList.contains('pin-mutate-active')) return;

        if (e.target.classList.contains('port') && node.type !== 'JUNCTION') {
            return;
        }
        
        if (e.button === 2) { 
            e.preventDefault(); e.stopPropagation();
            InteractionHandler.activeContextNode = node;
            const menu = document.getElementById('context-menu');
            if (!menu) {
                return;
            }

            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Context menu parity: expose component-specific parameterization and macro geometry endpoints on canvas instances.
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Node Prefs extension: spatial edit mode for I/O bounds and internal pin layout arrays.
            // [AUDIT: v1.24.15 | SEC_ARCH_LEAD] - Fixed string interpolation collision and enforced DOM recalculation for I/O labels.
            const isNative = !node.isCustom;
            
            let configOption = '';
            let nodePrefs = '';
            if (node.type === 'CLOCK') {
                configOption = `<div class="menu-item" onclick="InteractionHandler.configureClockFrequency();">Configure Frequency</div>`;
            // [AUDIT: SEC_ARCH_LEAD] - Added info readout layout mutation to preferences.
            } else if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.isCustom || node.type === 'RAM') {
                // [AUDIT: v1.24.34 | SEC_ARCH_LEAD] - Replaced monolithic pin layout with granular dot/label mutators.
                nodePrefs = `
                    <div class="menu-item" style="color:var(--accent); font-weight:bold; cursor:default;">Node Prefs:</div>
                    ${(node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.isCustom || node.type === 'RAM') ? `
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('pin-leds');">↳ Edit Pin LEDs</div>
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('pin-labels');">↳ Edit Pin Labels</div>
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('pin-both');">↳ Edit Both (Sync)</div>
                    ` : ''}
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('flip-polarity');">↳ Flip Pin Polarity</div>
                    ${((node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) && !node.type.endsWith('-1')) ? `<div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('info');">↳ Edit Readout Layout</div>` : ''}
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('label');">↳ Edit Label Layout</div>
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="InteractionHandler.executeNodePref('icon');">↳ Edit Icon Scale</div>
                    <div class="menu-item" style="padding-left:15px; color:#00ffaa;" onclick="InteractionHandler.executeNodePref('relocate');">↳ Relocate Pin(s)</div>
                    <div class="menu-item" style="padding-left:15px; color:#00ffaa;" onclick="InteractionHandler.executeNodePref('scale');">↳ Scale Pin(s)</div>
                `;
            }

            // [AUDIT: v1.25.04 | SEC_ARCH_LEAD] - Integrated binary payload uploader specifically for memory components.
            let memUpload = '';
            if (node.type === 'RAM') {
                memUpload = `<div class="menu-item" style="color:#00ffaa; font-weight:bold;" onclick="InteractionHandler.executeNodePref('mem-upload');">Upload .bin Payload</div>`;
            }

            menu.innerHTML = `
                ${configOption}
                ${memUpload}
                ${nodePrefs}
                <div class="menu-item" onclick="InteractionHandler.renameActiveNode();">Rename</div>
                ${!isNative ? `<div class="menu-item" onclick="InteractionHandler.scaleActiveNodeGeometry();">Set Geometry</div>` : ''}
                <div class="menu-item ${isNative ? 'disabled' : ''}" onclick="InteractionHandler.editActiveNodeInternals();">Edit Internals</div>
                <div class="menu-item danger" onclick="InteractionHandler.deleteActiveNode();">Delete</div>
            `;
            
            // [AUDIT: v1.24.67 | SEC_ARCH_LEAD] - Removed redundant legacy context menu extensions for ROM/Custom chips in favor of unified Node Prefs system.
            
            // [AUDIT: v1.24.12 | SEC_ARCH_LEAD] - Smart boundary collision detection for context menu positioning.
            menu.classList.remove('open-left', 'open-up');
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
                menu.classList.add('open-left');
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
                menu.classList.add('open-up');
            }
            
            return; 
        }
        
        const startX = e.clientX, startY = e.clientY;
        
        // Ensure dragging an unselected node only drags that node, but dragging a selected one drags the group
        const isMulti = Sim.selection.has(node.id);
        const dragSet = isMulti ? Array.from(Sim.selection).map(id => {
            const n = Sim.nodes.find(x => x.id === id);
            return n ? { node: n, ox: n.x, oy: n.y, div: document.getElementById(n.id) } : null;
        }).filter(x => x) : [{ node, ox: node.x, oy: node.y, div }];

        // Isolate wires fully contained within the moving group
        const selectedNodeIds = new Set(dragSet.map(item => item.node.id));
        const dragWires = Sim.wires.filter(w => selectedNodeIds.has(w.from.nodeId) && selectedNodeIds.has(w.to.nodeId) && (w.midX !== undefined || w.midY !== undefined))
                                   .map(w => ({ wire: w, ox: w.midX, oy: w.midY }));
                                   
        const onMove = (m) => {
            const dx = (m.clientX - startX) / View.scale;
            const dy = (m.clientY - startY) / View.scale;
            
            let snapDx = dx;
            let snapDy = dy;
            
            // [AUDIT: v1.25.16 | SEC_ARCH_LEAD] - Enforced individual absolute grid snapping (10px resolution) to cure accumulated floating-point drift and micro-offsets.
            if (Sim.snapNodes && dragSet.length > 0) {
                const lead = dragSet[0];
                const nx = Math.round((lead.ox + dx) / 10) * 10;
                const ny = Math.round((lead.oy + dy) / 10) * 10;
                snapDx = nx - lead.ox;
                snapDy = ny - lead.oy;
            }

            dragSet.forEach(item => {
                if (Sim.snapNodes) {
                    item.node.x = Math.round((item.ox + snapDx) / 10) * 10;
                    item.node.y = Math.round((item.oy + snapDy) / 10) * 10;
                } else {
                    item.node.x = item.ox + snapDx;
                    item.node.y = item.oy + snapDy;
                }
                Sim.updateNodePosition(item.node, item.div);
            });
            
            dragWires.forEach(item => {
                if (item.ox !== undefined) item.wire.midX = item.ox + snapDx;
                if (item.oy !== undefined) item.wire.midY = item.oy + snapDy;
            });
            
            WireRenderer.drawWiresSelective(dragSet.map(item => item.node.id));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            const moves = dragSet.filter(item => Math.abs(item.node.x - item.ox) > 1 || Math.abs(item.node.y - item.oy) > 1)
                                 .map(item => ({ id: item.node.id, ox: item.ox, oy: item.oy, nx: item.node.x, ny: item.node.y }));
            
            // [AUDIT: v1.24.17 | SEC_ARCH_LEAD] - Preserved boundary wire midpoints during component drags to maintain custom routing.
            const wMoves = dragWires.map(item => ({ wire: item.wire, ox: item.ox, oy: item.oy, nx: item.wire.midX, ny: item.wire.midY }));

            if (moves.length > 0) History.execute(new MoveNodeCommand(moves, wMoves));
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, { once: true });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical state toggle.
     */
    handleNodeClick(e, node, div, bits) {
        // [AUDIT: v1.26.24 | SEC_ARCH_LEAD] - Global freeze on node topological clicks during layout configurations.
        if (document.body.classList.contains('edit-mode-active') || document.body.classList.contains('pin-mutate-active')) return;
        if (e.target.classList.contains('port') || e.target.classList.contains('bit-dot')) return;
        if (e.shiftKey) return; // Reserved for Port Interaction
        if (node.type.startsWith('IN-')) {
            if (bits === 1) {
                node.state = node.state ? 0 : 1;
                node.val = node.state;
            } else {
                const newState = (Array.isArray(node.state) && node.state.every(s => s === 1)) ? 0 : 1;
                if (Array.isArray(node.state)) node.state.fill(newState);
                else node.state = new Array(bits).fill(newState);
                node.val = [...node.state];
            }
            Sim.updateNodeVisual(node); 
            Sim.seedQueue(); 
            Sim.processQueue();
        } else if (node.type === 'CLOCK') {
            node.freq = (node.freq === 0) ? 1 : 0;
            if (node.freq === 0) {
                node.val = 0;
                Sim.seedQueue();
                Sim.processQueue();
            }
            Sim.updateNodeVisual(node);
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for configuration modal activation.
     */
    handleNodeDblClick(e, node, div) {
        // [AUDIT: SEC_ARCH_LEAD] - Global freeze on node topological double-clicks during layout configurations.
        if (document.body.classList.contains('edit-mode-active')) return;
        Sim.wakeQueue();
        e.stopPropagation();
        if (e.target && e.target.classList && e.target.classList.contains('port')) return;

        if (node.type === 'CLOCK') {
            Sim.modal('Configure Clock', 'Set Frequency (0.1Hz - 100Hz):', 'prompt', (val) => {
                const f = Math.max(0.1, Math.min(100, parseFloat(val)));
                if (!isNaN(f)) {
                    node.freq = f;
                    node.interval = 1000 / f;
                    node.label = `${f} Hz`;
                    const lbl = div.querySelector('.gate-label');
                    if (lbl) lbl.innerText = node.label;
                    Sim.autoSave();
                }
            }, node.freq);
        // [AUDIT: v1.24.25 | SEC_ARCH_LEAD] - Removed uiEnterValue popup intercept to allow inline renaming on multi-bit inputs.
        } else if (node.type === 'RAM' && !this._isRenaming) {
            /**
             */
            // [AUDIT: v1.24.97 | SEC_ARCH_LEAD] - Intercept configuration triggers to accept URL mapping and memory depth natively.
            const currentAddr = node.addressPins || 4;
            const currentUrl = node.dataUrl || '';
            
            const html = `
                <div style="display:flex; flex-direction:column; gap:15px; text-align:left;">
                    <label style="color:#aaa; font-size:12px;">Address Pins (Bus Width): 
                        <input type="number" id="mem-addr" value="${currentAddr}" min="1" max="24" style="width:100%; background:#111; border:1px solid #334; color:#0f0; padding:5px; margin-top:5px; box-sizing:border-box;">
                    </label>
                    <div style="padding:10px; border:1px solid #334; border-radius:4px; background:#181820;">
                        <label style="color:#aaa; font-size:12px; font-weight:bold;">1. Local Binary File (.bin): 
                            <input type="file" id="mem-file" accept=".bin,.hex" style="width:100%; margin-top:8px; font-size:11px; color:#0f0;">
                        </label>
                        <div style="text-align:center; color:#556; font-size:10px; text-transform:uppercase; margin:8px 0;">— OR —</div>
                        <label style="color:#aaa; font-size:12px; font-weight:bold;">2. Remote Payload URL: 
                            <input type="text" id="mem-url" value="${currentUrl}" placeholder="https://domain.com/rom.bin" style="width:100%; background:#111; border:1px solid #334; color:#0f0; padding:5px; margin-top:8px; box-sizing:border-box;">
                        </label>
                    </div>
                </div>
            `;

            Sim.modal(`Configure ${node.type}`, html, 'custom');
            
            const overlay = document.getElementById('ui-overlay');
            const mButtons = document.getElementById('ui-buttons');
            mButtons.innerHTML = '';
            
            const btnCancel = document.createElement('button');
            btnCancel.className = 'ui-btn secondary';
            btnCancel.innerText = 'Cancel';
            btnCancel.onclick = () => { 
                overlay.style.display = 'none'; overlay.querySelector('.ui-modal').classList.remove('show'); 
            };
            
            const btnOk = document.createElement('button');
            btnOk.className = 'ui-btn primary';
            btnOk.innerText = 'Apply';
            btnOk.onclick = async () => {
                const aBits = parseInt(document.getElementById('mem-addr').value);
                const url = document.getElementById('mem-url').value.trim();
                const fileInput = document.getElementById('mem-file');
                
                if (!isNaN(aBits)) {
                    node.addressPins = aBits;
                    
                    // [AUDIT: v1.25.02 | SEC_ARCH_LEAD] - Priority execution for local file payloads over remote URL string.
                    try {
                        // [AUDIT: v1.25.08 | SEC_ARCH_LEAD] - Enforced hardware-defined spatial bounds clamping on configuration modal execution paths.
                        const MAX_BYTES = Math.pow(2, aBits);
                        if (fileInput && fileInput.files.length > 0) {
                            Sim.toast('Reading local memory file...', 'info');
                            const file = fileInput.files[0];
                            const buffer = await file.arrayBuffer();
                            const safeView = new Uint8Array(MAX_BYTES);
                            safeView.set(new Uint8Array(buffer).subarray(0, MAX_BYTES));
                            node.memoryData = Array.from(safeView);
                            node.dataUrl = file.name;
                            Sim._netlistDirty = true;
                            
                            const logMsg = `[MEM_CTRL] Local Flash: ${node.type} [${node.id}] <- ${file.name} (${safeView.byteLength} bytes)`;
                            if (window.DebugTerminal && typeof window.DebugTerminal.log === 'function') window.DebugTerminal.log(logMsg, 'sys');
                            console.info(logMsg);
                            
                            if (file.size > MAX_BYTES) Sim.toast(`Payload truncated to ${MAX_BYTES} bytes.`, 'warning');
                            else Sim.toast('Local memory payload flashed directly to heap.', 'success');
                        } else if (url) {
                            node.dataUrl = url;
                            Sim.toast('Fetching memory data via network...', 'info');
                            const res = await fetch(url);
                            if (!res.ok) throw new Error('HTTP ' + res.status);
                            const buffer = await res.arrayBuffer();
                            const safeView = new Uint8Array(MAX_BYTES);
                            safeView.set(new Uint8Array(buffer).subarray(0, MAX_BYTES));
                            node.memoryData = Array.from(safeView);
                            Sim._netlistDirty = true;
                            
                            const logMsg = `[MEM_CTRL] Remote Flash: ${node.type} [${node.id}] <- ${url} (${safeView.byteLength} bytes)`;
                            if (window.DebugTerminal && typeof window.DebugTerminal.log === 'function') window.DebugTerminal.log(logMsg, 'sys');
                            console.info(logMsg);
                            
                            Sim.toast('Network payload flashed.', 'success');
                        }
                    } catch(e) {
                        Sim.toast('Memory flash aborted: ' + e.message, 'danger');
                    }
                    if (typeof NodeRenderer !== 'undefined') {
                        const el = document.getElementById(node.id);
                        if (el) el.remove();
                        NodeRenderer.renderNode(node);
                    }
                    Sim.updateWireVisuals();
                    Sim.seedQueue();
                    Sim.processQueue();
                    Sim.autoSave();
                }
                overlay.style.display = 'none';
                overlay.querySelector('.ui-modal').classList.remove('show');
            };
            
            mButtons.appendChild(btnCancel);
            mButtons.appendChild(btnOk);
            
        } else if (node.type !== 'JUNCTION') {
            const lbl = div.querySelector('.gate-label');
            if (!lbl || lbl.querySelector('input')) return;

            const ogText = node.label || '';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = ogText;
            input.style.cssText = 'width: 100%; height: 100%; box-sizing: border-box; background: #222; color: #fff; border: 1px solid #00ffaa; font-family: "JetBrains Mono", monospace; font-size: inherit; text-align: center; outline: none; border-radius: 2px; pointer-events: auto;';

            lbl.innerText = '';
            lbl.appendChild(input);
            lbl.style.pointerEvents = 'auto';

            const commit = () => {
                if (!lbl.contains(input)) return;
                input.onblur = null; // Prevent double-triggering during DOM removal!
                const val = input.value.trim();
                node.label = val;
                lbl.innerText = node.label;
                lbl.style.pointerEvents = '';
                if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-') || node.type === 'RAM') {
                    if (typeof NodeRenderer !== 'undefined') {
                        // Remove the existing element first to avoid duplicate stale ghost elements
                        const existing = document.getElementById(node.id);
                        if (existing) existing.remove();
                        NodeRenderer.renderNode(node);
                    }
                    Sim.updateWireVisuals();
                }
                Sim.autoSave();
            };

            input.onblur = commit;
            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
                if (ev.key === 'Escape') { 
                    lbl.innerHTML = ''; 
                    lbl.innerText = ogText; 
                    lbl.style.pointerEvents = '';
                }
            };
            
            input.focus();
            input.select();
        }
    },

    /**
     */
    copySelection() {
        if (Sim.selection.size === 0) return;
        const nodesToCopy = Sim.nodes.filter(n => Sim.selection.has(n.id));
        const wiresToCopy = Sim.wires.filter(w => Sim.selection.has(w.from.nodeId) && Sim.selection.has(w.to.nodeId));
        Sim._clipboard = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), wires: JSON.parse(JSON.stringify(wiresToCopy)) };
    },

    /**
     */
    pasteSelection() {
        if (!Sim._clipboard || !Sim._clipboard.nodes) return;
        const idMap = {};
        const newNodes = Sim._clipboard.nodes.map(n => {
            const newId = 'node-' + Math.random().toString(36).substr(2, 9);
            idMap[n.id] = newId;
            n.x += 20; n.y += 20; // Cascade Logic
            const cloned = JSON.parse(JSON.stringify(n));
            cloned.id = newId; return cloned;
        });
        // [AUDIT: v1.24.77 | SEC_ARCH_LEAD] - Hardened PasteCommand wire instantiation to preserve user-defined midpoints and orthogonality properties.
        const newWires = Sim._clipboard.wires.map(w => {
            const nw = {
                from: { nodeId: idMap[w.from.nodeId], portId: w.from.portId },
                to: { nodeId: idMap[w.to.nodeId], portId: w.to.portId },
                orthoDir: w.orthoDir
            };
            if (w.midX !== undefined) nw.midX = w.midX + 20;
            if (w.midY !== undefined) nw.midY = w.midY + 20;
            return nw;
        });
        History.execute(new PasteCommand(newNodes, newWires));
        Sim.selection.forEach(id => document.getElementById(id)?.classList.remove('selected'));
        Sim.selection.clear();
        newNodes.forEach(n => { Sim.selection.add(n.id); document.getElementById(n.id)?.classList.add('selected'); });
    },

    /**
     * [AUDIT: v1.25.04 | SEC_ARCH_LEAD] - Entry trace for localized memory payload ingestion.
     */
    triggerMemoryUpload(nodeId) {
        const node = Sim.nodes.find(n => n.id === nodeId);
        if (!node || (node.type !== 'RAM')) return;
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bin';
        input.onchange = async (ev) => {
            if (ev.target.files.length > 0) {
                try {
                    const file = ev.target.files[0];
                    // [AUDIT: v1.25.17 | SEC_ARCH_LEAD] - Auto-scale address bus width to accommodate uploaded payload size without truncation.
                    // [AUDIT: v1.25.34 | SEC_ARCH_LEAD] - Corrected precision truncation fault in address bus scaling computation.
                    let requiredPins = Math.max(node.addressPins || 4, Math.ceil(Math.log2(Math.max(1, file.size))));
                    if (Math.pow(2, requiredPins) < file.size) requiredPins++; // Guarantee encapsulation boundary
                    if (requiredPins > 24) requiredPins = 24; // Clamp to 16MB physical limit
                    node.addressPins = requiredPins;
                    const MAX_BYTES = Math.pow(2, requiredPins);

// [AUDIT: v1.25.15 | SEC_ARCH_LEAD] - Pad memory payload to hardware boundary to prevent out-of-bounds evaluation faults.
                    const buffer = await file.arrayBuffer();
                    const safeView = new Uint8Array(MAX_BYTES);
                    safeView.set(new Uint8Array(buffer).subarray(0, MAX_BYTES));
                    node.memoryData = Array.from(safeView);
                    node.dataUrl = file.name;
                    // [AUDIT: v1.25.14 | SEC_ARCH_LEAD] - Mark netlist dirty to force Wasm heap synchronization on next tick.
                    Sim._netlistDirty = true;
                    
                    if (window.NodeRenderer) {
                        const el = document.getElementById(nodeId);
                        if (el) el.remove();
                        NodeRenderer.renderNode(node);
                        Sim.updateWireVisuals();
                        Sim.seedQueue();
                        Sim.processQueue();
                    }
                    
                    // [AUDIT: v1.25.06 | SEC_ARCH_LEAD] - Injected hardware-level diagnostic telemetry for direct context-menu payload ingestion.
                    const logMsg = `[MEM_CTRL] Context Flash: ${node.type} [${node.id}] <- ${file.name} (${safeView.byteLength} bytes) | Auto-scaled to ${requiredPins}-bit Bus`;
                    if (window.DebugTerminal && typeof window.DebugTerminal.log === 'function') window.DebugTerminal.log(logMsg, 'sys');
                    console.info(logMsg);
                    
                    if (file.size > MAX_BYTES) {
                        Sim.toast(`Payload truncated to 16MB architectural limit.`, 'warning');
                    } else {
                        Sim.toast(`${node.type} flashed. Bus auto-scaled to ${requiredPins} pins.`, 'success');
                    }
                    Sim.autoSave();
                } catch (err) {
                    Sim.toast('Failed to mount memory buffer.', 'danger');
                }
            }
        };
        input.click();
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for wire splitting.
     */
    _splitWire(fromNodeId, fromPortId, toNodeId, toPortId, clickX, clickY) {
        const wire = Sim.wires.find(w => w.from.nodeId === fromNodeId && w.to.nodeId === toNodeId && w.from.portId === fromPortId && w.to.portId === toPortId);
        if (!wire) return;
        
        // [AUDIT: v1.24.77 | SEC_ARCH_LEAD] - Atomic wire splitting via unified history command.
        History.execute(new SplitWireCommand(wire, clickX, clickY));
        Sim.autoSave();
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for wire context manipulation.
     */
    handleWireInteraction(e, wire, p1, p2) {
        console.debug('[DEBUG] handleWireInteraction invoked. Button:', e.button);
        if (e.button === 2) {
            e.preventDefault(); e.stopPropagation();
            InteractionHandler.activeContextWire = wire;
            const menu = document.getElementById('context-menu');
            if (!menu) return;

            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            const sr = document.getElementById('scene').getBoundingClientRect();
            const clickX = (e.clientX - sr.left) / View.scale;
            const clickY = (e.clientY - sr.top) / View.scale;

            // [AUDIT: v1.24.47 | SEC_ARCH_LEAD] - Stricter wire resolution referencing ports to prevent incorrect deletion of parallel multi-bit connections.
            // [AUDIT: v1.24.77 | SEC_ARCH_LEAD] - Hardened missing-wire exception handling for direct-action menus.
            menu.innerHTML = `
                <div class="menu-item" onclick="InteractionHandler.splitActiveWire(${clickX}, ${clickY});">Add Junction Here</div>
                <div class="menu-item danger" onclick="InteractionHandler.deleteActiveWire();">Delete Wire</div>
            `;
            
            // [AUDIT: v1.24.12 | SEC_ARCH_LEAD] - Smart boundary collision detection for wire context menus.
            menu.classList.remove('open-left', 'open-up');
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
                menu.classList.add('open-left');
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
                menu.classList.add('open-up');
            }
            return;
        }

        if (e.button === 0) {
            e.preventDefault();
            e.stopPropagation();
            
            const marquee = document.getElementById('selection-marquee');
            if (marquee) marquee.style.display = 'none';

            const sr = document.getElementById('scene').getBoundingClientRect();
            const clickX = (e.clientX - sr.left) / View.scale;
            const clickY = (e.clientY - sr.top) / View.scale;

            if (e.shiftKey) {
                // [AUDIT: v1.24.77 | SEC_ARCH_LEAD] - Shifted inline splitting to unified atomic SplitWireCommand to prevent fragmented Undo stack entries.
                History.execute(new SplitWireCommand(wire, clickX, clickY));
                Sim.autoSave();
                return;
            }

            const mode = wire.orthoDir || 'H';
            let isVerticalDrag = (mode === 'V');
            
            // Shift orientation if clicking far from the current midpoint axis
            if (mode === 'H') {
                const midX = typeof wire.midX === 'number' ? wire.midX : p1.x + (p2.x - p1.x)/2;
                if (Math.abs(clickX - midX) > 15) { wire.orthoDir = 'V'; wire.midY = clickY; isVerticalDrag = true; }
            } else {
                const midY = typeof wire.midY === 'number' ? wire.midY : p1.y + (p2.y - p1.y)/2;
                if (Math.abs(clickY - midY) > 15) { wire.orthoDir = 'H'; wire.midX = clickX; isVerticalDrag = false; }
            }

            Sim._activeWireDrag = {
                wire: wire,
                isVertical: isVerticalDrag,
                oldMidX: wire.midX,
                oldMidY: wire.midY,
                oldOrthoDir: wire.orthoDir || 'H'
            };
        }
    },


    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for marquee selection initialization.
     */
    initMarquee() {
        const ws = document.getElementById('workspace');
        const marquee = document.getElementById('selection-marquee');
        let startX, startY, isDragging = false;

        ws.oncontextmenu = (e) => {
            e.preventDefault();
            if (Sim._isDraggingPan || e.buttons === 3) return; // Ignore menu if panning or finishing a right-click drag pan
            if (e.target !== ws && e.target.id !== 'grid-layer') return;
            
            const sr = document.getElementById('scene').getBoundingClientRect();
            const x = (e.clientX - sr.left) / View.scale;
            const y = (e.clientY - sr.top) / View.scale;

            const menu = document.getElementById('context-menu');
            if (!menu) return;

            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Context menu upgraded to support dynamic hierarchical folders for custom macros.
            let customChipsHtml = '';
            const customChips = Object.keys(Sim.library);
            InteractionHandler.activeContextX = x;
            InteractionHandler.activeContextY = y;
            InteractionHandler.customChipsList = customChips;
            if (customChips.length > 0) {
                const groups = { '': [] };
                customChips.forEach(name => {
                    const f = Sim.library[name].folder || '';
                    if (!groups[f]) groups[f] = [];
                    groups[f].push(name);
                });
                
                // [AUDIT: v1.25.30 | SEC_ARCH_LEAD] - Replaced nested absolute sub-menus with inline collapsible trees to prevent CSS overflow clipping.
                let chipsList = '';
                Object.keys(groups).sort().forEach(folder => {
                    if (folder !== '') {
                        chipsList += `<div class="menu-item" style="color:#aaa; display:flex; justify-content:space-between; align-items:center;" onclick="event.stopPropagation(); const n=this.nextElementSibling; const d=(n.style.display==='none'); n.style.display=d?'block':'none'; this.lastElementChild.innerText=d?'▾':'▸';"><span>📁 ${folder}</span><span style="font-size:10px; opacity:0.5; pointer-events:none;">▸</span></div><div style="display:none; margin-left:8px; border-left:1px solid #334; padding-left:4px; background:rgba(0,0,0,0.15);">`;
                    }
                    groups[folder].forEach(c => {
                        const globalIdx = customChips.indexOf(c);
                        chipsList += `<div class="menu-item" onclick="InteractionHandler.spawnCustomChipByIndex(${globalIdx});">${c}</div>`;
                    });
                    if (folder !== '') {
                        chipsList += `</div>`;
                    }
                });

                customChipsHtml = `
                    <div class="menu-item has-sub" style="color:#ffca28; font-weight:bold">
                        Spawn Custom
                        <div class="sub-menu">
                            ${chipsList}
                        </div>
                    </div>
                `;
            }

            menu.innerHTML = `
                <div class="menu-item" style="color:#8888aa; font-weight:bold; border-bottom:1px solid #334; margin-bottom:5px; padding-bottom:5px;" onclick="InteractionHandler.openTerminal();">> Open Terminal</div>
                <div class="menu-item has-sub" style="color:var(--wire-on); font-weight:bold">
                    Spawn Input
                    <div class="sub-menu">
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('IN-1');">1-Bit</div>
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('IN-4');">4-Bit</div>
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('IN-8');">8-Bit</div>
                    </div>
                </div>
                <div class="menu-item has-sub" style="color:var(--accent); font-weight:bold">
                    Spawn Output
                    <div class="sub-menu">
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('OUT-1');">1-Bit</div>
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('OUT-4');">4-Bit</div>
                        <div class="menu-item" onclick="InteractionHandler.spawnGate('OUT-8');">8-Bit</div>
                    </div>
                </div>
                <div class="menu-item" onclick="InteractionHandler.spawnGate('CLOCK');">Spawn Clock</div>
                <div class="menu-item" style="color:#fff; font-weight:bold" onclick="InteractionHandler.spawnGate('NAND');">Spawn NAND</div>
                <div class="menu-item" style="color:#00ffaa; font-weight:bold" onclick="InteractionHandler.spawnGate('JUNCTION');">Spawn Wire Junction</div>
                ${customChipsHtml}
                ${Sim.debugMode ? `
                    <div class="menu-item" style="color:#00ffaa; font-weight:bold; border-top:1px solid #334; margin-top:5px; padding-top:5px;" onclick="InteractionHandler.saveDbsimSnapshot();">> Save DBSIM Snapshot</div>
                ` : ''}
                ${Sim.activeEditingChip ? `
                    <div class="menu-item has-sub" style="color:#ffca28; font-weight:bold; border-top:1px solid #334; margin-top:5px; padding-top:5px;">
                        Split Editor
                        <div class="sub-menu">
                            <div class="menu-item" onclick="InteractionHandler.splitEditor('left');">Left</div>
                            <div class="menu-item" onclick="InteractionHandler.splitEditor('right');">Right</div>
                            <div class="menu-item" onclick="InteractionHandler.splitEditor('popup');">Popup</div>
                        </div>
                    </div>
                ` : ''}
            `;
            
            // [AUDIT: v1.24.68 | SEC_ARCH_LEAD] - Integrated Split Editor menu into primary workspace context logic to resolve 'under-delete' rendering fault.
            menu.classList.remove('open-left', 'open-up');
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
                menu.classList.add('open-left');
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
                menu.classList.add('open-up');
            }
        };

        // Keyboard Handling (Parity with v1.20.6 Escape and Del logic)
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'escape') {
                if (Sim.wiring.active) {
                    const s = Sim.wiring.start;
                    document.getElementById(s.nodeId)?.querySelector(`[data-port="${s.portId}"]`)?.classList.remove('selected');
                    Sim.wiring.active = false; 
                    Sim.wiring.start = null; 
                    Sim.clearSnapState();
                    WireRenderer.drawWires();
                    return;
                }
                // Deselect all nodes
                Sim.selection.forEach(id => document.getElementById(id)?.classList.remove('selected'));
                Sim.selection.clear();
            }
        });

        ws.addEventListener('dblclick', (e) => {
            // [AUDIT: v1.26.27 | SEC_ARCH_LEAD] - Workspace escape trigger synced to unified pin selection state machine.
            if (Sim.activeNodeEdit) {
                Sim.exitNodeEditMode();
                return;
            }
            if (Sim._pinSelectState) {
                Sim.cancelPinMutate();
                return;
            }
        });

        ws.addEventListener('mousedown', (e) => {
            // 1. Delegated Wire Interception
            let wireTarget = e.target;
            if (!Sim.wiring.active && wireTarget && wireTarget.hasAttribute && wireTarget.hasAttribute('data-wire-index')) {
                const wireIdx = parseInt(wireTarget.getAttribute('data-wire-index'));
                if (!isNaN(wireIdx)) {
                    const w = Sim.wires[wireIdx];
                    if (w && window.InteractionHandler) {
                        const pw1 = Sim.getPortCoords(w.from.nodeId, w.from.portId);
                        const pw2 = Sim.getPortCoords(w.to.nodeId, w.to.portId);
                        if (pw1 && pw2) {
                            InteractionHandler.handleWireInteraction(e, w, pw1, pw2);
                            return; 
                        }
                    }
                }
            }

            // 2. Pan Interception
            if (e.button === 1 || e.button === 2) {
                e.preventDefault();
                isDragging = false;
                const marquee = document.getElementById('selection-marquee');
                if (marquee) marquee.style.display = 'none';
                Sim._isDraggingPan = false;
                const sx = e.clientX - View.x, sy = e.clientY - View.y;
                const onPan = (m) => { 
                    const dx = Math.abs(m.clientX - View.x - sx);
                    const dy = Math.abs(m.clientY - View.y - sy);
                    if (dx > 3 || dy > 3) Sim._isDraggingPan = true;
                    View.x = m.clientX - sx; 
                    View.y = m.clientY - sy; 
                    View.apply(); 
                };
                const stopPan = () => { 
                    document.removeEventListener('mousemove', onPan); 
                    document.removeEventListener('mouseup', stopPan); 
                    setTimeout(() => Sim._isDraggingPan = false, 50); 
                };
                document.addEventListener('mousemove', onPan);
                document.addEventListener('mouseup', stopPan);
                return;
            }

            if ((e.buttons & 2) || (e.buttons & 4) || Sim._isDraggingPan) {
                isDragging = false;
                const marquee = document.getElementById('selection-marquee');
                if (marquee) marquee.style.display = 'none';
                return;
            }

            // [AUDIT: v1.26.20 | SEC_ARCH_LEAD] - Intercept deterministic grid loop to capture custom pin boundary manipulation.
            if (e.button === 0 && Sim.activeNodeEdit && (Sim.activeNodeEdit.mode === 'pin-relocate' || Sim.activeNodeEdit.mode === 'pin-scale')) {
                if (e.target.classList.contains('port') || e.target.classList.contains('port-label')) {
                    e.stopPropagation();
                    const portEl = e.target.classList.contains('port') ? e.target : e.target.closest('.port');
                    Sim._activePinDrag = {
                        mode: Sim.activeNodeEdit.mode,
                        nodeId: Sim.activeNodeEdit.nodeId,
                        portId: portEl.dataset.port,
                        startY: e.clientY,
                        startX: e.clientX,
                        baseY: parseFloat(portEl.style.top) || 0,
                        baseX: parseFloat(portEl.style.left) || 0
                    };
                    return;
                }
            }

            // Intercept active wiring
            if (e.button === 0 && Sim.wiring.active) {
                e.stopPropagation();
                if (Sim.wiring.snapTarget) {
                    const st = Sim.wiring.snapTarget;
                    Sim.handlePortInteraction(e, st.nodeId, st.portId);
                } else {
                    // Abort on empty space
                    const s = Sim.wiring.start;
                    document.getElementById(s.nodeId)?.querySelector(`[data-port="${s.portId}"]`)?.classList.remove('selected');
                    Sim.wiring.active = false; 
                    Sim.wiring.start = null; 
                    Sim.clearSnapState();
                    WireRenderer.drawWires();
                }
                return;
            }

            if (e.target !== ws && e.target.id !== 'grid-layer') return;
            if (e.button !== 0 || e.altKey) return; 

            isDragging = true;
            const wr = ws.getBoundingClientRect();
            startX = e.clientX - wr.left;
            startY = e.clientY - wr.top;
            marquee.style.left = startX + 'px';
            marquee.style.top = startY + 'px';
            marquee.style.width = '0px';
            marquee.style.height = '0px';
            marquee.style.display = 'block';
            
            if (!e.shiftKey) {
                Sim.selection.forEach(id => document.getElementById(id)?.classList.remove('selected'));
                Sim.selection.clear();
            }
        });

        ws.addEventListener('mousemove', (e) => {
            // [AUDIT: v1.26.22 | SEC_ARCH_LEAD] - Propagate deterministic pin mutation arrays during transform frame.
            if (Sim._pinDrag) {
                e.preventDefault();
                const scale = View.scale || 1;
                const dx = (e.clientX - Sim._pinDrag.startX) / scale;
                const dy = (e.clientY - Sim._pinDrag.startY) / scale;
                
                const node = Sim.nodes.find(n => n.id === Sim._pinDrag.nodeId);
                const el = document.getElementById(node.id);
                const nw = node.customWidth || parseInt(el.style.width) || 100;
                const nh = node.customHeight || parseInt(el.style.height) || 100;

                // [AUDIT: v1.26.27 | SEC_ARCH_LEAD] - Enforced perimeter edge-clamping logic and deterministic grid tracking for dynamic collision avoidance.
                const occupiedCoords = new Set();
                if (Sim._pinDrag.mode === 'relocate') {
                    Object.entries(node.pinOverrides || {}).forEach(([opid, pos]) => {
                        if (!Sim._pinDrag.ports.includes(opid)) occupiedCoords.add(`${Math.round(pos.x)},${Math.round(pos.y)}`);
                    });
                }

                Sim._pinDrag.ports.forEach(pid => {
                    const base = Sim._pinDrag.bases[pid];
                    if (!base) return;
                    if (!node.pinOverrides[pid]) node.pinOverrides[pid] = { ...base };
                    
                    if (Sim._pinDrag.mode === 'relocate') {
                        let tx = base.x + dx;
                        let ty = base.y + dy;
                        
                        const dL = Math.abs(tx - (-6));
                        const dR = Math.abs(tx - (nw - 6));
                        const dT = Math.abs(ty - (-6));
                        const dB = Math.abs(ty - (nh - 6));
                        const minD = Math.min(dL, dR, dT, dB);
                        
                        if (minD === dL) tx = -6;
                        else if (minD === dR) tx = nw - 6;
                        else if (minD === dT) ty = -6;
                        else ty = nh - 6;

                        if (minD === dL || minD === dR) {
                            ty = Math.round(ty / 20) * 20;
                            ty = Math.max(0, Math.min(nh, ty));
                            while (occupiedCoords.has(`${tx},${ty}`) && ty <= nh + 20) ty += 20;
                        } else {
                            tx = Math.round(tx / 20) * 20;
                            tx = Math.max(0, Math.min(nw, tx));
                            while (occupiedCoords.has(`${tx},${ty}`) && tx <= nw + 20) tx += 20;
                        }
                        
                        occupiedCoords.add(`${tx},${ty}`);
                        node.pinOverrides[pid].x = tx;
                        node.pinOverrides[pid].y = ty;
                        
                    } else if (Sim._pinDrag.mode === 'scale') {
                        const distY = base.y - Sim._pinDrag.centerY;
                        const distX = base.x - Sim._pinDrag.centerX;
                        const factor = Math.max(0.1, 1 + (dy * 0.01) + (dx * 0.01));
                        node.pinOverrides[pid].y = Sim._pinDrag.centerY + (distY * factor);
                        node.pinOverrides[pid].x = Sim._pinDrag.centerX + (distX * factor);
                    }
                });
                
                if (window.UIOrchestrator) UIOrchestrator.updateNodeVisual(Sim, node);
                else Sim.updateNodeVisual(node);
                Sim.updateWireVisuals();
                return;
            }

            if (Sim._activeWireDrag) {
                e.preventDefault();
                const state = Sim._activeWireDrag;
                const mSr = document.getElementById('scene').getBoundingClientRect();
                const mx = (e.clientX - mSr.left) / View.scale;
                const my = (e.clientY - mSr.top) / View.scale;
                let val = state.isVertical ? my : mx;
                
                // [AUDIT: v1.25.17 | SEC_ARCH_LEAD] - Excised magnetic wire snapping due to user feedback; reverted to simple 10px grid alignment.
                if (Sim.snapWires) val = Math.round(val / 10) * 10;
                
                if (state.isVertical) state.wire.midY = val; else state.wire.midX = val;
                WireRenderer.drawWires();
                return;
            }

            if (!isDragging) return;
            if ((e.buttons & 2) || (e.buttons & 4) || Sim._isDraggingPan) {
                isDragging = false;
                marquee.style.display = 'none';
                return;
            }
            const wr = ws.getBoundingClientRect();
            const curX = e.clientX - wr.left;
            const curY = e.clientY - wr.top;

            const left = Math.min(startX, curX);
            const top = Math.min(startY, curY);
            const width = Math.abs(curX - startX);
            const height = Math.abs(curY - startY);

            marquee.style.left = left + 'px'; marquee.style.top = top + 'px';
            marquee.style.width = width + 'px'; marquee.style.height = height + 'px';

            // [AUDIT: v1.26.23 | SEC_ARCH_LEAD] - Dynamic intersection computation for multi-port marquee selection context.
            if (Sim._pinSelectState) {
                const nodeEl = document.getElementById(Sim._pinSelectState.nodeId);
                if (nodeEl) {
                    nodeEl.querySelectorAll('.port').forEach(p => {
                        const pr = p.getBoundingClientRect();
                        const px = (pr.left - wr.left + pr.width/2);
                        const py = (pr.top - wr.top + pr.height/2);
                        const isContained = (px >= left && px <= left + width && py >= top && py <= top + height);
                        if (isContained) {
                            Sim._pinSelectState.selected.add(p.dataset.port);
                            p.classList.add('selected-pin');
                            p.style.boxShadow = '0 0 5px #00ffaa';
                        } else if (!e.shiftKey) {
                            Sim._pinSelectState.selected.delete(p.dataset.port);
                            p.classList.remove('selected-pin');
                            p.style.boxShadow = '';
                        }
                    });
                }
                return;
            }

            Sim.nodes.forEach(n => {
                const el = document.getElementById(n.id);
                if (!el) return;
                
                // Compute logical bounds incorporating View Pan translation
                const ex = (n.x * View.scale) + View.x;
                const ey = (n.y * View.scale) + View.y;
                
                // Retrieve actual live DOM offset size, falling back to estimations if 0/undrawn
                let rawWidth = el.offsetWidth;
                let rawHeight = el.offsetHeight;
                if (!rawWidth || !rawHeight) {
                    rawWidth = n.customWidth || (n.type.includes('-8') ? 120 : 80);
                    rawHeight = n.customHeight || (n.type.includes('-8') ? 160 : (n.type.includes('-4') ? 80 : 64));
                }
                const eWidth = rawWidth * View.scale;
                const eHeight = rawHeight * View.scale;
                
                const isContained = (ex >= left && ex + eWidth <= left + width && ey >= top && ey + eHeight <= top + height);
                
                if (isContained) { Sim.selection.add(n.id); el.classList.add('selected'); }
                else if (!e.shiftKey) { Sim.selection.delete(n.id); el.classList.remove('selected'); }
            });
        });

        window.addEventListener('mouseup', () => {
            // [AUDIT: v1.26.27 | SEC_ARCH_LEAD] - Terminate drag tracking loop seamlessly while preserving selection highlight clusters.
            if (Sim._pinDrag) {
                Sim._pinDrag = null;
                Sim.autoSave();
                return;
            }

            if (Sim._activeWireDrag) {
                const state = Sim._activeWireDrag;
                Sim._activeWireDrag = null;
                const wire = state.wire;
                
                const newMidX = wire.midX;
                const newMidY = wire.midY;
                const newOrthoDir = wire.orthoDir || 'H';

                if (state.oldMidX !== newMidX || state.oldMidY !== newMidY || state.oldOrthoDir !== newOrthoDir) {
                    History.execute({
                        do: () => {
                            wire.midX = newMidX; wire.midY = newMidY; wire.orthoDir = newOrthoDir;
                            Sim.updateWireVisuals();
                        },
                        undo: () => {
                            wire.midX = state.oldMidX; wire.midY = state.oldMidY; wire.orthoDir = state.oldOrthoDir;
                            Sim.updateWireVisuals();
                        }
                    });
                }
                Sim.autoSave(); 
                History.updateButtons(); 
            }

            if (!isDragging) return;
            isDragging = false;
            marquee.style.display = 'none';
        });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for selection serialization.
     */
    copySelection() {
        if (Sim.selection.size === 0) return;
        const nodesToCopy = Sim.nodes.filter(n => Sim.selection.has(n.id));
        const wiresToCopy = Sim.wires.filter(w => Sim.selection.has(w.from.nodeId) && Sim.selection.has(w.to.nodeId));
        Sim._clipboard = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), wires: JSON.parse(JSON.stringify(wiresToCopy)) };
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for selection instantiation.
     */
    pasteSelection() {
        if (!Sim._clipboard || !Sim._clipboard.nodes) return;
        const idMap = {};
        const newNodes = Sim._clipboard.nodes.map(n => {
            const newId = 'node-' + Math.random().toString(36).substr(2, 9);
            idMap[n.id] = newId;
            n.x += Sim.gridSize || 20;
            n.y += Sim.gridSize || 20;
            const cloned = JSON.parse(JSON.stringify(n));
            cloned.id = newId;
            return cloned;
        });

        const newWires = Sim._clipboard.wires.map(w => {
            const nw = {
                from: { nodeId: idMap[w.from.nodeId], portId: w.from.portId },
                to: { nodeId: idMap[w.to.nodeId], portId: w.to.portId },
                orthoDir: w.orthoDir
            };
            if (w.midX !== undefined) nw.midX = w.midX + 20;
            if (w.midY !== undefined) nw.midY = w.midY + 20;
            return nw;
        });

        History.execute(new PasteCommand(newNodes, newWires));

        Sim.selection.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('selected');
        });
        Sim.selection.clear();

        newNodes.forEach(n => {
            Sim.selection.add(n.id);
            const el = document.getElementById(n.id);
            if (el) el.classList.add('selected');
        });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for global clipboard listeners.
     */
    initClipboardListeners() {
        window.addEventListener('keydown', (e) => {
            // Prevent interfering with modal inputs or text fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();
            if (e.ctrlKey && key === 'c') {
                e.preventDefault();
                this.copySelection();
            }
            if (e.ctrlKey && key === 'v') {
                e.preventDefault();
                this.pasteSelection();
            }
            if (key === 'delete' || key === 'backspace') {
                if (Sim.selection.size > 0) {
                    const nodesToDelete = Sim.nodes.filter(n => Sim.selection.has(n.id));
                    nodesToDelete.forEach(n => History.execute(new DeleteNodeCommand(n)));
                    Sim.selection.clear();
                }
            }
        });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for physical wire creation.
     */
    // [AUDIT: v1.23.62 | SEC_ARCH_LEAD] - Workflow 10: Strict Bus Widths (SBW).
    createWire(sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
        try {
            const srcNode = Sim.nodes.find(n => n.id === sourceNodeId);
            const tgtNode = Sim.nodes.find(n => n.id === targetNodeId);
            
            if (!srcNode || !tgtNode) return false;

            const getWidth = (node, portId) => {
                if (node.type.includes('-')) return parseInt(node.type.split('-')[1]) || 1;
                if (node.isCustom && Sim.library[node.type]) {
                    const lib = Sim.library[node.type];
                    const isIn = portId.startsWith('in');
                    const ioNodes = lib.nodes.filter(x => x.type.startsWith(isIn ? 'IN-' : 'OUT-') || (isIn && x.type.startsWith('PROBE-')));
                    ioNodes.sort((a, b) => a.y - b.y);
                    
                    let bitIdx = 0;
                    for (const io of ioNodes) {
                        const bits = parseInt(io.type.split('-')[1]) || 1;
                        const bPref = isIn ? 'in' : 'out';
                        if (portId === `${bPref}${bitIdx}`) return bits;
                        bitIdx += bits;
                    }
                }
                return 1;
            };

            const srcWidth = getWidth(srcNode, sourcePortId);
            const tgtWidth = getWidth(tgtNode, targetPortId);

            if (srcWidth !== tgtWidth) {
                console.error(`[BUS_WIDTH_MISMATCH] Cannot connect ${srcWidth}-bit output to ${tgtWidth}-bit input.`);
                throw new Error(`[BUS_WIDTH_MISMATCH] Halting connection to prevent memory boundary overflow.`);
            }

            const wire = {
                id: 'wire-' + Math.random().toString(36).substr(2, 9),
                from: { nodeId: sourceNodeId, portId: sourcePortId },
                to: { nodeId: targetNodeId, portId: targetPortId }
            };
            if (window.History) {
                History.execute(new AddWireCommand(wire));
            } else {
                Sim.wires.push(wire);
                Sim.updateWireVisuals();
            }
            return true;
        } catch (e) {
            console.error('[createWire Exception]', e);
            if (window.Sim && Sim.wiring) {
                Sim.wiring.active = false;
                Sim.wiring.start = null;
                if (typeof Sim.clearSnapState === 'function') Sim.clearSnapState();
            }
            throw e;
        }
    }
};

window.InteractionHandler = InteractionHandler;
