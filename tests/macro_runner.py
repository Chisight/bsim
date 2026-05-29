#!/usr/bin/env python3
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""bSim Headless Macro Testing Tool.

Enables automated testing of .bsim schematics with sequential flow specs,
offering verification against WASM, V8, or strict parity across both.
"""

import argparse
import asyncio
import json
import os
import sys
import urllib.request
import websockets
from pathlib import Path

# JS Injection for label-to-id resolution, signal extraction, and V8+WASM parity checking.
HELPER_JS = """
window.Sim.resolvePathToIds = (pathStr) => {
    const parts = pathStr.split(':');
    let currentNodes = window.Sim.nodes;
    let resolvedIds = [];
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].toLowerCase();
        const node = currentNodes.find(n => (n.label && n.label.toLowerCase() === part) || n.id.toLowerCase() === part);
        if (!node) return null;
        resolvedIds.push(node.id);
        if (i < parts.length - 1) {
            const lib = window.Sim.library[node.type];
            if (!lib || !lib.nodes) return null;
            currentNodes = lib.nodes;
        }
    }
    return resolvedIds.join(':');
};

window.Sim.readNodeValue = (resolvedId, portId = null) => {
    if (window.Sim.useWasm && window.WasmEngine && window.WasmEngine.ready) {
        const fn = WasmEngine.flatNodes.find(n => n.id === resolvedId);
        if (!fn) return undefined;
        if (fn.type === 'RAM') {
            const pins = fn.addressPins || 4;
            const allocSize = 1 << pins;
            if (fn._romOffset !== undefined) {
                const view = new Uint8Array(WasmEngine.memory.buffer, 16777216 + fn._romOffset, allocSize);
                return Array.from(view);
            }
            return [];
        }
        
        if (fn.type.startsWith('OUT-') || fn.type.startsWith('PROBE-')) {
            const bits = parseInt(fn.type.split('-')[1]) || 1;
            if (bits === 1) {
                const drive = WasmEngine.readPinState(resolvedId, 'in0');
                return (drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0);
            } else {
                let val = [];
                for (let b = 0; b < bits; b++) {
                    const drive = WasmEngine.readPinState(resolvedId, `in${b}`);
                    val.push((drive === 2 || drive === 'Z' || drive === null) ? 'Z' : ((drive === 1 || drive === true) ? 1 : 0));
                }
                return val;
            }
        }
        
        const port = portId || (fn.type === 'CLOCK' || fn.type === '0' || fn.type.startsWith('IN-') ? 'out0' : (fn.type === 'DFF' || fn.type === 'TFF' ? 'q' : 'out'));
        const idx = WasmEngine.getSpecificIdx(resolvedId, port);
        if (idx === undefined) return undefined;
        const drive = WasmEngine.memArray[WasmEngine.REGION_A_OFFSET + idx];
        return (drive === 2 || drive === 'Z') ? 'Z' : ((drive === 3 || drive === 'E') ? 'E' : drive);
    } else {
        const parts = resolvedId.split(':');
        let current = window.Sim.nodes.find(n => n.id === parts[0]);
        if (!current) return undefined;
        for (let i = 1; i < parts.length; i++) {
            if (!current._internalState) return undefined;
            const cached = current._internalState[parts[i]];
            if (!cached) return undefined;
            current = cached;
        }
        
        if (parts.length > 1) {
            if (current.memoryData !== undefined) return current.memoryData;
            if (portId) {
                return (current.val && current.val[portId] !== undefined) ? current.val[portId] : current.val;
            }
            return current.val;
        } else {
            if (current.type === 'RAM') return current.memoryData;
            if (portId) {
                return (current.val && current.val[portId] !== undefined) ? current.val[portId] : current.val;
            }
            return current.val;
        }
    }
};

window.Sim.setInputVal = (resolvedId, val) => {
    const parts = resolvedId.split(':');
    if (parts.length > 1) {
        console.warn("Direct input injection on nested sub-chips not natively supported.");
        return;
    }
    const node = window.Sim.nodes.find(n => n.id === parts[0]);
    if (node) {
        node.state = val;
        node.val = val;
        if (window.Sim.useWasm && window.WasmEngine && window.WasmEngine.ready) {
            window.WasmEngine.writeState(parts[0], val);
        }
    }
};
"""

class MacroTestRunner:
    def __init__(self, port=8000, debugger_port=9222):
        self.port = port
        self.debugger_port = debugger_port
        self.ws_url = None
        self.ws = None
        self.pending = {}
        self.listener_task = None

    async def connect(self):
        try:
            url = f"http://localhost:{self.debugger_port}/json/list"
            response = urllib.request.urlopen(url)
            data = json.loads(response.read().decode())
            self.ws_url = next(item["webSocketDebuggerUrl"] for item in data if item.get("type") == "page" and f"localhost:{self.port}" in item.get("url", ""))
        except Exception as e:
            raise RuntimeError(f"Could not connect to bSim browser page on port {self.port}: {e}. Ensure server is running and debugger is open.")

        self.ws = await websockets.connect(self.ws_url)
        await self.ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await self.ws.send(json.dumps({"id": 2, "method": "Page.enable"}))
        
        self.listener_task = asyncio.create_task(self.listen())
        await asyncio.sleep(0.5)

    async def disconnect(self):
        if self.listener_task:
            self.listener_task.cancel()
        if self.ws:
            await self.ws.close()

    async def listen(self):
        try:
            async for msg in self.ws:
                event = json.loads(msg)
                msg_id = event.get("id")
                if msg_id in self.pending:
                    self.pending.pop(msg_id).set_result(event)
        except asyncio.CancelledError:
            pass

    async def eval_js(self, expr):
        msg_id = len(self.pending) + 5000
        payload = {
            "id": msg_id,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expr,
                "returnByValue": True
            }
        }
        fut = asyncio.get_running_loop().create_future()
        self.pending[msg_id] = fut
        await self.ws.send(json.dumps(payload))
        res_obj = await fut
        
        result_wrapper = res_obj.get("result", {})
        if "exceptionDetails" in result_wrapper:
            exception_desc = result_wrapper["exceptionDetails"]["exception"].get("description", "Unknown JS error")
            raise Exception(f"JS Exception: {exception_desc}")
            
        result = result_wrapper.get("result", {})
        return result.get("value")

    async def load_layout(self, layout_content: str):
        escaped_project = json.dumps(layout_content)
        await self.eval_js(f"localStorage.setItem('bsim_autosave', {escaped_project})")
        await self.ws.send(json.dumps({"id": 201, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(5.0) # Allow DOM, WASM, and scripts to initialize
        await self.eval_js(HELPER_JS)

    async def execute_test(self, spec: dict, engine: str):
        print(f"  Targeting simulation engine: {engine.upper()}")
        await self.eval_js(f"window.Sim.setEngine('{engine.lower()}')")
        await self.eval_js("window.Sim.flipPinLogic = true")
        await self.eval_js("window.Sim._netlistDirty = true; window.Sim.seedQueue(); window.Sim.processQueue();")
        
        use_wasm = await self.eval_js("window.Sim.useWasm")
        wasm_ready = await self.eval_js("window.WasmEngine && window.WasmEngine.ready")
        print(f"    Engine Status | useWasm: {use_wasm} | wasmReady: {wasm_ready}")
        
        inputs_log = await self.eval_js("window.Sim.nodes.filter(n => n.type.startsWith('IN-')).map(n => `${n.label || n.id}: ${JSON.stringify(n.state)}`)")
        print(f"    Schematic Input Nodes: {inputs_log}")
        
        is_pure_native = await self.eval_js("window.Engine.isPureNative(window.Sim.nodes, window.Sim.library)")
        print(f"    Is Pure Native (WASM compatible): {is_pure_native}")
        
        val1 = await self.eval_js("window.Sim.readNodeValue('node-7sqjnjkun')")
        val2 = await self.eval_js("window.Sim.readNodeValue('node-921exlhsb')")
        print(f"    Initial Schematic Outputs | PC-Low: {val1} | PC-High: {val2}")

        steps = spec.get("steps", [])
        for idx, step in enumerate(steps):
            print(f"    Step {idx + 1}/{len(steps)}:")
            
            # 1. Apply Inputs
            inputs = step.get("inputs", {})
            for path, val in inputs.items():
                resolved_id = await self.eval_js(f"window.Sim.resolvePathToIds('{path}')")
                if not resolved_id:
                    raise ValueError(f"Could not resolve input node path: '{path}'")
                await self.eval_js(f"window.Sim.setInputVal('{resolved_id}', {json.dumps(val)})")
                print(f"      Set: {path} -> {val}")

            # 2. Clock Ticks
            ticks = step.get("clock_ticks", 0)
            if ticks > 0:
                # Find clock node
                nodes = await self.eval_js("window.Sim.nodes.map(n => ({id: n.id, label: n.label, type: n.type}))")
                clk_node = next((n for n in nodes if n["type"] == "CLOCK" or (n["label"] and n["label"].lower() == "clk")), None)
                if not clk_node:
                    raise ValueError("Clock tick requested, but no CLOCK or 'clk' node found in schematic.")
                
                print(f"      Ticking Clock {ticks} times...")
                for _ in range(ticks):
                    before = await self.eval_js(f"window.Sim.nodes.find(n => n.id === '{clk_node['id']}').state")
                    await self.eval_js(f"window.Sim.toggleBit('{clk_node['id']}', 0)")
                    after = await self.eval_js(f"window.Sim.nodes.find(n => n.id === '{clk_node['id']}').state")
                    print(f"      Ticked Clock: state {before} -> {after}")
                    await self.eval_js("window.Sim.seedQueue(); window.Sim.processQueue();")
                    await asyncio.sleep(0.05)

            # Let queue settle
            await self.eval_js("window.Sim.seedQueue(); window.Sim.processQueue();")

            # 3. Assert Expectations
            expect = step.get("expect", {})
            for path, expected_val in expect.items():
                resolved_id = await self.eval_js(f"window.Sim.resolvePathToIds('{path}')")
                if not resolved_id:
                    raise ValueError(f"Could not resolve expectation node path: '{path}'")
                
                actual_val = await self.eval_js(f"window.Sim.readNodeValue('{resolved_id}')")
                print(f"      Read: {path} = {actual_val} (expected: {expected_val})")
                
                # Check for array equality or value equality
                if isinstance(expected_val, list):
                    if not isinstance(actual_val, list) or len(expected_val) != len(actual_val):
                        raise AssertionError(f"Step {idx + 1} mismatch on {path}: expected array {expected_val}, got {actual_val}")
                    for i, (e, a) in enumerate(zip(expected_val, actual_val)):
                        if e != a:
                            raise AssertionError(f"Step {idx + 1} mismatch on {path} at index {i}: expected {e}, got {a}")
                else:
                    if str(expected_val) != str(actual_val):
                        raise AssertionError(f"Step {idx + 1} mismatch on {path}: expected {expected_val}, got {actual_val}")
                
                print(f"      Verified: {path} = {expected_val} (OK)")
        
        print(f"  ✓ Engine {engine.upper()} simulation run succeeded cleanly.")

async def main_async():
    parser = argparse.ArgumentParser(description="bSim Schematic Macro Test Runner")
    parser.add_argument("--file", required=True, help="Path to the .bsim layout file.")
    parser.add_argument("--spec", required=True, help="Path to the spec .json file.")
    parser.add_argument("--engine", default="both", choices=["wasm", "v8", "both"], help="Simulation engine to target.")
    parser.add_argument("--port", type=int, default=8000, help="bSim server port.")
    parser.add_argument("--debugger-port", type=int, default=9222, help="Chrome debugger remote port.")
    args = parser.parse_args()

    # Load file contents
    if not os.path.exists(args.file):
        print(f"Error: Layout file not found: {args.file}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(args.spec):
        print(f"Error: Spec file not found: {args.spec}", file=sys.stderr)
        sys.exit(1)

    with open(args.file, "r", encoding="utf-8") as f:
        layout_str = f.read()

    with open(args.spec, "r", encoding="utf-8") as f:
        spec = json.load(f)

    print(f"Starting macro test run for '{spec.get('name', 'Schematic')}'...")
    runner = MacroTestRunner(port=args.port, debugger_port=args.debugger_port)
    
    try:
        await runner.connect()
        print("Connected to debugger. Ingesting layout...")
        await runner.load_layout(layout_str)
        
        target_engines = ["wasm", "v8"] if args.engine == "both" else [args.engine]
        for eng in target_engines:
            await runner.execute_test(spec, eng)
            
        print("🎉 All macro test specs verified successfully!")
        
    except AssertionError as ae:
        print(f"\n❌ Test Assertion Failed:\n{ae}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Execution Error Encountered:\n{e}", file=sys.stderr)
        sys.exit(1)
    finally:
        await runner.disconnect()

def main():
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\nTest execution interrupted.")
        sys.exit(1)

if __name__ == "__main__":
    main()
