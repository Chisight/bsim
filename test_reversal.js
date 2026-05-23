const wasmCode = `
(module
  (memory (export "memory") 256)
  (func (export "test_ram")
    (local $data i32)
    (local $p i32)
    (local $in_base i32)
    
    ;; Simulate din0 = 0, din7 = 1 (AA = 10101010)
    (i32.store (i32.const 0) (i32.const 0)) ;; din0
    (i32.store (i32.const 4) (i32.const 1)) ;; din1
    (i32.store (i32.const 8) (i32.const 0)) ;; din2
    (i32.store (i32.const 12) (i32.const 1)) ;; din3
    (i32.store (i32.const 16) (i32.const 0)) ;; din4
    (i32.store (i32.const 20) (i32.const 1)) ;; din5
    (i32.store (i32.const 24) (i32.const 0)) ;; din6
    (i32.store (i32.const 28) (i32.const 1)) ;; din7
    
    (local.set $in_base (i32.const 0))
    
    (local.set $data (i32.const 0))
    (local.set $p (i32.const 0))
    (loop $ram_d_loop
      (if (i32.lt_u (local.get $p) (i32.const 8)) (then
        (if (i32.eq (i32.load (i32.add (local.get $in_base) (i32.mul (local.get $p) (i32.const 4)))) (i32.const 1)) (then
          (local.set $data (i32.or (local.get $data) (i32.shl (i32.const 1) (local.get $p))))
        ))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br $ram_d_loop)
      ))
    )
    
    ;; Store data to memory at address 100
    (i32.store8 (i32.const 100) (local.get $data))
  )
)
`
const fs = require('fs');
// Don't actually compile wasm, just logic test
let data = 0;
let din = [0, 1, 0, 1, 0, 1, 0, 1]; // AA
for(let p=0; p<8; p++) {
    if(din[p] === 1) {
        data |= (1 << p);
    }
}
console.log("Data for AA input:", data, data.toString(16).toUpperCase());

let din_1 = [1, 0, 0, 0, 0, 0, 0, 0]; // 1
let data_1 = 0;
for(let p=0; p<8; p++) {
    if(din_1[p] === 1) data_1 |= (1 << p);
}
console.log("Data for 1 input:", data_1, data_1.toString(16).toUpperCase());
