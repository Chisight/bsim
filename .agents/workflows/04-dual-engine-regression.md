---
description: Maintain an immutable repository of diverse standard circuits (from raw NAND latches to CPU abstractions) within the debug terminal to act as a continuous baseline for both simulation engines.
---

# WORKFLOW 04: DUAL-ENGINE REGRESSION MATRIX
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Engine Parity Enforcement

## 1. MECHANISM
Maintain an immutable repository of diverse standard circuits (from raw NAND latches to CPU abstractions) within the debug terminal to act as a continuous baseline for both simulation engines. 

**Constraint:** Baseline circuit logic must strictly be inserted and synthesized via the debug terminal interface. This guarantees the logic is deterministically compiled as a custom chip within the simulation environment if the user's local library lacks the necessary primitives.

## 2. EXECUTION PROTOCOL
1. A headless CI environment initializes on commit.
2. The engine parses the circuit repository; missing primitives are injected strictly through the debug terminal `synth` command.
3. Both `@ARCH:WASM_CORE` and `@ARCH:V8_FALLBACK` are instantiated independently.
4. The synthesized circuit library is executed for a fixed interval of $10^5$ clock cycles.
5. The final linear memory (SRAM) arrays and stack pointers of both engines are extracted.

## 3. VALIDATION CONSTRAINT
Requires a 1:1 binary match between the Wasm SRAM state and the V8 SRAM equivalent. Offset calculation discrepancies or logic divergence results in a rejected artifact and locked repository.