class SimTestFull:
    def __init__(self):
        self.memory = bytearray(600 * 65536)
        # Chip 1 has 256 bytes.
        self.chip1 = {'id': 'node1', 'type': 'RAM', 'addressPins': 8, 'memoryData': list(range(256))}
        self.rootNodes = [self.chip1]
        self.flatNodes = []
        
    def flattenNodes(self):
        # Simplistic topological sort returning in reverse order
        return list(reversed(self.rootNodes))

    def buildExecutionGraph(self):
        self.flatNodes = self.flattenNodes()
        currentRomOffset = 0
        for n in self.flatNodes:
            if n['type'] == 'RAM':
                allocSize = 1 << n['addressPins']
                for i in range(min(allocSize, len(n['memoryData']))):
                    self.memory[16777216 + currentRomOffset + i] = n['memoryData'][i]
                currentRomOffset += allocSize

    def updateHostMemory(self):
        currentRomOffset = 0
        for fn in self.flatNodes:
            if fn['type'] == 'RAM' or fn['type'] == 'ROM':
                allocSize = 1 << fn['addressPins']
                if fn['type'] == 'RAM':
                    hostNode = next(n for n in self.rootNodes if n['id'] == fn['id'])
                    if 'memoryData' not in hostNode or len(hostNode['memoryData']) != allocSize:
                        hostNode['memoryData'] = [0] * allocSize
                    for i in range(allocSize):
                        hostNode['memoryData'][i] = self.memory[16777216 + currentRomOffset + i]
                currentRomOffset += allocSize

sim = SimTestFull()
sim.buildExecutionGraph()
sim.updateHostMemory()
print("Phase 1 - Chip 1:", sim.chip1['memoryData'][:20])

# Now ADD Chip 2 (16 bytes)
sim.chip2 = {'id': 'node2', 'type': 'RAM', 'addressPins': 4, 'memoryData': [i + 100 for i in range(16)]}
sim.rootNodes.append(sim.chip2)

sim.buildExecutionGraph()
sim.updateHostMemory()
print("Phase 2 - Chip 1:", sim.chip1['memoryData'][:20])
print("Phase 2 - Chip 2:", sim.chip2['memoryData'])
