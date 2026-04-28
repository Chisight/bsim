# MRAP Architectural Audit Log (v1.23.63)

This document details the Modular Runtime Architectural Protocol (MRAP) taxonomy injection across the BrowserSim codebase. Every functional block has been tagged to enforce Zero Trust boundaries, traceability, and deterministic operation.

## Global Taxonomy (MRAP_V1)
- **@ARCH**: Architectural Domain (Kernel, UI, Rendering, etc.)
- **@STATE**: State Management Category
- **@IO**: Input/Output Boundary
- **@CONSTRAINT**: Operational Limits or Algorithms
- **@INTENT**: Deterministic Operational Boundary Description

---

## 1. Simulator Kernel (`js/sim.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L897 | `@ARCH: KERNEL_ORCHESTRATOR`, `@STATE: SIM_GLOBAL_CONTEXT` | Global singleton management for simulation state, library, and netlist. |
| L915 | `@IO: WORKSPACE_INITIALIZATION` | Setup global event listeners and DOM state for the simulation session. |
| L935 | `@ARCH: NETLIST_FACTORY` | Primary factory for instantiating logic gates and mapping them to the workspace. |
| L1035 | `@ARCH: SIGNAL_RESOLVER` | Calculate and propagate logical signals through the netlist graph. |
| L1080 | `@ARCH: SCHEDULER`, `@CONSTRAINT: TIME_STEP_QUANTIZATION` | Manage the discrete time steps and processing queue for the simulation engine. |
| L1150 | `@ARCH: COMMAND_DISPATCHER` | Central entry point for high-level UI commands affecting workspace state. |

## 2. WebAssembly Bridge (`js/modules/wasm_bridge.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L13 | `@ARCH: KERNEL_LOADER`, `@IO: WASM_FETCH` | Asynchronously initialize the WASM execution environment. |
| L44 | `@ARCH: NETLIST_EXPANDER`, `@CONSTRAINT: RECURSIVE_RESOLUTION` | Recursively expand hierarchical macros into primitive gates. |
| L127 | `@ARCH: MEMORY_INITIALIZER`, `@STATE: LINEAR_ALLOCATION` | Synchronize JS object graph with WASM linear memory. |
| L189 | `@ARCH: SIGNAL_RESOLVER`, `@STATE: DRIVER_GRAPH` | Deep-search netlist for logical drivers. |
| L490 | `@IO: KERNEL_STEP`, `@CONSTRAINT: DETERMINISTIC_TICK` | Trigger a single simulation cycle in WASM. |
| L500 | `@STATE: MEMORY_UPDATE`, `@IO: HOST_TO_WASM` | Write external signal values into WASM memory. |
| L559 | `@IO: SIGNAL_PROBE`, `@ARCH: HIERARCHY_PROBE` | Probe pin state through hierarchical proxy nodes. |

## 3. Analysis & Logic minimization (`js/modules/analyzer.js`, `js/synthesizer.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L40 | `@ARCH: LOGIC_ANALYZER`, `@CONSTRAINT: EXHAUSTIVE_SEARCH` | Generate exhaustive truth tables for complex macro blocks. |
| L155 | `@ARCH: TRUTH_TABLE_GENERATOR` | Extract Boolean logic representation from active netlists. |
| L80 | `@ARCH: LOGIC_SYNTHESIZER`, `@CONSTRAINT: QUINE_MCCLUSKEY` | Primary logic synthesis engine using Quine-McCluskey minimization. |

## 4. UI & Interaction Layer (`js/modules/interaction.js`, `js/view.js`, `js/modules/synth_ui.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L10 | `@ARCH: INTERACTION_HANDLER`, `@IO: MOUSE_INPUT` | Centralize mouse and keyboard interaction events for workspace manipulation. |
| L100 | `@ARCH: COMMAND_PATTERN`, `@STATE: UNDO_REDO_STACK` | Execute netlist mutations with transactional integrity. |
| L13 | `@ARCH: VIEWPORT_INITIALIZATION`, `@IO: MOUSE_EVENT_LISTENERS` | Initialize workspace panning and zooming. |
| L74 | `@IO: CSS_TRANSFORM_SYNC`, `@STATE: VIEWPORT_MATRIX` | Synchronize rendering layers with transformation matrix. |
| L20 | `@ARCH: SYNTHESIS_UI_CONTROLLER` | Manage state and validation for the logic synthesis modal. |

## 5. Rendering Pipeline (`js/modules/node_renderer.js`, `js/modules/wire_renderer.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L7 | `@ARCH: UI_RENDERING`, `@IO: DOM_FACTORY` | Dynamically generate and inject DOM representation for logic nodes. |
| L17 | `@ARCH: UI_RENDERING`, `@IO: SVG_LAYER_MUTATION` | Redraw the entire SVG wire layer based on netlist connectivity. |
| L90 | `@ARCH: RENDERING_POST_PROCESS`, `@CONSTRAINT: GEOMETRIC_INTERSECTION` | Identify wire crossings and inject visual masks (jumps). |
| L156 | `@ARCH: ROUTING_ALGORITHM`, `@CONSTRAINT: MANHATTAN_STEER` | Calculate optimal orthogonal paths (Manhattan routing). |

## 6. Wasm Core (`wasm-core/src/engine.wat`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L19 | `@ARCH: ATOMIC_PRIMITIVE`, `@CONSTRAINT: TRUTH_TABLE` | Define fundamental NAND operation. |
| L51 | `@ARCH: CORE_KERNEL`, `@CONSTRAINT: LINEAR_EXECUTION` | Main execution loop for redrawing logical state. |

## 7. Design System (`css/style.css`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L2 | `@ARCH: DESIGN_SYSTEM`, `@STATE: CSS_VARIABLES` | Define global design tokens and color palettes. |
| L84 | `@ARCH: COMPONENT_STYLE`, `@IO: VISUAL_REPRESENTATION` | Define visual structure for logic gate nodes. |

---
**Audit Status**: COMPLETED
**Parity Verification**: v1.23.63 Standard Met.
**Security Authorization**: SEC_ARCH_LEAD Approved.
