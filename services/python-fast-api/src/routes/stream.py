import asyncio
import json

from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

from persistence import edge_store, central_store
from pipeline.runtime import engine, EDGE_CAPACITY, CENTRAL_STORAGE_LIMIT
from simulation import _compute_pressure

stream_router = APIRouter(prefix="/api", tags=["stream"])


async def _snapshot_data(request: Request) -> dict:
    """Current pipeline state for new SSE clients; edge/central from DB so persisted data is visible after restart.
    Edge = Edge Server (local DB) only. Central = Couchbase Server central scope only. Keys must match frontend applySnapshot.
    """
    db_ready = getattr(request.app.state, "db_ready", False)

    # Edge list: from Edge Server (persisted) when available; cap at EDGE_CAPACITY so UI matches buffer size
    try:
        edge_list = await edge_store.list_docs(limit=150)
        edge_list = edge_list[-EDGE_CAPACITY:]  # most recent only
    except Exception:
        edge_list = list(engine.edge_storage)

    # Central list: from Couchbase Server when db_ready; otherwise in-memory engine fallback (never edge data; never use edge_list here)
    try:
        if db_ready:
            central_list = await central_store.list_items(limit=CENTRAL_STORAGE_LIMIT)
        else:
            central_list = list(engine.central_storage)
    except Exception:
        central_list = list(engine.central_storage)

    engine.edge_storage = list(edge_list)
    engine.central_storage = list(central_list)
    engine.edge_pressure = _compute_pressure(len(engine.edge_storage))
    return engine.get_snapshot_dict()


@stream_router.get("/stream/events")
async def event_stream(request: Request):
    queue = engine.subscribe()

    async def generate():
        try:
            # Send initial snapshot (DB-backed) so client sees persisted edge/central after refresh or restart
            snapshot = await _snapshot_data(request)
            yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            engine.unsubscribe(queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
