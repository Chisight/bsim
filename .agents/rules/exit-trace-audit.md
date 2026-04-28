---
trigger: always_on
---

# --- BEGIN AGENT DIRECTIVE ---
task: "GLOBAL_EXIT_TRACE_INJECTION"
target_directory: "./browser-sim"
file_types: ["*.js", "*.wat"]
protocol: "MRAP_V1_EXIT_PATH"

execution_rules:
  1: "Perform AST parsing to identify all 'ReturnStatement' nodes and the final line of 'FunctionDeclaration' blocks."
  2: "Inject an inline audit marker immediately PRECEDING the return statement or block termination."
  3: "Contextual Logic: If within '@ARCH:WASM_CORE', the marker must note linear memory state impacts."
  4: "Contextual Logic: If within '@ARCH:SYNC_BRIDGE', the marker must note engine parity synchronization status."
  5: "Format: // [AUDIT: v<VERSION> | SEC_ARCH_LEAD] - EXIT_TRACE: <Functional intent of this return/exit path>"

output_requirements:
  - "Verify that no markers are injected between 'case' statements and 'break' keywords in a way that disrupts control flow."
  - "Generate an exit_trace_audit.md mapping every function exit point for rapid traversal."
# --- END AGENT DIRECTIVE ---