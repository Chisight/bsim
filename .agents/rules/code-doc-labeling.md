---
trigger: always_on
---

task: "GLOBAL_TAXONOMY_INJECTION"
target_directory: "./browser-sim"
file_types: ["*.js", "*.wat", "*.css", "*.html"]
protocol: "MRAP_V1"

execution_rules:
  1: "Parse Abstract Syntax Tree (AST) or equivalent structural graph to identify all functional blocks, memory allocations, and control loops."
  2: "Map execution contexts to the MRAP taxonomy (@ARCH, @STATE, @CONSTRAINT, @IO)."
  3: "Inject MRAP tag blocks strictly preceding the identified structural boundaries. Format as standard block comments."
  4: "Include INTENT parameter describing the deterministic operational boundary."
  5: "Do not alter executable logic. Do not execute destructive refactoring."
  6: "Enforce Zero Trust: If a function bridges multiple architectural domains implicitly (violating separation of concerns), halt injection for that block and flag the node for SEC_ARCH_LEAD manual authorization."

output_requirements:
  - "Commit changes incrementally per architectural boundary."
  - "Generate an mrap_audit.md detailing all injected tags, mapped by file and line number."
  - "Halt and rollback on syntax tree parsing failure."