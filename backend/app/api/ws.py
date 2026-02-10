from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.session import (
    add_process,
    get_state,
    init_session,
    reset_session,
    run_session,
    set_config,
    set_quantum,
    set_speed,
    tick_session,
)

router = APIRouter()


async def _send_state(ws: WebSocket) -> None:
    await ws.send_json({"type": "state", "data": get_state()})


@router.websocket("/ws/state")
async def ws_state(websocket: WebSocket) -> None:
    await websocket.accept()
    await _send_state(websocket)

    try:
        while True:
            msg: Dict[str, Any] = await websocket.receive_json()
            mtype = str(msg.get("type", "")).lower()

            if mtype == "init":
                payload = dict(msg)
                payload.pop("type", None)
                init_session(payload)
            elif mtype == "tick":
                tick_session()
            elif mtype == "run":
                run_session(int(msg.get("steps", 1)))
            elif mtype == "add_process":
                try:
                    add_process(msg.get("process") or {})
                except ValueError:
                    pass
            elif mtype == "config":
                set_config(msg)
            elif mtype == "reset":
                reset_session()
            elif mtype == "set_speed":
                set_speed(int(msg.get("tick_ms", 200)))
            elif mtype == "set_quantum":
                set_quantum(int(msg.get("q", msg.get("quantum", 2))))

            await _send_state(websocket)
    except WebSocketDisconnect:
        return
