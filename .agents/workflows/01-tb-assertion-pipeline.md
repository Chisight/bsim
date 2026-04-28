---
description: Extend the `.bsim` file format parser to support explicit embedded assertion vectors mapping inputs to expected deterministic outputs.
---

# WORKFLOW 01: AUTOMATED TESTBENCH ASSERTION PIPELINE
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Macro Logic Validation

## 1. MECHANISM
Extend the `.bsim` file format parser to support explicit embedded assertion vectors mapping inputs to expected deterministic outputs.
Format: `ASSERT: [IN_A, IN_B, ...] -> [OUT_X, OUT_Y, ...]`

## 2. EXECUTION PROTOCOL
1. The CI runner extracts all `ASSERT` vectors from the target `.bsim` file.
2. The headless engine instantiates the isolated macro.
3. Inputs are sequentially forced to the specified states.
4. The simulation clock is advanced by exactly $\Delta t$.
5. Actual outputs are compared against expected outputs.

## 3. VALIDATION CONSTRAINT
Any deviation from the truth table triggers an immediate build failure. Commits modifying standard macros (ALUs, Registers) must pass 100% assertion coverage to prevent gate-level logic drift.