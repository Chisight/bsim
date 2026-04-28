---
description: The V8 JS engine resolves nested macros via recursive call stacks before flattening them for Wasm execution. Malformed or malicious `.bsim` files containing circular macro dependencies or excessive depth will cause uncontrolled stack growth and engin
---

--- BEGIN FILE: .agents/workflows/09-hierarchical-recursion-limits.md ---
# WORKFLOW 09: HIERARCHICAL RECURSION LIMITS (HRL)
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** V8 Stack Smashing Protection

## 1. MECHANISM
The V8 JS engine resolves nested macros via recursive call stacks before flattening them for Wasm execution. Malformed or malicious `.bsim` files containing circular macro dependencies or excessive depth will cause uncontrolled stack growth and engine crashes.

## 2. EXECUTION PROTOCOL
1. The static netlist parser must execute a depth-first search (DFS) on the component tree prior to engine initialization.
2. Maintain a strict counter for nesting depth.
3. If depth exceeds the predefined safety limit (MAX_DEPTH = 256), parsing is immediately halted.

## 3. VALIDATION CONSTRAINT
Circular dependencies (`Macro A` instances `Macro B` which instances `Macro A`) or excessive nesting result in an immediate `FATAL_RECURSION_ERROR`. Engine execution remains locked.
--- END FILE ---