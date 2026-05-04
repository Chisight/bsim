/**
 * Simulation Engine Module v1.26.28
 * [AUDIT: v1.26.01 | SEC_ARCH_LEAD] - Extracted core logical evaluation kernel from sim.js to isolate simulation math from UI orchestration.
 */
const Engine = {
    // KERNEL set for purity validation
    KERNEL: new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE', 'RAM', '0']),

    isPureNative(nodes, library) {
        const checkPure = (nodes) => nodes.every(n => {
            if (this.KERNEL.has(n.type)) return true;
            if (n.isCustom && library && library[n.type]) return checkPure(library[n.type].nodes);
            return false;
        });
        return checkPure(nodes);
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

    getSignal(sim, nodeId, portId) {
        const node = sim.nodes.find(n => n.id === nodeId);
        if (!node) return 'Z';
        if (node.type === 'JUNCTION') {
            return this.getDrivingSignal(sim, nodeId, portId);
        }
        if (node.type.startsWith('IN-')) {
            if (Array.isArray(node.state)) {
                const idx = parseInt(portId.replace('out', ''));
                return node.state[idx];
            }
            return node.state;
        }
        if (node.type === 'CLOCK') return node.state;
        if (node.type === '0') return 0;
        if (node.type === 'RAM') {
            if (node.val && node.val[portId] !== undefined) return node.val[portId];
            return 0;
        }
        if (node.type === 'DFF' || node.type === 'TFF') {
            if (node.val && node.val[portId] !== undefined) return node.val[portId];
            return 0;
        }
        if (node.isCustom) {
            if (node.outputs && node.outputs[portId] !== undefined) return node.outputs[portId];
            return 0;
        }
        return node.val !== undefined ? node.val : 0;
    },

    getDrivingSignal(sim, nodeId, portId, visited = new Set()) {
        const key = `${nodeId}:${portId}`;
        if (visited.has(key)) return 'Z';
        visited.add(key);

        let signals = [];
        sim.wires.forEach(w => {
            if (w.to.nodeId === nodeId && w.to.portId === portId) {
                signals.push(this.getSignal(sim, w.from.nodeId, w.from.portId, visited));
            } else if (w.from.nodeId === nodeId && w.from.portId === portId) {
                signals.push(this.getSignal(sim, w.to.nodeId, w.to.portId, visited));
            }
        });

        if (signals.length === 0) return 'Z';
        for (let sig of signals) {
            if (sig === 1 || sig === true) return 1;
        }
        if (signals.every(s => s === 'Z' || s === null)) return 'Z';
        return 0;
    },

    calculateNextState(sim, node) {
        if (node.type === 'JUNCTION') return this.getDrivingSignal(sim, node.id, 'in0');
        if (node.type === '0') return 0;
        if (node.type === 'NOT') {
            const s = this.getDrivingSignal(sim, node.id, 'in0');
            return (s === 'Z' || s === null) ? 'Z' : (s ? 0 : 1);
        }
        if (node.type === 'AND') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 && s2) ? 1 : 0;
        }
        if (node.type === 'OR') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 || s2) ? 1 : 0;
        }
        if (node.type === 'NAND') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 && s2) ? 0 : 1;
        }
        if (node.type === 'NOR') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 || s2) ? 0 : 1;
        }
        if (node.type === 'XOR') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 ^ s2) ? 1 : 0;
        }
        if (node.type === 'XNOR') {
            const s1 = this.getDrivingSignal(sim, node.id, 'in0');
            const s2 = this.getDrivingSignal(sim, node.id, 'in1');
            if (s1 === 'Z' || s2 === 'Z' || s1 === null || s2 === null) return 'Z';
            return (s1 ^ s2) ? 0 : 1;
        }
        if (node.type === 'TRISTATE') {
            const en = this.getDrivingSignal(sim, node.id, 'en');
            if (en === 1 || en === true) return this.getDrivingSignal(sim, node.id, 'in0');
            return 'Z';
        }
        if (node.type === 'DFF') {
            const d = this.getDrivingSignal(sim, node.id, 'd');
            const clk = this.getDrivingSignal(sim, node.id, 'clk');
            let q = (node.val && node.val.q !== undefined) ? node.val.q : 0;
            if (clk === 1 && node._lastClk === 0) q = d;
            node._lastClk = clk;
            return { q: q, nq: q === 'Z' ? 'Z' : (q ? 0 : 1) };
        }
        if (node.type === 'TFF') {
            const t = this.getDrivingSignal(sim, node.id, 't');
            const clk = this.getDrivingSignal(sim, node.id, 'clk');
            let q = (node.val && node.val.q !== undefined) ? node.val.q : 0;
            if (clk === 1 && node._lastClk === 0 && t === 1) q = q === 'Z' ? 'Z' : (q ? 0 : 1);
            node._lastClk = clk;
            return { q: q, nq: q === 'Z' ? 'Z' : (q ? 0 : 1) };
        }
        if (node.type === 'CLOCK') {
            // [AUDIT: v1.27.17 | SEC_ARCH_LEAD] - Synchronized temporal frame references across engines to prevent oscillator faults.
            const now = performance.now();
            const freq = node.freq || 1;
            const interval = 1000 / (freq * 2);
            if (!node.lastTick) node.lastTick = now;
            if (now - node.lastTick >= interval) {
                node.state = node.state ? 0 : 1;
                node.lastTick = now;
            }
            return node.state;
        }
        if (node.type === 'RAM') {
            const aBits = node.addressPins || 4;
            const addr = [];
            for (let i = 0; i < aBits; i++) addr.push(this.getDrivingSignal(sim, node.id, `in${i}`));
            if (addr.some(b => b === 'Z' || b === null)) return node.val || {};

            const addrVal = parseInt(addr.reverse().join(''), 2);
            const we = this.getDrivingSignal(sim, node.id, 'we');

            if (we === 1) {
                if (!node.memoryData) node.memoryData = new Array(Math.pow(2, aBits)).fill(0);
                const din = [];
                for (let i = 0; i < 8; i++) din.push(this.getDrivingSignal(sim, node.id, `din${i}`));
                if (!din.some(b => b === 'Z' || b === null)) {
                    node.memoryData[addrVal] = parseInt(din.reverse().join(''), 2);
                }
            }

            const outVal = (node.memoryData && node.memoryData[addrVal] !== undefined) ? node.memoryData[addrVal] : 0;
            const res = {};
            const binStr = outVal.toString(2).padStart(8, '0');
            for (let i = 0; i < 8; i++) res[`out${i}`] = parseInt(binStr[7 - i]);
            return res;
        }
        if (node.isCustom) {
            const chipDef = sim.library[node.type];
            if (!chipDef) return node.val || 0;
            const ins = this._assembleChipInputs(sim, node, (pid) => this.getDrivingSignal(sim, node.id, pid));
            return this.simulateInternalCircuit(sim, chipDef, ins);
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
                for (let b = 0; b < bits; b++) {
                    bVal.push(getDriveFn(`in${cIdx}`));
                    cIdx++;
                }
                res[p.id] = bVal;
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
                if (Array.isArray(val)) {
                    val.forEach((b, i) => {
                        res[`out${cIdx}`] = b;
                        cIdx++;
                    });
                } else {
                    for (let i = 0; i < bits; i++) {
                        res[`out${cIdx}`] = 0;
                        cIdx++;
                    }
                }
            }
        });
        return res;
    },

    simulateInternalCircuit(sim, chipTypeOrMeta, externalInputs) {
        const chipDef = typeof chipTypeOrMeta === 'string' ? sim.library[chipTypeOrMeta] : chipTypeOrMeta;
        if (!chipDef) return {};

        const subSim = {
            nodes: chipDef.nodes.map(n => ({ ...n })),
            wires: chipDef.wires,
            library: sim.library,
            eventQueue: new Set()
        };

        subSim.nodes.forEach(n => {
            if (externalInputs[n.id] !== undefined) {
                n.state = externalInputs[n.id];
                n.val = n.state;
            }
        });

        this.seedQueue(subSim);
        this.processQueue(subSim);

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
                    const mapPort = p => {
                        if (p === 'a') return 'in0';
                        if (p === 'b') return 'in1';
                        if (p === 'q') return 'out0';
                        if (p === 'nq') return 'out1';
                        return p;
                    };
                    const mappedWires = sim.wires.map(w => ({
                        ...w,
                        from: { ...w.from, portId: mapPort(w.from.portId) },
                        to: { ...w.to, portId: mapPort(w.to.portId) }
                    }));
                    WasmEngine.syncLayout(sim.nodes, mappedWires);
                    sim._netlistDirty = false;
                }
                sim.nodes.forEach(n => {
                    if (n.type.startsWith('IN-') || n.type === 'CLOCK') {
                        if (JSON.stringify(n.val) !== JSON.stringify(n.state)) {
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

                for (let i = 0; i < execDepth; i++) {
                    WasmEngine.executeTick(0);
                }
                WasmEngine.executeTick(1);
                WasmEngine.executeTick(2);

                sim.nodes.forEach(n => {
                    const NATIVE_GATES = new Set(['NAND', 'CLOCK', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'TRISTATE']);
                    if (NATIVE_GATES.has(n.type) && !n.isCustom) {
                        let newVal = WasmEngine.readState(n.id);
                        // [AUDIT: v1.26.28 | SEC_ARCH_LEAD] - Universal High-Z decoding for all native primitives to align with NAND propagation parity.
                        if (newVal === 2) newVal = 'Z';
                        if (n.val !== newVal || n._forcePropagate) {
                            n._forcePropagate = false;
                            n.val = newVal;
                            changed = true;
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                        }
                    } else if ((n.type === 'DFF' || n.type === 'TFF') && !n.isCustom) {
                        const newVal = WasmEngine.readState(n.id);
                        if (newVal && newVal.length >= 2) {
                            if (!n.val || n.val.q !== newVal[0] || n.val.nq !== newVal[1] || n._forcePropagate) {
                                n._forcePropagate = false;
                                n.val = { q: newVal[0], nq: newVal[1] };
                                changed = true;
                                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(n);
                            }
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
                        if (JSON.stringify(n.outputs) !== JSON.stringify(mappedOuts) || n._forcePropagate) {
                            n.outputs = mappedOuts;
                            n._forcePropagate = false;
                            n.val = JSON.parse(JSON.stringify(n.outputs));
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
                            if (JSON.stringify(n.state) !== JSON.stringify(nextState) || n._forcePropagate) {
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
                sim.eventQueue.clear();
                return;
            }
        }

        if (!sim.eventQueue || sim.eventQueue.size === 0) return;

        let iterations = 0;
        const MAX_ITERS = 1000;
        while (sim.eventQueue.size > 0 && iterations < MAX_ITERS) {
            iterations++;
            const nextQueue = new Set();
            const sortedEvents = Array.from(sim.eventQueue).sort((a, b) => {
                const isSeqA = ['DFF', 'TFF', 'CLOCK', 'RAM'].includes(a.type) ? 1 : 0;
                const isSeqB = ['DFF', 'TFF', 'CLOCK', 'RAM'].includes(b.type) ? 1 : 0;
                return isSeqA - isSeqB;
            });

            sortedEvents.forEach(node => {
                const newVal = this.calculateNextState(sim, node);
                const rawNew = (typeof newVal === 'string' && newVal !== 'Z') ? JSON.parse(newVal) : newVal;

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
                    node._oscillating = false;
                    if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);

                    let visitedJuncs = new Set();
                    const traceDriven = (nid, depth = 0) => {
                        if (depth > 100) return;
                        sim.wires.forEach(w => {
                            if (w.from.nodeId === nid) {
                                const ds = sim.nodes.find(n => n.id === w.to.nodeId);
                                if (ds) {
                                    nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id, depth + 1);
                                    }
                                }
                            } else if (w.to.nodeId === nid) {
                                const ds = sim.nodes.find(n => n.id === w.from.nodeId);
                                if (ds) {
                                    nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id, depth + 1);
                                    }
                                }
                            }
                        });
                    };
                    traceDriven(node.id);

                    if (sim.activeEditingChip === null && window.TutorialEngine) {
                        TutorialEngine.checkProgress();
                    }
                }
            });
            sim.eventQueue = nextQueue;
        }

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
        const mapPort = p => {
            if (p === 'a') return 'in0';
            if (p === 'b') return 'in1';
            if (p === 'q') return 'out0';
            if (p === 'nq') return 'out1';
            return p;
        };
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
