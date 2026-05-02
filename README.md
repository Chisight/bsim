# bSim v1.25.01 - Professional Modular Logic Simulator

> [!IMPORTANT]
> **Architectural Status v1.25.01**: This version represents the stable baseline of the modular simulator. All notations related to higher versions (v1.26.x - v1.27.x) identified in the codebase are artifacts from the experimental **multi-wasm bSim variant** and should be treated as historical telemetry.

**bSim** is a high-performance, modular digital logic simulator engineered for the web. Built on an atomic NAND-foundation, it provides professional-grade tools for circuit design, hierarchical macro synthesis, and high-frequency Wasm-accelerated simulation.

---

## ⚡ High-Performance Execution

bSim's simulation kernel is a masterpiece of modern web engineering, utilizing a high-speed WebAssembly (Wasm) core to deliver unprecedented speed and reliability.

### 🚀 Simulation Engine
- **Standard Wasm Kernel**: O(1) signal propagation using a linear instruction set compiled from native netlists.
- **V8 Fallback**: A robust object-graph simulator for rapid prototyping and complex mixed-mode debugging.
- **Hybrid Parity**: (v1.25.00) Full opcode dispatchers (Sequential, Tristate, Memory) synchronized across all engine variants.

### 🛡️ Multi-Phase Commit Protocol
The bSim engine operates on a deterministic pipeline to ensure physical hardware parity:
1. **Settle**: Resolve all combinatorial logic paths.
2. **Commit**: Synchronize state across the entire netlist to eradicate zero-delay cascades and race conditions.

---

## 🛠 Advanced Features

### 🧩 Hierarchical Macro Synthesis
Design complex integrated circuits and encapsulate them into reusable chips. bSim handles deep recursion and bit-mapped bus ports with high efficiency.

### 🖥️ Modular Debug Terminal
An integrated Linux-style CLI for low-level telemetry and netlist manipulation.
- **Real-time Probing**: Use `peek` and `poke` to monitor and inject signal states.
- **Batch Processing**: Run `.bsims` scripts for automated verification.

### 💾 Hardened Persistence Layer
- **Zero-Trust Auto-Save**: Continuous project backup to LocalStorage with binary-parity checks.
- **Native RAM Sync**: Volatile memory state is preserved across sessions via high-speed Wasm-to-Host bridges.

---

## 📁 Project Architecture

```text
browser-sim/
├── index.html          # Main entry point (v1.25.01 Architecture)
├── wasm-core/          # WebAssembly source (WAT) for high-speed kernels
├── css/
│   └── style.css       # Core Design System (MRAP_V1 Protocol)
├── js/
│   ├── app.js          # Global orchestration kernel
│   ├── sim.js          # Core simulation coordinator
│   └── modules/
│       ├── wasm_bridge.js   # Wasm/V8 High-speed telemetry bridge
│       ├── interaction.js   # Hitbox-optimized interaction layer
│       ├── persistence.js   # Sanitized project serialization
│       └── debug_terminal.js # Integrated CLI subsystem
└── mrap_audit.md       # Full architectural instrumentation log
```

---

## 🔬 Diagnostic Protocol

To ensure absolute reliability, bSim implements the **MRAP (Modular Registry Architectural Parity)** protocol.
- **Parity Diagnostics**: Runs randomized cycles through both engines to verify 100% state alignment.
- **SCC Resolution**: (v1.25.30 artifact) Advanced graph analysis to resolve and break combinatorial loops. *Note: Advanced SCC features are considered multi-wasm artifacts in this branch.*

---

*Engineered with precision for logic designers and professional architects.*
