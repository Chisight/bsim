/**
 * Simulator Core v1.23.90 (Modular Professional)
 * FIXED: Eradicated pseudo-element dimension snapping and rigidly clamped pin-container bounding offsets.
 */
const Sim = {
    nodes: [],
    wires: [],
    library: {},
    workspaceStack: [],
    activeEditingChip: null,
    activeSplitChip: null,
    tabs: [{ id: 'tab-1', name: 'Main', nodes: [], wires: [], historyStack: [], historyIndex: -1, activeSplitChip: null, splitDirection: 'right' }],
    activeTabId: 'tab-1',
    wireMap: new Map(),
    _netlistDirty: true, // [wasm] flag to indicate that the netlist needs to be recompiled

    // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Centralized state sanitization methods to prevent reference crashes.
    _cleanNode(n) {
        if (!n || !n.id) return null;
        try {
            return JSON.parse(JSON.stringify({
                id: n.id, type: n.type, x: n.x, y: n.y, label: n.label,
                val: n.val, state: n.state, outputs: n.outputs, isCustom: n.isCustom,
                freq: n.freq, interval: n.interval, lastTick: n.lastTick, meta: n.meta,
                customWidth: n.customWidth, customHeight: n.customHeight,
                pinX: n.pinX, pinY: n.pinY, pinW: n.pinW, pinH: n.pinH,
                infoX: n.infoX, infoY: n.infoY, infoW: n.infoW, infoH: n.infoH,
                labelX: n.labelX, labelY: n.labelY, labelW: n.labelW, labelH: n.labelH,
                _lastX: n._lastX, _lastY: n._lastY
            }));
        } catch (e) { console.error("Data sanitization fault on node:", e); return null; }
    },

    _cleanWire(w) {
        if (!w || !w.from || !w.to) return null;
        try {
            return JSON.parse(JSON.stringify({
                from: { nodeId: w.from.nodeId, portId: w.from.portId },
                to: { nodeId: w.to.nodeId, portId: w.to.portId },
                midX: w.midX, midY: w.midY, orthoDir: w.orthoDir
            }));
        } catch (e) { console.error("Data sanitization fault on wire:", e); return null; }
    },
    showToasts: true,
    debugToasts: false,
    useWasm: true,
    _toastTimer: null,
    shortCircuitStrikes: 0,

    // Preferences Logic
    snapNodes: true,
    snapWires: true,
    confirmDelete: true,
    showStats: true,
    showTooltips: true,
    tutorialMode: true,
    hudPos: 'top-right',

    wiring: { active: false, start: null, mouseX: 0, mouseY: 0, snapTarget: null },
    eventQueue: new Set(),
    selection: new Set(),
    _transitions: new Map(),
    _clipboard: null,
    MAX_TRANSITIONS: 100,

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for simulation kernel bootstrap.
     * @ARCH: KERNEL_ORCHESTRATOR
     * @IO: WORKSPACE_INITIALIZATION
     * @INTENT: Initialize simulation kernel, viewport, and global event listeners for the workspace.
     */
    init() {
        let running = false;
        this.wakeQueue = () => { if (!running) { running = true; requestAnimationFrame(runQueue); } };
        const runQueue = () => {
            const now = performance.now();
            
            const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
            const checkPure = (nodes) => nodes.every(n => {
                if (validWasmTypes.has(n.type)) return true;
                if (n.isCustom && this.library[n.type]) return checkPure(this.library[n.type].nodes);
                return false;
            });
            const isPureNative = checkPure(this.nodes);

            Sim.nodes.forEach(n => {
                if (n.type === 'CLOCK' && n.freq > 0 && !isPureNative) {
                    // Guard against timeline desyncs from autosave reloads
                    if (n.lastTick > now) n.lastTick = now;
                    if (now - n.lastTick >= n.interval / 2) {
                        n.state = n.state ? 0 : 1; n.lastTick = now;
                        Sim.eventQueue.add(n);
                    }
                }
            });
            if (Sim.eventQueue.size > 0) Sim.processQueue();
            if (Sim.eventQueue.size === 0) Sim._transitions.clear(); // Clear flip history when stable
            if (Sim.nodes.some(n => n.type === 'CLOCK') || Sim.eventQueue.size > 0) requestAnimationFrame(runQueue); else running = false;
        };

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
        });

        View.init();
        this.loadAutoSave();
        this.updateTabsUI();
        this.updateSidebar();
        this.updateHUD();
        this.updateLibraryUI();
        this.applyKeybinds();
        this.refreshTooltips();
        this.wakeQueue();

        window.addEventListener('mousemove', (e) => {
            // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Capture viewport-relative board coordinates for HUD telemetry.
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

            if (!this.wiring.active) return;
            const SNAP_R = 60;
            let nearest = null, nearestDist = SNAP_R;
            document.querySelectorAll('.port').forEach(portEl => {
                const r = portEl.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

                if (dist < nearestDist) {
                    const nodeEl = portEl.closest('.gate');
                    if (nodeEl) {
                        const isStartPort = (nodeEl.id === this.wiring.start.nodeId && portEl.dataset.port === this.wiring.start.portId);
                        if (!isStartPort) {
                            nearestDist = dist;
                            nearest = { nodeId: nodeEl.id, portId: portEl.dataset.port, el: portEl };
                        }
                    }
                }
            });
            this.wiring.mouseX = e.clientX;
            this.wiring.mouseY = e.clientY;

            // CLEAR PREVIOUS SNAP ALWAYS
            if (this.wiring.snapTarget && this.wiring.snapTarget.el !== nearest?.el) {
                this.wiring.snapTarget.el.classList.remove('snap-hover');
            }

            this.wiring.snapTarget = nearest;
            if (nearest) nearest.el.classList.add('snap-hover');

            this.updateWireVisuals();
        });
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Simulation kernel initialization complete.
    },

    /**
     * @IO: UI_FEEDBACK
     * @STATE: TOOLTIP_ENGINE
     * @INTENT: Update dynamic tooltip descriptions based on node state and type.
     */
    refreshTooltips() {
        this.nodes.forEach(n => {
            const el = document.getElementById(n.id);
            if (el) {
                if (!this.showTooltips) {
                    el.title = '';
                    return;
                }
                if (n._oscillating) {
                    el.title = '⚠ Oscillating loop detected';
                    return;
                }
                let desc = n.type + ' Gate';
                if (n.type.startsWith('IN-')) desc = `Input Node (${n.type.split('-')[1]}-bit). Click to toggle state.`;
                else if (n.type.startsWith('OUT-')) desc = `Output Display (${n.type.split('-')[1]}-bit).`;
                else if (n.type === 'CLOCK') desc = `Clock Generator (${n.freq} Hz). Double-click to configure.`;
                else if (n.type === 'JUNCTION') desc = `Wire Junction`;
                else if (n.isCustom) desc = `Custom Chip: ${n.type}`;

                el.title = desc;
            }
        });
    },

    /**
     * @IO: KEYBOARD_INTERACTION
     * @ARCH: COMMAND_DISPATCHER
     * @INTENT: Map global hotkeys to simulator commands (Undo, Redo, Delete).
     */
    applyKeybinds() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const key = e.key.toLowerCase();
            const code = e.code;
            if ((e.ctrlKey || e.metaKey) && (key === 'z' || code === 'KeyZ')) { e.preventDefault(); History.undo(); }
            if ((e.ctrlKey || e.metaKey) && (key === 'y' || code === 'KeyY')) { e.preventDefault(); History.redo(); }
            if (key === 'delete' || key === 'backspace' || code === 'Delete' || code === 'Backspace') {
                if (this.selection.size > 0) {
                    const del = () => {
                        this.selection.forEach(id => { const n = Sim.nodes.find(x => x.id === id); if (n) History.execute(new DeleteNodeCommand(n)); });
                        this.selection.clear();
                    };
                    if (this.confirmDelete) {
                        this.modal('Delete Components', `Delete ${this.selection.size} selected items?`, 'danger', ok => { if (ok) del(); });
                    } else del();
                }
            }
        });
    },

    /**
     * @STATE: CLIPBOARD_MANAGEMENT
     * @INTENT: Snapshot the current selection into the clipboard buffer.
     */
    copySelection() {
        if (this.selection.size === 0) return;
        const nodesToCopy = this.nodes.filter(n => this.selection.has(n.id));
        const wiresToCopy = this.wires.filter(w => this.selection.has(w.from.nodeId) && this.selection.has(w.to.nodeId));
        this._clipboard = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), wires: JSON.parse(JSON.stringify(wiresToCopy)) };
    },

    /**
     * @ARCH: NETLIST_MUTATION
     * @INTENT: Instantiate components from the clipboard with new unique identifiers.
     */
    pasteSelection() {
        if (!this._clipboard || !this._clipboard.nodes) return;
        const idMap = {};
        const newNodes = this._clipboard.nodes.map(n => {
            const newId = 'node-' + Math.random().toString(36).substr(2, 9);
            idMap[n.id] = newId;
            n.x += 20; n.y += 20; // Cascade Logic
            const cloned = JSON.parse(JSON.stringify(n));
            cloned.id = newId; return cloned;
        });
        const newWires = this._clipboard.wires.map(w => ({
            from: { nodeId: idMap[w.from.nodeId], portId: w.from.portId },
            to: { nodeId: idMap[w.to.nodeId], portId: w.to.portId }
        }));
        History.execute(new PasteCommand(newNodes, newWires));
        this.selection.forEach(id => document.getElementById(id)?.classList.remove('selected'));
        this.selection.clear();
        newNodes.forEach(n => { this.selection.add(n.id); document.getElementById(n.id)?.classList.add('selected'); });
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Align persistence telemetry with MRAP taxonomy.
     * @ARCH: PERSISTENCE_MANAGER
     * @STATE: WORKSPACE_SERIAL
     * @INTENT: Periodically synchronize the current workspace state to local storage for crash recovery.
     */
    autoSave() {
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => {
            try {
                const cNodes = this.nodes.map(n => this._cleanNode(n)).filter(n => n !== null);
                const cWires = this.wires.map(w => this._cleanWire(w)).filter(w => w !== null);
                
                const wsStack = (this.workspaceStack || []).map(ws => ({ 
                    nodes: (ws.nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null), 
                    wires: (ws.wires || []).map(w => this._cleanWire(w)).filter(w => w !== null) 
                }));
                
                if (this.activeEditingChip && wsStack.length > 0) {
                    this.library[this.activeEditingChip] = { nodes: cNodes, wires: cWires };
                }
                
                const safeLib = {};
                Object.keys(this.library).forEach(k => {
                    if (this.library[k]) {
                        safeLib[k] = {
                            nodes: (this.library[k].nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null),
                            wires: (this.library[k].wires || []).map(w => this._cleanWire(w)).filter(w => w !== null),
                            folder: this.library[k].folder || ''
                        };
                    }
                });

                // [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Synchronize current active context into tab state before serialization.
                const activeTab = this.tabs.find(t => t.id === this.activeTabId);
                if (activeTab && this.workspaceStack.length === 0) {
                    activeTab.nodes = cNodes;
                    activeTab.wires = cWires;
                    if (window.History) {
                        activeTab.historyStack = History.stack;
                        activeTab.historyIndex = History.index;
                    }
                }

                const safeTabs = this.tabs.map(t => ({
                    id: t.id, name: t.name,
                    nodes: (t.id === this.activeTabId && this.workspaceStack.length === 0) ? cNodes : (t.nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null),
                    wires: (t.id === this.activeTabId && this.workspaceStack.length === 0) ? cWires : (t.wires || []).map(w => this._cleanWire(w)).filter(w => w !== null),
                    historyStack: t.historyStack || [], historyIndex: t.historyIndex !== undefined ? t.historyIndex : -1,
                    activeSplitChip: t.id === this.activeTabId ? this.activeSplitChip : t.activeSplitChip,
                    splitDirection: t.id === this.activeTabId ? (document.getElementById('main')?.classList.contains('split-left') ? 'left' : (document.getElementById('main')?.classList.contains('split-right') ? 'right' : (this.activeSplitChip ? 'popup' : null))) : t.splitDirection
                }));

                const project = { 
                    nodes: wsStack.length > 0 ? wsStack[0].nodes : cNodes, 
                    wires: wsStack.length > 0 ? wsStack[0].wires : cWires, 
                    library: safeLib, directories: this.directories || [], workspaceStack: wsStack, activeEditingChip: this.activeEditingChip,
                    tabs: safeTabs, activeTabId: this.activeTabId,
                    // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - Append toast positioning to auto-save preferences payload.
                    prefs: { snapNodes: this.snapNodes, snapWires: this.snapWires, confirmDelete: this.confirmDelete, showStats: this.showStats, showTooltips: this.showTooltips, tutorialMode: this.tutorialMode, hudPos: this.hudPos, toastPos: this.toastPos } 
                };
                localStorage.setItem('bsim_autosave', JSON.stringify(project));
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: AutoSave operation finalized.
            } catch (e) {
                console.error("[AutoSave] Serialization Failure:", e);
            }
        }, 500);
    },

    /**
     * @IO: LOCAL_STORAGE
     * @ARCH: WORKSPACE_RECOVERY
     * @INTENT: Restore the last known workspace state and library from local storage on boot.
     */
    loadAutoSave() {
        try {
            const raw = localStorage.getItem('bsim_autosave');
            if (raw) {
                let parsed = JSON.parse(raw);
                if (window.ProjectManager) parsed = ProjectManager._normalizeData(parsed);
                this.library = parsed.library || {};
                if (parsed.prefs) Object.assign(this, parsed.prefs);
                
                this.workspaceStack = parsed.workspaceStack || [];
                this.activeEditingChip = parsed.activeEditingChip || null;
                this.directories = parsed.directories || [];
                
                // [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Hydrate multi-tab states from persistence blob.
                if (parsed.tabs && parsed.tabs.length > 0) {
                    this.tabs = parsed.tabs;
                    this.activeTabId = parsed.activeTabId || this.tabs[0].id;
                } else {
                    this.tabs = [{ id: 'tab-1', name: 'Main', nodes: parsed.nodes || [], wires: [], historyStack: [], historyIndex: -1 }];
                    this.activeTabId = 'tab-1';
                }
                
                let activeNodes = parsed.nodes;
                let activeWires = parsed.wires;
                
                if (this.workspaceStack.length === 0) {
                    const t = this.tabs.find(x => x.id === this.activeTabId);
                    if (t) {
                        activeNodes = t.nodes; activeWires = t.wires;
                        if (window.History) {
                            History.stack = t.historyStack ? [...t.historyStack] : [];
                            History.index = t.historyIndex !== undefined ? t.historyIndex : -1;
                        }
                        if (t.activeSplitChip) {
                            setTimeout(() => {
                                this.uiSplitEditor(t.splitDirection || 'right', t.activeSplitChip, true);
                            }, 100);
                        }
                    }
                }
                
                // Restore Chip Editor context if we refreshed while editing
                if (this.activeEditingChip && this.library[this.activeEditingChip]) {
                    activeNodes = this.library[this.activeEditingChip].nodes;
                    activeWires = this.library[this.activeEditingChip].wires;
                    const exitBtn = document.getElementById('btn-exit-chip');
                    if (exitBtn) exitBtn.style.display = 'inline';
                } else if (this.activeEditingChip) {
                    // Fallback to prevent crash if library chip was somehow deleted while editing
                    this.activeEditingChip = null;
                    this.workspaceStack = [];
                }

                // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Hydrate nodes using unified centralized sanitization.
                if (Array.isArray(activeNodes)) {
                    activeNodes.forEach(n => { 
                        const c = this._cleanNode(n);
                        if (c) {
                            this.nodes.push(c); 
                            if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(c); 
                        }
                    });
                }
                
                // [AUDIT: v1.23.93 | SEC_ARCH_LEAD] - Legacy netlist migration: Auto-resolve absolute pin descriptors to sequential zero-indexed vectors for custom macros, and sanitize corrupted geometric midpoints.
                const migrateWires = (wires, ctxNodes) => {
                    if (!Array.isArray(wires)) return;
                    wires.forEach(w => {
                        const fromNode = ctxNodes.find(n => n.id === w.from.nodeId);
                        const toNode = ctxNodes.find(n => n.id === w.to.nodeId);
                        
                        if (fromNode && fromNode.isCustom) {
                            if (w.from.portId === 'in') w.from.portId = 'in0';
                            if (w.from.portId === 'out') w.from.portId = 'out0';
                            if (w.from.portId === 'a') w.from.portId = 'in0';
                            if (w.from.portId === 'b') w.from.portId = 'in1';
                        }
                        if (toNode && toNode.isCustom) {
                            if (w.to.portId === 'in') w.to.portId = 'in0';
                            if (w.to.portId === 'out') w.to.portId = 'out0';
                            if (w.to.portId === 'a') w.to.portId = 'in0';
                            if (w.to.portId === 'b') w.to.portId = 'in1';
                        }
                        
                        if (w.midX === null || isNaN(w.midX)) delete w.midX;
                        if (w.midY === null || isNaN(w.midY)) delete w.midY;
                    });
                };
                
                migrateWires(activeWires, this.nodes);
                if (this.library) {
                    Object.values(this.library).forEach(chip => {
                        if (chip && chip.wires && chip.nodes) migrateWires(chip.wires, chip.nodes);
                    });
                }

                this.wires = Array.isArray(activeWires) ? JSON.parse(JSON.stringify(activeWires)) : [];
                this.updateWireVisuals();
                this.seedQueue();
                this.processQueue();
            }
        } catch (e) {
            console.error("[AutoSave] Load failed:", e);
        }
    },

    /**
     * @ARCH: COMPONENT_ADAPTER
     * @STATE: PORT_SIGNAL_MAPPING
     * @INTENT: Aggregate signals for macro internal ports during hierarchical simulation.
     */
    _assembleChipInputs(chipDef, getDriveFn) {
        const ext = {};
        const inNodes = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        let cIn = 0;
        inNodes.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            if (bits === 1) {
                ext[p.id] = getDriveFn(`in${cIn++}`);
            } else {
                const arr = new Array(bits).fill(0);
                for (let i = 0; i < bits; i++) {
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Map from top (MSB) to bottom (LSB) to fix upside-down bus assignment.
                    arr[bits - 1 - i] = getDriveFn(`in${cIn++}`); 
                }
                ext[p.id] = arr;
            }
        });
        return ext;
    },

    /**
     * @ARCH: COMPONENT_ADAPTER
     * @STATE: PORT_SIGNAL_MAPPING
     * @INTENT: Distribute internal signals to macro output terminals.
     */
    _mapChipOutputs(chipDef, internalRes) {
        const mapped = {};
        const outNodes = chipDef.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        let cOut = 0;
        outNodes.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            const val = internalRes[p.id];
            if (bits === 1) {
                mapped[`out${cOut++}`] = val;
            } else {
                for (let i = 0; i < bits; i++) {
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Restored reversed indexing to correct top-to-bottom MSB mapping flaw.
                    mapped[`out${cOut++}`] = Array.isArray(val) ? val[bits - 1 - i] : val;
                }
            }
        });
        return mapped;
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical signal evaluation.
     * @ARCH: SIGNAL_RESOLVER
     * @STATE: NODE_UPDATE
     * @INTENT: Evaluate the logical transfer function for a single node based on its driving signals.
     */
    calculateNextState(node) {
        if (node.isCustom) {
            const chipDef = this.library[node.type];
            if (!chipDef) return JSON.stringify(node.val);
            const ext = this._assembleChipInputs(chipDef, (portId) => this.getDrivingSignal(node.id, portId));
            const internalRes = this.simulateInternalCircuit(node.type, ext);
            node.outputs = this._mapChipOutputs(chipDef, internalRes);
            return node.outputs;
        }
        // primitive gates
        switch (node.type) {
            case 'NAND':
            case 'AND':
            case 'OR':
            case 'NOR':
            case 'XOR':
            case 'XNOR': {
                const sigA = this.getDrivingSignal(node.id, 'a');
                const sigB = this.getDrivingSignal(node.id, 'b');
                const a = (sigA === 1 || sigA === true) ? 1 : 0;
                const b = (sigB === 1 || sigB === true) ? 1 : 0;
                if (node.type === 'NAND') return (a && b) ? 0 : 1;
                if (node.type === 'AND') return (a && b) ? 1 : 0;
                if (node.type === 'OR') return (a || b) ? 1 : 0;
                if (node.type === 'NOR') return (a || b) ? 0 : 1;
                if (node.type === 'XOR') return (a !== b) ? 1 : 0;
                if (node.type === 'XNOR') return (a === b) ? 1 : 0;
            }
            case 'NOT': {
                const a = (this.getDrivingSignal(node.id, 'a') === 1 || this.getDrivingSignal(node.id, 'a') === true) ? 1 : 0;
                return a ? 0 : 1;
            }
            // CLOCK
            case 'CLOCK': return node.state;
            // JUNCTION
            case 'JUNCTION': return this.getDrivingSignal(node.id, 'j');
            // TRISTATE
            case 'TRISTATE': {
                const data = this.getDrivingSignal(node.id, 'in');
                const enable = this.getDrivingSignal(node.id, 'en');
                return (enable === 1) ? data : 'Z';
            }
            // DFF
            case 'DFF': {
                const clk = this.getDrivingSignal(node.id, 'clk');
                const d = this.getDrivingSignal(node.id, 'd');
                const valClk = (clk === 1 || clk === true) ? 1 : 0;
                const valD = (d === 1 || d === true) ? 1 : 0;
                if (valClk === 1 && node.lastClk === 0) { node.state = valD; }
                node.lastClk = valClk;
                return { q: node.state, nq: node.state === 1 ? 0 : 1 };
            }
            // TFF
            case 'TFF': {
                const clk = this.getDrivingSignal(node.id, 'clk');
                const t = this.getDrivingSignal(node.id, 't');
                const valClk = (clk === 1 || clk === true) ? 1 : 0;
                const valT = (t === 1 || t === true) ? 1 : 0;
                if (valClk === 1 && node.lastClk === 0 && valT === 1) { node.state = node.state === 1 ? 0 : 1; }
                node.lastClk = valClk;
                return { q: node.state, nq: node.state === 1 ? 0 : 1 };
            }
        }
        // output nodes
        if (node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
            const bits = parseInt(node.type.split('-')[1]) || 1;
            const state = new Array(bits).fill(0);
            for (let i = 0; i < bits; i++) state[i] = this.getDrivingSignal(node.id, `in${i}`);
            return JSON.stringify(state);
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Prevent ReferenceError on untrapped generic nodes.
        const finalVal = node.val !== undefined ? node.val : null;
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: State calculated for node.
        return finalVal;
    },
    // =========================================================================
    // FILE: browser-sim/modular-sim/js/sim.js
    // DESC: processes the queue of nodes that need to be evaluated
    // =========================================================================

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for simulation tick.
     * @ARCH: SCHEDULER
     * @CONSTRAINT: TIME_STEP_QUANTIZATION
     * @INTENT: Orchestrate the main simulation loop, delegating to Wasm for native logic blocks when possible.
     */
    processQueue() {
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - JIT Interceptor for Dual-Engine Parity. Wasm macro expansion requires sequential proxy indices ('in0'), while V8 requires strict strings ('a').
        if (!this._wasmPortPatched && this.wasmBridge && this.wasmBridge.syncLayout) {
            this._wasmPortPatched = true;
            
            const origSync = this.wasmBridge.syncLayout.bind(this.wasmBridge);
            this.wasmBridge.syncLayout = () => {
                const mapWire = w => {
                    let nw = { ...w, from: { ...w.from }, to: { ...w.to } };
                    if (nw.to.portId === 'a') nw.to.portId = 'in0';
                    if (nw.to.portId === 'b') nw.to.portId = 'in1';
                    if (nw.from.portId === 'q') nw.from.portId = 'out0';
                    if (nw.from.portId === 'nq') nw.from.portId = 'out1';
                    return nw;
                };
                
                const origWires = this.wires;
                this.wires = this.wires.map(mapWire);
                
                const origLib = this.library;
                if (this.library) {
                    this.library = {};
                    for (const [k, v] of Object.entries(origLib)) {
                        this.library[k] = { ...v, wires: v.wires.map(mapWire) };
                    }
                }
                
                origSync();
                
                this.wires = origWires;
                this.library = origLib;
            };

            const origGetIdx = this.wasmBridge.getSpecificIdx.bind(this.wasmBridge);
            this.wasmBridge.getSpecificIdx = (nid, pid) => {
                if (pid === 'a') pid = 'in0';
                else if (pid === 'b') pid = 'in1';
                else if (pid === 'q') pid = 'out0';
                else if (pid === 'nq') pid = 'out1';
                return origGetIdx(nid, pid);
            };

            console.warn('[Simulator] Pseudo-native ports isolated. Engine parity stabilized.');
            // Force Wasm recompilation with patched layout parity
            if (this.wires && this.wires.length > 0) this.wasmBridge.syncLayout();
        }

        // [AUDIT: v1.23.72 | SEC_ARCH_LEAD] - Data corruption sanitization. Purge invalid array states from single-bit logic primitives to prevent strict equality (===) evaluation failures.
        if (!this._stateSanitized) {
            this.nodes.forEach(n => {
                if (Array.isArray(n.state) && n.state.length === 1) n.state = n.state[0];
            });
            this._stateSanitized = true;
        }

        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Purged destructive '7-num' legacy migration hack. Architectural topological parity natively restored.

        if (!this.eventQueue || this.eventQueue.size === 0) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Early exit, simulation queue empty.
            return;
        }

        // Wasm engine intercept
        if (this.useWasm && window.WasmEngine && WasmEngine.ready) {
            // Synchronized native primitive whitelist
            const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
            const checkPure = (nodes) => nodes.every(n => {
                if (validWasmTypes.has(n.type)) return true;
                if (n.isCustom && this.library && this.library[n.type]) return checkPure(this.library[n.type].nodes);
                return false;
            });
            const isPureNative = checkPure(this.nodes);
            
            // Sync HUD Engine Status
            this.updateHUD();

            // [wasm] if pure native, compile netlist and execute tick
            if (isPureNative) {
                let changed = false;
                // if netlist is dirty, compile it
                if (this._netlistDirty) {
                    // compile netlist
                    WasmEngine.syncLayout(this.nodes, this.wires);
                    // mark netlist as not dirty
                    this._netlistDirty = false;
                }
                // inject DOM Hardware States -> Wasm Memory
                this.nodes.forEach(n => {
                    // update input nodes state to Wasm Memory
                    if (n.type.startsWith('IN-') || n.type === 'CLOCK') {
                        if (JSON.stringify(n.val) !== JSON.stringify(n.state)) {
                            n.val = Array.isArray(n.state) ? [...n.state] : n.state;
                            this.updateNodeVisual(n);
                            changed = true;
                        }
                        // push the state into wasm memory
                        WasmEngine.writeState(n.id, n.state);
                    }
                });

                // execute high frequency tick based on structural depth ceiling
                const execDepth = Math.max(20, this.nodes.length);
                const seqNodes = WasmEngine.flatNodes ? WasmEngine.flatNodes.filter(n => ['DFF', 'TFF', 'TRISTATE'].includes(n.type)) : [];
                
                for (let i = 0; i < execDepth; i++) {
                    WasmEngine.executeTick();
                    
                    if (seqNodes.length > 0) {
                        seqNodes.forEach(n => {
                            if (n.type === 'DFF') {
                                const clk = WasmEngine.readPinState(n.id, 'clk');
                                const d = WasmEngine.readPinState(n.id, 'd');
                                if (clk === 1 && n.lastClk === 0) { n.state = d; }
                                n.lastClk = clk;
                                WasmEngine.writeState(n.id, [n.state, n.state === 1 ? 0 : 1]);
                            } else if (n.type === 'TFF') {
                                const clk = WasmEngine.readPinState(n.id, 'clk');
                                const t = WasmEngine.readPinState(n.id, 't');
                                if (clk === 1 && n.lastClk === 0 && t === 1) { n.state = n.state === 1 ? 0 : 1; }
                                n.lastClk = clk;
                                WasmEngine.writeState(n.id, [n.state, n.state === 1 ? 0 : 1]);
                            } else if (n.type === 'TRISTATE') {
                                const en = WasmEngine.readPinState(n.id, 'en');
                                const d = WasmEngine.readPinState(n.id, 'in');
                                WasmEngine.writeState(n.id, en === 1 ? d : 2);
                            }
                        });
                    }
                }

                // extract Wasm Memory -> DOM Hardware States
                this.nodes.forEach(n => {
                    // read from memory and update node state if changed
                    const NATIVE_GATES = new Set(['NAND', 'CLOCK', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'TRISTATE']);
                    if (NATIVE_GATES.has(n.type) && !n.isCustom) {
                        let newVal = WasmEngine.readState(n.id);
                        if (newVal === 2 && n.type === 'TRISTATE') newVal = 'Z';
                        if (JSON.stringify(n.val) !== JSON.stringify(newVal) || n._forcePropagate) {
                            n._forcePropagate = false;
                            n.val = newVal;
                            changed = true;
                            this.updateNodeVisual(n);
                        }
                    } else if ((n.type === 'DFF' || n.type === 'TFF') && !n.isCustom) {
                        const newVal = WasmEngine.readState(n.id);
                        if (newVal && newVal.length >= 2) {
                            const structVal = { q: newVal[0], nq: newVal[1] };
                            if (JSON.stringify(n.val) !== JSON.stringify(structVal) || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.val = structVal;
                                changed = true;
                                this.updateNodeVisual(n);
                            }
                        }
                    }
                });

                // resolve output terminals and extract custom chip bounds
                this.nodes.forEach(n => {
                    if (n.isCustom && this.library[n.type]) {
                        if (!n.outputs) n.outputs = {};
                        let chipChanged = false;
                        let rawInnerState = {};
                        this.library[n.type].nodes.forEach(inner => {
                            if (inner.type.startsWith('OUT-') || inner.type.startsWith('PROBE-')) {
                                const bits = parseInt(inner.type.split('-')[1]) || 1;
                                let outVal;
                                if (bits === 1) {
                                    outVal = WasmEngine.readPinState(`${n.id}:${inner.id}`, 'in0');
                                } else {
                                    outVal = new Array(bits).fill(0);
                                    for (let b = 0; b < bits; b++) {
                                        outVal[b] = WasmEngine.readPinState(`${n.id}:${inner.id}`, `in${b}`);
                                    }
                                }
                                rawInnerState[inner.id] = outVal;
                            }
                        });
                        
                        const mappedOuts = this._mapChipOutputs(this.library[n.type], rawInnerState);
                        if (JSON.stringify(n.outputs) !== JSON.stringify(mappedOuts) || n._forcePropagate) {
                            n.outputs = mappedOuts;
                            n._forcePropagate = false;
                            n.val = JSON.parse(JSON.stringify(n.outputs));
                            this.updateNodeVisual(n);
                            changed = true;
                        }
                    }

                    // resolve output terminals
                    if (n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) {
                        const bits = parseInt(n.type.split('-')[1]) || 1;
                        if (bits === 1) {
                            const drive = WasmEngine.readPinState(n.id, 'in0');
                            const val = (drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0);
                            if (n.val !== val || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.val = val;
                                this.updateNodeVisual(n);
                                changed = true;
                            }
                        } else {
                            const nextState = new Array(bits).fill(0);
                            for (let b = 0; b < bits; b++) {
                                const drive = WasmEngine.readPinState(n.id, `in${b}`);
                                nextState[b] = (drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0);
                            }
                            if (JSON.stringify(n.state) !== JSON.stringify(nextState) || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.state = nextState;
                                n.val = [...nextState];
                                this.updateNodeVisual(n);
                                changed = true;
                            }
                        }
                    }
                });
                // update HUD if any node changed state
                if (changed) {
                    this.updateHUD();
                }
                WireRenderer.drawWires();
                // clear the queue
                this.eventQueue.clear();
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wasm-accelerated simulation tick complete.
                return;
            }
        }

        let iterations = 0;
        const MAX_ITERS = 1000; // Expanded ceiling for hierarchical stability
        // process the queue
        while (this.eventQueue.size > 0 && iterations < MAX_ITERS) {
            iterations++;
            const nextQueue = new Set();
            // for each node in the queue
            this.eventQueue.forEach(node => {
                // calculate next state
                const newVal = this.calculateNextState(node);
                const rawNew = (typeof newVal === 'string' && newVal !== 'Z') ? JSON.parse(newVal) : newVal;
                // if node value changed
                if (JSON.stringify(node.val) !== JSON.stringify(rawNew) || node._forcePropagate) {
                    node._forcePropagate = false;
                    // increment transition count
                    const flips = (this._transitions.get(node.id) || 0) + 1;
                    // update transition count
                    this._transitions.set(node.id, flips);
                    // if node oscillates too many times, mark it as oscillating
                    if (flips > this.MAX_TRANSITIONS) {
                        // if node is not already oscillating, mark it as oscillating
                        if (!node._oscillating) {
                            // log oscillation
                            console.warn(`[DEBUG] Oscillation detected on node ${node.id}.`);
                            // mark as oscillating
                            node._oscillating = true;
                            // update node visual
                            this.updateNodeVisual(node);
                        }
                        return;
                    }
                    // update node value
                    node.val = rawNew;
                    // mark as not oscillating
                    node._oscillating = false;
                    // update node visual
                    this.updateNodeVisual(node);
                    // add driven nodes to queue
                    // add driven nodes to queue bidirectionally (fixes backwards wiring)
                    let visitedJuncs = new Set();
                    const traceDriven = (nid) => {
                        this.wires.forEach(w => {
                            if (w.from.nodeId === nid) {
                                const ds = this.nodes.find(n => n.id === w.to.nodeId);
                                if (ds) {
                                    nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id);
                                    }
                                }
                            } else if (w.to.nodeId === nid) {
                                const ds = this.nodes.find(n => n.id === w.from.nodeId);
                                if (ds) {
                                    nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id);
                                    }
                                }
                            }
                        });
                    };
                    traceDriven(node.id);
                    // if editing chip is null and tutorial engine is available, check progress
                    if (this.activeEditingChip === null && window.TutorialEngine) {
                        TutorialEngine.checkProgress();
                    }
                }
            });
            // update event queue
            this.eventQueue = nextQueue;
        }
        if (iterations >= MAX_ITERS) {
            console.error('[Simulator] Thermal Trip: Max propagation iterations reached. Halting execution to prevent main-thread lockup.');
            this.eventQueue.clear(); // Atomic clear to break infinite requestAnimationFrame cycle
            this.toast('Simulation halted: Unstable oscillation detected.', 'danger');
        }
        // performance optimization: only draw if changes occurred
        if (iterations > 0) {
            WireRenderer.drawWires();
        }
        // update HUD
        this.updateHUD();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: V8-based simulation tick complete. Iterations: ${iterations}.
    },

    // [wasm] parity check
    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Telemetry taxonomy taxonomy correction for parity diagnostic module.
     * @ARCH: DIAGNOSTIC_ORCHESTRATOR
     * @CONSTRAINT: ENGINE_PARITY
     * @INTENT: Perform a stress-test comparison between the V8 JS engine and the Wasm kernel to ensure state parity.
     */
    async runWasmParityCheck(iterations = 1000) {
        // check if WasmEngine is loaded
        if (!window.WasmEngine || !WasmEngine.ready) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Diagnostics aborted, Wasm Engine not linked.
            return this.toast('Wasm Engine not linked.', 'danger');
        }
        // show toast notification
        this.toast('Diagnostics Running. Press F12 to monitor console.', 'warning');
        // Yield execution to allow the DOM to repaint the toast notification
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Wait 50ms for the toast to render
        await new Promise(resolve => setTimeout(resolve, 50));
        // validate that the netlist is pure native
        const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
        const checkPure = (nodes) => nodes.every(n => {
            if (validWasmTypes.has(n.type)) return true;
            if (n.isCustom && this.library && this.library[n.type]) return checkPure(this.library[n.type].nodes);
            return false;
        });
        const isPureNative = checkPure(this.nodes);
        // if not pure native, return toast
        if (!isPureNative) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Diagnostics aborted, mixed-mode netlist detected.
            return this.toast('Parity check requires native logic components only.', 'warning');
        }
        // start console group
        console.group(`[Diagnostics] Wasm vs V8 State Parity Sweep (${iterations} Cycles)`);
        // compile netlist
        WasmEngine.syncLayout(this.nodes, this.wires);
        // get input terminals
        const inputNodes = this.nodes.filter(n => n.type.startsWith('IN-'));
        // get output terminals
        const outputNodes = this.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-'));
        // if no input or output terminals, return toast
        if (inputNodes.length === 0 || outputNodes.length === 0) {
            // end console group
            console.groupEnd();
            return this.toast('Diagnostics require at least 1 input and 1 output terminal.', 'warning');
        }
        // passed flag
        let passed = true;
        // snapshot of current state
        const snapshot = JSON.stringify(this.nodes.map(n => ({ id: n.id, val: n.val, state: n.state })));
        // for each iteration
        for (let i = 0; i < iterations; i++) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Inject async yield to prevent main-thread starvation and browser watchdog thermal trips.
            if (i % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));

            // 1. Inject Randomized Entropy
            inputNodes.forEach(n => {
                // get number of bits from node type
                const bits = parseInt(n.type.split('-')[1]) || 1;
                // if single bit, set to random 0 or 1
                if (bits === 1) {
                    // set node state to random 0 or 1
                    n.state = Math.random() > 0.5 ? 1 : 0;
                    // set node value to state
                    n.val = n.state;
                } else {
                    // if multi-bit, set to random array of 0s and 1s
                    n.state = Array.from({ length: bits }, () => Math.random() > 0.5 ? 1 : 0);
                    // set node value to state
                    n.val = [...n.state];
                }
                // write state to Wasm memory
                WasmEngine.writeState(n.id, n.state);
            });

            // 2. Execute Wasm Array for 20 cycles to propagate signals
            const seqNodes = WasmEngine.flatNodes ? WasmEngine.flatNodes.filter(n => ['DFF', 'TFF', 'TRISTATE'].includes(n.type)) : [];
            for (let t = 0; t < 20; t++) {
                WasmEngine.executeTick();
                if (seqNodes.length > 0) {
                    seqNodes.forEach(n => {
                        if (n.type === 'DFF') {
                            const clk = WasmEngine.readPinState(n.id, 'clk');
                            const d = WasmEngine.readPinState(n.id, 'd');
                            if (clk === 1 && n.lastClk === 0) { n.state = d; }
                            n.lastClk = clk;
                            WasmEngine.writeState(n.id, [n.state, n.state === 1 ? 0 : 1]);
                        } else if (n.type === 'TFF') {
                            const clk = WasmEngine.readPinState(n.id, 'clk');
                            const t = WasmEngine.readPinState(n.id, 't');
                            if (clk === 1 && n.lastClk === 0 && t === 1) { n.state = n.state === 1 ? 0 : 1; }
                            n.lastClk = clk;
                            WasmEngine.writeState(n.id, [n.state, n.state === 1 ? 0 : 1]);
                        } else if (n.type === 'TRISTATE') {
                            const en = WasmEngine.readPinState(n.id, 'en');
                            const d = WasmEngine.readPinState(n.id, 'in');
                            WasmEngine.writeState(n.id, en === 1 ? d : 2);
                        }
                    });
                }
            }

            // 3. Execute V8 Object Graph for 20 cycles to propagate signals
            for (let step = 0; step < 20; step++) {
                // for each node
                this.nodes.forEach(n => {
                    // skip input nodes
                    if (n.type.startsWith('IN-')) return;
                    // calculate next state
                    const next = this.calculateNextState(n);
                    // update node state
                    n.val = (typeof next === 'string' && next !== 'Z') ? JSON.parse(next) : next;
                });
            }

            // 4. Assert State Parity
            outputNodes.forEach(n => {
                // get number of bits from node type
                const bits = parseInt(n.type.split('-')[1]) || 1;
                // read V8 state
                let v8State;
                // if single bit
                if (bits === 1) {
                    // if single bit, set to random 0 or 1
                    v8State = this.getDrivingSignal(n.id, 'in0');
                    // map High-Z floats to 2, otherwise 1/0
                    v8State = (v8State === null || v8State === 'Z') ? 2 : ((v8State === 1 || v8State === true) ? 1 : 0);
                } else {
                    // if multi-bit, set to random array of 0s and 1s
                    v8State = new Array(bits).fill(0);
                    // for each bit
                    for (let b = 0; b < bits; b++) {
                        // get driving signal
                        const drive = this.getDrivingSignal(n.id, `in${b}`);
                        // set state mapping High-Z
                        v8State[b] = (drive === null || drive === 'Z') ? 2 : ((drive === 1 || drive === true) ? 1 : 0);
                    }
                }

                // Read Wasm state using the flattened graph tracer
                let wState;
                if (bits === 1) {
                    wState = WasmEngine.readPinState(n.id, 'in0');
                } else {
                    wState = new Array(bits).fill(0);
                    for (let b = 0; b < bits; b++) {
                        wState[b] = WasmEngine.readPinState(n.id, `in${b}`);
                    }
                }

                // Check if states match
                if (JSON.stringify(v8State) !== JSON.stringify(wState)) {
                    // if not, log error and set passed to false
                    console.error(`[FATAL] Parity Deviation at Cycle ${i} | Terminal: ${n.id} (${n.label}) | V8 Object: ${JSON.stringify(v8State)} | Wasm Linear: ${JSON.stringify(wState)}`);
                    // set passed to false
                    passed = false;
                }
            });
            // if failed, break
            if (!passed) break;
        }

        const saved = JSON.parse(snapshot);
        this.nodes.forEach(n => {
            const s = saved.find(x => x.id === n.id);
            if (s) { n.val = s.val; n.state = s.state; }
        });

        if (passed) {
            console.log('%c[Diagnostics] SUCCESS: 100% Cryptographic Parity Confirmed.', 'color: #00ffaa; font-weight: bold;');
            alert("WASM Parity Validated. Check F12 Console.");
        } else {
            console.error('[Diagnostics] FAILED: Architecture divergence detected. Halting execution.');
            alert("Parity Deviation Detected. Check F12 Console for exact byte offsets.");
        }

        console.groupEnd();
        // show toast notification
        this.toast(passed ? 'Parity Suite: PASSED' : 'Parity Suite: FAILED (Check Console)', passed ? 'success' : 'danger');
        // update wire visuals
        this.updateWireVisuals();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Parity diagnostics suite finalized. Result: ${passed ? 'PASSED' : 'FAILED'}.
    },

    // simulate internal circuit (sub-circuit simulation)
    /**
     * @ARCH: SUB_SIMULATOR
     * @CONSTRAINT: RECURSIVE_EVAL
     * @INTENT: Execute a synchronous logical sweep of a sub-circuit (custom chip) to resolve its outputs.
     */
    simulateInternalCircuit(chipTypeOrMeta, externalInputs) {
        // debug message
        if (this.debugToasts) console.debug(`[SimTrace] Executing Sub-Circuit: ${typeof chipTypeOrMeta === 'string' ? chipTypeOrMeta : 'Custom'} | Inputs:`, externalInputs);
        let meta = typeof chipTypeOrMeta === 'string' ? this.library[chipTypeOrMeta] : chipTypeOrMeta.meta;
        // if meta not found, return
        if (!meta) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Sub-circuit simulation aborted, metadata missing for ${chipTypeOrMeta}.
            return {};
        }

        // Use a deep copy for simulation to avoid corrupting the library definition
        meta = JSON.parse(JSON.stringify(meta));

        meta.nodes.forEach(inner => {
            if (inner.type.startsWith('IN-')) {
                const bits = parseInt(inner.type.split('-')[1]) || 1;
                const val = externalInputs[inner.id];
                inner.state = (val !== undefined) ? val : (bits > 1 ? new Array(bits).fill(0) : 0);
            }
        });

        const getDrive = (nid, pid, visited = new Set()) => {
            const netKey = `${nid}:${pid}`;
            // if visited, return null
            if (visited.has(netKey)) return null;
            // add to visited
            visited.add(netKey);

            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Apply bidirectional topological net traversal for internal chip simulation.
            let wires = meta.wires.filter(w => 
                (w.to.nodeId === nid && w.to.portId === pid) || 
                (w.from.nodeId === nid && w.from.portId === pid)
            );

            if (wires.length === 0) return null;

            for (const w of wires) {
                const srcNodeId = (w.to.nodeId === nid && w.to.portId === pid) ? w.from.nodeId : w.to.nodeId;
                const srcPortId = (w.to.nodeId === nid && w.to.portId === pid) ? w.from.portId : w.to.portId;

                const srcNode = meta.nodes.find(n => n.id === srcNodeId);
                if (!srcNode) continue;

                let isPeerOutput = false;
                if (srcNode.type.startsWith('IN-') || srcNode.type === 'CLOCK') isPeerOutput = true;
                if (srcNode.isCustom && srcPortId.startsWith('out')) isPeerOutput = true;
                const NATIVE_GATES = new Set(['NAND', 'DFF', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
                if (NATIVE_GATES.has(srcNode.type) && (srcPortId === 'out' || srcPortId === 'q' || srcPortId === 'nq')) isPeerOutput = true;

                if (srcNode.type === 'JUNCTION' || !isPeerOutput) {
                    const sig = getDrive(srcNodeId, srcPortId, visited);
                    if (sig !== null) return sig;
                } else {
                    const sig = getVal(srcNodeId, srcPortId);
                    if (sig !== null) return sig;
                }
            }
            return null;
        };

        const getVal = (nid, pid) => {
            const src = meta.nodes.find(n => n.id === nid);
            if (!src) return null;
            if (src.type.startsWith('IN-')) {
                const idx = parseInt(pid.replace(/\D/g, '')) || 0;
                const res = Array.isArray(src.state) ? src.state[idx] : src.state;
                return (res === undefined) ? null : res;
            }
            if (src.isCustom && src.outputs) {
                const res = src.outputs[pid];
                return (res === undefined) ? null : res;
            }
            return (src.val === undefined) ? null : src.val;
        };

        for (let iter = 0; iter < 500; iter++) {
            let changed = false;
            meta.nodes.forEach(inner => {
                if (inner.type.startsWith('IN-')) return;
                let nVal = 0;
                if (inner.isCustom) {
                    const innerChip = this.library[inner.type];
                    if (innerChip) {
                        const ins = this._assembleChipInputs(innerChip, (portId) => getDrive(inner.id, portId));
                        const rawOuts = this.simulateInternalCircuit(inner.type, ins);
                        inner.outputs = this._mapChipOutputs(innerChip, rawOuts);
                        nVal = inner.outputs;
                    }
                } else if (['NAND', 'AND', 'OR', 'NOR', 'XOR', 'XNOR'].includes(inner.type)) {
                    const a = getDrive(inner.id, 'a') === 1 ? 1 : 0;
                    const b = getDrive(inner.id, 'b') === 1 ? 1 : 0;
                    if (inner.type === 'NAND') nVal = (a && b) ? 0 : 1;
                    else if (inner.type === 'AND') nVal = (a && b) ? 1 : 0;
                    else if (inner.type === 'OR') nVal = (a || b) ? 1 : 0;
                    else if (inner.type === 'NOR') nVal = (a || b) ? 0 : 1;
                    else if (inner.type === 'XOR') nVal = (a !== b) ? 1 : 0;
                    else if (inner.type === 'XNOR') nVal = (a === b) ? 1 : 0;
                } else if (inner.type === 'NOT') {
                    const a = getDrive(inner.id, 'a') === 1 ? 1 : 0;
                    nVal = a ? 0 : 1;
                } else if (inner.type === 'TRISTATE') {
                    const d = getDrive(inner.id, 'in'), e = getDrive(inner.id, 'en');
                    nVal = (e === 1) ? d : 'Z';
                } else if (inner.type === 'DFF') {
                    const clk = getDrive(inner.id, 'clk');
                    const d = getDrive(inner.id, 'd');
                    if (clk === 1 && inner.lastClk === 0) { inner.state = (d === 1) ? 1 : 0; }
                    inner.lastClk = clk;
                    nVal = { q: inner.state, nq: inner.state === 1 ? 0 : 1 };
                } else if (inner.type === 'TFF') {
                    const clk = getDrive(inner.id, 'clk');
                    const t = getDrive(inner.id, 't');
                    if (clk === 1 && inner.lastClk === 0 && t === 1) { inner.state = inner.state === 1 ? 0 : 1; }
                    inner.lastClk = clk;
                    nVal = { q: inner.state, nq: inner.state === 1 ? 0 : 1 };
                } else if (inner.type === 'JUNCTION') {
                    nVal = getDrive(inner.id, 'j');
                } else if (inner.type.startsWith('OUT-') || inner.type.startsWith('PROBE-')) {
                    const bits = parseInt(inner.type.split('-')[1]) || 1;
                    if (bits === 1) {
                        nVal = getDrive(inner.id, 'in0');
                    } else {
                        nVal = new Array(bits).fill(0);
                        for (let b = 0; b < bits; b++) {
                            nVal[b] = getDrive(inner.id, `in${b}`);
                        }
                    }
                }
                if (JSON.stringify(inner.val) !== JSON.stringify(nVal)) { inner.val = nVal; changed = true; }
            });
            if (!changed) break;
        }
        const res = {};
        meta.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).forEach(out => res[out.id] = out.val === undefined ? 0 : out.val);
        if (this.debugToasts) console.debug(`[SimTrace] Sub-Circuit Result: ${typeof chipTypeOrMeta === 'string' ? chipTypeOrMeta : 'Custom'} | Outputs:`, res);
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Sub-simulation complete for ${typeof chipTypeOrMeta === 'string' ? chipTypeOrMeta : 'Custom'}.
        return res;
    },

    /**
     * @ARCH: NETLIST_FACTORY
     * @IO: UI_MUTATION
     * @INTENT: Add a new node to the workspace with optional coordinate snapping and collision detection.
     */
    addNode(type, x = null, y = null, label = null) {
        if (x === null) {
            const scene = document.getElementById('scene');
            const sr = scene ? scene.getBoundingClientRect() : { left: 0, top: 0 };
            x = (window.innerWidth / 2 - sr.left) / View.scale + (Math.random() * 50 - 25);
            y = (window.innerHeight / 2 - sr.top) / View.scale + (Math.random() * 50 - 25);
            // Offset if already occupied
            while (this.nodes.some(n => Math.abs(n.x - x) < 20 && Math.abs(n.y - y) < 20)) { x += 20; y += 20; }
        }
        if (this.snapNodes) { x = Math.round(x / 20) * 20; y = Math.round(y / 20) * 20; }
        if (this.debugToasts) this.toast(`Added ${type} node`);
        const newNode = this._finalizeAddNode(type, x, y, label || type);
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node added to workspace: ${newNode.id} (${type}).
        return newNode;
    },

    /**
     * @ARCH: NETLIST_FACTORY
     * @STATE: NODE_INITIALIZATION
     * @INTENT: Construct the internal node object representation and trigger the AddNodeCommand.
     */
    _finalizeAddNode(type, x, y, label) {
        const node = {
            id: 'node-' + Math.random().toString(36).substr(2, 9),
            type, x, y, label: label || type, val: 0,
            state: (type.includes('-1') || type === 'CLOCK' || type === 'DFF' || type === 'TFF') ? 0 : (new Array(parseInt(type.split('-')[1]) || 1).fill(0)),
            outputs: {}, lastClk: 0,
            ...(type === 'CLOCK' && { freq: 1, interval: 1000, lastTick: performance.now() })
        };
        const NATIVE_TYPES = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
        if (this.library[type] && !NATIVE_TYPES.has(type)) { node.isCustom = true; }
        History.execute(new AddNodeCommand(node));
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node command dispatched for ${node.id}.
        return node;
    },

    /**
     * @IO: UI_POSITIONING
     * @INTENT: Synchronize the DOM element's CSS position with the internal node coordinates.
     */
    updateNodePosition(node, el = null) {
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Enforce topological wire relativity: custom segments follow source node movement.
        if (node._lastX !== undefined && node._lastY !== undefined) {
            const dx = node.x - node._lastX;
            const dy = node.y - node._lastY;
            if (dx !== 0 || dy !== 0) {
                this.wires.forEach(w => {
                    if (w.from.nodeId === node.id) {
                        if (typeof w.midX === 'number') w.midX += dx;
                        if (typeof w.midY === 'number') w.midY += dy;
                    }
                });
                if ((dx !== 0 || dy !== 0) && typeof WireRenderer !== 'undefined') WireRenderer.drawWires();
            }
        }
        node._lastX = node.x;
        node._lastY = node.y;

        const div = el || document.getElementById(node.id);
        if (div) {
            div.style.left = node.x + 'px';
            div.style.top = node.y + 'px';
            div.style.transform = 'none';
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: DOM position updated for node ${node.id}.
    },

    /**
     * @IO: UI_RENDERING
     * @STATE: NODE_VISUAL_STATE
     * @INTENT: Update a node's visual representation (colors, labels, bit-dots) based on its logical value.
     */
    updateNodeVisual(n) {
        const el = document.getElementById(n.id); if (!el) return;
        
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Apply saved geometric properties dynamically on visual update.
        if (n.customWidth) el.style.width = n.customWidth + 'px';
        if (n.customHeight) el.style.height = n.customHeight + 'px';

        // [AUDIT: v1.24.34 | SEC_ARCH_LEAD] - Apply dynamically calculated port spread geometry.
        if (n.portY !== undefined || n.portH !== undefined) {
            const py = n.portY !== undefined ? n.portY : 24;
            const ph = n.portH !== undefined ? n.portH : (n.customHeight || parseInt(el.style.height) || 64) - 30;
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

        // [AUDIT: v1.24.27 | SEC_ARCH_LEAD] - Apply localized label geometry bounding box limits and dynamic font scaling.
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

        const bits = parseInt(n.type.split('-')[1]) || 1;
        if (bits >= 4) {
            const valArr = Array.isArray(n.val) ? n.val : (Array.isArray(n.state) ? n.state : [n.val]);
            const paddedArr = [...valArr];
            while (paddedArr.length < bits) paddedArr.push(0);

            // LSB is at index 0
            const val = paddedArr.reduce((acc, b, i) => acc | ((b === 1 ? 1 : 0) << i), 0);
            
            if (!this._domCacheMap) this._domCacheMap = new Map();
            let cache = this._domCacheMap.get(n.id);
            if (cache && cache.dec && !document.body.contains(cache.dec)) {
                cache = null; // Invalidate stale DOM reference
            }
            if (!cache) {
                cache = {
                    dec: el.querySelector('.dec'),
                    hex: el.querySelector('.hex'),
                    bin: el.querySelector('.bin'),
                    dots: el.querySelectorAll('.bit-dot')
                };
                this._domCacheMap.set(n.id, cache);
            }
            
            if (cache.dec) cache.dec.innerText = `D: ${val}`;
            if (cache.hex) cache.hex.innerText = `H: ${val.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')}`;
            if (cache.bin) cache.bin.innerText = `B: ${val.toString(2).padStart(bits, '0')}`;
            
            if (cache.dots) {
                cache.dots.forEach(dot => {
                    const bIdx = parseInt(dot.getAttribute('data-bit'));
                    const stateBit = paddedArr[bIdx];
                    dot.classList.toggle('on', stateBit === 1);
                    dot.classList.toggle('off', stateBit === 0 || stateBit === null || stateBit === 'Z');
                });
                // [AUDIT: SEC_ARCH_LEAD] - Apply localized pin geometry bounding box limits targeting isolated wrapper.
                const pinCont = el.querySelector('.pin-container');
                if (pinCont && (n.pinX !== undefined || n.pinW !== undefined)) {
                    pinCont.style.transform = 'none'; // Overrides default vertically centered mapping
                    if (n.pinX !== undefined) pinCont.style.left = n.pinX + 'px';
                    if (n.pinY !== undefined) pinCont.style.top = n.pinY + 'px';
                    if (n.pinW !== undefined) pinCont.style.width = n.pinW + 'px';
                    if (n.pinH !== undefined) pinCont.style.height = n.pinH + 'px';
                }
            }

            // [AUDIT: SEC_ARCH_LEAD] - Apply localized readout geometry bounding box limits.
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
            
            // Strip legacy property to prevent future save crashes
            if (n._domCache) delete n._domCache;
        }
        let isActive = false;
        let isZero = true;
        let isFloat = false;

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
        }

        el.classList.toggle('active', isActive);
        el.classList.toggle('inactive', isZero && !isActive && !isFloat);
        el.classList.toggle('floating', isFloat);

        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Universal pin color mapping for real-time electrical state tracking.
        const ports = el.querySelectorAll('.port');
        ports.forEach(p => {
            const pid = p.dataset.port;
            let drive = null;
            
            if (p.classList.contains('output') && !p.classList.contains('input')) {
                drive = this.getSignal(n.id, pid);
            } else {
                drive = this.getDrivingSignal(n.id, pid);
            }
            
            p.classList.toggle('on', drive === 1);
            p.classList.toggle('off', drive === 0);
            p.classList.toggle('float', drive === null || drive === 'Z');
        });

        if (n._oscillating) el.classList.add('oscillating');
        
        // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Emit state transitions to terminal watchers.
        if (window.DebugTerminal && DebugTerminal._watchers && DebugTerminal._watchers.has(n.id)) {
            const currentStr = JSON.stringify(n.val);
            if (n._lastWatchVal !== currentStr) {
                DebugTerminal.print(`[WATCH] <span style="color:#0af">${n.id}</span> transitioned to <span style="color:#0f5">${currentStr}</span>`, 'sys');
                n._lastWatchVal = currentStr;
            }
        }
        
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node visual state synchronized for ${n.id}.
    },

    /**
     * @ARCH: RENDERING_DISPATCHER
     * @STATE: NETLIST_DIRTY
     * @INTENT: Trigger a redraw of the SVG wire layer and mark the netlist for Wasm recompilation.
     */
    updateWireVisuals() {
        this._netlistDirty = true; // Forces WASM engine to recognize the new layout
        // [AUDIT: v1.23.93 | SEC_ARCH_LEAD] - JIT validation: Purge corrupted routing coordinates before SVG dispatch.
        if (this.wires) {
            this.wires.forEach(w => {
                if (w.midX === null || isNaN(w.midX)) delete w.midX;
                if (w.midY === null || isNaN(w.midY)) delete w.midY;
            });
        }
        if (typeof WireRenderer !== 'undefined') WireRenderer.drawWires();
    },

    /**
     * @IO: UI_COORDINATE_RESOLVER
     * @INTENT: Resolve the viewport-relative coordinates of a specific port on a node.
     */
    getPortCoords(nodeId, portId) {
        const scene = document.getElementById('scene');
        const pEl = document.getElementById(nodeId)?.querySelector(`[data-port="${portId}"]`);
        if (!scene || !pEl) return null;
        const sr = scene.getBoundingClientRect();
        const r = pEl.getBoundingClientRect();
        return {
            x: (r.left - sr.left + r.width / 2) / View.scale,
            y: (r.top - sr.top + r.height / 2) / View.scale
        };
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Port coordinates resolved for ${nodeId}:${portId}.
        return coords;
    },

    /**
     * @IO: UI_INTERACTION
     * @ARCH: WIRING_MANAGER
     * @INTENT: Manage the state machine for manual wire creation between ports.
     */
    handlePortInteraction(e, nodeId, portId) {
        // [AUDIT: SEC_ARCH_LEAD] - Global freeze on wiring interactions during layout configurations.
        if (document.body.classList.contains('edit-mode-active')) return;
        const pEl = document.getElementById(nodeId)?.querySelector(`[data-port="${portId}"]`);
        if (e.shiftKey && !this.wiring.active) {
            const wire = this.wires.findLast(w => (w.to.nodeId === nodeId && w.to.portId === portId) || (w.from.nodeId === nodeId && w.from.portId === portId));
            if (wire) {
                const other = (wire.to.nodeId === nodeId && wire.to.portId === portId) ? wire.from : wire.to;
                History.execute(new DeleteWireCommand(wire));
                const otherEl = document.getElementById(other.nodeId)?.querySelector(`[data-port="${other.portId}"]`);
                this.wiring.active = true; this.wiring.start = { ...other, isOutput: otherEl?.classList.contains('output') };
                if (otherEl) otherEl.classList.add('selected');
                return;
            }
        }
        if (!this.wiring.active) {
            this.wiring.active = true; this.wiring.start = { nodeId, portId, isOutput: pEl?.classList.contains('output') };
            if (pEl) pEl.classList.add('selected');
        } else {
            const s = this.wiring.start;
            document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            if (s.nodeId !== nodeId) {
                // Short Circuit Safety Parity
                const sEl = document.getElementById(s.nodeId)?.querySelector(`[data-port="${s.portId}"]`);
                const tEl = document.getElementById(nodeId)?.querySelector(`[data-port="${portId}"]`);
                const isSJunction = sEl?.parentElement.classList.contains('junction');
                const isTJunction = tEl?.parentElement.classList.contains('junction');

                if (!isSJunction && !isTJunction && sEl?.classList.contains('output') && tEl?.classList.contains('output')) {
                    this.toast(`Electrical Error: Output-to-Output collision blocked.`, 'warning');
                    this.wiring.active = false; this.wiring.start = null; this.updateWireVisuals();
                    return;
                }
                const wire = s.isOutput ? { from: { ...s }, to: { nodeId, portId } } : { from: { nodeId, portId }, to: { ...s } };
                History.execute(new AddWireCommand(wire));
            }
            this.wiring.active = false;
            this.wiring.start = null;
            this.clearSnapState();
            WireRenderer.drawWires();
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Port interaction state machine cycle complete.
    },

    /**
     * @ARCH: NETLIST_MUTATION
     * @STATE: WIRE_ALLOCATION
     * @INTENT: Programmatically create a wire connection between two specific ports.
     */
    connectNodes(n1Id, p1Id, n2Id, p2Id) {
        if (this.debugToasts) this.toast(`Connecting ${n1Id} to ${n2Id}`, 'debug');
        console.log(`[DEBUG] connectNodes triggered | From: ${n1Id}[${p1Id}] -> To: ${n2Id}[${p2Id}]`);
        const wire = { from: { nodeId: n1Id, portId: p1Id }, to: { nodeId: n2Id, portId: p2Id } };
        if (!this.wires.find(w => w.from.nodeId === n1Id && w.to.nodeId === n2Id && w.from.portId === p1Id && w.to.portId === p2Id)) {
            this.wires.push(wire);
            this.updateWireVisuals();
        }
    },

    /**
     * @ARCH: SIGNAL_RESOLVER
     * @STATE: NODE_OUTPUT_STATE
     * @INTENT: Retrieve the current logical signal value emitted by a specific port.
     */
    getSignal(nodeId, portId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return null;

        if (node.type.includes('-8') || node.type.includes('-4')) {
            const idx = parseInt(portId.replace(/\D/g, '')) || 0;
            const res = Array.isArray(node.state) ? node.state[idx] : node.state;
            return (res === undefined) ? null : res;
        }

        if (node.type === 'JUNCTION') return this.getDrivingSignal(node.id, 'j');

        // Tristate High-Impedance handling
        if (node.type === 'TRISTATE') return node.val === 'Z' ? null : node.val;

        // Custom chips store structured outputs in node.val
        if (node.val !== null && typeof node.val === 'object' && !Array.isArray(node.val)) {
            if (node.val[portId] !== undefined) return node.val[portId];
        }

        if (node.outputs && typeof node.outputs === 'object' && node.outputs[portId] !== undefined) return node.outputs[portId];

        return node.val === undefined ? null : node.val;
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for driving signal resolution.
     * @ARCH: SIGNAL_RESOLVER
     * @STATE: NETLIST_TRAVERSAL
     * @INTENT: Trace a net backwards to find the driving signal for a given input port.
     */
    getDrivingSignal(nodeId, portId, visited = new Set()) {
        const netKey = `${nodeId}:${portId}`;
        
        // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Intercept net evaluation for CLI forced signal overriding.
        if (this._forcedNets && this._forcedNets[netKey] !== undefined) {
            return this._forcedNets[netKey];
        }

        if (visited.has(netKey)) return null;
        visited.add(netKey);

        // Bi-directional topological net traversal
        let connectedWires = this.wires.filter(w => 
            (w.to.nodeId === nodeId && w.to.portId === portId) || 
            (w.from.nodeId === nodeId && w.from.portId === portId)
        );

        if (connectedWires.length === 0) return null;

        for (const w of connectedWires) {
            const peerNodeId = (w.to.nodeId === nodeId && w.to.portId === portId) ? w.from.nodeId : w.to.nodeId;
            const peerPortId = (w.to.nodeId === nodeId && w.to.portId === portId) ? w.from.portId : w.to.portId;

            const peerNode = this.nodes.find(n => n.id === peerNodeId);
            if (!peerNode) continue;

            let isPeerOutput = false;
            if (peerNode.type.startsWith('IN-') || peerNode.type === 'CLOCK') isPeerOutput = true;
            if (peerNode.isCustom && peerPortId.startsWith('out')) isPeerOutput = true;
            const NATIVE_GATES = new Set(['NAND', 'DFF', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
            if (NATIVE_GATES.has(peerNode.type) && (peerPortId === 'out' || peerPortId === 'q' || peerPortId === 'nq')) isPeerOutput = true;

            if (peerNode.type === 'JUNCTION' || !isPeerOutput) {
                // Keep tracing laterally across the net
                const sig = this.getDrivingSignal(peerNodeId, peerPortId, visited);
                if (sig !== null) return sig;
            } else {
                // Terminate trace at valid logical driver
                const sig = this.getSignal(peerNodeId, peerPortId);
                if (sig !== null) return sig;
            }
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Driver resolution complete for ${nodeId}:${portId}. No driver found (Floating).
        return null;
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for full simulation reset.
     * @ARCH: SIMULATION_KERNEL
     * @STATE: SIMULATION_RESET
     * @INTENT: Reset transition histories and force a full-netlist propagation sweep.
     */
    seedQueue() { 
        this._transitions.clear(); 
        this.nodes.forEach(n => { n._oscillating = false; n._forcePropagate = true; }); 
        this.eventQueue = new Set(this.nodes); 
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Queue seeded for full propagation sweep.
    },
    /**
     * @IO: UI_INTERACTION
     * @STATE: INPUT_MUTATION
     * @INTENT: Toggle a specific bit of an input node and trigger a simulation tick.
     */
    toggleBit(e, nodeId, bitIndex) {
        // [AUDIT: SEC_ARCH_LEAD] - Prevent input toggling while in layout mutation mode.
        if (document.body.classList.contains('edit-mode-active')) return;

        if (typeof e === 'string') {
            bitIndex = nodeId;
            nodeId = e;
            e = window.event;
        }
        const originNode = this.nodes.find(n => n.id === nodeId);
        if (!originNode || !originNode.type.startsWith('IN-')) return;
        
        let targets = [originNode];
        if (e && e.shiftKey && this.selection.has(nodeId)) {
            targets = this.nodes.filter(n => this.selection.has(n.id) && n.type.startsWith('IN-'));
        }

        targets.forEach(n => {
            const bits = parseInt(n.type.split('-')[1]) || 1;
            if (bits === 1) {
                n.state = n.state ? 0 : 1; n.val = n.state;
            } else {
                if (!Array.isArray(n.state)) n.state = new Array(bits).fill(0);
                if (bitIndex < bits) {
                    n.state[bitIndex] = n.state[bitIndex] ? 0 : 1;
                } else {
                    n.state[0] = n.state[0] ? 0 : 1;
                }
                n.val = [...n.state];
            }
            this.updateNodeVisual(n);
        });
        this.seedQueue(); this.processQueue();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Input bit(s) toggled and propagation triggered.
    },

    /**
     * @ARCH: ENGINE_SWITCH
     * @INTENT: Switch between V8 (JavaScript) and Wasm simulation kernels.
     */
    setEngine(type) {
        this.useWasm = (type === 'wasm');
        this.toast('Engine switched to ' + type.toUpperCase(), 'info');
        this.updateHUD();
    },

    /**
     * @IO: HUD_DISPLAY
     * @INTENT: Update the Heads-Up Display with current netlist statistics and engine status.
     */
    updateHUD() {
        let hud = document.getElementById('ui-hud');
        if (!this.showStats) { if (hud) hud.remove(); return; }
        if (!hud) { 
            hud = document.createElement('div'); 
            hud.id = 'ui-hud'; 
            const ws = document.getElementById('workspace');
            if (ws) ws.appendChild(hud); else document.body.appendChild(hud); 
        }

        const pos = this.hudPos || 'top-right';
        hud.style.position = 'absolute';
        hud.style.padding = '10px 15px'; hud.style.fontFamily = 'var(--font)'; hud.style.fontSize = '10px'; hud.style.pointerEvents = 'none'; hud.style.zIndex = '500'; hud.style.color = 'rgba(0, 255, 170, 0.6)'; hud.style.background = 'rgba(0,0,0,0.3)'; hud.style.borderRadius = '6px'; hud.style.backdropFilter = 'blur(2px)';
        
        if (pos === 'top-right') { hud.style.top = '15px'; hud.style.right = '20px'; hud.style.left = 'auto'; hud.style.bottom = 'auto'; hud.style.textAlign = 'right'; }
        else if (pos === 'top-left') { hud.style.top = '15px'; hud.style.left = '15px'; hud.style.right = 'auto'; hud.style.bottom = 'auto'; hud.style.textAlign = 'left'; }
        else if (pos === 'bottom-left') { hud.style.bottom = '15px'; hud.style.left = '15px'; hud.style.right = 'auto'; hud.style.top = 'auto'; hud.style.textAlign = 'left'; }

        const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
        const checkPure = (nodes) => nodes.every(n => {
            if (validWasmTypes.has(n.type)) return true;
            if (n.isCustom && this.library && this.library[n.type]) return checkPure(this.library[n.type].nodes);
            return false;
        });
        const isPureNative = checkPure(this.nodes);
        
        let engineStatus = '';
        if (this.useWasm) {
            if (window.WasmEngine && WasmEngine.ready && isPureNative) {
                engineStatus = '<span style="color:#0f0">WASM DIRECT</span>';
            } else {
                engineStatus = '<span style="color:#f55">WASM (IMPURE/FALLBACK)</span>';
            }
        } else {
            engineStatus = '<span style="color:#ffaa00">V8 JAVASCRIPT</span>';
        }
        
        hud.innerHTML = `GATES: ${this.nodes.length} | WIRES: ${this.wires.length}<br>CHIP : ${this.activeEditingChip || 'MAIN'}<br>ENGINE: ${engineStatus}<br>POS  : <span id="hud-coords" style="color:#0f5">0, 0</span>`;
    },

    /**
     * @IO: SIDEBAR_DISPLAY
     * @INTENT: Populate the component sidebar with categorized native gate buttons.
     */
    updateSidebar() {
        const sb = document.getElementById('sidebar');
        if (!sb) return;

        const sections = {
            'Input Ports': [
                { label: 'Single Input', type: 'IN-1' },
                { label: '4-Bit Port', type: 'IN-4' },
                { label: '8-Bit Port', type: 'IN-8' }
            ],
            'Output Ports': [
                { label: 'Single Output', type: 'OUT-1' },
                { label: '4-Bit Port', type: 'OUT-4' },
                { label: '8-Bit Port', type: 'OUT-8' }
            ],
            'Utilities': [
                { label: 'Clock Generator', type: 'CLOCK' }
            ]
        };

        let html = '';
        Object.entries(sections).forEach(([header, items]) => {
            html += `<div class="sidebar-header">${header}</div>`;
            items.forEach(it => {
                html += `<div class="comp-btn" onclick="Sim.addNode('${it.type}')" title="${it.label}">${it.label}</div>`;
            });
        });
        sb.innerHTML = html;
    },

    /**
     * @IO: LIBRARY_DISPLAY
     * @INTENT: Synchronize the custom chip library UI with the internal library state.
     */
    updateLibraryUI() {
        // 1. Ensure Context Menu DOM Element Exists
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

        // 2. Target exact container to prevent overwriting footer label
        const lib = document.getElementById('chip-lib');
        if (!lib) return;

        // 3. Inject Chips (Native first, then Custom Library)
        lib.innerHTML = '';

        const nativeLib = [
            { label: 'NAND', type: 'NAND' },
            { label: 'TRISTATE', type: 'TRISTATE' },
            { label: 'INPUT', type: 'INPUT' },
            { label: 'OUTPUT', type: 'OUTPUT' },
            { label: 'CLOCK', type: 'CLOCK' }
        ];

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
                    menu.style.top = (e.clientY - 120) + 'px'; // Show above the footer

                    menu.innerHTML = `
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-1'); document.getElementById('context-menu').style.display='none';">1-Bit Port</div>
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-4'); document.getElementById('context-menu').style.display='none';">4-Bit Port</div>
                        <div class="menu-item" onclick="Sim.addNode('${prefix}-8'); document.getElementById('context-menu').style.display='none';">8-Bit Port</div>
                    `;
                } else {
                    this.addNode(it.type);
                }
            };
            lib.appendChild(span);
        });

        // 4. Inject Custom Library Chips (Hierarchical VFS Rendering)
        const groups = { '': [] };
        Object.keys(this.library).forEach(name => {
            const folder = this.library[name].folder || '';
            if (!groups[folder]) groups[folder] = [];
            groups[folder].push(name);
        });

        // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Dynamic collapsible folder instantiation for macro library.
        Object.keys(groups).sort().forEach(folder => {
            let container = lib;
            if (folder !== '') {
                const fDiv = document.createElement('div');
                fDiv.className = 'lib-folder';
                fDiv.innerHTML = `<span class="folder-title" onclick="this.parentElement.classList.toggle('collapsed')">📁 ${folder}</span><div class="folder-contents"></div>`;
                lib.appendChild(fDiv);
                container = fDiv.querySelector('.folder-contents');
            }

            groups[folder].sort().forEach(name => {
                const span = document.createElement('span');
                span.className = 'status-chip custom';
                span.innerText = name;

                if (name === this.activeEditingChip) {
                    span.style.opacity = '0.3';
                    span.title = 'Cannot place a chip inside itself';
                    span.onclick = () => this.toast('Cannot place a chip inside itself', 'warning');
                    span.ondblclick = () => this.toast('Already editing this chip', 'warning');
                } else {
                    span.onclick = () => this.addNode(name);
                    span.ondblclick = () => { if (typeof this.uiEditChip === 'function') this.uiEditChip(name); };
                }

                span.oncontextmenu = (e) => {
                    e.preventDefault();
                    menu.style.display = 'block';

                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';

                    menu.innerHTML = '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#4a9eff\'" onmouseout="this.style.color=\'#aaa\'" onclick="Sim.uiEditChip(\'' + name + '\')">Edit Internals</div>' +
                        '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#4a9eff\'" onmouseout="this.style.color=\'#aaa\'" onclick="Sim.modal(\'Rename Chip\',\'New name:\',\'prompt\',nn=>{if(nn && !Sim.library[nn]){Sim.library[nn]=Sim.library[\'' + name + '\']; delete Sim.library[\'' + name + '\']; Sim.nodes.forEach(n=>{if(n.type===\'' + name + '\')n.type=nn;}); Sim.updateLibraryUI(); Sim.autoSave(); }},\'' + name + '\')">Rename</div>' +
                        '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#4a9eff\'" onmouseout="this.style.color=\'#aaa\'" onclick="Sim.modal(\'Move Chip\',\'New Folder Path:\',\'prompt\',f=>{if(f!==null){Sim.library[\'' + name + '\'].folder=f; Sim.updateLibraryUI(); Sim.autoSave(); }},\'' + (Sim.library[name].folder||'') + '\')">Move</div>' +
                        '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#ff4757; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#ff6b81\'" onmouseout="this.style.color=\'#ff4757\'" onclick="if(Sim.activeEditingChip===\'' + name + '\') Sim.uiExitChipEdit(); Sim.uiDeleteChip(\'' + name + '\')">Delete</div>';
                        
                    // [AUDIT: v1.24.12 | SEC_ARCH_LEAD] - Smart boundary collision detection for library items.
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
     * @ARCH: WORKSPACE_CONTEXT_SWITCH
     * @INTENT: Push the current board to the workspace stack and enter the internal logic editor for a custom chip.
     */
    uiEditChip(name, isSwitching = false) {
        if (!this.library[name]) return;
        if (this.activeEditingChip) {
            const prevChip = this.activeEditingChip;
            this.uiExitChipEdit();
            this.uiEditChip(name, true);
            
            this.toast(`Saved ${prevChip}. Switched to ${name}.`, 'success', 5000);
            const toastEl = document.getElementById('ui-toast-el');
            if (toastEl) {
                const undoBtn = document.createElement('span');
                undoBtn.innerText = 'Undo Switch';
                undoBtn.style.cssText = 'cursor:pointer; text-decoration:underline; margin-left:10px; color:#fff; font-weight:bold;';
                undoBtn.onclick = () => Sim.uiEditChip(prevChip);
                toastEl.appendChild(undoBtn);
            }
            return;
        }
        console.warn('[DEBUG] uiEditChip triggered for library chip:', name);
        // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Apply central sanitization to chip editor context generation.
        this.workspaceStack.push({
            nodes: this.nodes.map(n => this._cleanNode(n)).filter(n => n !== null),
            wires: this.wires.map(w => this._cleanWire(w)).filter(w => w !== null),
            wireMap: new Map(this.wireMap),
            historyStack: window.History ? [...History.stack] : [],
            historyIndex: window.History ? History.index : -1
        });

        // Clear workspace
        this.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
        document.querySelectorAll('.gate').forEach(el => el.remove());
        this.nodes = [];
        this.wires = [];
        this.wireMap.clear();
        const scene = document.getElementById('scene');
        if (scene) scene.innerHTML = '';

        // Load chip internals
        const chip = this.library[name];
        chip.nodes.forEach(n => {
            const cloned = JSON.parse(JSON.stringify(n));
            this.nodes.push(cloned);
            if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(cloned);
        });
        this.wires = JSON.parse(JSON.stringify(chip.wires));
        this.activeEditingChip = name;

        if (window.History) {
            History.stack = [];
            History.index = -1;
            History.updateButtons();
        }

        document.getElementById('btn-exit-chip').style.display = 'inline';
        this.updateWireVisuals();
        this.seedQueue();
        this.processQueue();

        if (!isSwitching) this.toast(`Editing internal logic of ${name}`, 'info');
        this.autoSave();
    },
    /**
     * @ARCH: NETLIST_MUTATION
     * @IO: MODAL_CONFIRM
     * @INTENT: Prompt for confirmation and delete a chip definition from the library, purging all instances.
     */
    uiDeleteChip(name) {
        this.modal('Delete Chip', `Delete ${name}? This will remove all instances from the board.`, 'danger', ok => {
            if (ok) {
                const isEditingThis = this.activeEditingChip === name;

                // 1. Remove from all possible stack contexts
                this.workspaceStack.forEach(ctx => {
                    ctx.nodes = ctx.nodes.filter(n => n.type !== name);
                    const nodeIds = new Set(ctx.nodes.map(n => n.id));
                    ctx.wires = ctx.wires.filter(w => nodeIds.has(w.from.nodeId) && nodeIds.has(w.to.nodeId));
                });

                // 2. Remove from current board
                const ids = new Set(this.nodes.filter(n => n.type === name).map(n => n.id));
                this.nodes = this.nodes.filter(n => !ids.has(n.id));
                this.wires = this.wires.filter(w => !ids.has(w.from.nodeId) && !ids.has(w.to.nodeId));
                ids.forEach(id => document.getElementById(id)?.remove());

                // 3. Remove from library
                delete this.library[name];

                // 4. Handle exit if editing
                if (isEditingThis) {
                    this.activeEditingChip = null;
                    this.workspaceStack = []; // Atomic Reset: Prevent phantom logic boards
                    this.nodes = [];
                    this.wires = [];
                    this.wireMap.clear();
                    document.getElementById('scene').innerHTML = '';
                    this.updateLibraryUI();
                    document.getElementById('btn-exit-chip').style.display = 'none';
                    this.toast('Active chip deleted. Workspace cleared.', 'danger');
                } else {
                    this.updateLibraryUI();
                    this.updateWireVisuals();
                }
                this.autoSave();
            }
        });
    },
    /**
     * @IO: UI_MODAL
     * @INTENT: Display a customizable modal dialog for alerts, prompts, or confirmations.
     */
    modal(title, content, type, callback, val) {
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
     * [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - Overhauled toast engine with global positioning persistence and interaction capture.
     * @ARCH: UI_TOAST_SYSTEM
     * @STATE: TOAST_PERSISTENCE
     * @IO: USER_NOTIFICATION
     * @INTENT: Display interactive, draggable toast notifications with persistent positioning.
     */
    toast(msg, type = 'info', duration = 3000) {
        if (!this.showToasts) {
            // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - EXIT_TRACE: Toast aborted, notifications disabled.
            return;
        }
        if (type === 'debug' && !this.debugToasts) {
            // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - EXIT_TRACE: Toast aborted, debug mode inactive.
            return;
        }

        let el = document.getElementById('ui-toast-el');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ui-toast-el'; el.className = 'ui-toast';
            document.body.appendChild(el);

            let holdTimer;
            let isDragging = false;
            let offsetX, offsetY;

            el.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'SPAN') return; // Bypass button clicks
                holdTimer = setTimeout(() => {
                    isDragging = true;
                    el.classList.add('draggable');
                    el.classList.add('dragging');
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

            window.addEventListener('mouseup', (e) => {
                clearTimeout(holdTimer);
                if (isDragging) {
                    isDragging = false;
                    el.classList.remove('draggable');
                    el.classList.remove('dragging');
                    const rect = el.getBoundingClientRect();
                    Sim.toastPos = { left: rect.left, top: rect.top };
                    Sim.autoSave(); 
                }
            });
            
            el.addEventListener('mouseleave', () => {
                if (!isDragging) clearTimeout(holdTimer);
            });
        }
        
        el.innerHTML = msg; // innerHTML allows nested action buttons
        el.className = `ui-toast show toast-${type}`;
        
        if (this.toastPos) {
            el.style.left = this.toastPos.left + 'px';
            el.style.top = this.toastPos.top + 'px';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
        } else {
            el.style.left = '50%';
            el.style.bottom = '80px';
            el.style.top = 'auto';
            el.style.transform = 'translateX(-50%)';
        }

        clearTimeout(this._toastTimer);
        if (duration > 0) {
            this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
        }
        // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - EXIT_TRACE: Toast notification lifecycle initiated.
    },

    /**
     * @IO: UI_MODAL
     * @STATE: PREFERENCES
     * @INTENT: Display the global simulator preferences modal and synchronize user adjustments.
     */
    showPrefs() {
        this.modal('Simulator Preferences', `
            <div style="display:flex; flex-direction:column; gap:12px;">
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Grid Snapping</span>
                    <input type="checkbox" ${this.snapNodes ? 'checked' : ''} onchange="Sim.snapNodes = this.checked">
                </label>
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Bulk Delete Confirmation</span>
                    <input type="checkbox" ${this.confirmDelete ? 'checked' : ''} onchange="Sim.confirmDelete = this.checked">
                </label>
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Show Notifications</span>
                    <input type="checkbox" ${this.showToasts ? 'checked' : ''} onchange="Sim.showToasts = this.checked">
                </label>
                <label style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--wire-on)">Debug Notifications</span>
                    <input type="checkbox" ${this.debugToasts ? 'checked' : ''} onchange="Sim.debugToasts = this.checked">
                </label>
                <div style="margin-top:5px; font-size:11px; color:#aaa;">HUD Position:
                    <select onchange="Sim.hudPos=this.value; Sim.updateHUD();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px;">
                        <option value="top-right" ${this.hudPos === 'top-right' ? 'selected' : ''}>Top-Right</option>
                        <option value="top-left" ${this.hudPos === 'top-left' ? 'selected' : ''}>Top-Left</option>
                        <option value="bottom-left" ${this.hudPos === 'bottom-left' ? 'selected' : ''}>Bottom-Left</option>
                    </select>
                </div>
                <div style="margin-top:5px; font-size:11px; color:#aaa;">Port Size:
                    <select onchange="Sim.portSize=this.value; Sim.applyStyles();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px;">
                        <option value="small" ${this.portSize === 'small' ? 'selected' : ''}>Small</option>
                        <option value="medium" ${this.portSize === 'medium' || !this.portSize ? 'selected' : ''}>Medium</option>
                        <option value="large" ${this.portSize === 'large' ? 'selected' : ''}>Large</option>
                    </select>
                </div>
                <div style="margin-top:5px; font-size:11px; color:#aaa;">Indicator Dot Size:
                    <select onchange="Sim.dotSize=this.value; Sim.applyStyles();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px;">
                        <option value="small" ${this.dotSize === 'small' ? 'selected' : ''}>Small (8px)</option>
                        <option value="medium" ${this.dotSize === 'medium' || !this.dotSize ? 'selected' : ''}>Medium (12px)</option>
                        <option value="large" ${this.dotSize === 'large' ? 'selected' : ''}>Large (16px)</option>
                    </select>
                </div>
                <div style="height:1px; background:#333; margin: 8px 0 4px 0;"></div>
                <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <span style="font-weight:bold; color:var(--wire-on);">Execution Engine:</span>
                    <select onchange="Sim.setEngine(this.value);" style="background:#111; color:#fff; border:1px solid #444; padding:4px 8px; border-radius:4px; outline:none; cursor:pointer; font-family:'JetBrains Mono', monospace; font-size: 11px;">
                        <option value="wasm" ${this.useWasm ? 'selected' : ''}>WASM (High Performance)</option>
                        <option value="v8" ${!this.useWasm ? 'selected' : ''}>V8 JavaScript (Fallback)</option>
                    </select>
                </label>
            </div>
        `, 'confirm');
    },

    /**
     * [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Multi-tab context switching logic.
     * @ARCH: WORKSPACE_MANAGER
     * @STATE: CONTEXT_SWITCH
     * @INTENT: Manage tab instances, synchronize active working memory to inactive tabs, and hydrate DOM states.
     */
    updateTabsUI() {
        const tb = document.getElementById('tab-bar');
        if (!tb) return;
        let html = '';
        this.tabs.forEach((t, i) => {
            html += `<div class="tab ${t.id === this.activeTabId ? 'active' : ''}" onclick="Sim.uiSwitchTab('${t.id}')">
                ${t.name}
                ${this.tabs.length > 1 ? `<span class="tab-close" onclick="event.stopPropagation(); Sim.uiCloseTab('${t.id}')">✖</span>` : ''}
            </div>`;
        });
        html += `<div class="tab-btn" onclick="Sim.uiNewTab()">+</div>`;
        tb.innerHTML = html;
    },

    uiNewTab() {
        if (this.activeEditingChip) return this.toast('Cannot create tabs while editing a chip.', 'warning');
        const newId = 'tab-' + Math.random().toString(36).substr(2, 5);
        this.tabs.push({ id: newId, name: `Board ${this.tabs.length + 1}`, nodes: [], wires: [], historyStack: [], historyIndex: -1, activeSplitChip: null, splitDirection: 'right' });
        this.uiSwitchTab(newId);
    },

    // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Refactored tab switching to use centralized fault-tolerant clean methods.
    uiSwitchTab(id) {
        if (this.activeEditingChip) return this.toast('Exit chip editor before switching tabs.', 'warning');
        if (this.activeTabId === id) return;

        // 1. Save current state to old tab
        const oldTab = this.tabs.find(t => t.id === this.activeTabId);
        if (oldTab) {
            oldTab.nodes = this.nodes.map(n => this._cleanNode(n)).filter(n => n !== null);
            oldTab.wires = this.wires.map(w => this._cleanWire(w)).filter(w => w !== null);
            if (window.History) {
                oldTab.historyStack = [...History.stack];
                oldTab.historyIndex = History.index;
            }
            oldTab.activeSplitChip = this.activeSplitChip;
            const mainEl = document.getElementById('main');
            oldTab.splitDirection = mainEl?.classList.contains('split-left') ? 'left' : (mainEl?.classList.contains('split-right') ? 'right' : (this.activeSplitChip ? 'popup' : null));
        }

        // Close split pane if active
        const splitFrame = document.getElementById('split-editor-frame');
        if (splitFrame) splitFrame.remove();
        const popupWrap = document.getElementById('popup-editor-wrap');
        if (popupWrap) popupWrap.remove();
        const main = document.getElementById('main');
        if (main) main.classList.remove('workspace-split', 'split-left', 'split-right');
        this.activeSplitChip = null;

        // 2. Clear current workspace
        this.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
        document.querySelectorAll('.gate').forEach(el => el.remove());
        this.nodes = []; this.wires = []; this.wireMap.clear();
        const scene = document.getElementById('scene');
        if (scene) scene.innerHTML = '';

        // 3. Load new state
        this.activeTabId = id;
        const newTab = this.tabs.find(t => t.id === id);
        if (newTab) {
            (newTab.nodes || []).forEach(n => {
                const c = this._cleanNode(n);
                if (c) {
                    this.nodes.push(c);
                    if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(c);
                }
            });
            this.wires = (newTab.wires || []).map(w => this._cleanWire(w)).filter(w => w !== null);
            if (window.History) {
                History.stack = newTab.historyStack ? [...newTab.historyStack] : [];
                History.index = newTab.historyIndex !== undefined ? newTab.historyIndex : -1;
                History.updateButtons();
            }
            
            // [AUDIT: v1.24.11 | SEC_ARCH_LEAD] - Restore persisted split-pane editor context on tab switch.
            if (newTab.activeSplitChip) {
                this.uiSplitEditor(newTab.splitDirection || 'right', newTab.activeSplitChip, true);
            }
        }

        this.updateTabsUI();
        this.updateWireVisuals();
        this.seedQueue(); this.processQueue();
        this.autoSave();
    },

    uiCloseTab(id) {
        if (this.tabs.length <= 1) return;
        this.modal('Close Tab', 'Are you sure? Unsaved changes in this tab will be lost.', 'danger', (ok) => {
            if (ok) {
                const idx = this.tabs.findIndex(t => t.id === id);
                this.tabs = this.tabs.filter(t => t.id !== id);
                if (this.activeTabId === id) {
                    this.uiSwitchTab(this.tabs[Math.max(0, idx - 1)].id);
                } else {
                    this.updateTabsUI();
                    this.autoSave();
                }
            }
        });
    },

    /**
     * @ARCH: WORKSPACE_RESET
     * @IO: LOCAL_STORAGE_DELETE
     * @INTENT: Completely wipe the active workspace, library, and autosave to start a fresh project.
     */
    uiNewProject() {
        this.modal('New Project', 'Warning: This will wipe your library, workspace, and autosave. Continue?', 'confirm', (ok) => {
            if (ok) {
                localStorage.removeItem('bsim_autosave');
                location.reload();
            }
        });
    },
    /**
     * @ARCH: UI_STYLING
     * @INTENT: Synchronize dynamic CSS variables (e.g., port size) with current application preferences.
     */
    applyStyles() {
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Added dynamic scaling mapping for logic state indicators.
        const sizeMap = { 'small': '15%', 'medium': '25%', 'large': '35%' };
        document.documentElement.style.setProperty('--port-size', sizeMap[this.portSize || 'medium']);
        
        const dotMap = { 'small': '8px', 'medium': '12px', 'large': '16px' };
        document.documentElement.style.setProperty('--dot-size', dotMap[this.dotSize || 'medium']);
    },
    /**
     * @ARCH: NETLIST_FACTORY
     * @STATE: LIBRARY_PERSISTENCE
     * @INTENT: Snapshot the current workspace into a new custom chip definition and register it in the library.
     */
    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Hierarchical namespacing injection for macro library.
    uiSaveAsGate() {
        this.modal('Save Custom Chip', 'Enter name (e.g., FolderName/ChipName):', 'prompt', (input) => {
            if (input && input.trim()) {
                let n = input.trim();
                let folder = '';
                if (n.includes('/')) {
                    const parts = n.split('/');
                    n = parts.pop().trim();
                    folder = parts.join('/').trim();
                }
                if (this.library[n]) {
                    this.toast('A chip with this name already exists!', 'warning');
                    return;
                }
                this.library[n] = {
                    folder: folder,
                    nodes: this.nodes.map(n => this._cleanNode(n)).filter(n => n !== null),
                    wires: this.wires.map(w => this._cleanWire(w)).filter(w => w !== null)
                };
                this.updateLibraryUI();
                this.toast(`Chip "${n}" saved to ${folder ? 'folder ' + folder : 'library'}`, 'success');
                this.autoSave();
            }
        });
    },

    /**
     * [AUDIT: SEC_ARCH_LEAD] - Entry trace for parametric node edit mode.
     * @ARCH: UI_CONTROLLER
     * @STATE: LAYOUT_MUTATION
     * @INTENT: Enable bounded spatial editing for internal pin indicators and node geometry via click-drag isolation.
     */
    enterNodeEditMode(nodeId, mode) {
        const node = this.nodes.find(n => n.id === nodeId);
        const el = document.getElementById(nodeId);
        if (!node || !el) return;
        this.activeNodeEdit = { node, mode, og: { w: node.customWidth, h: node.customHeight, px: node.pinX, py: node.pinY, pw: node.pinW, ph: node.pinH, ix: node.infoX, iy: node.infoY, iw: node.infoW, ih: node.infoH, lx: node.labelX, ly: node.labelY, lw: node.labelW, lh: node.labelH, portY: node.portY, portH: node.portH } };
        
        // [AUDIT: SEC_ARCH_LEAD] - Lock global wiring interactions to prevent misclicks during layout mutation.
        document.body.classList.add('edit-mode-active');
        
        // [AUDIT: v1.24.36 | SEC_ARCH_LEAD] - Isolated base outline rendering to prevent multi-box rendering glitches on inner wrappers.
        if (mode === 'icon') el.style.outline = '2px dashed #00ffaa';
        
        const pinCont = el.querySelector('.pin-container');
        const infoCont = el.querySelector('.visual-extra');
        const lblCont = el.querySelector('.gate-label');
        let target = (mode === 'pins' || mode === 'pin-dots') ? pinCont : (mode === 'info' ? infoCont : (mode === 'label' ? lblCont : el));
        
        // [AUDIT: v1.24.34 | SEC_ARCH_LEAD] - Dynamic proxy generation for port geometry mutations.
        if (mode === 'pin-labels' || mode === 'pin-both') {
            let proxy = el.querySelector('.port-edit-proxy');
            if (!proxy) {
                proxy = document.createElement('div');
                proxy.className = 'port-edit-proxy editing-pins';
                proxy.style.position = 'absolute';
                // [AUDIT: v1.24.36 | SEC_ARCH_LEAD] - Switched to unified yellow dashed border styling for macro port proxies.
                proxy.style.background = 'rgba(255, 202, 40, 0.1)';
                proxy.style.zIndex = '500';
                const py = node.portY !== undefined ? node.portY : 24;
                const ph = node.portH !== undefined ? node.portH : (node.customHeight || parseInt(el.style.height) || 64) - 30;
                proxy.style.top = py + 'px'; proxy.style.left = '-10px';
                proxy.style.width = (parseInt(el.style.width) || 90) + 20 + 'px';
                proxy.style.height = ph + 'px';
                el.appendChild(proxy);
            }
            target = proxy;
        }
        if (!target) return;
        
        // [AUDIT: v1.24.26 | SEC_ARCH_LEAD] - Injected edit mode dispatch handling for gate label components.
        if (mode === 'pins' || mode === 'pin-dots' || mode === 'info' || mode === 'label' || mode === 'pin-labels' || mode === 'pin-both') {
            if (mode === 'info' && node.infoX === undefined) {
                // [AUDIT: SEC_ARCH_LEAD] - Initialize default offset coordinates if previously relative
                node.infoX = target.offsetLeft;
                node.infoY = target.offsetTop;
                node.infoW = target.offsetWidth;
                node.infoH = target.offsetHeight;
                target.style.position = 'absolute';
                target.style.margin = '0';
            }
            if (mode === 'label' && node.labelX === undefined) {
                node.labelX = target.offsetLeft;
                node.labelY = target.offsetTop;
                node.labelW = target.offsetWidth;
                node.labelH = target.offsetHeight;
                target.style.position = 'absolute';
                target.style.margin = '0';
            }
            target.classList.add('editing-pins');
            target.style.outline = (mode === 'pin-labels' || mode === 'pin-both') ? '2px dotted #ffca28' : '2px dashed #ff00aa';
            target.style.cursor = 'move';
            target.style.transform = 'none'; // Release absolute centering lock for dragging
            
            // [AUDIT: v1.24.35 | SEC_ARCH_LEAD] - Cursor mapping overriding for symmetric layout stretching.
            this._editHover = (ev) => {
                const rect = target.getBoundingClientRect();
                const scale = View.scale || 1;
                const hx = (ev.clientX - rect.left) / scale;
                const hy = (ev.clientY - rect.top) / scale;
                const thX = Math.min(12, target.offsetWidth / 3);
                const thY = Math.min(12, target.offsetHeight / 3);
                const hLeft = hx < thX;
                const hRight = hx > target.offsetWidth - thX;
                const hTop = hy < thY;
                const hBottom = hy > target.offsetHeight - thY;
                
                if (mode === 'pin-labels' || mode === 'pin-both') target.style.cursor = 'ns-resize';
                else if ((hTop && hLeft) || (hBottom && hRight)) target.style.cursor = 'nwse-resize';
                else if ((hTop && hRight) || (hBottom && hLeft)) target.style.cursor = 'nesw-resize';
                else if (hTop || hBottom) target.style.cursor = 'ns-resize';
                else if (hLeft || hRight) target.style.cursor = 'ew-resize';
                else target.style.cursor = 'move';
            };
            target.addEventListener('mousemove', this._editHover);
        } else {
            el.style.cursor = 'se-resize';
        }

        this._editModeDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            
            // [AUDIT: SEC_ARCH_LEAD] - Proportional grab-zone calculation to guarantee a central translation zone.
            const rect = target.getBoundingClientRect();
            const scale = View.scale || 1;
            const clickX = (e.clientX - rect.left) / scale;
            const clickY = (e.clientY - rect.top) / scale;
            
            const thX = Math.min(12, target.offsetWidth / 3);
            const thY = Math.min(12, target.offsetHeight / 3);
            const rLeft = clickX < thX;
            const rRight = clickX > target.offsetWidth - thX;
            const rTop = clickY < thY;
            const rBottom = clickY > target.offsetHeight - thY;
            // [AUDIT: v1.24.38 | SEC_ARCH_LEAD] - Unified translation and scaling boolean logic to prevent dead zones on proxy.
            const isResizing = (mode === 'pin-labels' || mode === 'pin-both') ? (rLeft || rRight || rTop || rBottom) : ((mode === 'pins' || mode === 'pin-dots' || mode === 'info' || mode === 'label') && (rLeft || rRight || rTop || rBottom));
            
            const startX = e.clientX;
            const startY = e.clientY;
            const isInfo = mode === 'info';
            const isLabel = mode === 'label';
            const isPort = mode === 'pin-labels' || mode === 'pin-both';
            const startPinX = isInfo ? (node.infoX || 0) : (isLabel ? (node.labelX || 0) : (node.pinX || 0));
            const startPinY = isInfo ? (node.infoY || 0) : (isLabel ? (node.labelY || 0) : (isPort ? (node.portY !== undefined ? node.portY : 24) : (node.pinY || 0)));
            const startPinW = isInfo ? (node.infoW || target.offsetWidth) : (isLabel ? (node.labelW || target.offsetWidth) : (node.pinW || target.offsetWidth));
            const startPinH = isInfo ? (node.infoH || target.offsetHeight) : (isLabel ? (node.labelH || target.offsetHeight) : (isPort ? (node.portH !== undefined ? node.portH : (node.customHeight || parseInt(el.style.height) || 64) - 30) : (node.pinH || target.offsetHeight)));
            const startNodeW = node.customWidth || parseInt(el.style.width) || 90;
            const startNodeH = node.customHeight || parseInt(el.style.height) || 80;
            const startBasePinY = node.pinY || 0;
            const startBasePinH = node.pinH || (pinCont ? pinCont.offsetHeight : 16);

            const onMove = (m) => {
                const scale = View.scale || 1;
                const dx = (m.clientX - startX) / scale;
                const dy = (m.clientY - startY) / scale;
                
                if (mode === 'icon') {
                    node.customWidth = Math.max(40, startNodeW + dx);
                    node.customHeight = Math.max(40, startNodeH + dy);
                    el.style.width = node.customWidth + 'px';
                    el.style.height = node.customHeight + 'px';
                    Sim.updateWireVisuals();
                } else if (mode === 'pins' || mode === 'info' || mode === 'label' || mode === 'pin-labels' || mode === 'pin-both') {
                    let cX = startPinX, cY = startPinY, cW = startPinW, cH = startPinH;
                    if (isResizing || m.shiftKey) { 
                        // [AUDIT: v1.24.27 | SEC_ARCH_LEAD] - Adjusted scaling constraints for label geometries to permit overhangs and font scaling.
                        if (rLeft) {
                            const nextX = mode === 'label' ? startPinX + dx : Math.max(0, startPinX + dx);
                            const diffX = nextX - startPinX;
                            cX = nextX;
                            cW = Math.max(16, startPinW - diffX);
                        } else if (rRight) {
                            cW = Math.max(16, mode === 'label' ? Math.min(startNodeW * 3, startPinW + dx) : Math.min(startNodeW - startPinX, startPinW + dx));
                        }

                        if (mode === 'pin-labels' || mode === 'pin-both') {
                            // [AUDIT: v1.24.38 | SEC_ARCH_LEAD] - Isolated 1D vertical geometric mutations for port proxies absorbing horizontal input without translation.
                            cX = startPinX; 
                            cW = startPinW;
                            if (rTop) {
                                const nextY = startPinY + dy;
                                cY = nextY;
                                cH = Math.max(10, startPinH - (nextY - startPinY));
                            } else if (rBottom) {
                                cH = Math.max(10, startPinH + dy);
                            } else if (m.shiftKey) { // Shift-drag from center symmetrically scales
                                cY = startPinY - dy;
                                cH = Math.max(10, startPinH + dy * 2);
                            }
                        } else if (rTop) {
                            const nextY = mode === 'label' ? startPinY + dy : Math.max(0, startPinY + dy);
                            const diffY = nextY - startPinY;
                            cY = nextY;
                            cH = Math.max(10, startPinH - diffY);
                        } else if (rBottom) {
                            cH = Math.max(10, mode === 'label' ? Math.min(startNodeH, startPinH + dy) : Math.min(startNodeH - startPinY, startPinH + dy));
                        }
                    } else { 
                        // Move from Center
                        const curW = startPinW || target.offsetWidth || 16;
                        const curH = startPinH || target.offsetHeight || 16;
                        const maxW = Math.max(0, startNodeW - curW);
                        const maxH = Math.max(0, startNodeH - curH);
                        cX = mode === 'label' ? startPinX + dx : Math.max(0, Math.min(maxW, startPinX + dx));
                        cY = mode === 'label' ? startPinY + dy : Math.max(0, Math.min(maxH, startPinY + dy));
                    }
                    
                    if (mode === 'info') {
                        node.infoX = cX; node.infoY = cY; node.infoW = cW; node.infoH = cH;
                    } else if (mode === 'label') {
                        node.labelX = cX; node.labelY = cY; node.labelW = cW; node.labelH = cH;
                    } else if (mode === 'pin-labels') {
                        node.portY = cY; node.portH = cH;
                    } else if (mode === 'pin-both') {
                        // [AUDIT: v1.24.36 | SEC_ARCH_LEAD] - Synchronized physical pin arrays with proxy height and vertical delta.
                        node.portY = cY; node.portH = cH;
                        node.pinY = startBasePinY + (cY - startPinY);
                        node.pinH = startBasePinH + (cH - startPinH);
                    } else {
                        node.pinX = cX; node.pinY = cY; node.pinW = cW; node.pinH = cH;
                    }
                    
                    if (mode === 'pin-labels' || mode === 'pin-both') {
                        Sim.updateNodeVisual(node);
                        Sim.updateWireVisuals();
                    }
                    target.style.width = cW + 'px';
                    target.style.height = cH + 'px';
                    target.style.left = cX + 'px';
                    target.style.top = cY + 'px';
                }
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
        
        target.addEventListener('mousedown', this._editModeDown);
        this.toast(`Edit Mode: ${mode === 'pins' ? 'Drag to move, Shift+Drag to resize' : 'Drag bottom-right to scale'}. Double-click board to save.`, 'info', 0);
    },

    exitNodeEditMode() {
        if (!this.activeNodeEdit) return;
        // [AUDIT: SEC_ARCH_LEAD] - Release global wiring interaction lock.
        document.body.classList.remove('edit-mode-active');
        const state = this.activeNodeEdit;
        this.activeNodeEdit = null;
        
        const el = document.getElementById(state.node.id);
        const pinCont = el?.querySelector('.pin-container');
        const infoCont = el?.querySelector('.visual-extra');
        const lblCont = el?.querySelector('.gate-label');
        let target = state.mode === 'pins' || state.mode === 'pin-dots' ? pinCont : (state.mode === 'info' ? infoCont : (state.mode === 'label' ? lblCont : el));
        if (state.mode === 'pin-labels' || state.mode === 'pin-both') target = el?.querySelector('.port-edit-proxy');
        
        if (target && this._editModeDown) {
            target.removeEventListener('mousedown', this._editModeDown);
            if (this._editHover) target.removeEventListener('mousemove', this._editHover);
        }
        
        if (el) { el.style.outline = ''; el.style.cursor = ''; }
        if (pinCont) { pinCont.classList.remove('editing-pins'); pinCont.style.outline = ''; pinCont.style.cursor = ''; }
        if (infoCont) { infoCont.classList.remove('editing-pins'); infoCont.style.outline = ''; infoCont.style.cursor = ''; }
        if (lblCont) { lblCont.classList.remove('editing-pins'); lblCont.style.outline = ''; lblCont.style.cursor = ''; }
        const proxy = el?.querySelector('.port-edit-proxy');
        if (proxy) proxy.remove();

        const nw = { w: state.node.customWidth, h: state.node.customHeight, px: state.node.pinX, py: state.node.pinY, pw: state.node.pinW, ph: state.node.pinH, ix: state.node.infoX, iy: state.node.infoY, iw: state.node.infoW, ih: state.node.infoH, lx: state.node.labelX, ly: state.node.labelY, lw: state.node.labelW, lh: state.node.labelH, portY: state.node.portY, portH: state.node.portH };
        if (JSON.stringify(nw) !== JSON.stringify(state.og)) {
            // [AUDIT: SEC_ARCH_LEAD] - Delegated layout state modifications to structured history command.
            History.execute(new MutateLayoutCommand(state.node, state.og, nw));
        } else {
            Sim.updateNodeVisual(state.node);
            Sim.updateWireVisuals();
        }
        
        this.toast('Layout saved. ', 'success', 5000);
        const tEl = document.getElementById('ui-toast-el');
        if (tEl) {
            const btn = document.createElement('span');
            btn.innerText = '[Apply Global]';
            btn.style.cssText = 'cursor:pointer; text-decoration:underline; margin-left:10px; font-weight:bold; color:#fff;';
            // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - Apply persistence write and rigid bounds to global node mutator dispatch.
            btn.onclick = () => {
                this.nodes.forEach(n => {
                    if (n.type === state.node.type) {
                        n.customWidth = state.node.customWidth; n.customHeight = state.node.customHeight;
                        n.pinX = state.node.pinX; n.pinY = state.node.pinY;
                        n.pinW = state.node.pinW; n.pinH = state.node.pinH;
                        n.infoX = state.node.infoX; n.infoY = state.node.infoY;
                        n.infoW = state.node.infoW; n.infoH = state.node.infoH;
                        n.labelX = state.node.labelX; n.labelY = state.node.labelY;
                        n.labelW = state.node.labelW; n.labelH = state.node.labelH;
                        n.portY = state.node.portY; n.portH = state.node.portH;
                        Sim.updateNodeVisual(n);
                    }
                });
                this.updateWireVisuals();
                this.autoSave();
                this.toast(`Global layout applied to all ${state.node.type} components.`, 'success');
                // [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - EXIT_TRACE: Global layout mutation finalized and persisted.
            };
            tEl.appendChild(btn);
        }
        this.autoSave();
    },

    /**
     * [AUDIT: v1.23.79 | SEC_ARCH_LEAD] - Parametric macro geometry bounds override.
     * @ARCH: NETLIST_FACTORY
     * @INTENT: Modify the custom bounding box of a chip globally, mathematical offsets automatically realign.
     */
    uiScaleChip(name) {
        this.modal('Set Custom Geometry', 'Enter width and height (e.g., 100,200):', 'prompt', (input) => {
            if (!input) return;
            const dims = input.split(',').map(n => parseInt(n.trim()));
            if (dims.length !== 2 || isNaN(dims[0]) || isNaN(dims[1])) return this.toast('Invalid format. Use W,H', 'danger');
            
            // Apply to active nodes on the board
            this.nodes.forEach(n => {
                if (n.type === name) {
                    n.customWidth = dims[0];
                    n.customHeight = dims[1];
                    const el = document.getElementById(n.id);
                    if (el) { el.remove(); NodeRenderer.renderNode(n); }
                }
            });
            this.updateWireVisuals();
            this.toast(`Geometry for ${name} updated.`, 'success');
            this.autoSave();
        });
    },


    /**
     * @IO: UI_PROMPT
     * @STATE: INPUT_MUTATION
     * @INTENT: Prompt the user for a numeric value (Hex, Dec, Bin) and apply it to a multi-bit input node.
     */
    uiInlineEditValue(e, id, format) {
        // [AUDIT: SEC_ARCH_LEAD] - Inline structural editor for multi-bit readouts.
        if (document.body.classList.contains('edit-mode-active')) return;
        const target = e.currentTarget;
        if (target.querySelector('input')) return; // Already editing

        const n = this.nodes.find(node => node.id === id);
        if (!n || !n.type.startsWith('IN-')) return;
        const bits = parseInt(n.type.split('-')[1]) || 1;
        
        let currentNum = 0;
        if (bits === 1) {
            currentNum = n.val;
        } else {
            for (let i = 0; i < bits; i++) currentNum |= (n.state[i] ? 1 : 0) << i;
        }
        
        let prefill = currentNum.toString(10);
        if (format === 'H') prefill = currentNum.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
        else if (format === 'B') prefill = currentNum.toString(2).padStart(bits, '0');
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = prefill;
        input.style.cssText = 'width: 100%; height: 100%; box-sizing: border-box; background: #222; color: #fff; border: 1px solid #00ffaa; font-family: "JetBrains Mono", monospace; font-size: inherit; text-align: center; outline: none; border-radius: 2px;';
        
        const ogText = target.innerText;
        target.innerText = '';
        target.appendChild(input);
        
        const commit = () => {
            if (!target.contains(input)) return;
            const cleanVal = input.value.trim();
            let num;
            if (cleanVal.toLowerCase().startsWith('0x')) num = parseInt(cleanVal, 16);
            else if (cleanVal.toLowerCase().startsWith('0b')) num = parseInt(cleanVal.substring(2), 2);
            else {
                if (format === 'H') num = parseInt(cleanVal, 16);
                else if (format === 'B') num = parseInt(cleanVal, 2);
                else num = parseInt(cleanVal, 10);
            }

            if (isNaN(num)) {
                this.toast('Invalid number format', 'danger');
                target.innerHTML = ogText;
            } else {
                const maxVal = (1 << bits) - 1;
                num = Math.max(0, Math.min(maxVal, num));
                if (bits === 1) {
                    n.state = num > 0 ? 1 : 0;
                    n.val = n.state;
                } else {
                    for (let i = 0; i < bits; i++) n.state[i] = (num & (1 << i)) ? 1 : 0;
                    n.val = [...n.state];
                }
                this.updateNodeVisual(n);
                this.seedQueue(); this.processQueue();
            }
        };

        input.onblur = commit;
        input.onkeydown = (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
            if (ev.key === 'Escape') { target.innerHTML = ogText; }
        };
        input.focus();
        input.select();
    },

    // [AUDIT: v1.24.25 | SEC_ARCH_LEAD] - Purged legacy uiEnterValue popup logic in favor of inline editing.


    /**
     * @ARCH: WORKSPACE_RESET
     * @INTENT: Clear the active workspace to prepare for a new logic design without wiping the library.
     */
    uiNewChip() {
        this.modal('New Chip', 'Clear workspace? Your saved library will be kept.', 'confirm', (ok) => {
            if (ok) {
                this.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
                document.querySelectorAll('.gate').forEach(el => el.remove());
                this.nodes = []; this.wires = []; this.wireMap.clear();
                if (window.History) { History.stack = []; History.index = -1; History.updateButtons(); }
                const scene = document.getElementById('scene');
                if (scene) scene.innerHTML = '';
                this.updateWireVisuals(); this.seedQueue();
            }
        });
    },

    /**
     * @ARCH: SESSION_TERMINATION
     * @INTENT: Terminate the current simulation session and optionally clear persistence.
     */
    uiQuit() {
        this.modal('Quit', 'Discard current session and clear autosave before exiting?', 'danger', (discard) => {
            if (discard) localStorage.removeItem('bsim_autosave');
            window.close();
        });
    },

    /**
     * @IO: UI_COORDINATE_RESOLVER
     * @ARCH: RENDERING_QUERIES
     * @INTENT: Identify a wire at a specific coordinate for interaction handling.
     */
    getWireAt(x, y) {
        return this.wires.find(w => {
            const p1 = this.getPortCoords(w.from.nodeId, w.from.portId);
            const p2 = this.getPortCoords(w.to.nodeId, w.to.portId);
            if (!p1 || !p2) return false;
            const mode = w.orthoDir || 'H';
            if (mode === 'H') {
                const midX = (typeof w.midX === 'number') ? (w.midX * View.scale + View.x) : (p1.x + (p2.x - p1.x) / 2);
                return this.distToSegment(x, y, p1.x, p1.y, midX, p1.y) < 10 ||
                    this.distToSegment(x, y, midX, p1.y, midX, p2.y) < 10 ||
                    this.distToSegment(x, y, midX, p2.y, p2.x, p2.y) < 10;
            } else {
                const midY = (typeof w.midY === 'number') ? (w.midY * View.scale + View.y) : (p1.y + (p2.y - p1.y) / 2);
                return this.distToSegment(x, y, p1.x, p1.y, p1.x, midY) < 10 ||
                    this.distToSegment(x, y, p1.x, midY, p2.x, midY) < 10 ||
                    this.distToSegment(x, y, p2.x, midY, p2.x, p2.y) < 10;
            }
        });
    },

    /**
     * @CONSTRAINT: GEOMETRIC_MATH
     * @INTENT: Calculate the minimum distance between a point and a line segment.
     */
    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = Math.hypot(x2 - x1, y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (l2 * l2)));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    },

    /**
     * @STATE: NETLIST_INDEXING
     * @INTENT: Rebuild the internal wireMap index for fast signal resolution lookups.
     */
    reindexWires() {
        this.wireMap.clear();
        this.wires.forEach(w => {
            this.wireMap.set(`${w.to.nodeId}:${w.to.portId}`, w);
            this.wireMap.set(`${w.from.nodeId}:${w.from.portId}:src`, w);
        });
    },

    /**
     * @STATE: UI_FEEDBACK_RESET
     * @INTENT: Clear all active port-snapping highlights and reset the snapping state.
     */
    clearSnapState() {
        document.querySelectorAll('.snap-hover').forEach(el => el.classList.remove('snap-hover'));
        this.wiring.snapTarget = null;
    },


    /**
     * @ARCH: WORKSPACE_CONTEXT_SWITCH
     * @STATE: LIBRARY_SYNC
     * @INTENT: Save current chip logic to the library and return to the parent workspace context.
     */
    // [AUDIT: v1.24.11 | SEC_ARCH_LEAD] - Architecture augmentation for dual-pane editing layout with workspace clearing and state restoration.
    uiSplitEditor(direction, overrideChip = null, isRestore = false) {
        const targetChip = overrideChip || this.activeEditingChip;
        if (!targetChip) return;
        const tab = document.querySelector(`.tab[onclick*="${this.activeTabId}"]`);
        
        let splitFrame = document.getElementById('split-editor-frame');
        let popupWrap = document.getElementById('popup-editor-wrap');
        
        if (splitFrame) splitFrame.remove();
        if (popupWrap) popupWrap.remove();
        
        const main = document.getElementById('main');
        main.classList.remove('workspace-split', 'split-left', 'split-right');
        
        const chipUrl = `?chip=${encodeURIComponent(targetChip)}`;

        if (direction === 'popup') {
            popupWrap = document.createElement('div');
            popupWrap.id = 'popup-editor-wrap';
            // [AUDIT: v1.24.40 | SEC_ARCH_LEAD] - Expanded popup editor wrapper with granular edge-resize hitboxes and window control toggles.
            popupWrap.style.cssText = 'position: fixed; top: 100px; left: 100px; width: 600px; height: 400px; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(8px); border: 1px solid #334; border-radius: 6px; display: flex; flex-direction: column; z-index: 9000; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8);';
            
            popupWrap.innerHTML = `
                <div id="popup-editor-head" style="background: #111; padding: 6px 10px; color: #888; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none; border-bottom: 1px solid #222; font-family: 'JetBrains Mono', monospace; font-size: 12px; flex-shrink: 0; height: 28px; box-sizing: border-box;">
                    <div style="font-weight:bold; color:#ffca28; pointer-events:none;">CHIP EDITOR: ${targetChip}</div>
                    <div style="display:flex; gap:12px; align-items:center;">
                        <span onclick="const w = document.getElementById('popup-editor-wrap'); if(w.dataset.minimized==='true') return; w.dataset.ow=w.style.width||w.offsetWidth+'px'; w.dataset.oh=w.style.height||w.offsetHeight+'px'; w.style.width='250px'; w.style.height='28px'; w.dataset.minimized='true';" style="cursor:pointer; font-weight:bold; color:#00ffaa; transform:translateY(-4px);">_</span>
                        <span onclick="const w = document.getElementById('popup-editor-wrap'); if(w.dataset.minimized!=='true') return; w.style.width=w.dataset.ow; w.style.height=w.dataset.oh; w.dataset.minimized='false';" style="cursor:pointer; font-weight:bold; color:#00ffaa; font-size:16px; transform:translateY(-1px);">□</span>
                        <span onclick="document.getElementById('popup-editor-wrap').remove(); document.querySelector('.tab.has-split')?.classList.remove('has-split'); Sim.activeSplitChip = null;" style="cursor:pointer; font-weight:bold; color:#ff4757;">X</span>
                    </div>
                </div>
                <div class="pe-resize top" style="position:absolute; top:0; left:0; width:100%; height:6px; cursor:n-resize; z-index:100;"></div>
                <div class="pe-resize bottom" style="position:absolute; bottom:0; left:0; width:100%; height:6px; cursor:s-resize; z-index:100;"></div>
                <div class="pe-resize left" style="position:absolute; top:0; left:0; width:6px; height:100%; cursor:w-resize; z-index:100;"></div>
                <div class="pe-resize right" style="position:absolute; top:0; right:0; width:6px; height:100%; cursor:e-resize; z-index:100;"></div>
                <div class="pe-resize top-left" style="position:absolute; top:0; left:0; width:10px; height:10px; cursor:nw-resize; z-index:101;"></div>
                <div class="pe-resize top-right" style="position:absolute; top:0; right:0; width:10px; height:10px; cursor:ne-resize; z-index:101;"></div>
                <div class="pe-resize bottom-left" style="position:absolute; bottom:0; left:0; width:10px; height:10px; cursor:sw-resize; z-index:101;"></div>
                <div class="pe-resize bottom-right" style="position:absolute; bottom:0; right:0; width:10px; height:10px; cursor:se-resize; z-index:101;"></div>
                <iframe src="${chipUrl}" style="flex:1; border:none; width:100%; height:100%; background:var(--bg);"></iframe>
            `;
            document.body.appendChild(popupWrap);
            
            // [AUDIT: v1.24.16 | SEC_ARCH_LEAD] - Hardened popup editor drag state against iframe input swallowing.
            let isDragging = false, isResizing = false, resizeDir = '', startX, startY, initX, initY, initW, initH;
            const head = popupWrap.querySelector('#popup-editor-head');
            head.onmousedown = (e) => {
                if (e.target.tagName === 'SPAN') return;
                isDragging = true;
                startX = e.clientX; startY = e.clientY;
                const rect = popupWrap.getBoundingClientRect();
                initX = rect.left; initY = rect.top;
                popupWrap.style.left = initX + 'px';
                popupWrap.style.top = initY + 'px';
                popupWrap.style.right = 'auto'; popupWrap.style.bottom = 'auto';
                document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'none');
            };

            popupWrap.querySelectorAll('.pe-resize').forEach(h => {
                h.onmousedown = (e) => {
                    e.stopPropagation();
                    if (popupWrap.dataset.minimized === 'true') return;
                    isResizing = true;
                    resizeDir = h.className.replace('pe-resize ', '');
                    startX = e.clientX; startY = e.clientY;
                    const rect = popupWrap.getBoundingClientRect();
                    initX = rect.left; initY = rect.top;
                    initW = rect.width; initH = rect.height;
                    popupWrap.style.left = initX + 'px';
                    popupWrap.style.top = initY + 'px';
                    popupWrap.style.right = 'auto'; popupWrap.style.bottom = 'auto';
                    document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'none');
                };
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    popupWrap.style.left = (initX + (e.clientX - startX)) + 'px';
                    popupWrap.style.top = (initY + (e.clientY - startY)) + 'px';
                } else if (isResizing) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    let newW = initW, newH = initH, newX = initX, newY = initY;

                    if (resizeDir.includes('right')) newW = Math.max(250, initW + dx);
                    if (resizeDir.includes('bottom')) newH = Math.max(60, initH + dy);
                    if (resizeDir.includes('left')) {
                        newW = Math.max(250, initW - dx);
                        newX = initX + (initW - newW);
                    }
                    if (resizeDir.includes('top')) {
                        newH = Math.max(60, initH - dy);
                        newY = initY + (initH - newH);
                    }

                    popupWrap.style.width = newW + 'px';
                    popupWrap.style.height = newH + 'px';
                    popupWrap.style.left = newX + 'px';
                    popupWrap.style.top = newY + 'px';
                }
            });
            document.addEventListener('mouseup', () => {
                if (isDragging || isResizing) {
                    isDragging = false;
                    isResizing = false;
                    document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'auto');
                }
            });

            if (tab) tab.classList.add('has-split');
            this.toast(`Popup editor spawned for ${targetChip}`, 'success');
            
        } else {
            splitFrame = document.createElement('div');
            splitFrame.id = 'split-editor-frame';
            splitFrame.style.cssText = 'flex: 1; display: flex; flex-direction: column; border: none; background: var(--bg); min-width: 0; z-index: 10; position: relative;';
            splitFrame.innerHTML = `
                <div style="background: #111; padding: 6px 10px; color: #888; display: flex; justify-content: space-between; border-bottom: 1px solid #222; font-family: 'JetBrains Mono', monospace; font-size: 12px;">
                    <div style="font-weight:bold; color:#ffca28;">CHIP EDITOR: ${targetChip}</div>
                    <span onclick="document.getElementById('split-editor-frame').remove(); document.getElementById('main').classList.remove('workspace-split', 'split-left', 'split-right'); document.querySelector('.tab.has-split')?.classList.remove('has-split'); Sim.activeSplitChip = null;" style="cursor:pointer; font-weight:bold; color:#ff4757;">X</span>
                </div>
                <iframe src="${chipUrl}" style="flex:1; border:none; width:100%; height:100%; background:var(--bg);"></iframe>
            `;
            
            main.classList.add('workspace-split');
            if (direction === 'left') {
                main.classList.add('split-left');
                main.insertBefore(splitFrame, main.firstChild);
            } else if (direction === 'right') {
                main.classList.add('split-right');
                main.appendChild(splitFrame);
            }
            if (tab) tab.classList.add('has-split');
            if (!isRestore) this.toast(`Split pane activated: ${direction.toUpperCase()}`, 'info');
        }
        this.activeSplitChip = targetChip;
        // Restore parent workspace in main view.
        if (!isRestore) this.uiExitChipEdit();
    },

    // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Ensure context exit captures logic strictly.
    uiExitChipEdit() {
        if (this.workspaceStack.length === 0 || !this.activeEditingChip) return;

        this.library[this.activeEditingChip] = {
            nodes: this.nodes.map(n => this._cleanNode(n)).filter(n => n !== null),
            wires: this.wires.map(w => this._cleanWire(w)).filter(w => w !== null)
        };

        const parent = this.workspaceStack.pop();
        this.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
        document.querySelectorAll('.gate').forEach(el => el.remove());
        this.nodes = []; this.wires = []; this.wireMap.clear();
        const scene = document.getElementById('scene');
        if (scene) scene.innerHTML = '';

        parent.nodes.forEach(n => {
            if (n.isCustom && n.type === this.activeEditingChip) {
                n.meta = JSON.parse(JSON.stringify(this.library[this.activeEditingChip]));
            }
            this.nodes.push(n);
            NodeRenderer.renderNode(n);
        });
        this.wires = parent.wires;
        
        if (window.History) {
            History.stack = parent.historyStack || [];
            History.index = parent.historyIndex !== undefined ? parent.historyIndex : -1;
            History.updateButtons();
        }

        this.updateWireVisuals();
        this.activeEditingChip = null;
        const exitBtn = document.getElementById('btn-exit-chip');
        if (exitBtn) exitBtn.style.display = 'none';
        this.updateLibraryUI();
        this.toast('Returned to parent workspace', 'info');
        this.seedQueue();
        this.processQueue();
        this.autoSave();
    }
};

window.Sim = Sim;
