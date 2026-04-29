/**
 * Interaction Handler Module
 */
const InteractionHandler = {
    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for node translation.
     * @ARCH: UI_CONTROLLER
     * @IO: UI_INTERACTION
     * @STATE: NODE_POSITION
     * @INTENT: Handle mouse-driven node translation and group dragging for selected components.
     */
    handleNodeDrag(e, node, div) {
        console.debug('[DEBUG] Node onmousedown triggered. Node ID:', node.id, '| Button pressed:', e.button);
        // [AUDIT: SEC_ARCH_LEAD] - Prevent displacement of node topology when localized edit mode is active.
        if (Sim.activeNodeEdit && Sim.activeNodeEdit.node.id === node.id) return;

        if (e.target.classList.contains('port')) {
            // [AUDIT: SEC_ARCH_LEAD] - EXIT_TRACE: Drag aborted, port interaction detected.
            return;
        }
        
        if (e.button === 2) { 
            e.preventDefault(); e.stopPropagation();
            const menu = document.getElementById('context-menu');
            if (!menu) {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Context menu aborted, DOM target missing.
                return;
            }

            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Context menu parity: expose component-specific parameterization and macro geometry endpoints on canvas instances.
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Node Prefs extension: spatial edit mode for I/O bounds and internal pin layout arrays.
            const isNative = !node.isCustom;
            const renameAction = `onclick="Sim.modal('Rename Component','Label:','prompt',v=>{if(v && v.trim()!==''){node.label=v.trim(); const l=document.getElementById('${node.id}').querySelector('.gate-label'); if(l)l.innerText=node.label; Sim.autoSave();}},'${node.label}'); document.getElementById('context-menu').style.display='none';"`;
            const editAction = isNative ? '' : `onclick="Sim.uiEditChip('${node.type}'); document.getElementById('context-menu').style.display='none';"`;
            const geomAction = isNative ? '' : `onclick="Sim.uiScaleChip('${node.type}'); document.getElementById('context-menu').style.display='none';"`;
            
            let configOption = '';
            let nodePrefs = '';
            if (node.type === 'CLOCK') {
                configOption = `<div class="menu-item" onclick="Sim.handleNodeDblClick(new Event('dblclick'), Sim.nodes.find(n=>n.id==='${node.id}'), document.getElementById('${node.id}')); document.getElementById('context-menu').style.display='none';">Configure Frequency</div>`;
            } else if (node.type.startsWith('IN-') || node.type.startsWith('OUT-')) {
                if (node.type !== 'IN-1' && node.type !== 'OUT-1') {
                    configOption = `<div class="menu-item" onclick="Sim.uiEnterValue('${node.id}'); document.getElementById('context-menu').style.display='none';">Set Input Value</div>`;
                }
                nodePrefs = `
                    <div class="menu-item" style="color:var(--accent); font-weight:bold; cursor:default;">Node Prefs:</div>
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="Sim.enterNodeEditMode('${node.id}', 'pins'); document.getElementById('context-menu').style.display='none';">↳ Edit Pin Layout</div>
                    <div class="menu-item" style="padding-left:15px; color:#aaa;" onclick="Sim.enterNodeEditMode('${node.id}', 'icon'); document.getElementById('context-menu').style.display='none';">↳ Edit Icon Scale</div>
                `;
            }

            menu.innerHTML = `
                ${configOption}
                ${nodePrefs}
                <div class="menu-item" ${renameAction}>Rename</div>
                ${!isNative ? `<div class="menu-item" ${geomAction}>Set Geometry</div>` : ''}
                <div class="menu-item ${isNative ? 'disabled' : ''}" ${editAction}>Edit Internals</div>
                <div class="menu-item danger" onclick="History.execute(new DeleteNodeCommand(Sim.nodes.find(n=>n.id==='${node.id}'))); document.getElementById('context-menu').style.display='none';">Delete</div>
            `;
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Context menu displayed for node ${node.id}.
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
                                   
        // Isolate boundary wires (exactly ONE end is in the selection) that have custom routing
        const boundaryWires = Sim.wires.filter(w => (selectedNodeIds.has(w.from.nodeId) ^ selectedNodeIds.has(w.to.nodeId)) && (w.midX !== undefined || w.midY !== undefined))
                                       .map(w => ({ wire: w, ox: w.midX, oy: w.midY }));

        const onMove = (m) => {
            const dx = (m.clientX - startX) / View.scale;
            const dy = (m.clientY - startY) / View.scale;
            
            let snapDx = dx;
            let snapDy = dy;
            
            // Calculate global snapped delta from the anchor node to keep group formation rigid
            if (Sim.snapNodes && dragSet.length > 0) {
                const lead = dragSet[0];
                const nx = Math.round((lead.ox + dx) / 20) * 20;
                const ny = Math.round((lead.oy + dy) / 20) * 20;
                snapDx = nx - lead.ox;
                snapDy = ny - lead.oy;
            }

            dragSet.forEach(item => {
                item.node.x = item.ox + snapDx;
                item.node.y = item.oy + snapDy;
                Sim.updateNodePosition(item.node, item.div);
            });
            
            dragWires.forEach(item => {
                if (item.ox !== undefined) item.wire.midX = item.ox + snapDx;
                if (item.oy !== undefined) item.wire.midY = item.oy + snapDy;
            });
            
            // Delete custom midpoints for boundary wires so the auto-router takes over cleanly
            boundaryWires.forEach(item => {
                delete item.wire.midX;
                delete item.wire.midY;
            });

            WireRenderer.drawWires();
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            const moves = dragSet.filter(item => Math.abs(item.node.x - item.ox) > 1 || Math.abs(item.node.y - item.oy) > 1)
                                 .map(item => ({ id: item.node.id, ox: item.ox, oy: item.oy, nx: item.node.x, ny: item.node.y }));
            
            const wMoves = dragWires.map(item => ({ wire: item.wire, ox: item.ox, oy: item.oy, nx: item.wire.midX, ny: item.wire.midY }));
            // Push boundary wire deletions to history (nx/ny = undefined) so CTRL-Z perfectly restores the routing corners
            const boundaryMoves = boundaryWires.map(item => ({ wire: item.wire, ox: item.ox, oy: item.oy, nx: undefined, ny: undefined }));

            if (moves.length > 0) History.execute(new MoveNodeCommand(moves, [...wMoves, ...boundaryMoves]));
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node translation finalized. Commands dispatched: ${moves.length}.
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp, { once: true });
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node drag lifecycle initialized for ${node.id}.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical state toggle.
     * @ARCH: SIGNAL_INJECTOR
     * @IO: UI_INTERACTION
     * @STATE: NODE_STATE
     * @INTENT: Toggle logical state of input nodes and frequency of clock nodes on click.
     */
    handleNodeClick(e, node, div, bits) {
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node interaction complete for ${node.id}.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for configuration modal activation.
     * @ARCH: UI_ORCHESTRATOR
     * @IO: UI_INTERACTION
     * @ARCH: UI_MODAL
     * @INTENT: Trigger configuration modals for components (clocks, multi-bit inputs) on double-click.
     */
    handleNodeDblClick(e, node, div) {
        Sim.wakeQueue();
        e.stopPropagation();
        if (e.target.classList.contains('port')) return;

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
        } else if (node.type.startsWith('IN-') && node.type !== 'IN-1') {
            Sim.uiEnterValue(node.id);
        } else if (node.type !== 'JUNCTION') {
            Sim.modal('Rename Component', 'Label:', 'prompt', (v) => {
                if (v && v.trim() !== '') {
                    node.label = v.trim();
                    const lbl = div.querySelector('.gate-label');
                    if (lbl) lbl.innerText = node.label;
                    if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
                        if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(node);
                        Sim.updateWireVisuals();
                    }
                    Sim.autoSave();
                }
            }, node.label);
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Modal configuration triggered for ${node.id}.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for wire splitting.
     * @ARCH: NETLIST_MODIFIER
     * @ARCH: NETLIST_MUTATION
     * @INTENT: Split an existing wire by inserting a logical JUNCTION node at the specified coordinates.
     */
    _splitWire(fromNodeId, fromPortId, toNodeId, toPortId, clickX, clickY) {
        const wire = Sim.wires.find(w => w.from.nodeId === fromNodeId && w.to.nodeId === toNodeId && w.from.portId === fromPortId && w.to.portId === toPortId);
        if (!wire) return;

        const junction = Sim.addNode('JUNCTION', clickX, clickY); 
        const oldTo = { ...wire.to };
        const newWire = { from: { nodeId: junction.id, portId: 'j' }, to: oldTo };

        History.execute({
            do: () => {
                wire.to = { nodeId: junction.id, portId: 'j' };
                if (!Sim.wires.includes(newWire)) Sim.wires.push(newWire);
                Sim.updateWireVisuals();
            },
            undo: () => {
                wire.to = oldTo;
                Sim.wires = Sim.wires.filter(w => w !== newWire);
                Sim.updateWireVisuals();
            }
        });
        Sim.autoSave();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire split successful at (${clickX}, ${clickY}).
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for wire context manipulation.
     * @ARCH: UI_CONTROLLER
     * @IO: UI_INTERACTION
     * @ARCH: NETLIST_MUTATION
     * @INTENT: Manage context-menu actions and manual routing adjustments for individual wires.
     */
    handleWireInteraction(e, wire, p1, p2) {
        console.debug('[DEBUG] handleWireInteraction invoked. Button:', e.button);
        if (e.button === 2) {
            e.preventDefault(); e.stopPropagation();
            const menu = document.getElementById('context-menu');
            if (!menu) return;

            menu.style.display = 'block';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';

            const sr = document.getElementById('scene').getBoundingClientRect();
            const clickX = (e.clientX - sr.left) / View.scale;
            const clickY = (e.clientY - sr.top) / View.scale;

            menu.innerHTML = `
                <div class="menu-item" onclick="InteractionHandler._splitWire(${wire.from.nodeId ? `'${wire.from.nodeId}'` : null}, '${wire.from.portId}', ${wire.to.nodeId ? `'${wire.to.nodeId}'` : null}, '${wire.to.portId}', ${clickX}, ${clickY}); document.getElementById('context-menu').style.display='none';">Add Node Here</div>
                <div class="menu-item danger" onclick="History.execute(new DeleteWireCommand(Sim.wires.find(w => w.from.nodeId === '${wire.from.nodeId}' && w.to.nodeId === '${wire.to.nodeId}'))); document.getElementById('context-menu').style.display='none';">Delete Wire</div>
            `;
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
                const junction = Sim.addNode('JUNCTION', clickX, clickY); // Already registers AddNodeCommand
                const oldTo = { ...wire.to };
                const newWire = { from: { nodeId: junction.id, portId: 'j' }, to: oldTo };

                // Atomically track the wire modifications
                History.execute({
                    do: () => {
                        wire.to = { nodeId: junction.id, portId: 'j' };
                        if (!Sim.wires.includes(newWire)) Sim.wires.push(newWire);
                        Sim.updateWireVisuals();
                    },
                    undo: () => {
                        wire.to = oldTo;
                        Sim.wires = Sim.wires.filter(w => w !== newWire);
                        Sim.updateWireVisuals();
                    }
                });
                
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire interaction handled for ${wire.id}.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for marquee selection initialization.
     * @ARCH: SELECTION_CONTROLLER
     * @IO: UI_INTERACTION
     * @STATE: SELECTION_STATE
     * @INTENT: Initialize and manage the marquee selection box for group operations on nodes.
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

            menu.innerHTML = `
                <div class="menu-item" style="color:var(--wire-on); font-weight:bold" onclick="Sim.addNode('IN-1', ${x}, ${y}); document.getElementById('context-menu').style.display='none';">Spawn Input</div>
                <div class="menu-item" style="color:var(--accent); font-weight:bold" onclick="Sim.addNode('OUT-1', ${x}, ${y}); document.getElementById('context-menu').style.display='none';">Spawn Output</div>
                <div class="menu-item" onclick="Sim.addNode('CLOCK', ${x}, ${y}); document.getElementById('context-menu').style.display='none';">Spawn Clock</div>
            `;
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
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Escape hatch for parametric node edit mode via workspace double-click.
            if (Sim.activeNodeEdit) {
                Sim.exitNodeEditMode();
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

        window.addEventListener('mousemove', (e) => {
            if (Sim._activeWireDrag) {
                e.preventDefault();
                const state = Sim._activeWireDrag;
                const mSr = document.getElementById('scene').getBoundingClientRect();
                const mx = (e.clientX - mSr.left) / View.scale;
                const my = (e.clientY - mSr.top) / View.scale;
                let val = state.isVertical ? my : mx;
                if (Sim.snapWires) val = Math.round(val / 20) * 20;
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

            Sim.nodes.forEach(n => {
                const el = document.getElementById(n.id);
                if (!el) return;
                
                // Compute logical bounds incorporating View Pan translation
                const ex = (n.x * View.scale) + View.x;
                const ey = (n.y * View.scale) + View.y;
                const eWidth = (n.type.includes('-8') ? 120 : 80) * View.scale;
                const eHeight = (n.type.includes('-8') ? 160 : (n.type.includes('-4') ? 80 : 64)) * View.scale;
                
                const isContained = (ex >= left && ex + eWidth <= left + width && ey >= top && ey + eHeight <= top + height);
                
                if (isContained) { Sim.selection.add(n.id); el.classList.add('selected'); }
                else if (!e.shiftKey) { Sim.selection.delete(n.id); el.classList.remove('selected'); }
            });
        });

        window.addEventListener('mouseup', () => {
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Marquee selection listeners initialized.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for selection serialization.
     * @ARCH: CLIPBOARD_ENGINE
     * @STATE: CLIPBOARD_MANAGEMENT
     * @INTENT: Serialize selected nodes and wires into the internal clipboard buffer.
     */
    copySelection() {
        if (Sim.selection.size === 0) return;
        const nodesToCopy = Sim.nodes.filter(n => Sim.selection.has(n.id));
        const wiresToCopy = Sim.wires.filter(w => Sim.selection.has(w.from.nodeId) && Sim.selection.has(w.to.nodeId));
        Sim._clipboard = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), wires: JSON.parse(JSON.stringify(wiresToCopy)) };
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Copied ${nodesToCopy.length} nodes to clipboard.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for selection instantiation.
     * @ARCH: NETLIST_MODIFIER
     * @ARCH: NETLIST_MUTATION
     * @STATE: SELECTION_STATE
     * @INTENT: Instantiate and reconnect components from the internal clipboard into the active netlist.
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Selection pasted and re-indexed.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for global clipboard listeners.
     * @ARCH: INTERACTION_HANDLER
     * @IO: KEYBOARD_INTERACTION
     * @INTENT: Register global keyboard shortcuts for clipboard (Ctrl+C/V) and deletion operations.
     */
    initClipboardListeners() {
        window.addEventListener('keydown', (e) => {
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Clipboard listeners registered.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for physical wire creation.
     * @ARCH: NETLIST_INTERCONNECT
     * @IO: SIGNAL_INTERCONNECT
     * @INTENT: Establish a logical bridge between node ports with strict width parity enforcement.
     */
    // [AUDIT: v1.23.62 | SEC_ARCH_LEAD] - Workflow 10: Strict Bus Widths (SBW).
    createWire(sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
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
        Sim.wires.push(wire);
        Sim.updateWireVisuals();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire created successfully between ${sourceNodeId} and ${targetNodeId}.
        return true;
    }
};

window.InteractionHandler = InteractionHandler;
