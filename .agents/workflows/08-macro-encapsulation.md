---
description: Custom macros synthesized via the debug terminal or UI must behave as pure hardware representations. They cannot hold hidden state variables outside of explicitly defined primitives (e.g., D-Flip-Flops, SR Latches).
---

--- BEGIN FILE: .agents/workflows/08-macro-encapsulation.md ---
# WORKFLOW 08: PURE HARDWARE ENCAPSULATION
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Custom Gate Purity

## 1. MECHANISM
Custom macros synthesized via the debug terminal or UI must behave as pure hardware representations. They cannot hold hidden state variables outside of explicitly defined primitives (e.g., D-Flip-Flops, SR Latches).

## 2. EXECUTION PROTOCOL
1. The static analyzer parses the `.bsim` definition of all newly synthesized chips.
2. The hierarchy is flattened to raw NAND gates.
3. The analyzer traces all signal paths from `IN` to `OUT`.

## 3. VALIDATION CONSTRAINT
Unless an explicit state-holding primitive is included in the sub-circuit, the macro must evaluate as a pure combinatorial function. Undefined internal feedback loops lacking a clock dependency are flagged as illegal and synthesis is aborted.
--- END FILE ---