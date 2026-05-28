const WasmEngine = {
    ready: false,
    useWorker: false,
    worker: null,
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
    initLog: [],

    log(msg, type = 'info') {
        const timestamp = new Date().toISOString();
        this.initLog.push({ timestamp, msg, type });
        const prefix = `[WasmEngine] ${msg}`;
        if (type === 'error') console.error(prefix);
        else if (type === 'warn') console.warn(prefix);
        else console.log(prefix);
    },

    avgWorkerTickDuration: 0,
    workerTickCount: 0,
    lastTickDuration: 0,

    pingWorker() {
        if (!this.useWorker || !this.worker) return Promise.reject("Worker not active");
        return new Promise((resolve) => {
            const start = performance.now();
            const callback = (e) => {
                if (e.data.action === 'pong') {
                    this.worker.removeEventListener('message', callback);
                    const latency = performance.now() - start;
                    resolve(latency);
                }
            };
            this.worker.addEventListener('message', callback);
            this.worker.postMessage({ action: 'ping' });
        });
    },



    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm kernel initialization.
     */
    async init() {
        this.log("Starting WebAssembly core initialization...");
        
        // Audit environment metrics
        const sabSupported = typeof SharedArrayBuffer !== 'undefined';
        const coIsolated = window.crossOriginIsolated ?? false;
        this.log(`Environment: SharedArrayBuffer support = ${sabSupported ? 'YES' : 'NO'}`);
        this.log(`Environment: Cross-Origin Isolation (COOP/COEP) = ${coIsolated ? 'YES' : 'NO'}`);

        let useShared = false;
        let wasmUrl = 'js/wasm-bin/engine.wasm';

        if (sabSupported) {
            try {
                this.log("Attempting to allocate WebAssembly.Memory with shared: true...");
                this.memory = new WebAssembly.Memory({
                    initial: 512, // 32MB baseline
                    maximum: 2048, // 128MB ceiling
                    shared: true
                });
                useShared = true;
                wasmUrl = 'js/wasm-bin/engine_shared.wasm';
                this.log("Successfully allocated WebAssembly.Memory (shared mode). Target binary: engine_shared.wasm");
            } catch (e) {
                this.log("Shared WebAssembly.Memory allocation failed (missing headers or unsupported browser). Falling back to non-shared memory.", "warn");
            }
        } else {
            this.log("SharedArrayBuffer is not supported. Skipping shared memory allocation.");
        }

        if (!useShared) {
            this.log("Allocating standard WebAssembly.Memory (non-shared mode). Target binary: engine.wasm");
            this.memory = new WebAssembly.Memory({
                initial: 512,
                maximum: 2048,
                shared: false
            });
        }

        const tryInstantiate = async (url) => {
            this.log(`Fetching WebAssembly binary from ${url}...`);
            const response = await fetch(url);
            if (!response.ok) {
                const errText = `HTTP ${response.status}: Failed to fetch WebAssembly binary from ${url}`;
                this.log(errText, "error");
                throw new Error(errText);
            }
            this.log(`Fetch succeeded (${response.headers.get('Content-Length') || 'unknown'} bytes). Reading buffer...`);
            const bytes = await response.arrayBuffer();

            this.log("Compiling and instantiating WebAssembly binary...");
            const { instance } = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: this.memory,
                    SHADOW_BASE: 196608,
                    PREV_CLK_BASE: 131072,
                    NQ_BASE: 65536
                }
            });
            this.log("WebAssembly instantiation succeeded.");
            return { instance, bytes };
        };

        try {
            let instance, bytes;
            if (useShared) {
                try {
                    const res = await tryInstantiate(wasmUrl);
                    instance = res.instance;
                    bytes = res.bytes;
                } catch (err) {
                    this.log(`Shared WebAssembly instantiation failed: ${err.message}. Gracefully falling back to legacy single-threaded mode...`, "warn");
                    useShared = false;
                    wasmUrl = 'js/wasm-bin/engine.wasm';
                    this.memory = new WebAssembly.Memory({
                        initial: 512,
                        maximum: 2048,
                        shared: false
                    });
                    const res = await tryInstantiate(wasmUrl);
                    instance = res.instance;
                    bytes = res.bytes;
                }
            } else {
                const res = await tryInstantiate(wasmUrl);
                instance = res.instance;
                bytes = res.bytes;
            }

            this.instance = instance;
            this.memArray = new Int32Array(this.memory.buffer);
            this.useWorker = useShared;

            if (this.useWorker) {
                this.log("Launching background simulation thread via WebWorker (sim_worker.js)...");
                this.worker = new Worker('js/modules/sim_worker.js');
                
                const triggerFallback = async (reason) => {
                    this.log(`Background WebWorker failed: ${reason}. Initiating recovery and falling back to single-threaded main thread mode...`, "warn");
                    if (this.worker) {
                        this.worker.terminate();
                        this.worker = null;
                    }
                    this.useWorker = false;
                    
                    try {
                        const fallbackUrl = 'js/wasm-bin/engine.wasm';
                        this.log("Allocating non-shared WebAssembly.Memory for main-thread recovery...");
                        this.memory = new WebAssembly.Memory({
                            initial: 512,
                            maximum: 2048,
                            shared: false
                        });
                        
                        const res = await tryInstantiate(fallbackUrl);
                        this.instance = res.instance;
                        this.memArray = new Int32Array(this.memory.buffer);
                        
                        this.ready = true;
                        this.log("Core successfully recovered and initialized (Single-Threaded Mode). ready = true.");
                        if (window.Sim) {
                            Sim.seedQueue();
                            Sim.processQueue();
                            Sim.updateHUD();
                        }
                    } catch (fallbackErr) {
                        this.log(`WebWorker fallback recovery failed completely: ${fallbackErr.message}`, "error");
                    }
                };

                this.worker.onmessage = async (e) => {
                    if (e.data.action === 'ready') {
                        this.ready = true;
                        this.log("Core initialized successfully (WebWorker Mode). ready = true.");
                        if (window.Sim) {
                            Sim.seedQueue();
                            Sim.processQueue();
                            Sim.updateHUD();
                        }
                    } else if (e.data.action === 'telemetry') {
                        this.avgWorkerTickDuration = e.data.avgTickDuration;
                        this.workerTickCount = e.data.tickCount;
                        if (this.avgWorkerTickDuration > 16) {
                            this.log(`Worker slow tick warning: average pass took ${this.avgWorkerTickDuration.toFixed(2)}ms`, "warn");
                        }
                    } else if (e.data.action === 'error') {
                        await triggerFallback(e.data.error);
                    }
                };

                this.worker.onerror = async (err) => {
                    err.preventDefault(); // Prevent duplicate console error dumps
                    await triggerFallback(err.message || "Failed to load/execute worker script (check CORS, CSP or 404)");
                };
                
                this.log("Sending initialization payload (wasm bytes + shared memory buffer) to worker thread...");
                this.worker.postMessage({
                    action: 'init',
                    wasmBytes: bytes,
                    memory: this.memory
                });
            } else {
                this.ready = true;
                this.log("Core initialized successfully (Single-Threaded Mode). ready = true.");
                if (window.Sim) {
                    Sim.seedQueue();
                    Sim.processQueue();
                    Sim.updateHUD();
                }
            }
        } catch (e) {
            this.log(`WebAssembly core initialization failed completely: ${e.message}`, "error");
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for netlist expansion and hierarchical flattening.
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
                    const flip = window.Sim && window.Sim.flipPinLogic;
                    const bIdx = (bits > 1 && flip) ? (bits - 1 - bitOffset) : bitOffset;
                    return { nodeId: `${gid}:${io.id}`, portId: isInput ? `in${bIdx}` : `out${bIdx}` };
                }
                currentIdx += bits;
            }
            return null;
        };

        // Only expand nodes that are in Sim.library and not kernel primitives / IO
        const resolveLib = (n) => {
            if (n.type.startsWith('IN-') || n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) return null;
            if (KERNEL.has(n.type) && !n.isCustom) return null;
            if (window.Sim && Sim.library && Sim.library[n.type]) return Sim.library[n.type];
            return null; // unknown type — leave as-is; isPureNative check will gate WASM use
        };

        nodes.forEach(n => {
            const gid = prefix ? `${prefix}:${n.id}` : n.id;
            const lib = resolveLib(n);
            if (lib) {
                if (!lib._flatCache) {
                    lib._flatCache = this._flattenNetlist(lib.nodes, lib.wires, "");
                }
                const instNodes = lib._flatCache.nodes.map(cn => {
                    const cloned = JSON.parse(JSON.stringify(cn));
                    cloned.id = gid ? `${gid}:${cloned.id}` : cloned.id;
                    return cloned;
                });
                const instWires = lib._flatCache.wires.map(cw => ({
                    from: {
                        nodeId: gid ? `${gid}:${cw.from.nodeId}` : cw.from.nodeId,
                        portId: cw.from.portId
                    },
                    to: {
                        nodeId: gid ? `${gid}:${cw.to.nodeId}` : cw.to.nodeId,
                        portId: cw.to.portId
                    }
                }));
                fNodes.push(...instNodes);
                fWires.push(...instWires);
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

        return { nodes: fNodes, wires: fWires };
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm linear memory synchronization and instruction assembly.
     */
    syncLayout(nodes, wires) {
        if (!this.ready) {
            return;
        }
        this._trapLogged = false; // Reset trap-logged flag for fresh netlist
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
        let memPayloadSize = 0;
        this.flatNodes.forEach(n => {
            if (n.type === 'RAM') memPayloadSize += (1 << (n.addressPins || 4));
        });
        // [AUDIT: v1.24.94 | SEC_ARCH_LEAD] - Shifted allocation baseline to 24MB to encompass Region E power analysis buffers and prevent OOB traps.
        const requiredBytes = 25165824 + (this.flatNodes.length * 256) + memPayloadSize;
        const requiredPages = Math.ceil(requiredBytes / 65536);
        const currentPages = this.memory.buffer.byteLength / 65536;

        if (requiredPages > currentPages) {
            // [AUDIT: v1.25.43 | SEC_ARCH_LEAD] - Enforced hard allocation ceiling on Wasm memory expansion to avert host heap exhaustion traps.
            const expansion = requiredPages - currentPages;
            if (currentPages + expansion > 2048) throw new Error("Wasm Linear Memory allocation exceeds 128MB strict limit.");
            this.memory.grow(expansion);
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
            } else if (n.type === 'RAM' || n.type === 'ROM') {
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
        const OP_BUFFER = 6; const OP_RAM = 7; const OP_SET_OFFSET = 8;
        const OP_BUS_RESOLVE = 11;

        let virtualNodeCount = slot + 10;
        let currentRomOffset = 0;
        /**
         * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for logical driver resolution.
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
            if (fromNode && (fromNode.isCustom || Sim.library[fromNode.type])) {
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
                            const flip = window.Sim && window.Sim.flipPinLogic;
                            const bIdx = (bits > 1 && flip) ? (bits - 1 - bitOffset) : bitOffset;
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
            else if (t === 'RAM') {
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
            } else if (t === 'RAM') {
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

                // Initialize RAM data
                const allocSize = 1 << pins;
                n._romOffset = currentRomOffset;
                if (n.memoryData) {
                    const view = new Uint8Array(this.memArray.buffer, this.REGION_C_OFFSET * 4 + currentRomOffset, allocSize);
                    view.set(n.memoryData.slice(0, allocSize)); // Safe truncation/expansion
                }
                
                const addrPacking = addrBase | (pins << 24);
                emitOP(0, currentRomOffset, 0, OP_SET_OFFSET);
                emitOP(mapped[0], addrPacking, dataPacking, OP_RAM);
                
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
        
        if (this.useWorker && this.worker) {
            const execDepth = Math.max(20, this.flatNodes.length);
            this.worker.postMessage({
                action: 'graph_built',
                instructionCount: this.instructionCount,
                execDepth: execDepth
            });
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for Wasm execution step.
     */
    // [AUDIT: v1.24.91 | SEC_ARCH_LEAD] - Expanded signature to support Two-Phase Commit for sequential latching.
    executeTick(evalSeq = 1) {
        if (!this.ready || !this.instance) {
            return;
        }
        
        // Prevent ticking if simulation is halted by an active assertion breakpoint
        if (window.DebugTerminal && DebugTerminal._halted) {
            return;
        }

        const start = performance.now();
        try {
            this.instance.exports.tick(this.instructionCount, evalSeq);
        } catch (e) {
            // Trap (e.g. unreachable) — log once, don't crash the sim loop.
            if (!this._trapLogged) {
                console.error('[WasmEngine] Runtime trap during tick():', e.message);
                this._trapLogged = true;
            }
        }
        const duration = performance.now() - start;
        this.lastTickDuration = duration;
        if (duration > 16) {
            this.log(`Slow tick warning: frame took ${duration.toFixed(2)}ms (ceiling: 16ms)`, "warn");
        }

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
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for state mutation (Host to Wasm).
     */
    writeState(nodeId, value) {
        if (!this.ready) {
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
    },

    /**
     */
    readWireState(wireIndex) {
        if (!this.ready || !this.wireIdxMap.has(wireIndex)) {
            return null;
        }
        return this.memArray[this.REGION_A_OFFSET + this.wireIdxMap.get(wireIndex)];
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for memory index mapping.
     */
    getSpecificIdx(id, port) {
        const mapped = this.idMap.get(id);
        if (mapped === undefined) {
            return undefined;
        }
        if (Array.isArray(mapped)) {
            if (port === 'q') {
                return mapped[0];
            }
            if (port === 'nq') {
                return mapped[1];
            }
            const bit = parseInt(port.replace(/\D/g, '')) || 0;
            return mapped[bit] !== undefined ? mapped[bit] : mapped[0];
        }
        return mapped;
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for state readback.
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
            return 0;
        }
        const mapped = this.idMap.get(nodeId);
        if (Array.isArray(mapped)) {
            return mapped.map(idx => this.memArray[this.REGION_A_OFFSET + idx]);
        } else {
            return this.memArray[this.REGION_A_OFFSET + mapped];
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for hierarchical pin probing.
     */
    readPinState(nodeId, portId) {
        if (!this.ready || !this.memArray) {
            return null;
        }

        let targetNodeId = nodeId;
        let targetPortId = portId;

        // Boundary resolution for custom chips: map outer port to internal IO node
        const chipNode = window.Sim ? Sim.nodes.find(n => n.id === nodeId) : null;
        // [AUDIT: v1.25.43 | SEC_ARCH_LEAD] - Consolidated redundant array traversal for custom chip boundary resolution.
        if (chipNode && (chipNode.isCustom || (Sim.library && Sim.library[chipNode.type]))) {
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
                        const flip = window.Sim && window.Sim.flipPinLogic;
                        const bIdx = (bits > 1 && flip) ? (bits - 1 - bitOffset) : bitOffset;
                        targetNodeId = `${nodeId}:${io.id}`;
                        targetPortId = isInput ? `in${bIdx}` : `out${bIdx}`;
                        break;
                    }
                    currentIdx += bits;
                }
            }
        }
        // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Rectified asymmetric scope termination brackets to eliminate dead-code anomalies in hierarchical memory extraction.

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
                    return 0;
                }
            }
        }

        let idx = this.getSpecificIdx(targetNodeId, targetPortId);
        if (idx === undefined) {
            return null;
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Enforce REGION_A_OFFSET mapping to prevent layout boundary circumvention.
        return this.memArray[this.REGION_A_OFFSET + idx];
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for memory map extraction.
     */
    /**
     * [AUDIT: v1.24.90 | SEC_ARCH_LEAD] - Entry trace for reverse memory synchronization.
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

        this.flatNodes.forEach(fn => {
            if (fn.type === 'RAM') {
                const pins = fn.addressPins || 4;
                const allocSize = 1 << pins;
                const hostNode = resolveInstanceNode(fn.id);
                if (hostNode && fn._romOffset !== undefined) {
                    const view = new Uint8Array(this.memory.buffer, 16777216 + fn._romOffset, allocSize);
                    if (!hostNode.memoryData || hostNode.memoryData.length !== allocSize) hostNode.memoryData = new Array(allocSize).fill(0);
                    for(let i = 0; i < allocSize; i++) hostNode.memoryData[i] = view[i];
                }
            }
        });
    },

    exportMemoryMap() {
        console.group("WASM LINEAR MEMORY MAP (v1.24.90)");
        console.log("Region A (States) Offset: 0");
        console.log("Region B (Instructions) Offset: 1048576 (byte)");
        console.log("Region C (RAM Payloads) Offset: 16777216 (byte)");

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
        return map;
    }
};

export default WasmEngine;
