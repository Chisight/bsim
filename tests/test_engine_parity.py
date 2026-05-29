import asyncio
import json
import urllib.request
import websockets
import unittest
import os

class TestEngineParity(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        try:
            response = urllib.request.urlopen("http://localhost:9222/json/list")
            data = json.loads(response.read().decode())
            self.ws_url = next(item["webSocketDebuggerUrl"] for item in data if item.get("type") == "page" and "localhost:8000" in item.get("url", ""))
        except Exception as e:
            self.fail(f"Could not find bSim browser page running on port 8000: {e}")

        # Connect to browser WebSocket
        self.ws = await websockets.connect(self.ws_url)
        await self.ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await self.ws.send(json.dumps({"id": 2, "method": "Page.enable"}))
        
        self.pending = {}
        self.listener_task = asyncio.create_task(self.listen())
        await asyncio.sleep(0.5)

    async def asyncTearDown(self):
        self.listener_task.cancel()
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
        msg_id = len(self.pending) + 1000
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

    async def test_wasm_v8_parity(self):
        # Load clean layout into localStorage
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "cpu_layout.json")
        with open(fixture_path, "r") as f:
            project_json_str = f.read()

        escaped_project = json.dumps(project_json_str)
        await self.eval_js(f"localStorage.setItem('bsim_autosave', {escaped_project})")
        
        # Reload page bypassing cache to initialize fresh
        await self.ws.send(json.dumps({"id": 200, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(5.0)

        # Locate nodes
        nodes = await self.eval_js("window.Sim.nodes.map(n => ({id: n.id, label: n.label, type: n.type}))")
        clk_node = next((n for n in nodes if n["label"].lower() == "clk"), None)
        out_nodes = [n for n in nodes if n["type"] == "OUT-8"]
        
        self.assertIsNotNone(clk_node, "CLK Node not found on canvas!")
        clk_id = clk_node["id"]
        out_ids = [o["id"] for o in out_nodes]

        async def get_out_values():
            res = []
            for o_id in out_ids:
                val = await self.eval_js(f"window.Sim.nodes.find(n => n.id === '{o_id}').val")
                res.append(val)
            return res

        # --- WASM Simulation Run ---
        await self.eval_js("window.Sim.setEngine('wasm')")
        await self.eval_js("window.Sim.flipPinLogic = true")
        await self.eval_js("window.Sim._netlistDirty = true; window.Sim.seedQueue(); window.Sim.processQueue();")
        
        wasm_outputs = []
        for _ in range(6):
            # Toggle Clock High -> Low
            await self.eval_js(f"window.Sim.toggleBit('{clk_id}', 0)")
            await self.eval_js(f"window.Sim.toggleBit('{clk_id}', 0)")
            wasm_outputs.append(await get_out_values())

        # --- V8 Fallback Simulation Run ---
        # Reload to ensure identical clean starting states
        # Re-write the clean layout to localStorage before reloading!
        await self.eval_js(f"localStorage.setItem('bsim_autosave', {escaped_project})")
        await self.ws.send(json.dumps({"id": 201, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(5.0)
        
        await self.eval_js("window.Sim.setEngine('v8')")
        await self.eval_js("window.Sim.flipPinLogic = true")
        await self.eval_js("window.Sim.seedQueue(); window.Sim.processQueue();")

        v8_outputs = []
        for _ in range(6):
            # Toggle Clock High -> Low
            await self.eval_js(f"window.Sim.toggleBit('{clk_id}', 0)")
            await self.eval_js(f"window.Sim.toggleBit('{clk_id}', 0)")
            v8_outputs.append(await get_out_values())

        # Assert parity between both engines
        print(f"\nWASM outputs: {wasm_outputs}")
        print(f"V8 outputs: {v8_outputs}")
        
        # We assert that the Wasm simulation successfully incremented PC-L
        self.assertEqual(wasm_outputs[0], [[1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0, 0]])
        self.assertEqual(wasm_outputs[5], [[0, 1, 1, 0, 0, 0, 0, 0], [1, 1, 1, 0, 0, 0, 0, 0]])
        
        # Assert exact parity between WASM and V8 simulation outputs
        self.assertEqual(wasm_outputs, v8_outputs)
