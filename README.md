# BrowserSim v1.22.34 - Modular Professional Logic Simulator

BrowserSim is a high-performance, modular digital logic simulator built for the web. It allows users to design, simulate, and synthesize complex digital circuits using an atomic NAND-based foundation.

## 🚀 Key Features

- **Hybrid Simulation Engine**: Utilizes a high-frequency WebAssembly (WASM) kernel for O(1) signal propagation in pure-native circuits, with a robust V8 object-graph fallback for mixed-mode simulation.
- **Custom Chip Creation**: Design sub-circuits and encapsulate them into reusable library components.
- **Advanced Diagnostics**: Built-in Parity Diagnostics suite to ensure cryptographic consistency between the WASM kernel and JavaScript execution.
- **Logic Synthesis**: Integrated truth table generator and logic synthesizer to optimize and verify circuit behavior.
- **Hardware Analysis**: Automated Bill of Materials (BOM) estimation for hardware implementations.
- **Professional UX**: Features a responsive grid workspace, keyboard shortcuts (Undo/Redo, Delete), and a persistent auto-save layer.

## 🛠 Technology Stack

- **Core**: Vanilla JavaScript (ES6+)
- **Simulation**: WebAssembly (WAT source compiled to binary)
- **UI/UX**: HTML5, CSS3 (Custom Design System)
- **Persistence**: LocalStorage-based zero-trust auto-save & `.bsim` file export/import.

## 📁 Project Structure

```text
modular-sim/
├── index.html          # Main application entry point
├── css/
│   └── style.css       # Core design system and styles
├── js/
│   ├── app.js          # Main application initializer
│   ├── sim.js          # Core simulation engine
│   ├── history.js      # Undo/Redo command manager
│   ├── view.js         # Workspace viewport and scaling logic
│   ├── synthesizer.js  # Logic synthesis pipeline
│   └── modules/
│       ├── wasm_bridge.js   # Interface between JS and WASM
│       ├── persistence.js   # Project export/import logic
│       ├── node_renderer.js # Component rendering subsystem
│       └── wire_renderer.js # High-performance SVG wire engine
└── wasm-core/          # Source files for the simulation kernel
```

## 🎮 How to Use

1. **Add Components**: Select gates from the sidebar or footer to place them on the workspace.
2. **Wire Nodes**: Click a port and drag to another port to create a connection.
3. **Interact**: Double-click inputs to toggle state, or use the "New Chip" feature to build hierarchical designs.
4. **Export**: Save your progress as a `.bsim` file for later use or export a PNG diagram of your circuit.

## 🔬 Diagnostics

To verify the integrity of the simulation engine, use the **Parity Diagnostics** button in the navigation bar. This runs thousands of randomized cycles through both the V8 and WASM engines to ensure 100% state parity.

---

*Built with ❤️ for digital logic enthusiasts and professional engineers.*
