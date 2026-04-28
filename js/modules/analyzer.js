/**
 * Logic Analyzer Module v1.23.70 (Modular Professional)
 * Handles truth table generation, BOM estimation, and signal tracing.
 */
const Analyzer = {
    _lastTruthTable: null,

    /**
     * [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - Entry trace for truth table generation.
     * @ARCH: LOGIC_ANALYZER
     * @IO: TRUTH_TABLE_GEN
     * @INTENT: Exhaustively iterate through all input permutations to generate a deterministic truth table of the current netlist.
     */
    generateTruthTable() {
        const rawInNodes = Sim.nodes.filter(n => n.type.startsWith('IN-'));
        const rawOutNodes = Sim.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-'));

        if (rawInNodes.length === 0 || rawOutNodes.length === 0) {
            // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Truth table generation aborted (missing IO).
            return Sim.modal('Error', 'Requires at least 1 IN and 1 OUT/PROBE.', 'alert');
        }

        const bitMap = [];
        let totalBits = 0;
        rawInNodes.forEach(n => {
            const bits = parseInt(n.type.split('-')[1]) || 1;
            for (let i = 0; i < bits; i++) {
                bitMap.push({ node: n, portIndex: i, label: bits === 1 ? n.label : `${n.label}[${bits - 1 - i}]` });
                totalBits++;
            }
        });

        if (totalBits > 8) {
            // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Truth table generation aborted (bit limit exceeded).
            return Sim.modal('Error', 'Limit 8 input bits total to prevent stack overflow.', 'alert');
        }

        const snapshot = JSON.stringify(Sim.nodes.map(n => ({ id: n.id, val: n.val, state: n.state })));
        const resultsMinterms = rawOutNodes.map(() => []);

        let html = `<div style="max-height: 50vh; overflow-y: auto; resize: vertical; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 15px; background: #0f0f13; position: relative;">`;
        html += `<table style="width:100%; text-align:center; border-collapse:collapse; color:#fff; font-size:11px;">`;
        html += `<thead style="position: sticky; top: 0; background: #22222b; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">`;
        html += `<tr style="border-bottom:1px solid #445;">`;
        bitMap.forEach(bm => html += `<th style="padding:6px 4px; color:#889;">${bm.label}</th>`);
        rawOutNodes.forEach(n => html += `<th style="padding:6px 4px; color:var(--accent);">${n.label}</th>`);
        html += `</tr></thead><tbody>`;

        const totalCombos = 1 << totalBits;
        for (let i = 0; i < totalCombos; i++) {
            // Apply flattened input permutations
            bitMap.forEach((bm, idx) => {
                const bitVal = (i & (1 << (totalBits - 1 - idx))) ? 1 : 0;
                if (Array.isArray(bm.node.state)) bm.node.state[bm.portIndex] = bitVal;
                else bm.node.state = bitVal;
                bm.node.val = bm.node.state;
            });

            // Stabilization loop (10-step buffer)
            for (let step = 0; step < 10; step++) {
                Sim.nodes.forEach(n => {
                    if (n.type.startsWith('IN-')) return;
                    const next = Sim.calculateNextState(n);
                    n.val = (typeof next === 'string' && next !== 'Z') ? JSON.parse(next) : next;
                    if (n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')) {
                        const bitsArr = parseInt(n.type.split('-')[1]) || 1;
                        if (Array.isArray(n.state)) {
                            for (let b = 0; b < bitsArr; b++) n.state[b] = Sim.getDrivingSignal(n.id, `in${b}`);
                        } else { n.state = Sim.getDrivingSignal(n.id, 'in0'); }
                    }
                });
            }

            html += `<tr style="border-bottom:1px solid #223;">`;
            bitMap.forEach(bm => {
                const bitValLine = Array.isArray(bm.node.state) ? bm.node.state[bm.portIndex] : bm.node.state;
                html += `<td style="padding:5px; color:#aaa">${bitValLine}</td>`;
            });
            rawOutNodes.forEach((n, outIdx) => {
                let displayVal;
                if (n.type === 'OUT-1') {
                    displayVal = (n.val === null || n.val === 'Z') ? 0 : n.val;
                    if (displayVal === 1) resultsMinterms[outIdx].push(i);
                } else {
                    const bitsArr = parseInt(n.type.split('-')[1]) || 1;
                    const valArr = Array.isArray(n.state) ? n.state : new Array(bitsArr).fill(0);
                    displayVal = valArr.map(v => (v === null || v === 'Z') ? 0 : v).join('');
                    if (valArr[0] === 1) resultsMinterms[outIdx].push(i); 
                }
                const color = displayVal.toString().includes('1') ? 'var(--wire-on)' : 'var(--wire-off)';
                html += `<td style="padding:5px; color:${color}">${n.type.startsWith('PROBE-') ? n.label : displayVal}</td>`;
            });
            html += `</tr>`;
        }
        html += `</tbody></table></div>`;

        this._lastTruthTable = {
            inputs: bitMap.map(bm => bm.label),
            outputs: rawOutNodes.map((n, idx) => ({
                label: n.label,
                truthArray: Array.from({ length: totalCombos }, (_, i) => resultsMinterms[idx].includes(i) ? 1 : 0)
            }))
        };

        const saved = JSON.parse(snapshot);
        Sim.nodes.forEach(n => {
            const s = saved.find(x => x.id === n.id);
            if (s) { n.val = s.val; n.state = s.state; }
        });
        Sim.updateWireVisuals();

        // Display diagnostic table
        Sim.modal('Truth Table Analysis', html, 'alert');
        // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Truth table generation complete. Input bits: ${totalBits}.
    },

    /**
     * [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - Entry trace for hardware bill-of-materials estimation.
     * @ARCH: HARDWARE_BOM_ANALYZER
     * @IO: HARDWARE_ESTIMATOR
     * @INTENT: Calculate the bill of materials (BOM) based on standard 74-series logic IC capacities.
     */
    generateBOM() {
        const counts = { NAND: 0, NOR: 0, AND: 0, OR: 0, NOT: 0, TRISTATE: 0, DFF: 0, TFF: 0 };
        Sim.nodes.forEach(n => { if (counts[n.type] !== undefined) counts[n.type]++; });

        const nandICs = Math.ceil(counts.NAND / 4);
        const norICs = Math.ceil(counts.NOR / 4);
        const andICs = Math.ceil(counts.AND / 4);
        const orICs = Math.ceil(counts.OR / 4);
        const notICs = Math.ceil(counts.NOT / 6);
        const triICs = Math.ceil(counts.TRISTATE / 4);
        const dffICs = Math.ceil(counts.DFF / 2);
        const tffICs = Math.ceil(counts.TFF / 2);
        const totalICs = nandICs + norICs + andICs + orICs + notICs + triICs + dffICs + tffICs;

        let html = `<div style="color:#aaa; font-size:14px; line-height:1.6; text-align:left;">`;
        html += `<div style="margin-bottom:15px">Physical components required for current design:</div>`;

        const row = (label, count, icType, ics) => `
            <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #2d2d38;">
                <span><strong>${label}:</strong> ${count} gates</span>
                <span style="color:var(--accent); font-weight:700;">${ics} × ${icType} ICs</span>
            </div>`;

        if (counts.NAND > 0) html += row('NAND Gates', counts.NAND, '7400', nandICs);
        if (counts.NOR > 0) html += row('NOR Gates', counts.NOR, '7402', norICs);
        if (counts.AND > 0) html += row('AND Gates', counts.AND, '7408', andICs);
        if (counts.OR > 0) html += row('OR Gates', counts.OR, '7432', orICs);
        if (counts.NOT > 0) html += row('NOT Gates', counts.NOT, '7404', notICs);
        if (counts.TRISTATE > 0) html += row('Tristate Buffers', counts.TRISTATE, '74125', triICs);
        if (counts.DFF > 0) html += row('D-Flip Flops', counts.DFF, '7474', dffICs);
        if (counts.TFF > 0) html += row('T-Flip Flops', counts.TFF, '7473', tffICs);

        if (totalICs === 0) {
            html += `<div style="text-align:center; padding:30px; color:#556; font-style:italic;">No discrete logic gates detected.</div>`;
        } else {
            html += `<div style="margin-top:25px; text-align:right; font-weight:800; color:#fff; font-size:18px;">Total IC Packages: ${totalICs}</div>`;
        }
        html += `</div>`;

        Sim.modal('Hardware BOM Estimation', html, 'alert');
        // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: BOM estimation complete. Total ICs: ${totalICs}.
    },
    
    /**
     * [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - Entry trace for recursive hierarchy flattening.
     * @ARCH: HIERARCHY_COMPILER
     * @CONSTRAINT: MAX_DEPTH=256
     * @INTENT: Flatten nested macro hierarchies into primitive signal nodes with recursion depth safety.
     */
    // [AUDIT: v1.23.62 | SEC_ARCH_LEAD] - Workflow 09: Hierarchical Recursion Limits (HRL).
    flattenHierarchy(node, depth = 0) {
        if (depth > 256) {
            console.error(`[FATAL_RECURSION_ERROR] Macro depth exceeded safety limit (MAX_DEPTH=256).`);
            throw new Error(`[FATAL_RECURSION_ERROR] Halting execution to prevent V8 stack smash.`);
        }
        if (!node.isMacro) {
            // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Leaf node reached during flattening: ${node.id}.
            return [node];
        }
        
        let subNodes = [];
        node.internalNodes.forEach(sub => {
            subNodes.push(...this.flattenHierarchy(sub, depth + 1));
        });
        // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Macro flattening complete for ${node.id} at depth ${depth}.
        return subNodes;
    },
    /**
     * [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - Entry trace for deterministic port mapping.
     * @ARCH: PORT_MAPPER
     * @INTENT: Ensure deterministic LSB-to-MSB (0-to-n) port mapping for macro inputs/outputs.
     */
    // [AUDIT: v1.23.63 | SEC_ARCH_LEAD] - Ensure deterministic LSB-to-MSB (0-to-n) port mapping for macro inputs/outputs.
    getMacroPortMapping(macroNode) {
        const mapping = {};
        macroNode.internalNodes.forEach(node => {
            const type = node.type;
            if (type.startsWith('IN-')) {
                const width = parseInt(type.split('-')[1]) || 1;
                for (let i = 0; i < width; i++) {
                    mapping[`in${i}`] = { nodeId: node.id, portId: width === 1 ? 'out' : `out${i}` };
                }
            } else if (type.startsWith('OUT-') || type.startsWith('PROBE-')) {
                const width = parseInt(type.split('-')[1]) || 1;
                for (let i = 0; i < width; i++) {
                    mapping[`out${i}`] = { nodeId: node.id, portId: width === 1 ? 'in' : `in${i}` };
                }
            }
        });
        // [AUDIT: v1.23.70 | SEC_ARCH_LEAD] - EXIT_TRACE: Port mapping complete for macro ${macroNode.id}.
        return mapping;
    }
};

window.Analyzer = Analyzer;
