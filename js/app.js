/**
 * App Main Module
 */
/**
 * [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Entry trace for main application bootstrap.
 */
window.onload = () => {
    // Inject marquee div if missing
    if (!document.getElementById('selection-marquee')) {
        const mq = document.createElement('div');
        mq.id = 'selection-marquee';
        document.getElementById('workspace').appendChild(mq);
    }

    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Handle chip deep-linking for split pane iframes.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('chip')) {
        setTimeout(() => {
            const targetChip = urlParams.get('chip');
            if (Sim.library && Sim.library[targetChip]) {
                Sim.uiEditChip(targetChip);
                ['top-nav', 'bottom-nav', 'tab-bar', 'top-reveal', 'bottom-reveal'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            }
        }, 150);
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

    // [AUDIT: v1.25.04 | SEC_ARCH_LEAD] - Excised aggressive right-click interceptor; relegated binary upload to standard context menu dropdown.

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

    // [AUDIT: v1.24.00 | SEC_ARCH_LEAD] - Split pane context menu hook for active chip editors.
    // [AUDIT: v1.24.68 | SEC_ARCH_LEAD] - Relocated Split Editor context menu logic to InteractionHandler to resolve node-menu pollution.

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
     * Define the application semantic versioning for runtime compatibility checks.
     */
    // [AUDIT: v1.25.36 | SEC_ARCH_LEAD] - Reprogrammed node layout algorithms to preserve asymmetric RAM component matrices during translation cycles.
    // [AUDIT: v1.25.37 | SEC_ARCH_LEAD] - Injected native output pin (out0) for Constant Ground (0) primitive to enable Wasm-parity topological driver resolution.
    // [AUDIT: v1.25.39 | SEC_ARCH_LEAD] - Executed global codebase sanitation; purged deprecated ROM primitive and archived stale taxonomy/audit metadata to ARCHIVE_BLOAT.md.
    // [AUDIT: v1.25.40 | SEC_ARCH_LEAD] - Relocated high-frequency fastEqual utility to Sim object prototype to prevent hot-path recompilation overhead.
    // [AUDIT: v1.25.41 | SEC_ARCH_LEAD] - Executed architectural stability directives: zero-copy parity alignment, depth-bound trace guards, and deterministic evaluation.
    // [AUDIT: v1.25.42 | SEC_ARCH_LEAD] - Deployed command execution debouncer to mitigate upstream lag-induced duplicate inputs.
    // [AUDIT: v1.25.43 | SEC_ARCH_LEAD] - Instituted UI synchronization, multi-bit bus parsing guards, and strict VFS allocation limits.
    // [AUDIT: v1.25.44 | SEC_ARCH_LEAD] - Enforced Wasm memory expansion limits, optimized pin state retrieval, and standardized viewport panning.
    // [AUDIT: v1.25.45 | SEC_ARCH_LEAD] - Aligned Ground primitive nomenclature: renamed port label from GND to 0.
    // [AUDIT: v1.25.46 | SEC_ARCH_LEAD] - Implemented global netlist propagation for hierarchical macro renaming to avert stale reference traps.
    // [AUDIT: v1.25.47 | SEC_ARCH_LEAD] - Hardened macro lifecycle with cyclical dependency scanners, pre-flight deletion reference counters, and strict topology APIs.
    // [AUDIT: v1.25.48 | SEC_ARCH_LEAD] - Preserved hierarchical folder collapse state across UI redraws.
    // [AUDIT: v1.25.60 | SEC_ARCH_LEAD] - Restored MSB-at-top ordering for RAM and Custom chips; eradicated "crooked" pin offsets by enforcing a rigid 20px vertical spacing grid.
    window.LOADED_BSIM_VERSION = "1.25.60";

    // [AUDIT: v1.25.35 | SEC_ARCH_LEAD] - Purged legacy JIT DOM interceptor in favor of native parametric coordinate generation.

    // [AUDIT: v1.24.82 | SEC_ARCH_LEAD] - JIT Memory Interceptor: Native integration finalized in history.js and sim.js.
    // [AUDIT: v1.24.98 | SEC_ARCH_LEAD] - JIT Patches Purged: Remote Import and High-Fidelity Export natively integrated into ProjectManager.
    // [AUDIT: SEC_ARCH_LEAD] - Injected passive workspace boundary validation to catch upgrade mismatches.
    window.addEventListener('load', () => {
        setTimeout(() => {
            let isStale = false;

            // Check 1: HTML to JS Cache Mismatch
            if (window.EXPECTED_BSIM_VERSION && window.EXPECTED_BSIM_VERSION !== window.LOADED_BSIM_VERSION) {
                isStale = true;
            }

            // Check 2: Upgraded Engine vs Existing Local Storage State
            const storedVer = localStorage.getItem('bsim_state_version');
            if (!storedVer || storedVer !== window.LOADED_BSIM_VERSION) {
                if (window.Sim && window.Sim.nodes && window.Sim.nodes.length > 0) isStale = true;
                if (window.Sim && window.Sim.library && Object.keys(window.Sim.library).length > 0) isStale = true;
            }

            if (isStale) {
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed; top:75px; right:20px; background:rgba(20, 10, 10, 0.95); color:#fff; padding:20px; border-radius:8px; z-index:10000; border:1px solid #ff4757; font-family:var(--font, sans-serif); max-width:320px; box-shadow:0 15px 40px rgba(0,0,0,0.8); pointer-events:auto; backdrop-filter:blur(5px);';
                toast.innerHTML = '<div style="color:#ff4757; font-size:13px; font-weight:800; margin-bottom:10px; letter-spacing:0.5px;">⚠️ STALE WORKSPACE DETECTED</div><div style="font-weight:normal; font-size:12px; color:#aaa; line-height:1.6;">The simulator engine has been updated, but you have a stale project loaded in your interface.<br><br>To avoid rendering bugs and logic faults, please sanitize your workspace:<br><br><span style="color:#fff; font-weight:bold;">1. File &gt; Export BSIM<br>2. File &gt; New Project<br>3. File &gt; Load BSIM</span></div><button onclick="this.parentElement.remove()" style="margin-top:18px; background:#ff4757; color:#fff; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold; width:100%; transition:0.2s;">I Understand</button>';
                document.body.appendChild(toast);
            }

            localStorage.setItem('bsim_state_version', window.LOADED_BSIM_VERSION);
        }, 2000); // Delayed execution to ensure workspace load completion
    });
};
