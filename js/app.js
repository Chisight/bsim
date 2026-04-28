/**
 * App Main Module
 */
window.onload = () => {
    // Inject marquee div if missing
    if (!document.getElementById('selection-marquee')) {
        const mq = document.createElement('div');
        mq.id = 'selection-marquee';
        document.getElementById('workspace').appendChild(mq);
    }

    Sim.init();
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
    
    window.LOADED_BSIM_VERSION = "1.23.56";
    console.log(`BrowserSim v${window.LOADED_BSIM_VERSION} Modular Professional Initialized.`);
    
    if (window.EXPECTED_BSIM_VERSION && window.EXPECTED_BSIM_VERSION !== window.LOADED_BSIM_VERSION) {
        console.error(`[Cache Error] HTML expects v${window.EXPECTED_BSIM_VERSION} but JS loaded v${window.LOADED_BSIM_VERSION}`);
        setTimeout(() => {
            Sim.toast(`VERSION MISMATCH: Stale cache detected. Press Ctrl+Shift+R to update.`, 'danger', 0);
        }, 1000);
    }
};
