;; =========================================================================
;; FILE: modular-sim/wasm-core/src/engine_purist.wat
;; DESC: Pure NAND kernel - all compound gates are synthesized in JS before
;;       being passed to this kernel. Only NAND + sequential primitives +
;;       bus resolution are handled here. Everything else is NAND.
;; =========================================================================

(module
  (import "env" "memory" (memory 1))

  (global $REGION_A_BASE i32 (i32.const 0))      ;; start of node states
  ;; [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Expanded instruction boundary to 1MB to prevent macro flattening overflows.
  (global $REGION_B_BASE i32 (i32.const 1048576))  ;; start of instructions
  ;; [AUDIT: v1.24.60 | SEC_ARCH_LEAD] - Injected Region C boundary for contiguous ROM payload memory indexing.
  (global $REGION_C_BASE i32 (i32.const 2097152))  ;; start of ROM binary payloads
  (global $MEM_OFFSET (mut i32) (i32.const 0))  ;; [AUDIT: v1.24.63 | SEC_ARCH_LEAD] - Dynamic payload pointer for linear memory indexing.

  ;; -----------------------------------------------------------------------
  ;; ATOMIC PRIMITIVE: $nand
  ;; Strict 1-bit: only (1 AND 1) -> 0, everything else -> 1
  ;; -----------------------------------------------------------------------
  ;; [AUDIT: v1.23.64 | SEC_ARCH_LEAD] - Entry trace for NAND primitive.
  ;; @ARCH: ATOMIC_PRIMITIVE
  ;; @CONSTRAINT: TRUTH_TABLE
  ;; @INTENT: Define the fundamental logical NAND operation as the system's singular primitive.
  (func $nand (param $a i32) (param $b i32) (result i32)
    local.get $a
    i32.const 1
    i32.eq
    local.get $b
    i32.const 1
    i32.eq
    i32.and
    i32.const 1
    i32.xor
  )

  ;; -----------------------------------------------------------------------
  ;; CORE KERNEL: $tick
  ;;
  ;; Instruction layout (16 bytes each, in Region B):
  ;;   [0..3]   target_slot  (i32) - Region A slot to write result
  ;;   [4..7]   a_slot       (i32) - Region A slot for input A
  ;;   [8..11]  b_slot       (i32) - Region A slot for input B
  ;;   [12..15] opcode       (i32) - operation to perform
  ;;
  ;; Opcodes:
  ;;   0  = NAND(a, b)
  ;;   1  = DFF  (d=a, clk=b, edge-triggered flip-flop)
  ;;   2  = CLOCK (tick autonomously, a=unused, b=unused)
  ;;   3  = TRISTATE (in=a, en=b)
  ;;   4  = TFF (t=a, clk=b)
  ;;   11 = BUS_RESOLVE (OR-priority: 1 > 0 > Z)
  ;;
  ;; All other gates (NOT, AND, OR, NOR, XOR, XNOR) are decomposed into
  ;; sequences of NAND instructions by the JS bridge before reaching here.
  ;; -----------------------------------------------------------------------
  ;; [AUDIT: v1.23.64 | SEC_ARCH_LEAD] - Entry trace for Wasm simulation tick.
  ;; @ARCH: CORE_KERNEL
  ;; @CONSTRAINT: LINEAR_EXECUTION
  ;; @INTENT: Main execution loop for redrawing the logical state across all synthesized primitive gates in linear memory.
  (func $tick (param $instruction_count i32)
    (local $i i32)            ;; loop index
    (local $ptr i32)          ;; address for current inst
    (local $val_a i32)        ;; temp input a
    (local $val_b i32)        ;; temp input b
    (local $target_addr i32)  ;; where we save the result
    (local $opcode i32)       ;; what we're doing
    ;; [AUDIT: v1.24.60 | SEC_ARCH_LEAD] - Injected ROM local variables for memory addressing and bit unpacking.
    (local $raw_a i32)
    (local $raw_b i32)
    (local $in_base i32)
    (local $num_pins i32)
    (local $addr i32)
    (local $p i32)
    (local $data i32)

    i32.const 0
    local.set $i

    (loop $eval_loop
      local.get $i
      local.get $instruction_count
      i32.lt_s
      (if
        (then
          local.get $i i32.const 16 i32.mul global.get $REGION_B_BASE i32.add
          local.set $ptr

          local.get $ptr i32.const 4 i32.add i32.load
          local.tee $raw_a
          i32.const 4 i32.mul i32.load
          local.set $val_a

          local.get $ptr i32.const 8 i32.add i32.load
          local.tee $raw_b
          i32.const 4 i32.mul i32.load
          local.set $val_b

          local.get $ptr i32.load i32.const 4 i32.mul
          local.tee $target_addr

          local.get $ptr i32.const 12 i32.add i32.load
          local.set $opcode

          ;; [AUDIT: v1.24.65 | SEC_ARCH_LEAD] - Unified Opcode Dispatcher with Corrected Folded Nesting.
          local.get $opcode i32.const 0 i32.eq
          (if (result i32)
            (then
              ;; op 0: NAND
              local.get $val_a local.get $val_b call $nand
            )
            (else 
              local.get $opcode i32.const 5 i32.eq
              (if (result i32)
                (then
                  ;; op 5: ROM
                  local.get $raw_a i32.const 0xFFFFFF i32.and local.set $in_base
                  local.get $raw_a i32.const 24 i32.shr_u local.set $num_pins
                  i32.const 0 local.set $addr i32.const 0 local.set $p
                  (loop $rom_a_loop
                    local.get $p local.get $num_pins i32.lt_u
                    (if (then
                      local.get $in_base local.get $p i32.add i32.const 4 i32.mul i32.load i32.const 1 i32.eq
                      (if (then local.get $addr i32.const 1 local.get $p i32.shl i32.or local.set $addr))
                      local.get $p i32.const 1 i32.add local.set $p br $rom_a_loop
                    ))
                  )
                  global.get $REGION_C_BASE global.get $MEM_OFFSET i32.add local.get $addr i32.add i32.load8_u local.set $data
                  i32.const 1 local.set $p
                  (loop $rom_o_loop
                    local.get $p i32.const 8 i32.lt_u
                    (if (then
                      local.get $target_addr local.get $p i32.const 4 i32.mul i32.add
                      local.get $data i32.const 1 local.get $p i32.shl i32.and (if (result i32) (then i32.const 1) (else i32.const 0)) i32.store
                      local.get $p i32.const 1 i32.add local.set $p br $rom_o_loop
                    ))
                  )
                  local.get $data i32.const 1 i32.and (if (result i32) (then i32.const 1) (else i32.const 0))
                )
                (else 
                  local.get $opcode i32.const 7 i32.eq
                  (if (result i32)
                    (then
                      ;; op 7: RAM
                      local.get $raw_a i32.const 0xFFFFFF i32.and local.set $in_base
                      local.get $raw_a i32.const 24 i32.shr_u local.set $num_pins
                      i32.const 0 local.set $addr i32.const 0 local.set $p
                      (loop $ram_a_loop
                        local.get $p local.get $num_pins i32.lt_u
                        (if (then
                          local.get $in_base local.get $p i32.add i32.const 4 i32.mul i32.load i32.const 1 i32.eq
                          (if (then local.get $addr i32.const 1 local.get $p i32.shl i32.or local.set $addr))
                          local.get $p i32.const 1 i32.add local.set $p br $ram_a_loop
                        ))
                      )
                      local.get $raw_b i32.const 0xFFFFFF i32.and local.set $in_base
                      local.get $raw_b i32.const 24 i32.shr_u i32.const 4 i32.mul i32.load i32.const 1 i32.eq
                      (if (then
                        i32.const 0 local.set $data i32.const 0 local.set $p
                        (loop $ram_d_loop
                          local.get $p i32.const 8 i32.lt_u
                          (if (then
                            local.get $in_base local.get $p i32.add i32.const 4 i32.mul i32.load i32.const 1 i32.eq
                            (if (then local.get $data i32.const 1 local.get $p i32.shl i32.or local.set $data))
                            local.get $p i32.const 1 i32.add local.set $p br $ram_d_loop
                          ))
                        )
                        global.get $REGION_C_BASE global.get $MEM_OFFSET i32.add local.get $addr i32.add local.get $data i32.store8
                      ))
                      global.get $REGION_C_BASE global.get $MEM_OFFSET i32.add local.get $addr i32.add i32.load8_u local.set $data
                      i32.const 1 local.set $p
                      (loop $ram_o_loop
                        local.get $p i32.const 8 i32.lt_u
                        (if (then
                          local.get $target_addr local.get $p i32.const 4 i32.mul i32.add
                          local.get $data i32.const 1 local.get $p i32.shl i32.and (if (result i32) (then i32.const 1) (else i32.const 0)) i32.store
                          local.get $p i32.const 1 i32.add local.set $p br $ram_o_loop
                        ))
                      )
                      local.get $data i32.const 1 i32.and (if (result i32) (then i32.const 1) (else i32.const 0))
                    )
                    (else 
                      local.get $opcode i32.const 6 i32.eq
                      (if (result i32)
                        (then local.get $val_a)
                        (else 
                          local.get $opcode i32.const 8 i32.eq
                          (if (result i32)
                            (then local.get $val_a global.set $MEM_OFFSET i32.const 0)
                            (else 
                              local.get $opcode i32.const 11 i32.eq
                              (if (result i32)
                                (then
                                  local.get $val_a i32.const 1 i32.eq
                                  (if (result i32) (then i32.const 1)
                                    (else local.get $val_b i32.const 1 i32.eq
                                      (if (result i32) (then i32.const 1)
                                        (else local.get $val_a i32.const 0 i32.eq
                                          (if (result i32) (then i32.const 0) (else local.get $val_b))
                                        )
                                      )
                                    )
                                  )
                                )
                                (else local.get $target_addr i32.load)
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
          i32.store
          local.get $i i32.const 1 i32.add local.set $i
          br $eval_loop
        )
      )
    )
  )

  (export "tick" (func $tick))
)