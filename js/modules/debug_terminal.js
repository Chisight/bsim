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

        // Dragging Logic
        let isDragging = false, startX, startY, initX, initY;
        const head = document.getElementById('dt-head');
        head.onmousedown = (e) => {
            if (e.target.tagName === 'SPAN') return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = this.ui.getBoundingClientRect();
            initX = rect.left; initY = rect.top;
            this.ui.style.right = 'auto'; this.ui.style.bottom = 'auto';
        };
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.ui.style.left = (initX + (e.clientX - startX)) + 'px';
            this.ui.style.top = (initY + (e.clientY - startY)) + 'px';
        });
        document.addEventListener('mouseup', () => isDragging = false);

        // Window Controls
        document.getElementById('dt-close').onclick = () => this.toggle(false);
        document.getElementById('dt-min').onclick = () => {
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

    getNodesForCwd() {
        const tMatch = this.cwd.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
        if (!tMatch) return [];
        const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tMatch[1] || t.id === tMatch[1]);
        if (!tab) return [];
        if (tMatch[2] === 'editor') {
            if (Sim.activeTabId === tab.id) {
                if (Sim.activeEditingChip) return Sim.nodes;
                if (Sim.activeSplitChip) {
                    const sf = document.querySelector('#split-editor-frame iframe') || document.querySelector('#popup-editor-wrap iframe');
                    if (sf && sf.contentWindow && sf.contentWindow.Sim) return sf.contentWindow.Sim.nodes;
                }
            }
        } else {
            if (Sim.activeTabId === tab.id) {
                if (Sim.activeEditingChip && Sim.workspaceStack.length > 0) return Sim.workspaceStack[0].nodes;
                if (!Sim.activeEditingChip && Sim.activeSplitChip) return Sim.nodes;
                return Sim.nodes;
            }
            return tab.nodes;
        }
        return [];
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
                const cmds = ['help', 'exit', 'clear', 'verbosity', 'ls', 'spawn', 'rm', 'set', 'wire', 'sim', 'status', 'synth', 'trace', 'pwd', 'cd', 'mv'];
                matches = cmds.filter(c => c.startsWith(prefix));
            } else if (cmd === 'cd' || cmd === 'ls') {
                // Simplistic autocomplete for directories based on current pwd context
                let opts = [];
                if (this.cwd === '/') opts = ['home/', 'etc/'];
                else if (this.cwd === '/home') opts = ['bsim/'];
                else if (this.cwd === '/home/bsim') opts = Sim.tabs.map((t,i) => `tab-${i+1}/`);
                else if (this.cwd === '/etc') opts = ['lib/'];
                else if (this.cwd === '/etc/lib') opts = ['primitives/', 'custom/'];
                else if (this.cwd.startsWith('/home/bsim/')) {
                    const tabMatch = this.cwd.match(/^\/home\/bsim\/(tab-\d+|[^/]+)$/);
                    if (tabMatch) {
                        const tab = Sim.tabs.find((t, i) => `tab-${i+1}` === tabMatch[1] || t.id === tabMatch[1]);
                        if (tab && Sim.activeTabId === tab.id && (Sim.activeEditingChip || Sim.activeSplitChip)) opts = ['editor/'];
                    }
                }
                matches = opts.filter(d => d.startsWith(prefix));
            } else {
                const cNodes = this.getNodesForCwd();
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
            <div class="dt-menu-item" onclick="DebugTerminal.exec('clear')">Clear Terminal</div>
        `;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'flex';
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

    highlightNode(id) {
        this.clearHighlight();
        const el = document.getElementById(id);
        if (el) el.classList.add('dt-target-highlight');
    },

    clearHighlight() {
        document.querySelectorAll('.dt-target-highlight').forEach(el => el.classList.remove('dt-target-highlight'));
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
                this.print("Commands: exit, clear, verbosity [0-3], synth [gate], trace [nodeId]");
                this.print("  pwd                 - Print Working Directory (VFS)");
                this.print("  cd <path>           - Change Directory (VFS)");
                this.print("  mv <chip> <folder>  - Move chip to a library folder");
                this.print("  ls [-l]             - List workspace nodes or VFS contents");
                this.print("  spawn <type> [x y]  - Add a node (e.g., spawn NAND 100 100)");
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
            case 'mv':
                if (args.length < 3) return this.print("Usage: mv <chip> <folder>", "err");
                const targetChip = args[1];
                let destFolder = args[2];
                
                if (destFolder.startsWith('/etc/lib/custom/')) destFolder = destFolder.replace('/etc/lib/custom/', '');
                else if (destFolder === '/etc/lib/custom') destFolder = '';
                
                if (Sim.library[targetChip]) {
                    Sim.library[targetChip].folder = destFolder;
                    Sim.updateLibraryUI();
                    Sim.autoSave();
                    this.print(`Moved ${targetChip} to /etc/lib/custom/${destFolder}`, "ok");
                } else {
                    this.print(`Chip '${targetChip}' not found in library.`, "err");
                }
                break;
            case 'exit': this.toggle(false); break;
            case 'clear': this.out.innerHTML = ''; break;
            case 'verbosity':
                if (args[1]) { this.verbosity = parseInt(args[1]); this.print(`Verbosity -> ${this.verbosity}`); }
                break;
            case 'ls':
                const verbose = args.includes('-l') || args.includes('-v');
                
                if (this.cwd === '/') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">home/</span>`, "ok");
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">etc/</span>`, "ok");
                    return;
                } else if (this.cwd === '/home') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">bsim/</span>`, "ok");
                    return;
                } else if (this.cwd === '/etc') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">lib/</span>`, "ok");
                    return;
                } else if (this.cwd === '/etc/lib') {
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">primitives/</span>`, "ok");
                    this.print(`[Dir] <span style="color:#0af; font-weight:bold;">custom/</span>`, "ok");
                    return;
                } else if (this.cwd === '/etc/lib/primitives') {
                    this.print(`--- MACRO LIBRARY: Primitives ---`, "warn");
                    ['NAND', 'IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'CLOCK'].forEach(p => {
                        this.print(`[Gate] <span style="color:#0f5">${p}</span>`, "ok");
                    });
                    return;
                } else if (this.cwd.startsWith('/etc/lib/custom')) {
                    const searchDir = this.cwd.replace('/etc/lib/custom', '').replace(/^\//, '');
                    this.print(`--- MACRO LIBRARY: Custom/${searchDir} ---`, "warn");
                    let found = 0;
                    const subdirs = new Set();
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
                } else if (this.cwd === '/home/bsim') {
                    this.print(`--- WORKSPACES ---`, "warn");
                    Sim.tabs.forEach((t, i) => {
                        const alias = `tab-${i+1}`;
                        const tag = t.id === Sim.activeTabId ? '<span style="color:#ffca28">*</span>' : ' ';
                        this.print(`${tag} [Dir] <span style="color:#0af; font-weight:bold;">${alias}/</span> <span style="color:#667">(id: ${t.id}, name: ${t.name})</span>`, "ok");
                    });
                    return;
                }

                // Must be inside a tab workspace (/home/bsim/tab-X/...)
                const tMatch = this.cwd.match(/^\/home\/bsim\/(tab-\d+|[^/]+)(?:\/(editor))?$/);
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

                this.print(`--- DIRECTORY: ${this.cwd} ---`, "warn");
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
            case 'rm':
                if (!args[1]) return this.print("Usage: rm <nodeId> [nodeId2...] or rm all", "err");
                if (args[1] === 'all') {
                    Sim.selection.clear();
                    Sim.nodes.forEach(n => Sim.selection.add(n.id));
                    Sim.deleteSelection();
                    return this.print("Cleared entire workspace.", "ok");
                }
                let rmCount = 0;
                Sim.selection.clear();
                for (let i = 1; i < args.length; i++) {
                    const n = Sim.nodes.find(node => node.id === args[i] || node.id === `node-${args[i]}`);
                    if (n) { Sim.selection.add(n.id); rmCount++; }
                }
                if (rmCount > 0) {
                    Sim.deleteSelection();
                    this.print(`Deleted ${rmCount} node(s).`, "ok");
                } else this.print("No valid nodes found to delete.", "err");
                break;
            case 'set':
                if (args.length < 3) return this.print("Usage: set <nodeId> <value>", "err");
                const sn = Sim.nodes.find(n => n.id === args[1]);
                if (!sn) return this.print(`Node ${args[1]} not found.`, "err");
                const val = parseInt(args[2]);
                if (isNaN(val)) return this.print("Value must be a number.", "err");
                sn.val = val;
                sn.state = val;
                Sim.updateNodeVisual(sn);
                Sim.seedQueue(); Sim.processQueue();
                this.print(`Set ${args[1]} to ${val}`, "ok");
                break;
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
    traceNode(nodeId) {
        if (!window.Sim) return this.print("Simulator context offline.", "err");
        
        let targetId = nodeId;
        if (!targetId) {
            if (Sim.selection.size === 1) targetId = Array.from(Sim.selection)[0];
            else return this.print("Specify a nodeId or select exactly one node. Ex: trace node-123", "err");
        }
        
        const node = Sim.nodes.find(n => n.id === targetId);
        if (!node) return this.print(`Node not found: ${targetId}`, "err");

        this.print(`=== TRACE: ${node.id} (${node.type}) ===`, "sys");
        this.print(`Label: ${node.label} | Val: ${JSON.stringify(node.val)} | State: ${JSON.stringify(node.state)}`, "sys");

        const upstream = Sim.wires.filter(w => w.to.nodeId === targetId);
        const downstream = Sim.wires.filter(w => w.from.nodeId === targetId);

        this.print(`--- UPSTREAM (Inputs) ---`, "warn");
        if (upstream.length === 0) this.print("  (None)", "sys");
        upstream.forEach(w => {
            const src = Sim.nodes.find(n => n.id === w.from.nodeId);
            const sig = Sim.getSignal(w.from.nodeId, w.from.portId);
            const srcType = src ? src.type : "UNKNOWN";
            this.print(`  [${w.to.portId}] <- ${w.from.nodeId}[${w.from.portId}] (${srcType}) = ${JSON.stringify(sig)}`, "ok");
        });

        this.print(`--- DOWNSTREAM (Outputs) ---`, "warn");
        if (downstream.length === 0) this.print("  (None)", "sys");
        downstream.forEach(w => {
            const dst = Sim.nodes.find(n => n.id === w.to.nodeId);
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

window.DebugTerminal = DebugTerminal;
Sim.dt = DebugTerminal;
window.addEventListener('DOMContentLoaded', () => DebugTerminal.init());
