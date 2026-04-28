const WasmEngine = {
    ready: false,
    instance: null,
    memArray: null,
    REGION_A_OFFSET: 0,
    REGION_B_OFFSET: 4096,
    instructionCount: 0,
    idMap: new Map(), // nodeId -> wasmIdx (Region A)
    flatNodes: [],
    flatWires: [],

    async init() {
        try {
            const response = await fetch('js/wasm-bin/engine.wasm');
            if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch WebAssembly binary.`);
            const bytes = await response.arrayBuffer();
            this.memory = new WebAssembly.Memory({ initial: 1 });
            const { instance } = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: this.memory
                }
            });
            this.instance = instance;
            this.memArray = new Int32Array(this.memory.buffer);
            this.ready = true;
            console.log('[WasmEngine] Core initialized successfully.');
            // Force board re-evaluation now that the high-speed kernel is online
            if (window.Sim) {
                Sim.seedQueue();
                Sim.processQueue();
                Sim.updateHUD();
            }
        } catch (e) {
            console.error('[WasmEngine] Initialization failed:', e);
        }
    },

    _flattenNetlist(nodes, wires, prefix = "") {
        // Kernel primitives: pass through without expansion.
        // EVERYTHING else is expanded via Sim.library (user-defined chips).
        // The bridge has zero knowledge of AND/OR/XOR/etc — if a user wants those
        // gates, they build them from NANDs in the library. Done.
        const KERNEL = new Set(['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'DFF', 'CLOCK', 'TFF', 'TRISTATE', 'JUNCTION']);

        let fNodes = [];
        let fWires = [];

        const getInternalPort = (lib, gid, portStr, isInput) => {
            const ioNodes = lib.nodes.filter(x => x.type.startsWith(isInput ? 'IN-' : 'OUT-') || (isInput && x.type.startsWith('PROBE-')));
            ioNodes.sort((a, b) => a.y - b.y);
            const exactNode = ioNodes.find(x => x.id === portStr);
            if (exactNode) return { nodeId: `${gid}:${exactNode.id}`, portId: isInput ? 'in0' : 'out0' };
            const targetIdx = parseInt(portStr.replace(/\D/g, '')) || 0;
            let currentIdx = 0;
            for (const io of ioNodes) {
                const bits = parseInt(io.type.split('-')[1]) || 1;
                if (targetIdx < currentIdx + bits) {
                    const bitOffset = targetIdx - currentIdx;
                    const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                    return { nodeId: `${gid}:${io.id}`, portId: isInput ? `in${bIdx}` : `out${bIdx}` };
                }
                currentIdx += bits;
            }
            return null;
        };

        // Only expand nodes that are in Sim.library and not kernel primitives / IO
        const resolveLib = (n) => {
            if (n.type.startsWith('IN-') || n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) return null;
            if (KERNEL.has(n.type)) return null;
            if (window.Sim && Sim.library && Sim.library[n.type]) return Sim.library[n.type];
            return null; // unknown type — leave as-is; isPureNative check will gate WASM use
        };

        nodes.forEach(n => {
            const gid = prefix ? `${prefix}:${n.id}` : n.id;
            const lib = resolveLib(n);
            if (lib) {
                const res = this._flattenNetlist(lib.nodes, lib.wires, gid);
                fNodes.push(...res.nodes);
                fWires.push(...res.wires);
            } else {
                const cloned = JSON.parse(JSON.stringify(n));
                cloned.id = gid;
                fNodes.push(cloned);
            }
        });

        wires.forEach(w => {
            let finalFrom = prefix ? { nodeId: `${prefix}:${w.from.nodeId}`, portId: w.from.portId } : { ...w.from };
            let finalTo   = prefix ? { nodeId: `${prefix}:${w.to.nodeId}`,   portId: w.to.portId   } : { ...w.to };

            const fromNode = nodes.find(n => n.id === w.from.nodeId);
            const toNode   = nodes.find(n => n.id === w.to.nodeId);

            const fromLib = fromNode ? resolveLib(fromNode) : null;
            const toLib   = toNode   ? resolveLib(toNode)   : null;

            if (fromLib) {
                const gid = prefix ? `${prefix}:${w.from.nodeId}` : w.from.nodeId;
                const mapped = getInternalPort(fromLib, gid, w.from.portId, false);
                if (mapped) finalFrom = mapped;
            }
            if (toLib) {
                const gid = prefix ? `${prefix}:${w.to.nodeId}` : w.to.nodeId;
                const mapped = getInternalPort(toLib, gid, w.to.portId, true);
                if (mapped) finalTo = mapped;
            }

            fWires.push({ from: finalFrom, to: finalTo });
        });

        return { nodes: fNodes, wires: fWires };
    },

    syncLayout(nodes, wires) {
        if (!this.ready) return;
        const flattened = this._flattenNetlist(nodes, wires);
        this.flatNodes = flattened.nodes;
        this.flatWires = flattened.wires;
        this.idMap.clear();
        this.instructionCount = 0;

        // Expanded Memory Matrix calculation based on flat nodes, not parents
        const requiredBytes = 16384 + (this.flatNodes.length * 256);
        const requiredPages = Math.ceil(requiredBytes / 65536);
        const currentPages = this.memory.buffer.byteLength / 65536;
        
        if (requiredPages > currentPages) {
            this.memory.grow(requiredPages - currentPages);
            this.memArray = new Int32Array(this.memory.buffer);
            console.log(`[WasmEngine] Linear memory expanded to ${requiredPages} pages.`);
        }

        // 1. Assign static slots in Region A for all raw logic elements
        let slot = 1; // Slot 0 is GROUND
        this.flatNodes.forEach(n => {
            if (n.type.startsWith('IN-') || n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) {
                const bits = parseInt(n.type.split('-')[1]) || 1;
                let indices = [];
                for (let i = 0; i < bits; i++) indices.push(slot++);
                this.idMap.set(n.id, indices);
            } else if (n.type === 'DFF' || n.type === 'TFF') {
                this.idMap.set(n.id, [slot++, slot++]);
            } else {
                this.idMap.set(n.id, slot++);
            }
        });

        // 2. Initialize Region A to 0
        for (let i = 0; i < this.REGION_B_OFFSET; i++) {
            this.memArray[i] = 0;
        }

        // 3. Populate Region A with initial states
        this.flatNodes.forEach(n => {
            const mapped = this.idMap.get(n.id);
            if (Array.isArray(mapped)) {
                mapped.forEach((idx, i) => {
                    const val = Array.isArray(n.state) ? n.state[i] : (i === 0 ? n.state : 0);
                    this.memArray[this.REGION_A_OFFSET + idx] = val || 0;
                });
            } else {
                this.memArray[this.REGION_A_OFFSET + mapped] = n.state || 0;
            }
        });

        // 4. Build the linear execution array
        const OP_NAND = 0; const OP_DFF = 1; const OP_CLOCK = 2; const OP_TRISTATE = 3; const OP_TFF = 4;
        const OP_BUS_RESOLVE = 11;

        let virtualNodeCount = slot + 10;
        const getSpecificIdx = (id, port) => {
            const mapped = this.idMap.get(id);
            if (Array.isArray(mapped)) {
                if (port === 'q') return mapped[0];
                if (port === 'nq') return mapped[1];
                const bit = parseInt(port.replace(/\D/g, '')) || 0;
                return mapped[bit] !== undefined ? mapped[bit] : mapped[0];
            }
            return mapped;
        };

        const resolveAllDriverIndices = (startNodeId, startPortId) => {
            let visited = new Set();
            let drivers = new Set();
            
            const checkDriver = (nId, pId) => {
                const node = this.flatNodes.find(n => n.id === nId);
                if (!node) return;
                const isInternalIO = (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) && nId.includes(':');
                if (isInternalIO || node.type === 'JUNCTION') return;
                const NATIVE_GATES = new Set(['NAND', 'DFF', 'CLOCK', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
                if (node.type === 'CLOCK' && pId === 'out0') drivers.add(getSpecificIdx(nId, pId));
                if (NATIVE_GATES.has(node.type) && (pId === 'q' || pId === 'nq' || pId === 'out')) drivers.add(getSpecificIdx(nId, pId));
                if (node.type.startsWith('IN-') && !nId.includes(':')) drivers.add(getSpecificIdx(nId, pId));
            };
            checkDriver(startNodeId, startPortId);

            const trace = (currNodeId, currPortId) => {
                const stepKey = currNodeId + ':' + currPortId;
                if (visited.has(stepKey)) return;
                visited.add(stepKey);

                const node = this.flatNodes.find(n => n.id === currNodeId);
                if (!node) return;

                if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
                    if (currNodeId.includes(':')) {
                        const isInputProxy = node.type.startsWith('IN-');
                        const bIdx = currPortId.replace(/\D/g, '') || '0';
                        const targetPort = isInputProxy ? `in${bIdx}` : `out${bIdx}`;
                        const sourcePort = isInputProxy ? `out${bIdx}` : `in${bIdx}`;
                        
                        if (currPortId === sourcePort) {
                            trace(currNodeId, targetPort);
                        } else if (currPortId === targetPort) {
                            trace(currNodeId, sourcePort);
                        }
                    }
                }

                this.flatWires.forEach(w => {
                    if (w.to.nodeId === currNodeId && w.to.portId === currPortId) {
                        checkDriver(w.from.nodeId, w.from.portId);
                        trace(w.from.nodeId, w.from.portId);
                    }
                });
            };
            trace(startNodeId, startPortId);
            return drivers.size > 0 ? Array.from(drivers) : [0]; // Unconnected inputs default to GROUND (0)
        };

        const buildBusTree = (drivers) => {
            if (drivers.length === 1) return drivers[0];
            let currentIdx = drivers[0];
            for (let i = 1; i < drivers.length; i++) {
                const vTargetIdx = virtualNodeCount++;
                const baseIdx = this.REGION_B_OFFSET + (this.instructionCount * 4);
                this.memArray[baseIdx] = vTargetIdx;
                this.memArray[baseIdx + 1] = currentIdx;
                this.memArray[baseIdx + 2] = drivers[i];
                this.memArray[baseIdx + 3] = OP_BUS_RESOLVE;
                this.instructionCount++;
                currentIdx = vTargetIdx;
            }
            return currentIdx;
        };

        this.wireIdxMap = new Map();
        wires.forEach((w, i) => {
            let queryNode = w.from.nodeId;
            let queryPort = w.from.portId;
            
            const fromNode = nodes.find(n => n.id === w.from.nodeId);
            if (fromNode?.isCustom && Sim.library[fromNode.type]) {
                const lib = Sim.library[fromNode.type];
                const ioNodes = lib.nodes.filter(x => x.type.startsWith('OUT-'));
                
                const exactNode = ioNodes.find(x => x.id === w.from.portId);
                if (exactNode) {
                    queryNode = `${w.from.nodeId}:${exactNode.id}`;
                    queryPort = 'in0';
                } else {
                    ioNodes.sort((a, b) => a.y - b.y);
                    const targetIdx = parseInt(w.from.portId.replace(/\D/g, '')) || 0;
                    let currentIdx = 0;
                    for (const io of ioNodes) {
                        const bits = parseInt(io.type.split('-')[1]) || 1;
                        if (targetIdx < currentIdx + bits) {
                            const bitOffset = targetIdx - currentIdx;
                            const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                            queryNode = `${w.from.nodeId}:${io.id}`;
                            queryPort = `in${bIdx}`;
                            break;
                        }
                        currentIdx += bits;
                    }
                }
            }
            
            const dIdx = resolveAllDriverIndices(queryNode, queryPort);
            if (dIdx.length > 0) this.wireIdxMap.set(i, dIdx[0]);
        });

        // Helper to emit instructions into Region B
        const emitNAND = (target, a, b) => {
            const baseIdx = this.REGION_B_OFFSET + (this.instructionCount * 4);
            this.memArray[baseIdx] = target; this.memArray[baseIdx+1] = a;
            this.memArray[baseIdx+2] = b;    this.memArray[baseIdx+3] = OP_NAND;
            this.instructionCount++;
        };
        const emitOP = (target, a, b, op) => {
            const baseIdx = this.REGION_B_OFFSET + (this.instructionCount * 4);
            this.memArray[baseIdx] = target; this.memArray[baseIdx+1] = a;
            this.memArray[baseIdx+2] = b;    this.memArray[baseIdx+3] = op;
            this.instructionCount++;
        };

        // After _flattenNetlist, every node is either NAND, a sequential gate,
        // or an IO proxy. No compound gate types should appear here.
        this.flatNodes.forEach(n => {
            const mapped = this.idMap.get(n.id);
            if (Array.isArray(mapped)) return; // multi-bit IO slot, skip
            const t = n.type;

            const getA = () => buildBusTree(resolveAllDriverIndices(n.id, 'a'));
            const getB = () => buildBusTree(resolveAllDriverIndices(n.id, 'b'));

            if (t === 'NAND') {
                emitNAND(mapped, getA(), getB());
            } else if (t === 'NOT') {
                const a = getA();
                emitNAND(mapped, a, a);
            } else if (t === 'AND') {
                const a = getA(), b = getB();
                const v1 = virtualNodeCount++;
                emitNAND(v1, a, b);
                emitNAND(mapped, v1, v1);
            } else if (t === 'OR') {
                const a = getA(), b = getB();
                const v1 = virtualNodeCount++;
                const v2 = virtualNodeCount++;
                emitNAND(v1, a, a);
                emitNAND(v2, b, b);
                emitNAND(mapped, v1, v2);
            } else if (t === 'NOR') {
                const a = getA(), b = getB();
                const v1 = virtualNodeCount++;
                const v2 = virtualNodeCount++;
                const v3 = virtualNodeCount++;
                emitNAND(v1, a, a);
                emitNAND(v2, b, b);
                emitNAND(v3, v1, v2);
                emitNAND(mapped, v3, v3);
            } else if (t === 'XOR') {
                const a = getA(), b = getB();
                const v1 = virtualNodeCount++;
                const v2 = virtualNodeCount++;
                const v3 = virtualNodeCount++;
                emitNAND(v1, a, b);
                emitNAND(v2, a, v1);
                emitNAND(v3, b, v1);
                emitNAND(mapped, v2, v3);
            } else if (t === 'XNOR') {
                const a = getA(), b = getB();
                const v1 = virtualNodeCount++;
                const v2 = virtualNodeCount++;
                const v3 = virtualNodeCount++;
                const v4 = virtualNodeCount++;
                emitNAND(v1, a, b);
                emitNAND(v2, a, v1);
                emitNAND(v3, b, v1);
                emitNAND(v4, v2, v3);
                emitNAND(mapped, v4, v4);
            } else if (t === 'DFF' || t === 'CLOCK' || t === 'TRISTATE' || t === 'TFF') {
                let pm = { a: 'a', b: 'b' };
                if (t === 'DFF')           { pm.a = 'd';  pm.b = 'clk'; }
                else if (t === 'TFF')      { pm.a = 't';  pm.b = 'clk'; }
                else if (t === 'TRISTATE') { pm.a = 'in'; pm.b = 'en'; }
                const inA = buildBusTree(resolveAllDriverIndices(n.id, pm.a));
                const inB = buildBusTree(resolveAllDriverIndices(n.id, pm.b));
                const opMap = { DFF: OP_DFF, CLOCK: OP_CLOCK, TRISTATE: OP_TRISTATE, TFF: OP_TFF };
                emitOP(mapped, inA, inB, opMap[t]);
            }
            // IO proxies and JUNCTION nodes produce no instructions — they are
            // transparent pass-through slots in Region A only.
        });

        console.log(`[WasmEngine] Optimized execution graph built with ${this.instructionCount} instructions.`);
    },

    executeTick() {
        if (!this.ready || !this.instance) return;
        this.instance.exports.tick(this.instructionCount);
    },

    writeState(nodeId, value) {
        if (!this.ready) return;
        const mapped = this.idMap.get(nodeId);
        if (Array.isArray(mapped)) {
            mapped.forEach((idx, i) => {
                const val = Array.isArray(value) ? value[i] : (i === 0 ? value : 0);
                this.memArray[this.REGION_A_OFFSET + idx] = val !== undefined ? val : 0;
            });
        } else {
            this.memArray[this.REGION_A_OFFSET + mapped] = value;
        }
    },

    readWireState(wireIndex) {
        if (!this.ready || !this.wireIdxMap.has(wireIndex)) return null;
        return this.memArray[this.REGION_A_OFFSET + this.wireIdxMap.get(wireIndex)];
    },

    readState(nodeId) {
        if (!this.ready) return 0;
        const mapped = this.idMap.get(nodeId);
        if (Array.isArray(mapped)) {
            return mapped.map(idx => this.memArray[this.REGION_A_OFFSET + idx]);
        } else {
            return this.memArray[this.REGION_A_OFFSET + mapped];
        }
    },

    readPinState(nodeId, portId = 'in0') {
        if (!this.ready || !this.flatNodes || !this.flatWires) return null;

        if (window.Sim && Sim.nodes.find(n => n.id === nodeId)?.isCustom) {
            const chipNode = Sim.nodes.find(n => n.id === nodeId);
            const lib = Sim.library[chipNode.type];
            const isInput = portId.startsWith('in');
            const ioNodes = lib.nodes.filter(x => x.type.startsWith(isInput ? 'IN-' : 'OUT-') || (isInput && x.type.startsWith('PROBE-')));
            ioNodes.sort((a, b) => a.y - b.y);
            const targetIdx = parseInt(portId.replace(/\D/g, '')) || 0;
            let currentIdx = 0;
            for (const io of ioNodes) {
                const bits = parseInt(io.type.split('-')[1]) || 1;
                if (targetIdx < currentIdx + bits) {
                    const bitOffset = targetIdx - currentIdx;
                    const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                    const innerId = `${nodeId}:${io.id}`;
                    const state = this.readState(innerId);
                    if (Array.isArray(state)) return state[bIdx] !== undefined ? state[bIdx] : 0;
                    return state !== null ? state : 0;
                }
                currentIdx += bits;
            }
            return 0;
        }

        let visited = new Set();
        let signals = [];
        
        const trace = (currId, currPort) => {
            const stepKey = currId + ':' + currPort;
            if (visited.has(stepKey)) return;
            visited.add(stepKey);

            const node = this.flatNodes.find(n => n.id === currId);
            if (!node) return;

            if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
                if (currId.includes(':')) {
                    const isInputProxy = node.type.startsWith('IN-');
                    const bIdx = currPort.replace(/\D/g, '') || '0';
                    const targetPort = isInputProxy ? `in${bIdx}` : `out${bIdx}`;
                    const sourcePort = isInputProxy ? `out${bIdx}` : `in${bIdx}`;
                    
                    if (currPort === sourcePort) {
                        trace(currId, targetPort);
                    } else if (currPort === targetPort) {
                        trace(currId, sourcePort);
                    }
                }
            }
            
            const connectedWires = this.flatWires.filter(w => 
                (w.to.nodeId === currId && w.to.portId === currPort) || 
                (w.from.nodeId === currId && w.from.portId === currPort)
            );
            
            for (const w of connectedWires) {
                const peerNodeId = (w.to.nodeId === currId && w.to.portId === currPort) ? w.from.nodeId : w.to.nodeId;
                const peerPortId = (w.to.nodeId === currId && w.to.portId === currPort) ? w.from.portId : w.to.portId;
                
                const peerNode = this.flatNodes.find(n => n.id === peerNodeId);
                if (!peerNode) continue;
                
                const isInternalIO = (peerNode.type.startsWith('IN-') || peerNode.type.startsWith('OUT-') || peerNode.type.startsWith('PROBE-')) && peerNodeId.includes(':');
                const isPassThrough = peerNode.type === 'JUNCTION' || isInternalIO;
                
                const NATIVE_GATES = new Set(['NAND', 'DFF', 'CLOCK', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
                let isPeerOutput = false;
                if (peerNode.type === 'CLOCK' && peerPortId === 'out0') isPeerOutput = true;
                if (NATIVE_GATES.has(peerNode.type) && (peerPortId === 'q' || peerPortId === 'nq' || peerPortId === 'out')) isPeerOutput = true;
                if (peerNode.type.startsWith('IN-') && !peerNodeId.includes(':')) isPeerOutput = true;
                
                if (isPassThrough || !isPeerOutput) {
                    let nextPort = peerPortId;
                    if (peerNode.type === 'JUNCTION') nextPort = 'j';
                    trace(peerNodeId, nextPort);
                } else {
                    const state = this.readState(peerNodeId);
                    if (Array.isArray(state)) {
                        let bitIdx = parseInt(peerPortId.replace(/\D/g, '')) || 0;
                        if (peerPortId === 'q') bitIdx = 0;
                        if (peerPortId === 'nq') bitIdx = 1;
                        signals.push(state[bitIdx] !== undefined ? state[bitIdx] : 0);
                    } else {
                        signals.push(state !== null ? state : 0);
                    }
                }
            }
        };
        trace(nodeId, portId);
        if (signals.length === 0) return this.readState(nodeId) || 0;
        
        // Resolve High-Z and contention via last-priority reduction
        const activeSigs = signals.filter(s => s !== 2 && s !== 'Z');
        return activeSigs.length > 0 ? activeSigs[0] : 2;
    }
};

export default WasmEngine;
