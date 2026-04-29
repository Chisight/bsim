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

    // [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Injected edge-detection telemetry for auto-hiding navigation shells.
    let hoverTopTimer, hoverBotTimer;
    document.addEventListener('mousemove', (e) => {
        const topNav = document.getElementById('top-nav');
        const botNav = document.getElementById('bottom-nav');
        const topRev = document.getElementById('top-reveal');
        const botRev = document.getElementById('bottom-reveal');

        if (topNav?.classList.contains('auto-hidden')) {
            if (e.clientY < 5) {
                clearTimeout(hoverTopTimer);
                hoverTopTimer = setTimeout(() => { topNav.classList.remove('auto-hidden'); topRev.classList.remove('active'); }, 1000);
                topRev.classList.add('active');
            } else {
                clearTimeout(hoverTopTimer);
                if (e.clientY > 30) topRev.classList.remove('active');
            }
        }
        
        if (botNav?.classList.contains('auto-hidden')) {
            if (e.clientY > window.innerHeight - 5) {
                clearTimeout(hoverBotTimer);
                hoverBotTimer = setTimeout(() => { botNav.classList.remove('auto-hidden'); botRev.classList.remove('active'); }, 1000);
                botRev.classList.add('active');
            } else {
                clearTimeout(hoverBotTimer);
                if (e.clientY < window.innerHeight - 30) botRev.classList.remove('active');
            }
        }
    });
    
    document.getElementById('top-reveal')?.addEventListener('click', () => {
        document.getElementById('top-nav').classList.remove('auto-hidden');
        document.getElementById('top-reveal').classList.remove('active');
    });
    document.getElementById('bottom-reveal')?.addEventListener('click', () => {
        document.getElementById('bottom-nav').classList.remove('auto-hidden');
        document.getElementById('bottom-reveal').classList.remove('active');
    });
    document.getElementById('btn-hide-nav')?.addEventListener('click', () => {
        document.getElementById('top-nav').classList.add('auto-hidden');
    });
    document.getElementById('btn-hide-footer')?.addEventListener('click', () => {
        document.getElementById('bottom-nav').classList.add('auto-hidden');
    });

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
    // [AUDIT: v1.23.99 | SEC_ARCH_LEAD] - Semantic version increment following UI layout overhaul and workspace multi-tab implementation.
    window.LOADED_BSIM_VERSION = "1.23.99";
    console.log(`BrowserSim v${window.LOADED_BSIM_VERSION} Modular Professional Initialized.`);
    
    if (window.EXPECTED_BSIM_VERSION && window.EXPECTED_BSIM_VERSION !== window.LOADED_BSIM_VERSION) {
        console.error(`[Cache Error] HTML expects v${window.EXPECTED_BSIM_VERSION} but JS loaded v${window.LOADED_BSIM_VERSION}`);
        setTimeout(() => {
            Sim.toast(`VERSION MISMATCH: Stale cache detected. Press Ctrl+Shift+R to update.`, 'danger', 0);
        }, 1000);
    }
    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Application bootstrap sequence finalized.
};
