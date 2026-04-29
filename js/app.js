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
    document.getElementById('workspace').addEventListener('contextmenu', (e) => {
        if (Sim.activeEditingChip) {
            let menu = document.getElementById('context-menu');
            if (!menu) return;
            
            setTimeout(() => {
                if (!menu.innerHTML.includes('Split Editor')) {
                    menu.innerHTML += `
                        <div class="menu-item has-sub" style="color:#ffca28; font-weight:bold; border-top:1px solid #334; margin-top:5px; padding-top:5px;">
                            Split Editor
                            <div class="sub-menu">
                                <div class="menu-item" onclick="Sim.uiSplitEditor('left'); document.getElementById('context-menu').style.display='none';">Left</div>
                                <div class="menu-item" onclick="Sim.uiSplitEditor('right'); document.getElementById('context-menu').style.display='none';">Right</div>
                                <div class="menu-item" onclick="Sim.uiSplitEditor('popup'); document.getElementById('context-menu').style.display='none';">Popup</div>
                            </div>
                        </div>
                    `;
                    // [AUDIT: v1.24.12 | SEC_ARCH_LEAD] - Re-evaluate bounds after async split-editor item injection.
                    const rect = menu.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
                        menu.classList.add('open-left');
                    }
                    if (rect.bottom > window.innerHeight) {
                        menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
                        menu.classList.add('open-up');
                    }
                }
            }, 10);
        }
    });

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
    // [AUDIT: v1.24.27 | SEC_ARCH_LEAD] - Version increment for label geometry constraints and text scaling.
    window.LOADED_BSIM_VERSION = "1.24.27";
    console.log(`BrowserSim v${window.LOADED_BSIM_VERSION} Modular Professional Initialized.`);
    
    if (window.EXPECTED_BSIM_VERSION && window.EXPECTED_BSIM_VERSION !== window.LOADED_BSIM_VERSION) {
        console.error(`[Cache Error] HTML expects v${window.EXPECTED_BSIM_VERSION} but JS loaded v${window.LOADED_BSIM_VERSION}`);
        setTimeout(() => {
            Sim.toast(`VERSION MISMATCH: Stale cache detected. Press Ctrl+Shift+R to update.`, 'danger', 0);
        }, 1000);
    }
    // [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - EXIT_TRACE: Application bootstrap sequence finalized.
};
