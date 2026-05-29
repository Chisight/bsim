import asyncio
import json
import urllib.request
import websockets
import sys

async def get_ws_url():
    try:
        response = urllib.request.urlopen("http://localhost:9222/json/list")
        data = json.loads(response.read().decode())
        for item in data:
            if item.get("type") == "page" and "localhost:8000" in item.get("url", ""):
                return item["webSocketDebuggerUrl"]
    except Exception as e:
        print(f"Error fetching page list: {e}")
    return None

async def run_debug():
    ws_url = await get_ws_url()
    if not ws_url:
        print("Could not find bSim page WebSocket URL")
        return

    print(f"Connecting to {ws_url}...")
    async with websockets.connect(ws_url) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await ws.send(json.dumps({"id": 2, "method": "Log.enable"}))
        
        pending_requests = {}

        async def listen():
            try:
                async for msg in ws:
                    event = json.loads(msg)
                    msg_id = event.get("id")
                    if msg_id is not None and msg_id in pending_requests:
                        fut = pending_requests.pop(msg_id)
                        if not fut.done():
                            fut.set_result(event)
            except asyncio.CancelledError:
                pass

        listener_task = asyncio.create_task(listen())
        await asyncio.sleep(1)

        msg_id = 10
        async def eval_js(expression):
            nonlocal msg_id
            msg_id += 1
            payload = {
                "id": msg_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": f"(() => {{ try {{ return JSON.stringify({expression}); }} catch(e) {{ return 'Error: ' + e.message; }} }})()",
                    "returnByValue": True
                }
            }
            fut = asyncio.get_running_loop().create_future()
            pending_requests[msg_id] = fut
            await ws.send(json.dumps(payload))
            res_obj = await fut
            result = res_obj.get("result", {}).get("result", {})
            val = result.get("value")
            if val and val.startswith("Error:"):
                return val
            try:
                return json.loads(val) if val else None
            except:
                return val

        # Print all wires in the main workspace
        wires = await eval_js("window.Sim.wires")
        print("\n--- Wires in Workspace ---")
        for w in wires:
            print(f"  {w['from']['nodeId']}[{w['from']['portId']}] -> {w['to']['nodeId']}[{w['to']['portId']}]")

        # Print ONE definition
        one_def = await eval_js("window.Sim.library['ONE']")
        print("\n--- library['ONE'] ---")
        if one_def:
            print(f"  Nodes: {one_def.get('nodes')}")
            print(f"  Wires: {one_def.get('wires')}")
        else:
            print("  ONE not in library")

        # Let's inspect Sim.nodes types and labels
        nodes = await eval_js("window.Sim.nodes.map(n => ({id: n.id, label: n.label, type: n.type}))")
        print("\n--- Nodes in Workspace ---")
        for n in nodes:
            print(f"  {n['id']} | {n['label']} | {n['type']}")

        listener_task.cancel()
        await listener_task

if __name__ == "__main__":
    asyncio.run(run_debug())
