# Exit Trace Audit Log (v1.23.66)

This document maps every logical exit point and function boundary instrumented with high-density `EXIT_TRACE` markers to isolate signal anomalies.

## 1. Simulation Kernel (`js/sim.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `calculateNextState` | 470 | State calculated for node. |
| `processQueue` | 733 | Early exit, simulation queue empty. |
| `processQueue` | 749 | Wasm-accelerated simulation tick complete. |
| `processQueue` | 896 | V8-based simulation tick complete. |
| `addNode` | 911 | Node added to workspace. |
| `updateNodeVisual` | 1030 | Node visual state synchronized. |
| `getDrivingSignal` | 1211 | Driver resolution complete (Floating). |
| `seedQueue` | 1257 | Queue seeded for full propagation sweep. |
| `autoSave` | 1397 | AutoSave operation finalized. |

## 2. WebAssembly Bridge (`js/modules/wasm_bridge.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `init` | 42 | Wasm kernel initialization lifecycle termination. |
| `_flattenNetlist` | 127 | Returning flattened object graph with prefix context. |
| `syncLayout` | 139 | syncLayout aborted, engine not ready. |
| `resolveAllDriverIndices` | 258 | Returning drivers for node:port. |
| `buildBusTree` | 275 | Bus resolution tree built. |
| `executeTick` | 510 | Early exit, Wasm engine not ready. |
| `executeTick` | 514 | Wasm tick executed successfully. |
| `writeState` | 537 | Node state written to Wasm memory. |
| `readWireState` | 546 | Wire state read failure. |
| `readWireState` | 549 | Wire state read success. |
| `getSpecificIdx` | 561 | Mapping failure for node:port. |
| `getSpecificIdx` | 577 | Linear mapping for node:port. |
| `readState` | 590 | Read failure for node. |
| `readState` | 598 | Scalar read success for node. |
| `readPinState` | 611 | Pin probe failure (system offline). |
| `readPinState` | 709 | Unconnected sterile pin detected. |
| `readPinState` | 717 | Pin probe failed (resolution failed). |
| `readPinState` | 721 | SYNC_BRIDGE pin probe success. |
| `exportMemoryMap` | 749 | Memory map exported to console. |

## 3. Analysis Engine (`js/modules/analyzer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `generateTruthTable` | 19 | Truth table generation aborted (missing IO). |
| `generateTruthTable` | 114 | Truth table generation complete. |
| `estimateBOM` | 163 | BOM estimation complete. |
| `flattenHierarchy` | 179 | Leaf node reached during flattening. |
| `flattenHierarchy` | 187 | Macro flattening complete. |
| `mapPorts` | 212 | Port mapping complete for macro. |

## 4. UI Interaction (`js/modules/interaction.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `onNodeMouseDown` | 15 | Drag aborted, port interaction detected. |
| `onNodeContextMenu` | 23 | Context menu aborted, DOM target missing. |
| `onNodeContextMenu` | 40 | Context menu displayed for node. |
| `MoveCommand.execute` | 107 | Node translation finalized. |

## 5. Persistence Layer (`js/modules/persistence.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `MigrationEngine.parseVer` | 14 | Early exit, version string empty. |
| `MigrationEngine.parseVer` | 19 | Early exit, version format invalid. |
| `MigrationEngine.migrate` | 32 | Migration aborted, data payload null. |

## 6. Synthesis UI (`js/modules/synth_ui.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `open` | 36 | Synthesis UI opened and table reset. |
| `resetTable` | 52 | Truth table state reinitialized. |
| `foldLogic` | 95 | Logic folding pass complete. |
| `build` | 157 | Dispatched logic data for synthesis. |

## 7. Rendering Pipeline (`js/modules/node_renderer.js` & `js/modules/wire_renderer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `NodeRenderer.renderNode` | 142 | Node rendered and appended to DOM. |
| `WireRenderer.drawWires` | 25 | Wire redraw aborted, SVG layer missing. |
| `WireRenderer.drawWires` | 91 | SVG wire layer update complete. |

## 8. Logic Synthesis Engine (`js/synthesizer.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `generateSignatureMap` | 47 | Signature map generated. |
| `synthesizeToChip` | 61 | Synthesis orchestration finalized. |
| `synthesize` | 425 | Logic synthesis finalized. |

## 9. App Orchestration & Viewport (`js/app.js`, `js/view.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `window.onload` | 51 | Application bootstrap sequence finalized. |
| `History.execute` | 16 | History execute sequence finalized. |
| `History.undo` | 32 | History undo sequence finalized. |
| `History.redo` | 46 | History redo sequence finalized. |
| `View.init` | 71 | Viewport event listeners operational. |
| `View.apply` | 88 | Viewport transformation applied to DOM/SVG. |

## 10. Interactive Tutorial System (`js/modules/tutorial.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `makeDraggable` | 37 | Tutorial panel made draggable. |
| `showMenu` | 113 | Tutorial selection menu displayed. |
| `start` | 124 | Tutorial session initialized. |
| `quit` | 135 | Tutorial session terminated and panel hidden. |
| `render` | 148 | Tutorial completion view rendered. |
| `render` | 166 | Tutorial step rendered. |
| `checkProgress` | 184 | Tutorial progress check finalized. |

## 11. Debug Terminal (`js/modules/debug_terminal.js`)
| Function | Line | Intent |
| :--- | :--- | :--- |
| `execute` | 262 | Command execution finalized. |
| `synthesize` | 276 | Synthesis aborted, no recipe. |
| `synthesize` | 301 | Synthesis process finalized. |

---
**Audit Status**: VERIFIED
**Compliance**: MRAP_V1_EXIT_PATH Strict Adherence.
