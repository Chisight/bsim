# bSim v1.25.26 - Professional Modular Logic Simulator

> [!IMPORTANT]
> **Architectural Status v1.25.26**: This version represents the stable hardened baseline. Significant engine hardening has been implemented to resolve memory synchronization faults, register core architectural primitives like Constant Ground (0), and standardize virtual symbolic linking via the POSIX `ln -s` command.

**bSim** is a high-performance, modular digital logic simulator engineered for the web. Built on an atomic NAND-foundation, it provides professional-grade tools for circuit design, hierarchical macro synthesis, and high-frequency Wasm-accelerated simulation.

---

## ⚡ High-Performance Execution

bSim's simulation kernel is a masterpiece of modern web engineering, utilizing a high-speed WebAssembly (Wasm) core to deliver unprecedented speed and reliability.

### 🚀 Simulation Engine
- **Standard Wasm Kernel**: O(1) signal propagation using a linear instruction set compiled from native netlists.
- **V8 Fallback**: A robust object-graph simulator for rapid prototyping and complex mixed-mode debugging.
- **Hybrid Parity**: (v1.25.26) Full opcode dispatchers including the native **Opcode 9 (CONST_0)** for grounding and centralized Wasm memory evaluation.
- **Memory Sync**: Forced heap synchronization for RAM/ROM primitives via netlist-dirty signaling and hardware-level instruction emission.

### 🛡️ Multi-Phase Commit Protocol
The bSim engine operates on a deterministic pipeline to ensure physical hardware parity:
1. **Settle**: Resolve all combinatorial logic paths.
2. **Commit**: Synchronize state across the entire netlist to eradicate zero-delay cascades and race conditions.

---

## 🛠 Advanced Features

### 🧩 Hierarchical Macro Synthesis
Design complex integrated circuits and encapsulate them into reusable chips. bSim handles deep recursion and bit-mapped bus ports with high efficiency.

### 📱 Mobile-First Responsive UI
(v1.25.24) Optimized for productivity across all form factors.
- **Adaptive Sidebar**: Collapsible mobile overlay with touch-optimized toggles.
- **Precision Touch**: Scaled hitboxes and touch targets (44px min) for high-density mobile interaction.
- **Macro Management**: Hierarchical folder sub-menus with inline DOM mutation for rapid library organization.

### 🖥️ Modular Debug Terminal
(v1.25.26) An integrated Linux-style CLI for low-level telemetry and netlist manipulation.
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
├── index.html          # Main entry point (v1.25.26 Architecture)
├── wasm-core/          # WebAssembly source (WAT) for high-speed kernels
├── css/
│   └── style.css       # Responsive UI & Design System (MRAP_V1 Protocol)
├── js/
│   ├── app.js          # Global orchestration kernel
│   ├── sim.js          # Core simulation coordinator
│   └── modules/
│       ├── wasm_bridge.js   # Wasm/V8 High-speed telemetry bridge
│       ├── interaction.js   # Memory-hardened interaction layer
│       ├── node_renderer.js # Parametric component rendering
│       └── debug_terminal.js # Integrated CLI subsystem
└── mrap_audit.md       # Full architectural instrumentation log
```

---

## 🔬 Diagnostic Protocol

To ensure absolute reliability, bSim implements the **MRAP (Modular Registry Architectural Parity)** protocol.
- **Parity Diagnostics**: Runs randomized cycles through both engines to verify 100% state alignment.
- **Exit Tracing**: Full function termination observability via the [Exit Trace Audit](file:///home/user/Documents/github/browser-sim/exit_trace_audit.md).

---

*Engineered with precision for logic designers and professional architects.*
