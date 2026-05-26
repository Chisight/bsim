const memory = new WebAssembly.Memory({ initial: 600 });
const memoryData1 = new Array(256).fill(0).map((_, i) => i);
const memoryData2 = new Array(16).fill(0).map((_, i) => i + 100);

let currentRomOffset = 0;
const flatNodes = [
    { type: 'RAM', addressPins: 8, memoryData: memoryData1 },
    { type: 'RAM', addressPins: 4, memoryData: memoryData2 }
];

flatNodes.forEach(n => {
    const allocSize = 1 << n.addressPins;
    const view = new Uint8Array(memory.buffer, 16777216 + currentRomOffset, allocSize);
    view.set(n.memoryData.slice(0, allocSize));
    currentRomOffset += allocSize;
});

let readOffset = 0;
flatNodes.forEach(fn => {
    const allocSize = 1 << fn.addressPins;
    const view = new Uint8Array(memory.buffer, 16777216 + readOffset, allocSize);
    const readBack = new Array(allocSize).fill(0);
    for(let i = 0; i < allocSize; i++) readBack[i] = view[i];
    console.log(`Chip (pins=${fn.addressPins}) first 16 bytes:`, readBack.slice(0, 16).join(', '));
    readOffset += allocSize;
});
