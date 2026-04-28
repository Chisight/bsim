---
description: Implement a state logger capturing transitions of all `PROBE` and `OUT` nodes at every clock cycle. Data is serialized to a standard Value Change Dump (.vcd) or normalized JSON format.
---

# WORKFLOW 03: WAVEFORM TRACE DIFFING
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Temporal Consistency & Trace Diagnostics

## 1. MECHANISM
Implement a state logger capturing transitions of all `PROBE` and `OUT` nodes at every clock cycle. Data is serialized to a standard Value Change Dump (.vcd) or normalized JSON format.

## 2. EXECUTION PROTOCOL
1. Extract a "golden" baseline trace from a verified reference macro (e.g., a 4-bit multiplier).
2. Apply the untrusted logic patch or Wasm/V8 bridge modification.
3. Generate a new execution trace.
4. Execute a temporal diff between the baseline and the modified trace.

## 3. VALIDATION CONSTRAINT
Any variance in signal timing, clock latency, or combinatorial state transitions invalidates the patch. Continuous temporal determinism is required.