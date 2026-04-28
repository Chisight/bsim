---
description: Unlike the V8 JavaScript engine, the Wasm core lacks automatic garbage collection. Every netlist node instantiated in `@ARCH:DOM_SURFACE` maps to a fixed offset in the Wasm linear memory.
---

--- BEGIN FILE: .agents/workflows/06-memory-lifecycle.md ---
# WORKFLOW 06: STRICT LINEAR MEMORY LIFECYCLE
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Wasm SRAM Allocation & Garbage Collection

## 1. MECHANISM
Unlike the V8 JavaScript engine, the Wasm core lacks automatic garbage collection. Every netlist node instantiated in `@ARCH:DOM_SURFACE` maps to a fixed offset in the Wasm linear memory.

## 2. EXECUTION PROTOCOL
1. The JS bridge must maintain an allocation registry mapping `nodeId` to physical `SRAM_OFFSET`.
2. When a component is deleted from the UI, a synchronous `FREE` directive must be dispatched to `@ARCH:WASM_CORE`.
3. The memory block is zeroed out and added to an available pointer pool.

## 3. VALIDATION CONSTRAINT
Memory leaks are fatal. The CI runner will randomly instantiate and delete $10^4$ components. If the Wasm memory footprint grows linearly without reclamation, the build fails.
--- END FILE ---