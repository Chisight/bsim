# Integrated MRAP Architectural Registry (v1.23.78)

This registry serves as the definitive source-of-truth for all hardening efforts, combining MRAP taxonomy and high-density exit-path tracing.

## Core Directives
1. **Zero Trust Integration**: All modules must be instrumented with `@ARCH`, `@STATE`, `@IO`, and `@CONSTRAINT` tags.
2. **Deterministic Observability**: Every function boundary must include an `EXIT_TRACE` marker.
3. **Wasm/V8 Parity**: Telemetry must explicitly track state transitions between JS objects and the Wasm linear memory.

---

## 1. Simulation Engine (`js/sim.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `Sim.init` | `@ARCH:KERNEL_ORCHESTRATOR`, `@IO:WORKSPACE_INIT` | `[AUDIT: v1.23.78] - EXIT_TRACE: Simulation kernel initialization complete.` |
| `Sim.processQueue` | `@ARCH:SCHEDULER`, `@CONSTRAINT:TIME_STEP_QUANT` | `[AUDIT: v1.23.78] - EXIT_TRACE: Simulation tick complete.` |
| `Sim.calculateNextState` | `@ARCH:SIGNAL_RESOLVER`, `@STATE:NODE_UPDATE` | `[AUDIT: v1.23.78] - EXIT_TRACE: State calculated for node.` |
| `Sim.runWasmParityCheck` | `@ARCH:DIAGNOSTIC_ORCHESTRATOR`, `@CONSTRAINT:ENGINE_PARITY` | `[AUDIT: v1.23.78] - EXIT_TRACE: Parity diagnostics suite finalized.` |
| `Sim.addNode` | `@ARCH:NETLIST_FACTORY`, `@IO:UI_MUTATION` | `[AUDIT: v1.23.78] - EXIT_TRACE: Node added to workspace.` |
| `Sim.updateNodeVisual` | `@ARCH:RENDERING_DISPATCHER`, `@STATE:NODE_VISUAL_STATE` | `[AUDIT: v1.23.78] - EXIT_TRACE: Node visual state synchronized.` |
| `Sim.getDrivingSignal` | `@ARCH:SIGNAL_RESOLVER`, `@STATE:NETLIST_TRAVERSAL` | `[AUDIT: v1.23.78] - EXIT_TRACE: Driver resolution complete (Floating).` |
| `Sim.autoSave` | `@ARCH:PERSISTENCE_MANAGER`, `@STATE:WORKSPACE_SERIAL` | `[AUDIT: v1.23.78] - EXIT_TRACE: AutoSave operation finalized.` |

## 2. Synchronization Bridge (`js/modules/wasm_bridge.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `WasmEngine.init` | `@ARCH:KERNEL_LOADER`, `@IO:WASM_FETCH` | `[AUDIT: v1.23.78] - EXIT_TRACE: Wasm kernel initialization lifecycle termination.` |
| `WasmEngine.syncLayout` | `@ARCH:NETLIST_EXPANDER`, `@STATE:LINEAR_ALLOC` | `[AUDIT: v1.23.78] - EXIT_TRACE: syncLayout finalized with instructions.` |
| `WasmEngine.readPinState` | `@ARCH:SYNC_BRIDGE`, `@IO:WASM_TO_HOST` | `[AUDIT: v1.23.78] - EXIT_TRACE: SYNC_BRIDGE pin probe success.` |
| `WasmEngine.exportMemoryMap` | `@ARCH:DIAGNOSTIC_TOOL`, `@IO:CONSOLE_EXPORT` | `[AUDIT: v1.23.78] - EXIT_TRACE: Memory map exported to console.` |

## 3. Storage & Migration (`js/modules/persistence.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `MigrationEngine.migrate` | `@ARCH:MIGRATION_ENGINE`, `@CONSTRAINT:SCHEMA_PARITY` | `[AUDIT: v1.23.78] - EXIT_TRACE: Migration complete.` |
| `ProjectManager.parseVer` | `@ARCH:VERSION_PARSER`, `@CONSTRAINT:SEMANTIC_VERSIONING` | `[AUDIT: v1.23.78] - EXIT_TRACE: Version parsed successfully.` |

## 4. UI & Logic Synthesis (`js/modules/synth_ui.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `SynthUI.open` | `@ARCH:SYNTHESIS_UI`, `@IO:UI_MODAL` | `[AUDIT: v1.23.78] - EXIT_TRACE: Synthesis UI opened and table reset.` |
| `SynthUI.build` | `@ARCH:SYNTHESIS_DISPATCHER`, `@STATE:LOGIC_DATA` | `[AUDIT: v1.23.78] - EXIT_TRACE: Dispatched logic data for synthesis.` |

## 5. Rendering Pipeline (`js/modules/node_renderer.js`, `js/modules/wire_renderer.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `NodeRenderer.renderNode` | `@ARCH:UI_RENDERING`, `@IO:DOM_FACTORY` | `[AUDIT: v1.23.78] - EXIT_TRACE: Node rendered and appended to DOM.` |
| `WireRenderer.drawWires` | `@ARCH:UI_RENDERING`, `@IO:SVG_MUTATION` | `[AUDIT: v1.23.78] - EXIT_TRACE: SVG wire layer update complete.` |

## 6. Logic Synthesis Engine (`js/synthesizer.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `LogicSynthesizer.generateSignatureMap` | `@ARCH:SYNTHESIS_ANALYZER`, `@STATE:LIBRARY_SIGNATURES` | `[AUDIT: v1.23.78] - EXIT_TRACE: Signature map generated.` |
| `LogicSynthesizer.synthesize` | `@ARCH:LOGIC_SYNTHESIZER`, `@CONSTRAINT:QUINE_MCCLUSKEY` | `[AUDIT: v1.23.78] - EXIT_TRACE: Logic synthesis finalized.` |

## 7. App Orchestration & Viewport (`js/app.js`, `js/view.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `window.onload` | `@ARCH:APP_INITIALIZER`, `@INTENT:INITIALIZE_SIM` | `[AUDIT: v1.23.78] - EXIT_TRACE: Application bootstrap sequence finalized.` |
| `View.init` | `@ARCH:VIEWPORT_INITIALIZATION`, `@IO:MOUSE_EVENT_LISTENERS` | `[AUDIT: v1.23.78] - EXIT_TRACE: Viewport event listeners operational.` |
| `View.apply` | `@IO:CSS_TRANSFORM_SYNC`, `@STATE:VIEWPORT_MATRIX` | `[AUDIT: v1.23.78] - EXIT_TRACE: Viewport transformation applied to DOM/SVG.` |

## 8. Interactive Tutorial System (`js/modules/tutorial.js`)
| Module | MRAP Domains | Audit Trace |
| :--- | :--- | :--- |
| `TutorialEngine.showMenu` | `@ARCH:TUTORIAL_DISPATCHER`, `@IO:UI_MODAL` | `[AUDIT: v1.23.78] - EXIT_TRACE: Tutorial selection menu displayed.` |
| `TutorialEngine.start` | `@STATE:TUTORIAL_SESSION` | `[AUDIT: v1.23.78] - EXIT_TRACE: Tutorial session initialized.` |
| `TutorialEngine.render` | `@IO:UI_RENDERING` | `[AUDIT: v1.23.78] - EXIT_TRACE: Tutorial step rendered.` |
| `TutorialEngine.checkProgress` | `@ARCH:TUTORIAL_VALIDATOR`, `@CONSTRAINT:STEP_VALIDATION` | `[AUDIT: v1.23.78] - EXIT_TRACE: Tutorial progress check finalized.` |

---
**Build Version**: 1.23.78
**Hardening Protocol**: MRAP_V1 + TRACEABILITY_V1
**Security Status**: SEC_ARCH_LEAD Authorized (Fault Resolution)
