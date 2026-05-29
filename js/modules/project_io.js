/**
 * Project Persistence Module
 */
const _getProjectStorage = () => (window.location.search.includes('chip') || window.self !== window.top) ? sessionStorage : localStorage;

const ProjectManager = {
    MigrationEngine: {
        /**
         * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for semantic version parsing.
         */
        parseVer(vStr) {
            if (!vStr) {
                return 0;
            }
            const m = vStr.match(/v?(\d+)\.(\d+)\.(\d+)/);
            if (!m) {
                return 0;
            }
            return parseInt(m[1]) * 1000000 + parseInt(m[2]) * 1000 + parseInt(m[3]);
        },
        detectEpoch(data) {
            if (!data) return "legacy";
            if (data.tabs && data.tabs.length > 0) return "modern";
            if (data.prefs && (data.prefs.flipPinLogic !== undefined || data.prefs.uiScale !== undefined)) return "modern";
            
            const checkNodes = (nodes) => {
                if (!Array.isArray(nodes)) return false;
                for (const n of nodes) {
                    if (!n) continue;
                    if (n.customWidth !== undefined || n.customHeight !== undefined || n.flipPolarity !== undefined) {
                        return true;
                    }
                }
                return false;
            };
            if (checkNodes(data.nodes)) return "modern";
            if (data.workspaceStack && data.workspaceStack.some(ws => checkNodes(ws.nodes))) return "modern";
            if (data.library && Object.values(data.library).some(lib => checkNodes(lib.nodes))) return "modern";

            const checkWires = (wires, nodes) => {
                if (!Array.isArray(wires) || !Array.isArray(nodes)) return false;
                for (const w of wires) {
                    if (!w) continue;
                    const eps = [w.from, w.to];
                    for (const ep of eps) {
                        if (!ep) continue;
                        const cNode = nodes.find(n => n.id === ep.nodeId);
                        if (!cNode) continue;
                        if (['AND', 'OR', 'NOR', 'XOR', 'XNOR', 'NAND', 'NOT'].includes(cNode.type)) {
                            if (['a', 'b', 'q'].includes(ep.portId)) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            };
            if (checkWires(data.wires, data.nodes)) return "modern";
            if (data.workspaceStack) {
                for (const ws of data.workspaceStack) {
                    if (checkWires(ws.wires, ws.nodes)) return "modern";
                }
            }
            if (data.library) {
                for (const lib of Object.values(data.library)) {
                    if (lib && checkWires(lib.wires, lib.nodes)) return "modern";
                }
            }
            return "legacy";
        },
        /**
         */
        migrate(data) {
            if (!data) {
                return data;
            }
            
            // Port legacy ROM primitives to standard RAM
            const portRomToRam = (nodes) => {
                if (!Array.isArray(nodes)) return;
                nodes.forEach(n => {
                    if (n.type === 'ROM') {
                        n.type = 'RAM';
                        if (n.addressPins === undefined) n.addressPins = 4;
                        if (n.dataUrl === undefined) n.dataUrl = '';
                        if (n.memoryData === undefined) {
                            n.memoryData = Array.from(new Uint8Array(1 << n.addressPins));
                        }
                    }
                });
            };
            if (data.nodes) portRomToRam(data.nodes);
            if (data.workspaceStack) data.workspaceStack.forEach(ws => portRomToRam(ws.nodes));
            if (data.tabs) data.tabs.forEach(t => portRomToRam(t.nodes));
            if (data.library) Object.values(data.library).forEach(lib => portRomToRam(lib.nodes));

            let fileVerStr = data.meta?.version;
            if (!fileVerStr) {
                const epoch = this.detectEpoch(data);
                fileVerStr = epoch === "modern" ? (window.LOADED_BSIM_VERSION || "1.27.27") : "1.0.0";
                console.log(`[Migration] Missing version metadata. Detected epoch: ${epoch}. Assigning virtual version: ${fileVerStr}`);
            }
            const fileVer = this.parseVer(fileVerStr);


            // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Updated fallback runtime expectation string to enforce new migration baseline.
            const currentVer = this.parseVer(window.EXPECTED_BSIM_VERSION || "1.24.00");

            if (fileVer < currentVer) console.log(`[Migration] Upgrading schema from ${data.meta?.version} to ${window.EXPECTED_BSIM_VERSION}`);

            this.standardize(data);

            // [Migration 1.27.00] - Reverse LSB/MSB pin physical ordering.
            // Old version had MSB at top. New version has LSB at top.
            // To preserve physical wiring, we must invert the bit index of all wires connected to native bus pins.
            if (fileVer < this.parseVer("1.27.00")) {
                const fixBusWiring = (wires, nodes) => {
                    if (!wires || !nodes) return;
                    wires.forEach(w => {
                        [{ ep: w.from, isIn: false }, { ep: w.to, isIn: true }].forEach(({ ep, isIn }) => {
                            const cNode = nodes.find(n => n.id === ep.nodeId);
                            if (!cNode) return;
                            
                            if (cNode.type.startsWith('IN-') || cNode.type.startsWith('OUT-') || cNode.type.startsWith('PROBE-')) {
                                const bits = parseInt(cNode.type.split('-')[1]) || 1;
                                if (bits > 1) {
                                    const match = ep.portId.match(/^(in|out)(\d+)$/);
                                    if (match) {
                                        const idx = parseInt(match[2]);
                                        ep.portId = `${match[1]}${bits - 1 - idx}`;
                                    }
                                }
                            } else if (cNode.type === 'RAM') {
                                const aBits = cNode.addressPins || 4;
                                const dBits = 8;
                                const match = ep.portId.match(/^(in|out|din)(\d+)$/);
                                if (match) {
                                    const prefix = match[1];
                                    const idx = parseInt(match[2]);
                                    if (prefix === 'in') {
                                        ep.portId = `in${aBits - 1 - idx}`;
                                    } else {
                                        ep.portId = `${prefix}${dBits - 1 - idx}`;
                                    }
                                }
                            }
                        });
                    });
                };
                
                fixBusWiring(data.wires, data.nodes);
                if (data.tabs) data.tabs.forEach(t => fixBusWiring(t.wires, t.nodes));
                if (data.library) {
                    Object.values(data.library).forEach(lib => fixBusWiring(lib.wires, lib.nodes));
                }
            }

            // --- GLOBAL DEEP PORT MIGRATION (Fixes nested Custom Chips) ---
            const NATIVE = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
            const fixNetlist = (wires, nodes) => {
                if (!wires || !nodes) return;
                wires.forEach(w => {
                    [{ ep: w.from, isIn: false }, { ep: w.to, isIn: true }].forEach(({ ep, isIn }) => {
                        const cNode = nodes.find(n => n.id === ep.nodeId);
                        if (!cNode) return;

                        if (NATIVE.has(cNode.type)) {
                            const t = cNode.type;
                            if (isIn) {
                                if (t === 'NOT' && (ep.portId === 'in0' || ep.portId === 'in')) ep.portId = 'a';
                                else if (['AND', 'OR', 'NOR', 'XOR', 'XNOR', 'NAND'].includes(t)) {
                                    if (ep.portId === 'in0' || ep.portId === 'in') ep.portId = 'a';
                                    if (ep.portId === 'in1') ep.portId = 'b';
                                } else if (['IN-1', 'OUT-1', 'PROBE-1', 'CLOCK'].includes(t)) {
                                    if (ep.portId === 'in') ep.portId = 'in0';
                                }
                            } else {
                                if (['NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'NAND'].includes(t)) {
                                    // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Reverted native gate output mapping to strictly target DOM property 'q'.
                                    if (ep.portId === 'out0' || ep.portId === 'out') ep.portId = 'q';
                                } else if (['IN-1', 'OUT-1', 'PROBE-1', 'CLOCK'].includes(t)) {
                                    if (ep.portId === 'out') ep.portId = 'out0';
                                }
                            }
                            return;
                        }

                        if (cNode.isCustom && data.library && data.library[cNode.type]) {
                            const lib = data.library[cNode.type];
                            const ioNodes = lib.nodes.filter(x => x.type.startsWith(isIn ? 'IN-' : 'OUT-') || (isIn && x.type.startsWith('PROBE-')));
                            // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Apply secondary X-axis sorting to match DOM rendering parity.
                            ioNodes.sort((a, b) => (a.y - b.y) || (a.x - b.x));

                            const bPref = isIn ? 'in' : 'out';
                            let totalBits = 0;
                            ioNodes.forEach(n => totalBits += (parseInt(n.type.split('-')[1]) || 1));

                            // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Skip migration if port is already a valid continuous bit index.
                            const portMatch = ep.portId ? ep.portId.match(new RegExp(`^${bPref}(\\d+)$`)) : null;
                            if (portMatch) {
                                const pIdx = parseInt(portMatch[1]);
                                if (pIdx >= 0 && pIdx < totalBits) return;
                            }

                            let bitIdx = 0;
                            for (let i = 0; i < ioNodes.length; i++) {
                                const io = ioNodes[i];
                                if (io.id === ep.portId || (io.label && io.label.toLowerCase() === (ep.portId || '').toLowerCase()) || ep.portId === `${bPref}${bitIdx}`) {
                                    ep.portId = `${bPref}${bitIdx}`; return;
                                }
                                const bits = parseInt(io.type.split('-')[1]) || 1;
                                if (isIn) {
                                    if ((ep.portId === 'a' || ep.portId === 'in') && i === 0) { ep.portId = `${bPref}${bitIdx}`; return; }
                                    if ((ep.portId === 'b' || ep.portId === 'nq') && i === 1) { ep.portId = `${bPref}${bitIdx}`; return; }
                                } else {
                                    if ((ep.portId === 'q' || ep.portId === 'out') && i === 0) { ep.portId = `${bPref}${bitIdx}`; return; }
                                    if (ep.portId === 'nq' && i === 1) { ep.portId = `${bPref}${bitIdx}`; return; }
                                }
                                bitIdx += bits;
                            }
                            if (ioNodes.length > 0 && !ep.portId.startsWith(bPref)) ep.portId = `${bPref}0`;
                        }
                    });
                });
            };
            fixNetlist(data.wires, data.nodes);
            if (data.library) Object.values(data.library).forEach(chip => fixNetlist(chip.wires, chip.nodes));

            if (!data.meta) data.meta = {};
            data.meta.version = (window.EXPECTED_BSIM_VERSION || "1.24.00") + "-Modular";
            return data;
        },
        /**
         */
        remapPorts(data, type, map) {
            const rw = (wires, nodes) => {
                const tIds = new Set(nodes.filter(n => n.type === type).map(n => n.id));
                wires.forEach(w => {
                    if (tIds.has(w.from.nodeId) && map[w.from.portId]) w.from.portId = map[w.from.portId];
                    if (tIds.has(w.to.nodeId) && map[w.to.portId]) w.to.portId = map[w.to.portId];
                });
            };
            if (data.nodes && data.wires) rw(data.wires, data.nodes);
            if (data.library) {
                Object.values(data.library).forEach(c => {
                    if (c.nodes && c.wires) rw(c.wires, c.nodes);
                });
            }
        },
        /**
         */
        standardize(data) {
            const NATIVE = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'RAM', '0']);
            const p = (nodes) => {
                if (!Array.isArray(nodes)) return;
                for (let i = nodes.length - 1; i >= 0; i--) {
                    const n = nodes[i];
                    if (!n || !n.type) { nodes.splice(i, 1); continue; }

                    // Legacy Object Purge (Fixes old custom chip saves like brianx.bsim)
                    if (typeof n.val === 'object' && !Array.isArray(n.val) && n.val !== null) n.val = 0;
                    if (typeof n.state === 'object' && !Array.isArray(n.state) && n.state !== null) n.state = 0;

                    const bits = parseInt(n.type.split('-')[1]) || 1;
                    if (bits === 1) {
                        if (Array.isArray(n.val)) n.val = n.val[0] ?? 0;
                        if (Array.isArray(n.state)) n.state = n.state[0] ?? 0;
                    } else {
                        if (!Array.isArray(n.val)) n.val = new Array(bits).fill(n.val || 0);
                        if (!Array.isArray(n.state)) n.state = new Array(bits).fill(n.state || 0);
                    }

                    if (NATIVE.has(n.type)) n.isCustom = false;
                    else if (data.library && data.library[n.type]) n.isCustom = true;
                    if (n.type === 'CLOCK') {
                        if (n.freq === undefined) n.freq = 1;
                        if (n.interval === undefined) n.interval = 1000 / n.freq;
                        n.lastTick = performance.now();
                    }
                    if (!n.outputs) n.outputs = {};
                    n._oscillating = false;
                }
            };
            const findNodeById = (id) => {
                if (data.nodes) { const n = data.nodes.find(x => x.id === id); if (n) return n; }
                if (data.workspaceStack) {
                    for (const ws of data.workspaceStack) {
                        const n = ws.nodes.find(x => x.id === id); if (n) return n;
                    }
                }
                if (data.library) {
                    for (const c of Object.values(data.library)) {
                        if (c.nodes) { const n = c.nodes.find(x => x.id === id); if (n) return n; }
                    }
                }
                return null;
            };

            const wClean = (wires) => {
                if (!Array.isArray(wires)) return;
                for (let i = wires.length - 1; i >= 0; i--) {
                    const w = wires[i];
                    if (!w || !w.from || !w.to) { wires.splice(i, 1); continue; }
                    if (w.midX === null || isNaN(w.midX) || typeof w.midX !== 'number') delete w.midX;
                    if (w.midY === null || isNaN(w.midY) || typeof w.midY !== 'number') delete w.midY;

                    // Port migration deferred to global multi-depth pass
                }
            };
            if (data.nodes) p(data.nodes);
            if (data.wires) wClean(data.wires);
            if (data.library) Object.values(data.library).forEach(c => {
                if (c.nodes) p(c.nodes);
                if (c.wires) wClean(c.wires);
            });
            if (data.workspaceStack) {
                data.workspaceStack.forEach(ws => {
                    if (ws.nodes) p(ws.nodes);
                    if (ws.wires) wClean(ws.wires);
                });
            }
        }
    },

    /**
     */
    sanitizeString(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    },

    isUrlSecure(url) {
        try {
            const parsedUrl = new URL(url, window.location.href);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                console.error("Rejected insecure payload protocol:", parsedUrl.protocol);
                return false;
            }
            if (parsedUrl.protocol === 'http:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
                console.error("HTTP payloads are restricted to localhost for development security.");
                return false;
            }
            return true;
        } catch (e) {
            console.error("Invalid payload URL:", url);
            return false;
        }
    },

    sanitizeNode(n) {
        if (!n || typeof n !== 'object') return null;
        return {
            id: String(n.id),
            type: String(n.type),
            x: Number(n.x) || 0,
            y: Number(n.y) || 0,
            label: typeof n.label === 'string' ? this.sanitizeString(n.label) : null,
            val: n.val,
            state: n.state,
            isCustom: !!n.isCustom,
            freq: n.freq !== undefined ? Number(n.freq) : undefined,
            interval: n.interval !== undefined ? Number(n.interval) : undefined,
            lastTick: n.lastTick !== undefined ? Number(n.lastTick) : undefined,
            customWidth: n.customWidth !== undefined ? Number(n.customWidth) : undefined,
            customHeight: n.customHeight !== undefined ? Number(n.customHeight) : undefined,
            flipPolarity: n.flipPolarity !== undefined ? !!n.flipPolarity : undefined,
            memoryData: Array.isArray(n.memoryData) ? n.memoryData.map(Number) : undefined,
            addressPins: n.addressPins !== undefined ? Number(n.addressPins) : undefined,
            portLabels: typeof n.portLabels === 'object' ? JSON.parse(JSON.stringify(n.portLabels)) : undefined
        };
    },

    sanitizeWire(w) {
        if (!w || typeof w !== 'object') return null;
        return {
            from: w.from ? { nodeId: String(w.from.nodeId), portId: String(w.from.portId) } : null,
            to: w.to ? { nodeId: String(w.to.nodeId), portId: String(w.to.portId) } : null,
            midX: w.midX !== undefined && w.midX !== null ? Number(w.midX) : undefined,
            midY: w.midY !== undefined && w.midY !== null ? Number(w.midY) : undefined
        };
    },

    sanitizeWorkspaceLayer(ws) {
        if (!ws || typeof ws !== 'object') return {};
        return {
            id: typeof ws.id === 'string' ? ws.id : undefined,
            name: typeof ws.name === 'string' ? this.sanitizeString(ws.name) : undefined,
            nodes: Array.isArray(ws.nodes) ? ws.nodes.map(n => this.sanitizeNode(n)).filter(n => n !== null) : [],
            wires: Array.isArray(ws.wires) ? ws.wires.map(w => this.sanitizeWire(w)).filter(w => w !== null) : []
        };
    },

    sanitizeTab(t) {
        if (!t || typeof t !== 'object') return {};
        return {
            id: typeof t.id === 'string' ? t.id : 'tab-' + Math.random(),
            name: typeof t.name === 'string' ? this.sanitizeString(t.name) : 'Main',
            nodes: Array.isArray(t.nodes) ? t.nodes.map(n => this.sanitizeNode(n)).filter(n => n !== null) : [],
            wires: Array.isArray(t.wires) ? t.wires.map(w => this.sanitizeWire(w)).filter(w => w !== null) : [],
            historyStack: [],
            historyIndex: -1
        };
    },

    sanitizePayload(data) {
        if (!data || typeof data !== 'object') return {};
        const clean = {
            version: typeof data.version === 'string' ? data.version : '1.0.0',
            activeEditingChip: typeof data.activeEditingChip === 'string' ? data.activeEditingChip : null,
            activeSplitChip: typeof data.activeSplitChip === 'string' ? data.activeSplitChip : null,
            library: {},
            workspaceStack: Array.isArray(data.workspaceStack) ? data.workspaceStack.map(ws => this.sanitizeWorkspaceLayer(ws)) : [],
            tabs: Array.isArray(data.tabs) ? data.tabs.map(t => this.sanitizeTab(t)) : [],
            prefs: {},
            directories: Array.isArray(data.directories) ? data.directories.map(d => ({
                id: String(d.id),
                name: this.sanitizeString(d.name || ''),
                folder: String(d.folder || '')
            })) : []
        };

        if (data.library && typeof data.library === 'object') {
            for (const [key, chip] of Object.entries(data.library)) {
                if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
                    clean.library[key] = this.sanitizeWorkspaceLayer(chip);
                }
            }
        }

        if (data.prefs && typeof data.prefs === 'object') {
            const VALID_PREFS = new Set([
                'snapNodes', 'snapWires', 'confirmDelete', 'showStats', 'showTooltips',
                'tutorialMode', 'hudPos', 'toastPos', 'disableAnimations', 'portSize',
                'dotSize', 'junctionSize', 'uiScale', 'flipPinLogic', 'debugMode', 'polarity'
            ]);
            for (const [k, v] of Object.entries(data.prefs)) {
                if (VALID_PREFS.has(k)) {
                    if (k === 'polarity') {
                        if (v && typeof v === 'object' && !Array.isArray(v)) {
                            clean.prefs.polarity = {};
                            for (const [pk, pv] of Object.entries(v)) {
                                if (pk !== '__proto__' && pk !== 'constructor' && pk !== 'prototype') {
                                    clean.prefs.polarity[pk] = !!pv;
                                }
                            }
                        }
                    } else {
                        clean.prefs[k] = v;
                    }
                }
            }
        }
        return clean;
    },

    _normalizeData(data) {
        return this.MigrationEngine.migrate(data);
    },

    /**
     * [AUDIT: v1.24.09 | SEC_ARCH_LEAD] - Centralized state sanitization methods to prevent reference crashes.
     */
    _cleanNode(n) {
        if (!n || !n.id) return null;
        try {
            return JSON.parse(JSON.stringify({
                id: n.id, type: n.type, x: n.x, y: n.y, label: n.label,
                val: n.val, state: n.state, outputs: n.outputs, isCustom: n.isCustom,
                freq: n.freq, interval: n.interval, lastTick: n.lastTick, 
                meta: n.meta ? { folder: n.meta.folder } : undefined,
                customWidth: n.customWidth, customHeight: n.customHeight, flipPolarity: n.flipPolarity,
                memoryData: n.memoryData ? Array.from(n.memoryData) : undefined,
                addressPins: n.addressPins,
                dataUrl: n.dataUrl,
                portLabels: n.portLabels ? JSON.parse(JSON.stringify(n.portLabels)) : undefined,
                portPositions: n.portPositions ? JSON.parse(JSON.stringify(n.portPositions)) : undefined,
                pinX: n.pinX, pinY: n.pinY, pinW: n.pinW, pinH: n.pinH,
                infoX: n.infoX, infoY: n.infoY, infoW: n.infoW, infoH: n.infoH,
                labelX: n.labelX, labelY: n.labelY, labelW: n.labelW, labelH: n.labelH,
                portY: n.portY, portH: n.portH, portLabelX: n.portLabelX,
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

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Align persistence telemetry with MRAP taxonomy.
     */
    autoSave() {
        if (Sim._autoSaveTimer) clearTimeout(Sim._autoSaveTimer);
        Sim._autoSaveTimer = setTimeout(async () => {
            try {
                const cNodes = Sim.nodes.map(n => this._cleanNode(n)).filter(n => n !== null);
                const cWires = Sim.wires.map(w => this._cleanWire(w)).filter(w => w !== null);
                
                if (Sim.useWasm && window.WasmEngine && WasmEngine.ready) {
                    WasmEngine.syncMemoryToHost(Sim.nodes);
                }

                const wsStack = (Sim.workspaceStack || []).map(ws => ({ 
                    nodes: (ws.nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null), 
                    wires: (ws.wires || []).map(w => this._cleanWire(w)).filter(w => w !== null),
                    activeEditingChip: ws.activeEditingChip || null,
                    historyStack: ws.historyStack || [],
                    historyIndex: ws.historyIndex !== undefined ? ws.historyIndex : -1
                }));
                
                if (Sim.activeEditingChip && wsStack.length > 0) {
                    Sim.library[Sim.activeEditingChip] = { folder: Sim.library[Sim.activeEditingChip]?.folder || '', nodes: cNodes, wires: cWires };
                }

                const performSave = async () => {
                    // [State Merging] Fetch latest localStorage before committing to prevent cross-window overwrites
                    let storedProject = null;
                    try {
                        const raw = _getProjectStorage().getItem('bsim_autosave');
                        if (raw) storedProject = JSON.parse(raw);
                    } catch (e) { console.warn('Failed to parse existing autosave for merging', e); }

                    const safeLib = {};
                    Object.keys(Sim.library).forEach(k => {
                        if (Sim.library[k]) {
                            safeLib[k] = {
                                nodes: (Sim.library[k].nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null),
                                wires: (Sim.library[k].wires || []).map(w => this._cleanWire(w)).filter(w => w !== null),
                                folder: Sim.library[k].folder || ''
                            };
                        }
                    });

                    const deletedChips = new Set(Sim._deletedChips || []);
                    if (storedProject && storedProject.deletedChips) {
                        storedProject.deletedChips.forEach(c => deletedChips.add(c));
                    }
                    Sim._deletedChips = deletedChips;

                    // Merge library chips from storedProject if they aren't currently being edited or deleted
                    if (storedProject && storedProject.library) {
                        Object.keys(storedProject.library).forEach(k => {
                            if (k !== Sim.activeEditingChip && !safeLib[k] && !deletedChips.has(k)) {
                                safeLib[k] = storedProject.library[k];
                            }
                        });
                    }

                    const activeTab = Sim.tabs?.find(t => t.id === Sim.activeTabId);
                    if (activeTab && Sim.workspaceStack.length === 0) {
                        activeTab.nodes = cNodes;
                        activeTab.wires = cWires;
                        if (window.History) {
                            activeTab.historyStack = History.stack;
                            activeTab.historyIndex = History.index;
                        }
                    }

                    const safeTabs = (Sim.tabs || []).map(t => ({
                        id: t.id, name: t.name,
                        nodes: (t.id === Sim.activeTabId && Sim.workspaceStack.length === 0) ? cNodes : (t.nodes || []).map(n => this._cleanNode(n)).filter(n => n !== null),
                        wires: (t.id === Sim.activeTabId && Sim.workspaceStack.length === 0) ? cWires : (t.wires || []).map(w => this._cleanWire(w)).filter(w => w !== null),
                        historyStack: t.historyStack || [], historyIndex: t.historyIndex !== undefined ? t.historyIndex : -1,
                        activeSplitChip: t.id === Sim.activeTabId ? Sim.activeSplitChip : t.activeSplitChip,
                        splitDirection: t.id === Sim.activeTabId ? (document.getElementById('main')?.classList.contains('split-left') ? 'left' : (document.getElementById('main')?.classList.contains('split-right') ? 'right' : (Sim.activeSplitChip ? 'popup' : null))) : t.splitDirection
                    }));

                    // Merge background tabs from storedProject to isolate cross-window editing
                    if (storedProject && storedProject.tabs) {
                        safeTabs.forEach(st => {
                            if (st.id !== Sim.activeTabId) {
                                const otherTab = storedProject.tabs.find(x => x && x.id === st.id);
                                if (otherTab) {
                                    st.nodes = otherTab.nodes || [];
                                    st.wires = otherTab.wires || [];
                                    st.historyStack = otherTab.historyStack || [];
                                    st.historyIndex = otherTab.historyIndex !== undefined ? otherTab.historyIndex : -1;
                                    st.activeSplitChip = otherTab.activeSplitChip;
                                    st.splitDirection = otherTab.splitDirection;
                                }
                            }
                        });
                        
                        // Append any new tabs created in another window
                        storedProject.tabs.forEach(ot => {
                            if (ot && !safeTabs.find(st => st.id === ot.id)) {
                                safeTabs.push(ot);
                            }
                        });
                    }

                    const project = { 
                        nodes: wsStack.length > 0 ? wsStack[0].nodes : cNodes, 
                        wires: wsStack.length > 0 ? wsStack[0].wires : cWires, 
                        library: safeLib, directories: Sim.directories || [], workspaceStack: wsStack, activeEditingChip: Sim.activeEditingChip,
                        tabs: safeTabs, activeTabId: Sim.activeTabId,
                        deletedChips: Array.from(deletedChips),
                        prefs: { snapNodes: Sim.snapNodes, snapWires: Sim.snapWires, confirmDelete: Sim.confirmDelete, showStats: Sim.showStats, showTooltips: Sim.showTooltips, tutorialMode: Sim.tutorialMode, hudPos: Sim.hudPos, toastPos: Sim.toastPos, disableAnimations: Sim.disableAnimations, portSize: Sim.portSize, dotSize: Sim.dotSize, junctionSize: Sim.junctionSize, uiScale: Sim.uiScale, flipPinLogic: Sim.flipPinLogic, debugMode: Sim.debugMode, polarity: Sim.polarity || {} },
                        meta: { version: (window.LOADED_BSIM_VERSION || "1.27.27") + "-Modular", exportedAt: new Date().toISOString() }
                    };
                    _getProjectStorage().setItem('bsim_autosave', JSON.stringify(project));
                };

                if (navigator.locks) {
                    await navigator.locks.request('bsim_autosave_lock', performSave);
                } else {
                    await performSave();
                }
            } catch (e) {
                console.error("[AutoSave] Serialization Failure:", e);
            }
        }, 500);
    },

    loadAutoSave() {
        try {
            const raw = _getProjectStorage().getItem('bsim_autosave');
            if (raw) {
                let parsed = JSON.parse(raw);
                parsed = this._normalizeData(parsed);
                Sim.library = parsed.library || {};
                if (parsed.prefs) {
                    const VALID_PREFS = new Set([
                        'snapNodes', 'snapWires', 'confirmDelete', 'showStats', 'showTooltips',
                        'tutorialMode', 'hudPos', 'toastPos', 'disableAnimations', 'portSize',
                        'dotSize', 'junctionSize', 'uiScale', 'flipPinLogic', 'debugMode', 'polarity'
                    ]);
                    for (const key of Object.keys(parsed.prefs)) {
                        if (VALID_PREFS.has(key)) {
                            const val = parsed.prefs[key];
                            if (key === 'polarity') {
                                if (val && typeof val === 'object' && !Array.isArray(val)) {
                                    Sim.polarity = {};
                                    for (const polKey of Object.keys(val)) {
                                        if (polKey !== '__proto__' && polKey !== 'constructor' && polKey !== 'prototype') {
                                            Sim.polarity[polKey] = val[polKey];
                                        }
                                    }
                                }
                            } else {
                                Sim[key] = val;
                            }
                        }
                    }
                }
                
                Sim.workspaceStack = parsed.workspaceStack || [];
                Sim.activeEditingChip = parsed.activeEditingChip || null;
                Sim.directories = parsed.directories || [];
                
                if (parsed.tabs && parsed.tabs.length > 0) {
                    Sim.tabs = parsed.tabs;
                    Sim.activeTabId = parsed.activeTabId || Sim.tabs[0].id;
                } else {
                    Sim.tabs = [{ id: 'tab-1', name: 'Main', nodes: parsed.nodes || [], wires: parsed.wires || [], historyStack: [], historyIndex: -1 }];
                    Sim.activeTabId = 'tab-1';
                }
                
                let activeNodes = parsed.nodes;
                let activeWires = parsed.wires;
                
                if (Sim.workspaceStack.length === 0) {
                    const t = Sim.tabs.find(x => x.id === Sim.activeTabId);
                    if (t) {
                        activeNodes = t.nodes; activeWires = t.wires;
                        if (window.History) {
                            History.stack = t.historyStack ? [...t.historyStack] : [];
                            History.index = t.historyIndex !== undefined ? t.historyIndex : -1;
                        }
                        if (t.activeSplitChip) {
                            setTimeout(() => {
                                Sim.uiSplitEditor(t.splitDirection || 'right', t.activeSplitChip, true);
                            }, 100);
                        }
                    }
                }
                
                if (Sim.activeEditingChip && Sim.library[Sim.activeEditingChip]) {
                    activeNodes = Sim.library[Sim.activeEditingChip].nodes;
                    activeWires = Sim.library[Sim.activeEditingChip].wires;
                    const exitBtn = document.getElementById('btn-exit-chip');
                    if (exitBtn) exitBtn.style.display = 'inline';
                } else if (Sim.activeEditingChip) {
                    Sim.activeEditingChip = null;
                    Sim.workspaceStack = [];
                }

                if (Array.isArray(activeNodes)) {
                    activeNodes.forEach(n => { 
                        const c = this._cleanNode(n);
                        if (c) {
                            Sim.nodes.push(c); 
                            if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(c); 
                        }
                    });
                }
                
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
                
                migrateWires(activeWires, Sim.nodes);
                if (Sim.library) {
                    Object.values(Sim.library).forEach(chip => {
                        if (chip && chip.wires && chip.nodes) migrateWires(chip.wires, chip.nodes);
                    });
                }

                Sim.wires = Array.isArray(activeWires) ? JSON.parse(JSON.stringify(activeWires)) : [];
                if (window.Engine && typeof Engine.invalidatePurityCache === 'function') Engine.invalidatePurityCache();
                Sim.updateWireVisuals();
                Sim.seedQueue();
                Sim.processQueue();
                if (typeof Sim.autoSave === 'function') Sim.autoSave();
            }
        } catch (e) {
            console.error("[Persistence] Load Failure:", e);
        }
    },

    /**
     */
    exportProject(name) {
        if (name instanceof Event || typeof name !== 'string' || name.trim() === '') {
            if (window.Sim && typeof Sim.modal === 'function') {
                Sim.modal('Export Project', 'Enter project name:', 'prompt', (val) => {
                    if (val !== null) this._executeExport(val.trim() || 'Project');
                }, 'Project');
                return;
            }
            name = 'Project';
        }
        this._executeExport(name);
    },

    // [AUDIT: v1.24.17 | SEC_ARCH_LEAD] - Refactored project export to support asynchronous user naming prompts.
    _executeExport(name) {
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.bsim$/, '');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(16).substr(2, 4).toUpperCase();
        const filename = `${safeName}_${date}_${rand}.bsim`;

        let mainNodes = Sim.nodes;
        let mainWires = Sim.wires;
        if (Sim.workspaceStack && Sim.workspaceStack.length > 0) {
            mainNodes = Sim.workspaceStack[0].nodes;
            mainWires = Sim.workspaceStack[0].wires;
        }

        // [AUDIT: v1.24.46 | SEC_ARCH_LEAD] - Execute deep state sanitization to purge circular DOM references prior to JSON serialization.
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

        const project = {
            nodes: cNodes, wires: cWires, library: cLib,
            meta: { version: (window.LOADED_BSIM_VERSION || "1.24.46") + "-Modular", exportedAt: new Date().toISOString() }
        };

        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        Sim.toast('Project exported successfully.', 'success');
    },

    /**
     */
    importProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".bsim,.dbsim";
        input.onchange = e => {
            const reader = new FileReader();
            reader.onload = (re) => {
                try {
                    let data = JSON.parse(re.target.result);
                    data = this._normalizeData(data);

                    // [AUDIT: v1.24.46 | SEC_ARCH_LEAD] - Purge global contextual states to prevent phantom tab desynchronization and editor lockups upon ingestion.
                    Sim.library = data.library || {};
                    Sim.nodes = [];
                    Sim.wires = [];
                    Sim.workspaceStack = [];
                    Sim.activeEditingChip = null;
                    Sim.activeSplitChip = null;

                    const exitBtn = document.getElementById('btn-exit-chip');
                    if (exitBtn) exitBtn.style.display = 'none';

                    document.getElementById('scene').innerHTML = '';

                    if (data.nodes) {
                        data.nodes.forEach(n => {
                            const c = Sim._cleanNode(n);
                            if (c) {
                                Sim.nodes.push(c);
                                if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(c);
                            }
                        });
                        Sim.wires = (data.wires || []).map(w => Sim._cleanWire(w)).filter(w => w !== null);
                        if (window.Engine && typeof Engine.invalidatePurityCache === 'function') Engine.invalidatePurityCache();
                        if (typeof WireRenderer !== 'undefined') WireRenderer.drawWires();
                    }

                    Sim.tabs = [{ id: 'tab-1', name: 'Main', nodes: Sim.nodes.map(n => Sim._cleanNode(n)), wires: Sim.wires.map(w => Sim._cleanWire(w)), historyStack: [], historyIndex: -1 }];
                    Sim.activeTabId = 'tab-1';
                    if (typeof Sim.updateTabsUI === 'function') Sim.updateTabsUI();

                    Sim.updateLibraryUI();
                    Sim.seedQueue();
                    Sim.processQueue();
                    Sim.autoSave();
                } catch (err) {
                    Sim.modal('Import Failed', 'Invalid .bsim file format.', 'alert');
                }
            };
            reader.readAsText(e.target.files[0]);
        };
        input.click();
    },

    /**
     */
    exportImage(name) {
        if (!name || typeof name !== 'string' || name instanceof Event || name.trim() === '') name = 'Diagram';
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.png$/, '');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(16).substr(2, 4).toUpperCase();
        const filename = `${safeName}_${date}_${rand}.png`;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const wr = document.getElementById('workspace').getBoundingClientRect();
        canvas.width = wr.width; canvas.height = wr.height;

        ctx.fillStyle = '#0b0b0e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a1a23';
        const gs = 20 * View.scale;
        const ox = View.x % gs, oy = View.y % gs;
        for (let x = ox - gs; x < canvas.width; x += gs) {
            for (let y = oy - gs; y < canvas.height; y += gs) {
                if (x > 0 && y > 0) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
            }
        }

        Sim.nodes.forEach(n => {
            const el = document.getElementById(n.id);
            if (!el) return;
            const r = el.getBoundingClientRect();
            const x = r.left - wr.left, y = r.top - wr.top;

            ctx.fillStyle = '#22222b';
            ctx.strokeStyle = el.classList.contains('active') ? '#00ffaa' : (el.classList.contains('inactive') ? '#883333' : '#333344');
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(x, y, r.width, r.height, 8 * View.scale); ctx.fill(); ctx.stroke();

            ctx.font = `bold ${8 * View.scale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#666677';
            ctx.fillText(n.label, x + r.width / 2, y + (12 * View.scale));
        });

        const svgStr = new XMLSerializer().serializeToString(document.getElementById('svg-layer'));
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            const a = document.createElement('a');
            a.download = filename;
            a.href = canvas.toDataURL('image/png');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            Sim.toast('Diagram exported to PNG.');
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr.replace(/var\(--wire-on\)/g, '#00ffaa').replace(/var\(--wire-off\)/g, '#883333'))));
    },
    /**
     */
    async importFromUrl(url) {
        if (!this.isUrlSecure(url)) {
            if (window.Sim && typeof Sim.toast === 'function') Sim.toast('Failed to load project: Insecure URL protocol/host.', 'danger');
            return;
        }
        try {
            let res;
            try {
                res = await fetch(url);
                if (!res.ok) throw new Error("HTTP " + res.status);
            } catch (err) {
                console.warn('[CORS] Native fetch failed. Falling back to CORS proxy.', err);
                const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
                res = await fetch(proxyUrl);
                if (!res.ok) throw new Error("HTTP " + res.status);
            }
            
            const data = await res.json();
            const sanitized = this.sanitizePayload(data);
            _getProjectStorage().setItem('bsim_autosave', JSON.stringify(sanitized));
            location.reload();
        } catch (e) {
            console.error('[FATAL] Remote import failed:', e);
            if (window.Sim && typeof Sim.toast === 'function') Sim.toast('Failed to load project from URL. (CORS or Invalid JSON)', 'danger');
        }
    },

    /**
     */
    async exportHighFidelity() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true });
            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            stream.getTracks().forEach(track => track.stop());
            const a = document.createElement('a');
            a.download = `HiFi_Snapshot_${Date.now()}.png`;
            a.href = canvas.toDataURL('image/png');
            a.click();
            if (window.Sim && typeof Sim.toast === 'function') Sim.toast('High-Fidelity Snapshot Exported.');
        } catch (e) {
            console.error('[FATAL] High-Fidelity export failed:', e);
        }
    }
};

window.ProjectManager = ProjectManager;
