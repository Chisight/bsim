# bSim v1.27.37 - Modular Logic Simulator

> \[!IMPORTANT]
> **Architectural Status v1.27.37**: UI logic synthesis has been rewritten to be fully transaction-safe with atomic workspace state rollback on failure. The cyclic dependency scanner has been decoupled during compilation to permit components matching in-progress designs without collision. Decoupled UI orchestration, rendering engines, and notification subsystems are fully active.

**bSim** is a modular digital logic simulator engineered to complement a web based classroom. Built on an atomic NAND-foundation, it provides educational tools for circuit design, and high-frequency Wasm-accelerated simulation.  Students build up from the NAND gate to AND, OR, NOR, XOR and into more complex structures like a Full-Adder and D-Flip-Flop or even a complete microprocessor, all from the NAND gate base plus just a few extras like the Tri-State-Buffer.

## Reliable Execution

bSim's simulation kernel utilizes a WebAssembly (Wasm) core to deliver simplicity and reliability.

### 🚀 Simulation Engine

* **Standard Wasm Kernel**: signal propagation using a linear instruction set compiled from native netlists.
* **V8 Fallback**: A robust fallback when WASM is unavailable.
* **Hybrid Parity**: (v1.27.37) centralized Wasm memory evaluation.
* **Memory Sync**: Forced heap synchronization for RAM/ROM primitives via netlist-dirty signaling and hardware-level instruction emission.

### 🛡️ Multi-Phase Commit Protocol

The bSim engine operates on a deterministic pipeline to ensure physical hardware parity:

1. **Settle**: Resolve all combinatorial logic paths.
2. **Commit**: Synchronize state across the entire netlist to eradicate zero-delay cascades and race conditions.

***

## 🛠 Advanced Features

### 🖥️ Modular Debug Terminal

(v1.27.37) An integrated Linux-style CLI for low-level telemetry and netlist manipulation.

* **Virtual File System**: Navigate tab-specific netlists and global libraries via standard `ls`, `cd`, and `pwd`.
* **Standard Symbolic Linking**: Use POSIX-compliant `ln -s <target> <link>` to map library paths to workspace aliases.
* **Parametric Spawning**: Add components and wire ports directly from the terminal with sub-pixel coordinate precision.

### 💾 Hardened Persistence Layer

* **Zero-Trust Auto-Save**: Continuous project backup to LocalStorage with binary-parity checks.
* **Direct RAM Ingestion**: Context-menu binary flashing for ROM/RAM with automatic Wasm heap refresh.

***

## 📁 Project Architecture

```text
browser-sim/
├── index.html          # Main entry point (v1.27.37 Architecture)
├── wasm-core/          # WebAssembly source (WAT) for faster kernels
├── css/
│   └── style.css       # Responsive UI & Design System
└── js/
    ├── app.js          # Global entry point
    ├── sim.js          # Core simulation coordinator
    ├── history.js      # Undo/Redo tracking
    └── modules/
        ├── engine.js        # V8 backup engine
        ├── ui_orchestrator.js # DOM manipulation and layout
        ├── wasm_bridge.js   # Wasm/V8 High-speed telemetry bridge
        ├── interaction.js   # User input state machine
        ├── node_renderer.js # Parametric component rendering
        ├── wire_renderer.js # SVG signal path rendering
        └── debug_terminal.js # Integrated CLI subsystem
```

***

## 🔬 Diagnostic Protocol

To ensure absolute reliability, bSim implements the **MRAP (Modular Registry Architectural Parity)** protocol.

* **Parity Diagnostics**: Runs randomized cycles through both engines to verify 100% state alignment.

***

## 📐 Development Guidelines & Rules

To maintain high-quality release traceability, the project enforces the following rule:

* **Mandatory Version Bumps**: Any time a functional code change (fix, feature, or optimization) is introduced, the version must be bumped.

***

*Engineered with precision for logic classroom use.*
