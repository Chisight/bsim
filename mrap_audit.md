# MRAP Architectural Audit Log (v1.23.76)

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
| L37 | `@ARCH: KERNEL_ORCHESTRATOR`, `@IO: WORKSPACE_INITIALIZATION` | Entry trace for simulation kernel bootstrap and global event listeners. |
| L220 | `@ARCH: PERSISTENCE_MANAGER`, `@STATE: WORKSPACE_SERIAL` | Periodically synchronize current workspace state to local storage. |
| L381 | `@ARCH: SIGNAL_RESOLVER`, `@STATE: NODE_UPDATE` | Evaluate logical transfer functions and propagate signals through the netlist. |
| L467 | `@ARCH: SCHEDULER`, `@CONSTRAINT: TIME_STEP_QUANTIZATION` | Orchestrate main simulation loop, delegating to Wasm for native logic blocks. |
| L775 | `@ARCH: DIAGNOSTIC_ORCHESTRATOR`, `@CONSTRAINT: ENGINE_PARITY` | Stress-test comparison between V8 and Wasm kernels to ensure state parity. |

## 2. WebAssembly Bridge (`js/modules/wasm_bridge.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L13 | `@ARCH: KERNEL_LOADER`, `@IO: WASM_FETCH` | Asynchronously initialize the Wasm execution environment and memory buffer. |
| L46 | `@ARCH: NETLIST_EXPANDER`, `@CONSTRAINT: RECURSIVE_RESOLUTION` | Recursively expand hierarchical macros into primitive gates for the kernel. |
| L132 | `@ARCH: SYNC_BRIDGE`, `@STATE: LINEAR_ALLOCATION` | Synchronize the JS object graph with Wasm linear memory (Region A/B). |
| L583 | `@ARCH: SYNC_BRIDGE`, `@STATE: MEMORY_READBACK` | Retrieve state vectors from Wasm linear memory into the JS host environment. |

## 3. Storage & Migration (`js/modules/persistence.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L6 | `@ARCH: MIGRATION_ENGINE`, `@CONSTRAINT: SCHEMA_PARITY` | Handle cross-version project data transformation and metadata injection. |
| L231 | `@ARCH: PERSISTENCE_LAYER`, `@IO: FILE_SERIALIZATION` | Generate standard JSON payload for project export. |

## 4. UI Interaction & Synthesis (`js/modules/synth_ui.js`, `js/modules/debug_terminal.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L3 | `@ARCH: SYNTHESIS_UI`, `@IO: UI_MODAL` | Manage state and validation for the logic synthesis modal. |
| L127 | `@ARCH: SYNTHESIS_DISPATCHER`, `@STATE: LOGIC_DATA` | Dispatch logic data for synthesis. |
| L86 | `@ARCH: APP_INITIALIZER`, `@IO: TERMINAL_BOOT` | Initialize the debug terminal subsystem. |

## 5. Rendering Pipeline (`js/modules/node_renderer.js`, `js/modules/wire_renderer.js`)
| Location | Tags | Intent |
| :--- | :--- | :--- |
| L6 | `@ARCH: UI_RENDERING`, `@IO: DOM_FACTORY` | Dynamically generate and inject DOM representation for logic nodes. |
| L16 | `@ARCH: UI_RENDERING`, `@IO: SVG_LAYER_MUTATION` | Redraw the entire SVG wire layer based on netlist connectivity. |

---
**Audit Status**: COMPLETED
**Parity Verification**: v1.23.76 Standard Met.
**Security Authorization**: SEC_ARCH_LEAD Approved.
