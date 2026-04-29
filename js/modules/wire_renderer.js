/**
 * Wire Rendering Module
 */
const WireRenderer = {
    _pool: [],
    
    _getDomPath(svg, index) {
        while (this._pool.length <= index) {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            svg.appendChild(p);
            this._pool.push(p);
        }
        return this._pool[index];
    },

    /**
     * [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - Entry trace for SVG wire layer redraw.
     * @ARCH: UI_RENDERING
     * @IO: SVG_LAYER_MUTATION
     * @INTENT: Main entry point for redrawing the entire SVG wire layer based on current netlist connectivity and signal states.
     */
    drawWires() {
        const svg = document.getElementById('svg-layer');
        if (!svg) {
            // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: Wire redraw aborted, SVG layer missing.
            return;
        }
        
        // Clear crossing masks from previous render
        const oldMasks = svg.querySelectorAll('.wire-mask');
        oldMasks.forEach(m => m.remove());

        if (this._pool.length === 0 || svg.children.length === 0) {
            this._pool = Array.from(svg.children);
        }

        let domIndex = 0;

        Sim.wires.forEach((w, i) => {
            const p1 = Sim.getPortCoords(w.from.nodeId, w.from.portId);
            const p2 = Sim.getPortCoords(w.to.nodeId, w.to.portId);
            if (p1 && p2) {
                let sig = null;
                const validWasmTypes = new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE']);
                const checkPure = (nodes, visited = new Set()) => {
                    if (visited.has(nodes)) return true; // Cycle detected, assume pure to break loop
                    visited.add(nodes);
                    return nodes.every(n => {
                        if (validWasmTypes.has(n.type)) return true;
                        if (n.isCustom && Sim.library && Sim.library[n.type]) return checkPure(Sim.library[n.type].nodes, visited);
                        return false;
                    });
                };
                const isPureNative = checkPure(Sim.nodes);

                if (Sim.useWasm && isPureNative && window.WasmEngine && WasmEngine.ready && WasmEngine.wireIdxMap) {
                    sig = WasmEngine.readWireState(i);
                }
                if (sig === null || sig === undefined) {
                    sig = Sim.getDrivingSignal(w.to.nodeId, w.to.portId);
                    if (sig === null || sig === undefined) {
                        sig = Sim.getSignal(w.from.nodeId, w.from.portId);
                    }
                }
                domIndex = this._drawOrtho(svg, p1, p2, false, sig, i, domIndex);
            }
        });

        if (Sim.wiring.active) {
            const p1 = Sim.getPortCoords(Sim.wiring.start.nodeId, Sim.wiring.start.portId);
            const p2Snap = Sim.wiring.snapTarget ? Sim.getPortCoords(Sim.wiring.snapTarget.nodeId, Sim.wiring.snapTarget.portId) : null;
            const scene = document.getElementById('scene');
            const sr = scene ? scene.getBoundingClientRect() : { left: 0, top: 0 };
            const sceneMouseX = (Sim.wiring.mouseX - sr.left) / View.scale;
            const sceneMouseY = (Sim.wiring.mouseY - sr.top) / View.scale;
            const p2 = p2Snap || { x: sceneMouseX, y: sceneMouseY };
            
            if (p1 && p2) {
                domIndex = this._drawOrtho(svg, p1, p2, true, null, -1, domIndex);
            }
        }

        for (let i = domIndex; i < this._pool.length; i++) {
            this._pool[i].setAttribute('d', '');
            this._pool[i].removeAttribute('data-wire-index');
            this._pool[i].style.pointerEvents = 'none';
            this._pool[i].onmousedown = null;
        }

        this._renderCrossingMasks(svg);
        // [AUDIT: v1.23.74 | SEC_ARCH_LEAD] - EXIT_TRACE: SVG wire layer update complete. Rendered ${Sim.wires.length} wires.
    },

    /**
     * @ARCH: RENDERING_POST_PROCESS
     * @CONSTRAINT: GEOMETRIC_INTERSECTION
     * @INTENT: Mathematically identify wire crossings and inject visual masks (jumps) to prevent ambiguity.
     */
    _renderCrossingMasks(svg) {
        svg.querySelectorAll('.wire-mask').forEach(m => m.remove());
        const segments = [];
        const paths = svg.querySelectorAll('.wire-main');
        
        // 1. Mathematically parse all active SVG path strings into standard 2D lines
        paths.forEach(path => {
            const d = path.getAttribute('d');
            if (!d) return;
            const cmds = d.match(/[MHVL][^MHVL]*/g);
            if (!cmds) return;
            
            let curX = 0, curY = 0;
            cmds.forEach(cmd => {
                const type = cmd[0];
                const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat);
                let nx = curX, ny = curY;
                
                if (type === 'M' || type === 'L') { nx = args[0]; ny = args[1]; }
                else if (type === 'H') { nx = args[0]; }
                else if (type === 'V') { ny = args[0]; }
                
                if (type !== 'M') segments.push({ x1: curX, y1: curY, x2: nx, y2: ny });
                curX = nx; curY = ny;
            });
        });

        const crosses = [];
        
        // 2. Cross-reference segments for perpendicular intersections, ignoring endpoint T-junctions
        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const s1 = segments[i], s2 = segments[j];
                const s1H = s1.y1 === s1.y2, s2V = s2.x1 === s2.x2;
                const s1V = s1.x1 === s1.x2, s2H = s2.y1 === s2.y2;

                let ix, iy, inX, inY;
                if (s1H && s2V) {
                    ix = s2.x1; iy = s1.y1;
                    inX = ix > Math.min(s1.x1, s1.x2) + 1 && ix < Math.max(s1.x1, s1.x2) - 1;
                    inY = iy > Math.min(s2.y1, s2.y2) + 1 && iy < Math.max(s2.y1, s2.y2) - 1;
                    if (inX && inY) crosses.push({ x: ix, y: iy });
                } else if (s1V && s2H) {
                    ix = s1.x1; iy = s2.y1;
                    inX = ix > Math.min(s2.x1, s2.x2) + 1 && ix < Math.max(s2.x1, s2.x2) - 1;
                    inY = iy > Math.min(s1.y1, s1.y2) + 1 && iy < Math.max(s1.y1, s1.y2) - 1;
                    if (inX && inY) crosses.push({ x: ix, y: iy });
                }
            }
        }

        // 3. Draw masks directly into the DOM
        crosses.forEach(c => {
            const mask = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            mask.setAttribute('d', `M ${c.x - 6} ${c.y} L ${c.x + 6} ${c.y}`);
            mask.setAttribute('class', 'wire-mask');
            svg.appendChild(mask);
        });
    },


    /**
     * @ARCH: ROUTING_ALGORITHM
     * @CONSTRAINT: MANHATTAN_STEER
     * @INTENT: Calculate the optimal orthogonal path (Manhattan routing) for a wire based on port orientations and custom midpoints.
     */
    _calculateSmartPath(p1, p2, startNodeId, endNodeId, wire = null) {
        const L = 25; 
        const junc1 = wire?.from?.portId === 'j' || (!wire && Sim.wiring.start?.portId === 'j');
        const junc2 = wire?.to?.portId === 'j' || (!wire && Sim.wiring.snapTarget?.portId === 'j');

        let isOut1 = true; let isOut2 = false;

        if (!wire && Sim.wiring.start) {
            isOut1 = Sim.wiring.start.isOutput;
            isOut2 = Sim.wiring.snapTarget ? Sim.wiring.snapTarget.el.classList.contains('output') : false;
        } else if (wire) {
            if (typeof wire.from.isOutput === 'boolean') isOut1 = wire.from.isOutput;
            else {
                const p1El = document.getElementById(startNodeId)?.querySelector(`[data-port="${wire.from.portId}"]`);
                if (p1El) isOut1 = p1El.classList.contains('output');
            }
            if (typeof wire.to.isOutput === 'boolean') isOut2 = wire.to.isOutput;
            else {
                const p2El = document.getElementById(endNodeId)?.querySelector(`[data-port="${wire.to.portId}"]`);
                if (p2El) isOut2 = p2El.classList.contains('output');
            }
        }

        const dir1 = junc1 ? (p2.x > p1.x ? 1 : -1) : (isOut1 ? 1 : -1);
        const dir2 = junc2 ? (p1.x > p2.x ? 1 : -1) : (isOut2 ? 1 : -1);

        const startX = p1.x + (junc1 ? 0 : dir1 * L);
        const endX = p2.x + (junc2 ? 0 : dir2 * L);

        let d = `M ${p1.x} ${p1.y} `;
        if (!junc1) d += `H ${startX} `;

        // 1. User Custom Midpoint Routing (Highest Priority)
        if (wire && (typeof wire.midX === 'number' || typeof wire.midY === 'number')) {
            const ortho = wire.orthoDir || 'H';
            if (ortho === 'H') {
                const mx = typeof wire.midX === 'number' ? wire.midX : startX + (endX - startX)/2;
                d += `H ${mx} V ${p2.y} `;
            } else {
                const my = typeof wire.midY === 'number' ? wire.midY : p1.y + (p2.y - p1.y)/2;
                d += `V ${my} H ${endX} V ${p2.y} `;
            }
        } 
        // 2. Junction Default Behavior
        else if (junc1 || junc2) {
            const midX = startX + (endX - startX) / 2;
            d += `H ${midX} V ${p2.y} `;
        } 
        // 3. Auto Smart Routing
        else {
            if (dir1 !== dir2) {
                // Opposite facing ports (Out -> In)
                // 30px threshold triggers S-Curve even for near-vertically-aligned chips
                const isBackwards = (dir1 === 1 && startX > endX - 30) || (dir1 === -1 && startX < endX + 30);
                if (!isBackwards) {
                    // Forward Z-Curve
                    const midX = startX + (endX - startX) / 2;
                    d += `H ${midX} V ${p2.y} `;
                } else {
                    // Backwards S-Curve Wrap (Cyan Line Logic)
                    const wrapX = startX;
                    const wrapY = p1.y + (p2.y - p1.y) / 2;
                    d += `H ${wrapX} V ${wrapY} H ${endX} V ${p2.y} `;
                }
            } else {
                // Same facing ports (Out -> Out, or In -> In)
                const extX = (dir1 === 1) ? Math.max(startX, endX) + 30 : Math.min(startX, endX) - 30;
                d += `H ${extX} V ${p2.y} `;
            }
        }
        
        d += junc2 ? `H ${p2.x}` : `H ${endX} H ${p2.x}`;
        return d;
    },

    /**
     * @IO: SVG_DOM_FACTORY
     * @INTENT: Low-level drawing function to synchronize a specific wire's state with its SVG path element.
     */
    _drawOrtho(svg, p1, p2, isPreview, val, wireIndex, domIndex) {
        const wire = (wireIndex !== -1) ? Sim.wires[wireIndex] : null;
        
        const d = this._calculateSmartPath(p1, p2, wire?.from?.nodeId, wire?.to?.nodeId, wire);


        if (isPreview) {
            const path = this._getDomPath(svg, domIndex++);
            path.setAttribute('d', d);
            path.setAttribute('class', 'wire-preview');
            path.setAttribute('stroke', Sim.wiring.snapTarget ? 'var(--wire-on)' : '#ffffff44');
            path.setAttribute('stroke-dasharray', '4,4');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('pointer-events', 'none');
        } else if (wire) {
            const bg = this._getDomPath(svg, domIndex++);
            bg.setAttribute('d', d);
            bg.setAttribute('class', 'wire-hitbox');
            bg.setAttribute('stroke', 'rgba(0,0,0,0.01)');
            bg.setAttribute('stroke-width', '16');
            bg.setAttribute('fill', 'none');

            const path = this._getDomPath(svg, domIndex++);
            path.setAttribute('d', d);
            
            let sig = (val === true) ? 1 : (val === false ? 0 : val);
            if (Array.isArray(val)) {
                if (val.some(v => v === 1 || v === true)) sig = 1;
                else if (val.every(v => v === 2)) sig = 2;
                else sig = 0;
            }

            path.setAttribute('class', 'wire-main' + (sig === 1 ? ' active' : (sig === 2 ? ' highz' : ' inactive')));
            path.setAttribute('stroke', sig === 1 ? 'var(--wire-on)' : (sig === 2 ? '#ffff00' : 'var(--wire-off)'));
            path.setAttribute('stroke-width', Array.isArray(val) ? '4' : '2');
            path.setAttribute('fill', 'none');

            const applyEvents = (el) => {
                el.setAttribute('data-wire-index', wireIndex);
                el.setAttribute('pointer-events', 'stroke');
                el.style.pointerEvents = 'stroke';
                el.style.cursor = 'move';
                el.onmousedown = null; // Clear old closures to prevent memory leaks
            };

            applyEvents(bg);
            applyEvents(path);
        }
        return domIndex;
    }
};

window.WireRenderer = WireRenderer;
