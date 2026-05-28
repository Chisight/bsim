/**
 * Browser-Sim Core Engine
 * Version: 1.27.01
 */
const Sim = {
    nodes: [],
    wires: [],

    isPureNative() {
        return Engine.isPureNative(this.nodes, this.library);
    },
    library: {},
    workspaceStack: [],
    activeEditingChip: null,
    activeSplitChip: null,
    tabs: [{ id: 'tab-1', name: 'Main', nodes: [], wires: [], historyStack: [], historyIndex: -1, activeSplitChip: null, splitDirection: 'right' }],
    activeTabId: 'tab-1',
    wireMap: new Map(),
    _netlistDirty: true, // [wasm] flag to indicate that the netlist needs to be recompiled

    // [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Centralized state sanitization methods to prevent reference crashes.
    _cleanNode(n) { return ProjectManager._cleanNode(n); },
    _cleanWire(w) { return ProjectManager._cleanWire(w); },
    showToasts: true,
    debugToasts: false,
    useWasm: true,
    _toastTimer: null,
    shortCircuitStrikes: 0,

    // [AUDIT: v1.25.40 | SEC_ARCH_LEAD] - Relocated fastEqual utility to prevent JIT de-optimization and recreation during high-frequency evaluation ticks.
    _fastEqual(a, b) {
        return Engine.fastEqual(a, b);
    },

    // [AUDIT: v1.24.52 | SEC_ARCH_LEAD] - Manual DOM/Memory synchronization escape hatch.
    forceLayoutSync() {
        this.autoSave();
        this._netlistDirty = true;
        this.updateWireVisuals();
        this.seedQueue();
        this.processQueue();
        this.toast('Layout Memory Flushed & Resynchronized', 'success');
    },

    // [AUDIT: v1.25.32 | SEC_ARCH_LEAD] - Universal node polarity mutation engine with global persistence prompt.
    toggleNodePolarity(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        node.flipPolarity = !node.flipPolarity;
        if (typeof NodeRenderer !== 'undefined') {
            const el = document.getElementById(nodeId);
            if (el) el.remove();
            NodeRenderer.renderNode(node);
            this.updateWireVisuals();
        }
        this.toast(`Polarity flipped for ${node.id}. `, 'success', 5000);
        const tEl = document.getElementById('ui-toast-el');
        if (tEl) {
            const btn = document.createElement('span');
            btn.innerText = '[Apply Global]';
            btn.style.cssText = 'cursor:pointer; text-decoration:underline; margin-left:10px; font-weight:bold; color:#fff;';
            btn.onclick = () => {
                this.nodes.forEach(n => {
                    if (n.type === node.type && !!n.flipPolarity !== !!node.flipPolarity) {
                        n.flipPolarity = node.flipPolarity;
                        if (typeof NodeRenderer !== 'undefined') {
                            const nEl = document.getElementById(n.id);
                            if (nEl) nEl.remove();
                            NodeRenderer.renderNode(n);
                        }
                    }
                });
                if (!this.polarity) this.polarity = {};
                this.polarity[node.type] = node.flipPolarity;
                this.updateWireVisuals();
                this.autoSave();
                this.toast(`Global polarity applied to all ${node.type} components.`, 'success');
            };
            tEl.appendChild(btn);
        }
        this.autoSave();
    },

    // [AUDIT: v1.25.12 | SEC_ARCH_LEAD] - Hard purge of SharedArrayBuffer mutex. Reverted to boolean spin-lock to definitively bypass COI security faults.
    _topologyLock: false,
    async mutateTopology(mutationFn) {
        while (this._topologyLock) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        this._topologyLock = true;
        try {
            mutationFn();
        } finally {
            this._topologyLock = false;
        }
    },

    // Preferences Logic
    snapNodes: true,
    snapWires: true,
    confirmDelete: true,
    showStats: true,
    showTooltips: true,
    tutorialMode: true,
    hudPos: 'top-right',
    flipPinLogic: false,

    wiring: { active: false, start: null, mouseX: 0, mouseY: 0, snapTarget: null },
    eventQueue: new Set(),
    selection: new Set(),
    _transitions: new Map(),
    _clipboard: null,
    MAX_TRANSITIONS: 100,

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for simulation kernel bootstrap.
     */
    init() {
        let running = false;
        this.wakeQueue = () => { if (!running) { running = true; requestAnimationFrame(runQueue); } };
        const runQueue = () => {
            const now = performance.now();

            // [AUDIT: v1.25.20 | SEC_ARCH_LEAD] - Transitioned to centralized purity validation.
            const isPureNative = Sim.isPureNative();

            Sim.nodes.forEach(n => {
                // [AUDIT: v1.24.55 | SEC_ARCH_LEAD] - Stripped restrictive Wasm-eligibility guard blocking temporal V8 clock evaluation. Both engines rely on V8 for real-time oscillator intervals.
                if (n.type === 'CLOCK' && n.freq > 0) {
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

        UIOrchestrator.initHandlers(this);

        View.init();
        this.loadAutoSave();
        this.applyStyles();
        this.updateTabsUI();
        this.updateSidebar();
        this.updateHUD();
        this.updateLibraryUI();
        this.applyKeybinds();
        this.refreshTooltips();
        this.wakeQueue();
    },

    /**
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
     */
    applyKeybinds() {
        // [AUDIT: v1.26.01 | SEC_ARCH_LEAD] - Keybinds migrated to UIOrchestrator.initHandlers for centralized event management.
    },

    /**
     */
    deleteSelection() {
        if (this.selection.size === 0) return;

        // [AUDIT: v1.24.46 | SEC_ARCH_LEAD] - Exposing centralized deletion interface for terminal 'rm all' parity.
        this.selection.forEach(id => {
            const n = this.nodes.find(x => x.id === id);
            if (n) History.execute(new DeleteNodeCommand(n));
        });

        this.selection.clear();
        if (typeof this.updateWireVisuals === 'function') this.updateWireVisuals();
        this.autoSave();
    },

    /**
     */
    copySelection() { return InteractionHandler.copySelection(); },
    pasteSelection() { return InteractionHandler.pasteSelection(); },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Align persistence telemetry with MRAP taxonomy.
     */
    autoSave() { return ProjectManager.autoSave(); },

    /**
     */
    loadAutoSave() { return ProjectManager.loadAutoSave(); },

    /**
     */
    _assembleChipInputs(chipDef, getDriveFn) { return Engine._assembleChipInputs(this, chipDef, getDriveFn); },

    /**
     */
    _mapChipOutputs(chipDef, internalRes) { return Engine._mapChipOutputs(chipDef, internalRes); },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical signal evaluation.
     */
    calculateNextState(node) { return Engine.calculateNextState(this, node); },
    // =========================================================================
    // FILE: browser-sim/modular-sim/js/sim.js
    // DESC: processes the queue of nodes that need to be evaluated
    // =========================================================================

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for simulation tick.
     */
    processQueue() {
        Engine.processQueue(this);
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Telemetry taxonomy taxonomy correction for parity diagnostic module.
     */
    runWasmParityCheck(iterations = 1000) {
        return Engine.runWasmParityCheck(this, iterations);
    },

    /**
     */
    simulateInternalCircuit(chipTypeOrMeta, externalInputs) {
        return Engine.simulateInternalCircuit(this, chipTypeOrMeta, externalInputs);
    },

    /**
     */
    addNode(type, x = null, y = null, label = null, preferredId = null) {
        if (x === null) {
            const scene = document.getElementById('scene');
            const sr = scene ? scene.getBoundingClientRect() : { left: 0, top: 0 };
            x = (window.innerWidth / 2 - sr.left) / View.scale + (Math.random() * 50 - 25);
            y = (window.innerHeight / 2 - sr.top) / View.scale + (Math.random() * 50 - 25);
            // Offset if already occupied
            while (this.nodes.some(n => Math.abs(n.x - x) < 20 && Math.abs(n.y - y) < 20)) { x += 20; y += 20; }
        }
        // [AUDIT: v1.25.16 | SEC_ARCH_LEAD] - Increased grid resolution to 10px to accommodate diverse port geometries and eliminate layout micro-offsets.
        if (this.snapNodes) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
        if (this.debugToasts) this.toast(`Added ${type} node`);
        const newNode = this._finalizeAddNode(type, x, y, label || type, preferredId);
        return newNode;
    },

    /**
     */
    // [AUDIT: v1.24.70 | SEC_ARCH_LEAD] - Deterministic node allocation constraint injected for terminal parity validation.
    _finalizeAddNode(type, x, y, label, preferredId = null) {
        const id = (preferredId && !this.nodes.some(n => n.id === preferredId))
            ? preferredId
            : 'node-' + Math.random().toString(36).substr(2, 9);

        const node = {
            id: id,
            type, x, y, label: label || type, val: 0,
            state: (type.includes('-1') || type === 'CLOCK' || type === 'DFF' || type === 'TFF') ? 0 : (new Array(parseInt(type.split('-')[1]) || 1).fill(0)),
            outputs: {}, lastClk: 0,
            ...(type === 'CLOCK' && { freq: 1, interval: 1000, lastTick: performance.now() }),
            // [AUDIT: v1.24.63 | SEC_ARCH_LEAD] - Synchronized initialization for volatile RAM memory structures.
            ...(type === 'RAM' && { addressPins: 4, dataUrl: '', memoryData: Array.from(new Uint8Array(16)) })
        };
        // [AUDIT: v1.25.32 | SEC_ARCH_LEAD] - Inject global polarity persistence onto new instances.
        if (this.polarity && this.polarity[type]) {
            node.flipPolarity = true;
        }
        // [AUDIT: v1.24.63 | SEC_ARCH_LEAD] - Formally classified RAM as a native primitive to ensure linear memory execution priority.
        // [AUDIT: v1.24.66 | SEC_ARCH_LEAD] - Formally registered RAM as a core primitive to prevent macro-substitution logic.
        // [AUDIT: v1.25.14 | SEC_ARCH_LEAD] - Registered '0' as native primitive.
        const NATIVE_TYPES = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
        if (this.library[type] && !NATIVE_TYPES.has(type)) {
            // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - Established cyclical dependency scanner to avert recursion faults.
            if (this.activeEditingChip) {
                const checkCycle = (target, check) => {
                    if (target === check) return true;
                    if (!this.library[check]) return false;
                    return this.library[check].nodes.some(n => n.isCustom && checkCycle(target, n.type));
                };
                if (checkCycle(this.activeEditingChip, type)) {
                    this.toast('Cyclic dependency blocked.', 'danger');
                    return null;
                }
            }
            node.isCustom = true;
        }
        History.execute(new AddNodeCommand(node));
        return node;
    },

    /**
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
    },

    /**
     */
    updateNodeVisual(n) {
        delete n._portOffsets;
        const el = document.getElementById(n.id); if (!el) return;

        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Apply saved geometric properties dynamically on visual update.
        if (n.customWidth) el.style.width = n.customWidth + 'px';
        if (n.customHeight) el.style.height = n.customHeight + 'px';

        // [AUDIT: v1.24.34 | SEC_ARCH_LEAD] - Apply dynamically calculated port spread geometry.
        if (n.portY !== undefined || n.portH !== undefined) {
            const py = n.portY !== undefined ? n.portY : 24;
            const ph = n.portH !== undefined ? n.portH : (n.customHeight || parseInt(el.style.height) || 64) - 30;

            // [AUDIT: v1.25.49 | SEC_ARCH_LEAD] - Rewritten RAM port matrix traversal to decouple read/write bus strides and eliminate collision clipping.
            if (n.type === 'RAM') {
                    // [AUDIT: v1.26.10 | SEC_ARCH_LEAD] - Re-enabled dynamic mathematical evaluation against absolute layout constraints (ph, py) to prevent wiring coordinate corruption on resize.
                    const aBits = n.addressPins || 4;
                    const dBits = 8;
                    const leftPins = aBits + 1 + dBits;
                    const rightPins = dBits;

                    const applyPin = (p) => {
                        const pid = p.dataset.port;
                        if (!pid) return;
                        
                        const getTop = (vIdx, total) => py + (total > 1 ? (vIdx / (total - 1)) * ph : ph / 2);

                        if (pid.startsWith('out')) {
                            const idx = parseInt(pid.replace('out', ''));
                            const vIdx = (dBits - 1) - idx;
                            p.style.top = getTop(vIdx, rightPins) + 'px';
                        } else if (pid.startsWith('din')) {
                            const idx = parseInt(pid.replace('din', ''));
                            const vIdx = (aBits + 1) + ((dBits - 1) - idx);
                            p.style.top = getTop(vIdx, leftPins) + 'px';
                        } else if (pid === 'we') {
                            p.style.top = getTop(aBits, leftPins) + 'px';
                        } else if (pid.startsWith('in')) {
                            const idx = parseInt(pid.replace('in', ''));
                            const vIdx = (aBits - 1) - idx;
                            p.style.top = getTop(vIdx, leftPins) + 'px';
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

        // [AUDIT: v1.25.33 | SEC_ARCH_LEAD] - Injected horizontal offset geometry tracking for dynamic port labels.
        if (n.portLabelX !== undefined) {
            el.querySelectorAll('.port.input > .port-label, .port.input .port-meta').forEach(l => l.style.left = n.portLabelX + 'px');
            el.querySelectorAll('.port.output > .port-label, .port.output .port-meta').forEach(l => l.style.right = n.portLabelX + 'px');
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

            // [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Phase-Rotation logic for mechanical-style visual cues.
            const arm = el.querySelector('.indicator-arm');
            if (arm) {
                // If the simulation is running, rotate the arm based on current tick count or state
                // Using node.id and state to create a deterministic but "moving" rotation
                const angle = (n.state === 1) ? 180 : 90;
                arm.style.transform = `rotate(${angle}deg)`;
            }
        }

        // [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Clamped 'active' class flash for Clocks to eliminate visual fatigue.
        el.classList.toggle('active', isActive && n.type !== 'CLOCK');
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

    },

    /**
     */
    updateWireVisuals() {
        return UIOrchestrator.updateWireVisuals(this);
    },

    /**
     */
    getPortCoords(nodeId, portId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return null;
        if (node.type === 'JUNCTION') {
            return { x: node.x, y: node.y };
        }
        
        if (!node._portOffsets) {
            node._portOffsets = {};
        }

        if (node._portOffsets[portId] === undefined) {
            const scene = document.getElementById('scene');
            const pEl = document.getElementById(nodeId)?.querySelector(`[data-port="${portId}"]`);
            if (scene && pEl) {
                const sr = scene.getBoundingClientRect();
                const r = pEl.getBoundingClientRect();
                node._portOffsets[portId] = {
                    x: (r.left - sr.left + r.width / 2) / View.scale - node.x,
                    y: (r.top - sr.top + r.height / 2) / View.scale - node.y
                };
            }
        }

        if (node._portOffsets[portId] !== undefined) {
            return { x: node.x + node._portOffsets[portId].x, y: node.y + node._portOffsets[portId].y };
        }

        return null;
    },

    /**
     */
    handlePortInteraction(e, nodeId, portId) {
        // [AUDIT: v1.26.27 | SEC_ARCH_LEAD] - Inline routing for dynamic node drag instantiation from highlighted pin clusters.
        if (this._pinSelectState && this._pinSelectState.nodeId === nodeId) {
            e.preventDefault();
            const pEl = document.getElementById(nodeId)?.querySelector(`[data-port="${portId}"]`);
            if (!pEl) return;
            
            if (this._pinSelectState.selected.has(portId) && !e.shiftKey) {
                if (this._pinSelectState.mode === 'scale' && this._pinSelectState.selected.size < 2) {
                    this.toast('Select at least 2 pins to scale.', 'warning');
                    return;
                }
                if (e.button === 0) this.initPinDrag(e.clientX, e.clientY);
                return;
            }
            
            if (this._pinSelectState.selected.has(portId)) {
                this._pinSelectState.selected.delete(portId);
                pEl.classList.remove('selected-pin');
                pEl.style.boxShadow = '';
            } else {
                this._pinSelectState.selected.add(portId);
                pEl.classList.add('selected-pin');
                pEl.style.boxShadow = '0 0 5px #00ffaa';
            }
            return;
        }

        // [AUDIT: v1.26.24 | SEC_ARCH_LEAD] - Global freeze on wiring interactions during layout configurations. Extended to pin-mutate state.
        if (document.body.classList.contains('edit-mode-active') || document.body.classList.contains('pin-mutate-active')) return;
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

    /**
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
     */
    getSignal(nodeId, portId) {
        return Engine.getSignal(this, nodeId, portId);
    },

    getDrivingSignal(nodeId, portId, visited = new Set()) {
        return Engine.getDrivingSignal(this, nodeId, portId, visited);
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for full simulation reset.
     */
    seedQueue() {
        return Engine.seedQueue(this);
    },
    /**
     */
    // [AUDIT: v1.25.46 | SEC_ARCH_LEAD] - Injected global macro renaming mechanism to assert topological consistency across all workspaces, historical stacks, and nested dependencies.
    renameMacroGlobally(oldName, newName) {
        if (!this.library || !this.library[oldName] || this.library[newName]) return false;

        this.library[newName] = this.library[oldName];
        delete this.library[oldName];

        const propagate = (nodes) => {
            if (!nodes) return;
            nodes.forEach(n => {
                if (n.type === oldName) n.type = newName;
            });
        };

        propagate(this.nodes);
        if (this.tabs) this.tabs.forEach(t => propagate(t.nodes));
        if (this.workspaceStack) this.workspaceStack.forEach(ws => propagate(ws.nodes));

        Object.values(this.library).forEach(macro => propagate(macro.nodes));

        // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - Integrated hardware validation hook to verify pin parity post-rename mutation.
        const ioNodes = this.library[newName].nodes.filter(n => n.type.startsWith('IN-') || n.type.startsWith('OUT-') || n.type.startsWith('PROBE-'));
        if (ioNodes.length === 0 && this.nodes.some(n => n.type === newName)) console.warn(`[Hardware Validation] Warning: Renamed chip '${newName}' lacks IO pins.`);

        this._netlistDirty = true;
        if (typeof this.updateLibraryUI === 'function') this.updateLibraryUI();
        if (typeof this.updateTabsUI === 'function') this.updateTabsUI();
        this.autoSave();
        return true;
    },

    toggleBit(e, nodeId, bitIndex) {
        // [AUDIT: v1.26.24 | SEC_ARCH_LEAD] - Prevent input toggling while in layout mutation mode.
        if (document.body.classList.contains('edit-mode-active') || document.body.classList.contains('pin-mutate-active')) return;

        // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Refactored dependency resolution to utilize modern Event interface layer.
        if (typeof e === 'string') {
            bitIndex = nodeId;
            nodeId = e;
            e = null;
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

    /**
     */
    setEngine(type) {
        this.useWasm = (type === 'wasm');
        this.toast('Engine switched to ' + type.toUpperCase(), 'info');
        this.updateHUD();
    },

    /**
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

        // [AUDIT: v1.25.20 | SEC_ARCH_LEAD] - Transitioned to centralized purity validation.
        const isPureNative = this.isPureNative();

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
     */
    updateSidebar() {
        const sb = document.getElementById('sidebar');
        if (!sb) return;

        const sections = {
            'Primitives': [
                { label: 'NAND', type: 'NAND' },
                { label: 'Input 1', type: 'IN-1' },
                { label: 'Input 4', type: 'IN-4' },
                { label: 'Input 8', type: 'IN-8' },
                { label: 'Output 1', type: 'OUT-1' },
                { label: 'Output 4', type: 'OUT-4' },
                { label: 'Output 8', type: 'OUT-8' },
                // [AUDIT: v1.24.63 | SEC_ARCH_LEAD] - Injected RAM primitive into UI category.
                { label: 'RAM 8-Bit', type: 'RAM' },
                // [AUDIT: v1.27.17 | SEC_ARCH_LEAD] - Registered absolute ground primitive to user interface.
                { label: 'Ground (0)', type: '0' }
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
     */
    updateLibraryUI() {
        return UIOrchestrator.updateLibraryUI(this);
    },

    /**
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
     */
    uiDeleteChip(name) {
        // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - Implemented pre-flight reference counter during deletion sequences.
        let inUse = false;
        const checkNodes = (nodes) => nodes.some(n => n.type === name);
        if (checkNodes(this.nodes)) inUse = true;
        this.tabs.forEach(t => { if (checkNodes(t.nodes)) inUse = true; });
        this.workspaceStack.forEach(ws => { if (checkNodes(ws.nodes)) inUse = true; });
        Object.keys(this.library).forEach(k => { if (k !== name && checkNodes(this.library[k].nodes)) inUse = true; });

        if (inUse) {
            this.toast(`Deletion blocked: Chip '${name}' is actively instanced.`, 'danger');
            return;
        }

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
     */
    modal(title, content, type, callback, val) {
        return UIOrchestrator.modal(this, title, content, type, callback, val);
    },

    /**
     * [AUDIT: v1.23.92 | SEC_ARCH_LEAD] - Overhauled toast engine with global positioning persistence and interaction capture.
     */
    toast(msg, type = 'info', duration = 3000) {
        return UIOrchestrator.toast(this, msg, type, duration);
    },

    /**
     */
    /**
     */
    // [AUDIT: v1.24.37 | SEC_ARCH_LEAD] - Shifted from modal to independent non-blocking window for uninterrupted workspace tuning.
    showPrefs() {
        let w = document.getElementById('prefs-window');
        if (w) { w.style.display = 'flex'; return; }
        w = document.createElement('div');
        w.id = 'prefs-window';
        w.style.cssText = 'position:fixed; top:80px; right:40px; width:360px; max-height:80vh; background:rgba(15,15,20,0.95); border:1px solid #334; border-radius:8px; z-index:9500; display:flex; flex-direction:column; box-shadow:0 15px 40px rgba(0,0,0,0.8); backdrop-filter:blur(10px); resize:both; overflow:hidden;';

        w.innerHTML = `
            <div id="prefs-head" style="background:#111; padding:8px 12px; color:#888; cursor:move; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #222; font-family:'JetBrains Mono', monospace; font-size:12px; flex-shrink:0;">
                <div style="font-weight:bold; color:#00ffaa; pointer-events:none;">PREFERENCES</div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <span onclick="const w=document.getElementById('prefs-window'); if(w.dataset.minimized==='true')return; w.dataset.h=w.style.height||w.offsetHeight+'px'; w.style.height='31px'; w.dataset.minimized='true';" style="cursor:pointer; color:#00ffaa; font-weight:bold; transform:translateY(-4px);">_</span>
                    <span onclick="const w=document.getElementById('prefs-window'); if(w.dataset.minimized!=='true')return; w.style.height=w.dataset.h; w.dataset.minimized='false';" style="cursor:pointer; color:#00ffaa; font-weight:bold; font-size:16px; transform:translateY(-1px);">□</span>
                    <span onclick="document.getElementById('prefs-window').style.display='none';" style="cursor:pointer; color:#ff4757; font-weight:bold;">X</span>
                </div>
            </div>
            <div style="padding:15px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; flex-grow:1; font-size:13px;">
                <label style="display:flex; justify-content:space-between; align-items:center;"><span>Grid Snapping</span><input type="checkbox" ${this.snapNodes ? 'checked' : ''} onchange="Sim.snapNodes=this.checked; Sim.autoSave();"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;"><span>Flip Wiring Pin Logic (MSB-at-top)</span><input type="checkbox" ${this.flipPinLogic ? 'checked' : ''} onchange="Sim.flipPinLogic=this.checked; Sim.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); NodeRenderer.renderNode(n); }); if (window.WireRenderer) WireRenderer.drawWires(); Sim._netlistDirty=true; Sim.seedQueue(); Sim.processQueue(); Sim.autoSave();"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;"><span>Bulk Delete Confirmation</span><input type="checkbox" ${this.confirmDelete ? 'checked' : ''} onchange="Sim.confirmDelete=this.checked; Sim.autoSave();"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;"><span>Show Notifications</span><input type="checkbox" ${this.showToasts ? 'checked' : ''} onchange="Sim.showToasts=this.checked; Sim.autoSave();"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;"><span style="color:var(--wire-on)">Debug Notifications</span><input type="checkbox" ${this.debugToasts ? 'checked' : ''} onchange="Sim.debugToasts=this.checked; Sim.autoSave();"></label>
                <label style="display:flex; justify-content:space-between; align-items:center;"><span style="color:#ffca28">Disable UI Animations</span><input type="checkbox" ${this.disableAnimations ? 'checked' : ''} onchange="Sim.disableAnimations=this.checked; Sim.applyStyles(); Sim.autoSave();"></label>
                <div style="margin-top:5px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; align-items:center;">HUD Position: <select onchange="Sim.hudPos=this.value; Sim.updateHUD(); Sim.autoSave();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px; padding:2px;"><option value="top-right" ${this.hudPos === 'top-right' ? 'selected' : ''}>Top-Right</option><option value="top-left" ${this.hudPos === 'top-left' ? 'selected' : ''}>Top-Left</option><option value="bottom-left" ${this.hudPos === 'bottom-left' ? 'selected' : ''}>Bottom-Left</option></select></div>
                <div style="margin-top:5px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; align-items:center;">UI Scale (%): <div style="display:flex; gap:5px; align-items:center;"><input type="range" min="50" max="200" value="${this.uiScale || 100}" oninput="this.nextElementSibling.value=this.value; Sim.uiScale=parseInt(this.value); Sim.applyStyles(); Sim.autoSave();" style="width:70px;"><input type="number" min="50" max="200" value="${this.uiScale || 100}" oninput="this.previousElementSibling.value=this.value; Sim.uiScale=parseInt(this.value); Sim.applyStyles(); Sim.autoSave();" style="width:40px; background:#111; color:#fff; border:1px solid #334; text-align:center; font-family:'JetBrains Mono', monospace;"></div></div>
                <div style="margin-top:5px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; align-items:center;">Port Size: <select onchange="Sim.portSize=this.value; Sim.applyStyles(); Sim.autoSave();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px; padding:2px;"><option value="small" ${this.portSize === 'small' ? 'selected' : ''}>Small</option><option value="medium" ${this.portSize === 'medium' || !this.portSize ? 'selected' : ''}>Medium</option><option value="large" ${this.portSize === 'large' ? 'selected' : ''}>Large</option></select></div>
                <div style="margin-top:5px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; align-items:center;">Indicator LED Size: <select onchange="Sim.dotSize=this.value; Sim.applyStyles(); Sim.autoSave();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px; padding:2px;"><option value="small" ${this.dotSize === 'small' ? 'selected' : ''}>Small (8px)</option><option value="medium" ${this.dotSize === 'medium' || !this.dotSize ? 'selected' : ''}>Medium (12px)</option><option value="large" ${this.dotSize === 'large' ? 'selected' : ''}>Large (16px)</option></select></div>
                <div style="margin-top:5px; font-size:11px; color:#aaa; display:flex; justify-content:space-between; align-items:center;">Junction Size: <select onchange="Sim.junctionSize=this.value; Sim.applyStyles(); Sim.autoSave();" style="background:#111; color:#fff; border:1px solid #334; margin-left:5px; padding:2px;"><option value="small" ${this.junctionSize === 'small' ? 'selected' : ''}>Small (8px)</option><option value="medium" ${this.junctionSize === 'medium' || !this.junctionSize ? 'selected' : ''}>Medium (12px)</option><option value="large" ${this.junctionSize === 'large' ? 'selected' : ''}>Large (16px)</option></select></div>
                <div style="height:1px; background:#333; margin:8px 0 4px 0;"></div>
                <label style="display:flex; align-items:center; justify-content:space-between; gap:10px;"><span style="font-weight:bold; color:var(--wire-on);">Execution Engine:</span><select onchange="Sim.setEngine(this.value); Sim.autoSave();" style="background:#111; color:#fff; border:1px solid #444; padding:4px 8px; border-radius:4px; outline:none; cursor:pointer; font-family:'JetBrains Mono', monospace; font-size:11px;"><option value="wasm" ${this.useWasm ? 'selected' : ''}>WASM (High Performance)</option><option value="v8" ${!this.useWasm ? 'selected' : ''}>V8 JavaScript (Fallback)</option></select></label>
            </div>
        `;
        document.body.appendChild(w);

        let isDragging = false, startX, startY, initX, initY;
        const head = w.querySelector('#prefs-head');
        head.onmousedown = (e) => {
            if (e.target.tagName === 'SPAN') return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = w.getBoundingClientRect();
            initX = rect.left; initY = rect.top;
            w.style.left = initX + 'px'; w.style.top = initY + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto';
        };
        const onMove = (e) => {
            if (!isDragging) return;
            w.style.left = (initX + (e.clientX - startX)) + 'px';
            w.style.top = (initY + (e.clientY - startY)) + 'px';
        };
        const onUp = () => { isDragging = false; };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    /**
     * [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Multi-tab context switching logic.
     */
    updateTabsUI() {
        return UIOrchestrator.updateTabsUI(this);
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
     */
    applyStyles() {
        // [AUDIT: v1.24.37 | SEC_ARCH_LEAD] - Extended style injection to support global animation muting.
        // [AUDIT: v1.24.70 | SEC_ARCH_LEAD] - Retuned scaling percentages to compensate for expanded 18px port hitboxes.
        // [AUDIT: v1.25.28 | SEC_ARCH_LEAD] - Injected global UI scaling CSS variable for dynamic viewport adjustments.
        document.documentElement.style.setProperty('--ui-scale', (this.uiScale || 100) / 100);

        const sizeMap = { 'small': '8%', 'medium': '14%', 'large': '19%' };
        document.documentElement.style.setProperty('--port-size', sizeMap[this.portSize || 'medium']);

        const dotMap = { 'small': '8px', 'medium': '12px', 'large': '16px' };
        document.documentElement.style.setProperty('--dot-size', dotMap[this.dotSize || 'medium']);

        const junctionMap = { 'small': '8px', 'medium': '12px', 'large': '16px' };
        document.documentElement.style.setProperty('--junction-size', junctionMap[this.junctionSize || 'medium']);

        document.body.classList.toggle('no-animations', !!this.disableAnimations);
    },
    /**
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
                if (this.library) {
                    Object.values(this.library).forEach(chip => {
                        if (chip) delete chip._flatCache;
                    });
                }
                this.updateLibraryUI();
                this.toast(`Chip "${n}" saved to ${folder ? 'folder ' + folder : 'library'}`, 'success');
                this.autoSave();
            }
        });
    },

    /**
     * [AUDIT: SEC_ARCH_LEAD] - Entry trace for parametric node edit mode.
     */
    // [AUDIT: v1.24.43 | SEC_ARCH_LEAD] - Injected nomenclature translation layer to intercept legacy pin-dots dispatches.
    // [AUDIT: v1.26.27 | SEC_ARCH_LEAD] - Consolidated selection and tracking state initialization to bypass premature mouseup consumption.
    enterPinSelectMode(nodeId, mode) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        this._pinSelectState = { nodeId, mode, selected: new Set() };
        document.body.classList.add('pin-mutate-active');
        this.toast(`[${mode.toUpperCase()}] Select pins, then drag any highlighted pin. Double-click background to save.`, 'info', 0);
    },
    initPinDrag(clientX, clientY) {
        const state = this._pinSelectState;
        if (!state || state.selected.size === 0) return;

        this._pinDrag = {
            startX: clientX,
            startY: clientY,
            nodeId: state.nodeId,
            mode: state.mode,
            ports: Array.from(state.selected),
            bases: {}
        };

        const node = this.nodes.find(n => n.id === this._pinDrag.nodeId);
        if (!node.pinOverrides) node.pinOverrides = {};
        
        const nodeEl = document.getElementById(node.id);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        this._pinDrag.ports.forEach(pid => {
            const pEl = nodeEl.querySelector(`[data-port="${pid}"]`);
            if (pEl) {
                const bx = pEl.offsetLeft;
                const by = pEl.offsetTop;
                this._pinDrag.bases[pid] = { x: bx, y: by };
                if (bx < minX) minX = bx; if (bx > maxX) maxX = bx;
                if (by < minY) minY = by; if (by > maxY) maxY = by;
            }
        });
        
        this._pinDrag.centerY = (minY + maxY) / 2;
        this._pinDrag.centerX = (minX + maxX) / 2;
    },
    cancelPinMutate() {
        this._pinSelectState = null;
        this._pinDrag = null;
        document.body.classList.remove('pin-mutate-active');
        document.querySelectorAll('.port').forEach(el => {
            el.classList.remove('selected-pin');
            el.style.boxShadow = '';
        });
        this.toast('Pin modifications finalized and saved.', 'success');
        this.autoSave();
    },

    enterNodeEditMode(nodeId, mode) {
        if (mode === 'pin-dots') mode = 'pin-leds';
        const node = this.nodes.find(n => n.id === nodeId);
        const el = document.getElementById(nodeId);
        if (!node || !el) return;
        this.activeNodeEdit = { node, mode, og: { w: node.customWidth, h: node.customHeight, px: node.pinX, py: node.pinY, pw: node.pinW, ph: node.pinH, ix: node.infoX, iy: node.infoY, iw: node.infoW, ih: node.infoH, lx: node.labelX, ly: node.labelY, lw: node.labelW, lh: node.labelH, portY: node.portY, portH: node.portH, portLabelX: node.portLabelX } };

        // [AUDIT: SEC_ARCH_LEAD] - Lock global wiring interactions to prevent misclicks during layout mutation.
        document.body.classList.add('edit-mode-active');

        // [AUDIT: v1.24.36 | SEC_ARCH_LEAD] - Isolated base outline rendering to prevent multi-box rendering glitches on inner wrappers.
        if (mode === 'icon') el.style.outline = '2px dashed #00ffaa';

        const pinCont = el.querySelector('.pin-container');
        const infoCont = el.querySelector('.visual-extra');
        const lblCont = el.querySelector('.gate-label');
        // [AUDIT: v1.24.42 | SEC_ARCH_LEAD] - Renamed pin-dots to pin-leds to fix nomenclature as instructed.
        let target = (mode === 'pins' || mode === 'pin-leds') ? pinCont : (mode === 'info' ? infoCont : (mode === 'label' ? lblCont : el));

        // [AUDIT: v1.24.34 | SEC_ARCH_LEAD] - Dynamic proxy generation for port geometry mutations.
        if (mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') {
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
        // [AUDIT: v1.24.42 | SEC_ARCH_LEAD] - Adapted edit mode dispatch handling for pin-leds components.
        if (mode === 'pins' || mode === 'pin-leds' || mode === 'info' || mode === 'label' || mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') {
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
            target.style.outline = (mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') ? '2px dotted #ffca28' : '2px dashed #ff00aa';
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

                // [AUDIT: v1.25.33 | SEC_ARCH_LEAD] - Injected distinct cursor locks for horizontal label dragging vs vertical port scaling.
                if (mode === 'pin-labels') target.style.cursor = 'ew-resize';
                else if (mode === 'pin-both' || mode === 'ports') target.style.cursor = 'ns-resize';
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
            // [AUDIT: v1.24.42 | SEC_ARCH_LEAD] - Adapted scaling hitboxes for renamed pin-leds target.
            const isResizing = (mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') ? (rLeft || rRight || rTop || rBottom) : ((mode === 'pins' || mode === 'pin-leds' || mode === 'info' || mode === 'label') && (rLeft || rRight || rTop || rBottom));

            const startX = e.clientX;
            const startY = e.clientY;
            const isInfo = mode === 'info';
            const isLabel = mode === 'label';
            const isPort = mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports';
            const startPortLabelX = node.portLabelX !== undefined ? node.portLabelX : 12;
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
                    // [AUDIT: v1.24.42 | SEC_ARCH_LEAD] - Restored missing target condition for pin-leds scaling and translation propagation to fix regression.
                } else if (mode === 'pins' || mode === 'pin-leds' || mode === 'info' || mode === 'label' || mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') {
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

                        if (mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') {
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
                        // [AUDIT: v1.25.33 | SEC_ARCH_LEAD] - Isolated pin-labels to horizontal translation explicitly mapping to X-axis tracking.
                        node.portLabelX = Math.max(-40, startPortLabelX + dx);
                    } else if (mode === 'ports') {
                        node.portY = cY; node.portH = cH;
                    } else if (mode === 'pin-both') {
                        // [AUDIT: v1.24.36 | SEC_ARCH_LEAD] - Synchronized physical pin arrays with proxy height and vertical delta.
                        node.portY = cY; node.portH = cH;
                        node.pinY = startBasePinY + (cY - startPinY);
                        node.pinH = startBasePinH + (cH - startPinH);
                    } else {
                        node.pinX = cX; node.pinY = cY; node.pinW = cW; node.pinH = cH;
                    }

                    if (mode === 'pin-labels' || mode === 'pin-both' || mode === 'ports') {
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
        // [AUDIT: v1.24.42 | SEC_ARCH_LEAD] - Updated node edit exit hook for LED nomenclature sync.
        let target = state.mode === 'pins' || state.mode === 'pin-leds' ? pinCont : (state.mode === 'info' ? infoCont : (state.mode === 'label' ? lblCont : el));
        if (state.mode === 'pin-labels' || state.mode === 'pin-both' || state.mode === 'ports') target = el?.querySelector('.port-edit-proxy');

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

        const nw = { w: state.node.customWidth, h: state.node.customHeight, px: state.node.pinX, py: state.node.pinY, pw: state.node.pinW, ph: state.node.pinH, ix: state.node.infoX, iy: state.node.infoY, iw: state.node.infoW, ih: state.node.infoH, lx: state.node.labelX, ly: state.node.labelY, lw: state.node.labelW, lh: state.node.labelH, portY: state.node.portY, portH: state.node.portH, portLabelX: state.node.portLabelX };
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
                        n.portLabelX = state.node.portLabelX;
                        Sim.updateNodeVisual(n);
                    }
                });
                this.updateWireVisuals();
                this.autoSave();
                this.toast(`Global layout applied to all ${state.node.type} components.`, 'success');
            };
            tEl.appendChild(btn);
        }
        this.autoSave();
    },

    /**
     * [AUDIT: v1.23.79 | SEC_ARCH_LEAD] - Parametric macro geometry bounds override.
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
     */
    uiInlineEditValue(e, id, format) {
        // [AUDIT: v1.26.24 | SEC_ARCH_LEAD] - Inline structural editor for multi-bit readouts.
        if (document.body.classList.contains('edit-mode-active') || document.body.classList.contains('pin-mutate-active')) return;
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
     */
    uiQuit() {
        this.modal('Quit', 'Discard current session and clear autosave before exiting?', 'danger', (discard) => {
            if (discard) localStorage.removeItem('bsim_autosave');
            window.close();
        });
    },

    /**
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
     */
    distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = Math.hypot(x2 - x1, y2 - y1);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (l2 * l2)));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    },

    /**
     */
    reindexWires() {
        this.wireMap.clear();
        this.wires.forEach(w => {
            this.wireMap.set(`${w.to.nodeId}:${w.to.portId}`, w);
            this.wireMap.set(`${w.from.nodeId}:${w.from.portId}:src`, w);
        });
    },

    /**
     */
    clearSnapState() {
        document.querySelectorAll('.snap-hover').forEach(el => el.classList.remove('snap-hover'));
        this.wiring.snapTarget = null;
    },


    /**
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

        // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - Preserved macro folder hierarchy upon editor exit to prevent root directory drift.
        this.library[this.activeEditingChip] = {
            folder: this.library[this.activeEditingChip]?.folder || '',
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
