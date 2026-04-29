const SynthUI = {
    state: { in: 3, out: 1, table: [], labels: { ins: [], outs: [] } },
    /**
     * [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - Entry trace for logic synthesis UI activation.
     * @IO: UI_MODAL
     * @ARCH: SYNTHESIS_UI
     * @INTENT: Open the advanced logic synthesizer modal and initialize the truth table UI.
     */
    open() {
        const mBody = document.getElementById('modal-body');
        if (mBody) {
            mBody.style.minWidth = '650px';
            mBody.style.maxWidth = '90vw';
        }
        this.resetTable();
        const html = `
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div style="display:flex; gap:20px; align-items:center; background:rgba(0,0,0,0.1); padding:10px; border-radius:8px;">
                    <label style="color:#aaa; font-size:11px; display:flex; align-items:center; gap:5px;">Inputs: <input type="number" id="synth-ins" value="${this.state.in}" min="1" max="5" onchange="SynthUI.state.in=parseInt(this.value); SynthUI.resetTable(); SynthUI.render()" style="width:40px; background:#111; border:1px solid #334; color:#fff; padding:3px;"></label>
                    <label style="color:#aaa; font-size:11px; display:flex; align-items:center; gap:5px;">Outputs: <input type="number" id="synth-outs" value="${this.state.out}" min="1" max="3" onchange="SynthUI.state.out=parseInt(this.value); SynthUI.resetTable(); SynthUI.render()" style="width:40px; background:#111; border:1px solid #334; color:#fff; padding:3px;"></label>
                    <div style="flex-grow:1"></div>
                    <button class="ui-btn secondary" onclick="SynthUI.resetTable(); SynthUI.render()" style="padding:5px 10px; font-size:11px;">Reset Table</button>
                </div>
                <div style="font-size:10px; color:#556; background:rgba(255,202,40,0.05); padding:8px; border-radius:4px; margin-bottom:5px;">
                    Tip: Clicking input bits allows <strong>X (Don't Care)</strong> folding to group multiple truth rows together.
                </div>
                <div id="synth-table-container" style="max-height:400px; overflow-y:auto; border:1px solid #334; border-radius:4px; background:#0b0b0e;"></div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="ui-btn secondary" onclick="document.getElementById('ui-overlay').style.display='none'">Cancel</button>
                    <button class="ui-btn primary" onclick="SynthUI.build()" style="background:var(--wire-on); color:#000; font-weight:bold;">Synthesize Circuit</button>
                </div>
            </div>
        `;
        Sim.modal('Manual Logic Synthesizer [Advanced]', html, 'custom');
        this.render();
        // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: Synthesis UI opened and table reset.
    },
    /**
     * @STATE: SYNTHESIS_STATE
     * @INTENT: Reinitialize the internal truth table state based on the current number of inputs and outputs.
     */
    resetTable() {
        this.state.table = [];
        this.state.labels.ins = Array.from({ length: this.state.in }, (_, i) => String.fromCharCode(65 + i));
        this.state.labels.outs = Array.from({ length: this.state.out }, (_, i) => `Y${i}`);
        for (let i = 0; i < (1 << this.state.in); i++) {
            this.state.table.push({
                ins: i.toString(2).padStart(this.state.in, '0').split('').map(v => parseInt(v)),
                outs: Array(this.state.out).fill(0), visible: true
            });
        }
        // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: Truth table state reinitialized for ${this.state.in} inputs.
    },
    /**
     * @IO: UI_INTERACTION
     * @STATE: SYNTHESIS_STATE
     * @INTENT: Cycle an input bit between 0, 1, and X (Don't Care) and re-process table folding.
     */
    toggleIn(r, b) {
        const cur = this.state.table[r].ins[b];
        this.state.table[r].ins[b] = (cur === 0) ? 1 : (cur === 1 ? 'X' : 0);
        this.processFolding(); this.render();
    },
    /**
     * @IO: UI_INTERACTION
     * @STATE: SYNTHESIS_STATE
     * @INTENT: Cycle an output bit between 0, 1, and X (Don't Care).
     */
    toggleOut(r, o) {
        const cur = this.state.table[r].outs[o];
        this.state.table[r].outs[o] = (cur === 0) ? 1 : (cur === 1 ? 'X' : 0);
        this.render();
    },
    /**
     * @CONSTRAINT: LOGIC_FOLDING
     * @INTENT: Identify and hide truth table rows that are covered by higher-level "Don't Care" (X) patterns.
     */
    processFolding() {
        this.state.table.forEach(row => row.visible = true);
        for (let i = 0; i < this.state.table.length; i++) {
            if (!this.state.table[i].visible) continue;
            const r1 = this.state.table[i];
            for (let j = i + 1; j < this.state.table.length; j++) {
                if (!this.state.table[j].visible) continue;
                const r2 = this.state.table[j];
                let isCovered = true;
                for (let b = 0; b < this.state.in; b++) {
                    if (r1.ins[b] !== 'X' && r1.ins[b] !== r2.ins[b]) {
                        isCovered = false; break;
                    }
                }
                if (isCovered) this.state.table[j].visible = false;
            }
        }
        // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: Logic folding pass complete.
    },
    /**
     * @IO: UI_RENDERING
     * @INTENT: Redraw the truth table DOM elements based on the current synthesis state.
     */
    render() {
        const cont = document.getElementById('synth-table-container');
        if (!cont) return;
        let html = '<style>.bit-btn { width: 30px; height: 30px; border: 1px solid #334; background: #222; color: #fff; cursor: pointer; border-radius: 4px; font-weight: bold; margin: 2px; } .bit-1 { border-color: var(--wire-on); color: var(--wire-on); background: rgba(0, 204, 136, 0.1); } .bit-0 { border-color: var(--wire-off); color: var(--wire-off); background: rgba(136, 51, 51, 0.1); } .bit-X { border-color: #a855f7; color: #a855f7; background: rgba(168, 85, 247, 0.1); }</style> ';
        html += '<table style="width:100%; border-collapse:collapse; text-align:center;"><thead><tr style="border-bottom:1px solid #334">';
        for (let i = 0; i < this.state.in; i++) {
            html += `<th><input type="text" value="${this.state.labels.ins[i]}" onchange="SynthUI.state.labels.ins[${i}]=this.value" style="width:30px; background:transparent; border:none; color:inherit; text-align:center; font-weight:bold;"></th>`;
        }
        html += '<th style="width:2px; background:#334; padding:0;"></th>';
        for (let i = 0; i < this.state.out; i++) {
            html += `<th><input type="text" value="${this.state.labels.outs[i]}" onchange="SynthUI.state.labels.outs[${i}]=this.value" style="width:30px; background:transparent; border:none; color:inherit; text-align:center; font-weight:bold;"></th>`;
        }
        html += '</tr></thead><tbody>';

        this.state.table.forEach((row, rIdx) => {
            if (!row.visible) return;
            html += `<tr style="border-bottom:1px solid #1a1a23">`;
            row.ins.forEach((v, bIdx) => {
                html += `<td><button class="bit-btn bit-${v}" onclick="SynthUI.toggleIn(${rIdx},${bIdx})">${v}</button></td>`;
            });
            html += '<td style="background:#334; padding:0;"></td>';
            row.outs.forEach((v, oIdx) => {
                html += `<td><button class="bit-btn bit-${v}" onclick="SynthUI.toggleOut(${rIdx},${oIdx})">${v}</button></td>`;
            });
            html += `</tr>`;
        });
        html += '</tbody></table>';
        cont.innerHTML = html;
    },
    /**
     * @ARCH: SYNTHESIS_DISPATCHER
     * @INTENT: Extract the truth table data and dispatch it to the LogicSynthesizer for netlist generation.
     */
    build() {
        const ins = this.state.in;
        const outs = this.state.out;
        const rows = 1 << ins;
        const outputsData = [];
        for (let o = 0; o < outs; o++) {
            const truthArray = Array(rows).fill(0);
            this.state.table.forEach(row => {
                if (!row.visible) return;
                const potentialIndices = [0];
                row.ins.forEach((val, bitIdx) => {
                    const mask = 1 << (ins - 1 - bitIdx);
                    if (val === 1) potentialIndices.forEach((p, idx) => potentialIndices[idx] |= mask);
                    else if (val === 'X') {
                        const len = potentialIndices.length;
                        for (let i = 0; i < len; i++) potentialIndices.push(potentialIndices[i] | mask);
                    }
                });
                const result = row.outs[o] === 'X' ? -1 : (row.outs[o] === 1 ? 1 : 0);
                potentialIndices.forEach(idx => truthArray[idx] = result);
            });
            outputsData.push({ label: this.state.labels.outs[o], truthArray });
        }
        // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: Dispatched logic data for synthesis.
        LogicSynthesizer.synthesizeToChip(outputsData, this.state.labels.ins, "");
    }
};

window.SynthUI = SynthUI;
