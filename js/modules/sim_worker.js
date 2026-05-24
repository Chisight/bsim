/**
 * WebWorker for Background Simulation Execution
 * Handles the WebAssembly execution loop off the main thread.
 */

let wasmInstance = null;
let instructionCount = 0;
let running = false;

// We will use Atomics for synchronization if we want to get fancy, 
// but simply looping with a small delay allows message processing.
function runLoop() {
    if (!running || !wasmInstance || instructionCount === 0) {
        return;
    }
    
    // Execute one full logic evaluation pass
    // The main thread uses execDepth = Math.max(20, nodes.length)
    // We'll use a fixed depth of 50 for deep combinational paths
    for (let i = 0; i < 50; i++) {
        wasmInstance.exports.tick(instructionCount, 0);
    }
    
    // Sequential latches
    wasmInstance.exports.tick(instructionCount, 1);
    wasmInstance.exports.tick(instructionCount, 2);

    // Yield back to the event loop so postMessage can be processed
    setTimeout(runLoop, 0);
}

self.onmessage = async (e) => {
    const data = e.data;
    
    if (data.action === 'init') {
        try {
            const { wasmBytes, memory } = data;
            
            const env = {
                memory: memory,
                SHADOW_BASE: 196608,
                PREV_CLK_BASE: 131072,
                NQ_BASE: 65536
            };
            
            const { instance } = await WebAssembly.instantiate(wasmBytes, { env });
            wasmInstance = instance;
            
            self.postMessage({ action: 'ready' });
        } catch (err) {
            self.postMessage({ action: 'error', error: err.message });
        }
    } 
    else if (data.action === 'graph_built') {
        instructionCount = data.instructionCount;
        if (!running) {
            running = true;
            runLoop();
        }
    }
    else if (data.action === 'pause') {
        running = false;
    }
};
