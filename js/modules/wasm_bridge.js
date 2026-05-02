const WasmEngine = {
    ready: false,
    instance: null,
    memArray: null,
    REGION_A_OFFSET: 0,
    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Align JS bridge with expanded 1MB Wasm instruction boundary.
    REGION_B_OFFSET: 262144, // 1048576 bytes / 4 bytes per Int32
    // [AUDIT: v1.24.88 | SEC_ARCH_LEAD] - Relocated Region C boundary to 16MB to prevent instruction heap overflow (Region B collision).
    REGION_C_OFFSET: 4194304, // 16777216 bytes / 4 bytes per Int32
    // [AUDIT: v1.24.93 | SEC_ARCH_LEAD] - Region E boundary allocated at 24MB for Power Analysis toggle counters.
    REGION_E_OFFSET: 6291456, // 25165824 bytes / 4 bytes per Int32
    instructionCount: 0,
    idMap: new Map(), // nodeId -> wasmIdx (Region A)
    flatNodes: [],
    flatWires: [],



    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm kernel initialization.
     * @ARCH: KERNEL_LOADER
     * @IO: WASM_FETCH
     * @INTENT: Asynchronously initialize the WebAssembly execution environment and linear memory buffer.
     */
    async init() {
        try {
            const response = await fetch('js/wasm-bin/engine.wasm');
            if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch WebAssembly binary.`);
            const bytes = await response.arrayBuffer();

            // [AUDIT: v1.24.96 | SEC_ARCH_LEAD] - Reverted to non-shared memory to bypass Cross-Origin Isolation requirements for local deployment.
            this.memory = new WebAssembly.Memory({ 
                initial: 512, // 32MB baseline
                maximum: 2048, // 128MB ceiling
                shared: false 
            });

            // [AUDIT: v1.24.98 | SEC_ARCH_LEAD] - Dynamic Guard Band Memory Allocation via environment injection.
            const { instance } = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: this.memory,
                    SHADOW_BASE: 196608,
                    PREV_CLK_BASE: 131072,
                    NQ_BASE: 65536
                }
            });
            this.instance = instance;
            this.memArray = new Int32Array(this.memory.buffer);
            this.ready = true;
            console.log('[WasmEngine] Core initialized successfully (Single-Threaded Mode).');
            
            if (window.Sim) {
                Sim.seedQueue();
                Sim.processQueue();
                Sim.updateHUD();
            }
        } catch (e) {
            console.error('[WasmEngine] Initialization failed:', e);
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for netlist expansion and hierarchical flattening.
     * @ARCH: NETLIST_EXPANDER
     * @CONSTRAINT: RECURSIVE_RESOLUTION
     * @INTENT: Recursively expand hierarchical macros into primitive gates for the linear execution kernel.
     */
    _flattenNetlist(nodes, wires, prefix = "") {
        // Kernel primitives: pass through without expansion.
        // EVERYTHING else is expanded via Sim.library (user-defined chips).
        // The bridge has zero knowledge of AND/OR/XOR/etc — if a user wants those
        // gates, they build them from NANDs in the library. Done.
        // [AUDIT: v1.24.73 | SEC_ARCH_LEAD] - Synchronized KERNEL primitives to prevent errant flattening of ROM/RAM modules.
        const KERNEL = new Set(['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'DFF', 'CLOCK', 'TFF', 'TRISTATE', 'JUNCTION', 'RAM', '0']);

        let fNodes = [];
        let fWires = [];

        const getInternalPort = (lib, gid, portStr, isInput) => {
            const ioNodes = lib.nodes.filter(x => x.type.startsWith(isInput ? 'IN-' : 'OUT-') || (!isInput && x.type.startsWith('PROBE-')));
            ioNodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
            const exactNode = ioNodes.find(x => x.id === portStr);
            if (exactNode) return { nodeId: `${gid}:${exactNode.id}`, portId: isInput ? 'in0' : 'out0' };
            const targetIdx = parseInt(portStr.replace(/\D/g, '')) || 0;
            let currentIdx = 0;
            for (const io of ioNodes) {
                const bits = parseInt(io.type.split('-')[1]) || 1;
                if (targetIdx < currentIdx + bits) {
                    const bitOffset = targetIdx - currentIdx;
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Re-enabled index inversion to fix MSB/LSB parity alignment for custom chips.
                    const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                    return { nodeId: `${gid}:${io.id}`, portId: isInput ? `in${bIdx}` : `out${bIdx}` };
                }
                currentIdx += bits;
            }
            // [AUDIT: v1.23.73 | SEC_ARCH_LEAD] - EXIT_TRACE: Port resolution failed for ${portStr}.
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
            let finalTo = prefix ? { nodeId: `${prefix}:${w.to.nodeId}`, portId: w.to.portId } : { ...w.to };

            const fromNode = nodes.find(n => n.id === w.from.nodeId);
            const toNode = nodes.find(n => n.id === w.to.nodeId);

            const fromLib = fromNode ? resolveLib(fromNode) : null;
            const toLib = toNode ? resolveLib(toNode) : null;

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

        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Returning flattened object graph with prefix context: ${prefix || 'ROOT'}
        return { nodes: fNodes, wires: fWires };
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm linear memory synchronization and instruction assembly.
     * @ARCH: SYNC_BRIDGE
     * @STATE: LINEAR_ALLOCATION
     * @INTENT: Synchronize the JS object graph with Wasm linear memory, assigning static slots and building instructions.
     */
    syncLayout(nodes, wires) {
        if (!this.ready) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: syncLayout aborted, engine not ready.
            return;
        }
        const flattened = this._flattenNetlist(nodes, wires);
        this.flatNodes = flattened.nodes;
        this.flatWires = flattened.wires;
        this.idMap.clear();
        this.instructionCount = 0;

        // [AUDIT: v1.24.78 | SEC_ARCH_LEAD] - Instantiated O(1) hash map and wire adjacency lists for Wasm netlist traversal to eradicate O(N^2) array lookup deadlocks.
        this._fastNodeMap = new Map();
        this.flatNodes.forEach(n => this._fastNodeMap.set(n.id, n));
        
        this._fastWireAdj = new Map();
        this.flatWires.forEach(w => {
            const fKey = w.from.nodeId + ':' + w.from.portId;
            const tKey = w.to.nodeId + ':' + w.to.portId;
            if (!this._fastWireAdj.has(fKey)) this._fastWireAdj.set(fKey, []);
            if (!this._fastWireAdj.has(tKey)) this._fastWireAdj.set(tKey, []);
            this._fastWireAdj.get(fKey).push(w);
            this._fastWireAdj.get(tKey).push(w);
        });

        // Expanded Memory Matrix calculation based on flat nodes, not parents
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Ensure memory allocation accounts for 1MB instruction base.
        // [AUDIT: v1.24.60 | SEC_ARCH_LEAD] - Dynamic Region C allocation injected for linear Wasm payload bridging.
        // [AUDIT: v1.24.83 | SEC_ARCH_LEAD] - Enforce physical powers-of-2 memory chunking to prevent out-of-bounds module bleeding.
        let romPayloadSize = 0;
        this.flatNodes.forEach(n => {
            if (n.type === 'ROM' || n.type === 'RAM') romPayloadSize += (1 << (n.addressPins || 4));
        });
        // [AUDIT: v1.24.94 | SEC_ARCH_LEAD] - Shifted allocation baseline to 24MB to encompass Region E power analysis buffers and prevent OOB traps.
        const requiredBytes = 25165824 + (this.flatNodes.length * 256) + romPayloadSize;
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
                // [AUDIT: v1.24.92 | SEC_ARCH_LEAD] - Expand to 4 slots to support Shadow State NextQ for Three-Phase Commit.
                this.idMap.set(n.id, [slot++, slot++, slot++, slot++]);
            } else if (n.type === 'ROM' || n.type === 'RAM') {
                let indices = [];
                for (let i = 0; i < 8; i++) indices.push(slot++);
                this.idMap.set(n.id, indices);
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
        // [AUDIT: v1.24.66 | SEC_ARCH_LEAD] - Injected Memory and Offset Opcodes for Kernel Parity.
        const OP_ROM = 5; const OP_BUFFER = 6; const OP_RAM = 7; const OP_SET_OFFSET = 8;
        const OP_BUS_RESOLVE = 11;

        let virtualNodeCount = slot + 10;
        let currentRomOffset = 0;
        /**
         * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical driver resolution.
         * @ARCH: SIGNAL_RESOLVER
         * @STATE: DRIVER_GRAPH
         * @INTENT: Perform a deep-search through the netlist to identify all logical drivers for a specific port.
         */
        const resolveAllDriverIndices = (startNodeId, startPortId) => {
            let visited = new Set();
            let drivers = new Set();

            const checkDriver = (nId, pId) => {
                const node = this._fastNodeMap.get(nId);
                if (!node) return;
                const isInternalIO = (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) && nId.includes(':');
                if (isInternalIO || node.type === 'JUNCTION') return;
                // [AUDIT: v1.24.69 | SEC_ARCH_LEAD] - Synchronized Driver Resolution to recognize RAM primitives as valid signal sources for Wasm netlists.
                // [AUDIT: v1.25.22 | SEC_ARCH_LEAD] - Whitelisted '0' primitive as a valid signal driver in Wasm netlist tracing.
                // [AUDIT: v1.25.34 | SEC_ARCH_LEAD] - Excised ROM from Wasm netlist driver trace.
                const NATIVE_GATES = new Set(['NAND', 'DFF', 'CLOCK', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
                if ((node.type === 'CLOCK' || node.type === '0') && pId === 'out0') drivers.add(this.getSpecificIdx(nId, pId));
                if (NATIVE_GATES.has(node.type) && (pId === 'q' || pId === 'nq' || pId === 'out' || (node.type === 'RAM' && pId.startsWith('out')))) drivers.add(this.getSpecificIdx(nId, pId));
                if (node.type.startsWith('IN-') && !nId.includes(':')) drivers.add(this.getSpecificIdx(nId, pId));
            };
            checkDriver(startNodeId, startPortId);

            const trace = (currNodeId, currPortId) => {
                const stepKey = currNodeId + ':' + currPortId;
                if (visited.has(stepKey)) return;
                visited.add(stepKey);

                const node = this._fastNodeMap.get(currNodeId);
                if (!node) return;

                // [AUDIT: v1.23.60 | SEC_ARCH_LEAD] - Standardize proxy port mapping for hierarchical netlist traversal.
                // [AUDIT: v1.23.63 | SEC_ARCH_LEAD] - Correct bit-order and hierarchical port resolution for bus proxies.
                if (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
                    if (currNodeId.includes(':')) {
                        const isInputProxy = node.type.startsWith('IN-');
                        const num = currPortId.match(/\d+/) ? currPortId.match(/\d+/)[0] : '0';

                        if (isInputProxy) {
                            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Prevent parent macro boundary jump to preserve deep hierarchical netlist recursion in Wasm compiler.
                            if (currPortId.startsWith('out')) trace(currNodeId, `in${num}`);
                            else if (currPortId.startsWith('in')) trace(currNodeId, node.type === 'IN-1' ? 'out' : `out${num}`);
                        } else {
                            if (currPortId.startsWith('in')) trace(currNodeId, `out${num}`);
                            else if (currPortId.startsWith('out')) trace(currNodeId, `in${num}`);
                        }
                    }
                }

                const adjWires = this._fastWireAdj.get(stepKey) || [];
                adjWires.forEach(w => {
                    if (w.to.nodeId === currNodeId && w.to.portId === currPortId) {
                        checkDriver(w.from.nodeId, w.from.portId);
                        trace(w.from.nodeId, w.from.portId);
                    } else if (w.from.nodeId === currNodeId && w.from.portId === currPortId) {
                        checkDriver(w.to.nodeId, w.to.portId);
                        trace(w.to.nodeId, w.to.portId);
                    }
                });
            };
            trace(startNodeId, startPortId);
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Returning ${drivers.size} drivers for ${startNodeId}:${startPortId}.
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
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Bus resolution tree built. Final index: ${currentIdx}
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
                    ioNodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
                    const targetIdx = parseInt(w.from.portId.replace(/\D/g, '')) || 0;
                    let currentIdx = 0;
                    for (const io of ioNodes) {
                        const bits = parseInt(io.type.split('-')[1]) || 1;
                        if (targetIdx < currentIdx + bits) {
                            const bitOffset = targetIdx - currentIdx;
                            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Restored bit inversion to prevent upside-down 8-bit mapping.
                            const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                            queryNode = `${w.from.nodeId}:${io.id}`;
                            queryPort = `in${bIdx}`;
                            break;
                        }
                        currentIdx += bits;
                    }
                }
            }
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Resolve all drivers for the current wire to ensure proper state propagation in the linear memory array.
            const dIdx = resolveAllDriverIndices(queryNode, queryPort);
            if (dIdx.length > 0) this.wireIdxMap.set(i, dIdx[0]);
        });

        // Implement Robust Kahn's Algorithm for Topological Sorting.
        // Replaces broken wire-direction assumptions with true logical dependency tracing.
        let inDegree = new Map();
        let adjList = new Map();
        this.flatNodes.forEach(n => { inDegree.set(n.id, 0); adjList.set(n.id, new Set()); });

        const findDriverNodes = (startNodeId, startPortId) => {
            let visited = new Set();
            let drivers = new Set();
            const trace = (currNodeId, currPortId) => {
                const stepKey = currNodeId + ':' + currPortId;
                if (visited.has(stepKey)) return;
                visited.add(stepKey);

                const node = this._fastNodeMap.get(currNodeId);
                if (!node) return;

                const isInternalIO = (node.type.startsWith('IN-') || node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) && currNodeId.includes(':');
                const isPassThrough = node.type === 'JUNCTION' || isInternalIO;

                // [AUDIT: v1.24.69 | SEC_ARCH_LEAD] - Injected RAM output port detection into Kahn's topological sort whitelists.
                let isOutput = false;
                if (node.type === 'CLOCK' && currPortId === 'out0') isOutput = true;
                // [AUDIT: v1.25.22 | SEC_ARCH_LEAD] - Registered '0' primitive to Kahn's topological sort as an origin boundary.
                // [AUDIT: v1.25.34 | SEC_ARCH_LEAD] - Purged ROM from Kahn's topological sort.
                const NATIVE_GATES = new Set(['NAND', 'DFF', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
                if (NATIVE_GATES.has(node.type) && (currPortId === 'out' || currPortId === 'out0' || currPortId === 'q' || currPortId === 'nq' || (node.type === 'RAM' && currPortId.startsWith('out')))) isOutput = true;
                if (node.type.startsWith('IN-') && !currNodeId.includes(':')) isOutput = true;
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Identify output nodes for topological sorting.
                if (isOutput && !isPassThrough) {
                    drivers.add(currNodeId);
                    return;
                }

                // [AUDIT: v1.23.60 | SEC_ARCH_LEAD] - Unified proxy port mapping for internal IO nodes.
                if (isInternalIO) {
                    const isInputProxy = node.type.startsWith('IN-');
                    const num = currPortId.replace(/\D/g, '') || '0';
                    if (isInputProxy) {
                        if (currPortId.startsWith('out')) trace(currNodeId, `in${num}`);
                        else if (currPortId.startsWith('in')) trace(currNodeId, node.type === 'IN-1' ? 'out' : `out${num}`);
                    } else {
                        if (currPortId.startsWith('in')) trace(currNodeId, `out${num}`);
                        else if (currPortId.startsWith('out')) trace(currNodeId, `in${num}`);
                    }
                }
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Trace wire connections to find drivers.
                const adjWires = this._fastWireAdj.get(stepKey) || [];
                adjWires.forEach(w => {
                    if (w.to.nodeId === currNodeId && w.to.portId === currPortId) trace(w.from.nodeId, w.from.portId);
                    else if (w.from.nodeId === currNodeId && w.from.portId === currPortId) trace(w.to.nodeId, w.to.portId);
                });
            };
            trace(startNodeId, startPortId);
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Return the list of drivers for the current wire.
            return Array.from(drivers);
        };
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for topological sorting.
        this.flatNodes.forEach(receiverNode => {
            const isSequential = ['DFF', 'TFF', 'CLOCK'].includes(receiverNode.type);
            if (isSequential) return; // Sequential nodes act as bounds
            const t = receiverNode.type;
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Identify input ports for topological sorting.
            let inputPorts = [];
            if (['NAND', 'AND', 'OR', 'XOR', 'NOR', 'XNOR'].includes(t)) inputPorts = ['a', 'b'];
            else if (t === 'NOT') inputPorts = ['a'];
            else if (t === 'TRISTATE') inputPorts = ['in', 'en'];
            // [AUDIT: v1.25.07 | SEC_ARCH_LEAD] - Injected RAM into Kahn's topological dependency whitelist to resolve instruction out-of-order execution faults.
            else if (t === 'ROM' || t === 'RAM') {
                const pins = receiverNode.addressPins || 4;
                for (let i = 0; i < pins; i++) inputPorts.push(`in${i}`);
                if (t === 'RAM') {
                    for (let i = 0; i < 8; i++) inputPorts.push(`din${i}`);
                    inputPorts.push('we');
                }
            }
            else if (t.startsWith('OUT-') || t.startsWith('PROBE-')) {
                const bits = parseInt(t.split('-')[1]) || 1;
                for (let i = 0; i < bits; i++) inputPorts.push(`in${i}`);
            }
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Trace wire connections to find drivers.
            inputPorts.forEach(port => {
                const drivers = findDriverNodes(receiverNode.id, port);
                drivers.forEach(driverId => {
                    if (driverId !== receiverNode.id && adjList.has(driverId)) {
                        const targets = adjList.get(driverId);
                        if (!targets.has(receiverNode.id)) {
                            targets.add(receiverNode.id);
                            inDegree.set(receiverNode.id, inDegree.get(receiverNode.id) + 1);
                        }
                    }
                });
            });
        });

        let sortedNodes = [];
        let queue = [];
        inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });
        // [AUDIT: v1.24.78 | SEC_ARCH_LEAD] - Execute topological sort utilizing O(1) stack unwinding and constant-time hash map lookups.
        while (queue.length > 0) {
            const u = queue.pop();
            const node = this._fastNodeMap.get(u);
            if (node) sortedNodes.push(node);
            adjList.get(u).forEach(v => {
                inDegree.set(v, inDegree.get(v) - 1);
                if (inDegree.get(v) === 0) queue.push(v);
            });
        }

        // [AUDIT: v1.24.98 | SEC_ARCH_LEAD] - FAS-Optimized SCC Cycle-Breaking via in/out degree ratios.
        let cyclicNodes = this.flatNodes.filter(n => !sortedNodes.some(sn => sn.id === n.id));
        if (cyclicNodes.length > 0) {
            cyclicNodes.sort((a, b) => {
                const degA = (inDegree.get(a.id) || 0) / (adjList.get(a.id)?.size || 1);
                const degB = (inDegree.get(b.id) || 0) / (adjList.get(b.id)?.size || 1);
                return degB - degA;
            });
            sortedNodes.push(...cyclicNodes);
        }

        // Helper to emit instructions into Region B
        const emitNAND = (target, a, b) => {
            const baseIdx = this.REGION_B_OFFSET + (this.instructionCount * 4);
            this.memArray[baseIdx] = target; this.memArray[baseIdx + 1] = a;
            this.memArray[baseIdx + 2] = b; this.memArray[baseIdx + 3] = OP_NAND;
            this.instructionCount++;
        };
        const emitOP = (target, a, b, op) => {
            const baseIdx = this.REGION_B_OFFSET + (this.instructionCount * 4);
            this.memArray[baseIdx] = target; this.memArray[baseIdx + 1] = a;
            this.memArray[baseIdx + 2] = b; this.memArray[baseIdx + 3] = op;
            this.instructionCount++;
        };

        // After _flattenNetlist, every node is either NAND, a sequential gate,
        // or an IO proxy. No compound gate types should appear here.
        sortedNodes.forEach(n => {
            const mapped = this.idMap.get(n.id);
            const t = n.type;
            
            // [AUDIT: v1.25.19 | SEC_ARCH_LEAD] - Eradicated array-exclusion trap that suppressed instruction emission for multi-slot memory and sequential primitives.
            // [AUDIT: v1.25.19 | SEC_ARCH_LEAD] - Eradicated array-exclusion trap that suppressed instruction emission for multi-slot memory and sequential primitives.
            // [AUDIT: v1.25.34 | SEC_ARCH_LEAD] - Purged ROM from Wasm compiler mapping phase.
            if (Array.isArray(mapped) && !(t === 'RAM' || t === 'DFF' || t === 'TFF')) return; 

            // [AUDIT: v1.24.98 | SEC_ARCH_LEAD] - Exclude static input nodes to prevent UI flickering and primitive overwrite.
            if (t.startsWith('IN-') || t === '1') return;

            /**
             * [AUDIT: v1.25.14 | SEC_ARCH_LEAD]
             * @ARCH: WASM_BRIDGE
             * @STATE: OPCODE_DISPATCH
             * @INTENT: Emit Opcode 9 (CONST_0) for Constant Ground primitives to ensure native Wasm execution.
             */
            if (t === '0') {
                const slot = this.getSpecificIdx(n.id, 'out0');
                emitOP(slot, 0, 0, 9);
                return;
            }

            const getA = () => buildBusTree(resolveAllDriverIndices(n.id, 'a'));
            const getB = () => buildBusTree(resolveAllDriverIndices(n.id, 'b'));
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Emit instructions into Region B.
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
            } else if (t === 'ROM' || t === 'RAM') {
                const pins = n.addressPins || 4;
                const addrBase = virtualNodeCount;
                virtualNodeCount += pins;
                for (let i = 0; i < pins; i++) {
                    emitOP(addrBase + i, buildBusTree(resolveAllDriverIndices(n.id, `in${i}`)), 0, OP_BUFFER);
                }
                
                let dataPacking = 0;
                if (t === 'RAM') {
                    const dinBase = virtualNodeCount;
                    // [AUDIT: v1.24.83 | SEC_ARCH_LEAD] - Prevent 24-bit pointer truncation by concatenating WE to the Data-In buffer block (+8).
                    virtualNodeCount += 9;
                    for (let i = 0; i < 8; i++) {
                        emitOP(dinBase + i, buildBusTree(resolveAllDriverIndices(n.id, `din${i}`)), 0, OP_BUFFER);
                    }
                    emitOP(dinBase + 8, buildBusTree(resolveAllDriverIndices(n.id, 'we')), 0, OP_BUFFER);
                    dataPacking = dinBase; // Bypass bit-shifting, Wasm will offset by +8 natively
                }

                const allocSize = 1 << pins;
                if (n.memoryData) {
                    const view = new Uint8Array(this.memory.buffer, 16777216 + currentRomOffset, allocSize);
                    view.set(n.memoryData.slice(0, allocSize)); // Safe truncation/expansion
                }
                
                const addrPacking = addrBase | (pins << 24);
                emitOP(0, currentRomOffset, 0, OP_SET_OFFSET);
                emitOP(mapped[0], addrPacking, dataPacking, t === 'RAM' ? OP_RAM : OP_ROM);
                
                currentRomOffset += allocSize;
            } else if (t === 'DFF' || t === 'CLOCK' || t === 'TRISTATE' || t === 'TFF') {
                let pm = { a: 'a', b: 'b' };
                if (t === 'DFF') { pm.a = 'd'; pm.b = 'clk'; }
                else if (t === 'TFF') { pm.a = 't'; pm.b = 'clk'; }
                else if (t === 'TRISTATE') { pm.a = 'in'; pm.b = 'en'; }
                const inA = buildBusTree(resolveAllDriverIndices(n.id, pm.a));
                const inB = buildBusTree(resolveAllDriverIndices(n.id, pm.b));
                const opMap = { DFF: OP_DFF, CLOCK: OP_CLOCK, TRISTATE: OP_TRISTATE, TFF: OP_TFF };
                // [AUDIT: v1.24.86 | SEC_ARCH_LEAD] - Target array pointer flattening for Sequential targets to prevent NaN corruption in view index.
                emitOP(Array.isArray(mapped) ? mapped[0] : mapped, inA, inB, opMap[t]);
            }
            // IO proxies and JUNCTION nodes produce no instructions — they are
            // transparent pass-through slots in Region A only.
        });

        console.log(`[WasmEngine] Optimized execution graph built with ${this.instructionCount} instructions.`);
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: SYNC_BRIDGE synchronization complete. linear instruction count: ${this.instructionCount}
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm execution step.
     * @IO: KERNEL_STEP
     * @CONSTRAINT: DETERMINISTIC_TICK
     * @INTENT: Trigger a single simulation cycle in the Wasm engine.
     */
    // [AUDIT: v1.24.91 | SEC_ARCH_LEAD] - Expanded signature to support Two-Phase Commit for sequential latching.
    executeTick(evalSeq = 1) {
        if (!this.ready || !this.instance) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Early exit, Wasm engine not ready.
            return;
        }
        this.instance.exports.tick(this.instructionCount, evalSeq);
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wasm tick executed successfully.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for state mutation (Host to Wasm).
     * @STATE: MEMORY_UPDATE
     * @IO: HOST_TO_WASM
     * @INTENT: Write external signal values (user inputs, clocks) into Wasm linear memory.
     */
    writeState(nodeId, value) {
        if (!this.ready) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Early exit, Wasm memory not ready for write.
            return;
        }
        const mapped = this.idMap.get(nodeId);
        if (Array.isArray(mapped)) {
            mapped.forEach((idx, i) => {
                const val = Array.isArray(value) ? value[i] : (i === 0 ? value : 0);
                this.memArray[this.REGION_A_OFFSET + idx] = val !== undefined ? val : 0;
            });
        } else {
            this.memArray[this.REGION_A_OFFSET + mapped] = value;
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Node ${nodeId} state written to Wasm memory.
    },

    /**
     * @IO: SIGNAL_PROBE
     * @INTENT: Read the current logical state of a specific wire from Wasm linear memory.
     */
    readWireState(wireIndex) {
        if (!this.ready || !this.wireIdxMap.has(wireIndex)) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire ${wireIndex} state read failure (unmapped or not ready).
            return null;
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire ${wireIndex} state read success.
        return this.memArray[this.REGION_A_OFFSET + this.wireIdxMap.get(wireIndex)];
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for memory index mapping.
     * @ARCH: MEMORY_MAPPER
     * @INTENT: Map a specific node and port pair to its exact index in the Wasm linear memory buffer.
     */
    getSpecificIdx(id, port) {
        const mapped = this.idMap.get(id);
        if (mapped === undefined) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Mapping failure for ${id}:${port} (id not found).
            return undefined;
        }
        if (Array.isArray(mapped)) {
            if (port === 'q') {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Bit mapping for ${id}:${port} -> index ${mapped[0]} (primary).
                return mapped[0];
            }
            if (port === 'nq') {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Bit mapping for ${id}:${port} -> index ${mapped[1]} (secondary).
                return mapped[1];
            }
            const bit = parseInt(port.replace(/\D/g, '')) || 0;
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Bus bit mapping for ${id}:${port} -> bit ${bit} -> index ${mapped[bit]}.
            return mapped[bit] !== undefined ? mapped[bit] : mapped[0];
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Linear mapping for ${id}:${port} -> index ${mapped}.
        return mapped;
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for state readback.
     * @ARCH: SYNC_BRIDGE
     * @STATE: MEMORY_READBACK
     * @IO: WASM_TO_HOST
     * @INTENT: Retrieve the entire state vector for a node from Wasm linear memory.
     */
    getToggleCount(nodeId) {
        if (!this.ready || !this.memArray) return 0;
        let idx = this.idMap.get(nodeId);
        if (idx === undefined) return 0;
        if (Array.isArray(idx)) idx = idx[0];
        return this.memArray[this.REGION_E_OFFSET + idx] || 0;
    },

    readState(nodeId) {
        if (!this.ready) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Read failure for ${nodeId} (memory not ready).
            return 0;
        }
        const mapped = this.idMap.get(nodeId);
        if (Array.isArray(mapped)) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Vector read success for ${nodeId}.
            return mapped.map(idx => this.memArray[this.REGION_A_OFFSET + idx]);
        } else {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Scalar read success for ${nodeId}.
            return this.memArray[this.REGION_A_OFFSET + mapped];
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for hierarchical pin probing.
     * @IO: SIGNAL_PROBE
     * @ARCH: SYNC_BRIDGE
     * @INTENT: Probe a specific pin state, resolving through hierarchical proxy nodes to find the physical driver.
     */
    readPinState(nodeId, portId) {
        if (!this.ready || !this.memArray) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Pin probe failure for ${nodeId}:${portId} (system offline).
            return null;
        }

        let targetNodeId = nodeId;
        let targetPortId = portId;

        // Boundary resolution for custom chips: map outer port to internal IO node
        if (window.Sim && Sim.nodes.find(n => n.id === nodeId)?.isCustom) {
            const chipNode = Sim.nodes.find(n => n.id === nodeId);
            const lib = Sim.library[chipNode.type];
            if (lib) {
                const isInput = portId.startsWith('in');
                const ioNodes = lib.nodes.filter(x => x.type.startsWith(isInput ? 'IN-' : 'OUT-') || (!isInput && x.type.startsWith('PROBE-')));
                ioNodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
                const targetIdx = parseInt(portId.replace(/\D/g, '')) || 0;
                let currentIdx = 0;
                for (const io of ioNodes) {
                    const bits = parseInt(io.type.split('-')[1]) || 1;
                    if (targetIdx < currentIdx + bits) {
                        const bitOffset = targetIdx - currentIdx;
                        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Restored bit inversion to prevent upside-down 8-bit mapping.
                        const bIdx = bits > 1 ? (bits - 1 - bitOffset) : 0;
                        targetNodeId = `${nodeId}:${io.id}`;
                        targetPortId = isInput ? `in${bIdx}` : `out${bIdx}`;
                        break;
                    }
                    currentIdx += bits;
                }
        }
    }

        // Auto-resolve sterile proxy nodes to their evaluated hardware drivers
        if (this.flatNodes && this.flatWires) {
            const startNode = this._fastNodeMap ? this._fastNodeMap.get(targetNodeId) : this.flatNodes.find(n => n.id === targetNodeId);
            if (startNode && (startNode.type.startsWith('OUT-') || startNode.type.startsWith('PROBE-') || startNode.type === 'JUNCTION')) {
                let visited = new Set();
                const trace = (cId, cPort) => {
                    const key = cId + ':' + cPort;
                    if (visited.has(key)) return null;
                    visited.add(key);

                    const cNode = this._fastNodeMap ? this._fastNodeMap.get(cId) : this.flatNodes.find(n => n.id === cId);
                    if (!cNode) return null;

                    // [AUDIT: v1.24.69 | SEC_ARCH_LEAD] - Corrected Trace Logic to allow hierarchical pin reading from RAM buffers in the host UI.
                    let isDriver = false;
                    if (cNode.type === 'CLOCK' && cPort === 'out0') isDriver = true;
                    // [AUDIT: v1.25.22 | SEC_ARCH_LEAD] - Extended physical driver probing constraints to include '0' primitive.
                    // [AUDIT: v1.25.34 | SEC_ARCH_LEAD] - Excised ROM from physical driver probing array.
                    const NATIVE_GATES = new Set(['NAND', 'DFF', 'TRISTATE', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
                    if (NATIVE_GATES.has(cNode.type) && (cPort === 'out' || cPort === 'out0' || cPort === 'q' || cPort === 'nq' || (cNode.type === 'RAM' && cPort.startsWith('out')))) isDriver = true;
                    if (cNode.type.startsWith('IN-') && !cId.includes(':') && cPort.startsWith('out')) isDriver = true;

                    if (isDriver) return { id: cId, port: cPort };

                    // [AUDIT: v1.23.60 | SEC_ARCH_LEAD] - Handle junction and multi-bit proxy port unwinding.
                    if (cNode.type.startsWith('IN-') || cNode.type.startsWith('OUT-') || cNode.type.startsWith('PROBE-') || cNode.type === 'JUNCTION') {
                        if (cNode.type === 'JUNCTION') {
                            const nxt = trace(cId, 'j');
                            if (nxt) return nxt;
                        } else {
                            const isInputProxy = cNode.type.startsWith('IN-');
                            const num = cPort.replace(/\D/g, '') || '0';
                            if (isInputProxy) {
                                if (cPort.startsWith('out')) {
                                    const nxt = trace(cId, `in${num}`);
                                    if (nxt) return nxt;
                                } else if (cPort.startsWith('in')) {
                                    const nxt = trace(cId, cNode.type === 'IN-1' ? 'out' : `out${num}`);
                                    if (nxt) return nxt;
                                }
                            } else {
                                if (cPort.startsWith('out')) {
                                    const nxt = trace(cId, `in${num}`);
                                    if (nxt) return nxt;
                                } else if (cPort.startsWith('in')) {
                                    const nxt = trace(cId, `out${num}`);
                                    if (nxt) return nxt;
                                }
                            }
                        }
                    }

                    const adjWires = this._fastWireAdj ? (this._fastWireAdj.get(key) || []) : this.flatWires.filter(w => (w.to.nodeId === cId && w.to.portId === cPort) || (w.from.nodeId === cId && w.from.portId === cPort));
                    for (let w of adjWires) {
                        if (w.to.nodeId === cId && w.to.portId === cPort) {
                            const nxt = trace(w.from.nodeId, w.from.portId);
                            if (nxt) return nxt;
                        } else if (w.from.nodeId === cId && w.from.portId === cPort) {
                            const nxt = trace(w.to.nodeId, w.to.portId);
                            if (nxt) return nxt;
                        }
                    }
                    return null;
                };

                const startPort = targetPortId.startsWith('out') ? `in${targetPortId.replace(/\D/g, '') || '0'}` : targetPortId;
                const drv = trace(targetNodeId, startPort);
                if (drv) {
                    targetNodeId = drv.id;
                    targetPortId = drv.port;
                } else {
                    // Force ground (0) on unconnected sterile pins to prevent parity drift
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Unconnected sterile pin detected at ${targetNodeId}:${targetPortId}. Grounded to 0.
                    return 0;
                }
            }
        }

        let idx = this.getSpecificIdx(targetNodeId, targetPortId);
        if (idx === undefined) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Pin probe failed for ${targetNodeId}:${targetPortId} (resolution failed).
            return null;
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Enforce REGION_A_OFFSET mapping to prevent layout boundary circumvention.
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: SYNC_BRIDGE pin probe success. Mapped bit-index: ${idx}. Relation: [Resolved: ${targetNodeId}:${targetPortId} from original ${nodeId}:${portId}].
        return this.memArray[this.REGION_A_OFFSET + idx];
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for memory map extraction.
     * @ARCH: DIAGNOSTIC_TOOL
     * @IO: CONSOLE_EXPORT
     * @INTENT: Generate and display a structured map of the Wasm linear memory allocation for all flattened nodes.
     */
    /**
     * [AUDIT: v1.24.90 | SEC_ARCH_LEAD] - Entry trace for reverse memory synchronization.
     * @ARCH: MEMORY_SYNC
     * @INTENT: Extract volatile RAM payloads from Wasm Region C back to JS host objects to preserve state during AutoSave.
     */
    syncMemoryToHost(rootNodes) {
        if (!this.ready || !this.memArray || !this.flatNodes) return;
        
        // Traverse the hierarchical namespace mapping (macro:macro:node) to find the JS instance
        const resolveInstanceNode = (flatId) => {
            const parts = flatId.split(':');
            let current = rootNodes.find(n => n.id === parts[0]);
            if (!current) return null;
            for (let i = 1; i < parts.length; i++) {
                if (!current.meta) return null;
                current = current.meta.nodes.find(n => n.id === parts[i]);
                if (!current) return null;
            }
            return current;
        };

        let currentRomOffset = 0;
        this.flatNodes.forEach(fn => {
            if (fn.type === 'ROM' || fn.type === 'RAM') {
                const pins = fn.addressPins || 4;
                const allocSize = 1 << pins;
                if (fn.type === 'RAM') {
                    const hostNode = resolveInstanceNode(fn.id);
                    if (hostNode) {
                        const view = new Uint8Array(this.memory.buffer, 16777216 + currentRomOffset, allocSize);
                        if (!hostNode.memoryData || hostNode.memoryData.length !== allocSize) hostNode.memoryData = new Array(allocSize).fill(0);
                        for(let i = 0; i < allocSize; i++) hostNode.memoryData[i] = view[i];
                    }
                }
                currentRomOffset += allocSize;
            }
        });
    },

    exportMemoryMap() {
        console.group("WASM LINEAR MEMORY MAP (v1.24.90)");
        console.log("Region A (States) Offset: 0");
        console.log("Region B (Instructions) Offset: 1048576 (byte)");
        console.log("Region C (ROM Payloads) Offset: 16777216 (byte)");

        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Align diagnostic export with true Engine.wat physical memory layout, removing metadata phantom mapping.
        const map = this.flatNodes.map((node) => {
            const mapped = this.idMap.get(node.id);
            const isArray = Array.isArray(mapped);
            return {
                id: node.id,
                type: node.type,
                regionA_Idx: isArray ? mapped : [mapped]
            };
        });

        console.table(map);
        console.groupEnd();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Memory map exported to console.
        return map;
    }
};

export default WasmEngine;
