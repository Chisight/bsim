import json
node = {'addressPins': 8, 'memoryData': [0]*16}
MAX_BYTES = 256

# Mock fetch returning 256 bytes from 0 to 255
buffer = bytearray(range(256))
safeView = bytearray(MAX_BYTES)
safeView[:MAX_BYTES] = buffer[:MAX_BYTES]

node['memoryData'] = list(safeView)
print("First 16 bytes of memoryData:", node['memoryData'][:16])
