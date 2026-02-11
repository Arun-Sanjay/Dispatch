export const wsStatePushSnippet = `@router.websocket("/ws/state")
async def ws_state(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "state", "data": get_state()})

    while True:
        payload = await websocket.receive_json()
        msg_type = payload.get("type")

        if msg_type == "init":
            state = init_session(payload)
        elif msg_type == "tick":
            state = tick_session()
        elif msg_type == "run":
            state = run_session(int(payload.get("steps", 1)))
        elif msg_type == "add_process":
            state = add_process(payload.get("process", {}))
        elif msg_type == "set_quantum":
            state = set_quantum(int(payload.get("quantum", 2)))
        elif msg_type == "set_speed":
            state = set_speed(int(payload.get("tick_ms", 200)))
        elif msg_type == "reset":
            reset_session()
            state = get_state()
        else:
            state = get_state()

        # Single source of truth: frontend only renders this server state.
        await websocket.send_json({"type": "state", "data": state})
`;
