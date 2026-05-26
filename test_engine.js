const fs = require('fs');

async function test() {
    const wasmCode = fs.readFileSync('wasm-core/build/engine.wasm');
    const wasmModule = await WebAssembly.instantiate(wasmCode, {});
    const engine = wasmModule.instance.exports;
    
    // Setup memory mapping sizes to match the real engine
    const memory = engine.memory;
    const view = new Int32Array(memory.buffer);
    const u8view = new Uint8Array(memory.buffer);
    
    // Set up regions
    const REGION_A_BASE = 0;
    const REGION_B_BASE = 1048576;
    const REGION_C_BASE = 16777216;

    // Load data into Chip 1 (offset 16) and Chip 2 (offset 0)
    for (let i = 0; i < 256; i++) u8view[REGION_C_BASE + 16 + i] = i;
    for (let i = 0; i < 16; i++) u8view[REGION_C_BASE + 0 + i] = i + 100;

    let instCount = 0;
    const emit = (t, a, b, op) => {
        const base = (REGION_B_BASE / 4) + instCount * 4;
        view[base] = t; view[base+1] = a; view[base+2] = b; view[base+3] = op;
        instCount++;
    };

    // Chip 2 (16 bytes, offset 0)
    // Addr pins evaluate to 0 (hardcode false is node 0)
    emit(0, 0, 0, 8); // OP_SET_OFFSET(0)
    // OP_RAM: target=10, a=pins<<24 | addrBase=2, b=dinBase=3
    emit(10, (4 << 24) | 2, 3, 7); 

    // Chip 1 (256 bytes, offset 16)
    emit(0, 16, 0, 8); // OP_SET_OFFSET(16)
    // Addr pins evaluate to 0
    emit(20, (8 << 24) | 2, 3, 7); // OP_RAM: target=20, a=pins<<24 | addrBase=2, b=dinBase=3

    engine.tick(instCount);

    // Print outputs
    console.log("Chip 2 output (node 10):", view[REGION_A_BASE/4 + 10]);
    console.log("Chip 1 output (node 20):", view[REGION_A_BASE/4 + 20]);
}

test();
