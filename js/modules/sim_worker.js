/**
 * WebWorker for Background Simulation Execution
 * Handles the WebAssembly execution loop off the main thread.
 */

let wasmInstance = null;
let instructionCount = 0;
let running = false;
let execDepth = 50;
let loopTimeout = null;

let memArray = null;
let lastAck = 0;
const SYNC_SLOT_REQ = 262100;
const SYNC_SLOT_ACK = 262101;

// Telemetry counters
let tickCount = 0;
let totalDuration = 0;
let lastReportTime = performance.now();

// We will use Atomics for synchronization if we want to get fancy, 
// but simply looping with a small delay allows message processing.
function runLoop() {
    loopTimeout = null;
    if (!running || !wasmInstance || instructionCount === 0 || !memArray) {
        if (running && instructionCount > 0) {
            loopTimeout = setTimeout(runLoop, 0);
        }
        return;
    }
    
    const req = Atomics.load(memArray, SYNC_SLOT_REQ);
    if (req !== lastAck) {
        const start = performance.now();
        try {
            // Execute one full logic evaluation pass
            for (let i = 0; i < execDepth; i++) {
                wasmInstance.exports.tick(instructionCount, 0);
            }
            
            // Sequential latches
            wasmInstance.exports.tick(instructionCount, 1);
            wasmInstance.exports.tick(instructionCount, 2);
        } catch (e) {
            // WASM trap (e.g. unreachable) — log and continue
            console.error('[SimWorker] Runtime trap during tick():', e.message);
        }
        const duration = performance.now() - start;

        tickCount++;
        totalDuration += duration;

        Atomics.store(memArray, SYNC_SLOT_ACK, req);
        lastAck = req;

        const now = performance.now();
        if (now - lastReportTime >= 1000) {
            const avg = totalDuration / tickCount;
            self.postMessage({
                action: 'telemetry',
                avgTickDuration: avg,
                tickCount: tickCount
            });
            tickCount = 0;
            totalDuration = 0;
            lastReportTime = now;
        }
    }

    // Yield back to the event loop so postMessage can be processed
    if (running && instructionCount > 0) {
        loopTimeout = setTimeout(runLoop, 0);
    }
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
            memArray = new Int32Array(memory.buffer);
            lastAck = Atomics.load(memArray, SYNC_SLOT_ACK);
            
            self.postMessage({ action: 'ready' });
        } catch (err) {
            self.postMessage({ action: 'error', error: err.message });
        }
    } 
    else if (data.action === 'graph_built') {
        instructionCount = data.instructionCount;
        execDepth = data.execDepth || 50;
        running = true;
        if (!loopTimeout && instructionCount > 0) {
            runLoop();
        }
    }
    else if (data.action === 'pause') {
        running = false;
        if (loopTimeout) {
            clearTimeout(loopTimeout);
            loopTimeout = null;
        }
    }
    else if (data.action === 'ping') {
        self.postMessage({ action: 'pong' });
    }
};
