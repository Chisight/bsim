import asyncio
import json
import urllib.request
import websockets
import unittest
import os

class TestTerminalAndMacro(unittest.IsolatedAsyncioTestCase):
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

        # Force page reload bypassing cache to load updated engine.js
        await self.ws.send(json.dumps({"id": 99, "method": "Page.reload", "params": {"ignoreCache": True}}))
        await asyncio.sleep(5.0)

        # Clear environment to get a pristine start
        await self.eval_js("""
            window.Sim.nodes.forEach(n => { const el = document.getElementById(n.id); if (el) el.remove(); });
            document.querySelectorAll('.gate').forEach(el => el.remove());
            window.Sim.nodes.length = 0;
            window.Sim.wires.length = 0;
            window.Sim.wireMap.clear();
            if (window.WireRenderer) window.WireRenderer.drawWires();
            window.Sim.library = {};
            window.Sim.directories = [];
            if (window.DebugTerminal) {
                window.DebugTerminal.cwd = '/home/bsim';
                window.DebugTerminal.symlinks = {};
                window.DebugTerminal.out.innerHTML = '';
            }
            localStorage.removeItem('bsim_autosave');
        """)

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
        msg_id = len(self.pending) + 3000
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

    async def run_terminal_command(self, cmd):
        # Execute cmd inside the virtual terminal and return terminal's printed text output
        await self.eval_js("window.DebugTerminal.out.innerHTML = ''")
        await self.eval_js(f"window.DebugTerminal.exec({json.dumps(cmd)})")
        return await self.eval_js("window.DebugTerminal.out.innerText")

    async def test_terminal_basic_commands(self):
        # 1. Test 'pwd' initially
        pwd_out = await self.run_terminal_command("pwd")
        self.assertIn("/home/bsim", pwd_out)

        # 2. Test 'mkdir' in /etc/lib/custom
        mkdir_out = await self.run_terminal_command("mkdir /etc/lib/custom/test_dir")
        self.assertIn("Created directory", mkdir_out)
        
        # Verify directory was added programmatically
        dirs = await self.eval_js("window.Sim.directories")
        self.assertIn("test_dir", dirs)

        # 3. Test 'cd' to the newly created directory
        await self.run_terminal_command("cd /etc/lib/custom/test_dir")
        cwd = await self.eval_js("window.DebugTerminal.cwd")
        self.assertEqual(cwd, "/etc/lib/custom/test_dir")

        # Verify cd prints and updates UI prompt elements
        pwd_out = await self.run_terminal_command("pwd")
        self.assertIn("/etc/lib/custom/test_dir", pwd_out)

        # 4. Create a workspace (tab) via mkdir in home directory
        mkdir_tab = await self.run_terminal_command("mkdir /home/bsim/new_test_tab")
        self.assertIn("Created workspace", mkdir_tab)

        # Check if tab was added
        tabs = await self.eval_js("window.Sim.tabs.map(t => t.name)")
        self.assertIn("new_test_tab", tabs)

        # 5. Create a symbolic link via 'ln -s'
        ln_out = await self.run_terminal_command("ln -s /etc/lib/primitives /home/bsim/my_primitives")
        self.assertIn("Created symlink", ln_out)

        symlink_target = await self.eval_js("window.DebugTerminal.symlinks['/home/bsim/my_primitives']")
        self.assertEqual(symlink_target, "/etc/lib/primitives")

    async def test_terminal_spawn_and_rm(self):
        # 1. Spawn a NOT gate programmatically via the terminal
        spawn_out = await self.run_terminal_command("spawn NOT 150 250 # my_not_gate")
        self.assertIn("Spawned NOT at 150, 250", spawn_out)

        # Verify node created with properties
        nodes = await self.eval_js("window.Sim.nodes.map(n => ({id: n.id, type: n.type, x: n.x, y: n.y}))")
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0]["id"], "my_not_gate")
        self.assertEqual(nodes[0]["type"], "NOT")
        self.assertEqual(nodes[0]["x"], 150)
        self.assertEqual(nodes[0]["y"], 250)

        # 2. Delete the node via terminal 'rm'
        rm_out = await self.run_terminal_command("rm my_not_gate")
        self.assertIn("Removed 1 item(s).", rm_out)

        # Verify the node was removed from active node list
        node_count = await self.eval_js("window.Sim.nodes.length")
        self.assertEqual(node_count, 0)

    async def test_terminal_macro_synthesis(self):
        # 1. Run bottom-up compilation
        out_not = await self.run_terminal_command("synth NOT")
        self.assertIn("[SYNTH OK] NOT compiled", out_not)

        out_and = await self.run_terminal_command("synth AND")
        self.assertIn("[SYNTH OK] AND compiled", out_and)

        out_or = await self.run_terminal_command("synth OR")
        self.assertIn("[SYNTH OK] OR compiled", out_or)

        out_xor = await self.run_terminal_command("synth XOR")
        self.assertIn("[SYNTH OK] XOR compiled", out_xor)

        # Verify XOR in library
        xor_lib = await self.eval_js("window.Sim.library['XOR']")
        self.assertIsNotNone(xor_lib)

        # 2. Spawn gates and pins
        await self.run_terminal_command("spawn IN-1 100 150 # in_a")
        await self.run_terminal_command("spawn IN-1 100 250 # in_b")
        await self.run_terminal_command("spawn XOR 200 200 # my_xor")
        await self.run_terminal_command("spawn OUT-1 300 200 # out_q")

        # Explicitly flag my_xor as custom so the simulator uses our synthesized library definition rather than native primitive logic
        await self.eval_js("window.Sim.nodes.find(n => n.id === 'my_xor').isCustom = true")

        # Verify spawn
        node_ids = await self.eval_js("window.Sim.nodes.map(n => n.id)")
        self.assertIn("in_a", node_ids)
        self.assertIn("in_b", node_ids)
        self.assertIn("my_xor", node_ids)
        self.assertIn("out_q", node_ids)

        # 3. Connect/Wire them
        w1 = await self.run_terminal_command("wire in_a out0 my_xor in0")
        self.assertIn("Wired", w1)

        w2 = await self.run_terminal_command("wire in_b out0 my_xor in1")
        self.assertIn("Wired", w2)

        w3 = await self.run_terminal_command("wire my_xor out0 out_q in0")
        self.assertIn("Wired", w3)

        # Verify 3 wires are created
        wires_count = await self.eval_js("window.Sim.wires.length")
        self.assertEqual(wires_count, 3)

        # 4. Set V8 engine and verify truth table
        await self.eval_js("window.Sim.setEngine('v8')")

        async def verify_xor_state(a_val, b_val, expected_q):
            await self.run_terminal_command(f"set in_a {a_val}")
            await self.run_terminal_command(f"set in_b {b_val}")
            await self.run_terminal_command("sim")
            await asyncio.sleep(0.5)
            q_val = await self.eval_js("window.Sim.nodes.find(n => n.id === 'out_q').val")
            self.assertEqual(q_val, expected_q, f"Failed XOR state V8: A={a_val}, B={b_val}")

        await verify_xor_state(0, 0, 0)
        await verify_xor_state(0, 1, 1)
        await verify_xor_state(1, 0, 1)
        await verify_xor_state(1, 1, 0)

        # 5. Set WASM engine and verify dual-engine parity!
        await self.eval_js("window.Sim.setEngine('wasm')")

        async def verify_xor_state_wasm(a_val, b_val, expected_q):
            await self.run_terminal_command(f"set in_a {a_val}")
            await self.run_terminal_command(f"set in_b {b_val}")
            await self.run_terminal_command("sim")
            await asyncio.sleep(0.5)
            q_val = await self.eval_js("window.Sim.nodes.find(n => n.id === 'out_q').val")
            self.assertEqual(q_val, expected_q, f"Failed XOR state WASM: A={a_val}, B={b_val}")

        await verify_xor_state_wasm(0, 0, 0)
        await verify_xor_state_wasm(0, 1, 1)
        await verify_xor_state_wasm(1, 0, 1)
        await verify_xor_state_wasm(1, 1, 0)
