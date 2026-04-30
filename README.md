# BrowserSim v1.24.44 - Modular Professional Logic Simulator

bSim is a high-performance, modular digital logic simulator built for the web. It allows users to design, simulate, and synthesize complex digital circuits using an atomic NAND-based foundation.

## 🚀 Key Features

- **Hybrid Simulation Engine**: Utilizes a high-frequency WebAssembly (WASM) kernel for O(1) signal propagation in pure-native circuits, with a robust V8 object-graph fallback for mixed-mode simulation.
- **Independent Popup Editor**: (New in v1.24.40) Robust window management for sub-circuits, featuring multi-directional custom edge resizers, minimize/restore states, and pointer-event shielding for uninterruptible editing.
- **Debug Terminal & Scripting**: (New in v1.24.41) Integrated Linux-style CLI for real-time telemetry, advanced diagnostic control, and `.bsimscript` batch processing for automated circuit verification.
- **Modular Preferences Window**: A standalone, draggable configuration suite with global animation suppression for performance-critical simulation environments.
- **Smart Wire Routing**: (New in v1.24.44) Intelligent auto-routing takeover for boundary wires during component translation, ensuring topological clean-up while preserving custom routing for isolated networks.
- **MRAP Diagnostic Hardening**: Full codebase instrumentation with `@ARCH` architectural tags and high-density `EXIT_TRACE` markers for zero-trust state observability and deterministic layout history.
- **Logic Synthesis**: Integrated truth table generator and logic synthesizer to optimize and verify circuit behavior.

## 🛠 Technology Stack

- **Core**: Vanilla JavaScript (ES6+)
- **Simulation**: WebAssembly (WAT source compiled to binary)
- **UI/UX**: HTML5, CSS3 (Custom Design System with proportional hitboxes)
- **State Management**: Structural Command Pattern for all netlist and layout mutations.
- **Persistence**: LocalStorage-based zero-trust auto-save & `.bsim` file export/import.

## 📁 Project Structure

```text
browser-sim/
├── index.html          # Main application entry point
├── css/
30: │   └── style.css       # Core design system and styles
├── js/
31: │   ├── app.js          # Main application initializer
32: │   ├── sim.js          # Core simulation engine
33: │   ├── history.js      # Undo/Redo command manager
34: │   └── modules/
35: │       ├── debug_terminal.js # Integrated CLI system
36: │       ├── wasm_bridge.js   # Interface between JS and WASM
37: │       ├── persistence.js   # Project export/import logic
38: │       ├── node_renderer.js # Component rendering subsystem
39: │       └── interaction.js   # Global interaction kernel
└── assets/             # Branding and SVG iconography
```

## 🎮 How to Use

1. **Workspace Tabs**: Use the `+` button in the top bar to create new boards. Double-click a tab to rename it.
2. **Auto-Hide UI**: Click the **▲** or **▼** icons to collapse navbars. Hover near the edges to reveal them.
3. **Split Editor**: Right-click the workspace while editing a chip to activate "Split Editor" mode (Left/Right/Popup).
4. **Debug Terminal**: Press **`** (backtick) to open the CLI. Use `ls`, `spawn`, `rm`, and `Tab` to manage the netlist.
5. **Layout Mode**: Right-click any node and select `Node Prefs` to resize icons or relocate pins.

## 🔬 Diagnostics

To verify the integrity of the simulation engine, use the **Parity Diagnostics** button. This runs intensive randomized cycles through both engines to ensure 100% state parity.

---

*Built with ❤️ for digital logic enthusiasts and professional engineers.*
