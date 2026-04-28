---
description: A depth-analysis heuristic that runs during netlist compilation to map nested macro layers prior to V8 parsing.
---

# WORKFLOW 05: HIERARCHY FLATTENING PROFILER
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Recursion Management & Engine Stability

## 1. MECHANISM
A depth-analysis heuristic that runs during netlist compilation to map nested macro layers prior to V8 parsing.

## 2. EXECUTION PROTOCOL
1. Calculate the theoretical maximum recursion depth of the loaded `.bsim` module.
2. Compare depth against the predefined safe JS engine stack limit (e.g., 500 layers).
3. If the threshold is exceeded, trigger an intermediate pre-compilation pass.

## 3. VALIDATION CONSTRAINT
Sub-macros breaching the threshold must be flattened and compiled directly into strict Wasm NAND arrays. Prevents hierarchical unwinding from exhausting the V8 call stack.