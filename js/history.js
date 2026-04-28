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
        // [AUDIT: v1.23.69 | SEC_ARCH_LEAD] - EXIT_TRACE: Command execution history updated: ${cmd.constructor.name}.
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
            // [AUDIT: v1.23.69 | SEC_ARCH_LEAD] - EXIT_TRACE: Undo operation finalized for ${cmd.constructor.name}.
        } else {
            // [AUDIT: v1.23.69 | SEC_ARCH_LEAD] - EXIT_TRACE: Undo ignored, history stack empty.
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
            // [AUDIT: v1.23.69 | SEC_ARCH_LEAD] - EXIT_TRACE: Redo operation finalized for ${cmd.constructor.name}.
        } else {
            // [AUDIT: v1.23.69 | SEC_ARCH_LEAD] - EXIT_TRACE: Redo ignored, end of stack reached.
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
        this.wires = Sim.wires.filter(w => w.from.nodeId === node.id || w.to.nodeId === node.id);
    }
    do() {
        console.warn('[DEBUG] DeleteNodeCommand.do triggered. Deleting Node ID:', this.node?.id, 'Type:', this.node?.type);
        Sim.nodes = Sim.nodes.filter(n => n.id !== this.node.id);
        Sim.wires = Sim.wires.filter(w => w.from.nodeId !== this.node.id && w.to.nodeId !== this.node.id);
        const el = document.getElementById(this.node.id);
        if (el) el.remove();
        Sim.updateWireVisuals();
    }
    undo() {
        Sim.nodes.push(this.node);
        NodeRenderer.renderNode(this.node);
        this.wires.forEach(w => {
            if (!Sim.wires.find(x => x.from.nodeId === w.from.nodeId && x.to.nodeId === w.to.nodeId && x.from.portId === w.from.portId && x.to.portId === w.to.portId)) {
                Sim.wires.push(w);
            }
        });
        Sim.updateWireVisuals();
        Sim.updateHUD();
        Sim.eventQueue.add(this.node);
        Sim.wakeQueue();
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
window.MoveNodeCommand = MoveNodeCommand;
window.PasteCommand = PasteCommand;
window.History = History;
