/**
 * App Main Module
 */
/**
 * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for main application bootstrap.
 * @ARCH: APP_INITIALIZER
 * @INTENT: Initialize the simulator, UI components, and global event listeners on window load.
 */
window.onload = () => {
    // Inject marquee div if missing
    if (!document.getElementById('selection-marquee')) {
        const mq = document.createElement('div');
        mq.id = 'selection-marquee';
        document.getElementById('workspace').appendChild(mq);
    }

    Sim.init();
    if (window.DebugTerminal) DebugTerminal.init();
    InteractionHandler.initMarquee();
    InteractionHandler.initClipboardListeners();
    
    // Wire Preview Mouse Tracking
    window.addEventListener('mousemove', (e) => {
        if (Sim.wiring.active) {
            Sim.wiring.mouseX = e.clientX;
            Sim.wiring.mouseY = e.clientY;
            // Only redraw if we are actively wiring to save CPU cycles
            WireRenderer.drawWires();
        }
    });
    
    // Global Error Handling
    window.onerror = (msg, url, line) => {
        console.error(`[ModularSim Error] ${msg} at ${url}:${line}`);
    };

    // [AUDIT: SEC_ARCH_LEAD] - Global keyboard shortcut bindings for state history traversal.
    window.addEventListener('keydown', (e) => {
        // Prevent interfering with modal inputs or text fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.ctrlKey || e.metaKey) {
            if (e.key.toLowerCase() === 'z') {
                if (e.shiftKey) History.redo();
                else History.undo();
                e.preventDefault();
            } else if (e.key.toLowerCase() === 'y') {
                History.redo();
                e.preventDefault();
            }
        }
    });
    
    /**
     * @STATE: BSIM_METADATA
     * @INTENT: Define the application semantic versioning for runtime compatibility checks.
     */
    // [AUDIT: SEC_ARCH_LEAD] - Semantic version increment following mathematical clamp reinforcement on node edit states.
    window.LOADED_BSIM_VERSION = "1.23.90";
    console.log(`BrowserSim v${window.LOADED_BSIM_VERSION} Modular Professional Initialized.`);
    
    if (window.EXPECTED_BSIM_VERSION && window.EXPECTED_BSIM_VERSION !== window.LOADED_BSIM_VERSION) {
        console.error(`[Cache Error] HTML expects v${window.EXPECTED_BSIM_VERSION} but JS loaded v${window.LOADED_BSIM_VERSION}`);
        setTimeout(() => {
            Sim.toast(`VERSION MISMATCH: Stale cache detected. Press Ctrl+Shift+R to update.`, 'danger', 0);
        }, 1000);
    }
    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Application bootstrap sequence finalized.
};
