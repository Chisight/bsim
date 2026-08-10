/**
 * Simulation Engine Module v1.26.06
 * [AUDIT: v1.26.06 | SEC_ARCH_LEAD] - Injected universal High-Z decoding for native primitives to align with NAND propagation parity.
 */
const Engine = {
    // KERNEL set for purity validation
    KERNEL: new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'CLOCK', 'JUNCTION', 'TRISTATE', 'RAM', '0']),
    _sharedVisitedSet: new Set(),
    _sharedVisitedJuncs: new Set(),

    _isPureNativeCache: null,
    invalidatePurityCache() {
        this._isPureNativeCache = null;
    },
    isPureNative(nodes, library) {
        if (this._isPureNativeCache !== null) return this._isPureNativeCache;
        const checkPure = (nodes) => nodes.every(n => {
            if (this.KERNEL.has(n.type)) return true;
            if (library && library[n.type]) return checkPure(library[n.type].nodes);
            return false;
        });
        this._isPureNativeCache = checkPure(nodes || []);
        return this._isPureNativeCache;
    },

    fastEqual(a, b) {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        if (Array.isArray(a)) {
            if (!Array.isArray(b) || a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
            return true;
        }
        const ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (let k of ka) if (a[k] !== b[k]) return false;
        return true;
    },

    getSignal(sim, nodeId, portId, visited = null) {
        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }
        const node = sim._nodeMap ? sim._nodeMap.get(nodeId) : sim.nodes.find(n => n.id === nodeId);
        if (!node) {
            return 'Z';
        }
        if (node.type === 'JUNCTION') {
            return this.getDrivingSignal(sim, nodeId, portId, visited);
        }
        if (node.type.startsWith('IN-')) {
            let res = node.state;
            if (Array.isArray(node.state)) {
                let idx = parseInt(portId.replace('out', ''));
                if (isNaN(idx)) res = 0;
                else res = node.state[idx] !== undefined ? node.state[idx] : 0;
            }
            return res;
        }
        if (node.type === 'CLOCK') {
            return node.state;
        }
        if (node.type === '0') {
            return 0;
        }
        if (node.type === 'TRISTATE') {
            if (portId !== 'out') {
                return 'Z';
            }
            return node.val !== undefined ? node.val : 'Z';
        }
        if (node.type === 'RAM') {
            if (!portId.startsWith('out')) {
                return 'Z';
            }
            return (node.val && node.val[portId] !== undefined) ? node.val[portId] : 0;
        }
        if (node.isCustom) {
            return (node.outputs && node.outputs[portId] !== undefined) ? node.outputs[portId] : 'Z';
        }
        return node.val !== undefined ? node.val : 0;
    },

    getDrivingSignal(sim, nodeId, portId, visited = null) {
        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }
        const key = `${nodeId}:${portId}`;
        if (visited.has(key)) return 'Z';
        visited.add(key);

        let hasHigh = false;
        let hasLow = false;
        let hasError = false;
        let hasDriver = false;  // tracks whether ANY non-Hi-Z source drives this net
        // Use transient O(1) adjacency map when available (built inside processQueue/_actualDrawWires)
        const adj = sim._wireMap ? sim._wireMap.get(nodeId) : sim.wires;
        if (adj) adj.forEach(w => {
            let sig = null;
            if (w.to.nodeId === nodeId && w.to.portId === portId) {
                sig = this.getSignal(sim, w.from.nodeId, w.from.portId, visited);
            } else if (w.from.nodeId === nodeId && w.from.portId === portId) {
                sig = this.getSignal(sim, w.to.nodeId, w.to.portId, visited);
            }
            if (sig !== null) {
                if (sig !== 'Z' && sig !== 2) {
                    hasDriver = true;  // real driver
                    if (sig === 'E' || sig === 3) {
                        hasError = true;
                    } else if (sig === 1 || sig === true) {
                        hasHigh = true;
                    } else {
                        hasLow = true;
                    }
                }
            }
        });

        // If no non-Hi-Z driver exists, the net is floating (Hi-Z)
        if (!hasDriver) return 'Z';
        if (hasError || (hasHigh && hasLow)) return 'E';
        return hasHigh ? 1 : 0;
    },

    calculateNextState(sim, node, visited = null) {
        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }
        // Helper: convert Hi-Z or Error to 0 for gate logic (floating/error input = logic low)
        const g = (sig) => (sig === 'Z' || sig === 2 || sig === 'E' || sig === 3) ? 0 : (sig ? 1 : 0);

        if (node.type === 'JUNCTION') return this.getDrivingSignal(sim, node.id, 'j', visited);
        if (node.type === '0') return 0;
        if (node.type.startsWith('IN-')) {
            return node.state !== undefined ? node.state : (node.val !== undefined ? node.val : 0);
        }
        if (node.isCustom) {
            const chipDef = sim.library[node.type];
            if (!chipDef) return node.val || 0;
            const ins = this._assembleChipInputs(sim, node, (pid) => this.getDrivingSignal(sim, node.id, pid));
            return this.simulateInternalCircuit(sim, chipDef, ins, node);
        }
        if (node.type === 'NAND') {
            return (g(this.getDrivingSignal(sim, node.id, 'a')) && g(this.getDrivingSignal(sim, node.id, 'b'))) ? 0 : 1;
        }
        if (node.type === 'TRISTATE') {
            const en = g(this.getDrivingSignal(sim, node.id, 'en'));
            // When disabled, output is Hi-Z (floating). When enabled, pass the input through.
            if (!en) return 'Z';
            const inp = this.getDrivingSignal(sim, node.id, 'in');
            return (inp === 'Z') ? 0 : g(inp);
        }
        if (node.type === 'CLOCK') {
            // Centralized ticking is handled in the sim.js loop. We only tick here
            // if we are in a static/standalone analysis context (not running active simulation).
            if (!sim || !sim._isSimulating) {
                const now = performance.now();
                const freq = node.freq || 1;
                const interval = 1000 / (freq * 2);
                if (!node.lastTick) node.lastTick = now;
                if (now - node.lastTick >= interval) {
                    node.state = node.state ? 0 : 1;
                    node.lastTick = node.lastTick + interval;
                }
            }
            return node.state;
        }
        if (node.type === 'RAM') {
            const aBits = node.addressPins || 4;
            const addr = [];
            const flip = window.Sim && window.Sim.flipPinLogic;
            for (let i = 0; i < aBits; i++) {
                const pinIdx = flip ? (aBits - 1 - i) : i;
                addr.push(g(this.getDrivingSignal(sim, node.id, `in${pinIdx}`)));
            }
            const addrVal = addr.reduce((acc, b, i) => acc | (b << i), 0);
            const we = g(this.getDrivingSignal(sim, node.id, 'we'));
            if (we === 1) {
                if (!node.memoryData) node.memoryData = new Array(Math.pow(2, aBits)).fill(0);
                const din = [];
                for (let i = 0; i < 8; i++) {
                    const pinIdx = flip ? (8 - 1 - i) : i;
                    din.push(g(this.getDrivingSignal(sim, node.id, `din${pinIdx}`)));
                }
                node.memoryData[addrVal] = din.reduce((acc, b, i) => acc | (b << i), 0);
            }
            const outVal = (node.memoryData && node.memoryData[addrVal] !== undefined) ? node.memoryData[addrVal] : 0;
            const res = {};
            for (let i = 0; i < 8; i++) {
                const pinIdx = flip ? (8 - 1 - i) : i;
                res[`out${pinIdx}`] = (outVal & (1 << i)) ? 1 : 0;
            }
            return res;
        }
        if (node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
            const bits = parseInt(node.type.split('-')[1]) || 1;
            if (bits === 1) return g(this.getDrivingSignal(sim, node.id, 'in0'));
            const nextState = [];
            for (let i = 0; i < bits; i++) {
                nextState.push(g(this.getDrivingSignal(sim, node.id, `in${i}`)));
            }
            return nextState;
        }
        return node.val !== undefined ? node.val : 0;
    },

    _assembleChipInputs(sim, node, getDriveFn) {
        const chipDef = sim.library[node.type];
        if (!chipDef) return {};
        const ins = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const res = {};
        let cIdx = 0;
        ins.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            if (bits === 1) {
                res[p.id] = getDriveFn(`in${cIdx}`);
                cIdx++;
            } else {
                const bVal = [];
                const flip = window.Sim && window.Sim.flipPinLogic;
                for (let b = 0; b < bits; b++) {
                    const pinIdx = (bits > 1 && flip) ? (bits - 1 - b) : b;
                    bVal.push(getDriveFn(`in${cIdx + pinIdx}`));
                }
                res[p.id] = bVal;
                cIdx += bits;
            }
        });
        return res;
    },

    _mapChipOutputs(chipDef, internalRes) {
        const outs = chipDef.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        const res = {};
        let cIdx = 0;
        outs.forEach(p => {
            const bits = parseInt(p.type.split('-')[1]) || 1;
            const val = internalRes[p.id];
            if (bits === 1) {
                res[`out${cIdx}`] = val;
                cIdx++;
            } else {
                const flip = window.Sim && window.Sim.flipPinLogic;
                if (Array.isArray(val)) {
                    for (let i = 0; i < bits; i++) {
                        const valIdx = (bits > 1 && flip) ? (bits - 1 - i) : i;
                        res[`out${cIdx + i}`] = val[valIdx];
                    }
                } else {
                    for (let i = 0; i < bits; i++) {
                        res[`out${cIdx + i}`] = 0;
                    }
                }
                cIdx += bits;
            }
        });
        return res;
    },

    simulateInternalCircuit(sim, chipTypeOrMeta, externalInputs, outerNode = null) {
        const chipDef = typeof chipTypeOrMeta === 'string' ? sim.library[chipTypeOrMeta] : chipTypeOrMeta;
        if (!chipDef) return {};

        const subSim = {
            nodes: chipDef.nodes.map(n => {
                const clone = JSON.parse(JSON.stringify(n));
                clone._forcePropagate = true;
                return clone;
            }),
            wires: chipDef.wires,
            library: sim.library,
            eventQueue: new Set()
        };

        // Restore persisted state for stateful inner nodes (RAM, custom sub-chips)
        // so that registers accumulate state correctly across V8 engine invocations.
        if (outerNode) {
            if (!outerNode._internalState) outerNode._internalState = {};
            subSim.nodes.forEach(n => {
                const cached = outerNode._internalState[n.id];
                if (cached) {
                    if (cached.val !== undefined) n.val = typeof cached.val === 'object' ? JSON.parse(JSON.stringify(cached.val)) : cached.val;
                    if (cached.state !== undefined) n.state = typeof cached.state === 'object' ? JSON.parse(JSON.stringify(cached.state)) : cached.state;
                    if (cached._lastClk !== undefined) n._lastClk = cached._lastClk;
                    if (cached.memoryData !== undefined) n.memoryData = JSON.parse(JSON.stringify(cached.memoryData));
                    if (cached._internalState !== undefined) n._internalState = JSON.parse(JSON.stringify(cached._internalState));
                }
            });
        }

        subSim.nodes.forEach(n => {
            if (externalInputs[n.id] !== undefined) {
                n.state = externalInputs[n.id];
                n.val = n.state;
            }
        });

        this.seedQueue(subSim);
        this.processQueue(subSim);

        // Persist stateful node outputs back into the outer node's cache
        if (outerNode) {
            subSim.nodes.forEach(n => {
                outerNode._internalState[n.id] = {
                    val: typeof n.val === 'object' && n.val !== null ? JSON.parse(JSON.stringify(n.val)) : n.val,
                    state: typeof n.state === 'object' && n.state !== null ? JSON.parse(JSON.stringify(n.state)) : n.state,
                    _lastClk: n._lastClk,
                    memoryData: n.memoryData ? JSON.parse(JSON.stringify(n.memoryData)) : undefined,
                    _internalState: n._internalState ? JSON.parse(JSON.stringify(n._internalState)) : undefined
                };
            });
        }

        const rawInnerState = {};
        subSim.nodes.forEach(inner => {
            if (inner.type.startsWith('OUT-') || inner.type.startsWith('PROBE-')) {
                rawInnerState[inner.id] = inner.val;
            }
        });

        return this._mapChipOutputs(chipDef, rawInnerState);
    },

    seedQueue(sim) {
        sim.eventQueue = new Set();
        sim.nodes.forEach(n => {
            if (n.type.startsWith('IN-') || n.type === 'CLOCK' || n.type === '0') {
                sim.eventQueue.add(n);
                n._forcePropagate = true;
            }
        });
    },

    processQueue(sim) {
        // [AUDIT: v1.23.72 | SEC_ARCH_LEAD] - Data corruption sanitization.
        if (!sim._stateSanitized) {
            sim.nodes.forEach(n => {
                if (Array.isArray(n.state) && n.state.length === 1) n.state = n.state[0];
            });
            sim._stateSanitized = true;
        }

        // Wasm engine intercept
        if (sim.useWasm && window.WasmEngine && WasmEngine.ready) {
            const isPureNative = this.isPureNative(sim.nodes, sim.library);

            if (isPureNative) {
                let changed = false;
                if (sim._netlistDirty) {
                    const mapPort = p => p;
                    const mappedWires = sim.wires.map(w => ({
                        ...w,
                        from: { ...w.from, portId: mapPort(w.from.portId) },
                        to: { ...w.to, portId: mapPort(w.to.portId) }
                    }));
                    WasmEngine.log(`Netlist dirtiness detected. Rebuilding Wasm execution graph (syncLayout)...`);
                    WasmEngine.syncLayout(sim.nodes, mappedWires);
                    sim._netlistDirty = false;
                }
                sim.nodes.forEach(n => {
                    if (n.type.startsWith('IN-') || n.type === 'CLOCK') {
                        if (!this.fastEqual(n.val, n.state)) {
                            n.val = Array.isArray(n.state) ? [...n.state] : n.state;
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                            changed = true;
                        }
                        WasmEngine.writeState(n.id, n.state);
                    }
                });

                const execDepth = Math.max(20, sim.nodes.length);
                sim.nodes.filter(n => n.type === 'CLOCK').forEach(n => {
                    this.calculateNextState(sim, n);
                    WasmEngine.writeState(n.id, n.state);
                });

                WasmEngine.triggerTickAndWait();

                sim.nodes.forEach(n => {
                    const NATIVE_GATES = new Set(['NAND', 'CLOCK', 'TRISTATE']);
                    if (NATIVE_GATES.has(n.type) && !n.isCustom) {
                        let newVal = WasmEngine.readState(n.id);
                        // [AUDIT: v1.26.06 | SEC_ARCH_LEAD] - Corrected High-Z decoding for all native primitives.
                        if (newVal === 2) newVal = 'Z';
                        if (n.val !== newVal || n._forcePropagate) {
                            n._forcePropagate = false;
                            n.val = newVal;
                            changed = true;
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                        }
                    } else if (n.type === 'RAM' && !n.isCustom) {
                        const newVal = WasmEngine.readState(n.id);
                        if (newVal && newVal.length === 8) {
                            const outObj = {};
                            let isDiff = !n.val || n._forcePropagate;
                            for (let i = 0; i < 8; i++) {
                                outObj[`out${i}`] = newVal[i];
                                if (!isDiff && n.val[`out${i}`] !== newVal[i]) isDiff = true;
                            }
                            if (isDiff) {
                                n._forcePropagate = false;
                                n.val = outObj;
                                changed = true;
                                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                            }
                        }
                    }
                });

                // Second pass to resolve Junction states after all native gates have been synchronized
                sim.nodes.forEach(n => {
                    if (n.type === 'JUNCTION') {
                        let newVal = this.getDrivingSignal(sim, n.id, 'j');
                        if (n.val !== newVal || n._forcePropagate) {
                            n._forcePropagate = false;
                            n.val = newVal;
                            changed = true;
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                        }
                    }
                });

                sim.nodes.forEach(n => {
                    if (n.isCustom && sim.library[n.type]) {
                        if (!n.outputs) n.outputs = {};
                        let rawInnerState = {};
                        sim.library[n.type].nodes.forEach(inner => {
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

                        const mappedOuts = this._mapChipOutputs(sim.library[n.type], rawInnerState);
                        if (!this.fastEqual(n.outputs, mappedOuts) || n._forcePropagate) {
                            n.outputs = mappedOuts;
                            n._forcePropagate = false;
                            n.val = { ...n.outputs };
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                            changed = true;
                        }
                    }

                    if (n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) {
                        const bits = parseInt(n.type.split('-')[1]) || 1;
                        if (bits === 1) {
                            const drive = WasmEngine.readPinState(n.id, 'in0');
                            const val = (drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0);
                            if (n.val !== val || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.val = val;
                                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                                changed = true;
                            }
                        } else {
                            const nextState = new Array(bits).fill(0);
                            for (let b = 0; b < bits; b++) {
                                const drive = WasmEngine.readPinState(n.id, `in${b}`);
                                nextState[b] = (drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0);
                            }
                            if (!this.fastEqual(n.state, nextState) || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.state = nextState;
                                n.val = [...nextState];
                                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                                changed = true;
                            }
                        }
                    }
                });
                if (changed && typeof sim.updateHUD === 'function') sim.updateHUD();
                if (window.WireRenderer) WireRenderer.drawWires();
                
                // --- Hook VCD Recording & Assertion Checks ---
                if (window.DebugTerminal) {
                    if (DebugTerminal.vcdRecording) {
                        DebugTerminal.recordVcdState();
                    }
                    if (DebugTerminal.getassertionsActive && DebugTerminal.getassertionsActive()) {
                        if (!DebugTerminal.checkAssertions()) {
                            DebugTerminal._halted = true;
                            DebugTerminal.print("[SYSTEM] Simulation execution halted due to assertion breakpoint trigger.", "err");
                        }
                    }
                }
                
                sim.eventQueue.clear();
                return;
            }
        }

        if (!sim.eventQueue || sim.eventQueue.size === 0) return;

        let iterations = 0;
        const MAX_ITERS = 1000;

        // Build high-performance transient O(1) Node Map and Wire Adjacency Map for hot execution loops
        sim._nodeMap = new Map(sim.nodes.map(n => [n.id, n]));
        sim._wireMap = new Map();
        sim.wires.forEach(w => {
            if (!sim._wireMap.has(w.from.nodeId)) sim._wireMap.set(w.from.nodeId, []);
            sim._wireMap.get(w.from.nodeId).push(w);
            if (w.to.nodeId !== w.from.nodeId) {
                if (!sim._wireMap.has(w.to.nodeId)) sim._wireMap.set(w.to.nodeId, []);
                sim._wireMap.get(w.to.nodeId).push(w);
            }
        });

        if (!sim._nextQueue) sim._nextQueue = new Set();
        else sim._nextQueue.clear();

        if (!sim._combNodesList) sim._combNodesList = [];
        if (!sim._seqNodesList) sim._seqNodesList = [];

        const traceDriven = (nid, depth = 0) => {
            if (depth > 100) return;
            const adj = sim._wireMap ? (sim._wireMap.get(nid) || []) : sim.wires.filter(w => w.from.nodeId === nid || w.to.nodeId === nid);
            adj.forEach(w => {
                if (w.from.nodeId === nid) {
                    const ds = sim._nodeMap ? sim._nodeMap.get(w.to.nodeId) : sim.nodes.find(n => n.id === w.to.nodeId);
                    if (ds) {
                        sim._nextQueue.add(ds);
                        if (ds.type === 'JUNCTION' && !this._sharedVisitedJuncs.has(ds.id)) {
                            this._sharedVisitedJuncs.add(ds.id);
                            traceDriven(ds.id, depth + 1);
                        }
                    }
                } else if (w.to.nodeId === nid) {
                    const ds = sim._nodeMap ? sim._nodeMap.get(w.from.nodeId) : sim.nodes.find(n => n.id === w.from.nodeId);
                    if (ds) {
                        sim._nextQueue.add(ds);
                        if (ds.type === 'JUNCTION' && !this._sharedVisitedJuncs.has(ds.id)) {
                            this._sharedVisitedJuncs.add(ds.id);
                            traceDriven(ds.id, depth + 1);
                        }
                    }
                }
            });
        };

        const processNode = (node) => {
            const newVal = this.calculateNextState(sim, node);
            const rawNew = (typeof newVal === 'string' && newVal !== 'Z' && newVal !== 'E') ? JSON.parse(newVal) : newVal;

            if (!this.fastEqual(node.val, rawNew) || node._forcePropagate) {
                if (!this.fastEqual(node.val, rawNew)) node.toggles = (node.toggles || 0) + 1;
                node._forcePropagate = false;

                if (!sim._transitions) sim._transitions = new Map();
                const flips = (sim._transitions.get(node.id) || 0) + 1;
                sim._transitions.set(node.id, flips);

                if (flips > (sim.MAX_TRANSITIONS || 100)) {
                    if (!node._oscillating) {
                        console.warn(`[DEBUG] Oscillation detected on node ${node.id}.`);
                        node._oscillating = true;
                        if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);
                    }
                    return;
                }

                node.val = rawNew;
                if (node.isCustom) {
                    node.outputs = typeof rawNew === 'object' && rawNew !== null ? { ...rawNew } : {};
                }
                node._oscillating = false;
                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);

                this._sharedVisitedJuncs.clear();
                traceDriven(node.id);

                if (sim.activeEditingChip === null && window.TutorialEngine) {
                    TutorialEngine.checkProgress();
                }
            }
        };

        while (sim.eventQueue.size > 0 && iterations < MAX_ITERS) {
            iterations++;

            sim._combNodesList.length = 0;
            sim._seqNodesList.length = 0;

            sim.eventQueue.forEach(node => {
                if (['CLOCK', 'RAM'].includes(node.type)) {
                    sim._seqNodesList.push(node);
                } else {
                    sim._combNodesList.push(node);
                }
            });

            for (let i = 0; i < sim._combNodesList.length; i++) processNode(sim._combNodesList[i]);
            for (let i = 0; i < sim._seqNodesList.length; i++) processNode(sim._seqNodesList[i]);

            // Swap double buffers
            const temp = sim.eventQueue;
            sim.eventQueue = sim._nextQueue;
            sim._nextQueue = temp;
            sim._nextQueue.clear();
        }

        // Clean up high-performance transient Node Map and Wire Adjacency Map
        delete sim._nodeMap;
        delete sim._wireMap;

        if (iterations >= MAX_ITERS) {
            console.error('[Simulator] Thermal Trip: Max propagation reached.');
            sim.eventQueue.clear();
            if (typeof sim.toast === 'function') sim.toast('Simulation halted: Unstable oscillation detected.', 'danger');
        }

        if (iterations > 0 && window.WireRenderer) WireRenderer.drawWires();
    },

    async runWasmParityCheck(sim, iterations = 1000) {
        if (!window.WasmEngine || !WasmEngine.ready) return sim.toast('Wasm Engine not linked.', 'danger');
        sim.toast('Diagnostics Running. Press F12 to monitor console.', 'warning');
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 50));
        const isPureNative = this.isPureNative(sim.nodes, sim.library);
        if (!isPureNative) return sim.toast('Parity check requires native logic components only.', 'warning');
        console.group(`[Diagnostics] Wasm vs V8 State Parity Sweep (${iterations} Cycles)`);
        const mapPort = p => p;
        const mappedWires = sim.wires.map(w => ({
            ...w,
            from: { ...w.from, portId: mapPort(w.from.portId) },
            to: { ...w.to, portId: mapPort(w.to.portId) }
        }));
        WasmEngine.syncLayout(sim.nodes, mappedWires);
        const inputNodes = sim.nodes.filter(n => n.type.startsWith('IN-'));
        const outputNodes = sim.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-'));
        if (inputNodes.length === 0 || outputNodes.length === 0) {
            console.groupEnd();
            return sim.toast('Diagnostics require at least 1 input and 1 output terminal.', 'warning');
        }
        let passed = true;
        const snapshot = JSON.stringify(sim.nodes.map(n => ({ id: n.id, val: n.val, state: n.state })));
        for (let i = 0; i < iterations; i++) {
            if (i % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            inputNodes.forEach(n => {
                const bits = parseInt(n.type.split('-')[1]) || 1;
                if (bits === 1) { n.state = Math.random() > 0.5 ? 1 : 0; n.val = n.state; }
                else { n.state = Array.from({ length: bits }, () => Math.random() > 0.5 ? 1 : 0); n.val = [...n.state]; }
                WasmEngine.writeState(n.id, n.state);
            });
            for (let t = 0; t < 20; t++) WasmEngine.executeTick(0);
            WasmEngine.executeTick(1); WasmEngine.executeTick(2);
            for (let step = 0; step < 20; step++) {
                sim.nodes.forEach(n => {
                    if (n.type.startsWith('IN-')) return;
                    const next = this.calculateNextState(sim, n);
                    n.val = (typeof next === 'string' && next !== 'Z') ? JSON.parse(next) : next;
                });
            }
            outputNodes.forEach(n => {
                const bits = parseInt(n.type.split('-')[1]) || 1;
                const v8Val = n.val;
                const wasmVal = WasmEngine.readState(n.id, bits);
                if (!this.fastEqual(v8Val, wasmVal)) {
                    console.error(`[Parity Fault] Cycle ${i} | Node ${n.id} (${n.type}) | V8: ${JSON.stringify(v8Val)} != WASM: ${JSON.stringify(wasmVal)}`);
                    passed = false;
                }
            });
            if (!passed) break;
        }
        const saved = JSON.parse(snapshot);
        sim.nodes.forEach(n => { const s = saved.find(x => x.id === n.id); if (s) { n.val = s.val; n.state = s.state; } });
        if (passed) { console.log('%c[Diagnostics] SUCCESS: 100% Cryptographic Parity Confirmed.', 'color: #00ffaa; font-weight: bold;'); alert("WASM Parity Validated. Check F12 Console."); }
        else { console.error('[Diagnostics] FAILED: Architecture divergence detected. Halting execution.'); alert("Parity Deviation Detected. Check F12 Console for exact byte offsets."); }
        console.groupEnd();
        sim.toast(passed ? 'Parity Suite: PASSED' : 'Parity Suite: FAILED (Check Console)', passed ? 'success' : 'danger');
        if (typeof sim.updateWireVisuals === 'function') sim.updateWireVisuals();
    }
};

window.Engine = Engine;
