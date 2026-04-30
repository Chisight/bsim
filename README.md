# BrowserSim v1.24.92 - Modular Professional Logic Simulator

bSim is a high-performance, modular digital logic simulator built for the web. It allows users to design, simulate, and synthesize complex digital circuits using an atomic NAND-based foundation.

## 🚀 Key Features

- **Hybrid Simulation Engine**: Utilizes a high-frequency WebAssembly (WASM) kernel for O(1) signal propagation in pure-native circuits, with a robust V8 object-graph fallback for mixed-mode simulation.
- **Three-Phase Commit Protocol**: (New in v1.24.92) Advanced execution pipeline (Settle -> Latch Shadow -> Commit) mirroring Verilog's non-blocking assignments (`<=`) to eradicate zero-delay cascades and race conditions.
- **Native Volatile RAM Sync**: (New in v1.24.90) Bidirectional memory synchronization between Wasm linear memory (Region C) and the JS Host. Volatile RAM payloads are preserved across AutoSave and serialization cycles.
- **Performance-Hardened Hot Path**: (New in v1.24.90) Purged `JSON.stringify` from the simulation loop in favor of high-performance shallow equality checks, significantly reducing frame latency.
- **Independent Popup Editor**: Robust window management for sub-circuits, featuring multi-directional custom edge resizers, minimize/restore states, and pointer-event shielding.
- **Debug Terminal & Scripting**: Integrated Linux-style CLI for real-time telemetry, advanced diagnostic control, and `.bsims` batch processing. See [SCRIPTING.md](./SCRIPTING.md) for the full guide.
- **Smart Wire Routing**: Intelligent auto-routing takeover for boundary wires during component translation, ensuring topological clean-up.
- **MRAP Diagnostic Hardening**: Full codebase instrumentation with `@ARCH` architectural tags and high-density `EXIT_TRACE` markers for zero-trust state observability.
- **Memory Layout Isolation**: (New in v1.24.88) Hardened 16MB Region C heap to prevent stack-heap collisions during large-scale RAM/ROM synthesis.

## 🛠 Technology Stack

- **Core**: Vanilla JavaScript (ES6+)
- **Simulation**: WebAssembly (WAT source compiled to binary)
- **Architecture**: Three-Phase Commit Pipeline with Shadow Register Latching.
- **UI/UX**: HTML5, CSS3 (Custom Design System with proportional hitboxes)
- **State Management**: Structural Command Pattern for all netlist and layout mutations.
- **Persistence**: LocalStorage-based zero-trust auto-save with binary-parity Wasm memory synchronization.

## 📁 Project Structure

```text
browser-sim/
├── index.html          # Main application entry point
├── css/
│   └── style.css       # Core design system and styles
├── js/
│   ├── app.js          # Main application initializer
│   ├── sim.js          # Core simulation engine (Two-Phase execution)
│   ├── history.js      # Undo/Redo command manager
│   └── modules/
│       ├── debug_terminal.js # Integrated CLI system
│       ├── wasm_bridge.js   # Interface between JS and WASM
│       ├── persistence.js   # Project export/import logic
│       ├── node_renderer.js # Component rendering subsystem
│       └── interaction.js   # Global interaction kernel
└── assets/             # Branding and SVG iconography
```

## 🎮 How to Use

1. **Workspace Tabs**: Use the `+` button in the top bar to create new boards. Double-click a tab to rename it.
2. **Auto-Hide UI**: Click the **▲** or **▼** icons to collapse navbars. Hover near the edges to reveal them.
3. **Split Editor**: Right-click the workspace while editing a chip to activate "Split Editor" mode (Left/Right/Popup).
4. **Debug Terminal**: Press **`** (backtick) to open the CLI. Use `ls`, `spawn`, `rm`, and `Tab` to manage the netlist.
5. **Two-Phase Simulation**: The engine now settles combinatorial logic before latching sequential states. This ensures that flip-flops and RAM capture stable signals, mirroring physical hardware behavior.
6. **Native RAM**: Drag the **RAM** module from the bottom library for high-speed volatile memory. State is automatically synchronized to the browser's persistent storage.

## 🔬 Diagnostics

To verify the integrity of the simulation engine, use the **Parity Diagnostics** button. This runs intensive randomized cycles through both the V8 object graph and the Three-Phase Wasm kernel to ensure 100% state parity.

---

*Built with ❤️ for digital logic enthusiasts and professional engineers.*
