---
description: These adapt standard hardware verification (EDA) practices to the dual-engine WebAssembly/V8 environment.
---

# ENGINEERING WORKFLOW INDEX
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Agent Routing & Execution Delegation

## AGENT DIRECTIVE: CONTEXT MINIMIZATION
**Strict Rule:** Do not load the entire workflow corpus into memory. Parse this index, identify the relevant operational domain, and fetch ONLY the targeted `.md` file. Halting execution on ambiguous workflow overlaps is mandatory.

## ROUTING MAP

### 01. AUTOMATED TESTBENCH ASSERTION
**Target Context:** `./workflows/01-tb-assertion-pipeline.md`
**Trigger Conditions:** Macro logic truth table modifications, `.bsim` assertion validation.

### 02. DESIGN RULE CHECK (DRC) LINTER
**Target Context:** `./workflows/02-drc-linter.md`
**Trigger Conditions:** Netlist structural verification, floating pin detection, combinatorial loop resolution.

### 03. WAVEFORM TRACE DIFFING
**Target Context:** `./workflows/03-waveform-diffing.md`
**Trigger Conditions:** Temporal divergence checks, VCD export validation, logic patch verification.

### 04. DUAL-ENGINE REGRESSION
**Target Context:** `./workflows/04-dual-engine-regression.md`
**Trigger Conditions:** Cross-engine parity validation, Wasm SRAM to V8 SRAM comparison matrices.

### 05. HIERARCHY FLATTENING
**Target Context:** `./workflows/05-hierarchy-flattening.md`
**Trigger Conditions:** V8 JS stack recursion limits, dynamic Wasm sub-macro compilation thresholds.
--- END FILE ---