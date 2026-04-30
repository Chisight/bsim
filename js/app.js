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
    // [AUDIT: v1.24.52 | SEC_ARCH_LEAD] - Version increment for V8 tick fallback parity sync injection and Force Layout Sync utility.
    // [AUDIT: v1.24.53 | SEC_ARCH_LEAD] - Implemented WebRTC High-Fidelity capture, URL-based workspace imports, and parametric ROM memory module.
    // [AUDIT: v1.24.54 | SEC_ARCH_LEAD] - Deployed topological pseudo-class assertions to rigidly pin hierarchical menu visibility during text input focus.
    // [AUDIT: v1.24.55 | SEC_ARCH_LEAD] - Resolved scheduler deadlock suppressing CLOCK node propagation in pure WebAssembly netlists.
    // [AUDIT: v1.24.56 | SEC_ARCH_LEAD] - Injected assert, step, peek, poke, reset primitives into kernel CLI.
    // [AUDIT: v1.24.57 | SEC_ARCH_LEAD] - Reclassified ROM module as a core primitive and normalized rendering palette.
    window.LOADED_BSIM_VERSION = "1.24.57";

    // [AUDIT: SEC_ARCH_LEAD] - JIT Patch: Dynamically extend capabilities via global scope interceptors to prevent core module desync.
    setTimeout(() => {
        if (window.ProjectManager) {
            ProjectManager.importFromUrl = async function(url) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    const data = await res.json();
                    localStorage.setItem('bsim_autosave', JSON.stringify(data));
                    location.reload();
                } catch (e) {
                    if(window.Sim) Sim.toast('URL Load Fault: ' + e.message, 'danger');
                }
            };

            ProjectManager.exportHighFidelity = async function() {
                try {
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true });
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    await video.play();
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    stream.getTracks().forEach(track => track.stop());
                    const link = document.createElement('a');
                    link.download = `bSim_HiFi_${Date.now()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                    if(window.Sim) Sim.toast('High-Fidelity framebuffer captured.', 'success');
                } catch (err) {
                    if(window.Sim) Sim.toast('Capture aborted or permission denied.', 'danger');
                }
            };
        }

        document.addEventListener('dblclick', (e) => {
            const gate = e.target.closest('.gate');
            if (!gate) return;
            const node = Sim.nodes.find(n => n.id === gate.id);
            if (node && node.type === 'ROM') {
                Sim.modal('Configure ROM Data', 'Enter URL to fetch raw binary data:', 'prompt', async (url) => {
                    if (url) {
                        node.dataUrl = url;
                        try {
                            Sim.toast('Fetching ROM data via network...', 'info');
                            const res = await fetch(url);
                            const buffer = await res.arrayBuffer();
                            const bytes = new Uint8Array(buffer);
                            node.memoryData = Array.from(bytes);
                            
                            const reqPins = Math.max(4, Math.ceil(Math.log2(bytes.length)));
                            if (reqPins > (node.addressPins || 4)) {
                                node.addressPins = reqPins;
                                Sim.toast(`Address bus scaled to ${reqPins} bits to fit payload.`, 'warning');
                                if(window.NodeRenderer) {
                                    gate.remove();
                                    NodeRenderer.renderNode(node);
                                }
                            } else {
                                Sim.toast('ROM payload flashed successfully.', 'success');
                            }
                            Sim.updateWireVisuals();
                            Sim.seedQueue();
                            Sim.processQueue();
                            Sim.autoSave();
                        } catch(err) {
                            Sim.toast('Network fault during ROM flash.', 'danger');
                        }
                    }
                }, node.dataUrl || '');
            }
        });
        
        if (window.NodeRenderer && typeof NodeRenderer.renderNode === 'function') {
            const origRender = NodeRenderer.renderNode.bind(NodeRenderer);
            NodeRenderer.renderNode = function(node) {
                if (node.type === 'ROM') {
                    const tmpType = node.type;
                    node.isCustom = true; 
                    node.meta = {
                        nodes: [
                            ...Array.from({length: node.addressPins || 4}).map((_, i) => ({ type: 'IN-1', id: `in${i}` })),
                            ...Array.from({length: 8}).map((_, i) => ({ type: 'OUT-1', id: `out${i}` }))
                        ]
                    };
                    origRender(node);
                    node.type = tmpType;
                    node.isCustom = false;
                    delete node.meta;
                    
                    const el = document.getElementById(node.id);
                    if (el) {
                        const lbl = el.querySelector('.gate-label');
                        if (lbl) {
                            lbl.innerText = 'ROM (' + (node.addressPins || 4) + 'x8)';
                            // [AUDIT: v1.24.57 | SEC_ARCH_LEAD] - Applied primitive typography classification to ROM label.
                            lbl.style.color = '#fff';
                        }
                        el.style.backgroundColor = '#2c1e4a';
                    }
                    return;
                }
                return origRender(node);
            }
        }
    }, 500);

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
