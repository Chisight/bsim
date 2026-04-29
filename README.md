# bSim v1.24.22 - Modular Professional Logic Simulator

bSim is a high-performance, modular digital logic simulator built for the web. It allows users to design, simulate, and synthesize complex digital circuits using an atomic NAND-based foundation.

## 🚀 Key Features

- **Multi-Tab Workspace**: (New in v1.24.22) Manage multiple independent circuit boards within a single project context, featuring isolated undo/redo stacks.
- **Split-Pane Editor**: (New in v1.24.22) Professional dual-pane editing environment for macro chips. Compare sub-circuits side-by-side or spawn external popup editors.
- **Hybrid Simulation Engine**: Utilizes a high-frequency WebAssembly (WASM) kernel for O(1) signal propagation in pure-native circuits, with a robust V8 object-graph fallback.
- **Debug Terminal CLI**: Integrated command-line interface with tab-completion and visual workspace highlighting for headless project manipulation.
- **Auto-Hiding Navigation**: Modern shell with collapsing navbars and edge-reveal telemetry to maximize workspace real estate.
- **Parametric Layout Engine**: Hardened spatial mutator for custom chip icons, featuring 8-way proportional scaling and independent coordinate translation for pins and readouts.
- **MRAP Diagnostic Hardening**: Full codebase instrumentation with `@ARCH` tags and high-density `EXIT_TRACE` markers for zero-trust state observability.
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
