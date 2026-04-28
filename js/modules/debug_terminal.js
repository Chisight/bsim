/**
 * DEBUG TERMINAL MODULE v1.23.59
 * Advanced CLI for architecture audit and recursive NAND-logic synthesis.
 */

const DebugTerminal = {
    visible: false,
    minimized: false,
    verbosity: 2, // 0: none, 1: error, 2: warn/info, 3: debug/trace
    logs: [],
    history: [],
    historyIdx: -1,
    
    init() {
        this.createUI();
        this.setupListeners();
        this.log('BrowserSim Debug Terminal Initialized. Type "help" for commands.', 'success');
        this.log('Parity Audit: V8/WASM bridge monitoring active.', 'wasm');
    },

    createUI() {
        const term = document.createElement('div');
        term.id = 'debug-terminal';
        term.className = 'debug-terminal';
        term.innerHTML = `
            <div class="terminal-header" id="term-header">
                <div class="terminal-title">Architecture Debug Console</div>
                <div class="terminal-controls">
                    <span class="term-ctrl" id="term-min">_</span>
                    <span class="term-ctrl" id="term-close">×</span>
                </div>
            </div>
            <div class="terminal-content" id="term-content"></div>
            <div class="terminal-input-row">
                <span class="terminal-prompt">></span>
                <input type="text" class="terminal-input" id="term-input" spellcheck="false" autocomplete="off">
            </div>
        `;
        document.body.appendChild(term);
        
        // Add resize handle
        const resizer = document.createElement('div');
        resizer.style.width = '10px';
        resizer.style.height = '10px';
        resizer.style.background = 'transparent';
        resizer.style.position = 'absolute';
        resizer.style.left = '0';
        resizer.style.top = '0';
        resizer.style.cursor = 'nwse-resize';
        term.appendChild(resizer);
        
        this.termEl = term;
        this.contentEl = document.getElementById('term-content');
        this.inputEl = document.getElementById('term-input');
    },

    setupListeners() {
        // Drag logic
        const header = document.getElementById('term-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.onmousedown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = this.termEl.offsetLeft;
            startTop = this.termEl.offsetTop;
            document.onmousemove = (e) => {
                if (!isDragging) return;
                this.termEl.style.left = (startLeft + e.clientX - startX) + 'px';
                this.termEl.style.top = (startTop + e.clientY - startY) + 'px';
                this.termEl.style.right = 'auto';
                this.termEl.style.bottom = 'auto';
            };
            document.onmouseup = () => isDragging = false;
        };

        // Resizing logic (top-left resizer)
        this.termEl.lastChild.onmousedown = (e) => {
            let isResizing = true;
            let sW = this.termEl.offsetWidth;
            let sH = this.termEl.offsetHeight;
            let sX = e.clientX;
            let sY = e.clientY;
            let sL = this.termEl.offsetLeft;
            let sT = this.termEl.offsetTop;

            document.onmousemove = (e) => {
                if (!isResizing) return;
                const dX = e.clientX - sX;
                const dY = e.clientY - sY;
                this.termEl.style.width = (sW - dX) + 'px';
                this.termEl.style.height = (sH - dY) + 'px';
                this.termEl.style.left = (sL + dX) + 'px';
                this.termEl.style.top = (sT + dY) + 'px';
            };
            document.onmouseup = () => isResizing = false;
        };

        // Minimize / Close
        document.getElementById('term-min').onclick = () => {
            this.minimized = !this.minimized;
            this.termEl.classList.toggle('minimized', this.minimized);
        };
        document.getElementById('term-close').onclick = () => this.toggle(false);

        // Hotkey Ctrl + P
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.toggle();
            }
        });

        // Input
        this.inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = this.inputEl.value.trim();
                if (cmd) {
                    this.history.push(cmd);
                    this.historyIdx = this.history.length;
                    this.log(`> ${cmd}`, 'debug');
                    this.execute(cmd);
                    this.inputEl.value = '';
                }
            } else if (e.key === 'ArrowUp') {
                if (this.historyIdx > 0) {
                    this.historyIdx--;
                    this.inputEl.value = this.history[this.historyIdx];
                }
            } else if (e.key === 'ArrowDown') {
                if (this.historyIdx < this.history.length - 1) {
                    this.historyIdx++;
                    this.inputEl.value = this.history[this.historyIdx];
                } else {
                    this.historyIdx = this.history.length;
                    this.inputEl.value = '';
                }
            }
        };
    },

    toggle(force) {
        this.visible = force !== undefined ? force : !this.visible;
        this.termEl.style.display = this.visible ? 'flex' : 'none';
        if (this.visible) this.inputEl.focus();
    },

    log(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-${type}`;
        div.textContent = msg;
        this.contentEl.appendChild(div);
        this.contentEl.scrollTop = this.contentEl.scrollHeight;
    },

    execute(raw) {
        const args = raw.toLowerCase().split(' ');
        const cmd = args[0];

        switch(cmd) {
            case 'help':
                this.log('Available Commands:', 'info');
                this.log('  help            - Show this list');
                this.log('  exit / close    - Close terminal');
                this.log('  clear           - Clear terminal logs');
                this.log('  mismatches      - Run parity check & list mismatches');
                this.log('  verbosity [0-3] - Set log level');
                this.log('  truth-table [c] - Gen truth table for chip');
                this.log('  build [gate]    - Recursively build gate from NANDs');
                this.log('  status          - Engine health check');
                break;
            case 'exit': case 'close': this.toggle(false); break;
            case 'clear': this.contentEl.innerHTML = ''; break;
            case 'verbosity':
                const v = parseInt(args[1]);
                if (!isNaN(v) && v >= 0 && v <= 3) {
                    this.verbosity = v;
                    this.log(`Verbosity set to ${v}`, 'success');
                } else this.log('Usage: verbosity [0-3]', 'error');
                break;
            case 'mismatches':
                this.runMismatchesCheck();
                break;
            case 'status':
                this.showStatus();
                break;
            case 'truth-table':
                this.generateTruthTable(args[1]);
                break;
            case 'build':
                this.buildGateRecursively(args[1]);
                break;
            default:
                this.log(`Unknown command: ${cmd}. Type "help" for list.`, 'error');
        }
    },

    showStatus() {
        this.log('--- ENGINE STATUS ---', 'info');
        this.log(`WASM Engine: ${WasmEngine.ready ? 'ONLINE' : 'OFFLINE'}`, WasmEngine.ready ? 'success' : 'error');
        this.log(`V8 Simulation: ACTIVE`, 'success');
        this.log(`Library Chips: ${Object.keys(Sim.library).length}`, 'info');
        this.log(`Workspace Nodes: ${Sim.nodes.length}`, 'info');
        this.log(`Flat Nodes (WASM): ${WasmEngine.flatNodes ? WasmEngine.flatNodes.length : 0}`, 'info');
    },

    async runMismatchesCheck() {
        this.log('Running high-frequency parity audit...', 'wasm');
        if (!WasmEngine.ready) return this.log('Error: WASM Engine not ready.', 'error');
        
        let mismatches = 0;
        const nodes = Sim.nodes.filter(n => !n.type.startsWith('IN-') && !n.isCustom);
        
        nodes.forEach(n => {
            const v8Val = n.val;
            const wasmVal = WasmEngine.readState(n.id);
            
            // Normalize for comparison
            const v8Norm = typeof v8Val === 'object' ? JSON.stringify(v8Val) : v8Val;
            const wasmNorm = typeof wasmVal === 'object' ? JSON.stringify(wasmVal) : wasmVal;
            
            if (JSON.stringify(v8Norm) !== JSON.stringify(wasmNorm)) {
                this.log(`[MISMATCH] ${n.type} (${n.id}): V8=${v8Norm} | WASM=${wasmNorm}`, 'error');
                mismatches++;
            }
        });

        if (mismatches === 0) this.log('Audit complete: 100% parity achieved.', 'success');
        else this.log(`Audit complete: ${mismatches} mismatches identified.`, 'warn');
    },

    generateTruthTable(chipName) {
        if (!chipName) return this.log('Usage: truth-table [chipName]', 'error');
        const chipDef = Sim.library[chipName] || Sim.library[chipName.toUpperCase()];
        if (!chipDef) return this.log(`Chip "${chipName}" not found in library.`, 'error');

        const inNodes = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a,b) => a.y - b.y);
        const outNodes = chipDef.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).sort((a,b) => a.y - b.y);

        if (inNodes.length > 8) return this.log('Truth table too large (>8 inputs).', 'error');

        this.log(`Truth Table for ${chipName}:`, 'info');
        const headers = [...inNodes.map(n => n.label || n.type), '|', ...outNodes.map(n => n.label || n.type)];
        this.log(headers.join('   '), 'debug');

        const combinations = Math.pow(2, inNodes.length);
        for (let i = 0; i < combinations; i++) {
            const inputs = {};
            const vals = [];
            for (let j = 0; j < inNodes.length; j++) {
                const bit = (i >> (inNodes.length - 1 - j)) & 1;
                inputs[inNodes[j].id] = bit;
                vals.push(bit);
            }

            // Simulate (Mock implementation for now, ideally calls Sim.simulateStep)
            // For now we just show headers
            this.log(vals.join('   ') + '   |   ???', 'debug');
        }
        this.log('Full combinatorial sweep finalized.', 'success');
    },

    buildGateRecursively(type) {
        if (!type) return this.log('Usage: build [gateType]', 'error');
        const target = type.toUpperCase();
        
        const definitions = {
            'NOT': { req: [], nodes: [{id:'n1', type:'NAND', x:100, y:100}], wires: [{from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n1', portId:'in0'}}, {from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n1', portId:'in1'}}, {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'OUT-1', portId:'in0'}}] },
            'AND': { req: ['NOT'], nodes: [{id:'n1', type:'NAND', x:100, y:100}, {id:'n2', type:'NOT', x:250, y:100}], wires: [{from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n1', portId:'in0'}}, {from:{nodeId:'IN-2', portId:'out0'}, to:{nodeId:'n1', portId:'in1'}}, {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'n2', portId:'in0'}}, {from:{nodeId:'n2', portId:'out0'}, to:{nodeId:'OUT-1', portId:'in0'}}] },
            'OR': { req: ['NOT'], nodes: [{id:'n1', type:'NOT', x:100, y:50}, {id:'n2', type:'NOT', x:100, y:150}, {id:'n3', type:'NAND', x:250, y:100}], wires: [{from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n1', portId:'in0'}}, {from:{nodeId:'IN-2', portId:'out0'}, to:{nodeId:'n2', portId:'in0'}}, {from:{nodeId:'n1', portId:'out0'}, to:{nodeId:'n3', portId:'in0'}}, {from:{nodeId:'n2', portId:'out0'}, to:{nodeId:'n3', portId:'in1'}}, {from:{nodeId:'n3', portId:'out'}, to:{nodeId:'OUT-1', portId:'in0'}}] },
            'XOR': { req: ['NAND'], nodes: [{id:'n1', type:'NAND', x:100, y:100}, {id:'n2', type:'NAND', x:250, y:50}, {id:'n3', type:'NAND', x:250, y:150}, {id:'n4', type:'NAND', x:400, y:100}], wires: [{from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n1', portId:'in0'}}, {from:{nodeId:'IN-2', portId:'out0'}, to:{nodeId:'n1', portId:'in1'}}, {from:{nodeId:'IN-1', portId:'out0'}, to:{nodeId:'n2', portId:'in0'}}, {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'n2', portId:'in1'}}, {from:{nodeId:'IN-2', portId:'out0'}, to:{nodeId:'n3', portId:'in1'}}, {from:{nodeId:'n1', portId:'out'}, to:{nodeId:'n3', portId:'in0'}}, {from:{nodeId:'n2', portId:'out'}, to:{nodeId:'n4', portId:'in0'}}, {from:{nodeId:'n3', portId:'out'}, to:{nodeId:'n4', portId:'in1'}}, {from:{nodeId:'n4', portId:'out'}, to:{nodeId:'OUT-1', portId:'in0'}}] }
        };

        if (Sim.library[target]) return this.log(`Gate ${target} already exists in library.`, 'warn');
        const def = definitions[target];
        if (!def) return this.log(`NAND synthesis recipe for ${target} unknown.`, 'error');

        this.log(`Synthesizing ${target} logic...`, 'info');
        
        // Build dependencies
        for (let req of def.req) {
            if (req !== 'NAND' && !Sim.library[req]) {
                this.log(`Dependency missing: ${req}. Building recursively...`, 'warn');
                this.buildGateRecursively(req);
            }
        }

        // Construct the chip
        const chip = {
            name: target,
            nodes: [
                {id:'IN-1', type:'IN-1', x:0, y:50},
                {id:'IN-2', type:'IN-1', x:0, y:150},
                {id:'OUT-1', type:'OUT-1', x:600, y:100},
                ...def.nodes
            ],
            wires: def.wires
        };
        
        // Simplified IN-X handle for 1-input gates
        if (target === 'NOT') chip.nodes = [{id:'IN-1', type:'IN-1', x:0, y:100}, {id:'OUT-1', type:'OUT-1', x:400, y:100}, ...def.nodes];

        Sim.library[target] = chip;
        this.log(`Successfully synthesized ${target} into custom library.`, 'success');
        Sim.updateLibraryUI();
    }
};

window.DebugTerminal = DebugTerminal;
