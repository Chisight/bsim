import asyncio
import json
import urllib.request
import websockets
import unittest
import os

class TestInteraction(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        try:
            response = urllib.request.urlopen("http://localhost:9222/json/list")
            data = json.loads(response.read().decode())
            self.ws_url = next(item["webSocketDebuggerUrl"] for item in data if item.get("type") == "page" and "localhost:8000" in item.get("url", ""))
        except Exception as e:
            self.fail(f"Could not find bSim browser page running on port 8000: {e}")

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
        msg_id = len(self.pending) + 2000
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

    async def test_ui_spawn_and_wire(self):
        # 1. Start with a completely blank workspace programmatically in-place
        await self.eval_js("""
            window.Sim.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
            document.querySelectorAll('.gate').forEach(el => el.remove());
            window.Sim.nodes.length = 0;
            window.Sim.wires.length = 0;
            window.Sim.wireMap.clear();
            if (window.WireRenderer) window.WireRenderer.drawWires();
            localStorage.removeItem('bsim_autosave');
        """)

        # Ensure empty workspace
        nodes_len = await self.eval_js("window.Sim.nodes.length")
        wires_len = await self.eval_js("window.Sim.wires.length")
        self.assertEqual(nodes_len, 0)
        self.assertEqual(wires_len, 0)

        # 2. Programmatically trigger creation of primitive logic gates
        # (This mimics selecting them from the sidebar / adding them to model)
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'in1', type: 'IN-1', x: 100, y: 100, label: 'IN-1', val: 0, state: 0}))")
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'not1', type: 'NOT', x: 250, y: 100, label: 'NOT', val: 0, state: 0}))")
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'out1', type: 'OUT-1', x: 400, y: 100, label: 'OUT-1', val: 0, state: 0}))")
        
        # Redraw components
        await self.eval_js("window.Sim.nodes.forEach(n => window.NodeRenderer.renderNode(n))")
        
        # Assert nodes created successfully
        nodes_len = await self.eval_js("window.Sim.nodes.length")
        self.assertEqual(nodes_len, 3)

        # 3. Create wires between them
        await self.eval_js("window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 'in1', portId: 'out0'}, to: {nodeId: 'not1', portId: 'a'}}))")
        await self.eval_js("window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 'not1', portId: 'q'}, to: {nodeId: 'out1', portId: 'in0'}}))")
        
        # Redraw wires
        await self.eval_js("window.WireRenderer.drawWires()")
        
        # Assert wires created successfully
        wires_len = await self.eval_js("window.Sim.wires.length")
        self.assertEqual(wires_len, 2)

        # 4. Run propagation in V8 mode and assert NOT gate behaves correctly
        await self.eval_js("window.Sim.setEngine('v8')")
        await self.eval_js("window.Sim.seedQueue(); window.Sim.processQueue();")

        # By default, Input=0 -> NOT=1 -> Output=1
        out_val = await self.eval_js("window.Sim.nodes.find(n => n.id === 'out1').val")
        self.assertEqual(out_val, 1)

        # 5. Toggle input to 1 -> NOT=0 -> Output=0
        await self.eval_js("window.Sim.toggleBit('in1', 0)")
        out_val = await self.eval_js("window.Sim.nodes.find(n => n.id === 'out1').val")
        self.assertEqual(out_val, 0)

        # Toggle input back to 0 -> NOT=1 -> Output=1
        await self.eval_js("window.Sim.toggleBit('in1', 0)")
        out_val = await self.eval_js("window.Sim.nodes.find(n => n.id === 'out1').val")
        self.assertEqual(out_val, 1)

    async def test_reload_wire_persistence(self):
        # 1. Blank out workspace
        await self.eval_js("""
            window.Sim.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
            document.querySelectorAll('.gate').forEach(el => el.remove());
            window.Sim.nodes.length = 0;
            window.Sim.wires.length = 0;
            window.Sim.wireMap.clear();
            if (window.WireRenderer) window.WireRenderer.drawWires();
            localStorage.removeItem('bsim_autosave');
        """)

        # Ensure empty workspace
        nodes_len = await self.eval_js("window.Sim.nodes.length")
        wires_len = await self.eval_js("window.Sim.wires.length")
        self.assertEqual(nodes_len, 0)
        self.assertEqual(wires_len, 0)

        # 2. Add an IN-8 and an OUT-8 node
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'in_bus', type: 'IN-8', x: 100, y: 150, label: 'IN_BUS', val: 0, state: 0}))")
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'out_bus', type: 'OUT-8', x: 300, y: 150, label: 'OUT_BUS', val: 0, state: 0}))")
        await self.eval_js("window.Sim.nodes.forEach(n => window.NodeRenderer.renderNode(n))")

        # 3. Create a wire from in_bus port 'out0' to out_bus port 'in0'
        await self.eval_js("window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 'in_bus', portId: 'out0'}, to: {nodeId: 'out_bus', portId: 'in0'}}))")
        await self.eval_js("window.WireRenderer.drawWires()")

        # Verify drawn ports
        from_port = await self.eval_js("window.Sim.wires[0].from.portId")
        to_port = await self.eval_js("window.Sim.wires[0].to.portId")
        self.assertEqual(from_port, "out0")
        self.assertEqual(to_port, "in0")

        # 4. Trigger autoSave and wait for the debounced write to complete
        await self.eval_js("window.Sim.autoSave()")
        await asyncio.sleep(1.0)

        # 5. Reload the page (simulating Ctrl+Shift+R / page refresh)
        await self.ws.send(json.dumps({"id": 300, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(3.0)

        # 6. Retrieve the wire ports after reload and assert they did NOT flip
        loaded_from_port = await self.eval_js("window.Sim.wires[0].from.portId")
        loaded_to_port = await self.eval_js("window.Sim.wires[0].to.portId")
        
        self.assertEqual(loaded_from_port, "out0")
        self.assertEqual(loaded_to_port, "in0")
