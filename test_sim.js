class SimTest {
    constructor() {
        this.memory = new WebAssembly.Memory({ initial: 600 });
        this.flatNodes = [
            { id: 'node1', type: 'RAM', addressPins: 8, memoryData: new Array(256).fill(0).map((_, i) => i) },
            { id: 'node2', type: 'RAM', addressPins: 4, memoryData: new Array(16).fill(0).map((_, i) => i + 100) }
        ];
    }
    
    buildExecutionGraph() {
        let currentRomOffset = 0;
        this.flatNodes.forEach(n => {
            if (n.type === 'RAM') {
                const allocSize = 1 << n.addressPins;
                const view = new Uint8Array(this.memory.buffer, 16777216 + currentRomOffset, allocSize);
                view.set(n.memoryData.slice(0, allocSize));
                currentRomOffset += allocSize;
            }
        });
    }

    updateHostMemory() {
        let currentRomOffset = 0;
        this.flatNodes.forEach(fn => {
            if (fn.type === 'RAM' || fn.type === 'ROM') {
                const allocSize = 1 << fn.addressPins;
                if (fn.type === 'RAM') {
                    const hostNode = this.flatNodes.find(n => n.id === fn.id);
                    if (hostNode) {
                        const view = new Uint8Array(this.memory.buffer, 16777216 + currentRomOffset, allocSize);
                        if (!hostNode.memoryData || hostNode.memoryData.length !== allocSize) hostNode.memoryData = new Array(allocSize).fill(0);
                        for(let i = 0; i < allocSize; i++) hostNode.memoryData[i] = view[i];
                    }
                }
                currentRomOffset += allocSize;
            }
        });
    }
}

const sim = new SimTest();
sim.buildExecutionGraph();
sim.updateHostMemory();
console.log("Chip 1:", sim.flatNodes[0].memoryData.slice(0, 20).join(', '));
console.log("Chip 2:", sim.flatNodes[1].memoryData.join(', '));
