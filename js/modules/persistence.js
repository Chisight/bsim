/**
 * Project Persistence Module
 */
const ProjectManager = {
    MigrationEngine: {
        /**
         * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for semantic version parsing.
         * @ARCH: VERSION_PARSER
         * @CONSTRAINT: SEMANTIC_VERSIONING
         * @INTENT: Convert semantic version strings into a comparable integer format for migration logic.
         */
        parseVer(vStr) {
            if (!vStr) {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Early exit, version string empty.
                return 0;
            }
            const m = vStr.match(/v?(\d+)\.(\d+)\.(\d+)/);
            if (!m) {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Early exit, version format invalid.
                return 0;
            }
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Version parsed successfully.
            return parseInt(m[1]) * 1000000 + parseInt(m[2]) * 1000 + parseInt(m[3]);
        },
        /**
         * @ARCH: SCHEMA_MIGRATOR
         * @STATE: COMPATIBILITY_LAYER
         * @INTENT: Upgrade legacy project schemas to the current runtime standard, including port remapping.
         */
        migrate(data) {
            if (!data) {
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Migration aborted, data payload null.
                return data;
            }
            const fileVer = this.parseVer(data.meta?.version || "1.0.0");


            // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Updated fallback runtime expectation string to enforce new migration baseline.
            const currentVer = this.parseVer(window.EXPECTED_BSIM_VERSION || "1.24.00");

            if (fileVer < currentVer) console.log(`[Migration] Upgrading schema from ${data.meta?.version} to ${window.EXPECTED_BSIM_VERSION}`);

            this.standardize(data);

            // --- GLOBAL DEEP PORT MIGRATION (Fixes nested Custom Chips) ---
            const NATIVE = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
            const fixNetlist = (wires, nodes) => {
                if (!wires || !nodes) return;
                wires.forEach(w => {
                    [ {ep: w.from, isIn: false}, {ep: w.to, isIn: true} ].forEach(({ep, isIn}) => {
                        const cNode = nodes.find(n => n.id === ep.nodeId);
                        if (!cNode) return;
                        
                        if (NATIVE.has(cNode.type)) {
                            const t = cNode.type;
                            if (isIn) {
                                if (t === 'NOT' && (ep.portId === 'in0' || ep.portId === 'in')) ep.portId = 'a';
                                else if (['AND','OR','NOR','XOR','XNOR','NAND'].includes(t)) {
                                    if (ep.portId === 'in0' || ep.portId === 'in') ep.portId = 'a';
                                    if (ep.portId === 'in1') ep.portId = 'b';
                                } else if (['IN-1','OUT-1','PROBE-1','CLOCK'].includes(t)) {
                                    if (ep.portId === 'in') ep.portId = 'in0';
                                }
                            } else {
                                if (['NOT','AND','OR','NOR','XOR','XNOR','NAND'].includes(t)) {
                                    // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Reverted native gate output mapping to strictly target DOM property 'q'.
                                    if (ep.portId === 'out0' || ep.portId === 'out') ep.portId = 'q';
                                } else if (['IN-1','OUT-1','PROBE-1','CLOCK'].includes(t)) {
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
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Migration complete. Target version: ${data.meta.version}.
            return data;
        },
        /**
         * @STATE: PORT_NORMALIZER
         * @INTENT: Apply bulk port remapping to a netlist for specific component types during migration.
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
         * @STATE: DATA_CONSISTENCY
         * @INTENT: Enforce structural integrity and default values across nodes and wires in a project blob.
         */
        standardize(data) {
            const NATIVE = new Set(['NAND', 'CLOCK', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'JUNCTION', 'TRISTATE', 'DFF', 'TFF', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
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
                if (data.nodes) { const n = data.nodes.find(x => x.id === id); if(n) return n; }
                if (data.workspaceStack) {
                    for(const ws of data.workspaceStack) {
                        const n = ws.nodes.find(x => x.id === id); if(n) return n;
                    }
                }
                if (data.library) {
                    for(const c of Object.values(data.library)) {
                        if (c.nodes) { const n = c.nodes.find(x => x.id === id); if(n) return n; }
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
                if(c.nodes) p(c.nodes); 
                if(c.wires) wClean(c.wires);
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
     * @ARCH: PERSISTENCE_INTERFACE
     * @INTENT: Normalize project data before ingestion into the simulation engine.
     */
    _normalizeData(data) {
        return this.MigrationEngine.migrate(data);
    },

    /**
     * @IO: FILE_EXPORT
     * @STATE: SERIALIZATION
     * @INTENT: Serialize the current workspace and library into a .bsim project file.
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Project serialization and export complete.
    },

    /**
     * @IO: FILE_IMPORT
     * @STATE: DESERIALIZATION
     * @INTENT: Load and validate a .bsim project file into the simulator workspace.
     */
    importProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = ".bsim";
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Import process initiated via UI file picker.
    },

    /**
     * @IO: CANVAS_EXPORT
     * @ARCH: RENDERING_EXPORT
     * @INTENT: Render the current workspace to a static PNG image for documentation/sharing.
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
    }
    /**
     * @IO: REMOTE_IMPORT
     * @INTENT: Fetch a .bsim project from a remote URL and ingest it into the local autosave slot.
     */
    async importFromUrl(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            localStorage.setItem('bsim_autosave', JSON.stringify(data));
            location.reload();
        } catch (e) {
            console.error('[FATAL] Remote import failed:', e);
            if (window.Sim && typeof Sim.toast === 'function') Sim.toast('Failed to load project from URL.', 'error');
        }
    },

    /**
     * @IO: SCREEN_CAPTURE
     * @INTENT: Execute a high-fidelity workspace capture using the Screen Capture API for documentation.
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
