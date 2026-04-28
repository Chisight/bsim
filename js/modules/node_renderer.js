/**
 * Node Rendering Module
 * Handles drawing of gates, ports, and visual labels.
 */
const NodeRenderer = {
    /**
     * [AUDIT: v1.23.68 | SEC_ARCH_LEAD] - Entry trace for node DOM instantiation.
     * @ARCH: UI_RENDERING
     * @IO: DOM_FACTORY
     * @INTENT: Dynamically generate and inject the HTML/DOM representation for a specific logic node, including its ports and visual labels.
     */
    renderNode(node) {
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
        if (bits >= 4) {
            div.style.height = (bits * 18 + 25) + 'px';
            div.style.minHeight = (bits * 18 + 25) + 'px';
            div.style.width = '90px';
            div.style.minWidth = '90px';
        }
        
        Sim.updateNodePosition(node, div);
        let portsHtml = '';

        if (node.type.startsWith('IN-')) {
            for (let i = 0; i < bits; i++) {
                const bIdx = bits - 1 - i; // TOP is MSB, BOTTOM is LSB
                const topPct = bits === 1 ? 50 : ((i + 0.5) / bits) * 100;
                const labelText = (bits > 1) ? `${node.label}[${bIdx}]` : node.label;
                portsHtml += `<div class="port output" data-port="out${bIdx}" style="top:${topPct}%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out${bIdx}')">
                    <div class="port-meta"><span class="port-label">${labelText}</span><div class="bit-dot inline-dot" data-bit="${bIdx}" onclick="event.stopPropagation(); Sim.toggleBit(event, '${node.id}', ${bIdx})"></div></div>
                </div>`;
            }
        } else if (node.type.startsWith('OUT-') || node.type.startsWith('PROBE-')) {
            for (let i = 0; i < bits; i++) {
                const bIdx = bits - 1 - i; // TOP is MSB, BOTTOM is LSB
                const topPct = bits === 1 ? 50 : ((i + 0.5) / bits) * 100;
                const labelText = (bits > 1) ? `${node.label}[${bIdx}]` : node.label;
                portsHtml += `<div class="port input" data-port="in${bIdx}" style="top:${topPct}%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'in${bIdx}')">
                    <div class="port-meta"><div class="bit-dot inline-dot" data-bit="${bIdx}"></div><span class="port-label">${labelText}</span></div>
                </div>`;
            }
        } else {
            if (node.type === 'JUNCTION') portsHtml = `<div class="port input output" data-port="j" style="top:50%;left:50%;transform:translate(-50%,-50%)" onmousedown="if(!Sim.wiring.active) return; event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'j')"></div>`;
            else if (node.type === 'CLOCK') portsHtml = `<div class="port output" data-port="out0" style="top:50%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out0')"><span class="port-label">CLK</span></div>`;
            else if (['NAND', 'AND', 'OR', 'NOR', 'XOR', 'XNOR'].includes(node.type)) {
                portsHtml = `
                    <div class="port input" data-port="a" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'a')"><span class="port-label">A</span></div>
                    <div class="port input" data-port="b" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'b')"><span class="port-label">B</span></div>
                    <div class="port output" data-port="q" style="top:60%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'q')"><span class="port-label">Q</span></div>`;
            } else if (node.type === 'NOT') {
                portsHtml = `
                    <div class="port input" data-port="a" style="top:50%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'a')"><span class="port-label">IN</span></div>
                    <div class="port output" data-port="q" style="top:50%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'q')"><span class="port-label">Q</span></div>`;
            } else if (node.type === 'TRISTATE') {
                portsHtml = `
                    <div class="port input" data-port="in" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'in')"><span class="port-label">IN</span></div>
                    <div class="port input" data-port="en" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'en')"><span class="port-label">EN</span></div>
                    <div class="port output" data-port="out" style="top:60%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'out')"><span class="port-label">OUT</span></div>`;
            } else if (node.type === 'DFF' || node.type === 'TFF') {
                const label = node.type === 'DFF' ? 'D' : 'T';
                portsHtml = `
                    <div class="port input" data-port="${label.toLowerCase()}" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', '${label.toLowerCase()}')"><span class="port-label">${label}</span></div>
                    <div class="port input" data-port="clk" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'clk')"><span class="port-label">CLK</span></div>
                    <div class="port output" data-port="q" style="top:42%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'q')"><span class="port-label">Q</span></div>
                    <div class="port output" data-port="nq" style="top:78%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', 'nq')"><span class="port-label">NQ</span></div>`;
            } else if (node.isCustom) {
                const chipDef = Sim.library[node.type];
                if (chipDef) {
                    const ins = chipDef.nodes.filter(n => n.type.startsWith('IN-')).sort((a, b) => a.y - b.y);
                    const outs = chipDef.nodes.filter(n => n.type.startsWith('OUT-') || n.type.startsWith('PROBE-')).sort((a, b) => a.y - b.y);
                    
                    let totalIns = 0;
                    ins.forEach(n => totalIns += (parseInt(n.type.split('-')[1]) || 1));
                    let totalOuts = 0;
                    outs.forEach(n => totalOuts += (parseInt(n.type.split('-')[1]) || 1));

                    const maxPorts = Math.max(totalIns, totalOuts);
                    if (maxPorts > 2) {
                        div.style.minHeight = (maxPorts * 20 + 20) + 'px';
                        div.style.height = (maxPorts * 20 + 20) + 'px';
                    }
                    
                    let cIn = 0;
                    ins.forEach((p) => {
                        const bits = parseInt(p.type.split('-')[1]) || 1;
                        for (let i = 0; i < bits; i++) {
                            const bIdx = bits > 1 ? (bits - 1 - i) : 0;
                            const portId = `in${cIn}`;
                            const lbl = bits > 1 ? `${p.label}[${bIdx}]` : p.label;
                            portsHtml += `<div class="port input" data-port="${portId}" style="top:${((cIn + 0.5) / totalIns) * 100}%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', '${portId}')"><span class="port-label">${lbl}</span></div>`;
                            cIn++;
                        }
                    });
                    
                    let cOut = 0;
                    outs.forEach((p) => {
                        const bits = parseInt(p.type.split('-')[1]) || 1;
                        for (let i = 0; i < bits; i++) {
                            const bIdx = bits > 1 ? (bits - 1 - i) : 0;
                            const portId = `out${cOut}`;
                            const lbl = bits > 1 ? `${p.label}[${bIdx}]` : p.label;
                            portsHtml += `<div class="port output" data-port="${portId}" style="top:${((cOut + 0.5) / totalOuts) * 100}%" onmousedown="event.stopPropagation(); Sim.handlePortInteraction(event, '${node.id}', '${portId}')"><span class="port-label">${lbl}</span></div>`;
                            cOut++;
                        }
                    });
                }
            }
        }

        const labelsHtml = (bits >= 4) ? `
            <div class="visual-extra">
                <span class="dec" onmousedown="event.stopPropagation(); Sim.uiEnterValue('${node.id}', 'D')">D: 0</span>
                <span class="hex" onmousedown="event.stopPropagation(); Sim.uiEnterValue('${node.id}', 'H')">H: 00</span>
                <div class="bin" onmousedown="event.stopPropagation(); Sim.uiEnterValue('${node.id}', 'B')">B: ${'0'.repeat(bits)}</div>
            </div>` : '';

        div.innerHTML = node.type === 'JUNCTION' ? portsHtml : `
            <div class="gate-label">${node.label}</div>
            ${labelsHtml}
            ${portsHtml}`;

        if (Sim.selection.has(node.id)) div.classList.add('selected');

        div.onmousedown = (e) => InteractionHandler.handleNodeDrag(e, node, div);
        div.onclick = (e) => InteractionHandler.handleNodeClick(e, node, div, bits);
        div.ondblclick = (e) => InteractionHandler.handleNodeDblClick(e, node, div);

        document.getElementById('scene').appendChild(div);
        if (window.Sim && Sim._domCacheMap) Sim._domCacheMap.delete(node.id);
        Sim.updateNodeVisual(node);
        // [AUDIT: v1.23.68 | SEC_ARCH_LEAD] - EXIT_TRACE: Node rendered and appended to DOM: ${node.id} (${node.type}).
    }
};

window.NodeRenderer = NodeRenderer;
