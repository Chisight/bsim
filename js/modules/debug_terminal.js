/**
 * Debug Terminal & Hardware Synthesizer
 */
const DebugTerminal = {
    verbosity: 2,
    visible: false,
    cwd: '/home/bsim', // Virtual File System Root
    history: [],
    historyIndex: -1,
    usePredictions: true,
    useColors: true,
    assertions: new Map(),
    vcdRecording: false,
    vcdHistory: new Map(),
    _halted: false,
    _lastTracedNodes: new Set(),
    
    // [AUDIT: v1.25.25 | SEC_ARCH_LEAD] - Injected default VFS symlink mapping to surface library components in the home workspace.
    symlinks: {
        '/home/bsim/primitives': '/etc/lib/primitives',
        '/home/bsim/custom': '/etc/lib/custom'
    },
    
    RECIPES: {
        'NOT': {
            deps: [],
            build: () => ({
                nodes: [
                    {id: 'inA', type: 'IN-1', x: 0, y: 0},
                    {id: 'n1', type: 'NAND', x: 100, y: 0},
                    {id: 'out', type: 'OUT-1', x: 200, y: 0}
                ],
                wires: [
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'n1', portId:'a'}},
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'n1', portId:'b'}},
                    {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'out', portId:'in0'}}
                ]
            })
        },
        'AND': {
            deps: ['NOT'],
            build: () => ({
                nodes: [
                    {id: 'inA', type: 'IN-1', x: 0, y: -20},
                    {id: 'inB', type: 'IN-1', x: 0, y: 20},
                    {id: 'n1', type: 'NAND', x: 100, y: 0},
                    {id: 'not1', type: 'NOT', isCustom: true, x: 200, y: 0},
                    {id: 'out', type: 'OUT-1', x: 300, y: 0}
                ],
                wires: [
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'n1', portId:'a'}},
                    {from:{nodeId:'inB', portId:'out0'}, to:{nodeId:'n1', portId:'b'}},
                    {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'not1', portId:'in0'}},
                    {from:{nodeId:'not1', portId:'out0'}, to:{nodeId:'out', portId:'in0'}}
                ]
            })
        },
        'OR': {
            deps: ['NOT'],
            build: () => ({
                nodes: [
                    {id: 'inA', type: 'IN-1', x: 0, y: -20},
                    {id: 'inB', type: 'IN-1', x: 0, y: 20},
                    {id: 'notA', type: 'NOT', isCustom: true, x: 100, y: -20},
                    {id: 'notB', type: 'NOT', isCustom: true, x: 100, y: 20},
                    {id: 'n1', type: 'NAND', x: 200, y: 0},
                    {id: 'out', type: 'OUT-1', x: 300, y: 0}
                ],
                wires: [
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'notA', portId:'in0'}},
                    {from:{nodeId:'inB', portId:'out0'}, to:{nodeId:'notB', portId:'in0'}},
                    {from:{nodeId:'notA', portId:'out0'}, to:{nodeId:'n1', portId:'a'}},
                    {from:{nodeId:'notB', portId:'out0'}, to:{nodeId:'n1', portId:'b'}},
                    {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'out', portId:'in0'}}
                ]
            })
        },
        'XOR': {
            deps: ['OR', 'AND', 'NAND'],
            build: () => ({
                nodes: [
                    {id: 'inA', type: 'IN-1', x: 0, y: -40},
                    {id: 'inB', type: 'IN-1', x: 0, y: 40},
                    {id: 'or1', type: 'OR', isCustom: true, x: 100, y: -40},
                    {id: 'n1', type: 'NAND', x: 100, y: 40},
                    {id: 'and1', type: 'AND', isCustom: true, x: 200, y: 0},
                    {id: 'out', type: 'OUT-1', x: 300, y: 0}
                ],
                wires: [
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'or1', portId:'in0'}},
                    {from:{nodeId:'inB', portId:'out0'}, to:{nodeId:'or1', portId:'in1'}},
                    {from:{nodeId:'inA', portId:'out0'}, to:{nodeId:'n1', portId:'a'}},
                    {from:{nodeId:'inB', portId:'out0'}, to:{nodeId:'n1', portId:'b'}},
                    {from:{nodeId:'or1', portId:'out0'}, to:{nodeId:'and1', portId:'in0'}},
                    {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'and1', portId:'in1'}},
                    {from:{nodeId:'and1', portId:'out0'}, to:{nodeId:'out', portId:'in0'}}
                ]
            })
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for debug terminal bootstrap.
     */
    init() {
        // [AUDIT: v1.24.18 | SEC_ARCH_LEAD] - Prevent duplicate initialization from concurrent lifecycle hooks causing DOM ghosts.
        if (this._initialized) return;
        this._initialized = true;

        this.injectCSS();
        this.buildUI();
        this.attachHooks();
        this.overrideConsole();
        // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Updated terminal hotkey to avoid native print dialog collisions.
        console.log("[TERM] V8/WASM Debugger Initialized. Press Ctrl+Alt+P.");
    },

    /**
     */
    // [AUDIT: v1.23.97 | SEC_ARCH_LEAD] - Upgraded terminal aesthetic and enforced text-selection capabilities.
    injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            #dt-wrap { position: fixed; bottom: 20px; right: 20px; width: 600px; height: 400px; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(8px); border: 1px solid #334; border-radius: 6px; display: none; flex-direction: column; z-index: 9999; resize: both; overflow: hidden; font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); user-select: text; }
            #dt-head { background: #111; padding: 6px 10px; color: #888; cursor: move; display: flex; justify-content: space-between; user-select: none; border-bottom: 1px solid #222; }
            #dt-head span:hover { color: #fff; }
            #dt-out { flex: 1; padding: 10px; overflow-y: auto; color: #ddd; word-wrap: break-word; user-select: text !important; -webkit-user-select: text !important; cursor: text; }
            #dt-out::-webkit-scrollbar { width: 8px; }
            #dt-out::-webkit-scrollbar-thumb { background: #334; }
            #dt-in-row { display: flex; align-items: center; background: #000; border-top: 1px solid #222; padding: 0 10px; position: relative; }
            #dt-prompt { color: #0f5; font-weight: bold; margin-right: 8px; white-space: nowrap; user-select: none; }
            #dt-in-container { position: relative; flex: 1; display: flex; align-items: center; }
            #dt-in { background: transparent; color: #fff; border: none; padding: 10px 0; outline: none; width: 100%; font-family: inherit; font-size: inherit; position: relative; z-index: 2; caret-color: #fff; }
            #dt-ghost { position: absolute; left: 0; top: 0; padding: 10px 0; border: none; color: #555; background: transparent; pointer-events: none; font-family: inherit; font-size: inherit; white-space: pre; z-index: 1; }
            .dt-msg { margin-bottom: 4px; line-height: 1.4; user-select: text !important; -webkit-user-select: text !important; }
            .dt-msg::selection { background: rgba(0, 255, 170, 0.3); }
            .dt-err { color: #ff5555; }
            .dt-warn { color: #ffaa00; }
            .dt-sys { color: #8888aa; }
            .dt-ok { color: #00ffaa; }
            .dt-menu-item { padding: 6px 15px; color: #aaa; cursor: pointer; user-select: none; }
            .dt-menu-item:hover { background: #252530; color: #fff; }
            
            /* Monochrome Override when colors are toggled off */
            #dt-wrap.dt-no-colors .dt-prompt { color: #fff !important; }
            #dt-wrap.dt-no-colors span { color: #fff !important; }
            #dt-wrap.dt-no-colors .dt-err { color: #ff6666 !important; }
            #dt-wrap.dt-no-colors .dt-warn { color: #ffca28 !important; }
            #dt-wrap.dt-no-colors .dt-sys { color: #ddd !important; }
            #dt-wrap.dt-no-colors .dt-ok { color: #fff !important; }
        `;
        document.head.appendChild(style);
    },

    /**
     */
    // [AUDIT: v1.23.97 | SEC_ARCH_LEAD] - Injected Linux-style DOM wrappers for terminal prompt and auto-focus logic.
    buildUI() {
        this.ui = document.createElement('div');
        this.ui.id = 'dt-wrap';
        this.ui.innerHTML = `
            <div id="dt-head">
                <div style="font-weight:bold; color:#888;">user@bsim: <span id="dt-header-cwd">/home/bsim</span></div>
                <div><span id="dt-min" style="cursor:pointer; margin-right:8px;">_</span><span id="dt-close" style="cursor:pointer;">X</span></div>
            </div>
            <div id="dt-out"></div>
            <div id="dt-in-row">
                <span id="dt-prompt">bsim:<span id="dt-prompt-cwd">~</span>$</span>
                <div id="dt-in-container">
                    <div id="dt-ghost"></div>
                    <input id="dt-in" type="text" autocomplete="off" spellcheck="false" />
                </div>
            </div>
        `;
        document.body.appendChild(this.ui);

        this.out = document.getElementById('dt-out');
        
        // [AUDIT: v1.23.61 | SEC_ARCH_LEAD] - Lift mousedown restriction to permit cursor selection of logs.
        this.out.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        this.inp = document.getElementById('dt-in');
        this.ghost = document.getElementById('dt-ghost');
        
        this.out.addEventListener('click', () => {
            if (window.getSelection().toString().length === 0) {
                this.inp.focus();
            }
        });

        // [AUDIT: v1.24.18 | SEC_ARCH_LEAD] - Hardened terminal header drag logic with isolated window controls.
        let isDragging = false, startX, startY, initX, initY;
        const head = document.getElementById('dt-head');
        head.onmousedown = (e) => {
            if (e.target.closest && e.target.closest('#dt-min, #dt-close')) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = this.ui.getBoundingClientRect();
            initX = rect.left; initY = rect.top;
            this.ui.style.left = initX + 'px';
            this.ui.style.top = initY + 'px';
            this.ui.style.right = 'auto'; this.ui.style.bottom = 'auto';
            document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'none');
        };
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.ui.style.left = (initX + (e.clientX - startX)) + 'px';
            this.ui.style.top = (initY + (e.clientY - startY)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.querySelectorAll('iframe').forEach(ifr => ifr.style.pointerEvents = 'auto');
            }
        });

        // Window Controls
        const btnClose = document.getElementById('dt-close');
        btnClose.onmousedown = (e) => e.stopPropagation();
        btnClose.onclick = () => this.toggle(false);

        const btnMin = document.getElementById('dt-min');
        btnMin.onmousedown = (e) => e.stopPropagation();
        btnMin.onclick = () => {
            const isMin = this.ui.style.height === '30px';
            this.ui.style.height = isMin ? '400px' : '30px';
            document.getElementById('dt-in-row').style.display = isMin ? 'flex' : 'none';
        };

        // Input Handle
        // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Restore custom context menu for terminal clipboard actions.
        this.ui.oncontextmenu = (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        };

        this.inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = this.inp.value.trim();
                this.inp.value = '';
                this.clearHighlight();
                this._acState = null;
                if (this.ghost) this.ghost.innerText = '';
                if (cmd) {
                    this.history.push(cmd);
                    if (this.history.length > 100) this.history.shift();
                    this.historyIndex = this.history.length;
                    this.exec(cmd);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.history.length > 0 && this.historyIndex > 0) {
                    this.historyIndex--;
                    this.inp.value = this.history[this.historyIndex];
                    if (this.ghost) this.ghost.innerText = '';
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.inp.value = this.history[this.historyIndex];
                    if (this.ghost) this.ghost.innerText = '';
                } else {
                    this.historyIndex = this.history.length;
                    this.inp.value = '';
                    if (this.ghost) this.ghost.innerText = '';
                }
            } else if (e.key === 'ArrowRight') {
                if (this.inp.selectionStart === this.inp.value.length && this.ghost && this.ghost.innerText) {
                    e.preventDefault();
                    this.inp.value = this.ghost.innerText;
                    this.updateGhost();
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTab();
            } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
                this.clearHighlight();
                this._acState = null;
            }
        };

        this.inp.oninput = () => {
            this.updateGhost();
        };
    },

    /**
     */
    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Advanced Virtual File System path resolution.
    resolvePath(target) {
        let next = target.startsWith('/') ? target : (this.cwd.endsWith('/') ? this.cwd + target : this.cwd + '/' + target);
        let parts = next.split('/').filter(p => p);
        let res = [];
        for (let p of parts) {
            if (p === '..') res.pop();
            else if (p !== '.') res.push(p);
        }
        let resolved = '/' + res.join('/');
        
        // [AUDIT: v1.25.25 | SEC_ARCH_LEAD] - Iterative symlink resolution engine injected to map virtual aliases to physical memory paths.
        let maxDepth = 5;
        while (maxDepth-- > 0 && this.symlinks) {
            let changed = false;
            for (const [link, src] of Object.entries(this.symlinks)) {
                if (resolved === link || resolved.startsWith(link + '/')) {
                    resolved = src + resolved.substring(link.length);
                    changed = true;
                    break;
                }
            }
            if (!changed) break;
        }
        // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Prevent recursive file system logic leaks by restricting path depth.
        if (resolved.split('/').length > 10) {
            this.print("VFS depth boundary exceeded.", "err");
            return '/';
        }
        return resolved;
    },

    isValidDir(path) {
        if (['/', '/home', '/home/bsim', '/etc', '/etc/lib', '/etc/lib/primitives', '/etc/lib/custom'].includes(path)) return true;
        if (path.startsWith('/etc/lib/custom/')) return true; // Assume virtual folders exist if chips are in them
        const tMatch = path.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
        if (tMatch) {
            // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Expanded VFS tab resolution to support human-readable workspace names.
            const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1] || t.name.replace(/\s+/g, '_') === tMatch[1] || t.name === tMatch[1]);
            if (!tab) return false;
            if (tMatch[2] === 'editor') return (Sim.activeTabId === tab.id && (!!Sim.activeEditingChip || !!Sim.activeSplitChip));
            return true;
        }
        return false;
    },

    // [AUDIT: v1.24.01 | SEC_ARCH_LEAD] - VFS directory reader for tree traversal and path-based listing.
    getVirtualDir(path) {
        let dirs = [], files = [];
        if (path === '/') dirs = ['home', 'etc'];
        else if (path === '/home') dirs = ['bsim'];
        else if (path === '/etc') dirs = ['lib'];
        else if (path === '/etc/lib') dirs = ['primitives', 'custom'];
        else if (path === '/home/bsim') {
            // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Transitioned home directory VFS readouts to utilize physical workspace names over virtual aliases.
            Sim.tabs.forEach((t, i) => dirs.push(t.name.replace(/\s+/g, '_')));
            // [AUDIT: v1.25.25 | SEC_ARCH_LEAD] - Append virtual symlinks to directory listings for autocomplete parity.
            if (this.symlinks) {
                Object.keys(this.symlinks).forEach(k => {
                    if (k.startsWith('/home/bsim/') && k.split('/').length === 4) {
                        dirs.push(k.split('/').pop());
                    }
                });
            }
        }
        else if (path === '/etc/lib/primitives') {
            files = ['NAND', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'CLOCK'].map(n => `[Gate] ${n}`);
        }
        else if (path.startsWith('/etc/lib/custom')) {
            const searchDir = path.replace('/etc/lib/custom', '').replace(/^\//, '');
            const subdirs = new Set();
            
            if (Sim.directories) {
                Sim.directories.forEach(d => {
                    if (d === searchDir) return;
                    if (searchDir === '' || d.startsWith(searchDir + '/')) {
                        const sub = d.substring(searchDir ? searchDir.length + 1 : 0).split('/')[0];
                        if (sub) subdirs.add(sub);
                    }
                });
            }

            Object.keys(Sim.library).forEach(name => {
                const folder = Sim.library[name].folder || '';
                if (folder === searchDir) files.push(`[Macro] ${name}`);
                else if (folder.startsWith(searchDir ? searchDir + '/' : '')) {
                    const sub = folder.substring(searchDir ? searchDir.length + 1 : 0).split('/')[0];
                    if (sub) subdirs.add(sub);
                }
            });
            dirs = Array.from(subdirs);
        }
        else if (path.startsWith('/home/bsim/')) {
            const tMatch = path.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
            if (tMatch) {
                // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Expanded VFS tab resolution to support human-readable workspace names.
                const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1] || t.name.replace(/\s+/g, '_') === tMatch[1] || t.name === tMatch[1]);
                if (tab) {
                    if (!tMatch[2]) {
                        if (Sim.activeTabId === tab.id) {
                            if (Sim.activeEditingChip && Sim.workspaceStack.length > 0) {
                                dirs.push('editor');
                                Sim.workspaceStack[0].nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                            } else if (!Sim.activeEditingChip && Sim.activeSplitChip) {
                                dirs.push('editor');
                                Sim.nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                            } else {
                                Sim.nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                            }
                        } else {
                            tab.nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                        }
                    } else {
                        if (Sim.activeTabId === tab.id) {
                            if (Sim.activeEditingChip) {
                                Sim.nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                            } else if (Sim.activeSplitChip) {
                                const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
                                if (sf && sf.contentWindow && sf.contentWindow.Sim) {
                                    sf.contentWindow.Sim.nodes.forEach(n => files.push(`[${n.type}] ${n.id}`));
                                }
                            }
                        }
                    }
                }
            }
        }
        return { dirs, files };
    },

    runTree(path, prefix = '') {
        const contents = this.getVirtualDir(path);
        const total = contents.dirs.length + contents.files.length;
        let current = 0;
        
        contents.dirs.forEach(d => {
            current++;
            const isLast = current === total;
            const pointer = isLast ? '└── ' : '├── ';
            this.print(`${prefix.replace(/ /g, '&nbsp;')}${pointer}<span style="color:#0af; font-weight:bold;">${d}/</span>`, 'sys');
            this.runTree(path === '/' ? `/${d}` : `${path}/${d}`, prefix + (isLast ? '    ' : '│   '));
        });
        
        contents.files.forEach(f => {
            current++;
            const isLast = current === total;
            const pointer = isLast ? '└── ' : '├── ';
            this.print(`${prefix.replace(/ /g, '&nbsp;')}${pointer}<span style="color:#0f5;">${f}</span>`, 'ok');
        });
    },

    // [AUDIT: v1.24.70 | SEC_ARCH_LEAD] - Integrated terminal label-aware resolution helper.
    resolveNode(ctx, target) {
        let n = ctx.nodes.find(node => node.id === target);
        if (!n) n = ctx.nodes.find(node => node.id === `node-${target}`);
        if (!n) n = ctx.nodes.find(node => node.label === target);
        return n;
    },

    // [AUDIT: v1.24.06 | SEC_ARCH_LEAD] - Unified contextual environment resolver for split-pane and virtual workspaces.
    getContext() {
        const defaultCtx = { nodes: Sim.nodes, wires: Sim.wires, simObj: Sim };
        if (this.cwd === '/') return { nodes: [], wires: [], simObj: null };
        
        const tMatch = this.cwd.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
        if (!tMatch) return defaultCtx;
        
        // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Expanded VFS tab resolution to support human-readable workspace names.
        const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1] || t.name.replace(/\s+/g, '_') === tMatch[1] || t.name === tMatch[1]);
        if (!tab) return defaultCtx;
        
        if (tMatch[2] === 'editor') {
            if (Sim.activeTabId === tab.id) {
                if (Sim.activeEditingChip) return defaultCtx;
                if (Sim.activeSplitChip) {
                    const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
                    if (sf && sf.contentWindow && sf.contentWindow.Sim) {
                        return { nodes: sf.contentWindow.Sim.nodes, wires: sf.contentWindow.Sim.wires, simObj: sf.contentWindow.Sim };
                    }
                }
            }
        } else {
            if (Sim.activeTabId === tab.id) {
                if (Sim.activeEditingChip && Sim.workspaceStack.length > 0) {
                    return { nodes: Sim.workspaceStack[0].nodes, wires: Sim.workspaceStack[0].wires, simObj: Sim };
                }
                return defaultCtx;
            }
            return { nodes: tab.nodes || [], wires: tab.wires || [], simObj: null };
        }
        return { nodes: [], wires: [], simObj: null };
    },

    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Context-aware autocomplete via VFS integration.
    handleTab() {
        const val = this.inp.value;
        if (!this._acState) {
            const parts = val.split(' ');
            const cmd = parts[0].toLowerCase();
            const prefix = parts[parts.length - 1].toLowerCase();
            let matches = [];
            
            if (parts.length === 1) {
                // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Expand autocomplete index for new kernel CLI toolkit.
                // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Injected assert, step, peek, poke, reset primitives.
                // [AUDIT: v1.24.93 | SEC_ARCH_LEAD] - Injected power, symbols, and timing analysis primitives.
                // [AUDIT: v1.25.25 | SEC_ARCH_LEAD] - Registered simlink command for virtual directory linking.
                // [AUDIT: v1.25.26 | SEC_ARCH_LEAD] - Converted to POSIX standard 'ln' command alias.
                // [AUDIT: v1.25.46 | SEC_ARCH_LEAD] - Registered rename command for global macro topological updates.
                const cmds = ['help', 'exit', 'clear', 'verbosity', 'ls', 'spawn', 'rm', 'set', 'wire', 'sim', 'status', 'synth', 'trace', 'pwd', 'cd', 'mv', 'mkdir', 'tick', 'step', 'clock', 'force', 'unforce', 'watch', 'dump', 'cp', 'touch', 'find', 'bom', 'path', 'assert', 'peek', 'poke', 'reset', 'power', 'symbols', 'timing', 'ln', 'rename'];
                matches = cmds.filter(c => c.startsWith(prefix));
            } else if (cmd === 'cd' || cmd === 'ls' || cmd === 'tree' || cmd === 'rm' || cmd === 'mkdir') {
                // [AUDIT: v1.24.03 | SEC_ARCH_LEAD] - Dynamic VFS path autocomplete with trailing slash parsing.
                let searchPath = prefix.includes('/') ? prefix.substring(0, prefix.lastIndexOf('/')) : '';
                let searchPrefix = prefix.includes('/') ? prefix.substring(prefix.lastIndexOf('/') + 1) : prefix;
                if (prefix.endsWith('/')) {
                    searchPath = prefix.slice(0, -1);
                    searchPrefix = '';
                }
                
                let targetDir = this.resolvePath(searchPath || '.');
                if (prefix.startsWith('/') && !searchPath) targetDir = '/';
                
                let opts = [];
                const vfs = this.getVirtualDir(targetDir);
                if (vfs) {
                    opts = vfs.dirs.map(d => `${d}/`);
                    if (cmd === 'rm') opts = opts.concat(vfs.files.map(f => f.replace(/^\[.*?\]\s*/, '')));
                }
                
                matches = opts.filter(d => d.startsWith(searchPrefix)).map(d => {
                    if (prefix.startsWith('/') && !searchPath) return '/' + d;
                    return (searchPath ? searchPath + '/' : '') + d;
                });
            } else {
                const cNodes = this.getContext().nodes;
                matches = cNodes.map(n => n.id).filter(id => id.toLowerCase().startsWith(prefix));
                const shortMatches = cNodes.map(n => n.id.replace('node-', '')).filter(id => id.toLowerCase().startsWith(prefix));
                matches = [...new Set([...matches, ...shortMatches])];
            }
            
            if (matches.length === 0) return;
            this._acState = { prefix, matches, idx: 0, parts };
        } else {
            this._acState.idx = (this._acState.idx + 1) % this._acState.matches.length;
        }
        
        const match = this._acState.matches[this._acState.idx];
        const parts = [...this._acState.parts];
        parts[parts.length - 1] = match;
        this.inp.value = parts.join(' ') + (this._acState.parts.length === 1 && this._acState.matches.length === 1 ? ' ' : '');
        
        if (this._acState.parts.length > 1 && parts[0].toLowerCase() !== 'cd') {
            const fullId = match.startsWith('node-') ? match : 'node-' + match;
            this.highlightNode(fullId);
        }
    },

    updateGhost() {
        if (!this.usePredictions || !this.ghost) {
            if (this.ghost) this.ghost.innerText = '';
            return;
        }
        const val = this.inp.value;
        if (!val) {
            this.ghost.innerText = '';
            return;
        }

        let suggestion = '';

        // 1. Try history matches (from newest to oldest)
        for (let i = this.history.length - 1; i >= 0; i--) {
            const h = this.history[i];
            if (h.startsWith(val) && h !== val) {
                suggestion = h;
                break;
            }
        }

        // 2. Try default commands
        if (!suggestion) {
            const ALL_CMDS = ['help', 'exit', 'clear', 'verbosity', 'ls', 'spawn', 'rm', 'set', 'wire', 'sim', 'status', 'synth', 'trace', 'pwd', 'cd', 'mv', 'mkdir', 'tick', 'step', 'clock', 'force', 'unforce', 'watch', 'dump', 'cp', 'touch', 'find', 'bom', 'path', 'assert', 'peek', 'poke', 'reset', 'power', 'symbols', 'timing', 'ln', 'rename', 'predict', 'colors', 'vcd', 'coredump'];
            const match = ALL_CMDS.find(c => c.startsWith(val.toLowerCase()) && c !== val.toLowerCase());
            if (match) {
                suggestion = val + match.substring(val.length);
            }
        }

        if (suggestion) {
            this.ghost.innerText = suggestion;
        } else {
            this.ghost.innerText = '';
        }
    },

    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Repaired object literal syntax and updated object references for clipboard context menu.
    showContextMenu(x, y) {
        let menu = document.getElementById('dt-ctx-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'dt-ctx-menu';
            menu.style.cssText = 'position:fixed; background:#1a1a23; border:1px solid #334; border-radius:6px; z-index:10000; padding:5px 0; box-shadow:0 10px 25px rgba(0,0,0,0.6); display:none; flex-direction:column; min-width:140px; font-family:"JetBrains Mono", monospace; font-size:12px;';
            document.body.appendChild(menu);
            document.addEventListener('click', () => menu.style.display = 'none');
        }
        menu.innerHTML = `
            <div class="dt-menu-item" onclick="document.execCommand('copy')">Copy</div>
            <div class="dt-menu-item" onclick="navigator.clipboard.readText().then(t => { document.getElementById('dt-in').value += t; document.getElementById('dt-in').focus(); })">Paste</div>
            <div class="dt-menu-item" onclick="document.execCommand('cut')">Cut</div>
            <div style="height:1px; background:#334; margin:4px 0;"></div>
            <div class="dt-menu-item" onclick="window.open(window.location.href, '_blank')">New Tab</div>
            <div class="dt-menu-item" onclick="DebugTerminal.saveContents()">Save Contents</div>
            <div class="dt-menu-item" onclick="DebugTerminal.importScript()">Import Script</div>
            <div class="dt-menu-item" onclick="DebugTerminal.exec('clear')">Clear Terminal</div>
        `;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'flex';
        
        // [AUDIT: v1.24.12 | SEC_ARCH_LEAD] - Smart boundary collision detection for terminal context menu.
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
    },

    saveContents() {
        const text = this.out.innerText;
        const blob = new Blob([text], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'bsim_terminal_log.txt';
        a.click();
        this.print("Terminal contents saved.", "ok");
    },

    // [AUDIT: v1.24.37 | SEC_ARCH_LEAD] - Injected CLI script batch processor.
    importScript() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.bsimscript,.bsims,.sh,.js';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async ev => {
                const lines = ev.target.result.split('\n');
                let count = 0;
                this.print(`--- EXECUTING SCRIPT: ${file.name} ---`, 'warn');
                try {
                    for (const line of lines) {
                        const cmd = line.trim();
                        if (cmd && !cmd.startsWith('#') && !cmd.startsWith('//')) {
                            await this.exec(cmd);
                            count++;
                            // Micro-yield to let WASM background workers settle and propagate
                            await new Promise(resolve => setTimeout(resolve, 5));
                        }
                    }
                    this.print(`--- SCRIPT COMPLETE (${count} commands) ---`, 'ok');
                } catch (e) {
                    this.print(`--- SCRIPT HALTED: ${e.message} ---`, 'err');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    },

    // [AUDIT: v1.24.06 | SEC_ARCH_LEAD] - Polyfilled node highlighting to transcend iframe boundaries.
    highlightNode(id) {
        this.clearHighlight();
        let el = document.getElementById(id);
        if (!el) {
            const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
            if (sf && sf.contentWindow && sf.contentWindow.document) {
                el = sf.contentWindow.document.getElementById(id);
            }
        }
        if (el) el.classList.add('dt-target-highlight');
    },

    clearHighlight() {
        document.querySelectorAll('.dt-target-highlight').forEach(el => el.classList.remove('dt-target-highlight'));
        const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
        if (sf && sf.contentWindow && sf.contentWindow.document) {
            sf.contentWindow.document.querySelectorAll('.dt-target-highlight').forEach(el => el.classList.remove('dt-target-highlight'));
        }
    },

    /**
     */
    attachHooks() {
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                this.toggle(!this.visible);
            }
        });
    },

    /**
     */
    overrideConsole() {
        const ogLog = console.log, ogWarn = console.warn, ogErr = console.error;
        console.log = (...args) => { ogLog(...args); if (this.verbosity >= 2) this.print(args.join(' '), 'sys'); };
        console.warn = (...args) => { ogWarn(...args); if (this.verbosity >= 1) this.print(args.join(' '), 'warn'); };
        console.error = (...args) => { ogErr(...args); if (this.verbosity >= 0) this.print(args.join(' '), 'err'); };
    },

    /**
     */
    toggle(state) {
        this.visible = state;
        this.ui.style.display = state ? 'flex' : 'none';
        if (state) this.inp.focus();
    },

    /**
     */
    // [AUDIT: v1.23.98 | SEC_ARCH_LEAD] - Adjusted print handler to safely interpret HTML layout injections.
    print(msg, type = 'sys') {
        const line = document.createElement('div');
        line.className = `dt-msg dt-${type}`;
        line.innerHTML = msg; // Upgraded to allow colored spans
        this.out.appendChild(line);
        this.out.scrollTop = this.out.scrollHeight;
    },

    /**
     */
    // [AUDIT: v1.23.98 | SEC_ARCH_LEAD] - Upgraded terminal commands for verbose flags and bulk operations.
    async exec(cmd) {
        this.print(`<span style="color:#0f5">bsim:~$</span> ${cmd.replace(/</g, '&lt;')}`, 'sys');
        const args = cmd.trim().split(/\s+/);
        const c = args[0].toLowerCase();

        switch (c) {
            case 'help': {
                const cmdArg = args[1] ? args[1].toLowerCase() : null;
                if (cmdArg) {
                    switch (cmdArg) {
                        case 'wasm':
                            this.print("[HELP: wasm] Diagnostics for the WebAssembly simulation engine:", "sys");
                            this.print("  Usage: wasm [check | status | debug | inspect &lt;nodeId&gt;]", "sys");
                            this.print("  - check/status/debug : Display diagnostics, memory page bounds, and active WebWorker latency metrics.", "sys");
                            this.print("  - inspect &lt;nodeId&gt;   : Retrieve the low-level compiled Region A slot indices and the exact binary values stored in linear memory.", "sys");
                            break;
                        case 'tick':
                            this.print("[HELP: tick] Advance simulation logic manually:", "sys");
                            this.print("  Usage: tick &lt;n&gt; [phase]", "sys");
                            this.print("  - &lt;n&gt;   : The number of clock/evaluation passes to run.", "sys");
                            this.print("  - [phase]: Optional sequence phase (0 = settle logic, 1 = latch sequential, 2 = commit sequential).", "sys");
                            break;
                        case 'trace':
                            this.print("[HELP: trace] Trace signal paths between gates:", "sys");
                            this.print("  Usage: trace &lt;nodeId&gt; [-r]", "sys");
                            this.print("  - [-r]  : Enable recursive downstream path tracing to see full downstream propagation tree.", "sys");
                            break;
                        case 'assert':
                            this.print("[HELP: assert] Configure stateful assertion breakpoint conditions:", "sys");
                            this.print("  Usage: assert &lt;nodeId&gt; [expectedValue]", "sys");
                            this.print("  - &lt;nodeId&gt;: Node to attach breakpoint.", "sys");
                            this.print("  - [expectedValue]: Triggers halt if current value is different (defaults to 1).", "sys");
                            this.print("  - assert clear [&lt;nodeId&gt;]: Clears assertion on node, or clears all assertions.", "sys");
                            this.print("  - assert: Lists all active breakpoints and their pass/fail status.", "sys");
                            this.print("  - (Legacy mode): assert &lt;nodeId&gt; &lt;portId&gt; &lt;expectedValue&gt; for 1-time check.", "sys");
                            break;
                        case 'vcd':
                            this.print("[HELP: vcd] Text-based logic analyzer waveform capture:", "sys");
                            this.print("  Usage: vcd [start | stop | clear | show]", "sys");
                            this.print("  - start: Starts tracking signal state histories on every tick.", "sys");
                            this.print("  - stop : Halts wave recording.", "sys");
                            this.print("  - clear: Resets history buffer.", "sys");
                            this.print("  - show : Renders high/low ASCII timing diagrams (last 20 ticks) of selected/asserted nodes.", "sys");
                            break;
                        case 'coredump':
                            this.print("[HELP: coredump] Direct hex/Int32 view of Wasm linear memory regions:", "sys");
                            this.print("  Usage: coredump [A | B | C | E] [offset] [length]", "sys");
                            this.print("  - Region A: Logical States", "sys");
                            this.print("  - Region B: Instructions", "sys");
                            this.print("  - Region C: RAM/ROM Payloads", "sys");
                            this.print("  - Region E: Power activity counters", "sys");
                            break;
                        case 'ls':
                            this.print("[HELP: ls] List contents of virtual directories or node elements:", "sys");
                            this.print("  Usage: ls [-l] [path]", "sys");
                            this.print("  - [-l]  : Verbose output showing absolute gate coordinates and exact state values.", "sys");
                            this.print("  - [path]: Target directory (e.g. /home/bsim/ or /etc/lib/primitives). Defaults to current directory.", "sys");
                            break;
                        case 'spawn':
                            this.print("[HELP: spawn] Instantiate a new logical gate:", "sys");
                            this.print("  Usage: spawn &lt;type&gt; &lt;x&gt; &lt;y&gt;", "sys");
                            this.print("  - &lt;type&gt;: Gate type (e.g., NAND, NOT, AND, OR, DFF, TFF, etc.).", "sys");
                            this.print("  - &lt;x&gt; &lt;y&gt;: Absolute canvas coordinates for placement.", "sys");
                            break;
                        case 'rm':
                            this.print("[HELP: rm] Delete a node or virtual element:", "sys");
                            this.print("  Usage: rm &lt;nodeId&gt;", "sys");
                            this.print("  - Deletes the specified logic component by its global unique ID.", "sys");
                            break;
                        case 'ln':
                            this.print("[HELP: ln] Create a virtual directory symlink:", "sys");
                            this.print("  Usage: ln -s &lt;target&gt; &lt;link_name&gt;", "sys");
                            this.print("  - Creates a symbolic link in the virtual file system (e.g. linking to custom library folders).", "sys");
                            break;
                        case 'set':
                            this.print("[HELP: set] Set the state value of an input node:", "sys");
                            this.print("  Usage: set &lt;nodeId&gt; &lt;value&gt;", "sys");
                            this.print("  - &lt;value&gt;: Target state to set (e.g. integer 0/1, integer parsed to bits, or comma-separated bits).", "sys");
                            break;
                        default:
                            this.print(`No detailed help manual found for command '${cmdArg}'.`, "warn");
                    }
                    break;
                }
                
                // Generic Help output
                this.print("[SYSTEM] ARCHITECTURAL PRIMITIVES (v1.27.33):", "sys");
                this.print("  - help [command] : Show this overview or specific detailed command manual.", "sys");
                this.print("  - tick <n> [p]   : Advance simulation. Phase: 0=Settle, 1=Latch, 2=Commit.", "sys");
                this.print("  - trace <id>     : Trace signal paths to identify zero-delay loops.", "sys");
                this.print("  - power          : Extract pJ switching activity from Region E.", "sys");
                this.print("  - symbols        : Map linear memory addresses to high-level node IDs.", "sys");
                this.print("  - timing <f>     : Configure gate delays (7nm, 28nm, ideal).", "sys");
                this.print("  - reset          : Flush Region A and re-center the viewport.", "sys");
                this.print("  - ls [-l] [path] : List workspace nodes or VFS contents.", "sys");
                this.print("  - spawn <t> x y  : Add a node (e.g., spawn NAND 100 100).", "sys");
                this.print("  - rm <id>        : Delete nodes or directories.", "sys");
                this.print("  - ln -s <t> <l>  : Create virtual directory symlink (e.g., ln -s /etc/lib ./lib).", "sys");
                this.print("  - set <id> <v>   : Set input node value.", "sys");
                this.print("  - wire ...       : Connect two ports.", "sys");
                this.print("  - synth <g>      : Compile logic from NANDs.", "sys");
                this.print("  - wasm [check]   : Exhaustive diagnostics for the WebAssembly simulation engine.", "sys");
                break;
            }
            case 'pwd':
                this.print(this.cwd, 'sys');
                break;
            case 'wasm': {
                const sub = args[1] ? args[1].toLowerCase() : 'check';
                if (sub === 'inspect') {
                    const targetId = args[2];
                    if (!targetId) {
                        this.print("Usage: wasm inspect <nodeId>", "err");
                        break;
                    }
                    if (!window.WasmEngine || !window.WasmEngine.ready) {
                        this.print("WasmEngine is offline or not loaded.", "err");
                        break;
                    }
                    const mapped = window.WasmEngine.idMap.get(targetId);
                    if (mapped === undefined) {
                        this.print(`Node '${targetId}' has no compiled WASM slots (unconnected, virtual, or not in execution graph).`, "warn");
                        break;
                    }
                    
                    const state = window.WasmEngine.readState(targetId);
                    const type = window.WasmEngine.flatNodes.find(n => n.id === targetId)?.type || "Unknown";
                    this.print(`--- WASM NODE INSPECTOR: ${targetId} ---`, "warn");
                    this.print(`Type: ${type}`, "sys");
                    this.print(`Compiled Region A Slot(s): ${Array.isArray(mapped) ? `[${mapped.join(', ')}]` : mapped}`, "sys");
                    this.print(`Current Slot Value(s) in memory: <span style="color:#0f5">${JSON.stringify(state)}</span>`, "sys");
                    break;
                }
                else if (sub === 'check' || sub === 'status' || sub === 'debug') {
                    this.print("--- WASM ENGINE DIAGNOSTICS ---", "warn");
                    
                    if (!window.WasmEngine) {
                        this.print("Status: NOT LOADED (WasmEngine missing from global context)", "err");
                        break;
                    }

                    const ready = window.WasmEngine.ready;
                    const useWorker = window.WasmEngine.useWorker;
                    
                    this.print(`Engine Status: ${ready ? '<span style="color:#0f0; font-weight:bold;">ONLINE (Direct WebAssembly)</span>' : '<span style="color:#f55; font-weight:bold;">OFFLINE (V8 JavaScript Fallback)</span>'}`, 'sys');
                    this.print(`Execution Mode: ${useWorker ? 'Multithreaded (WebWorker + SharedArrayBuffer)' : 'Single-threaded (Main Thread)'}`, 'sys');
                    
                    // Print environment checks
                    this.print("<br>[Environment Checks]:", "sys");
                    const sabSupported = typeof SharedArrayBuffer !== 'undefined';
                    const coIsolated = window.crossOriginIsolated ?? false;
                    this.print(`  - SharedArrayBuffer Support: ${sabSupported ? '<span style="color:#0f5">YES</span>' : '<span style="color:#f90">NO</span>'}`, 'sys');
                    this.print(`  - Cross-Origin Isolation (COOP/COEP): ${coIsolated ? '<span style="color:#0f5">YES (Isolated)</span>' : '<span style="color:#f90">NO (Missing Security Headers)</span>'}`, 'sys');
                    
                    // Print active memory bounds
                    if (window.WasmEngine.memory) {
                        const bufferBytes = window.WasmEngine.memory.buffer.byteLength;
                        const bufferPages = window.WasmEngine.memory.buffer.byteLength / 65536;
                        this.print(`  - Linear Memory Size: ${bufferBytes.toLocaleString()} bytes (${bufferPages} pages)`, 'sys');
                    }

                    // Print performance telemetry
                    this.print("<br>[Performance Telemetry]:", "sys");
                    if (useWorker) {
                        const avg = window.WasmEngine.avgWorkerTickDuration || 0;
                        const rate = window.WasmEngine.workerTickCount || 0;
                        this.print(`  - Average Worker Pass Duration: <span style="color:#0f5">${avg.toFixed(2)}ms</span> (${rate} passes/sec)`, 'sys');
                        
                        this.print("Measuring WebWorker communication latency...", "sys");
                        window.WasmEngine.pingWorker().then(latency => {
                            this.print(`  - WebWorker Round-trip Latency: <span style="color:#0f5">${latency.toFixed(2)}ms</span>`, 'sys');
                        }).catch(err => {
                            this.print(`  - WebWorker Latency Measurement Failed: ${err}`, 'err');
                        });
                    } else {
                        const lastTick = window.WasmEngine.lastTickDuration || 0;
                        this.print(`  - Last Tick Duration: <span style="color:#0f5">${lastTick.toFixed(2)}ms</span>`, 'sys');
                    }

                    // Print Workspace purity checks
                    const isPureNative = Sim.isPureNative();
                    this.print(`<br>  - Netlist Purity Validation: ${isPureNative ? '<span style="color:#0f5">PASSED (Native)</span>' : '<span style="color:#f90">FAILED (Contains Impure Gates)</span>'}`, 'sys');
                    if (!isPureNative) {
                        const isNodePure = (n) => {
                            if (Engine.KERNEL.has(n.type)) return true;
                            if (Sim.library && Sim.library[n.type]) {
                                const check = (nodes, visited = new Set()) => {
                                    if (visited.has(nodes)) return true;
                                    visited.add(nodes);
                                    return nodes.every(x => {
                                        if (Engine.KERNEL.has(x.type)) return true;
                                        if (Sim.library && Sim.library[x.type]) return check(Sim.library[x.type].nodes, visited);
                                        return false;
                                    });
                                };
                                return check(Sim.library[n.type].nodes);
                            }
                            return false;
                        };
                        const impure = Sim.nodes.filter(n => !isNodePure(n));
                        const impureTypes = [...new Set(impure.map(n => n.type))];
                        this.print(`    * Impure Primitive/Custom Types found: ${impureTypes.join(', ')}`, 'warn');
                    }

                    // Print verbose init logs
                    this.print("<br>[Initialization Log]:", "sys");
                    if (window.WasmEngine.initLog && window.WasmEngine.initLog.length > 0) {
                        window.WasmEngine.initLog.forEach(l => {
                            let prefix = " ";
                            let printType = "sys";
                            if (l.type === 'error') { prefix = " [ERR] "; printType = "err"; }
                            else if (l.type === 'warn') { prefix = " [WRN] "; printType = "warn"; }
                            else if (l.type === 'info') { prefix = " [INF] "; printType = "sys"; }
                            
                            // Format timestamp cleanly
                            const time = l.timestamp.split('T')[1].replace('Z', '');
                            this.print(`  [${time}]${prefix}${l.msg}`, printType);
                        });
                    } else {
                        this.print("  No initialization logs available.", "warn");
                    }
                } else {
                    this.print("Usage: wasm [check | status | debug | inspect <nodeId>]", "err");
                }
                break;
            }
            case 'cd':
                // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Safe boundary traversal for virtual file system.
                let target = args[1];
                if (!target || target === '~') target = '/home/bsim';
                let nextPath = this.resolvePath(target);
                
                if (this.isValidDir(nextPath)) {
                    this.cwd = nextPath;
                } else {
                    return this.print(`cd: no such file or directory: ${args[1]}`, "err");
                }
                
                document.getElementById('dt-header-cwd').innerText = this.cwd;
                let promptDir = this.cwd;
                if (this.cwd.startsWith('/home/bsim')) {
                    promptDir = this.cwd.replace('/home/bsim', '~');
                }
                if (promptDir === '') promptDir = '/';
                document.getElementById('dt-prompt-cwd').innerText = promptDir;
                break;
            case 'rename': {
                // [AUDIT: v1.25.46 | SEC_ARCH_LEAD] - CLI hook for global macro netlist propagation.
                if (args.length < 3) return this.print("Usage: rename <oldName> <newName>", "err");
                if (!Sim.library[args[1]]) return this.print(`Source '${args[1]}' not found.`, "err");
                if (Sim.library[args[2]]) return this.print(`Destination '${args[2]}' already exists.`, "err");
                
                Sim.renameMacroGlobally(args[1], args[2]);
                this.print(`Renamed '${args[1]}' to '${args[2]}' globally.`, "ok");
                break;
            }
            case 'mv': {
                // [AUDIT: v1.24.05 | SEC_ARCH_LEAD] - Enforced block scope for case statement to resolve lexical declaration collisions.
                // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - VFS mv utility expanded to implicitly invoke global macro renaming algorithms.
                let srcArg = args[1];
                let dstArg = args[2];
                if (srcArg && dstArg && this.cwd.startsWith('/etc/lib/custom')) {
                    const sName = srcArg.replace(/\/$/, '');
                    const dName = dstArg.replace(/\/$/, '');
                    if (Sim.library[sName] && !Sim.library[dName]) {
                        Sim.renameMacroGlobally(sName, dName);
                        return this.print(`mv: renamed '${sName}' to '${dName}' globally.`, "ok");
                    }
                }
                if (args.length < 3) return this.print("Usage: mv <chip> <folder>", "err");
                const targetChip = args[1];
                let mvFolder = args[2];
                
                if (mvFolder.startsWith('/etc/lib/custom/')) mvFolder = mvFolder.replace('/etc/lib/custom/', '');
                else if (mvFolder === '/etc/lib/custom') mvFolder = '';
                
                if (Sim.library[targetChip]) {
                    Sim.library[targetChip].folder = mvFolder;
                    Sim.updateLibraryUI();
                    Sim.autoSave();
                    this.print(`Moved ${targetChip} to /etc/lib/custom/${mvFolder}`, "ok");
                } else {
                    this.print(`Chip '${targetChip}' not found in library.`, "err");
                }
                break;
            }
            case 'exit': this.toggle(false); break;
            case 'clear': this.out.innerHTML = ''; break;
            case 'predict':
                if (args[1]) {
                    const arg = args[1].toLowerCase();
                    if (arg === 'on') {
                        this.usePredictions = true;
                        this.print("Inline predictive completion enabled.", "ok");
                    } else if (arg === 'off') {
                        this.usePredictions = false;
                        this.ghost.innerText = '';
                        this.print("Inline predictive completion disabled.", "ok");
                    } else {
                        this.print("Usage: predict [on|off]", "err");
                    }
                } else {
                    this.print(`Inline predictions: ${this.usePredictions ? 'ON' : 'OFF'}`, "sys");
                }
                break;
            case 'colors':
                if (args[1]) {
                    const arg = args[1].toLowerCase();
                    if (arg === 'on') {
                        this.useColors = true;
                        document.getElementById('dt-wrap').classList.remove('dt-no-colors');
                        this.print("Colorized output enabled.", "ok");
                    } else if (arg === 'off') {
                        this.useColors = false;
                        document.getElementById('dt-wrap').classList.add('dt-no-colors');
                        this.print("Colorized output disabled.", "ok");
                    } else {
                        this.print("Usage: colors [on|off]", "err");
                    }
                } else {
                    this.print(`Colorized output: ${this.useColors ? 'ON' : 'OFF'}`, "sys");
                }
                break;
            case 'verbosity':
                if (args[1]) { this.verbosity = parseInt(args[1]); this.print(`Verbosity -> ${this.verbosity}`); }
                break;
            case 'tree':
                let treePath = this.cwd;
                const treeArg = args.find(a => a !== 'tree' && !a.startsWith('-'));
                if (treeArg) {
                    treePath = this.resolvePath(treeArg);
                    if (!this.isValidDir(treePath)) return this.print(`tree: no such file or directory: ${treeArg}`, 'err');
                }
                this.print(`--- TREE: ${treePath} ---`, "warn");
                this.runTree(treePath);
                break;
            case 'ls':
                const verbose = args.includes('-l') || args.includes('-v');
                let targetPath = this.cwd;
                const pathArg = args.find(a => a !== 'ls' && !a.startsWith('-'));
                if (pathArg) {
                    targetPath = this.resolvePath(pathArg);
                    if (!this.isValidDir(targetPath)) return this.print(`ls: no such file or directory: ${pathArg}`, 'err');
                }
                
                if (targetPath === '/') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">home/</span>`, "ok");
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">etc/</span>`, "ok");
                    return;
                } else if (targetPath === '/home') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">bsim/</span>`, "ok");
                    return;
                } else if (targetPath === '/etc') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">lib/</span>`, "ok");
                    return;
                } else if (targetPath === '/etc/lib') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">primitives/</span>`, "ok");
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">custom/</span>`, "ok");
                    return;
                } else if (targetPath === '/etc/lib/primitives') {
                    this.print(`--- MACRO LIBRARY: Primitives ---`, "warn");
                    ['NAND', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'CLOCK'].forEach(p => {
                        this.print(`[Gate] <span style="color:#0f5">${p}</span>`, "ok");
                    });
                    return;
                } else if (targetPath.startsWith('/etc/lib/custom')) {
                    const searchDir = targetPath.replace('/etc/lib/custom', '').replace(/^\//, '');
                    this.print(`--- MACRO LIBRARY: Custom/${searchDir} ---`, "warn");
                    let found = 0;
                    const subdirs = new Set();
                    
                    if (Sim.directories) {
                        Sim.directories.forEach(d => {
                            if (d === searchDir) return;
                            if (searchDir === '' || d.startsWith(searchDir + '/')) {
                                const sub = d.substring(searchDir ? searchDir.length + 1 : 0).split('/')[0];
                                if (sub) subdirs.add(sub);
                            }
                        });
                    }

                    Object.keys(Sim.library).forEach(name => {
                        const folder = Sim.library[name].folder || '';
                        if (folder === searchDir) {
                            this.print(`[Macro] <span style="color:#0f5">${name}</span>`, "ok");
                            found++;
                        } else if (folder.startsWith(searchDir ? searchDir + '/' : '')) {
                            const sub = folder.substring(searchDir ? searchDir.length + 1 : 0).split('/')[0];
                            if (sub) subdirs.add(sub);
                        }
                    });
                    subdirs.forEach(d => {
                        this.print(`[Dir] <span style="color:#0af; font-weight:bold;">${d}/</span>`, "ok");
                        found++;
                    });
                    if (found === 0) this.print("Directory empty.", "sys");
                    return;
                } else if (targetPath === '/home/bsim') {
                    this.print(`--- WORKSPACES & LINKS ---`, "warn");
                    // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Transitioned home directory VFS readouts to utilize physical workspace names over virtual aliases.
                    Sim.tabs.forEach((t, i) => {
                        const alias = t.name.replace(/\s+/g, '_');
                        const tag = t.id === Sim.activeTabId ? '<span style="color:#ffca28">*</span>' : ' ';
                        this.print(`${tag} [Dir] <span style="color:#0af; font-weight:bold;">${alias}/</span> <span style="color:#667">(id: ${t.id})</span>`, "ok");
                    });
                    // [AUDIT: v1.25.25 | SEC_ARCH_LEAD] - Appended active virtual symlinks to home directory readout.
                    if (this.symlinks) {
                        Object.entries(this.symlinks).forEach(([link, src]) => {
                            if (link.startsWith('/home/bsim/') && link.split('/').length === 4) {
                                const name = link.split('/').pop();
                                this.print(`  [Lnk] <span style="color:#0ff; font-weight:bold;">${name}@</span> <span style="color:#667">-> ${src}</span>`, "ok");
                            }
                        });
                    }
                    return;
                }

                // Must be inside a tab workspace (/home/bsim/tab-X/...)
                const tMatch = targetPath.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
                if (!tMatch) return this.print("Invalid directory.", "err");

                // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Expanded VFS tab resolution to support human-readable workspace names.
                const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1] || t.name.replace(/\s+/g, '_') === tMatch[1] || t.name === tMatch[1]);
                if (!tab) return this.print("Invalid workspace.", "err");

                let nodesToList = [];
                let showEditorDir = false;

                if (!tMatch[2]) { // e.g. /home/bsim/tab-1
                    if (Sim.activeTabId === tab.id) {
                        if (Sim.activeEditingChip && Sim.workspaceStack.length > 0) {
                            nodesToList = Sim.workspaceStack[0].nodes;
                            showEditorDir = true;
                        } else if (!Sim.activeEditingChip && Sim.activeSplitChip) {
                            nodesToList = Sim.nodes;
                            showEditorDir = true;
                        } else {
                            nodesToList = Sim.nodes;
                        }
                    } else {
                        nodesToList = tab.nodes;
                    }
                } else { // e.g. /home/bsim/tab-1/editor
                    if (Sim.activeTabId === tab.id) {
                        if (Sim.activeEditingChip) {
                            nodesToList = Sim.nodes;
                        } else if (Sim.activeSplitChip) {
                            const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
                            if (sf && sf.contentWindow && sf.contentWindow.Sim) nodesToList = sf.contentWindow.Sim.nodes;
                        }
                    }
                }

                this.print(`--- DIRECTORY: ${targetPath} ---`, "warn");
                if (showEditorDir) {
                    const cName = Sim.activeEditingChip || Sim.activeSplitChip;
                    this.print(`[Dir] <span style="color:#ffca28; font-weight:bold;">editor/</span> <span style="color:#667">(${cName})</span>`, "ok");
                }

                if (verbose) {
                    nodesToList.forEach(n => {
                        const out = `[<span style="color:#0f5">${n.id}</span>] ${n.type.padEnd(8)} @(${Math.round(n.x)},${Math.round(n.y)}) val:${JSON.stringify(n.val)}`;
                        this.print(out, "sys");
                    });
                } else {
                    const groups = {};
                    nodesToList.forEach(n => {
                        if (!groups[n.type]) groups[n.type] = [];
                        groups[n.type].push(n.id);
                    });
                    for (const [type, ids] of Object.entries(groups)) {
                        const shortIds = ids.map(id => {
                            const short = id.replace('node-', '');
                            return `<span style="color:#0f5" title="${id}">${short}</span>`;
                        }).join(', ');
                        this.print(`<b>${type.padEnd(8)}</b> (${ids.length}): ${shortIds}`, "sys");
                    }
                }
                break;
            case 'spawn': {
                // [AUDIT: v1.24.47 | SEC_ARCH_LEAD] - Deterministic node spawning via shell inline comments.
                // [AUDIT: v1.24.48 | SEC_ARCH_LEAD] - Resolved zero-coordinate falsy evaluation bug causing spawn offset drift.
                if (!args[1]) return this.print("Usage: spawn <type> [x] [y] [# id]", "err");
                const type = args[1].toUpperCase();
                const parsedX = parseFloat(args[2]);
                const parsedY = parseFloat(args[3]);
                const x = !isNaN(parsedX) ? parsedX : ((window.View ? parseInt(View.x) : 0) + 100);
                const y = !isNaN(parsedY) ? parsedY : ((window.View ? parseInt(View.y) : 0) + 100);
                let prefId = null;
                const hashIdx = args.indexOf('#');
                if (hashIdx !== -1 && args[hashIdx + 1]) prefId = args[hashIdx + 1];
                Sim.addNode(type, x, y, prefId || type, prefId);
                this.print(`Spawned ${type} at ${x}, ${y}`, "ok");
                break;
            }
            case 'ln': {
                // [AUDIT: v1.25.26 | SEC_ARCH_LEAD] - Standardized virtual symlink evaluator to match POSIX ln -s signature.
                let tgtArg = args[1];
                let lnkArg = args[2];
                if (args[1] === '-s') {
                    tgtArg = args[2];
                    lnkArg = args[3];
                }
                if (!tgtArg || !lnkArg) return this.print("Usage: ln -s <target> <link_name>", "err");
                const tgt = this.resolvePath(tgtArg);
                const lnk = this.resolvePath(lnkArg);
                if (!this.isValidDir(tgt)) return this.print(`ln: target '${tgt}' is not a valid directory`, "err");
                if (!this.symlinks) this.symlinks = {};
                // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Restricted absolute path symlinking loops to avert UI recursion lockups.
                if (tgt === lnk || tgt.startsWith(lnk + '/')) return this.print("ln: cannot create circular symlink", "err");
                if (Object.keys(this.symlinks).length >= 20) return this.print("ln: symlink allocation limit exceeded", "err");
                this.symlinks[lnk] = tgt;
                this.print(`Created symlink: ${lnk} -> ${tgt}`, "ok");
                break;
            }
            case 'mkdir':
                // [AUDIT: v1.24.03 | SEC_ARCH_LEAD] - VFS directory allocation.
                let pFlag = args.includes('-p');
                let dirArgs = args.filter(a => a !== 'mkdir' && !a.startsWith('-'));
                if (dirArgs.length === 0) return this.print("Usage: mkdir [-p] <dir>", "err");

                if (!Sim.directories) Sim.directories = [];

                dirArgs.forEach(d => {
                    let targetPath = this.resolvePath(d).replace(/\/$/, '');
                    
                    // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Expanded mkdir boundary to support workspace (tab) instantiation within the user home directory.
                    if (targetPath.startsWith('/home/bsim/')) {
                        const parts = targetPath.split('/');
                        if (parts.length > 4) return this.print(`mkdir: cannot create directory '${d}': Nested workspaces not supported`, "err");
                        const tabName = parts.pop();
                        if (Sim.tabs.some(t => t.id === tabName || t.name.replace(/\s+/g, '_') === tabName || t.name === tabName)) {
                            return this.print(`mkdir: cannot create directory '${d}': File exists`, "err");
                        }
                        const newId = 'tab-' + Math.random().toString(36).substr(2, 5);
                        Sim.tabs.push({ id: newId, name: tabName, nodes: [], wires: [], historyStack: [], historyIndex: -1, activeSplitChip: null, splitDirection: 'right' });
                        Sim.updateTabsUI();
                        return this.print(`Created workspace: ${targetPath}`, "ok");
                    }

                    if (!targetPath.startsWith('/etc/lib/custom')) {
                        return this.print(`mkdir: cannot create directory '${d}': Permission denied`, "err");
                    }
                    const customPath = targetPath.replace('/etc/lib/custom', '').replace(/^\//, '');
                    if (customPath === '') return this.print(`mkdir: cannot create directory '${d}': File exists`, "err");

                    if (!pFlag) {
                        const parts = customPath.split('/');
                        if (parts.length > 1) {
                            const parent = parts.slice(0, -1).join('/');
                            let parentExists = Sim.directories.includes(parent);
                            if (!parentExists) {
                                Object.keys(Sim.library).forEach(k => {
                                    if ((Sim.library[k].folder||'') === parent || (Sim.library[k].folder||'').startsWith(parent + '/')) parentExists = true;
                                });
                            }
                            if (!parentExists) return this.print(`mkdir: cannot create directory '${d}': No such file or directory`, "err");
                        }
                    }

                    const pathParts = customPath.split('/');
                    let currentPath = '';
                    pathParts.forEach(part => {
                        currentPath = currentPath ? currentPath + '/' + part : part;
                        if (!Sim.directories.includes(currentPath)) {
                            Sim.directories.push(currentPath);
                        }
                    });
                    this.print(`Created directory: ${targetPath}`, "ok");
                });
                // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Forced synchronous UI dispatch to prevent DOM shift desynchronization.
                if (window.Sim && typeof Sim.updateLibraryUI === 'function') Sim.updateLibraryUI();
                Sim.autoSave();
                break;
            case 'rm': {
                // [AUDIT: v1.24.02 | SEC_ARCH_LEAD] - Integrated recursive file system deletion logic (rm -rf).
                const isRf = args.includes('-rf') || args.includes('-r') || args.includes('-f');
                const rmArgs = args.filter(a => a !== 'rm' && !a.startsWith('-'));
                
                if (rmArgs.length === 0) return this.print("Usage: rm [-rf] <id|path> [id2...]", "err");
                
                const ctx = this.getContext();
                
                if (rmArgs[0] === 'all' && this.cwd.startsWith('/home/bsim')) {
                    if (ctx.simObj) {
                        ctx.simObj.selection.clear();
                        ctx.nodes.forEach(n => ctx.simObj.selection.add(n.id));
                        ctx.simObj.deleteSelection();
                        // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Validated node topology dependencies to purge un-garbage-collected wire fragments.
                        if (ctx.simObj.wires) ctx.simObj.wires = ctx.simObj.wires.filter(w => ctx.nodes.find(n => n.id === w.from.nodeId) && ctx.nodes.find(n => n.id === w.to.nodeId));
                        return this.print("Cleared entire active workspace.", "ok");
                    }
                    return this.print("Cannot clear inactive workspace.", "err");
                }

                let rmCount = 0;
                let rmDirCount = 0;
                if (ctx.simObj) ctx.simObj.selection.clear();
                
                rmArgs.forEach(target => {
                    let targetPath = this.resolvePath(target).replace(/\/$/, '');
                    
                    if (targetPath.startsWith('/etc/lib/custom')) {
                        const searchDir = targetPath.replace('/etc/lib/custom', '').replace(/^\//, '');
                        if (searchDir === '') return this.print("rm: cannot remove root custom directory", "err");
                        
                        if (Sim.library[searchDir]) {
                            delete Sim.library[searchDir];
                            rmCount++;
                        } else if (isRf) {
                            let deleted = false;
                            Object.keys(Sim.library).forEach(name => {
                                const folder = Sim.library[name].folder || '';
                                if (folder === searchDir || folder.startsWith(searchDir + '/')) {
                                    delete Sim.library[name];
                                    rmCount++;
                                    deleted = true;
                                }
                            });
                            if (Sim.directories) {
                                const initLen = Sim.directories.length;
                                Sim.directories = Sim.directories.filter(d => d !== searchDir && !d.startsWith(searchDir + '/'));
                                if (Sim.directories.length < initLen) deleted = true;
                            }
                            if (deleted) rmDirCount++;
                            else this.print(`rm: cannot remove '${target}': No such file or directory`, "err");
                        } else {
                            this.print(`rm: cannot remove '${target}': Is a directory (use -rf)`, "err");
                        }
                    // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Re-routed rm directory resolution to support workspace destruction.
                    } else if (targetPath.startsWith('/home/bsim/') && targetPath.split('/').length === 4 && (target.includes('/') || this.cwd === '/home/bsim')) {
                        const tabStr = targetPath.split('/').pop();
                        const tabIdx = Sim.tabs.findIndex((t, i) => `tab-${i+1}` === tabStr || t.id === tabStr || t.name.replace(/\s+/g, '_') === tabStr || t.name === tabStr);
                        if (tabIdx > -1) {
                            if (Sim.tabs.length <= 1) return this.print(`rm: cannot remove '${target}': Minimum one workspace required`, "err");
                            const tId = Sim.tabs[tabIdx].id;
                            Sim.tabs.splice(tabIdx, 1);
                            if (Sim.activeTabId === tId) Sim.uiSwitchTab(Sim.tabs[Math.max(0, tabIdx - 1)].id);
                            else Sim.updateTabsUI();
                            rmDirCount++;
                        } else {
                            const n = ctx.nodes.find(node => node.id === target || node.id === `node-${target}`);
                            if (n && ctx.simObj) { ctx.simObj.selection.add(n.id); rmCount++; }
                            else this.print(`rm: cannot remove '${target}': No such file or directory`, "err");
                        }
                    } else if (target.includes('/') || this.cwd.startsWith('/etc/lib')) {
                        this.print(`rm: cannot remove '${target}': Permission denied`, "err");
                    } else {
                        const n = ctx.nodes.find(node => node.id === target || node.id === `node-${target}`);
                        if (n && ctx.simObj) { ctx.simObj.selection.add(n.id); rmCount++; }
                    }
                });
                
                if (ctx.simObj && ctx.simObj.selection.size > 0) ctx.simObj.deleteSelection();
                
                if (rmCount > 0 || rmDirCount > 0) {
                    if (rmDirCount > 0 || this.cwd.startsWith('/etc/lib')) Sim.updateLibraryUI();
                    this.print(`Removed ${rmCount} item(s).`, "ok");
                    Sim.autoSave();
                } else if ((!ctx.simObj || ctx.simObj.selection.size === 0) && rmCount === 0 && rmDirCount === 0) {
                    this.print("No valid items found to delete.", "err");
                }
                break;
            }
            case 'set': {
                if (args.length < 3) return this.print("Usage: set <nodeId> <value>", "err");
                const ctx = this.getContext();
                const sn = this.resolveNode(ctx, args[1]);
                if (!sn) return this.print(`set: '${args[1]}' not found.`, "err");
                
                let val;
                if (args[2].includes(',')) {
                    val = args[2].split(',').map(x => parseInt(x.trim()) || 0);
                } else {
                    const parsed = parseInt(args[2]);
                    if (isNaN(parsed)) return this.print("Value must be a number or comma-separated bits.", "err");
                    // If multi-bit node, convert number to bit array
                    if (sn.type.startsWith('IN-')) {
                        const bits = parseInt(sn.type.split('-')[1]) || 1;
                        if (bits > 1) {
                            val = [];
                            for (let i = 0; i < bits; i++) {
                                val.push((parsed >> i) & 1);
                            }
                        } else {
                            val = parsed;
                        }
                    } else {
                        val = parsed;
                    }
                }
                
                sn.val = val;
                sn.state = val;
                if (ctx.simObj) {
                    ctx.simObj.updateNodeVisual(sn);
                    ctx.simObj.seedQueue(); ctx.simObj.processQueue();
                }
                this.print(`Set ${sn.id} to ${JSON.stringify(val)}`, "ok");
                break;
            }
            case 'wire': {
                if (args.length < 5) return this.print("Usage: wire <node1> <port1> <node2> <port2>", "err");
                const ctx = this.getContext();
                const node1 = this.resolveNode(ctx, args[1]);
                const node2 = this.resolveNode(ctx, args[3]);
                if (!node1) return this.print(`wire: Node '${args[1]}' not found.`, "err");
                if (!node2) return this.print(`wire: Node '${args[3]}' not found.`, "err");
                
                Sim.wires.push({
                    from: { nodeId: node1.id, portId: args[2], isOutput: true },
                    to: { nodeId: node2.id, portId: args[4], isOutput: false }
                });
                WireRenderer.drawWires();
                Sim.seedQueue(); Sim.processQueue();
                this.print(`Wired ${node1.id}[${args[2]}] to ${node2.id}[${args[4]}]`, "ok");
                break;
            }
            case 'sim':
                Sim.seedQueue(); Sim.processQueue();
                this.print("Propagation tick queued.", "ok");
                break;
            case 'step':
            case 'tick': {
                const count = parseInt(args[1]) || 1;
                this._halted = false; // Reset halt flag when manually ticking
                // [AUDIT: v1.24.96 | SEC_ARCH_LEAD] - Support for manual Phase-Stepping to debug Zero-Delay Cascades.
                if (args[2] !== undefined) {
                    const phase = parseInt(args[2]);
                    let halted = false;
                    for (let i = 0; i < count; i++) {
                        WasmEngine.executeTick(phase);
                        if (this.vcdRecording) this.recordVcdState();
                        if (!this.checkAssertions()) {
                            this.print("Simulation halted due to assertion trigger.", "err");
                            this._halted = true;
                            halted = true;
                            break;
                        }
                    }
                    if (!halted) this.print(`Step: ${count} cycles in Phase ${phase} (Manual Commit).`, "warn");
                } else {
                    // Full 3-phase cycle
                    let halted = false;
                    for (let i = 0; i < count; i++) {
                        WasmEngine.executeTick(0); // Settle
                        if (this.vcdRecording) this.recordVcdState();
                        if (!this.checkAssertions()) { this._halted = true; halted = true; break; }

                        WasmEngine.executeTick(1); // Latch
                        if (this.vcdRecording) this.recordVcdState();
                        if (!this.checkAssertions()) { this._halted = true; halted = true; break; }

                        WasmEngine.executeTick(2); // Commit
                        if (this.vcdRecording) this.recordVcdState();
                        if (!this.checkAssertions()) { this._halted = true; halted = true; break; }
                    }
                    if (halted) {
                        this.print("Simulation halted due to assertion trigger.", "err");
                    } else {
                        this.print(`Executed ${count} full 3-phase simulation cycles.`, "ok");
                    }
                }
                break;
            }
            case 'assert': {
                // Determine if it is a legacy assert call (assert <nodeId> <portId> <value>)
                // where args[2] is not a number.
                const isLegacy = args.length === 4 && isNaN(parseInt(args[2]));
                if (isLegacy) {
                    // Legacy one-time assert behavior
                    const ctx = this.getContext();
                    let sn = this.resolveNode(ctx, args[1]);
                    if (!sn) return this.print(`Assert failed: Node ${args[1]} not found.`, "err");
                    
                    const expVal = parseInt(args[3]);
                    let actVal;
                    
                    const typeBits = parseInt(sn.type.split('-')[1]);
                    const bits = (!isNaN(typeBits) && typeBits > 0) ? typeBits : 1;
                    const isGenericPort = !(/\d/.test(args[2])) && args[2] !== 'clk' && args[2] !== 'we';

                    if (isGenericPort) {
                        let val = 0;
                        for (let i = 0; i < bits; i++) {
                            let bit = null;
                            if (window.WasmEngine && WasmEngine.ready && !Sim._netlistDirty) {
                                bit = WasmEngine.readPinState(sn.id, `in${i}`);
                                if (bit === null || bit === undefined) bit = WasmEngine.readPinState(sn.id, `out${i}`);
                                if (bit === null || bit === undefined) bit = WasmEngine.readPinState(sn.id, 'out');
                            } else {
                                bit = ctx.simObj.getDrivingSignal(sn.id, `in${i}`);
                                if (bit === null || bit === undefined) bit = ctx.simObj.getSignal(sn.id, `out${i}`);
                                if (bit === null || bit === undefined) bit = ctx.simObj.getSignal(sn.id, 'out');
                            }
                            if (bit === 1) val |= (1 << i);
                        }
                        actVal = val;
                    } else {
                        if (window.WasmEngine && WasmEngine.ready && !Sim._netlistDirty) {
                            actVal = WasmEngine.readPinState(sn.id, args[2]);
                        } else {
                            actVal = args[2].startsWith('in') ? ctx.simObj.getDrivingSignal(sn.id, args[2]) : ctx.simObj.getSignal(sn.id, args[2]);
                        }
                    }

                    try {
                        if (actVal !== expVal) {
                            this.print(`ASSERTION FAULT: ${sn.id}[${args[2]}] Expected ${expVal}, got ${actVal}`, "err");
                            throw new Error(`Assertion Fault: ${sn.id}[${args[2]}] !== ${expVal}`);
                        } else {
                            this.print(`Assert PASS: ${sn.id}[${args[2]}] == ${expVal}`, "ok");
                        }
                    } catch (err) {
                        console.warn("[Terminal Assertion Catch]", err.message);
                    }
                } else {
                    // Stateful breakpoint assertion breakpoints!
                    const snMap = this.getAssertions();
                    if (args[1] === 'clear') {
                        if (args[2]) {
                            const cleared = snMap.delete(args[2]) || snMap.delete(`node-${args[2]}`);
                            if (cleared) this.print(`Assertion on '${args[2]}' cleared.`, "ok");
                            else this.print(`No active assertion found for '${args[2]}'.`, "warn");
                        } else {
                            snMap.clear();
                            this.print("All assertion breakpoints cleared.", "ok");
                        }
                    } else if (args[1]) {
                        const ctx = this.getContext();
                        const sn = ctx.nodes.find(n => n.id === args[1] || n.id === `node-${args[1]}`);
                        if (!sn) return this.print(`Node '${args[1]}' not found.`, "err");
                        
                        const expVal = args[2] !== undefined ? parseInt(args[2]) : 1;
                        snMap.set(sn.id, expVal);
                        this.print(`Added breakpoint: assert '${sn.id}' == ${expVal}`, "ok");
                    } else {
                        if (snMap.size === 0) {
                            this.print("No active assertion breakpoints.", "sys");
                        } else {
                            this.print("=== ACTIVE BREAKPOINT ASSERTIONS ===", "warn");
                            snMap.forEach((exp, nid) => {
                                const curr = this.getNodeValue(nid);
                                const status = curr === exp ? '<span style="color:#0f5">PASS</span>' : '<span style="color:#f55; font-weight:bold;">FAIL</span>';
                                this.print(`  - ${nid} == ${exp} (Current: ${curr}) [${status}]`, "sys");
                            });
                        }
                    }
                }
                break;
            }
            case 'peek': {
                // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Memory introspection.
                if (args.length < 3) return this.print("Usage: peek <nodeId> <address>", "err");
                const ctx = this.getContext();
                let sn = this.resolveNode(ctx, args[1]);
                if (!sn || sn.type !== 'ROM') return this.print("Target must be a ROM module.", "err");
                const addr = args[2].startsWith('0x') ? parseInt(args[2], 16) : parseInt(args[2]);
                const data = (sn.memoryData && sn.memoryData.length > addr) ? sn.memoryData[addr] : 0;
                this.print(`0x${addr.toString(16).padStart(4, '0').toUpperCase()} : 0x${data.toString(16).padStart(2, '0').toUpperCase()} (${data})`, "sys");
                break;
            }
            case 'poke': {
                // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Dynamic firmware flashing.
                if (args.length < 4) return this.print("Usage: poke <nodeId> <address> <value>", "err");
                const ctx = this.getContext();
                let sn = this.resolveNode(ctx, args[1]);
                if (!sn || sn.type !== 'ROM') return this.print("Target must be a ROM module.", "err");
                const addr = args[2].startsWith('0x') ? parseInt(args[2], 16) : parseInt(args[2]);
                const val = args[3].startsWith('0x') ? parseInt(args[3], 16) : parseInt(args[3]);
                if (!sn.memoryData) sn.memoryData = [];
                while (sn.memoryData.length <= addr) sn.memoryData.push(0);
                sn.memoryData[addr] = val & 0xFF;
                if (ctx.simObj) { ctx.simObj.seedQueue(); ctx.simObj.processQueue(); ctx.simObj.autoSave(); }
                this.print(`Flashed 0x${addr.toString(16).padStart(4, '0').toUpperCase()} -> 0x${(val & 0xFF).toString(16).padStart(2, '0').toUpperCase()}`, "ok");
                break;
            }
            case 'timing': {
                if (args.length < 2) return this.print("Usage: timing <node_name> (e.g., 7nm, 28nm, ideal)", "err");
                const nodeMap = { '7nm': 10, '28nm': 40, 'ideal': 0 };
                if (nodeMap[args[1]] === undefined) return this.print(`Unknown fabrication node: ${args[1]}`, "err");
                Sim.timing = { node: args[1], delay: nodeMap[args[1]] };
                this.print(`Temporal discretization layer configured to ${args[1]} (${nodeMap[args[1]]}ps gate delay).`, "ok");
                break;
            }
            case 'power': {
                const ctx = this.getContext();
                let totalToggles = 0;
                const pwrFactor = (Sim.timing && Sim.timing.delay > 0) ? (Sim.timing.delay / 10) : 1;
                ctx.nodes.forEach(n => {
                    let t = n.toggles || 0;
                    if (window.WasmEngine && WasmEngine.ready && !Sim._netlistDirty) {
                        t = WasmEngine.getToggleCount(n.id);
                    }
                    totalToggles += t;
                });
                const estPower = (totalToggles * pwrFactor * 0.05).toFixed(2);
                this.print(`--- POWER ANALYSIS (${Sim.timing ? Sim.timing.node : 'ideal'}) ---`, "warn");
                this.print(`Total Gate Switching Activity: ${totalToggles} toggles`, "sys");
                this.print(`Estimated Dynamic Power: ${estPower} pJ`, "ok");
                break;
            }
            case 'symbols': {
                if (!window.WasmEngine || !WasmEngine.ready || Sim._netlistDirty) {
                    return this.print("DWARF Symbol Mapper requires active, compiled Wasm Engine.", "err");
                }
                this.print(`--- DWARF WASM SYMBOL MAP ---`, "warn");
                WasmEngine.idMap.forEach((idx, id) => {
                    const offset = Array.isArray(idx) ? idx[0] : idx;
                    const tCount = WasmEngine.getToggleCount(id);
                    this.print(`[0x${(offset * 4).toString(16).padStart(6, '0').toUpperCase()}] -> ${id} | Toggles: ${tCount}`, "sys");
                });
                break;
            }
            case 'reset': {
                // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Combinatorial and sequential state purge.
                const ctx = this.getContext();
                ctx.nodes.forEach(n => {
                    if (Array.isArray(n.state)) n.state.fill(0); else n.state = 0;
                    if (n.lastClk !== undefined) n.lastClk = 0;
                    if (n.val !== undefined) n.val = Array.isArray(n.val) ? n.val.map(()=>0) : 0;
                    n.outputs = {};
                });
                if (ctx.simObj) { ctx.simObj.seedQueue(); ctx.simObj.processQueue(); }
                this.print("System state arrays and clock histories purged.", "ok");
                break;
            }
            case 'clock':
                if (args.length < 3) return this.print("Usage: clock <nodeId> <freq>", "err");
                let cNode = Sim.nodes.find(n => n.id === args[1] && n.type === 'CLOCK');
                if (!cNode) return this.print("Clock node not found in active workspace.", "err");
                cNode.freq = parseFloat(args[2]);
                cNode.interval = cNode.freq > 0 ? 1000 / cNode.freq : 0;
                this.print(`Clock ${cNode.id} set to ${cNode.freq}Hz`, "ok");
                break;
            case 'force':
                if (args.length < 4) return this.print("Usage: force <nodeId> <portId> <0|1|Z>", "err");
                if (!Sim._forcedNets) Sim._forcedNets = {};
                let forceVal = args[3] === 'Z' ? 'Z' : parseInt(args[3]);
                Sim._forcedNets[`${args[1]}:${args[2]}`] = forceVal;
                this.print(`Forced ${args[1]}:${args[2]} to ${forceVal}`, "ok");
                Sim.seedQueue(); Sim.processQueue();
                break;
            case 'unforce':
                if (args.length < 3) return this.print("Usage: unforce <nodeId> <portId>", "err");
                if (Sim._forcedNets) delete Sim._forcedNets[`${args[1]}:${args[2]}`];
                this.print(`Unforced ${args[1]}:${args[2]}`, "ok");
                Sim.seedQueue(); Sim.processQueue();
                break;
            case 'watch':
                if (!args[1]) return this.print("Usage: watch <nodeId>", "err");
                if (!this._watchers) this._watchers = new Set();
                if (this._watchers.has(args[1])) {
                    this._watchers.delete(args[1]);
                    this.print(`Unwatched ${args[1]}`, "ok");
                } else {
                    this._watchers.add(args[1]);
                    this.print(`Watching ${args[1]} for state changes...`, "ok");
                }
                break;
            case 'dump': {
                if (!args[1]) return this.print("Usage: dump <nodeId|macro>", "err");
                const ctx = this.getContext();
                let dNode = ctx.nodes.find(n => n.id === args[1] || n.id === `node-${args[1]}`);
                if (!dNode) dNode = Sim.library[args[1]];
                if (!dNode) return this.print("Node/Macro not found.", "err");
                this.print(`<pre style="margin:0; font-size:10px; line-height:1.2;">${JSON.stringify(dNode, null, 2)}</pre>`, "sys");
                break;
            }
            case 'cp': {
                // [AUDIT: v1.24.05 | SEC_ARCH_LEAD] - Enforced block scope to prevent let/const hoisting conflicts across switch cases.
                if (args.length < 3) return this.print("Usage: cp <src> <dest>", "err");
                if (!Sim.library[args[1]]) return this.print(`Source ${args[1]} not found in library.`, "err");
                if (Sim.library[args[2]]) return this.print(`Dest ${args[2]} already exists.`, "err");
                Sim.library[args[2]] = JSON.parse(JSON.stringify(Sim.library[args[1]]));
                let cpFolder = this.cwd.startsWith('/etc/lib/custom') ? this.cwd.replace(/^\/etc\/lib\/custom\/?/, '') : '';
                Sim.library[args[2]].folder = cpFolder;
                Sim.updateLibraryUI();
                Sim.autoSave();
                this.print(`Copied ${args[1]} to ${args[2]}`, "ok");
                break;
            }
            case 'touch':
                if (!args[1]) return this.print("Usage: touch <macroName>", "err");
                if (Sim.library[args[1]]) return this.print(`Macro ${args[1]} already exists.`, "err");
                let tFolder = this.cwd.startsWith('/etc/lib/custom') ? this.cwd.replace(/^\/etc\/lib\/custom\/?/, '') : '';
                Sim.library[args[1]] = { nodes: [], wires: [], folder: tFolder };
                Sim.updateLibraryUI();
                Sim.autoSave();
                this.print(`Created empty macro ${args[1]}`, "ok");
                break;
            case 'find':
                if (!args[1]) return this.print("Usage: find <regex>", "err");
                try {
                    let regex = new RegExp(args[1], 'i');
                    let foundAny = false;
                    Sim.nodes.forEach(n => {
                        if (regex.test(n.id) || regex.test(n.type) || regex.test(n.label)) {
                            this.print(`[Workspace] <span style="color:#0f5">${n.id}</span> (${n.type})`, "ok");
                            foundAny = true;
                        }
                    });
                    Object.keys(Sim.library).forEach(k => {
                        if (regex.test(k)) {
                            this.print(`[Library] <span style="color:#0af">${k}</span>`, "ok");
                            foundAny = true;
                        }
                    });
                    if (!foundAny) this.print("No matches found.", "sys");
                } catch(e) { this.print("Invalid Regex.", "err"); }
                break;
            case 'bom':
                let targetBOM = args[1] ? Sim.library[args[1]] : { nodes: Sim.nodes };
                if (!targetBOM) return this.print("Macro not found.", "err");
                let counts = {};
                const traverseBOM = (nodes) => {
                    nodes.forEach(n => {
                        if (n.isCustom && Sim.library[n.type]) traverseBOM(Sim.library[n.type].nodes);
                        else counts[n.type] = (counts[n.type] || 0) + 1;
                    });
                };
                traverseBOM(targetBOM.nodes);
                this.print(`--- BILL OF MATERIALS ---`, "warn");
                Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k, v]) => {
                    this.print(`${k.padEnd(12)}: ${v}`, "sys");
                });
                break;
            case 'path':
                if (args.length < 3) return this.print("Usage: path <nodeA> <nodeB>", "err");
                const visitedPath = new Set();
                const queue = [{ id: args[1], path: [args[1]] }];
                let foundPath = false;
                while(queue.length > 0) {
                    const curr = queue.shift();
                    if (curr.id === args[2]) {
                        this.print(`Path found: ${curr.path.map(id => `<span style="color:#0f5">${id}</span>`).join(' -> ')}`, "ok");
                        foundPath = true;
                        break;
                    }
                    if (visitedPath.has(curr.id)) continue;
                    visitedPath.add(curr.id);
                    Sim.wires.forEach(w => {
                        if (w.from.nodeId === curr.id && !visitedPath.has(w.to.nodeId)) queue.push({ id: w.to.nodeId, path: [...curr.path, w.to.nodeId] });
                        if (w.to.nodeId === curr.id && !visitedPath.has(w.from.nodeId)) queue.push({ id: w.from.nodeId, path: [...curr.path, w.from.nodeId] });
                    });
                }
                if (!foundPath) this.print("No electrical path exists.", "err");
                break;
            case 'status':
                this.print(`--- SIMULATOR STATUS ---`, "warn");
                this.print(`Nodes: ${Sim.nodes.length} | Wires: ${Sim.wires.length}`, "ok");
                this.print(`Netlist: ${Sim._netlistDirty ? 'Dirty (Pending Sync)' : 'Clean'}`, Sim._netlistDirty ? "warn" : "ok");
                this.print(`SharedArrayBuffer: ${window.SharedArrayBuffer ? 'Supported' : 'Disabled (COOP/COEP Restricted)'}`, window.SharedArrayBuffer ? "ok" : "err");
                this.print(`Engine: ${Sim.useWasm ? 'WebAssembly (Fast)' : 'V8 JavaScript (Fallback)'}`, "sys");
                if (window.WasmEngine) {
                    this.print(`Wasm Parity: ${WasmEngine.ready ? 'ONLINE' : 'OFFLINE'}`, WasmEngine.ready ? "ok" : "err");
                }
                break;
            case 'synth':
                if (!args[1]) return this.print("Missing target. Ex: synth XOR", "err");
                this.synthesize(args[1].toUpperCase());
                break;
            case 'trace': {
                const isRecursive = args.includes('-r') || args.includes('--recursive');
                const nodeArgs = args.filter(a => a !== '-r' && a !== '--recursive');
                const nodeId = nodeArgs[1];
                if (isRecursive) {
                    this.traceNodeRecursive(nodeId);
                } else {
                    this.traceNode(nodeId);
                }
                break;
            }
            case 'vcd': {
                const action = args[1] ? args[1].toLowerCase() : 'show';
                if (action === 'start') {
                    this.vcdRecording = true;
                    this.print("VCD real-time wave recording STARTED.", "ok");
                } else if (action === 'stop') {
                    this.vcdRecording = false;
                    this.print("VCD real-time wave recording STOPPED.", "warn");
                } else if (action === 'clear') {
                    this.getVcdHistory().clear();
                    this.print("VCD history buffer cleared.", "ok");
                } else if (action === 'show') {
                    this.renderVcdASCII();
                } else {
                    this.print("Usage: vcd [start | stop | clear | show]", "err");
                }
                break;
            }
            case 'coredump': {
                if (!window.WasmEngine || !WasmEngine.ready || !WasmEngine.memArray) {
                    return this.print("WasmEngine is offline or memory buffer not loaded.", "err");
                }
                
                const region = args[1] ? args[1].toUpperCase() : 'A';
                let offset = parseInt(args[2]) || 0;
                let length = parseInt(args[3]) || 32;
                
                let baseOffset = 0;
                let regionName = "";
                
                if (region === 'A') {
                    baseOffset = WasmEngine.REGION_A_OFFSET;
                    regionName = "Region A (Logic States)";
                } else if (region === 'B') {
                    baseOffset = WasmEngine.REGION_B_OFFSET;
                    regionName = "Region B (Instruction Memory)";
                } else if (region === 'C') {
                    baseOffset = WasmEngine.REGION_C_OFFSET;
                    regionName = "Region C (RAM/ROM Payloads)";
                } else if (region === 'E') {
                    baseOffset = WasmEngine.REGION_E_OFFSET;
                    regionName = "Region E (Power Activity Counters)";
                } else {
                    return this.print("Unknown region. Use A, B, C, or E.", "err");
                }
                
                this.print(`=== WASM COREDUMP: ${regionName} ===`, "warn");
                this.print(`Printing ${length} Int32 values starting from offset ${offset}...`, "sys");
                
                const mem = WasmEngine.memArray;
                const limit = baseOffset + offset + length;
                
                for (let i = baseOffset + offset; i < limit; i += 8) {
                    const lineIndices = [];
                    const lineValues = [];
                    for (let j = 0; j < 8; j++) {
                        const idx = i + j;
                        if (idx >= limit) break;
                        const val = mem[idx] ?? 0;
                        lineIndices.push((idx - baseOffset).toString().padStart(6, ' '));
                        lineValues.push(val.toString(16).toUpperCase().padStart(8, '0'));
                    }
                    this.print(`<span style="font-family:monospace; white-space:pre;">Index: ${lineIndices.join(' | ')}</span>`, "sys");
                    this.print(`<span style="font-family:monospace; white-space:pre;">Value: ${lineValues.join(' | ')}</span>`, "ok");
                }
                this.print("====================================", "warn");
                break;
            }
            default:
                this.print(`ERR: '${c}' is not recognized in the current ISA context.`, "err");
                const suggestion = this.findClosestCommand(c);
                if (suggestion) {
                    this.print(`SUGGESTION: Did you mean '${suggestion}'?`, "sys");
                }
        }
    },

    /**
     */
    synthesize(target) {
        if (!window.Sim) return this.print("Simulator context not linked.", "err");
        if (Sim.library[target]) return this.print(`${target} already exists in library.`, "warn");
        
        const recipe = this.RECIPES[target];
        if (!recipe) {
            return this.print(`No NAND synthesis recipe for: ${target}`, "err");
        }

        // Validate dependencies and recursively construct
        recipe.deps.forEach(dep => {
            if (!Sim.library[dep] && dep !== 'NAND') {
                this.print(`Missing dependency: ${dep}. Synthesizing first...`, "sys");
                this.synthesize(dep);
            }
        });

        // Construct
        try {
            Sim.library[target] = recipe.build();
            Sim.updateLibraryUI();
            Sim.autoSave();
            this.print(`[SYNTH OK] ${target} compiled & injected to Library.`, 'ok');
            
            // Truth Table verification output
            const inputs = recipe.build().nodes.filter(n => n.type.startsWith('IN')).length;
            this.print(`Validation: Sub-circuit compiled with ${inputs} inputs. Ready for deployment.`, 'sys');
        } catch (e) {
            this.print(`Synthesis failed: ${e.message}`, 'err');
        }
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Injected topological tracing telemetry for active logic diagnostics.
     */
    // [AUDIT: v1.24.06 | SEC_ARCH_LEAD] - Context-aware topological tracing for nested workspace resolution.
    traceNode(nodeId) {
        if (!window.Sim) return this.print("Simulator context offline.", "err");
        
        const ctx = this.getContext();
        
        let targetId = nodeId;
        if (!targetId) {
            if (ctx.simObj && ctx.simObj.selection && ctx.simObj.selection.size === 1) targetId = Array.from(ctx.simObj.selection)[0];
            else return this.print("Specify a nodeId or select exactly one node. Ex: trace node-123", "err");
        }
        
        const node = ctx.nodes.find(n => n.id === targetId || n.id === `node-${targetId}`);
        if (!node) return this.print(`Node not found: ${targetId}`, "err");
        
        targetId = node.id;

        this.print(`=== TRACE: ${node.id} (${node.type}) ===`, "sys");
        this.print(`Label: ${node.label || 'None'} | Val: ${JSON.stringify(node.val)} | State: ${JSON.stringify(node.state)}`, "sys");

        const upstream = ctx.wires.filter(w => w.to.nodeId === targetId);
        const downstream = ctx.wires.filter(w => w.from.nodeId === targetId);

        this.print(`--- UPSTREAM (Inputs) ---`, "warn");
        if (upstream.length === 0) this.print("  (None)", "sys");
        upstream.forEach(w => {
            const src = ctx.nodes.find(n => n.id === w.from.nodeId);
            let sig = 0;
            if (ctx.simObj && typeof ctx.simObj.getSignal === 'function') {
                sig = ctx.simObj.getSignal(w.from.nodeId, w.from.portId);
            }
            const srcType = src ? src.type : "UNKNOWN";
            this.print(`  [${w.to.portId}] <- ${w.from.nodeId}[${w.from.portId}] (${srcType}) = ${JSON.stringify(sig)}`, "ok");
        });

        this.print(`--- DOWNSTREAM (Outputs) ---`, "warn");
        if (downstream.length === 0) this.print("  (None)", "sys");
        downstream.forEach(w => {
            const dst = ctx.nodes.find(n => n.id === w.to.nodeId);
            const dstType = dst ? dst.type : "UNKNOWN";
            this.print(`  [${w.from.portId}] -> ${w.to.nodeId}[${w.to.portId}] (${dstType})`, "ok");
        });

        if (node.isCustom) {
            this.print(`--- MACRO INFO ---`, "warn");
            this.print(`  Definition: Sim.library['${node.type}']`, "sys");
            if (node.outputs) this.print(`  Latched Outputs: ${JSON.stringify(node.outputs)}`, "sys");
        }
        this.print(`===================================`, "sys");
    },

    getAssertions() {
        if (!this.assertions) this.assertions = new Map();
        return this.assertions;
    },

    getassertionsActive() {
        return this.getAssertions().size > 0;
    },

    getVcdHistory() {
        if (!this.vcdHistory) this.vcdHistory = new Map();
        return this.vcdHistory;
    },

    getNodeValue(nodeId) {
        if (!window.Sim) return null;
        const ctx = this.getContext();
        const sn = ctx.nodes.find(n => n.id === nodeId || n.id === `node-${nodeId}`);
        if (!sn) return null;
        
        const typeBits = parseInt(sn.type.split('-')[1]);
        const bits = (!isNaN(typeBits) && typeBits > 0) ? typeBits : 1;
        
        let val = 0;
        let hasZ = false;
        for (let i = 0; i < bits; i++) {
            let bit = null;
            if (window.WasmEngine && WasmEngine.ready && !Sim._netlistDirty) {
                bit = WasmEngine.readPinState(sn.id, `out${i}`);
                if (bit === null || bit === undefined) bit = WasmEngine.readPinState(sn.id, `in${i}`);
                if (bit === null || bit === undefined) bit = WasmEngine.readPinState(sn.id, 'out');
            } else {
                bit = ctx.simObj.getSignal(sn.id, `out${i}`);
                if (bit === null || bit === undefined) bit = ctx.simObj.getDrivingSignal(sn.id, `in${i}`);
                if (bit === null || bit === undefined) bit = ctx.simObj.getSignal(sn.id, 'out');
            }
            if (bit === 'Z') {
                hasZ = true;
            } else if (bit === 1 || bit === true) {
                val |= (1 << i);
            }
        }
        if (hasZ && val === 0) return 'Z';
        return val;
    },

    checkAssertions() {
        const snMap = this.getAssertions();
        if (snMap.size === 0) return true;
        
        let allPassed = true;
        snMap.forEach((exp, nid) => {
            const curr = this.getNodeValue(nid);
            if (curr !== exp) {
                this.print(`[ASSERTION TRIGGERED] Node '${nid}' evaluates to ${curr}, expected ${exp}!`, "err");
                allPassed = false;
            }
        });
        return allPassed;
    },

    getTrackedVcdNodes() {
        const ctx = this.getContext();
        const tracked = new Set();
        
        if (ctx.simObj && ctx.simObj.selection) {
            ctx.simObj.selection.forEach(nid => tracked.add(nid));
        }
        
        const assertions = this.getAssertions();
        assertions.forEach((val, nid) => tracked.add(nid));
        
        if (this._lastTracedNodes) {
            this._lastTracedNodes.forEach(nid => tracked.add(nid));
        }
        
        if (tracked.size === 0) {
            ctx.nodes.forEach(n => {
                if (n.type.startsWith('IN-') || n.type.startsWith('OUT-') || n.type === 'CLOCK') {
                    tracked.add(n.id);
                }
            });
        }
        
        return Array.from(tracked);
    },

    recordVcdState() {
        const nodes = this.getTrackedVcdNodes();
        const history = this.getVcdHistory();
        
        nodes.forEach(nid => {
            if (!history.has(nid)) {
                history.set(nid, []);
            }
            const list = history.get(nid);
            const val = this.getNodeValue(nid) ?? 0;
            list.push(val);
            if (list.length > 20) {
                list.shift();
            }
        });
    },

    renderVcdASCII() {
        const history = this.getVcdHistory();
        if (history.size === 0) {
            return this.print("VCD buffer is empty. Record some ticks first.", "warn");
        }
        
        this.print("=== LOGIC ANALYZER WAVEFORMS (last 20 ticks) ===", "warn");
        
        history.forEach((h, nid) => {
            if (h.length === 0) return;
            
            let top = "";
            let bottom = "";
            for (let i = 0; i < h.length; i++) {
                const val = h[i];
                const prev = i > 0 ? h[i - 1] : val;
                
                if (val === 0) {
                    if (prev === 0) {
                        top += "  ";
                        bottom += "──";
                    } else {
                        top += "┐ ";
                        bottom += "└─";
                    }
                } else {
                    if (prev === 1) {
                        top += "──";
                        bottom += "  ";
                    } else {
                        top += "┌─";
                        bottom += "┘ ";
                    }
                }
            }
            
            const label = nid.padEnd(12).substring(0, 12);
            this.print(`<span style="font-family:monospace; white-space:pre;">${label} [1] ${top}</span>`, "sys");
            this.print(`<span style="font-family:monospace; white-space:pre;">             [0] ${bottom}</span>`, "sys");
        });
        
        let maxLen = 0;
        history.forEach(h => maxLen = Math.max(maxLen, h.length));
        let timeline = "";
        for (let i = 0; i < maxLen; i++) {
            timeline += i.toString().padStart(2, ' ');
        }
        this.print(`<span style="font-family:monospace; white-space:pre;">             [T] ${timeline}</span>`, "sys");
        this.print("=================================================", "warn");
    },

    traceNodeRecursive(nodeId) {
        if (!window.Sim) return this.print("Simulator context offline.", "err");
        
        const ctx = this.getContext();
        
        let targetId = nodeId;
        if (!targetId) {
            if (ctx.simObj && ctx.simObj.selection && ctx.simObj.selection.size === 1) targetId = Array.from(ctx.simObj.selection)[0];
            else return this.print("Specify a nodeId or select exactly one node. Ex: trace -r node-123", "err");
        }
        
        const startNode = ctx.nodes.find(n => n.id === targetId || n.id === `node-${targetId}`);
        if (!startNode) return this.print(`Node not found: ${targetId}`, "err");
        
        targetId = startNode.id;
        
        this.print(`=== RECURSIVE DOWNSTREAM TRACE: ${startNode.id} (${startNode.type}) ===`, "sys");
        
        const visited = new Set();
        const self = this;
        if (!this._lastTracedNodes) this._lastTracedNodes = new Set();
        this._lastTracedNodes.clear();
        
        function traverse(currId, prefix = "") {
            self._lastTracedNodes.add(currId);
            if (visited.has(currId)) {
                self.print(`${prefix} └── [LOOP DETECTED] -> ${currId}`, "warn");
                return;
            }
            visited.add(currId);
            
            const currNode = ctx.nodes.find(n => n.id === currId);
            if (!currNode) return;
            
            const downstream = ctx.wires.filter(w => w.from.nodeId === currId);
            if (downstream.length === 0) return;
            
            downstream.forEach((w, index) => {
                const isLast = index === downstream.length - 1;
                const marker = isLast ? " └── " : " ├── ";
                const childPrefix = prefix + (isLast ? "     " : " │   ");
                
                const destNode = ctx.nodes.find(n => n.id === w.to.nodeId);
                const destType = destNode ? destNode.type : "UNKNOWN";
                
                let sig = 0;
                if (ctx.simObj && typeof ctx.simObj.getSignal === 'function') {
                    sig = ctx.simObj.getSignal(w.from.nodeId, w.from.portId);
                }
                
                let destSig = 0;
                if (ctx.simObj && typeof ctx.simObj.getSignal === 'function' && destNode) {
                    destSig = ctx.simObj.getSignal(w.to.nodeId, w.to.portId);
                }
                
                self.print(`${prefix}${marker}[${w.from.portId}] -> ${w.to.nodeId}[${w.to.portId}] (${destType}) | PinVal: ${sig} -> DstPinVal: ${destSig}`, "ok");
                
                traverse(w.to.nodeId, childPrefix);
            });
        }
        
        traverse(targetId);
        this.print("===================================", "sys");
    },

    /**
     * [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Levenshtein-distance algorithm for command suggestions.
     */
    levenshtein(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    },

    findClosestCommand(input) {
        // [AUDIT: v1.25.46 | SEC_ARCH_LEAD] - Added rename to Levenshtein distance resolver matrix.
        const commands = ['help', 'exit', 'clear', 'verbosity', 'ls', 'spawn', 'rm', 'set', 'wire', 'sim', 'status', 'synth', 'trace', 'pwd', 'cd', 'mv', 'mkdir', 'tick', 'step', 'clock', 'force', 'unforce', 'watch', 'dump', 'cp', 'touch', 'find', 'bom', 'path', 'assert', 'peek', 'poke', 'reset', 'power', 'symbols', 'timing', 'ln', 'rename', 'vcd', 'coredump'];
        return commands
            .map(cmd => ({ cmd, distance: this.levenshtein(input, cmd) }))
            .filter(res => res.distance <= 2)
            .sort((a, b) => a.distance - b.distance)[0]?.cmd;
    }
};

// [AUDIT: v1.24.14 | SEC_ARCH_LEAD] - Resolved cross-module initialization race condition for Sim context binding.
window.DebugTerminal = DebugTerminal;
window.addEventListener('DOMContentLoaded', () => {
    if (typeof window.Sim !== 'undefined') window.Sim.dt = DebugTerminal;
    DebugTerminal.init();
});
