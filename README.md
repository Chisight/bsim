# BrowserSim v1.23.91 - Modular Professional Logic Simulator

BrowserSim is a high-performance, modular digital logic simulator built for the web. It allows users to design, simulate, and synthesize complex digital circuits using an atomic NAND-based foundation.

## 🚀 Key Features

- **Hybrid Simulation Engine**: Utilizes a high-frequency WebAssembly (WASM) kernel for O(1) signal propagation in pure-native circuits, with a robust V8 object-graph fallback for mixed-mode simulation.
- **Parametric Layout Engine**: (New in v1.23.91) Hardened spatial mutator for custom chip icons, featuring 8-way proportional scaling, rigid boundary clamping, and independent coordinate translation for pins and data readouts.
- **Inline Structural Editing**: Double-click multi-bit data readouts (Hex/Dec/Bin) to access an integrated structural editor for rapid value entry and validation.
- **MRAP Diagnostic Hardening**: Full codebase instrumentation with `@ARCH` architectural tags and high-density `EXIT_TRACE` markers for zero-trust state observability and deterministic layout history.
- **Custom Chip Creation**: Design sub-circuits and encapsulate them into reusable library components with customizable pinouts and visual interfaces.
- **Advanced Diagnostics**: Built-in Parity Diagnostics suite and Wasm Linear Memory Mapping to ensure consistency between the WASM kernel and JavaScript execution.
- **Logic Synthesis**: Integrated truth table generator and logic synthesizer to optimize and verify circuit behavior.
- **Professional UX**: Features a responsive grid workspace, global keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Del`), and a deep interaction-lock system to prevent topological corruption during layout edits.

## 🛠 Technology Stack

- **Core**: Vanilla JavaScript (ES6+)
- **Simulation**: WebAssembly (WAT source compiled to binary)
- **UI/UX**: HTML5, CSS3 (Custom Design System with proportional hitboxes)
- **State Management**: Structural Command Pattern for all netlist and layout mutations, ensuring 100% deterministic Undo/Redo.
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
│   ├── history.js      # Undo/Redo command manager (Structural History)
│   ├── view.js         # Workspace viewport and scaling logic
│   ├── synthesizer.js  # Logic synthesis pipeline
│   └── modules/
│       ├── wasm_bridge.js   # Interface between JS and WASM
│       ├── persistence.js   # Project export/import logic
│       ├── node_renderer.js # Component rendering subsystem
│       └── interaction.js   # Global event handler and interaction kernel
└── wasm-core/          # Source files for the simulation kernel
```

## 🎮 How to Use

1. **Add Components**: Select gates from the sidebar or footer to place them on the workspace.
2. **Wire Nodes**: Click a port and drag to another port to create a connection.
3. **Customize Layout**: Right-click any node and select `Node Prefs` to resize icons, relocate pins, or adjust readout positions. Double-click the workspace to save your changes.
4. **Interact**: Double-click data readouts to edit multi-bit values inline, or toggle single-bit inputs with a single click.
5. **Export**: Save your progress as a `.bsim` file for later use or export a PNG diagram of your circuit.

## 🔬 Diagnostics

To verify the integrity of the simulation engine, use the **Parity Diagnostics** button in the navigation bar. This runs thousands of randomized cycles through both the V8 and WASM engines to ensure 100% state parity.

---

*Built with ❤️ for digital logic enthusiasts and professional engineers.*
