# Exit Trace Audit Log (v1.23.65)

This document maps every logical exit point and function boundary instrumented with high-density `EXIT_TRACE` markers to isolate signal anomalies.

## 1. Simulation Kernel (`js/sim.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `init` | 125 | Simulation kernel initialization complete. |
| `autoSave` | 224 | AutoSave deferred (active editing chip detected). |
| `autoSave` | 255 | AutoSave operation finalized. |
| `calculateNextState` | 448 | State calculated for node. |
| `processQueue` | 459 | Early exit, simulation queue empty. |
| `processQueue` | 628 | Wasm-accelerated simulation tick complete. |
| `processQueue` | 715 | V8-based simulation tick complete. |
| `getDrivingSignal` | 1339 | Driver resolution complete (Floating). |
| `seedQueue` | 1349 | Queue seeded for full propagation sweep. |
| `uiExitChipEdit` | 2022 | Workspace exit and return to parent. |

## 2. WebAssembly Bridge (`js/modules/wasm_bridge.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `init` | 47 | WASM kernel successfully linked. |
| `syncLayout` | 124 | Netlist expansion and address mapping finalized. |
| `readPinState` | 249 | Signal bit-index resolved from linear memory. |
| `executeTick` | 543 | Wasm cycle finalized. |
| `getSpecificIdx` | 694 | Local bit-index resolved from node-relative offset. |
| `exportMemoryMap` | 741 | Memory map exported to console. |

## 3. Analysis Engine (`js/modules/analyzer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `flattenHierarchy` | 108 | Macro recursion finalized. |
| `generateTruthTable` | 197 | Truth table generation finalized. |

## 4. UI Interaction (`js/modules/interaction.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `injectSignal` | 132 | Signal injection sequence finalized. |
| `handleNodeDrag` | 617 | UI coordinate synchronization finalized. |

## 5. Persistence Layer (`js/modules/persistence.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `MigrationEngine.parseVer` | 16 | Version parsed successfully. |
| `MigrationEngine.migrate` | 95 | Migration complete. |
| `exportProject` | 234 | Project serialization complete. |
| `importProject` | 271 | Import process initiated. |

## 6. Synthesis UI (`js/modules/synth_ui.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `open` | 14 | Synthesis UI opened. |
| `resetTable` | 50 | Truth table state reinitialized. |
| `build` | 154 | Dispatched logic data for synthesis. |

## 7. Rendering Pipeline (`js/modules/node_renderer.js` & `js/modules/wire_renderer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `NodeRenderer.renderNode` | 141 | Node rendered and appended to DOM. |
| `WireRenderer.drawWires` | 87 | SVG wire layer update complete. |

## 8. Logic Synthesis Engine (`js/synthesizer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `generateSignatureMap` | 46 | Signature map generated. |
| `synthesize` | 416 | Logic synthesis finalized and simulation queue re-seeded. |

## 9. App Orchestration & Viewport (`js/app.js`, `js/view.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `window.onload` | 49 | Application bootstrap sequence finalized. |
| `View.init` | 70 | Viewport event listeners operational. |
| `View.apply` | 85 | Viewport transformation applied to DOM/SVG. |

## 10. Interactive Tutorial System (`js/modules/tutorial.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `makeDraggable` | 37 | Tutorial panel made draggable. |
| `showMenu` | 111 | Tutorial selection menu displayed. |
| `start` | 120 | Tutorial session initialized. |
| `quit` | 129 | Tutorial session terminated and panel hidden. |
| `render` | 140 | Tutorial completion view rendered. |
| `render` | 157 | Tutorial step rendered. |
| `checkProgress` | 173 | Tutorial progress check finalized. |

---
**Audit Status**: VERIFIED
**Compliance**: MRAP_V1_EXIT_PATH Strict Adherence.
