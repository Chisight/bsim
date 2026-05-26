class SimTest:
    def __init__(self):
        self.memory = bytearray(600 * 65536)
        self.flatNodes = [
            {'id': 'node1', 'type': 'RAM', 'addressPins': 8, 'memoryData': list(range(256))},
            {'id': 'node2', 'type': 'RAM', 'addressPins': 4, 'memoryData': [i + 100 for i in range(16)]}
        ]
        
    def buildExecutionGraph(self):
        currentRomOffset = 0
        for n in self.flatNodes:
            if n['type'] == 'RAM':
                allocSize = 1 << n['addressPins']
                for i in range(allocSize):
                    self.memory[16777216 + currentRomOffset + i] = n['memoryData'][i]
                currentRomOffset += allocSize

    def updateHostMemory(self):
        currentRomOffset = 0
        for fn in self.flatNodes:
            if fn['type'] == 'RAM' or fn['type'] == 'ROM':
                allocSize = 1 << fn['addressPins']
                if fn['type'] == 'RAM':
                    hostNode = next(n for n in self.flatNodes if n['id'] == fn['id'])
                    if 'memoryData' not in hostNode or len(hostNode['memoryData']) != allocSize:
                        hostNode['memoryData'] = [0] * allocSize
                    for i in range(allocSize):
                        hostNode['memoryData'][i] = self.memory[16777216 + currentRomOffset + i]
                currentRomOffset += allocSize

sim = SimTest()
sim.buildExecutionGraph()
sim.updateHostMemory()
print("Chip 1:", sim.flatNodes[0]['memoryData'][:20])
print("Chip 2:", sim.flatNodes[1]['memoryData'])

# Now simulate ADDING a second RAM chip AFTER the first one was loaded.
# The `flattenNodes` process reverses the nodes.
sim.flatNodes = [
    {'id': 'node2', 'type': 'RAM', 'addressPins': 4, 'memoryData': [i + 100 for i in range(16)]},
    sim.flatNodes[0]
]

# When second chip is added, buildExecutionGraph runs.
sim.buildExecutionGraph()
sim.updateHostMemory()
print("After adding Chip 2, Chip 1:", sim.flatNodes[1]['memoryData'][:20])
print("After adding Chip 2, Chip 2:", sim.flatNodes[0]['memoryData'])
