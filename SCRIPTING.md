# bSim Scripting Guide (.bsimscript)

The bSim Debug Terminal supports automated hardware manipulation and diagnostic workflows through plain-text scripts. Scripts can be imported directly via the terminal interface to execute complex build or test sequences.

## 🛠 Getting Started

### Creating a Script
1. Create a new text file with the `.bsims` or `.bsimscript` (recommended) extension.
2. Enter one command per line.
3. Use `#` or `//` for comments.

### Importing a Script
1. Press **`** (backtick) or **Ctrl+Alt+P** to open the Debug Terminal.
2. Right-click anywhere in the terminal window.
3. Select **Import Script** from the context menu.
4. Choose your file to begin execution.

---

## 📜 Script Syntax & Commands

### Comments
```bash
# This is a comment
// This is also a comment
```

### Basic Workspace Commands
| Command | Description | Example |
| :--- | :--- | :--- |
| `ls` | List all nodes in the current workspace | `ls -l` |
| `spawn` | Instantiate a component at (x, y) with a deterministic ID | `spawn NAND 100 200 # u1` |
| `wire` | Connect two ports | `wire node-1 out0 node-2 a` |
| `rm` | Remove a node by its ID | `rm node-1` |
| `clear` | Clear the terminal buffer | `clear` |

### Simulation & State Control
| Command | Description | Example |
| :--- | :--- | :--- |
| `set` | Update the value of an input node | `set node-5 1` |
| `tick` | Advance the simulation by N cycles | `tick 10` |
| `clock` | Set the frequency (Hz) of an oscillator | `clock node-clk 1000` |
| `force` | Force a pin to a specific logic level | `force n1 in0 1` |
| `unforce`| Release a forced pin override | `unforce n1 in0` |
| `sim` | Force an immediate propagation tick | `sim` |
| `status` | Display the current logic state of all nodes | `status` |

### File System & Library (VFS)
The terminal uses a Virtual File System (VFS) to navigate your library and workspaces.
- `pwd`: Show current directory.
- `cd <path>`: Navigate to a specific tab or library folder (e.g., `cd /etc/lib/custom`).
- `mv <chip> <folder>`: Move a library chip to a specific folder.
- `tree`: Display the entire project hierarchy.

### Advanced Diagnostics
- `trace <nodeId>`: Show all incoming and outgoing connections for a node.
- `watch <nodeId>`: Log state changes to the terminal in real-time.
- `bom [macro]`: Generate a Bill of Materials for the current circuit.
- `path <n1> <n2>`: Trace the electrical path between two points.

---

## 💡 Example Script: NAND Latch Test
Save the following as `latch_test.bsimscript`:

```bash
# Clear the workspace first
rm all
clear

# Spawn components for an SR-Latch with deterministic IDs
spawn NAND 100 -40 # u1
spawn NAND 100 40  # u2
spawn IN-1 0 -40   # set_in  (Label: "SET")
spawn IN-1 0 40    # res_in  (Label: "RESET")
spawn OUT-1 200 -40 # q_out  (Label: "Q")
spawn OUT-1 200 40  # nq_out (Label: "NQ")

# Wire the latch logic using custom IDs
wire set_in out0 u1 a
wire res_in out0 u2 b
wire u1 out u2 a
wire u2 out u1 b
wire u1 out q_out in0
wire u2 out nq_out in0

# Run simulation test using label aliases
set SET 1
set RESET 1
sim
status
```

---

## ⚠️ Security & Constraints
- **Non-Interactive**: Scripts execute sequentially. If a command fails, the terminal logs the error and proceeds to the next line.
- **VFS Boundaries**: Scripts cannot access files outside the `/home/bsim` or `/etc/lib` virtual directories.
- **Undo History**: All script-based mutations are pushed to the undo/redo stack as a single batch when possible, or as individual commands.
