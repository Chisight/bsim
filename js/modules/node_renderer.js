/**
 * Node Rendering Module
 * Handles drawing of gates, ports, and visual labels.
 */
const NodeRenderer = {
    /**
     * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for node DOM instantiation.
     */
    renderNode(node, container = null) {
        delete node._portOffsets;
        const div = document.createElement('div');
        div.id = node.id; 
        div.className = node.type === 'JUNCTION' ? 'gate junction' : 'gate';
        if (node.type === 'CLOCK') div.classList.add('clock');
        if (node.type === 'NAND') div.classList.add('nand');
        if (node.isCustom) div.classList.add('custom');
        else div.classList.add('native');
        if (node.type.startsWith('IN-')) div.classList.add('in');
        if (node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) div.classList.add('out');
        if (node.type.startsWith('PROBE-')) div.classList.add('probe-hex');
        
        const bits = parseInt(node.type.split('-')[1]) || 1;
        // [AUDIT: v1.25.14 | SEC_ARCH_LEAD] - Refined IN-8 UI spatial defaults for alignment consistency.
        if (node.type === 'IN-8') {
            div.style.width = '100px';
            div.style.minWidth = '100px';
            div.style.height = '150px';
            div.style.minHeight = '150px';
        } else if (bits >= 4) {
            div.style.height = (bits * 18 + 25) + 'px';
            div.style.minHeight = (bits * 18 + 25) + 'px';
            div.style.width = '90px';
            div.style.minWidth = '90px';
        }
        
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Inject parametric spatial overrides for custom macro layouts.
        if (node.customWidth) { div.style.width = node.customWidth + 'px'; div.style.minWidth = node.customWidth + 'px'; }
        if (node.customHeight) { div.style.height = node.customHeight + 'px'; div.style.minHeight = node.customHeight + 'px'; }
        
        Sim.updateNodePosition(node, div);
        let portsHtml = '';

        // [AUDIT: SEC_ARCH_LEAD] - Isolate bit-dot indicators into bounded containers for layout encapsulation.
        if (node.type.startsWith('IN-')) {
            let dotsHtml = '';
            for (let i = 0; i < bits; i++) {
                const flip = window.Sim && window.Sim.flipPinLogic;
                const bIdx = (bits > 1 && flip) ? (bits - 1 - i) : i; // TOP is LSB, BOTTOM is MSB
                const vIdx = node.flipPolarity ? (bits - 1 - i) : i;
                const topStyle = bits === 1 ? "top:50%" : `top:calc(24px + ${((vIdx + 0.5) / bits)} * (100% - 30px))`;
                // [AUDIT: v1.24.28 | SEC_ARCH_LEAD] - Adjusted pin layout percentage calculation to prevent header collision.
                const labelText = (bits > 1) ? bIdx : '';
                portsHtml += `<div class="port output" data-port="out${bIdx}" style="${topStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out${bIdx}')">
                    <div class="port-meta"><span class="port-label">${labelText}</span></div>
                </div>`;
                const dot = `<div class="bit-dot" data-bit="${bIdx}" onclick="event.stopPropagation(); Sim.toggleBit(event, '${node.id}', ${bIdx})"></div>`;
                if (node.flipPolarity) dotsHtml = dot + dotsHtml; else dotsHtml += dot;
            }
            portsHtml += `<div class="pin-container in">${dotsHtml}</div>`;
        } else if (node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
            let dotsHtml = '';
            for (let i = 0; i < bits; i++) {
                const flip = window.Sim && window.Sim.flipPinLogic;
                const bIdx = (bits > 1 && flip) ? (bits - 1 - i) : i; // TOP is LSB, BOTTOM is MSB
                const vIdx = node.flipPolarity ? (bits - 1 - i) : i;
                const topStyle = bits === 1 ? "top:50%" : `top:calc(24px + ${((vIdx + 0.5) / bits)} * (100% - 30px))`;
                // [AUDIT: v1.24.28 | SEC_ARCH_LEAD] - Adjusted pin layout percentage calculation to prevent header collision.
                const labelText = (bits > 1) ? bIdx : '';
                portsHtml += `<div class="port input" data-port="in${bIdx}" style="${topStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'in${bIdx}')">
                    <div class="port-meta"><span class="port-label">${labelText}</span></div>
                </div>`;
                const dot = `<div class="bit-dot" data-bit="${bIdx}"></div>`;
                if (node.flipPolarity) dotsHtml = dot + dotsHtml; else dotsHtml += dot;
            }
            portsHtml += `<div class="pin-container out">${dotsHtml}</div>`;
        }
 else {
            if (node.type === 'JUNCTION') portsHtml = `<div class="port input output" data-port="j" style="top:50%;left:50%;transform:translate(-50%,-50%)" onmousedown="if(!Sim.wiring.active && !event.shiftKey) return; event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'j')"></div>`;
            else if (node.type === '0') {
                portsHtml = `
                    <div class="port output" data-port="out0" style="top:50%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out0')">
                        <span class="port-label">0</span>
                    </div>`;
            }
            else if (node.type === 'CLOCK') {
                portsHtml = `
                    <div class="port output" data-port="out0" style="top:50%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out0')">
                        <span class="port-label">CLK</span>
                    </div>
                    <div class="clock-indicator-wrap" style="position:absolute; top:4px; right:4px; width:12px; height:12px;">
                        <svg viewBox="0 0 12 12" style="width:100%; height:100%;">
                            <circle cx="6" cy="6" r="5" fill="none" stroke="#00FF00" stroke-width="1"/>
                            <line class="indicator-arm" x1="6" y1="6" x2="6" y2="2" stroke="#00FF00" stroke-width="1.5" stroke-linecap="round" style="transform-origin: 6px 6px; transition: transform 0.1s linear;"/>
                        </svg>
                    </div>
                `;
            }
            else if (['NAND'].includes(node.type)) {
                portsHtml = `
                    <div class="port input" data-port="a" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'a')"><span class="port-label">A</span></div>
                    <div class="port input" data-port="b" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'b')"><span class="port-label">B</span></div>
                    <div class="port output" data-port="q" style="top:60%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'q')"><span class="port-label">Q</span></div>`;
            } else if (node.type === 'TRISTATE') {
                portsHtml = `
                    <div class="port input" data-port="in" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'in')"><span class="port-label">IN</span></div>
                    <div class="port input" data-port="en" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'en')"><span class="port-label">EN</span></div>
                    <div class="port output" data-port="out" style="top:60%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out')"><span class="port-label">OUT</span></div>`;
            } else if (node.type === 'RAM') {
                // [AUDIT: v1.26.10 | SEC_ARCH_LEAD] - Refactored RAM layout to strictly align CSS boundary offsets, anchoring dynamic spacing and locking labels to respective edge borders.
                const aBits = node.addressPins || 4;
                const dBits = 8;
                
                const leftPins = aBits + 1 + dBits; 
                const rightPins = dBits;
                const maxPins = Math.max(leftPins, rightPins);
                
                if (node.customHeight) {
                    div.style.height = node.customHeight + 'px';
                    div.style.minHeight = node.customHeight + 'px';
                } else {
                    const heightCalc = (maxPins * 20 + 30);
                    div.style.minHeight = heightCalc + 'px';
                    div.style.height = heightCalc + 'px';
                }
                
                if (node.customWidth) {
                    div.style.width = node.customWidth + 'px';
                    div.style.minWidth = node.customWidth + 'px';
                } else {
                    div.style.width = '100px';
                }

                const getPct = (vIdx, total) => `calc(24px + ${(vIdx / Math.max(1, total - 1))} * (100% - 36px))`;

                for (let i = 0; i < aBits; i++) {
                    const visualIdx = i;
                    const tStyle = `top:${getPct(visualIdx, leftPins)}`;
                    portsHtml += `<div class="port input" data-port="in${i}" style="${tStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'in${i}')"><span class="port-label" style="left:14px; text-align:left;">A${i}</span></div>`;
                }
                
                const weIdx = aBits;
                portsHtml += `<div class="port input" data-port="we" style="top:${getPct(weIdx, leftPins)}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'we')"><span class="port-label" style="left:14px; text-align:left;">WE</span></div>`;

                for (let i = 0; i < dBits; i++) {
                    const vIdxOut = i;
                    const vIdxIn = (aBits + 1) + i;
                    const tStyle = `top:${getPct(vIdxOut, rightPins)}`;
                    const dinStyle = `top:${getPct(vIdxIn, leftPins)}`;
                    portsHtml += `<div class="port output" data-port="out${i}" style="${tStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out${i}')"><span class="port-label" style="right:14px; text-align:right;">D${i}</span></div>`;
                    portsHtml += `<div class="port input" data-port="din${i}" style="${dinStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'din${i}')"><span class="port-label" style="left:14px; text-align:left;">DI${i}</span></div>`;
                }
            } else if (node.isCustom) {
                const chipDef = Sim.library[node.type];
                if (chipDef) {
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Apply secondary X-axis sorting to prevent creation-order drift for horizontal components.
                    const ins = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
                    const outs = chipDef.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
                    
                    let totalIns = 0;
                    ins.forEach(n => totalIns += (parseInt(n.type.split('-')[1]) || 1));
                    let totalOuts = 0;
                    outs.forEach(n => totalOuts += (parseInt(n.type.split('-')[1]) || 1));

                    const maxPorts = Math.max(totalIns, totalOuts);
                    if (maxPorts > 2) {
                        div.style.minHeight = (maxPorts * 20 + 26) + 'px';
                        div.style.height = (maxPorts * 20 + 26) + 'px';
                    }
                    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Override default auto-height if custom geometry is defined.
                    if (node.customHeight) { div.style.height = node.customHeight + 'px'; div.style.minHeight = node.customHeight + 'px'; }
                    if (node.customWidth) { div.style.width = node.customWidth + 'px'; div.style.minWidth = node.customWidth + 'px'; }
                    
                    let cIn = 0;
                    ins.forEach((p) => {
                        const bits = parseInt(p.type.split('-')[1]) || 1;
                        const labelBase = (p.label && p.label !== p.type) ? p.label : '';
                        for (let i = 0; i < bits; i++) {
                            const flip = window.Sim && window.Sim.flipPinLogic;
                            const bIdx = (bits > 1 && flip) ? (bits - 1 - i) : i;
                            const portId = `in${cIn}`;
                            // [AUDIT: v1.24.28 | SEC_ARCH_LEAD] - UI Scaling: Cascade bus labels to macro pins and prevent header collision.
                            const lbl = bits > 1 ? (labelBase + bIdx) : p.label;
                            const vIdx = node.flipPolarity ? (totalIns - 1 - cIn) : cIn;
                            const topStyle = `top:calc(24px + ${vIdx * 20}px)`;
                            portsHtml += `<div class="port input" data-port="${portId}" style="${topStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', '${portId}')"><span class="port-label">${lbl}</span></div>`;
                            cIn++;
                        }
                    });
                    
                    let cOut = 0;
                    outs.forEach((p) => {
                        const bits = parseInt(p.type.split('-')[1]) || 1;
                        const labelBase = (p.label && p.label !== p.type) ? p.label : '';
                        for (let i = 0; i < bits; i++) {
                            const flip = window.Sim && window.Sim.flipPinLogic;
                            const bIdx = (bits > 1 && flip) ? (bits - 1 - i) : i;
                            const portId = `out${cOut}`;
                            // [AUDIT: v1.24.28 | SEC_ARCH_LEAD] - UI Scaling: Cascade bus labels to macro pins and prevent header collision.
                            const lbl = bits > 1 ? (labelBase + bIdx) : p.label;
                            const vIdx = node.flipPolarity ? (totalOuts - 1 - cOut) : cOut;
                            const topStyle = `top:calc(24px + ${vIdx * 20}px)`;
                            portsHtml += `<div class="port output" data-port="${portId}" style="${topStyle}" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', '${portId}')"><span class="port-label">${lbl}</span></div>`;
                            cOut++;
                        }
                    });
                }
            }
        }

        // [AUDIT: SEC_ARCH_LEAD] - Migrated chip info readouts to inline edit interface.
        const labelsHtml = (bits >= 4) ? `
            <div class="visual-extra">
                <span class="dec" ondblclick="event.stopPropagation(); Sim.uiInlineEditValue(event, '${node.id}', 'D')">D: 0</span>
                <span class="hex" ondblclick="event.stopPropagation(); Sim.uiInlineEditValue(event, '${node.id}', 'H')">H: 00</span>
                <div class="bin" ondblclick="event.stopPropagation(); Sim.uiInlineEditValue(event, '${node.id}', 'B')">B: ${'0'.repeat(bits)}</div>
            </div>` : '';

        div.innerHTML = node.type === 'JUNCTION' ? portsHtml : `
            <div class="gate-label">${node.label}</div>
            ${labelsHtml}
            ${portsHtml}`;

        if (Sim.selection.has(node.id)) div.classList.add('selected');

        div.onmousedown = (e) => InteractionHandler.handleNodeDrag(e, node, div);
        div.onclick = (e) => InteractionHandler.handleNodeClick(e, node, div, bits);
        div.ondblclick = (e) => InteractionHandler.handleNodeDblClick(e, node, div);

        const parent = container || document.getElementById('scene');
        if (parent) parent.appendChild(div);

        if (window.Sim && Sim._domCacheMap) Sim._domCacheMap.delete(node.id);
        Sim.updateNodeVisual(node);
    }
};

window.NodeRenderer = NodeRenderer;
