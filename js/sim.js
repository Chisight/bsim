/**
 * Simulator Core v1.22.29 (Modular Professional)
 * FIXED: Wired underlying logic for all new Preferences.
 */
const Sim = {
    nodes: [],
    wires: [],
    library: {},
    workspaceStack: [],
    activeEditingChip: null,
    wireMap: new Map(),
    _netlistDirty: true, // [wasm] flag to indicate that the netlist needs to be recompiled
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

    init() {
        let running = false;
        this.wakeQueue = () => { if (!running) { running = true; requestAnimationFrame(runQueue); } };
        const runQueue = () => {
            const now = performance.now();
            
            const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
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
        this.updateSidebar();
        this.updateHUD();
        this.updateLibraryUI();
        this.applyKeybinds();
        this.refreshTooltips();
        this.wakeQueue();

        window.addEventListener('mousemove', (e) => {
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
    },

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

    copySelection() {
        if (this.selection.size === 0) return;
        const nodesToCopy = this.nodes.filter(n => this.selection.has(n.id));
        const wiresToCopy = this.wires.filter(w => this.selection.has(w.from.nodeId) && this.selection.has(w.to.nodeId));
        this._clipboard = { nodes: JSON.parse(JSON.stringify(nodesToCopy)), wires: JSON.parse(JSON.stringify(wiresToCopy)) };
    },

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

    autoSave() {
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => {
            try {
                const cleanNode = (n) => {
                    if (!n) return null;
                    return {
                        id: n.id, type: n.type, x: n.x, y: n.y, label: n.label,
                        val: n.val, state: n.state, outputs: n.outputs, isCustom: n.isCustom,
                        freq: n.freq, interval: n.interval, lastTick: n.lastTick, meta: n.meta
                    };
                };
                const cleanWire = (w) => {
                    if (!w || !w.from || !w.to) return null;
                    return {
                        from: { nodeId: w.from.nodeId, portId: w.from.portId },
                        to: { nodeId: w.to.nodeId, portId: w.to.portId },
                        midX: w.midX, midY: w.midY, orthoDir: w.orthoDir
                    };
                };
                
                const cNodes = this.nodes.map(cleanNode).filter(n => n !== null);
                const cWires = this.wires.map(cleanWire).filter(w => w !== null);
                const wsStack = (this.workspaceStack || []).map(ws => ({ 
                    nodes: (ws.nodes || []).map(cleanNode).filter(n => n !== null), 
                    wires: (ws.wires || []).map(cleanWire).filter(w => w !== null) 
                }));
                
                if (this.activeEditingChip && wsStack.length > 0) {
                    this.library[this.activeEditingChip] = { nodes: cNodes, wires: cWires };
                }
                
                const safeLib = {};
                Object.keys(this.library).forEach(k => {
                    if (this.library[k]) {
                        safeLib[k] = {
                            nodes: (this.library[k].nodes || []).map(cleanNode).filter(n => n !== null),
                            wires: (this.library[k].wires || []).map(cleanWire).filter(w => w !== null)
                        };
                    }
                });

                const project = { 
                    nodes: wsStack.length > 0 ? wsStack[0].nodes : cNodes, 
                    wires: wsStack.length > 0 ? wsStack[0].wires : cWires, 
                    library: safeLib, workspaceStack: wsStack, activeEditingChip: this.activeEditingChip,
                    prefs: { snapNodes: this.snapNodes, snapWires: this.snapWires, confirmDelete: this.confirmDelete, showStats: this.showStats, showTooltips: this.showTooltips, tutorialMode: this.tutorialMode, hudPos: this.hudPos } 
                };
                localStorage.setItem('bsim_autosave', JSON.stringify(project));
            } catch (e) {
                console.error("[AutoSave] Serialization Failure:", e);
            }
        }, 500);
    },

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
                
                let activeNodes = parsed.nodes;
                let activeWires = parsed.wires;
                
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

                if (Array.isArray(activeNodes)) {
                    activeNodes.forEach(n => { 
                        if (n && n.id) {
                            this.nodes.push(n); 
                            NodeRenderer.renderNode(n); 
                        }
                    });
                }
                this.wires = Array.isArray(activeWires) ? activeWires : [];
                this.updateWireVisuals();
                this.seedQueue();
                this.processQueue();
            }
        } catch (e) {
            console.error("[AutoSave] Load failed:", e);
        }
    },

    _assembleChipInputs(chipDef, getDriveFn) {
        const ext = {};
        const inNodes = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a, b) => a.y - b.y);
        let cIn = 0;
        inNodes.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            if (bits === 1) {
                ext[p.id] = getDriveFn(`in${cIn++}`);
            } else {
                const arr = new Array(bits).fill(0);
                // Custom chip renders top (in0) as MSB and bottom as LSB
                // Internal IN-X nodes store arr[0] as LSB, arr[MSB] as MSB
                for (let i = 0; i < bits; i++) {
                    const bIdx = bits - 1 - i;
                    arr[bIdx] = getDriveFn(`in${cIn++}`);
                }
                ext[p.id] = arr;
            }
        });
        return ext;
    },

    _mapChipOutputs(chipDef, internalRes) {
        const mapped = {};
        const outNodes = chipDef.nodes.filter(n => n.type.startsWith('OUT-')).sort((a, b) => a.y - b.y);
        let cOut = 0;
        outNodes.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            const val = internalRes[p.id];
            if (bits === 1) {
                mapped[`out${cOut++}`] = val;
            } else {
                for (let i = 0; i < bits; i++) {
                    const bIdx = bits - 1 - i;
                    mapped[`out${cOut++}`] = Array.isArray(val) ? val[bIdx] : val;
                }
            }
        });
        return mapped;
    },

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
        return node.val;
    },
    // =========================================================================
    // FILE: browser-sim/modular-sim/js/sim.js
    // DESC: processes the queue of nodes that need to be evaluated
    // =========================================================================

    processQueue() {
        if (!this.eventQueue || this.eventQueue.size === 0) return;

        // Wasm engine intercept
        if (this.useWasm && window.WasmEngine && WasmEngine.ready) {
            // Synchronized native primitive whitelist
            const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
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
                for (let i = 0; i < execDepth; i++) {
                    WasmEngine.executeTick();
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
                        this.library[n.type].nodes.forEach(inner => {
                            if (inner.type.startsWith('OUT-')) {
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
                                if (JSON.stringify(n.outputs[inner.id]) !== JSON.stringify(outVal)) {
                                    n.outputs[inner.id] = outVal;
                                    chipChanged = true;
                                }
                            }
                        });
                        if (chipChanged || n._forcePropagate) {
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
                    this.wires.filter(w => w.from.nodeId === node.id).forEach(w => {
                        // find the node that is driven by this wire
                        const ds = this.nodes.find(n => n.id === w.to.nodeId);
                        // if node is found, add it to the queue
                        if (ds) nextQueue.add(ds);
                    });
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
    },

    // [wasm] parity check
    async runWasmParityCheck(iterations = 1000) {
        // check if WasmEngine is loaded
        if (!window.WasmEngine || !WasmEngine.ready) return this.toast('Wasm Engine not linked.', 'danger');
        // show toast notification
        this.toast('Diagnostics Running. Press F12 to monitor console.', 'warning');
        // Yield execution to allow the DOM to repaint the toast notification
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Wait 50ms for the toast to render
        await new Promise(resolve => setTimeout(resolve, 50));
        // validate that the netlist is pure native
        const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
        const checkPure = (nodes) => nodes.every(n => {
            if (validWasmTypes.has(n.type)) return true;
            if (n.isCustom && this.library && this.library[n.type]) return checkPure(this.library[n.type].nodes);
            return false;
        });
        const isPureNative = checkPure(this.nodes);
        // if not pure native, return toast
        if (!isPureNative) return this.toast('Parity check requires native logic components only.', 'warning');
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
            for (let t = 0; t < 20; t++) WasmEngine.executeTick();

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
    },

    // simulate internal circuit (sub-circuit simulation)
    simulateInternalCircuit(chipTypeOrMeta, externalInputs) {
        // debug message
        if (this.debugToasts) console.debug(`[SimTrace] Executing Sub-Circuit: ${typeof chipTypeOrMeta === 'string' ? chipTypeOrMeta : 'Custom'} | Inputs:`, externalInputs);
        let meta = typeof chipTypeOrMeta === 'string' ? this.library[chipTypeOrMeta] : chipTypeOrMeta.meta;
        // if meta not found, return
        if (!meta) return {};

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

            let wires = meta.wires.filter(w => w.to.nodeId === nid && w.to.portId === pid);
            const node = meta.nodes.find(n => n.id === nid);
            // if node is junction, add reverse wires
            if (node && node.type === 'JUNCTION') {
                wires = wires.concat(meta.wires.filter(w => w.from.nodeId === nid && w.from.portId === pid));
            }

            if (wires.length === 0) return null;

            for (const w of wires) {
                const srcNodeId = (w.to.nodeId === nid && w.to.portId === pid) ? w.from.nodeId : w.to.nodeId;
                const srcPortId = (w.to.nodeId === nid && w.to.portId === pid) ? w.from.portId : w.to.portId;

                const srcNode = meta.nodes.find(n => n.id === srcNodeId);
                if (!srcNode) continue;

                if (srcNode.type === 'JUNCTION') {
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
                } else if (inner.type.startsWith('OUT-')) {
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
        meta.nodes.filter(n => n.type.startsWith('OUT-')).forEach(out => res[out.id] = out.val === undefined ? 0 : out.val);
        if (this.debugToasts) console.debug(`[SimTrace] Sub-Circuit Result: ${typeof chipTypeOrMeta === 'string' ? chipTypeOrMeta : 'Custom'} | Outputs:`, res);
        return res;
    },

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
        return this._finalizeAddNode(type, x, y, label || type);
    },

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
        return node;
    },

    updateNodePosition(node, el = null) {
        const div = el || document.getElementById(node.id);
        if (div) {
            div.style.left = node.x + 'px';
            div.style.top = node.y + 'px';
            div.style.transform = 'none';
        }
    },

    updateNodeVisual(n) {
        const el = document.getElementById(n.id); if (!el) return;
        const bits = parseInt(n.type.split('-')[1]) || 1;
        if (bits >= 4) {
            const valArr = Array.isArray(n.val) ? n.val : (Array.isArray(n.state) ? n.state : [n.val]);
            const paddedArr = [...valArr];
            while (paddedArr.length < bits) paddedArr.push(0);

            // LSB is at index 0
            const val = paddedArr.reduce((acc, b, i) => acc | ((b === 1 ? 1 : 0) << i), 0);
            
            if (!this._domCacheMap) this._domCacheMap = new Map();
            let cache = this._domCacheMap.get(n.id);
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

        // Recursive pin refresh for nested custom chips
        if (n.isCustom) {
            const ports = el.querySelectorAll('.port');
            ports.forEach(p => {
                const pid = p.dataset.port;
                const drive = this.getDrivingSignal(n.id, pid);
                p.classList.toggle('on', drive === 1);
                p.classList.toggle('off', drive === 0);
                p.classList.toggle('float', drive === null || drive === 'Z');
            });
        }

        if (n._oscillating) el.classList.add('oscillating');
    },

    updateWireVisuals() {
        this._netlistDirty = true; // Forces WASM engine to recognize the new layout
        if (typeof WireRenderer !== 'undefined') WireRenderer.drawWires();
    },

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
    },

    handlePortInteraction(e, nodeId, portId) {
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
    },

    connectNodes(n1Id, p1Id, n2Id, p2Id) {
        if (this.debugToasts) this.toast(`Connecting ${n1Id} to ${n2Id}`, 'debug');
        console.log(`[DEBUG] connectNodes triggered | From: ${n1Id}[${p1Id}] -> To: ${n2Id}[${p2Id}]`);
        const wire = { from: { nodeId: n1Id, portId: p1Id }, to: { nodeId: n2Id, portId: p2Id } };
        if (!this.wires.find(w => w.from.nodeId === n1Id && w.to.nodeId === n2Id && w.from.portId === p1Id && w.to.portId === p2Id)) {
            this.wires.push(wire);
            this.updateWireVisuals();
        }
    },

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

    getDrivingSignal(nodeId, portId, visited = new Set()) {
        const netKey = `${nodeId}:${portId}`;
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

            const peerEl = document.getElementById(peerNodeId)?.querySelector(`[data-port="${peerPortId}"]`);
            const isPeerOutput = peerEl?.classList.contains('output') || peerNode.type.startsWith('IN-') || peerNode.type === 'CLOCK';

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
        return null;
    },

    seedQueue() { 
        this._transitions.clear(); 
        this.nodes.forEach(n => { n._oscillating = false; n._forcePropagate = true; }); 
        this.eventQueue = new Set(this.nodes); 
    },
    toggleBit(e, nodeId, bitIndex) {
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
    },

    setEngine(type) {
        this.useWasm = (type === 'wasm');
        this.toast('Engine switched to ' + type.toUpperCase(), 'info');
        this.updateHUD();
    },

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

        const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
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
        
        hud.innerHTML = `GATES: ${this.nodes.length} | WIRES: ${this.wires.length}<br>CHIP : ${this.activeEditingChip || 'MAIN'}<br>ENGINE: ${engineStatus}`;
    },

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

        // 4. Inject Custom Library Chips
        Object.keys(this.library).forEach(name => {
            const span = document.createElement('span');
            span.className = 'status-chip custom';
            span.innerText = name;

            // Recursion Guard
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

                // Bounds checking to prevent off-screen clipping
                const menuH = 120;
                const menuW = 150;
                let top = e.clientY;
                let left = e.clientX;

                if (top + menuH > window.innerHeight) top -= menuH;
                if (left + menuW > window.innerWidth) left -= menuW;

                menu.style.left = left + 'px';
                menu.style.top = top + 'px';

                menu.innerHTML = '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#4a9eff\'" onmouseout="this.style.color=\'#aaa\'" onclick="Sim.uiEditChip(\'' + name + '\')">Edit Internals</div>' +
                    '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#aaa; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#4a9eff\'" onmouseout="this.style.color=\'#aaa\'" onclick="Sim.modal(\'Rename Chip\',\'New name:\',\'prompt\',nn=>{if(nn && !Sim.library[nn]){Sim.library[nn]=Sim.library[\'' + name + '\']; delete Sim.library[\'' + name + '\']; Sim.nodes.forEach(n=>{if(n.type===\'' + name + '\')n.type=nn;}); Sim.updateLibraryUI(); Sim.autoSave(); }},\'' + name + '\')">Rename</div>' +
                    '<div class="menu-item" style="padding:8px 15px; font-size:11px; color:#ff4757; cursor:pointer; font-weight:600; text-transform:uppercase;" onmouseover="this.style.color=\'#ff6b81\'" onmouseout="this.style.color=\'#ff4757\'" onclick="if(Sim.activeEditingChip===\'' + name + '\') Sim.uiExitChipEdit(); Sim.uiDeleteChip(\'' + name + '\')">Delete</div>';
            };
            lib.appendChild(span);
        });
    },

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
        this.workspaceStack.push({
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires)),
            wireMap: new Map(this.wireMap),
            historyStack: window.History ? History.stack : [],
            historyIndex: window.History ? History.index : -1
        });

        // Clear workspace
        this.nodes = [];
        this.wires = [];
        this.wireMap.clear();
        document.getElementById('scene').innerHTML = '';

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

    toast(msg, type = 'info', duration = 3000) {
        if (!this.showToasts) return;
        if (type === 'debug' && !this.debugToasts) return;

        let el = document.getElementById('ui-toast-el');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ui-toast-el'; el.className = 'ui-toast';
            document.body.appendChild(el);
        }
        el.innerText = msg;
        el.className = `ui-toast show toast-${type}`;

        clearTimeout(this._toastTimer);
        if (duration > 0) {
            this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
        }
    },

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

    uiNewProject() {
        this.modal('New Project', 'Warning: This will wipe your library, workspace, and autosave. Continue?', 'confirm', (ok) => {
            if (ok) {
                localStorage.removeItem('bsim_autosave');
                location.reload();
            }
        });
    },
    applyStyles() {
        // UNDERLYING LOGIC: Map portSize preference to CSS variable
        const sizeMap = { 'small': '15%', 'medium': '25%', 'large': '35%' };
        document.documentElement.style.setProperty('--port-size', sizeMap[this.portSize || 'medium']);
    },
    uiSaveAsGate() {
        this.modal('Save Custom Chip', 'Enter unique name for this logic:', 'prompt', (name) => {
            if (name && name.trim()) {
                const n = name.trim();
                if (this.library[n]) {
                    this.toast('A chip with this name already exists!', 'warning');
                    return;
                }
                this.library[n] = {
                    nodes: JSON.parse(JSON.stringify(this.nodes)),
                    wires: JSON.parse(JSON.stringify(this.wires))
                };
                this.updateLibraryUI();
                this.toast(`Chip "${n}" saved to library`, 'success');
                this.autoSave();
            }
        });
    },


    uiEnterValue(id, format = 'D') {
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
        let promptType = 'Decimal';
        
        if (format === 'H') {
            prefill = currentNum.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
            promptType = 'Hex';
        } else if (format === 'B') {
            prefill = currentNum.toString(2).padStart(bits, '0');
            promptType = 'Binary';
        }
        
        this.modal(`Set ${bits}-Bit Value`, `Enter value (${promptType} default, or override with 0x/0b):`, 'prompt', (val) => {
            if (val === null || val === '') return;
            const cleanVal = val.trim();
            let num;
            
            if (cleanVal.toLowerCase().startsWith('0x')) {
                num = parseInt(cleanVal, 16);
            } else if (cleanVal.toLowerCase().startsWith('0b')) {
                num = parseInt(cleanVal.substring(2), 2);
            } else {
                if (format === 'H') num = parseInt(cleanVal, 16);
                else if (format === 'B') num = parseInt(cleanVal, 2);
                else num = parseInt(cleanVal, 10);
            }

            if (isNaN(num)) return this.toast('Invalid number format', 'danger');
            
            const maxVal = (1 << bits) - 1;
            num = Math.max(0, Math.min(maxVal, num));
            
            if (bits === 1) {
                n.state = num > 0 ? 1 : 0;
                n.val = n.state;
            } else {
                for (let i = 0; i < bits; i++) n.state[i] = (num & (1 << i)) ? 1 : 0;
                n.val = [...n.state];
            }
            this.updateNodeVisual(n); this.seedQueue(); this.processQueue();
        }, prefill);
    },


    uiNewChip() {
        this.modal('New Chip', 'Clear workspace? Your saved library will be kept.', 'confirm', (ok) => {
            if (ok) {
                this.nodes = []; this.wires = []; this.wireMap.clear();
                History.stack = []; History.index = -1; History.updateButtons();
                document.getElementById('scene').innerHTML = '';
                this.updateWireVisuals(); this.seedQueue();
            }
        });
    },

    uiQuit() {
        this.modal('Quit', 'Discard current session and clear autosave before exiting?', 'danger', (discard) => {
            if (discard) localStorage.removeItem('bsim_autosave');
            window.close();
        });
    },

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

    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = Math.hypot(x2 - x1, y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (l2 * l2)));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    },

    reindexWires() {
        this.wireMap.clear();
        this.wires.forEach(w => {
            this.wireMap.set(`${w.to.nodeId}:${w.to.portId}`, w);
            this.wireMap.set(`${w.from.nodeId}:${w.from.portId}:src`, w);
        });
    },

    clearSnapState() {
        document.querySelectorAll('.snap-hover').forEach(el => el.classList.remove('snap-hover'));
        this.wiring.snapTarget = null;
    },


    uiExitChipEdit() {
        if (this.workspaceStack.length === 0 || !this.activeEditingChip) return;

        this.library[this.activeEditingChip] = {
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            wires: JSON.parse(JSON.stringify(this.wires))
        };

        const parent = this.workspaceStack.pop();
        this.nodes = []; this.wires = []; this.wireMap.clear();
        document.getElementById('scene').innerHTML = '';

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
