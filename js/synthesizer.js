/**
 * Logic Synthesizer v1.23.75 (Modular Professional)
 * Implements Quine-McCluskey SOP minimization and Parity Extraction.
 * FIXED: Uses only defined library chips and loops for equivalents.
 */
const LogicSynthesizer = {
    /**
     * [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - Entry trace for signature map generation.
     * @ARCH: SYNTHESIS_ANALYZER
     * @STATE: LIBRARY_SIGNATURES
     * @INTENT: Scan the library and native gates to generate unique truth-table signatures for logical matching.
     */
    generateSignatureMap() {
        console.log("[DEBUG] Generating library signature map for synthesis...");
        const signatures = new Map();

        // Strict Bottom-Up: Only NAND is granted as a native free primitive.
        // ALL other logic gates must be built and saved to the library to be used as shortcuts.
        signatures.set('1110', { name: 'NAND', inputs: 2, isPrimitive: true });

        // Loop through current library to find equivalents
        Object.keys(Sim.library).forEach(chipName => {
            const meta = Sim.library[chipName];
            const ins = meta.nodes.filter(n => n.type === 'IN-1');
            const outs = meta.nodes.filter(n => n.type === 'OUT-1');
            if (outs.length !== 1 || ins.length === 0 || ins.length > 4) return;

            const totalCombos = 1 << ins.length;
            let sig = '';
            // generate truth table for the chip
            for (let i = 0; i < totalCombos; i++) {
                const testInputs = {};
                ins.forEach((node, idx) => {
                    testInputs[node.id] = (i & (1 << (ins.length - 1 - idx))) ? 1 : 0;
                });
                // simulate the chip
                const result = Sim.simulateInternalCircuit({ meta }, testInputs);
                sig += result[outs[0].id] ? '1' : '0';
            }
            console.log(`[DEBUG] Library Chip Signature | Name: ${chipName} | Sig: ${sig}`);
            if (!signatures.has(sig)) {
                signatures.set(sig, { name: chipName, inputs: ins.length });
            }
        });

        console.log(`[DEBUG] Signature map generation complete. Found ${signatures.size} distinct patterns.`);
        // [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - EXIT_TRACE: Signature map generated with ${signatures.size} entries.
        return signatures;
    },

    /**
     * [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - Entry trace for chip synthesis orchestration.
     * @ARCH: SYNTHESIS_ORCHESTRATOR
     * @IO: UI_MODAL
     * @INTENT: High-level orchestration for converting a truth table into a named library chip.
     */
    synthesizeToChip(outputsData, inputLabels, defaultName) {
        console.log(`[DEBUG] synthesizeToChip triggered | Inputs: ${inputLabels.length} | Outputs: ${outputsData.length}`);
        Sim.toast('Analyzing truth table...', 'info');
        Sim.modal('Package Synthesized Logic', 'Enter name for custom chip:', 'prompt', (chipName) => {
            if (!chipName) { 
                console.warn("[DEBUG] Synthesis aborted: No chip name provided.");
                // [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - EXIT_TRACE: Synthesis aborted, missing chip name.
                return;
            }
            chipName = chipName.toUpperCase().trim().replace(/\s+/g, '_');
            console.log(`[DEBUG] Starting synthesis for chip: ${chipName}`);
            Sim.toast(`Generating logic for ${chipName}...`, 'success');

            Sim.workspaceStack.push({ nodes: JSON.parse(JSON.stringify(Sim.nodes)), wires: JSON.parse(JSON.stringify(Sim.wires)) });
            Sim.nodes = []; Sim.wires = [];
            document.getElementById('scene').innerHTML = '';

            inputLabels.forEach((lbl, i) => { Sim.addNode('IN-1', 50, 100 + (i * 100), lbl); });
            this.synthesize(outputsData, inputLabels, chipName);

            Sim.library[chipName] = { nodes: JSON.parse(JSON.stringify(Sim.nodes)), wires: JSON.parse(JSON.stringify(Sim.wires)) };

            Sim.activeEditingChip = chipName;
            Sim.uiExitChipEdit();
            Sim.updateLibraryUI();
            Sim.modal('Synthesis Complete', `Mapped logic to Library Chip: <strong>${chipName}</strong>.`, 'alert');
        }, defaultName);
    },

    /**
     * [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - Entry trace for QM logic minimization.
     * @ARCH: LOGIC_SYNTHESIZER
     * @CONSTRAINT: QUINE_MCCLUSKEY
     * @INTENT: Primary logic synthesis engine using Quine-McCluskey minimization to generate an optimized netlist.
     */
    synthesize(outputsData, inputLabels, targetChipName = "") {
        console.log(`[DEBUG] LogicSynthesizer.synthesize started for target: ${targetChipName}`);
        const numVars = inputLabels.length;
        const inputs = Sim.nodes.filter(n => n.type === 'IN-1');
        const sigMap = this.generateSignatureMap();

        const spawnGate = (chipName, inRefs, x, y) => {
            const node = Sim._finalizeAddNode(chipName, x, y, chipName);
            let inPorts = [];
            if (node.type === 'NOT') inPorts = ['a'];
            else if (node.type === 'NAND' || node.type === 'AND' || node.type === 'OR' || node.type === 'NOR' || node.type === 'XOR' || node.type === 'XNOR') inPorts = ['a', 'b'];
            else if (node.type === 'OUT-1') inPorts = ['in0'];
            else if (node.isCustom) inPorts = Sim.library[node.type].nodes.filter(n => n.type.startsWith('IN-')).map(n => n.id);

            inRefs.forEach((ref, i) => {
                if (inPorts[i]) {
                    Sim.connectNodes(ref.id, ref.port, node.id, inPorts[i]);
                }
            });
            return { id: node.id, port: node.isCustom ? Sim.library[node.type].nodes.filter(n => n.type.startsWith('OUT-'))[0].id : 'q' };
        };

        const spawnNOT = (inRef, x, y) => {
            const sig10 = sigMap.get('10');
            if (sig10 && sig10.name !== targetChipName && (sig10.isPrimitive || Sim.library[sig10.name])) return spawnGate(sig10.name, [inRef], x, y);
            return spawnGate('NAND', [inRef, inRef], x, y);
        };

        const spawnAND2 = (ref1, ref2, x, y) => {
            const sig0001 = sigMap.get('0001');
            if (sig0001 && sig0001.name !== targetChipName && Sim.library[sig0001.name]) return spawnGate(sig0001.name, [ref1, ref2], x, y);
            const nandOut = spawnGate('NAND', [ref1, ref2], x, y);
            return spawnNOT(nandOut, x + 80, y);
        };

        const spawnOR2 = (ref1, ref2, x, y) => {
            const sig0111 = sigMap.get('0111');
            if (sig0111 && sig0111.name !== targetChipName && Sim.library[sig0111.name]) return spawnGate(sig0111.name, [ref1, ref2], x, y);
            const notA = spawnNOT(ref1, x, y - 20);
            const notB = spawnNOT(ref2, x, y + 20);
            return spawnGate('NAND', [notA, notB], x + 80, y);
        };

        const spawnNOR2 = (ref1, ref2, x, y) => {
            const sig0001 = sigMap.get('0001');
            if (sig0001 && sig0001.name !== targetChipName && Sim.library[sig0001.name]) return spawnGate(sig0001.name, [ref1, ref2], x, y);
            const orOut = spawnOR2(ref1, ref2, x, y);
            return spawnNOT(orOut, x + 80, y);
        };

        const spawnXOR2_internal = (ref1, ref2, x, y) => {
            const xorSig = sigMap.get('0110');
            if (xorSig && (['NAND'].includes(xorSig.name) || !!Sim.library[xorSig.name]) && xorSig.name !== targetChipName) {
                return spawnGate(xorSig.name, [ref1, ref2], x, y);
            }
            const n1 = spawnGate('NAND', [ref1, ref2], x, y);
            const n2 = spawnGate('NAND', [ref1, n1], x + 80, y - 40);
            const n3 = spawnGate('NAND', [ref2, n1], x + 80, y + 40);
            return spawnGate('NAND', [n2, n3], x + 160, y);
        };

        const spawnXNOR2_internal = (ref1, ref2, x, y) => {
            const xnorSig = sigMap.get('1001');
            if (xnorSig && xnorSig.name !== targetChipName && Sim.library[xnorSig.name]) return spawnGate(xnorSig.name, [ref1, ref2], x, y);

            // Wikipedia Optimized XNOR: [ (A NAND A) NAND (B NAND B) ] NAND (A NAND B)
            const notA = spawnNOT(ref1, x, y - 40);
            const notB = spawnNOT(ref2, x, y + 40);
            const nandNotANotB = spawnGate('NAND', [notA, notB], x + 80, y - 40);
            const nandAB = spawnGate('NAND', [ref1, ref2], x + 80, y + 40);
            return spawnGate('NAND', [nandNotANotB, nandAB], x + 160, y);
        };

        const cascade = (refs, spawnFunc2, x, startY) => {
            if (refs.length === 0) return null;
            if (refs.length === 1) return refs[0];
            let currentLayer = [...refs], offsetX = x;
            while (currentLayer.length > 1) {
                let nextLayer = [];
                for (let i = 0; i < currentLayer.length; i += 2) {
                    if (i + 1 < currentLayer.length) nextLayer.push(spawnFunc2(currentLayer[i], currentLayer[i + 1], offsetX, startY + i * 80));
                    else nextLayer.push(currentLayer[i]);
                }
                currentLayer = nextLayer; offsetX += 130;
            }
            return currentLayer[0];
        };

        // --- GLOBAL LOGIC DE-DUPLICATION STATE ---
        const globalInversionMap = new Map();
        const getInversion = (col) => {
            if (!globalInversionMap.has(col)) {
                const inRef = { id: inputs[col].id, port: 'out0' };
                globalInversionMap.set(col, spawnNOT(inRef, 200, inputs[col].y));
            }
            return globalInversionMap.get(col);
        };
        const globalProductMap = new Map();
        let globalProductCount = 0;

        // --- MULTI-OUTPUT MACRO OPTIMIZATION ---
        const combinedSig = outputsData.map(o => o.truthArray.join('').replace(/-1/g, '0')).join('_');
        let globalOrY = 100;

        // Full Adder Sub-expression Sharing
        if (numVars === 3 && outputsData.length === 2) {
            let sumIdx = -1, carryIdx = -1;
            if (combinedSig === '01101001_00010111') { sumIdx = 0; carryIdx = 1; }
            else if (combinedSig === '00010111_01101001') { sumIdx = 1; carryIdx = 0; }

            if (sumIdx !== -1) {
                console.log('[Synthesizer] Full Adder Macro Detected. Deploying shared-subexpression topology.');
                const A = { id: inputs[0].id, port: 'out0' };
                const B = { id: inputs[1].id, port: 'out0' };
                const Cin = { id: inputs[2].id, port: 'out0' };

                const xor1 = spawnXOR2_internal(A, B, 300, 100);
                const xor2 = spawnXOR2_internal(xor1, Cin, 500, 100);
                const and1 = spawnAND2(A, B, 300, 300);
                const and2 = spawnAND2(Cin, xor1, 500, 300);
                const carryOr = spawnOR2(and1, and2, 700, 300);

                const outSum = Sim._finalizeAddNode('OUT-1', 900, 100, outputsData[sumIdx].label);
                Sim.connectNodes(xor2.id, xor2.port, outSum.id, 'in0');

                const outCarry = Sim._finalizeAddNode('OUT-1', 900, 300, outputsData[carryIdx].label);
                Sim.connectNodes(carryOr.id, carryOr.port, outCarry.id, 'in0');

                Sim.seedQueue();
                Sim.processQueue();
                return; // Bypass standard per-output QM
            }
        }

        outputsData.forEach((outData, outIdx) => {
            // Signature Matching Optimization: Check if this entire output matches a known gate
            const currentSig = outData.truthArray.join('').replace(/-1/g, '0'); // Treat X as 0 for match
            const matchedGate = sigMap.get(currentSig);

            const isNative = ['NAND'].includes(matchedGate?.name);
            const inLibrary = !!Sim.library[matchedGate?.name];

            // Block instantiation if the matched signature belongs to the chip currently being built
            if (matchedGate && matchedGate.inputs === numVars && (isNative || inLibrary) && matchedGate.name !== targetChipName) {
                const gateRefs = inputs.map(n => ({ id: n.id, port: 'out0' }));
                const synthGate = spawnGate(matchedGate.name, gateRefs, 400, outIdx * 600 + 100);
                const outNode = Sim._finalizeAddNode('OUT-1', 900, outIdx * 600 + 100, outData.label);
                Sim.connectNodes(synthGate.id, synthGate.port, outNode.id, 'in0');
                return; // Found signature match; skip SOP trees for this output
            }

            // Single-Output MUX Macro Detection (3 variables)
            if (numVars === 3 && [
                '00110101', '01010011', '00001111', '11110000', '01100110', '10011001'
            ].includes(currentSig)) {
                console.log(`[Synthesizer] Output ${outData.label} identified as MUX logic. Deploying 4-NAND structure.`);

                // Wikipedia MUX: [ A NAND (S NAND S) ] NAND ( B NAND S )
                const S = { id: inputs[0].id, port: 'out0' };
                const A = { id: inputs[1].id, port: 'out0' };
                const B = { id: inputs[2].id, port: 'out0' };

                const notS = spawnNOT(S, 300, outIdx * 600 + 50);
                const n1 = spawnGate('NAND', [A, notS], 450, outIdx * 600 + 50);
                const n2 = spawnGate('NAND', [B, S], 450, outIdx * 600 + 150);
                const muxOut = spawnGate('NAND', [n1, n2], 600, outIdx * 600 + 100);

                const outNode = Sim._finalizeAddNode('OUT-1', 800, outIdx * 600 + 100, outData.label);
                Sim.connectNodes(muxOut.id, muxOut.port, outNode.id, 'in0');
                return;
            }

            // --- PARITY EXTRACTION OPTIMIZATION (XOR/XNOR TREES) ---
            const rows = 1 << numVars;
            const yBase = outIdx * 600;
            const truthTableArray = outData.truthArray;
            let isOddParity = true; let isEvenParity = true;
            for (let i = 0; i < rows; i++) {
                let ones = i.toString(2).split('').filter(c => c === '1').length;
                let expectedOdd = (ones % 2 === 1) ? 1 : 0;
                let expectedEven = (ones % 2 === 0) ? 1 : 0;
                if (truthTableArray[i] !== -1 && truthTableArray[i] !== expectedOdd) isOddParity = false;
                if (truthTableArray[i] !== -1 && truthTableArray[i] !== expectedEven) isEvenParity = false;
            }

            if ((isOddParity || isEvenParity) && numVars >= 2) {
                console.log(`[Synthesizer] Output ${outData.label} identified as ${isOddParity ? 'Odd' : 'Even'} Parity. Deploying XOR cascade.`);

                let inRefs = inputs.map(n => ({ id: n.id, port: 'out0' }));

                if (isEvenParity && inRefs.length >= 2) {
                    const last = inRefs.pop();
                    let xorTree = cascade(inRefs, spawnXOR2_internal, 250, yBase + 100);
                    let finalGate = spawnXNOR2_internal(xorTree, last, 800, yBase + 100);
                    const outNode = Sim._finalizeAddNode('OUT-1', 950, yBase + 100, outData.label);
                    Sim.connectNodes(finalGate.id, finalGate.port, outNode.id, 'in0');
                } else {
                    let xorOut = cascade(inRefs, spawnXOR2_internal, 250, yBase + 100);
                    const outNode = Sim._finalizeAddNode('OUT-1', 950, yBase + 100, outData.label);
                    Sim.connectNodes(xorOut.id, xorOut.port, outNode.id, 'in0');
                }
                return;
            }

            const minterms = truthTableArray.map((v, i) => v === 1 ? i : -1).filter(i => i !== -1);
            const dontCares = truthTableArray.map((v, i) => v === -1 ? i : -1).filter(i => i !== -1);
            const allImplicants = [...minterms, ...dontCares];

            if (minterms.length === 0) {
                Sim._finalizeAddNode('OUT-1', 500, 100 + (outIdx * 300), outData.label);
                return;
            }

            let primeImplicants = [];
            let currentColumn = [];

            // Initialize Column 0
            allImplicants.forEach(m => {
                let binary = m.toString(2).padStart(numVars, '0');
                let ones = (binary.match(/1/g) || []).length;
                currentColumn.push({ terms: [m], binary: binary, ones: ones, checked: false });
            });

            while (currentColumn.length > 0) {
                let nextColumn = [];
                let nextColumnMap = new Set();

                // Group current column by 'ones' count to optimize comparisons
                let groups = Array.from({ length: numVars + 1 }, () => []);
                currentColumn.forEach(imp => groups[imp.ones].push(imp));

                for (let i = 0; i < numVars; i++) {
                    for (let t1 of groups[i]) {
                        for (let t2 of groups[i + 1]) {
                            let diffs = 0;
                            let diffIdx = -1;
                            let canCombine = true;

                            for (let j = 0; j < numVars; j++) {
                                if (t1.binary[j] !== t2.binary[j]) {
                                    if (t1.binary[j] === '-' || t2.binary[j] === '-') { canCombine = false; break; }
                                    diffs++;
                                    diffIdx = j;
                                }
                            }

                            if (canCombine && diffs === 1) {
                                t1.checked = true;
                                t2.checked = true;
                                let newBinary = t1.binary.substring(0, diffIdx) + '-' + t1.binary.substring(diffIdx + 1);

                                if (!nextColumnMap.has(newBinary)) {
                                    nextColumnMap.add(newBinary);
                                    // Merge unique terms
                                    const mergedTerms = Array.from(new Set([...t1.terms, ...t2.terms]));
                                    nextColumn.push({ terms: mergedTerms, binary: newBinary, ones: t1.ones, checked: false });
                                }
                            }
                        }
                    }
                }

                // Any implicant that wasn't combined is a Prime Implicant
                currentColumn.forEach(imp => { if (!imp.checked) primeImplicants.push(imp); });
                currentColumn = nextColumn;
            }

            let essential = [];
            let remainingMinterms = new Set(minterms);
            for (let m of minterms) {
                let covers = primeImplicants.filter(p => p.terms.includes(m));
                if (covers.length === 1) {
                    essential.push(covers[0]);
                    covers[0].terms.forEach(t => remainingMinterms.delete(t));
                }
            }
            essential = [...new Set(essential)];
            let finalImplicants = [...essential];
            let remainingPrimes = primeImplicants.filter(p => !essential.includes(p));
            while (remainingMinterms.size > 0 && remainingPrimes.length > 0) {
                remainingPrimes.sort((a, b) => b.terms.filter(t => remainingMinterms.has(t)).length - a.terms.filter(t => remainingMinterms.has(t)).length);
                let best = remainingPrimes[0];
                if (best.terms.filter(t => remainingMinterms.has(t)).length === 0) break;
                finalImplicants.push(best);
                best.terms.forEach(t => remainingMinterms.delete(t));
                remainingPrimes.shift();
            }

            let layer2X = 400;
            let layer3X = layer2X + Math.max(1, Math.ceil(Math.log2(numVars))) * 130 + 50;
            const productOutputs = [];

            finalImplicants.forEach((imp) => {
                if (!globalProductMap.has(imp.binary)) {
                    const termInputs = [];
                    for (let col = 0; col < numVars; col++) {
                        if (imp.binary[col] === '1') termInputs.push({ id: inputs[col].id, port: 'out0' });
                        if (imp.binary[col] === '0') termInputs.push(getInversion(col));
                    }

                    let productOut = null;
                    if (termInputs.length === 0) {
                        // Tautology (Always 1): Bind to stable HIGH rail logic
                        const col0Ref = { id: inputs[0].id, port: 'out0' };
                        const col0Inv = getInversion(0);
                        productOut = spawnOR2(col0Ref, col0Inv, layer2X, 100 + (globalProductCount * 150));
                    } else {
                        productOut = cascade(termInputs, spawnAND2, layer2X, 100 + (globalProductCount * 150));
                    }

                    globalProductMap.set(imp.binary, productOut);
                    globalProductCount++;
                }
                const pOut = globalProductMap.get(imp.binary);
                if (pOut) productOutputs.push(pOut);
            });

            if (productOutputs.length > 0) {
                const finalOut = cascade(productOutputs, spawnOR2, layer3X, globalOrY);
                let orDepth = Math.max(1, Math.ceil(Math.log2(productOutputs.length)));
                const outNode = Sim._finalizeAddNode('OUT-1', layer3X + (orDepth * 130) + 50, globalOrY, outData.label);
                Sim.connectNodes(finalOut.id, finalOut.port, outNode.id, 'in0');
                globalOrY += Math.max(150, (productOutputs.length / 2) * 80 + 80);
            } else {
                // Tautology (Always 0): Output remains floating/zero
                Sim._finalizeAddNode('OUT-1', layer3X + 150, globalOrY, outData.label);
                globalOrY += 150;
            }
        });

        Sim.seedQueue();
        Sim.wakeQueue();
        // [AUDIT: v1.23.75 | SEC_ARCH_LEAD] - EXIT_TRACE: Logic synthesis finalized and simulation queue re-seeded.
    }
};

window.LogicSynthesizer = LogicSynthesizer;
