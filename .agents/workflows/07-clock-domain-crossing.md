---
description: DOM events (mouse clicks, keyboard inputs, terminal synthesis) operate asynchronously. The Wasm simulation loop operates on strict discrete time steps ($t, t+\Delta t$). 
---

--- BEGIN FILE: .agents/workflows/07-clock-domain-crossing.md ---
# WORKFLOW 07: CLOCK DOMAIN ISOLATION (CDC)
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Asynchronous Input Handling

## 1. MECHANISM
DOM events (mouse clicks, keyboard inputs, terminal synthesis) operate asynchronously. The Wasm simulation loop operates on strict discrete time steps ($t, t+\Delta t$). 

## 2. EXECUTION PROTOCOL
1. Direct mutation of the simulation state from a UI event is prohibited.
2. All inputs must route through a Synchronous Staging Buffer (SSB) in `@ARCH:SYNC_BRIDGE`.
3. The SSB latches the asynchronous signal and injects it into the SRAM strictly at the $t_0$ phase of the next clock cycle.

## 3. VALIDATION CONSTRAINT
Mid-cycle state mutations cause race conditions between V8 and Wasm. Any detection of asynchronous injection bypassing the SSB triggers an immediate engine halt.
--- END FILE ---