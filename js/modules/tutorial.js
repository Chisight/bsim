const TutorialEngine = {
    active: null, step: 0,
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial panel draggable initialization.
     * @IO: UI_INTERACTION
     * @ARCH: UI_UX_HELPER
     * @INTENT: Enable manual dragging for the tutorial panel via mouse events.
     */
    makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const dragMouseDown = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            if (el.style.transform.includes('translateX')) {
                const rect = el.getBoundingClientRect();
                el.style.transform = 'none';
                el.style.left = rect.left + 'px';
                el.style.top = rect.top + 'px';
                el.style.bottom = 'auto';
            }
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };
        const elementDrag = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            el.style.top = (el.offsetTop - pos2) + "px";
            el.style.left = (el.offsetLeft - pos1) + "px";
        };
        const closeDragElement = () => {
            document.onmouseup = null; document.onmousemove = null;
        };
        if (header) { header.onmousedown = dragMouseDown; }
        else { el.onmousedown = dragMouseDown; }
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial panel made draggable.
    },
    tutorials: {
        'SR_LATCH': {
            title: 'Build an SR Latch (1-Bit Memory)',
            steps: [
                { text: 'Memory requires a feedback loop. Start by placing two <strong>NAND</strong> gates on the board.', check: () => Sim.nodes.filter(n => n.type === 'NAND').length >= 2 },
                { text: 'Place two <strong>IN-1</strong> nodes (Set and Reset) and two <strong>OUT-1</strong> nodes (Q and Not-Q).', check: () => Sim.nodes.filter(n => n.type === 'IN-1').length >= 2 && Sim.nodes.filter(n => n.type === 'OUT-1').length >= 2 },
                { text: 'Cross-couple them! Connect the output of NAND 1 to an input of NAND 2. Then, connect the output of NAND 2 to an input of NAND 1.', check: () => Sim.wires.length >= 2 && Sim.wires.some(w => w.from.nodeId !== w.to.nodeId) },
                { text: 'Wire your IN-1 nodes to the remaining NAND inputs, and route the NAND outputs to your OUT-1 nodes.', check: () => Sim.wires.length >= 6 },
                { text: 'Excellent! Now click <strong>Save Chip</strong> in the top menu and name it <strong>SR_LATCH</strong>.', check: () => Sim.library['SR_LATCH'] !== undefined }
            ]
        },
        'HALF_ADDER': {
            title: 'Build a Half Adder (1-Bit Addition)',
            steps: [
                { text: 'A Half Adder needs two inputs (A, B) and two outputs (Sum, Carry). Place them now.', check: () => Sim.nodes.filter(n => n.type === 'IN-1').length >= 2 && Sim.nodes.filter(n => n.type === 'OUT-1').length >= 2 },
                { text: 'Synthesize or place an <strong>XOR</strong> logic (or build it from NANDs) for the Sum. Place an <strong>AND</strong> gate for the Carry.', check: () => Sim.nodes.length >= 6 },
                { text: 'Connect both inputs to both gates. Route the XOR output to "Sum" and the AND output to "Carry".', check: () => Sim.wires.length >= 6 },
                { text: 'Test it: 1+1 should result in Sum=0, Carry=1. Then save as <strong>HALF_ADDER</strong>.', check: () => Sim.library['HALF_ADDER'] !== undefined }
            ]
        },
        'FULL_ADDER': {
            title: 'Build a Full Adder (With Carry-In)',
            steps: [
                { text: 'A Full Adder combines two Half Adders. Place two <strong>HALF_ADDER</strong> chips from your library.', check: () => Sim.nodes.filter(n => n.type === 'HALF_ADDER').length >= 2 },
                { text: 'Place three <strong>IN-1</strong> nodes (A, B, Cin) and two <strong>OUT-1</strong> nodes (Sum, Cout).', check: () => Sim.nodes.filter(n => n.type === 'IN-1').length >= 3 && Sim.nodes.filter(n => n.type === 'OUT-1').length >= 2 },
                { text: 'Connect A and B to the first Half Adder. Connect its Sum and Cin to the second Half Adder.', check: () => Sim.wires.length >= 4 },
                { text: 'Use an <strong>OR</strong> gate to combine the Carry outputs from both Half Adders into the final Cout.', check: () => Sim.nodes.some(n => n.type === 'OR') && Sim.wires.length >= 7 },
                { text: 'Save this completed circuit as <strong>FULL_ADDER</strong>.', check: () => Sim.library['FULL_ADDER'] !== undefined }
            ]
        },
        'MUX_2_1': {
            title: 'Build a 2-to-1 Multiplexer (Data Selector)',
            steps: [
                { text: 'Place three <strong>IN-1</strong> nodes: Input A, Input B, and a Select line.', check: () => Sim.nodes.filter(n => n.type === 'IN-1').length >= 3 },
                { text: 'Place one <strong>NOT</strong>, two <strong>AND</strong>, and one <strong>OR</strong> gate.', check: () => Sim.nodes.filter(n => ['NOT', 'AND', 'OR'].includes(n.type)).length >= 3 },
                { text: 'Wire the Select line to the NOT gate. Use the AND gates to gate Input A (with Select) and Input B (with NOT Select).', check: () => Sim.wires.length >= 5 },
                { text: 'Combine the AND outputs with the OR gate to the <strong>OUT-1</strong> node.', check: () => Sim.wires.length >= 8 },
                { text: 'Verify that the Select line switches which input reaches the output. Save as <strong>MUX_2_1</strong>.', check: () => Sim.library['MUX_2_1'] !== undefined }
            ]
        },
        'D_LATCH': {
            title: 'Build a Gated D-Latch',
            steps: [
                { text: 'Place an <strong>SR_LATCH</strong> from your library.', check: () => Sim.nodes.some(n => n.type === 'SR_LATCH') },
                { text: 'Place two <strong>IN-1</strong> nodes: Data (D) and Enable (E).', check: () => Sim.nodes.filter(n => n.type === 'IN-1').length >= 2 },
                { text: 'Use a <strong>NOT</strong> and two <strong>AND</strong> gates to ensure S and R only trigger when Enable is HIGH.', check: () => Sim.nodes.filter(n => ['NOT', 'AND'].includes(n.type)).length >= 3 },
                { text: 'Connect D to the first AND, and NOT D to the second AND. Wire Enable to both.', check: () => Sim.wires.length >= 6 },
                { text: 'Save this as <strong>D_LATCH</strong>. This is the foundation of 1-bit registers.', check: () => Sim.library['D_LATCH'] !== undefined }
            ]
        },
        'COUNTER_4': {
            title: 'Build a 4-Bit Ripple Counter',
            steps: [
                { text: 'Counters use T-Flip Flops. If you have a D-Flip Flop, wire NOT Q back to D to create a T-Type. Place 4 of them.', check: () => Sim.nodes.length >= 4 },
                { text: 'Place a <strong>CLOCK</strong> node and a <strong>PROBE-4</strong> hex display.', check: () => Sim.nodes.some(n => n.type === 'CLOCK') && Sim.nodes.some(n => n.type === 'PROBE-4') },
                { text: 'Wire the Clock to the first FF. Wire each Q output to the clock input of the next FF (this is the "ripple").', check: () => Sim.wires.length >= 4 },
                { text: 'Connect all 4 Q outputs to the PROBE-4 display.', check: () => Sim.wires.length >= 8 },
                { text: 'Watch the hex display count from 0 to F. Save this assembly as <strong>COUNTER_4</strong>.', check: () => Sim.library['COUNTER_4'] !== undefined }
            ]
        }
    },
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial menu display.
     * @IO: UI_MODAL
     * @ARCH: TUTORIAL_DISPATCHER
     * @INTENT: Display the tutorial selection menu to the user.
     */
    showMenu() {
        if (!Sim.tutorialMode) { Sim.toast('Enable Tutorial Mode in Preferences first.'); return; }
        let html = '<div style="margin-bottom:15px; color:#aaa; font-size:13px;">Select a module to begin guided construction:</div>';
        Object.keys(this.tutorials).forEach(key => {
            html += `<button class="ui-btn secondary" style="width:100%; margin-bottom:10px; border:1px solid var(--border);" onclick="TutorialEngine.start('${key}')">${this.tutorials[key].title}</button>`;
        });
        Sim.modal('Interactive Instructor', html, 'alert');
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial selection menu displayed.
    },
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial session start.
     * @STATE: TUTORIAL_SESSION
     * @INTENT: Initialize a specific tutorial session and reset the progress counter.
     */
    start(id) {
        this.active = id; this.step = 0;
        document.getElementById('ui-overlay').style.display = 'none';
        this.render();
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial session '${id}' initialized.
    },
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial session termination.
     * @STATE: TUTORIAL_SESSION
     * @INTENT: Terminate the active tutorial session and hide the panel.
     */
    quit() {
        this.active = null;
        const panel = document.getElementById('tutorial-panel');
        if (panel) panel.style.display = 'none';
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial session terminated and panel hidden.
    },
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial panel rendering.
     * @IO: UI_RENDERING
     * @INTENT: Redraw the tutorial panel content based on the current step and completion state.
     */
    render() {
        const panel = document.getElementById('tutorial-panel');
        if (!this.active || !panel) return;
        const tut = this.tutorials[this.active];
        if (this.step >= tut.steps.length) {
            panel.innerHTML = `<div style="color:var(--wire-on); font-weight:bold; font-size:16px; margin-bottom:8px;">Module Complete!</div><div style="color:#aaa; font-size:12px; margin-bottom:15px;">You have successfully added this component to your library.</div><button class="ui-btn primary" onclick="TutorialEngine.quit()">Finish</button>`;
            // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial completion view rendered.
            return;
        }
        const cur = tut.steps[this.step];
        panel.style.display = 'block';
        panel.innerHTML = `
            <div id="tut-drag-handle" style="cursor:grab; padding:8px; margin:-15px -25px 15px -25px; background:rgba(0,0,0,0.4); border-bottom:1px solid var(--border); border-radius:8px 8px 0 0; color:var(--accent); font-weight:900; font-size:11px; text-transform:uppercase; letter-spacing:1px; display:flex; justify-content:space-between; align-items:center;">
                <span style="opacity:0.5; font-size:16px;">≡</span>
                <span>Instructor: ${tut.title} &nbsp;|&nbsp; Step ${this.step + 1}/${tut.steps.length}</span>
                <span style="opacity:0.5; font-size:16px;">≡</span>
            </div>
            <div style="margin-bottom:15px; font-size:14px; line-height:1.5; color:#eee;">${cur.text}</div>
            <div style="display:flex; justify-content:center; gap:10px;">
                <button class="ui-btn secondary" style="padding:6px 12px; font-size:11px;" onclick="TutorialEngine.quit()">Quit</button>
                <button class="ui-btn primary" style="padding:6px 12px; font-size:11px; background:#334; color:#fff;" onclick="TutorialEngine.step++; TutorialEngine.render();" title="The tutorial will automatically advance when you complete the task.">Skip (Auto-Progress Active)</button>
            </div>
        `;
        this.makeDraggable(panel);
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial step ${this.step + 1} rendered.
    },
    /**
     * [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - Entry trace for tutorial progress validation.
     * @ARCH: TUTORIAL_VALIDATOR
     * @CONSTRAINT: STEP_VALIDATION
     * @INTENT: Evaluate the current workspace state against the active tutorial step requirements.
     */
    checkProgress() {
        if (!this.active) return;
        const tut = this.tutorials[this.active];
        if (this.step < tut.steps.length) {
            if (tut.steps[this.step].check()) {
                this.step++;
                this.render();
                Sim.toast('Step Complete!');
            }
        }
        // [AUDIT: v1.23.66 | SEC_ARCH_LEAD] - EXIT_TRACE: Tutorial progress check finalized.
    }
};

window.TutorialEngine = TutorialEngine;
