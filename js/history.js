/**
 * History Management Module
 * Implements Undo/Redo pattern for Sim state.
 */
const History = {
    stack: [],
    index: -1,
    max: 50,

    /**
     * @ARCH: COMMAND_PATTERN_MANAGER
     * @STATE: HISTORY_STACK
     * @INTENT: Execute a new command, append to undo stack, and clear the redo history.
     */
    execute(cmd) {
        console.debug('[DEBUG] History.execute fired for command:', cmd.constructor.name, cmd);
        // Clear redo stack
        this.stack = this.stack.slice(0, this.index + 1);
        cmd.do();
        this.stack.push(cmd);
        if (this.stack.length > this.max) this.stack.shift(); else this.index++;
        this.updateButtons();
        Sim.autoSave();
        // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Command execution history updated: ${cmd.constructor.name}.
    },

    /**
     * @ARCH: COMMAND_PATTERN_MANAGER
     * @STATE: HISTORY_STACK
     * @INTENT: Revert the last executed command and decrement the history index.
     */
    undo() {
        if (this.index >= 0) {
            const cmd = this.stack[this.index];
            cmd.undo();
            this.index--;
            this.updateButtons();
            Sim.autoSave();
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Undo operation finalized for ${cmd.constructor.name}.
        } else {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Undo ignored, history stack empty.
        }
    },

    /**
     * @ARCH: COMMAND_PATTERN_MANAGER
     * @STATE: HISTORY_STACK
     * @INTENT: Re-execute the next command in the history stack.
     */
    redo() {
        if (this.index < this.stack.length - 1) {
            this.index++;
            const cmd = this.stack[this.index];
            cmd.do();
            this.updateButtons();
            Sim.autoSave();
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Redo operation finalized for ${cmd.constructor.name}.
        } else {
            // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Redo ignored, end of stack reached.
        }
    },

    record() {
        // Virtual command for simple state snaps if needed
    },

    /**
     * @IO: UI_STATE_SYNC
     * @INTENT: Update the visual enabled/disabled state of undo/redo buttons.
     */
    updateButtons() {
        const u = document.getElementById('btn-undo');
        const r = document.getElementById('btn-redo');
        if (u) u.style.opacity = this.index >= 0 ? 1 : 0.3;
        if (r) r.style.opacity = this.index < this.stack.length - 1 ? 1 : 0.3;
    }
};

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for adding a node to the netlist with support for undo/redo.
 */
class AddNodeCommand {
    constructor(node) { this.node = node; }
    do() { 
        console.log('[DEBUG] AddNodeCommand.do triggered. Adding Node:', this.node.id, 'Type:', this.node.type);
        if (!Sim.nodes.find(n => n.id === this.node.id)) Sim.nodes.push(this.node);
        NodeRenderer.renderNode(this.node);
        Sim.updateWireVisuals();
        Sim.updateHUD(); // Ensure state-aware HUD is synced
        Sim.eventQueue.add(this.node);
        Sim.wakeQueue();
    }
    undo() {
        Sim.nodes = Sim.nodes.filter(n => n.id !== this.node.id);
        Sim.wires = Sim.wires.filter(w => w.from.nodeId !== this.node.id && w.to.nodeId !== this.node.id);
        const el = document.getElementById(this.node.id);
        if (el) el.remove();
        Sim.updateWireVisuals();
        Sim.updateHUD();
    }
}

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for deleting a node and its associated wires from the netlist.
 */
class DeleteNodeCommand {
    constructor(node) {
        this.node = node;
        // [AUDIT: v1.24.82 | SEC_ARCH_LEAD] - Captured adjacent topological edges to prevent mathematically orphaned wires post-deletion.
        this.attachedWires = [];
    }
    do() {
        if (this.attachedWires.length === 0) {
            this.attachedWires = Sim.wires.filter(w => w.from.nodeId === this.node.id || w.to.nodeId === this.node.id);
        }
        Sim.nodes = Sim.nodes.filter(n => n.id !== this.node.id);
        const el = document.getElementById(this.node.id);
        if (el) el.remove();
        
        Sim.wires = Sim.wires.filter(w => !this.attachedWires.includes(w));
        Sim.updateWireVisuals();
        Sim.updateHUD();
        Sim.seedQueue(); Sim.processQueue();
    }
    undo() {
        Sim.nodes.push(this.node);
        if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(this.node);
        
        this.attachedWires.forEach(w => {
            if (!Sim.wires.includes(w)) Sim.wires.push(w);
        });
        Sim.updateWireVisuals();
        Sim.updateHUD();
        Sim.seedQueue(); Sim.processQueue();
    }
}

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for adding a wire connection between two ports.
 */
class AddWireCommand {
    constructor(wire) { this.wire = wire; }
    do() {
        // Prevent exact duplicates
        if (!Sim.wires.find(w => w.from.nodeId === this.wire.from.nodeId && w.to.nodeId === this.wire.to.nodeId && w.from.portId === this.wire.from.portId && w.to.portId === this.wire.to.portId)) {
            Sim.wires.push(this.wire);
        }
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
    undo() {
        Sim.wires = Sim.wires.filter(w => !(w.from.nodeId === this.wire.from.nodeId && w.to.nodeId === this.wire.to.nodeId && w.from.portId === this.wire.from.portId && w.to.portId === this.wire.to.portId));
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
}

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for removing a wire connection.
 */
class DeleteWireCommand {
    constructor(wire) { this.wire = wire; }
    do() {
        Sim.wires = Sim.wires.filter(w => w !== this.wire);
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
    undo() {
        Sim.wires.push(this.wire);
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
}

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for moving one or more nodes and their orthogonal wire segments.
 */
class MoveNodeCommand {
    constructor(nodeId_or_moves, ox_or_wireMoves, oy, nx, ny) {
        if (Array.isArray(nodeId_or_moves)) {
            this.moves = nodeId_or_moves;
            this.wireMoves = ox_or_wireMoves || [];
        } else {
            this.moves = [{ id: nodeId_or_moves, ox: ox_or_wireMoves, oy, nx, ny }];
            this.wireMoves = [];
        }
    }
    do() {
        this.moves.forEach(m => {
            const n = Sim.nodes.find(x => x.id === m.id);
            if (n) { n.x = m.nx; n.y = m.ny; Sim.updateNodePosition(n); }
        });
        this.wireMoves.forEach(m => {
            if (m.nx !== undefined) m.wire.midX = m.nx;
            if (m.ny !== undefined) m.wire.midY = m.ny;
        });
        Sim.updateWireVisuals();
    }
    undo() {
        this.moves.forEach(m => {
            const n = Sim.nodes.find(x => x.id === m.id);
            if (n) { n.x = m.ox; n.y = m.oy; Sim.updateNodePosition(n); }
        });
        this.wireMoves.forEach(m => {
            if (m.ox !== undefined) m.wire.midX = m.ox; else delete m.wire.midX;
            if (m.oy !== undefined) m.wire.midY = m.oy; else delete m.wire.midY;
        });
        Sim.updateWireVisuals();
    }
}

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate the logic for bulk-pasting a set of nodes and wires into the workspace.
 */
class PasteCommand {
    constructor(nodes, wires) {
        this.nodes = nodes; this.wires = wires;
    }
    do() {
        this.nodes.forEach(n => {
            Sim.nodes.push(n);
            NodeRenderer.renderNode(n);
            Sim.eventQueue.add(n); // Wake node
        });
        this.wires.forEach(w => Sim.wires.push(w));
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
    undo() {
        const ids = new Set(this.nodes.map(n => n.id));
        Sim.nodes = Sim.nodes.filter(n => !ids.has(n.id));
        Sim.wires = Sim.wires.filter(w => !ids.has(w.from.nodeId) && !ids.has(w.to.nodeId));
        this.nodes.forEach(n => {
            const el = document.getElementById(n.id);
            if (el) el.remove();
        });
        Sim.updateWireVisuals();
        Sim.seedQueue(); Sim.processQueue();
    }
}

window.AddNodeCommand = AddNodeCommand;
window.DeleteNodeCommand = DeleteNodeCommand;
window.AddWireCommand = AddWireCommand;
window.DeleteWireCommand = DeleteWireCommand;

/**
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate atomic wire splitting with inline junction creation to prevent fragmented Undo stack entries.
 */
class SplitWireCommand {
    constructor(wire, clickX, clickY) {
        this.wire = wire;
        this.clickX = clickX;
        this.clickY = clickY;
        this.jId = 'node-' + Math.random().toString(36).substr(2, 9);
        this.newWire = { from: { nodeId: this.jId, portId: 'j' }, to: { ...wire.to } };
        this.oldTo = { ...wire.to };
    }
    do() {
        const junction = { id: this.jId, type: 'JUNCTION', x: this.clickX, y: this.clickY, label: 'JUNCTION', val: 0, state: 0, outputs: {}, lastClk: 0 };
        Sim.nodes.push(junction);
        if (typeof NodeRenderer !== 'undefined') NodeRenderer.renderNode(junction);
        
        this.wire.to = { nodeId: this.jId, portId: 'j' };
        if (!Sim.wires.find(w => w.from.nodeId === this.newWire.from.nodeId && w.to.nodeId === this.newWire.to.nodeId && w.from.portId === this.newWire.from.portId && w.to.portId === this.newWire.to.portId)) {
            Sim.wires.push(this.newWire);
        }
        Sim.updateWireVisuals();
        Sim.updateHUD();
        Sim.eventQueue.add(junction);
        Sim.wakeQueue();
    }
    undo() {
        Sim.nodes = Sim.nodes.filter(n => n.id !== this.jId);
        const el = document.getElementById(this.jId);
        if (el) el.remove();
        
        this.wire.to = this.oldTo;
        Sim.wires = Sim.wires.filter(w => !(w.from.nodeId === this.newWire.from.nodeId && w.to.nodeId === this.newWire.to.nodeId && w.from.portId === this.newWire.from.portId && w.to.portId === this.newWire.to.portId));
        Sim.updateWireVisuals();
        Sim.updateHUD();
        Sim.seedQueue(); Sim.processQueue();
    }
}

window.SplitWireCommand = SplitWireCommand;
/**
 * [AUDIT: SEC_ARCH_LEAD] - Layout mutation structural command updated for chip info readouts.
 * @ARCH: COMMAND_PATTERN
 * @STATE: NETLIST_STATE
 * @INTENT: Encapsulate layout preference mutations to preserve geometric history.
 */
class MutateLayoutCommand {
    constructor(node, og, nw) {
        this.node = node;
        this.og = og;
        this.nw = nw;
    }
    do() {
        this.node.customWidth = this.nw.w; this.node.customHeight = this.nw.h;
        this.node.pinX = this.nw.px; this.node.pinY = this.nw.py;
        this.node.pinW = this.nw.pw; this.node.pinH = this.nw.ph;
        this.node.infoX = this.nw.ix; this.node.infoY = this.nw.iy;
        this.node.infoW = this.nw.iw; this.node.infoH = this.nw.ih;
        this.node.labelX = this.nw.lx; this.node.labelY = this.nw.ly;
        this.node.labelW = this.nw.lw; this.node.labelH = this.nw.lh;
        this.node.portY = this.nw.portY; this.node.portH = this.nw.portH;
        Sim.updateNodeVisual(this.node);
        Sim.updateWireVisuals();
    }
    undo() {
        this.node.customWidth = this.og.w; this.node.customHeight = this.og.h;
        this.node.pinX = this.og.px; this.node.pinY = this.og.py;
        this.node.pinW = this.og.pw; this.node.pinH = this.og.ph;
        this.node.infoX = this.og.ix; this.node.infoY = this.og.iy;
        this.node.infoW = this.og.iw; this.node.infoH = this.og.ih;
        this.node.labelX = this.og.lx; this.node.labelY = this.og.ly;
        this.node.labelW = this.og.lw; this.node.labelH = this.og.lh;
        this.node.portY = this.og.portY; this.node.portH = this.og.portH;
        Sim.updateNodeVisual(this.node);
        Sim.updateWireVisuals();
    }
}

window.MoveNodeCommand = MoveNodeCommand;
window.PasteCommand = PasteCommand;
window.MutateLayoutCommand = MutateLayoutCommand;
window.History = History;
