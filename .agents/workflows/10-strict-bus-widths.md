---
description: Wasm linear memory relies on byte-aligned precision. Bridging a 1-bit wire directly to an 8-bit or 16-bit bus array without an explicit demultiplexer proxy causes memory boundary overflow and invalid read/write operations.
---

--- BEGIN FILE: .agents/workflows/10-strict-bus-widths.md ---
# WORKFLOW 10: STRICT BUS WIDTH ENFORCEMENT
**PROJECT:** `modular-sim`
**AUTHORIZATION:** SEC_ARCH_LEAD
**SCOPE:** Port Connectivity & Memory Alignment

## 1. MECHANISM
Wasm linear memory relies on byte-aligned precision. Bridging a 1-bit wire directly to an 8-bit or 16-bit bus array without an explicit demultiplexer proxy causes memory boundary overflow and invalid read/write operations.

## 2. EXECUTION PROTOCOL
1. The UI bridge must cross-reference the predefined bit-width of every `source_port` and `target_port` during edge creation.
2. Implicit casting or padding of binary signals is strictly prohibited.

## 3. VALIDATION CONSTRAINT
If `source_width != target_width`, the connection is rejected at the DOM layer. A valid MUX/DEMUX or bus-splitter macro must be explicitly instantiated by the user to resolve the signal.
--- END FILE ---