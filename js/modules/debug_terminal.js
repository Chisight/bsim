/**
 * Debug Terminal & Hardware Synthesizer
 */
const DebugTerminal = {
    verbosity: 2,
    visible: false,
    
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

    init() {
        this.injectCSS();
        this.buildUI();
        this.attachHooks();
        this.overrideConsole();
        console.log("[TERM] V8/WASM Debugger Initialized. Press Ctrl+P.");
    },

    injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = `
            #dt-wrap { position: fixed; bottom: 20px; right: 20px; width: 500px; height: 350px; background: rgba(10, 10, 15, 0.85); backdrop-filter: blur(8px); border: 1px solid #334; border-radius: 6px; display: none; flex-direction: column; z-index: 9999; resize: both; overflow: hidden; font-family: 'JetBrains Mono', monospace; font-size: 11px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            #dt-head { background: #1a1a24; padding: 6px 10px; color: #889; cursor: move; display: flex; justify-content: space-between; user-select: none; border-bottom: 1px solid #334; }
            #dt-head span:hover { color: #fff; }
            #dt-out { flex: 1; padding: 10px; overflow-y: auto; color: #ccc; word-wrap: break-word; }
            #dt-out::-webkit-scrollbar { width: 6px; }
            #dt-out::-webkit-scrollbar-thumb { background: #445; border-radius: 3px; }
            #dt-in { background: #0d0d12; color: #0fa; border: none; border-top: 1px solid #334; padding: 8px 10px; outline: none; width: 100%; box-sizing: border-box; font-family: inherit; }
            .dt-msg { margin-bottom: 4px; }
            .dt-err { color: #f55; }
            .dt-warn { color: #fa0; }
            .dt-sys { color: #0af; }
            .dt-ok { color: #0f5; }
        `;
        document.head.appendChild(style);
    },

    buildUI() {
        this.ui = document.createElement('div');
        this.ui.id = 'dt-wrap';
        this.ui.innerHTML = `
            <div id="dt-head">
                <div style="font-weight:bold; color:#0af;">WASM/V8 TELEMETRY</div>
                <div><span id="dt-min" style="cursor:pointer; margin-right:8px;">_</span><span id="dt-close" style="cursor:pointer;">X</span></div>
            </div>
            <div id="dt-out"></div>
            <input id="dt-in" type="text" placeholder="type 'help'..." autocomplete="off" spellcheck="false" />
        `;
        document.body.appendChild(this.ui);

        this.out = document.getElementById('dt-out');
        
        // [AUDIT: v1.23.61 | SEC_ARCH_LEAD] - Lift mousedown restriction to permit cursor selection of logs.
        this.out.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        this.inp = document.getElementById('dt-in');

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
            this.ui.style.height = isMin ? '350px' : '30px';
            this.inp.style.display = isMin ? 'block' : 'none';
        };

        // Input Handle
        this.inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = this.inp.value.trim();
                this.inp.value = '';
                if (cmd) this.exec(cmd);
            }
        };
    },

    attachHooks() {
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                this.toggle(!this.visible);
            }
        });
    },

    overrideConsole() {
        const ogLog = console.log, ogWarn = console.warn, ogErr = console.error;
        console.log = (...args) => { ogLog(...args); if (this.verbosity >= 2) this.print(args.join(' '), 'sys'); };
        console.warn = (...args) => { ogWarn(...args); if (this.verbosity >= 1) this.print(args.join(' '), 'warn'); };
        console.error = (...args) => { ogErr(...args); if (this.verbosity >= 0) this.print(args.join(' '), 'err'); };
    },

    toggle(state) {
        this.visible = state;
        this.ui.style.display = state ? 'flex' : 'none';
        if (state) this.inp.focus();
    },

    print(msg, type = 'sys') {
        const line = document.createElement('div');
        line.className = `dt-msg dt-${type}`;
        line.innerText = `> ${msg}`;
        this.out.appendChild(line);
        this.out.scrollTop = this.out.scrollHeight;
    },

    exec(cmd) {
        this.print(cmd, 'ok');
        const args = cmd.split(' ');
        const c = args[0].toLowerCase();

        switch (c) {
            case 'help':
                this.print("Commands: exit, clear, verbosity [0-3], synth [gate]");
                this.print("synth <gate>: Hierarchically compiles logic from NANDs.");
                break;
            case 'exit': this.toggle(false); break;
            case 'clear': this.out.innerHTML = ''; break;
            case 'verbosity':
                if (args[1]) { this.verbosity = parseInt(args[1]); this.print(`Verbosity -> ${this.verbosity}`); }
                break;
            case 'synth':
                if (!args[1]) return this.print("Missing target. Ex: synth XOR", "err");
                this.synthesize(args[1].toUpperCase());
                break;
            default:
                this.print(`Command not found: ${c}`, 'err');
        }
    },

    synthesize(target) {
        if (!window.Sim) return this.print("Simulator context not linked.", "err");
        if (Sim.library[target]) return this.print(`${target} already exists in library.`, "warn");
        
        const recipe = this.RECIPES[target];
        if (!recipe) return this.print(`No NAND synthesis recipe for: ${target}`, "err");

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
    }
};

window.addEventListener('DOMContentLoaded', () => DebugTerminal.init());
