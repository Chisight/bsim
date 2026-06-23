import re

with open('js/modules/engine.js', 'r') as f:
    content = f.read()

# 1. Add _sharedVisitedSet and _sharedVisitedJuncs to Engine
content = content.replace('KERNEL: new Set([\'IN-1\', \'IN-4\', \'IN-8\', \'OUT-1\', \'OUT-4\', \'OUT-8\', \'PROBE-4\', \'PROBE-8\', \'NAND\', \'NOT\', \'AND\', \'OR\', \'NOR\', \'XOR\', \'XNOR\', \'CLOCK\', \'JUNCTION\', \'DFF\', \'TFF\', \'TRISTATE\', \'RAM\', \'0\']),',
'''KERNEL: new Set(['IN-1', 'IN-4', 'IN-8', 'OUT-1', 'OUT-4', 'OUT-8', 'PROBE-4', 'PROBE-8', 'NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR', 'CLOCK', 'JUNCTION', 'DFF', 'TFF', 'TRISTATE', 'RAM', '0']),
    _sharedVisitedSet: new Set(),
    _sharedVisitedJuncs: new Set(),''')

# 2. Modify getSignal
content = content.replace('getSignal(sim, nodeId, portId, visited = new Set()) {',
    'getSignal(sim, nodeId, portId, visited = null) {\n        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }')

# 3. Modify getDrivingSignal
content = content.replace('getDrivingSignal(sim, nodeId, portId, visited = new Set()) {',
    'getDrivingSignal(sim, nodeId, portId, visited = null) {\n        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }')

# 4. Modify calculateNextState
content = content.replace('calculateNextState(sim, node, visited = new Set()) {',
    'calculateNextState(sim, node, visited = null) {\n        if (!visited) { visited = this._sharedVisitedSet; visited.clear(); }')

# 5. Extract arrays and functions in processQueue
replace_target = """        if (!sim._nextQueue) sim._nextQueue = new Set();
        else sim._nextQueue.clear();

        while (sim.eventQueue.size > 0 && iterations < MAX_ITERS) {
            iterations++;

            const combNodes = [];
            const seqNodes = [];

            sim.eventQueue.forEach(node => {
                if (['DFF', 'TFF', 'CLOCK', 'RAM'].includes(node.type)) {
                    seqNodes.push(node);
                } else {
                    combNodes.push(node);
                }
            });

            const processNode = (node) => {
                const newVal = this.calculateNextState(sim, node);
                const rawNew = (typeof newVal === 'string' && newVal !== 'Z' && newVal !== 'E') ? JSON.parse(newVal) : newVal;

                if (!this.fastEqual(node.val, rawNew) || node._forcePropagate) {
                    if (!this.fastEqual(node.val, rawNew)) node.toggles = (node.toggles || 0) + 1;
                    node._forcePropagate = false;

                    if (!sim._transitions) sim._transitions = new Map();
                    const flips = (sim._transitions.get(node.id) || 0) + 1;
                    sim._transitions.set(node.id, flips);

                    if (flips > (sim.MAX_TRANSITIONS || 100)) {
                        if (!node._oscillating) {
                            console.warn(`[DEBUG] Oscillation detected on node ${node.id}.`);
                            node._oscillating = true;
                            if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);
                        }
                        return;
                    }

                    node.val = rawNew;
                    if (node.isCustom) {
                        node.outputs = typeof rawNew === 'object' && rawNew !== null ? { ...rawNew } : {};
                    }
                    node._oscillating = false;
                    if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);

                    let visitedJuncs = new Set();
                    const traceDriven = (nid, depth = 0) => {
                        if (depth > 100) return;
                        const adj = sim._wireMap ? (sim._wireMap.get(nid) || []) : sim.wires.filter(w => w.from.nodeId === nid || w.to.nodeId === nid);
                        adj.forEach(w => {
                            if (w.from.nodeId === nid) {
                                const ds = sim._nodeMap ? sim._nodeMap.get(w.to.nodeId) : sim.nodes.find(n => n.id === w.to.nodeId);
                                if (ds) {
                                    sim._nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id, depth + 1);
                                    }
                                }
                            } else if (w.to.nodeId === nid) {
                                const ds = sim._nodeMap ? sim._nodeMap.get(w.from.nodeId) : sim.nodes.find(n => n.id === w.from.nodeId);
                                if (ds) {
                                    sim._nextQueue.add(ds);
                                    if (ds.type === 'JUNCTION' && !visitedJuncs.has(ds.id)) {
                                        visitedJuncs.add(ds.id);
                                        traceDriven(ds.id, depth + 1);
                                    }
                                }
                            }
                        });
                    };
                    traceDriven(node.id);

                    if (sim.activeEditingChip === null && window.TutorialEngine) {
                        TutorialEngine.checkProgress();
                    }
                }
            };

            combNodes.forEach(processNode);
            seqNodes.forEach(processNode);

            // Swap double buffers
            const temp = sim.eventQueue;
            sim.eventQueue = sim._nextQueue;
            sim._nextQueue = temp;
            sim._nextQueue.clear();
        }"""

replacement = """        if (!sim._nextQueue) sim._nextQueue = new Set();
        else sim._nextQueue.clear();

        if (!sim._combNodesList) sim._combNodesList = [];
        if (!sim._seqNodesList) sim._seqNodesList = [];

        const traceDriven = (nid, depth = 0) => {
            if (depth > 100) return;
            const adj = sim._wireMap ? (sim._wireMap.get(nid) || []) : sim.wires.filter(w => w.from.nodeId === nid || w.to.nodeId === nid);
            adj.forEach(w => {
                if (w.from.nodeId === nid) {
                    const ds = sim._nodeMap ? sim._nodeMap.get(w.to.nodeId) : sim.nodes.find(n => n.id === w.to.nodeId);
                    if (ds) {
                        sim._nextQueue.add(ds);
                        if (ds.type === 'JUNCTION' && !this._sharedVisitedJuncs.has(ds.id)) {
                            this._sharedVisitedJuncs.add(ds.id);
                            traceDriven(ds.id, depth + 1);
                        }
                    }
                } else if (w.to.nodeId === nid) {
                    const ds = sim._nodeMap ? sim._nodeMap.get(w.from.nodeId) : sim.nodes.find(n => n.id === w.from.nodeId);
                    if (ds) {
                        sim._nextQueue.add(ds);
                        if (ds.type === 'JUNCTION' && !this._sharedVisitedJuncs.has(ds.id)) {
                            this._sharedVisitedJuncs.add(ds.id);
                            traceDriven(ds.id, depth + 1);
                        }
                    }
                }
            });
        };

        const processNode = (node) => {
            const newVal = this.calculateNextState(sim, node);
            const rawNew = (typeof newVal === 'string' && newVal !== 'Z' && newVal !== 'E') ? JSON.parse(newVal) : newVal;

            if (!this.fastEqual(node.val, rawNew) || node._forcePropagate) {
                if (!this.fastEqual(node.val, rawNew)) node.toggles = (node.toggles || 0) + 1;
                node._forcePropagate = false;

                if (!sim._transitions) sim._transitions = new Map();
                const flips = (sim._transitions.get(node.id) || 0) + 1;
                sim._transitions.set(node.id, flips);

                if (flips > (sim.MAX_TRANSITIONS || 100)) {
                    if (!node._oscillating) {
                        console.warn(`[DEBUG] Oscillation detected on node ${node.id}.`);
                        node._oscillating = true;
                        if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);
                    }
                    return;
                }

                node.val = rawNew;
                if (node.isCustom) {
                    node.outputs = typeof rawNew === 'object' && rawNew !== null ? { ...rawNew } : {};
                }
                node._oscillating = false;
                if (typeof sim.updateNodeVisual === 'function') sim.updateNodeVisual(node);

                this._sharedVisitedJuncs.clear();
                traceDriven(node.id);

                if (sim.activeEditingChip === null && window.TutorialEngine) {
                    TutorialEngine.checkProgress();
                }
            }
        };

        while (sim.eventQueue.size > 0 && iterations < MAX_ITERS) {
            iterations++;

            sim._combNodesList.length = 0;
            sim._seqNodesList.length = 0;

            sim.eventQueue.forEach(node => {
                if (['DFF', 'TFF', 'CLOCK', 'RAM'].includes(node.type)) {
                    sim._seqNodesList.push(node);
                } else {
                    sim._combNodesList.push(node);
                }
            });

            for (let i = 0; i < sim._combNodesList.length; i++) processNode(sim._combNodesList[i]);
            for (let i = 0; i < sim._seqNodesList.length; i++) processNode(sim._seqNodesList[i]);

            // Swap double buffers
            const temp = sim.eventQueue;
            sim.eventQueue = sim._nextQueue;
            sim._nextQueue = temp;
            sim._nextQueue.clear();
        }"""

if replace_target in content:
    content = content.replace(replace_target, replacement)
    with open('js/modules/engine.js', 'w') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Could not find the target code to replace")
