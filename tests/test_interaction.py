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

        # Force page reload bypassing cache to load updated engine.js
        await self.ws.send(json.dumps({"id": 99, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(3.0)

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

    async def test_versionless_modern_import(self):
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

        # 2. Setup a version-less modern layout string in local storage
        modern_layout = {
            "nodes": [
                {"id": "in_bus", "type": "IN-8", "x": 120, "y": 160, "label": "IN_BUS", "val": 0, "state": 0},
                {"id": "out_bus", "type": "OUT-8", "x": 320, "y": 160, "label": "OUT_BUS", "val": 0, "state": 0}
            ],
            "wires": [
                {"from": {"nodeId": "in_bus", "portId": "out0"}, "to": {"nodeId": "out_bus", "portId": "in0"}}
            ],
            "tabs": [
                {
                    "id": "tab-1",
                    "name": "Main",
                    "nodes": [
                        {"id": "in_bus", "type": "IN-8", "x": 120, "y": 160, "label": "IN_BUS", "val": 0, "state": 0},
                        {"id": "out_bus", "type": "OUT-8", "x": 320, "y": 160, "label": "OUT_BUS", "val": 0, "state": 0}
                    ],
                    "wires": [
                        {"from": {"nodeId": "in_bus", "portId": "out0"}, "to": {"nodeId": "out_bus", "portId": "in0"}}
                    ]
                }
            ],
            "activeTabId": "tab-1",
            "prefs": {
                "flipPinLogic": True,
                "uiScale": 1.0
            }
        }
        
        escaped_layout = json.dumps(modern_layout)
        await self.eval_js(f"localStorage.setItem('bsim_autosave', '{escaped_layout}')")

        # 3. Reload the page bypassing cache
        await self.ws.send(json.dumps({"id": 400, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(3.0)

        # 4. Assert that compatibility heuristics detected the epoch as 'modern'
        # and did NOT execute legacy wire flipping (should remain out0/in0)
        from_port = await self.eval_js("window.Sim.wires[0].from.portId")
        to_port = await self.eval_js("window.Sim.wires[0].to.portId")
        
        self.assertEqual(from_port, "out0")
        self.assertEqual(to_port, "in0")

        # 5. Assert that write-back version locking stamped and saved the current version
        raw_autosave = await self.eval_js("localStorage.getItem('bsim_autosave')")
        autosave_data = json.loads(raw_autosave)
        self.assertIsNotNone(autosave_data.get("meta"))
        self.assertIn("1.27.29", autosave_data["meta"].get("version", ""))

    async def test_dbsim_export_and_import(self):
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

        # 2. Toggle Debug Mode in Sim preferences
        await self.eval_js("window.Sim.debugMode = true; window.Sim.autoSave();")
        debug_mode_active = await self.eval_js("window.Sim.debugMode")
        self.assertTrue(debug_mode_active)

        # 3. Add components to the workspace
        await self.eval_js("window.Sim.nodes.push(window.Sim._cleanNode({id: 'node_dbsim', type: 'IN-1', x: 150, y: 150, label: 'DBSIM_TEST', val: 1, state: 1}))")
        await self.eval_js("window.NodeRenderer.renderNode(window.Sim.nodes[0])")

        # 4. Programmatically run the snapshot serialization block and return payload
        payload = await self.eval_js("""
            (() => {
                let mainNodes = window.Sim.nodes;
                let mainWires = window.Sim.wires;
                const cNodes = mainNodes.map(n => window.Sim._cleanNode(n)).filter(n => n !== null);
                const cWires = mainWires.map(w => window.Sim._cleanWire(w)).filter(w => w !== null);
                const cLib = {};
                Object.keys(window.Sim.library).forEach(k => {
                    if (window.Sim.library[k]) {
                        cLib[k] = {
                            nodes: (window.Sim.library[k].nodes || []).map(n => window.Sim._cleanNode(n)).filter(n => n !== null),
                            wires: (window.Sim.library[k].wires || []).map(w => window.Sim._cleanWire(w)).filter(w => w !== null),
                            folder: window.Sim.library[k].folder || ''
                        };
                    }
                });
                return {
                    nodes: cNodes,
                    wires: cWires,
                    library: cLib,
                    meta: {
                        version: (window.LOADED_BSIM_VERSION || "1.27.29") + "-Modular",
                        exportedAt: new Date().toISOString(),
                        type: "dbsim_snapshot",
                        activeTabId: window.Sim.activeTabId,
                        activeEditingChip: window.Sim.activeEditingChip
                    }
                };
            })()
        """)

        # 5. Assert the snapshot conforms to dbsim format specifications
        self.assertIsNotNone(payload)
        self.assertIsNotNone(payload.get("meta"))
        self.assertEqual(payload["meta"].get("type"), "dbsim_snapshot")
        self.assertEqual(len(payload.get("nodes", [])), 1)
        self.assertEqual(payload["nodes"][0].get("id"), "node_dbsim")
        self.assertEqual(payload["nodes"][0].get("label"), "DBSIM_TEST")

    async def test_tristate_contention_and_renaming_lockup(self):
        # Set engine to V8 mode for custom logic checks
        await self.eval_js("window.Sim.setEngine('v8')")

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

        # 2. Add components: two tristates, a junction, and four inputs to control the tristates
        await self.eval_js("""
            window.Sim.nodes.push(window.Sim._cleanNode({id: 't1', type: 'TRISTATE', x: 200, y: 100, label: 'T1'}));
            window.Sim.nodes.push(window.Sim._cleanNode({id: 't2', type: 'TRISTATE', x: 200, y: 300, label: 'T2'}));
            window.Sim.nodes.push(window.Sim._cleanNode({id: 'j1', type: 'JUNCTION', x: 400, y: 200, label: 'J1'}));

            window.Sim.nodes.push(window.Sim._cleanNode({id: 't1_in', type: 'IN-1', x: 50, y: 50, label: 'T1_IN', val: 0, state: 0}));
            window.Sim.nodes.push(window.Sim._cleanNode({id: 't1_en', type: 'IN-1', x: 50, y: 150, label: 'T1_EN', val: 0, state: 0}));
            window.Sim.nodes.push(window.Sim._cleanNode({id: 't2_in', type: 'IN-1', x: 50, y: 250, label: 'T2_IN', val: 0, state: 0}));
            window.Sim.nodes.push(window.Sim._cleanNode({id: 't2_en', type: 'IN-1', x: 50, y: 350, label: 'T2_EN', val: 0, state: 0}));

            window.Sim.nodes.forEach(n => window.NodeRenderer.renderNode(n));
        """)

        # 3. Connect control lines and tristate outputs to the junction
        await self.eval_js("""
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't1_in', portId: 'out0'}, to: {nodeId: 't1', portId: 'in'}}));
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't1_en', portId: 'out0'}, to: {nodeId: 't1', portId: 'en'}}));
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't2_in', portId: 'out0'}, to: {nodeId: 't2', portId: 'in'}}));
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't2_en', portId: 'out0'}, to: {nodeId: 't2', portId: 'en'}}));
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't1', portId: 'out'}, to: {nodeId: 'j1', portId: 'j'}}));
            window.Sim.wires.push(window.Sim._cleanWire({from: {nodeId: 't2', portId: 'out'}, to: {nodeId: 'j1', portId: 'j'}}));

            window.WireRenderer.drawWires();
        """)

        # Scenario A: Both tristates disabled (none are outputting) -> high impedance 'Z'
        await self.eval_js("""
            window.Sim.nodes.find(n => n.id === 't1_en').state = 0;
            window.Sim.nodes.find(n => n.id === 't1_en').val = 0;
            window.Sim.nodes.find(n => n.id === 't2_en').state = 0;
            window.Sim.nodes.find(n => n.id === 't2_en').val = 0;
            window.Sim.seedQueue();
            window.Sim.processQueue();
        """)
        sig = await self.eval_js("window.Sim.getDrivingSignal('j1', 'j')")
        self.assertEqual(sig, 'Z')

        # Scenario B: T1 enabled outputting 1, T2 disabled -> J1 should be 1
        await self.eval_js("""
            window.Sim.nodes.find(n => n.id === 't1_en').state = 1;
            window.Sim.nodes.find(n => n.id === 't1_en').val = 1;
            window.Sim.nodes.find(n => n.id === 't1_in').state = 1;
            window.Sim.nodes.find(n => n.id === 't1_in').val = 1;
            window.Sim.seedQueue();
            window.Sim.processQueue();
        """)
        sig = await self.eval_js("window.Sim.getDrivingSignal('j1', 'j')")
        self.assertEqual(sig, 1)

        # Scenario C: T1 enabled outputting 1, T2 enabled outputting 0 -> contention error 'E'
        await self.eval_js("""
            window.Sim.nodes.find(n => n.id === 't2_en').state = 1;
            window.Sim.nodes.find(n => n.id === 't2_en').val = 1;
            window.Sim.nodes.find(n => n.id === 't2_in').state = 0;
            window.Sim.nodes.find(n => n.id === 't2_in').val = 0;
            window.Sim.seedQueue();
            window.Sim.processQueue();
        """)
        sig = await self.eval_js("window.Sim.getDrivingSignal('j1', 'j')")
        self.assertEqual(sig, 'E')

        # 4. Test Renaming Lockup: Rename an input component and ensure it doesn't freeze or lock
        await self.eval_js("""
            const targetNode = window.Sim.nodes.find(n => n.id === 't1_in');
            const targetDiv = document.getElementById('t1_in');
            window.InteractionHandler.handleNodeDblClick(new Event('dblclick'), targetNode, targetDiv);
            
            const inputEl = targetDiv.querySelector('.gate-label input');
            if (inputEl) {
                inputEl.value = 'RENAMED_INPUT';
                inputEl.blur();
            }
        """)
        
        # Verify the renamed node exists, has the updated label, and retains drag handlers
        node_label = await self.eval_js("window.Sim.nodes.find(n => n.id === 't1_in').label")
        self.assertEqual(node_label, 'RENAMED_INPUT')
        
        div_exists = await self.eval_js("document.getElementById('t1_in') !== null")
        self.assertTrue(div_exists)
        
        drag_handler_type = await self.eval_js("typeof document.getElementById('t1_in').onmousedown")
        self.assertEqual(drag_handler_type, 'function')

