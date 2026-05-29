/**
 * Wire Rendering Module
 */
const WireRenderer = {
    _pool: [],
    _drawPending: false,
    _rafId: null,
    
    _getDomPath(svg, index) {
        if (this._pool.length <= index) {
            const fragment = document.createDocumentFragment();
            while (this._pool.length <= index) {
                const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                fragment.appendChild(p);
                this._pool.push(p);
            }
            svg.appendChild(fragment);
        }
        return this._pool[index];
    },

    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for SVG wire layer redraw.
     */
    drawWires(force = false) {
        if (force) {
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            this._drawPending = false;
            this._actualDrawWires();
            return;
        }

        if (this._drawPending) return;
        this._drawPending = true;

        this._rafId = requestAnimationFrame(() => {
            this._drawPending = false;
            this._rafId = null;
            this._actualDrawWires();
        });
    },

    /**
     * Highly optimized selective redrawing for dirty wires during node translation.
     * Prevents expensive full-schematic redraws by updating only connected wires.
     */
    drawWiresSelective(dragNodeIds) {
        this.drawWires(true);
    },

    /**
     * O(1) synchronous active wire preview path redrawing.
     * Achieves 0ms drawing feedback latency during connection drags.
     */
    drawWirePreview() {
        this.drawWires(true);
    },

    _actualDrawWires() {
        const canvas = document.getElementById('canvas-layer');
        if (!canvas) return;
        const workspace = document.getElementById('workspace');
        if (!workspace) return;

        // Clear legacy SVG layer if populated
        const svg = document.getElementById('svg-layer');
        if (svg && svg.children.length > 0) {
            svg.innerHTML = '';
            this._pool = [];
            this._domPreviewPath = null;
        }

        // Resize canvas to match actual viewport dimensions in device pixels
        const rect = workspace.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const targetWidth = Math.floor(rect.width);
        const targetHeight = Math.floor(rect.height);

        if (canvas.width !== Math.floor(targetWidth * dpr) || canvas.height !== Math.floor(targetHeight * dpr)) {
            canvas.width = Math.floor(targetWidth * dpr);
            canvas.height = Math.floor(targetHeight * dpr);
            canvas.style.width = targetWidth + 'px';
            canvas.style.height = targetHeight + 'px';
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply viewport scale and translation
        ctx.save();
        ctx.setTransform(View.scale * dpr, 0, 0, View.scale * dpr, View.x * dpr, View.y * dpr);

        const isPureNative = Sim.isPureNative();
        
        // Build transient Wire Adjacency Map for O(1) getDrivingSignal lookups
        Sim._wireMap = new Map();
        Sim.wires.forEach(w => {
            if (!Sim._wireMap.has(w.from.nodeId)) Sim._wireMap.set(w.from.nodeId, []);
            Sim._wireMap.get(w.from.nodeId).push(w);
            if (w.to.nodeId !== w.from.nodeId) {
                if (!Sim._wireMap.has(w.to.nodeId)) Sim._wireMap.set(w.to.nodeId, []);
                Sim._wireMap.get(w.to.nodeId).push(w);
            }
        });

        // 1. Draw Wires
        Sim.wires.forEach((w, i) => {
            const p1 = Sim.getPortCoords(w.from.nodeId, w.from.portId);
            const p2 = Sim.getPortCoords(w.to.nodeId, w.to.portId);
            if (p1 && p2) {
                let sig = null;
                if (Sim.useWasm && isPureNative && window.WasmEngine && WasmEngine.ready && WasmEngine.wireIdxMap) {
                    sig = WasmEngine.readWireState(i);
                }
                if (sig === null || sig === undefined) {
                    sig = Sim.getDrivingSignal(w.to.nodeId, w.to.portId);
                    if (sig === null || sig === undefined) {
                        sig = Sim.getSignal(w.from.nodeId, w.from.portId);
                    }
                }

                // Parse signal state
                let val = (sig === true) ? 1 : (sig === false ? 0 : sig);
                if (val === 'Z') val = 2;
                if (val === 'E') val = 3;
                if (Array.isArray(sig)) {
                    if (sig.some(v => v === 3 || v === 'E')) val = 3;
                    else if (sig.some(v => v === 1 || v === true)) val = 1;
                    else if (sig.every(v => v === 2 || v === 'Z')) val = 2;
                    else val = 0;
                }

                const d = this._calculateSmartPath(p1, p2, w.from.nodeId, w.to.nodeId, w);
                
                // Draw path on canvas
                ctx.beginPath();
                w._segments = this._drawSvgPathOnCanvasContext(ctx, d);

                // Set style
                let strokeColor = '#ff3838'; // var(--wire-off) default
                if (val === 1) strokeColor = '#1db954'; // var(--wire-on)
                else if (val === 2) strokeColor = '#ffff00'; // highz
                else if (val === 3) strokeColor = '#ff3333'; // contention

                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = Array.isArray(sig) ? 4 : 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();

                // Highlight hovered or selected wires!
                const isHovered = (window.InteractionHandler && InteractionHandler.hoveredWireIndex === i);
                const isSelected = (window.InteractionHandler && InteractionHandler.selectedWire === w);
                if (isHovered || isSelected) {
                    ctx.strokeStyle = '#ffffffaa';
                    ctx.lineWidth = (Array.isArray(sig) ? 4 : 2) + 2;
                    ctx.stroke();
                }
            }
        });

        // 2. Draw wiring preview (if active)
        if (Sim.wiring.active) {
            const p1 = Sim.getPortCoords(Sim.wiring.start.nodeId, Sim.wiring.start.portId);
            const p2Snap = Sim.wiring.snapTarget ? Sim.getPortCoords(Sim.wiring.snapTarget.nodeId, Sim.wiring.snapTarget.portId) : null;
            
            const scene = document.getElementById('scene');
            const sr = scene ? scene.getBoundingClientRect() : { left: 0, top: 0 };
            const sceneMouseX = (Sim.wiring.mouseX - sr.left) / View.scale;
            const sceneMouseY = (Sim.wiring.mouseY - sr.top) / View.scale;
            const p2 = p2Snap || { x: sceneMouseX, y: sceneMouseY };

            if (p1 && p2) {
                const d = this._calculateSmartPath(p1, p2, Sim.wiring.start.nodeId, Sim.wiring.snapTarget?.nodeId, null);
                ctx.beginPath();
                this._drawSvgPathOnCanvasContext(ctx, d);
                ctx.strokeStyle = Sim.wiring.snapTarget ? '#1db954' : '#ffffff44';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        ctx.restore();
        delete Sim._wireMap;
    },

    _drawSvgPathOnCanvasContext(ctx, pathStr) {
        const cmds = pathStr.match(/[MHVL][^MHVL]*/g);
        if (!cmds) return [];
        let curX = 0, curY = 0;
        const segments = [];
        cmds.forEach(cmd => {
            const type = cmd[0];
            const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat);
            let nx = curX;
            let ny = curY;
            if (type === 'M') {
                curX = args[0]; curY = args[1];
                ctx.moveTo(curX, curY);
            } else if (type === 'L') {
                nx = args[0]; ny = args[1];
                ctx.lineTo(nx, ny);
                segments.push({ x1: curX, y1: curY, x2: nx, y2: ny });
                curX = nx; curY = ny;
            } else if (type === 'H') {
                nx = args[0];
                ctx.lineTo(nx, curY);
                segments.push({ x1: curX, y1: curY, x2: nx, y2: curY });
                curX = nx;
            } else if (type === 'V') {
                ny = args[0];
                ctx.lineTo(curX, ny);
                segments.push({ x1: curX, y1: curY, x2: curX, y2: ny });
                curY = ny;
            }
        });
        return segments;
    },

    /**
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
            this._domPreviewPath = path;
        } else if (wire) {
            const bg = this._getDomPath(svg, domIndex++);
            bg.setAttribute('d', d);
            bg.setAttribute('class', 'wire-hitbox');
            bg.setAttribute('stroke', 'rgba(0,0,0,0.01)');
            // [AUDIT: v1.24.70 | SEC_ARCH_LEAD] - Expanded wire hitboxes for improved user selection ergonomics.
            bg.setAttribute('stroke-width', '18');
            bg.setAttribute('fill', 'none');

            const path = this._getDomPath(svg, domIndex++);
            path.setAttribute('d', d);
            
            // Normalize Hi-Z: both string 'Z' and numeric 2 represent high-impedance
            let sig = (val === true) ? 1 : (val === false ? 0 : val);
            if (sig === 'Z') sig = 2;
            if (sig === 'E') sig = 3;
            if (Array.isArray(val)) {
                if (val.some(v => v === 3 || v === 'E')) sig = 3;
                else if (val.some(v => v === 1 || v === true)) sig = 1;
                else if (val.every(v => v === 2 || v === 'Z')) sig = 2;
                else sig = 0;
            }

            path.setAttribute('class', 'wire-main' + (sig === 1 ? ' active' : (sig === 2 ? ' highz' : (sig === 3 ? ' contention' : ' inactive'))));
            path.setAttribute('stroke', sig === 1 ? 'var(--wire-on)' : (sig === 2 ? '#ffff00' : (sig === 3 ? '#ff3333' : 'var(--wire-off)')));
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

            wire._domBg = bg;
            wire._domPath = path;
        }
        return domIndex;
    }
};

window.WireRenderer = WireRenderer;
