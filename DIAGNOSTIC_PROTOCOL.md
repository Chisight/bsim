# Modular Simulation Diagnostic Protocol (v1.23.64)

## 1. Overview
This protocol defines the standardized telemetry and architectural labeling used to maintain parity between the V8 JavaScript object graph and the WebAssembly linear memory kernel. It ensures zero-trust observability across all simulation layers.

## 2. Taxonomy (@MRAP_V1)
All functional blocks MUST be prefixed with MRAP domain tags to enforce architectural boundaries:

| Tag | Domain | Intent |
| :--- | :--- | :--- |
| `@ARCH` | Architecture | Identifies the subsystem (e.g., `SYNC_BRIDGE`, `SIGNAL_RESOLVER`). |
| `@STATE` | State | Identifies affected memory or object state (e.g., `LINEAR_ALLOC`, `NODE_UPDATE`). |
| `@IO` | Input/Output | Identifies external interfaces (e.g., `WASM_TO_HOST`, `DOM_FACTORY`). |
| `@CONSTRAINT` | Constraint | Identifies operational limits (e.g., `MAX_DEPTH=256`, `TIME_STEP_QUANT`). |
| `@INTENT` | Intent | Describes the deterministic outcome of the block. |

## 3. High-Density Traceability (@TRACEABILITY_V1)
Every function exit point (including early returns and block terminators) MUST include an `EXIT_TRACE` marker.

**IMMUTABILITY RULE**: Historical audit markers and version strings within `[AUDIT: ...]` tags are strictly immutable. Automated patching, regex replacements, and agent-driven refactoring MUST NOT increment or modify historical version numbers. New logic receives new markers; old logic retains its original timestamp. Retroactive version bumping of these tags is a critical protocol violation.

**Format**:
`// [AUDIT: SEC_ARCH_LEAD] - EXIT_TRACE: <Description> [Contextual Data]`

**Example**:
```javascript
if (parityError) {
    // [AUDIT: SEC_ARCH_LEAD] - EXIT_TRACE: Parity drift detected at bit-index ${idx}.
    return false;
}
```

## 4. Wasm Linear Memory Mapping (@ARCH:SYNC_BRIDGE)
Memory is allocated statically during `syncLayout`.

| Offset Range | Content | Access Level |
| :--- | :--- | :--- |
| `0 - 16383` | Signal State Buffer (Region A) | Read/Write (Bridge/Kernel) |
| `16384 - END` | Instruction Buffer (Region B) | Read-Only (Kernel) |

## 5. Regression Requirements
Any change to the `LogicSynthesizer` or `WasmEngine` must pass the `v1.23.64` parity suite:
1. **NAND Primitive**: Verify output for all 4 states.
2. **XOR/XNOR Extraction**: Verify SOP minimization vs Parity extraction.
3. **Bus Width Bridge**: Verify 1-bit to 8-bit proxy mapping.
4. **Hierarchical Flatting**: Verify nested macro depth (MAX=256).

---
**Protocol Version**: 1.23.64
**Status**: ACTIVE
**Authorized By**: SEC_ARCH_LEAD
