/**
 * [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Worker-side orchestration for asynchronous kernel execution.
 * @ARCH: ASYNC_KERNEL
 * @INTENT: Offload Wasm simulation ticks to a high-priority worker thread using SharedArrayBuffer.
 */
self.onmessage = async (e) => {
    const { action, wasmBuffer, memory, instructionCount, evalSeq } = e.data;
    
    if (action === 'init') {
        try {
            // [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - SharedArrayBuffer allows the UI thread to read memory without copying.
            const { instance } = await WebAssembly.instantiate(wasmBuffer, { 
                env: { 
                    memory: memory 
                } 
            });
            self.instance = instance;
            self.postMessage({ action: 'ready' });
        } catch (err) {
            self.postMessage({ action: 'error', error: err.message });
        }
    } else if (action === 'tick') {
        if (!self.instance) return;
        
        // Execute the Three-Phase Commit protocol off the main thread
        // [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Native execution boundary.
        self.instance.exports.tick(instructionCount, evalSeq);
        self.postMessage({ action: 'tick_done' });
    }
};
