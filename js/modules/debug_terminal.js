/**
 * Debug Terminal & Hardware Synthesizer
 */
const DebugTerminal = {
    verbosity: 2,
    visible: false,
    cwd: '/home/bsim', // Virtual File System Root
    
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
     * @ARCH: APP_INITIALIZER
     * @IO: TERMINAL_BOOT
     * @INTENT: Initialize the debug terminal subsystem, including UI construction and console interception.
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Debug terminal subsystem operational.
    },

    /**
     * @ARCH: UI_STYLING
     * @INTENT: Inject terminal-specific CSS into the document head for the telemetry interface.
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
            #dt-in-row { display: flex; align-items: center; background: #000; border-top: 1px solid #222; padding: 0 10px; }
            #dt-prompt { color: #0f5; font-weight: bold; margin-right: 8px; white-space: nowrap; user-select: none; }
            #dt-in { background: transparent; color: #fff; border: none; padding: 10px 0; outline: none; width: 100%; font-family: inherit; font-size: inherit; flex: 1; }
            .dt-msg { margin-bottom: 4px; line-height: 1.4; user-select: text !important; -webkit-user-select: text !important; }
            .dt-msg::selection { background: rgba(0, 255, 170, 0.3); }
            .dt-err { color: #ff5555; }
            .dt-warn { color: #ffaa00; }
            .dt-sys { color: #8888aa; }
            .dt-ok { color: #00ffaa; }
            .dt-menu-item { padding: 6px 15px; color: #aaa; cursor: pointer; user-select: none; }
            .dt-menu-item:hover { background: #252530; color: #fff; }
        `;
        document.head.appendChild(style);
    },

    /**
     * @IO: UI_INTERACTION
     * @STATE: TERMINAL_STATE
     * @INTENT: Build the terminal DOM elements and attach dragging/resize event listeners.
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
                <input id="dt-in" type="text" autocomplete="off" spellcheck="false" />
            </div>
        `;
        document.body.appendChild(this.ui);

        this.out = document.getElementById('dt-out');
        
        // [AUDIT: v1.23.61 | SEC_ARCH_LEAD] - Lift mousedown restriction to permit cursor selection of logs.
        this.out.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        this.inp = document.getElementById('dt-in');
        
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
                if (cmd) this.exec(cmd);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTab();
            } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
                this.clearHighlight();
                this._acState = null;
            }
        };
    },

    /**
     * @IO: AUTO_COMPLETE
     * @INTENT: Handle tab-completion for commands and node IDs, with visual workspace highlighting.
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
        return '/' + res.join('/');
    },

    isValidDir(path) {
        if (['/', '/home', '/home/bsim', '/etc', '/etc/lib', '/etc/lib/primitives', '/etc/lib/custom'].includes(path)) return true;
        if (path.startsWith('/etc/lib/custom/')) return true; // Assume virtual folders exist if chips are in them
        const tMatch = path.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
        if (tMatch) {
            const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1]);
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
            Sim.tabs.forEach((t, i) => dirs.push(`tab-${i+1}`));
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
                const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1]);
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

    // [AUDIT: v1.24.06 | SEC_ARCH_LEAD] - Unified contextual environment resolver for split-pane and virtual workspaces.
    getContext() {
        const defaultCtx = { nodes: Sim.nodes, wires: Sim.wires, simObj: Sim };
        if (this.cwd === '/') return { nodes: [], wires: [], simObj: null };
        
        const tMatch = this.cwd.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
        if (!tMatch) return defaultCtx;
        
        const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1]);
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
                const cmds = ['help', 'exit', 'clear', 'verbosity', 'ls', 'spawn', 'rm', 'set', 'wire', 'sim', 'status', 'synth', 'trace', 'pwd', 'cd', 'mv', 'mkdir', 'tick', 'clock', 'force', 'unforce', 'watch', 'dump', 'cp', 'touch', 'find', 'bom', 'path'];
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
        input.accept = '.txt,.bsimscript,.sh,.js';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const lines = ev.target.result.split('\n');
                let count = 0;
                this.print(`--- EXECUTING SCRIPT: ${file.name} ---`, 'warn');
                lines.forEach(line => {
                    const cmd = line.trim();
                    if (cmd && !cmd.startsWith('#') && !cmd.startsWith('//')) {
                        this.exec(cmd);
                        count++;
                    }
                });
                this.print(`--- SCRIPT COMPLETE (${count} commands) ---`, 'ok');
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
     * @IO: KEYBOARD_INTERACTION
     * @INTENT: Attach global keyboard shortcuts (e.g., Ctrl+P) to toggle terminal visibility.
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
     * @ARCH: LOGGING_INTERCEPTOR
     * @IO: TELEMETRY
     * @INTENT: Redirect standard console methods to the terminal output buffer for in-app debugging.
     */
    overrideConsole() {
        const ogLog = console.log, ogWarn = console.warn, ogErr = console.error;
        console.log = (...args) => { ogLog(...args); if (this.verbosity >= 2) this.print(args.join(' '), 'sys'); };
        console.warn = (...args) => { ogWarn(...args); if (this.verbosity >= 1) this.print(args.join(' '), 'warn'); };
        console.error = (...args) => { ogErr(...args); if (this.verbosity >= 0) this.print(args.join(' '), 'err'); };
    },

    /**
     * @STATE: TERMINAL_VISIBILITY
     * @INTENT: Toggle the display state of the debug terminal and manage focus transitions.
     */
    toggle(state) {
        this.visible = state;
        this.ui.style.display = state ? 'flex' : 'none';
        if (state) this.inp.focus();
    },

    /**
     * @IO: TERMINAL_OUTPUT
     * @INTENT: Append a formatted message line to the terminal output display.
     */
    // [AUDIT: v1.23.98 | SEC_ARCH_LEAD] - Adjusted print handler to safely interpret HTML layout injections.
    print(msg, type = 'sys') {
        const line = document.createElement('div');
        line.className = `dt-msg dt-${type}`;
        line.innerHTML = msg; // Upgraded to allow colored spans
        this.out.appendChild(line);
        this.out.scrollTop = this.out.scrollHeight;
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Message appended to terminal buffer.
    },

    /**
     * @ARCH: COMMAND_PROCESSOR
     * @IO: TERMINAL_INPUT
     * @INTENT: Parse and execute user-entered terminal commands for simulator control.
     */
    // [AUDIT: v1.23.98 | SEC_ARCH_LEAD] - Upgraded terminal commands for verbose flags and bulk operations.
    exec(cmd) {
        this.print(`<span style="color:#0f5">bsim:~$</span> ${cmd.replace(/</g, '&lt;')}`, 'sys');
        const args = cmd.trim().split(/\s+/);
        const c = args[0].toLowerCase();

        switch (c) {
            case 'help':
                // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Expanded help index for kernel telemetry commands.
                this.print("Commands: exit, clear, verbosity [0-3], synth [gate], trace [nodeId]");
                this.print("  pwd                 - Print Working Directory (VFS)");
                this.print("  cd <path>           - Change Directory (VFS)");
                this.print("  mkdir [-p] <dir>    - Create VFS directory");
                this.print("  mv <chip> <folder>  - Move chip to a library folder");
                this.print("  cp <src> <dest>     - Clone a macro in the library");
                this.print("  touch <macro>       - Instantiate an empty macro");
                this.print("  ls [-l] [path]      - List workspace nodes or VFS contents");
                this.print("  tree [path]         - Display directory structure recursively");
                this.print("  find <pattern>      - Regex search across VFS and nodes");
                this.print("  spawn <type> [x y]  - Add a node (e.g., spawn NAND 100 100)");
                this.print("  rm [-rf] <id>       - Delete nodes or directories");
                this.print("  set <nodeId> <val>  - Set input node value (e.g., set node-xyz 1)");
                this.print("  force <n> <p> <v>   - Override a pin signal (e.g., force n1 in0 1)");
                this.print("  unforce <n> <p>     - Release an overridden pin");
                this.print("  tick [N]            - Advance simulation clock N cycles");
                this.print("  clock <id> <freq>   - Set oscillator frequency (Hz)");
                this.print("  watch <nodeId>      - Subscribe to state transitions");
                this.print("  dump <nodeId>       - Dump raw JSON state array");
                this.print("  bom [macro]         - Generate Bill of Materials");
                this.print("  path <n1> <n2>      - Trace topological electrical path");
                this.print("  rm <id> [id2...]    - Delete nodes (or 'rm all')");
                this.print("  set <nodeId> <val>  - Set input node value (e.g., set node-xyz 1)");
                this.print("  wire <n1> <p1> <n2> <p2> - Connect two nodes");
                this.print("  sim                 - Force a manual propagation tick");
                this.print("  status              - Show engine and netlist statistics");
                this.print("  synth <gate>        - Hierarchically compiles logic from NANDs.");
                this.print("  trace [nodeId]      - Output topological connections and logic states.");
                break;
            case 'pwd':
                this.print(this.cwd, 'sys');
                break;
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
            case 'mv': {
                // [AUDIT: v1.24.05 | SEC_ARCH_LEAD] - Enforced block scope for case statement to resolve lexical declaration collisions.
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
                    this.print(`--- WORKSPACES ---`, "warn");
                    Sim.tabs.forEach((t, i) => {
                        const alias = `tab-${i+1}`;
                        const tag = t.id === Sim.activeTabId ? '<span style="color:#ffca28">*</span>' : ' ';
                        this.print(`${tag} [Dir] <span style="color:#0af; font-weight:bold;">${alias}/</span> <span style="color:#667">(id: ${t.id}, name: ${t.name})</span>`, "ok");
                    });
                    return;
                }

                // Must be inside a tab workspace (/home/bsim/tab-X/...)
                const tMatch = targetPath.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
                if (!tMatch) return this.print("Invalid directory.", "err");

                const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1]);
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
            case 'spawn':
                if (!args[1]) return this.print("Usage: spawn <type> [x] [y]", "err");
                const type = args[1].toUpperCase();
                const x = parseFloat(args[2]) || parseInt(View.x) + 100 || 0;
                const y = parseFloat(args[3]) || parseInt(View.y) + 100 || 0;
                Sim.addNode(type, x, y);
                this.print(`Spawned ${type} at ${x}, ${y}`, "ok");
                break;
            case 'mkdir':
                // [AUDIT: v1.24.03 | SEC_ARCH_LEAD] - VFS directory allocation.
                let pFlag = args.includes('-p');
                let dirArgs = args.filter(a => a !== 'mkdir' && !a.startsWith('-'));
                if (dirArgs.length === 0) return this.print("Usage: mkdir [-p] <dir>", "err");

                if (!Sim.directories) Sim.directories = [];

                dirArgs.forEach(d => {
                    let targetPath = this.resolvePath(d).replace(/\/$/, '');
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
                        return this.print("Cleared entire active workspace.", "ok");
                    }
                    return this.print("Cannot clear inactive workspace.", "err");
                }

                let rmCount = 0;
                let rmDirCount = 0;
                if (ctx.simObj) ctx.simObj.selection.clear();
                
                rmArgs.forEach(target => {
                    if (target.includes('/') || this.cwd.startsWith('/etc/lib')) {
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
                        } else {
                            this.print(`rm: cannot remove '${target}': Permission denied`, "err");
                        }
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
                const sn = ctx.nodes.find(n => n.id === args[1] || n.id === `node-${args[1]}`);
                if (!sn) return this.print(`Node ${args[1]} not found.`, "err");
                const val = parseInt(args[2]);
                if (isNaN(val)) return this.print("Value must be a number.", "err");
                sn.val = val;
                sn.state = val;
                if (ctx.simObj) {
                    ctx.simObj.updateNodeVisual(sn);
                    ctx.simObj.seedQueue(); ctx.simObj.processQueue();
                }
                this.print(`Set ${sn.id} to ${val}`, "ok");
                break;
            }
            case 'wire':
                if (args.length < 5) return this.print("Usage: wire <node1> <port1> <node2> <port2>", "err");
                Sim.wires.push({
                    from: { nodeId: args[1], portId: args[2], isOutput: true },
                    to: { nodeId: args[3], portId: args[4], isOutput: false }
                });
                WireRenderer.drawWires();
                Sim.seedQueue(); Sim.processQueue();
                this.print(`Wired ${args[1]}[${args[2]}] to ${args[3]}[${args[4]}]`, "ok");
                break;
            case 'sim':
                Sim.seedQueue(); Sim.processQueue();
                this.print("Propagation tick queued.", "ok");
                break;
            case 'tick':
                // [AUDIT: v1.24.04 | SEC_ARCH_LEAD] - Programmatic cycle advancement.
                let ticks = parseInt(args[1]) || 1;
                for(let i=0; i<ticks; i++) { Sim.seedQueue(); Sim.processQueue(); }
                this.print(`Advanced ${ticks} clock cycle(s).`, "ok");
                break;
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
                this.print(`Engine: ${Sim.useWasm ? 'WebAssembly (Fast)' : 'V8 JavaScript (Fallback)'}`, "sys");
                if (window.WasmEngine) {
                    this.print(`Wasm Parity: ${WasmEngine.ready ? 'ONLINE' : 'OFFLINE'}`, WasmEngine.ready ? "ok" : "err");
                    if (WasmEngine.wasmMemory) this.print(`Cycle Map: ${(WasmEngine.wasmMemory.buffer.byteLength / 1024).toFixed(2)} KB`, "sys");
                }
                break;
            case 'synth':
                if (!args[1]) return this.print("Missing target. Ex: synth XOR", "err");
                this.synthesize(args[1].toUpperCase());
                break;
            case 'trace':
                // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Route trace command to diagnostic topological mapper.
                this.traceNode(args[1]);
                break;
            default:
                this.print(`Command not found: ${c}`, 'err');
        }
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Command execution finalized: ${cmd}.
    },

    /**
     * @ARCH: HARDWARE_SYNTHESIZER
     * @CONSTRAINT: RECURSIVE_BUILD
     * @INTENT: Compile high-level gates from primitive NAND representations and inject into the simulator library.
     */
    synthesize(target) {
        if (!window.Sim) return this.print("Simulator context not linked.", "err");
        if (Sim.library[target]) return this.print(`${target} already exists in library.`, "warn");
        
        const recipe = this.RECIPES[target];
        if (!recipe) {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Synthesis aborted, no recipe for ${target}.
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
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Synthesis process finalized for ${target}.
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Injected topological tracing telemetry for active logic diagnostics.
     * @ARCH: DIAGNOSTIC_TOOL
     * @IO: TERMINAL_OUTPUT
     * @INTENT: Map and display the connectivity and signal state of a specific node or the current selection.
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
    }
};

// [AUDIT: v1.24.14 | SEC_ARCH_LEAD] - Resolved cross-module initialization race condition for Sim context binding.
window.DebugTerminal = DebugTerminal;
window.addEventListener('DOMContentLoaded', () => {
    if (typeof window.Sim !== 'undefined') window.Sim.dt = DebugTerminal;
    DebugTerminal.init();
});
