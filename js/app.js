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
     * @STATE: BSIM_METADATA
     * @INTENT: Define the application semantic versioning for runtime compatibility checks.
     */
    // [AUDIT: v1.24.52 | SEC_ARCH_LEAD] - Version increment for V8 tick fallback parity sync injection and Force Layout Sync utility.
    // [AUDIT: v1.24.53 | SEC_ARCH_LEAD] - Implemented WebRTC High-Fidelity capture, URL-based workspace imports, and parametric ROM memory module.
    // [AUDIT: v1.24.54 | SEC_ARCH_LEAD] - Deployed topological pseudo-class assertions to rigidly pin hierarchical menu visibility during text input focus.
    // [AUDIT: v1.24.55 | SEC_ARCH_LEAD] - Resolved scheduler deadlock suppressing CLOCK node propagation in pure WebAssembly netlists.
    // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Injected assert, step, peek, poke, reset primitives into kernel CLI.
    // [AUDIT: v1.24.57 | SEC_ARCH_LEAD] - Reclassified ROM module as a core primitive and normalized rendering palette.
    // [AUDIT: v1.24.58 | SEC_ARCH_LEAD] - Hardened ROM payload fetcher and monotonic address pin scaling enforcement.
    // [AUDIT: v1.24.59 | SEC_ARCH_LEAD] - Restored ROM pin geometry rendering and documented V8 engine memory fallback constraints.
    // [AUDIT: v1.24.60 | SEC_ARCH_LEAD] - Synthesized Wasm Kernel extensions for native memory addressing and execution parity.
    // [AUDIT: v1.24.61 | SEC_ARCH_LEAD] - Enabled right-click dynamic UI editing for ROM components to match macro behavior.
    // [AUDIT: v1.24.62 | SEC_ARCH_LEAD] - Version increment for ROM UI persistence and label customization support.
    // [AUDIT: v1.24.63 | SEC_ARCH_LEAD] - Integrated RAM 8-Bit primitive with Synchronous Write path and Wasm store8 support.
    // [AUDIT: v1.24.64 | SEC_ARCH_LEAD] - Enabled interactive icon scaling and parametric RAM R/W pin rendering.
    // [AUDIT: v1.24.66 | SEC_ARCH_LEAD] - Finalized Wasm/V8 bridge parity for RAM/ROM primitives and updated opcode dispatch.
    // [AUDIT: v1.24.67 | SEC_ARCH_LEAD] - Deprecated legacy context menu extensions for ROM chips; unified UI under Node Prefs.
    // [AUDIT: v1.24.68 | SEC_ARCH_LEAD] - Purged global contextmenu listener causing illegal menu appends under the Delete entry.
    // [AUDIT: v1.24.69 | SEC_ARCH_LEAD] - Synchronized RAM driver resolution and hardened terminal Assertions with Wasm memory probing.
    // [AUDIT: v1.24.70 | SEC_ARCH_LEAD] - Refined Assert primitive to use getDrivingSignal for input port fallbacks.
    // [AUDIT: v1.24.71 | SEC_ARCH_LEAD] - Hardened persistence layer with deep state sanitization and global context purging.
    // [AUDIT: v1.24.72 | SEC_ARCH_LEAD] - Expanded hitboxes, deterministic naming resolution, and exact wire deletion tracking.
    // [AUDIT: v1.24.73 | SEC_ARCH_LEAD] - Native RAM/ROM flattening safeguards, internal simulation evaluation, and dynamic assertions.
    // [AUDIT: v1.24.74 | SEC_ARCH_LEAD] - Repaired nested sub-menu dropdown rendering and synchronized version metadata.
    // [AUDIT: v1.24.75 | SEC_ARCH_LEAD] - Navbar sub-menu persistence locks and safe exception-handling for wire deletion parameters.
    // [AUDIT: v1.24.76 | SEC_ARCH_LEAD] - Polyfilled bounding boxes for marquee scaling and hardened serialization for memory buffers.
    // [AUDIT: v1.24.77 | SEC_ARCH_LEAD] - Atomic wire splitting via unified history stack, and paste midpoint coordinate preservation.
    // [AUDIT: v1.24.78 | SEC_ARCH_LEAD] - Algorithmic reduction of netlist resolution from O(N^2*W) to O(N+W) via map indexing and stack popping.
    // [AUDIT: v1.24.79 | SEC_ARCH_LEAD] - Polyfilled instance memory for V8 hierarchical state retention, eradicating O(N) tick penalties and enforcing engine parity.
    // [AUDIT: v1.24.80 | SEC_ARCH_LEAD] - V8 bus resolution architecture updated to match Wasm TTL logic (1 > 0 > Z) and missing memory drivers whitelisted.
    // [AUDIT: v1.24.81 | SEC_ARCH_LEAD] - Injected strict physical boundary masks for Wasm linear memory lookups to prevent OOB traps.
    // [AUDIT: v1.24.82 | SEC_ARCH_LEAD] - Synthesized native Wasm TRISTATE parity, orphaned wire cascading purges, and rigid undo heap limits.
    // [AUDIT: v1.24.83 | SEC_ARCH_LEAD] - Eradicated 24-bit pointer truncation in RAM Write-Enable packing and secured Region C memory block boundaries.
    // [AUDIT: v1.24.84 | SEC_ARCH_LEAD] - Repaired Wasm kernel parenthesis syntax error in nested opcode dispatch block.
    // [AUDIT: v1.24.85 | SEC_ARCH_LEAD] - Resolved missing closing s-expression blocks in Wasm execution cascade.
    // [AUDIT: v1.24.86 | SEC_ARCH_LEAD] - Synthesized native Wasm sequential logic (DFF/TFF) and resolved mapped array pointer corruption.
    // [AUDIT: v1.24.87 | SEC_ARCH_LEAD] - Finalized Wasm kernel AST parenthesis alignment to resolve unexpected EOF compilation trap.
    // [AUDIT: v1.24.88 | SEC_ARCH_LEAD] - Hardened Wasm operand fetch pipeline to prevent OOB traps and mitigated Region C heap collision.
    // [AUDIT: v1.24.89 | SEC_ARCH_LEAD] - Isolated NQ memory offsets for Wasm sequential components and purged redundant V8 polling loops.
    // [AUDIT: v1.24.90 | SEC_ARCH_LEAD] - Synchronized Wasm volatile memory back to Host arrays and purged JSON serialization from the simulation hot path.
    // [AUDIT: v1.24.91 | SEC_ARCH_LEAD] - Deployed Two-Phase Commit protocol in Wasm to eliminate sequential hazard race conditions and resolved V8 scheduler deadlocks.
    // [AUDIT: v1.25.01 | SEC_ARCH_LEAD] - Rolled back SharedArrayBuffer mutex to bypass Cross-Origin Isolation (COI) security faults on unconfigured servers.
    // [AUDIT: v1.25.02 | SEC_ARCH_LEAD] - Disambiguated global URL ingestion and implemented native Local File APIs for direct RAM/ROM binary payloads.
    // [AUDIT: v1.25.03 | SEC_ARCH_LEAD] - Inverted MSB/LSB visual pin rendering for memory primitives to enforce top-to-bottom spatial hierarchy.
    // [AUDIT: v1.25.04 | SEC_ARCH_LEAD] - Relegated RAM/ROM binary upload to the component context dropdown to prevent interaction overlap.
    // [AUDIT: v1.25.05 | SEC_ARCH_LEAD] - Enforced 16MB spatial bounds clamping on memory payload ingestion to prevent Wasm heap overflow attacks.
    // [AUDIT: v1.25.06 | SEC_ARCH_LEAD] - Injected debug telemetry framework for RAM/ROM payload diagnostics via terminal broadcast.
    // [AUDIT: v1.25.07 | SEC_ARCH_LEAD] - Restored Wasm DOM parity extraction and Kahn topological trace routing for Volatile Memory (RAM).
    // [AUDIT: v1.25.08 | SEC_ARCH_LEAD] - Disabled memory payload auto-scaling; implemented strict bounds clamping and HTTP Range network optimization.
    // [AUDIT: v1.25.09 | SEC_ARCH_LEAD] - Resolved Temporal Dead Zone (TDZ) initialization fault during Wasm scalar extraction.
    // [AUDIT: v1.25.10 | SEC_ARCH_LEAD] - Resolved unreachable code path in spatial coordinate extraction routine.
    window.LOADED_BSIM_VERSION = "1.25.10";

    // [AUDIT: v1.24.82 | SEC_ARCH_LEAD] - JIT Memory Interceptor: Native integration finalized in history.js and sim.js.
    
    // [AUDIT: v1.23.96 | SEC_ARCH_LEAD] - Engine Parity Check: Assert parity between V8 and Wasm execution states on boot.

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
    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Application bootstrap sequence finalized.
};
