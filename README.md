# bSim v1.27.35 - Professional Modular Logic Simulator

> [!IMPORTANT]
> **Architectural Status v1.27.35**: UI logic synthesis has been rewritten to be fully transaction-safe with atomic workspace state rollback on failure. The cyclic dependency scanner has been decoupled during compilation to permit components matching in-progress designs without collision. Decoupled UI orchestration, rendering engines, and notification subsystems are fully active.

**bSim** is a high-performance, modular digital logic simulator engineered for the web. Built on an atomic NAND-foundation, it provides professional-grade tools for circuit design, hierarchical macro synthesis, and high-frequency Wasm-accelerated simulation.

---

## ⚡ High-Performance Execution

bSim's simulation kernel is a masterpiece of modern web engineering, utilizing a high-speed WebAssembly (Wasm) core to deliver unprecedented speed and reliability.

### 🚀 Simulation Engine
- **Standard Wasm Kernel**: O(1) signal propagation using a linear instruction set compiled from native netlists.
- **V8 Fallback**: A robust object-graph simulator for rapid prototyping and complex mixed-mode debugging.
- **Hybrid Parity**: (v1.27.35) Full opcode dispatchers including the native **Opcode 9 (CONST_0)** for grounding and centralized Wasm memory evaluation.
- **Memory Sync**: Forced heap synchronization for RAM/ROM primitives via netlist-dirty signaling and hardware-level instruction emission.

### 🛡️ Multi-Phase Commit Protocol
The bSim engine operates on a deterministic pipeline to ensure physical hardware parity:
1. **Settle**: Resolve all combinatorial logic paths.
2. **Commit**: Synchronize state across the entire netlist to eradicate zero-delay cascades and race conditions.

---

## 🛠 Advanced Features

### 🧩 Hierarchical Macro Synthesis & Safe Compiler
Design complex integrated circuits and encapsulate them into reusable chips.
- **Transaction-Safe Synthesis**: UI logic synthesis runs in an isolated temporary context. If compilation succeeds, the new component is safely injected into the library and the previous workspace is restored intact. If compilation fails, an atomic rollback restores the exact pre-synthesis state, completely protecting against active chip loss or project corruption.
- **Cycle Scanner Decoupling**: During synthesis, the cyclic dependency checker isolates the newly compiled target name, preventing invalid self-reference cycle blocks on components matching the sub-circuit currently being edited.
- **Dual-Engine Signature Mapping**: Deep signature mapping with correct internal circuit simulation matching for all pre-existing library chips.

### 📱 Mobile-First Responsive UI
(v1.27.35) Optimized for productivity across all form factors.
- **Adaptive Sidebar**: Collapsible mobile overlay with touch-optimized toggles.
- **Hierarchical Library**: Native `primitives` and custom macros are encapsulated in professional collapsible directories.
- **Macro Management**: Hierarchical folder sub-menus with inline DOM mutation for rapid library organization.

### 🖥️ Modular Debug Terminal
(v1.27.35) An integrated Linux-style CLI for low-level telemetry and netlist manipulation.
- **Virtual File System**: Navigate tab-specific netlists and global libraries via standard `ls`, `cd`, and `pwd`.
- **Standard Symbolic Linking**: Use POSIX-compliant `ln -s <target> <link>` to map library paths to workspace aliases.
- **Parametric Spawning**: Add components and wire ports directly from the terminal with sub-pixel coordinate precision.

### 💾 Hardened Persistence Layer
- **Zero-Trust Auto-Save**: Continuous project backup to LocalStorage with binary-parity checks.
- **Direct RAM Ingestion**: Context-menu binary flashing for ROM/RAM with automatic Wasm heap refresh.

---

## 📁 Project Architecture

```text
browser-sim/
├── index.html          # Main entry point (v1.27.35 Architecture)
├── wasm-core/          # WebAssembly source (WAT) for high-speed kernels
├── css/
│   └── style.css       # Responsive UI & Design System
└── js/
    ├── app.js          # Global entry point
    ├── sim.js          # Core simulation coordinator
    ├── history.js      # Undo/Redo tracking
    └── modules/
        ├── engine.js        # V8 Simulation engine
        ├── ui_orchestrator.js # DOM manipulation and layout
        ├── wasm_bridge.js   # Wasm/V8 High-speed telemetry bridge
        ├── interaction.js   # User input state machine
        ├── node_renderer.js # Parametric component rendering
        ├── wire_renderer.js # SVG signal path rendering
        └── debug_terminal.js # Integrated CLI subsystem
```

---

## 🔬 Diagnostic Protocol

To ensure absolute reliability, bSim implements the **MRAP (Modular Registry Architectural Parity)** protocol.
- **Parity Diagnostics**: Runs randomized cycles through both engines to verify 100% state alignment.

---

*Engineered with precision for logic designers and professional architects.*
