---
description: A pre-execution static analysis parser that traverses the DOM UI graph or JSON netlist payload before Wasm compilation or V8 execution.
---

# WORKFLOW 02: DESIGN RULE CHECK (DRC) LINTER
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Static Netlist Verification

## 1. MECHANISM
A pre-execution static analysis parser that traverses the DOM UI graph or JSON netlist payload before Wasm compilation or V8 execution.

## 2. EXECUTION PROTOCOL
The parser enforces the following topology rules:
* **Rule 01:** Detect floating (unconnected) input pins on active macros.
* **Rule 02:** Detect short circuits (multiple outputs driving a single input line).
* **Rule 03:** Flag asynchronous combinatorial loops (loops lacking a clocked flip-flop or register primitive).

## 3. VALIDATION CONSTRAINT
Violations halt simulation initialization. The engine outputs specific `nodeId` coordinates and the failing rule. Execution is blocked until topology constraints are satisfied, preventing infinite recursion in JS and memory faults in Wasm.