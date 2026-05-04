;; =========================================================================
;; FILE: modular-sim/wasm-core/src/engine_purist.wat
;; DESC: Pure NAND kernel - all compound gates are synthesized in JS before
;;       being passed to this kernel. Only NAND + sequential primitives +
;;       bus resolution are handled here. Everything else is NAND.
;; =========================================================================

(module
  (import "env" "memory" (memory 1))
  
  ;; [AUDIT: v1.24.98 | SEC_ARCH_LEAD] - Dynamic Guard Band Memory Allocation injected via env imports.
  (import "env" "SHADOW_BASE" (global $SHADOW_BASE i32))
  (import "env" "PREV_CLK_BASE" (global $PREV_CLK_BASE i32))
  (import "env" "NQ_BASE" (global $NQ_BASE i32))

  (global $REGION_A_BASE i32 (i32.const 0))      ;; start of node states
  ;; [AUDIT: v1.23.81 | SEC_ARCH_LEAD] - Expanded instruction boundary to 1MB to prevent macro flattening overflows.
  (global $REGION_B_BASE i32 (i32.const 1048576))  ;; start of instructions
  ;; [AUDIT: v1.24.88 | SEC_ARCH_LEAD] - Shifted Region C boundary to 16MB to protect Region B execution array from large netlist overflows.
  (global $REGION_C_BASE i32 (i32.const 16777216)) 
  ;; [AUDIT: v1.24.93 | SEC_ARCH_LEAD] - Power Analysis Region E allocated at 24MB for cycle-accurate switching activity tracking.
  (global $REGION_E_BASE i32 (i32.const 25165824)) 
  (global $MEM_OFFSET (mut i32) (i32.const 0))

  ;; -----------------------------------------------------------------------
  ;; [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Parallelizing the combinatorial settle phase.
  ;; @ARCH: SIMD_KERNEL
  ;; @INTENT: Evaluate 4 NAND operations in parallel using 128-bit SIMD vectors.
  ;; -----------------------------------------------------------------------
  (func $tick_simd (param $count i32)
    (local $i i32)
    (loop $batch_loop
      ;; Grouping independent gates into 128-bit batches.
      ;; Note: This requires instructions to be pre-sorted or nodes to be contiguous.
      (i32.add (global.get $REGION_A_BASE) (i32.add (local.get $i) (i32.const 32)))
      (v128.not 
        (v128.and 
          (v128.load (i32.add (global.get $REGION_A_BASE) (local.get $i)))
          (v128.load (i32.add (global.get $REGION_A_BASE) (i32.add (local.get $i) (i32.const 16))))
        )
      )
      v128.store
      
      (local.set $i (i32.add (local.get $i) (i32.const 16)))
      (br_if $batch_loop (i32.lt_u (local.get $i) (local.get $count)))
    )
  )

  (func $nand (param $a i32) (param $b i32) (result i32)
    ;; [AUDIT: v1.26.06 | SEC_ARCH_LEAD] - High-Z (2) propagation support for native NAND primitive to enforce dual-engine parity.
    local.get $a
    i32.const 2
    i32.eq
    local.get $b
    i32.const 2
    i32.eq
    i32.or
    (if (result i32)
      (then i32.const 2)
      (else
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
    )
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
  (func $tick (param $instruction_count i32) (param $eval_seq i32)
    (local $i i32)            ;; loop index
    (local $ptr i32)          ;; address for current inst
    (local $val_a i32)        ;; temp input a
    (local $val_b i32)        ;; temp input b
    (local $target_addr i32)  ;; where we save the result
    (local $opcode i32)       ;; what we're doing
    ;; [AUDIT: v1.24.66 | SEC_ARCH_LEAD] - ROM/RAM pipeline locals.
    (local $raw_a i32) (local $raw_b i32) (local $in_base i32) (local $num_pins i32) (local $addr i32) (local $p i32) (local $data i32)

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

          ;; [AUDIT: v1.24.88 | SEC_ARCH_LEAD] - Deferred val_a/val_b memory fetches to prevent Out-Of-Bounds (OOB) traps on packed metadata operands.
          local.get $ptr i32.const 12 i32.add i32.load
          local.set $opcode

          local.get $ptr i32.load i32.const 4 i32.mul
          local.tee $target_addr

          local.get $ptr i32.const 4 i32.add i32.load
          local.set $raw_a

          local.get $ptr i32.const 8 i32.add i32.load
          local.set $raw_b

          local.get $opcode i32.const 5 i32.ne
          local.get $opcode i32.const 7 i32.ne
          i32.and
          local.get $opcode i32.const 8 i32.ne
          i32.and
          (if
            (then
              local.get $raw_a i32.const 4 i32.mul i32.load local.set $val_a
              local.get $raw_b i32.const 4 i32.mul i32.load local.set $val_b
            )
          )

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
                  ;; [AUDIT: v1.24.81 | SEC_ARCH_LEAD] - ROM Address Boundary Clamp enforcement to prevent linear memory host traps.
                  i32.const 1 local.get $num_pins i32.shl i32.const 1 i32.sub local.get $addr i32.and local.set $addr
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
                      ;; [AUDIT: v1.24.81 | SEC_ARCH_LEAD] - RAM Address Boundary Clamp enforcement to prevent linear memory host traps.
                      i32.const 1 local.get $num_pins i32.shl i32.const 1 i32.sub local.get $addr i32.and local.set $addr
                      local.get $raw_b i32.const 0xFFFFFF i32.and local.set $in_base
                      ;; [AUDIT: v1.24.91 | SEC_ARCH_LEAD] - Gated RAM WE evaluation to Sequential Enable phase to prevent hazard latching.
                      local.get $eval_seq i32.const 1 i32.eq
                      (if (then
                        local.get $in_base i32.const 8 i32.add i32.const 4 i32.mul i32.load i32.const 1 i32.eq
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
                          local.get $opcode i32.const 3 i32.eq
                          (if (result i32)
                            (then
                              ;; [AUDIT: v1.24.82 | SEC_ARCH_LEAD] - OP 3: Native TRISTATE Evaluation. (If Enable == 1, pass Input, else High-Z).
                              local.get $val_b i32.const 1 i32.eq
                              (if (result i32) (then local.get $val_a) (else i32.const 2))
                            )
                            (else 
                              local.get $opcode i32.const 8 i32.eq
                              (if (result i32)
                                (then local.get $raw_a global.set $MEM_OFFSET i32.const 0)
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
                                (else 
                                  local.get $opcode i32.const 1 i32.eq
                                  (if (result i32)
                                    (then
                                      ;; [AUDIT: v1.24.92 | SEC_ARCH_LEAD] - OP 1: Native Edge-Triggered DFF Three-Phase Commit.
                                      local.get $eval_seq i32.const 1 i32.eq
                                      (if (result i32)
                                        (then
                                          ;; Phase 1: Latch to NextQ Shadow Register
                                          local.get $target_addr i32.const 8 i32.add i32.load i32.const 0 i32.eq
                                          local.get $val_b i32.const 1 i32.eq i32.and
                                          (if (result i32)
                                            (then local.get $val_a)
                                            (else local.get $target_addr i32.load)
                                          )
                                          local.set $data
                                          local.get $target_addr i32.const 12 i32.add local.get $data i32.store
                                          local.get $target_addr i32.const 8 i32.add local.get $val_b i32.store
                                          local.get $target_addr i32.load
                                        )
                                        (else
                                          local.get $eval_seq i32.const 2 i32.eq
                                          (if (result i32)
                                            (then
                                              ;; Phase 2: Commit NextQ to Output
                                              local.get $target_addr i32.const 12 i32.add i32.load local.set $data
                                              local.get $target_addr i32.const 4 i32.add local.get $data i32.const 1 i32.eq (if (result i32) (then i32.const 0) (else i32.const 1)) i32.store
                                              local.get $data
                                            )
                                            (else local.get $target_addr i32.load)
                                          )
                                        )
                                      )
                                    )
                                    (else 
                                      local.get $opcode i32.const 4 i32.eq
                                      (if (result i32)
                                        (then
                                          ;; [AUDIT: v1.24.92 | SEC_ARCH_LEAD] - OP 4: Native Edge-Triggered TFF Three-Phase Commit.
                                          local.get $eval_seq i32.const 1 i32.eq
                                          (if (result i32)
                                            (then
                                              ;; Phase 1: Latch to NextQ Shadow Register
                                              local.get $target_addr i32.const 8 i32.add i32.load i32.const 0 i32.eq
                                              local.get $val_b i32.const 1 i32.eq i32.and
                                              (if (result i32)
                                                (then 
                                                  local.get $val_a i32.const 1 i32.eq
                                                  (if (result i32)
                                                    (then local.get $target_addr i32.load i32.const 1 i32.xor)
                                                    (else local.get $target_addr i32.load)
                                                  )
                                                )
                                                (else local.get $target_addr i32.load)
                                              )
                                              local.set $data
                                              local.get $target_addr i32.const 12 i32.add local.get $data i32.store
                                              local.get $target_addr i32.const 8 i32.add local.get $val_b i32.store
                                              local.get $target_addr i32.load
                                            )
                                            (else
                                              local.get $eval_seq i32.const 2 i32.eq
                                              (if (result i32)
                                                (then
                                                  ;; Phase 2: Commit NextQ to Output
                                                  local.get $target_addr i32.const 12 i32.add i32.load local.set $data
                                                  local.get $target_addr i32.const 4 i32.add local.get $data i32.const 1 i32.eq (if (result i32) (then i32.const 0) (else i32.const 1)) i32.store
                                                  local.get $data
                                                )
                                                (else local.get $target_addr i32.load)
                                              )
                                            )
                                          )
                                        )
                                        (else 
                                          local.get $opcode i32.const 9 i32.eq
                                          (if (result i32)
                                            (then
                                              ;; [AUDIT: v1.25.14 | SEC_ARCH_LEAD] - Opcode 9: CONST_0 (Writes 0 to target slot)
                                              i32.const 0
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
                    )
                  )
                )
              )
            )
          )
        )
      )
      ;; [AUDIT: v1.24.93 | SEC_ARCH_LEAD] - Cycle-Accurate Power Analysis: Gate-level switching activity tracker.
      local.set $data
      drop ;; Clear $target_addr pushed prior to dispatch
      
      local.get $target_addr i32.load local.get $data i32.ne
      (if (then
        global.get $REGION_E_BASE local.get $target_addr i32.add
        global.get $REGION_E_BASE local.get $target_addr i32.add i32.load i32.const 1 i32.add
        i32.store

        ;; [AUDIT: v1.24.95 | SEC_ARCH_LEAD] - Combinatorial Oscillation Watchdog Stability Enforcement.
        ;; If the state changed during Phase 0 (Settling), check for runaway switching activity.
        local.get $eval_seq i32.const 0 i32.eq
        (if (then
            global.get $REGION_E_BASE local.get $target_addr i32.add i32.load
            i32.const 1000
            i32.gt_u
            (if (then unreachable)) 
        ))
      ))
      
      local.get $target_addr local.get $data i32.store
          local.get $i i32.const 1 i32.add local.set $i
          br $eval_loop
        )
      )
    )
  )

  (export "tick" (func $tick))
)