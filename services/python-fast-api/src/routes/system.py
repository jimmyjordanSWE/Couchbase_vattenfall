from fastapi import APIRouter

import db
from simulation import engine

system_router = APIRouter(prefix="/api/system", tags=["system"])


@system_router.get("/config")
async def get_config():
    return engine.get_config_dict()


@system_router.get("/status")
async def get_status():
    return engine.get_status_dict()


@system_router.post("/initialize")
async def initialize():
    engine.initialize()
    return {"ok": True}


@system_router.post("/start")
async def start_simulation():
    await engine.start()
    return {"ok": True}


@system_router.post("/stop")
async def stop_simulation():
    await engine.stop()
    return {"ok": True}


@system_router.post("/clear-database")
async def clear_database():
    was_running = engine.is_running

    if was_running:
        await engine.stop()

    edge_deleted = await db.edge_clear_all_docs()
    central_deleted = await db.clear_central_pipeline_data()
    engine.reset_pipeline_state()

    if was_running:
        await engine.start()

    return {
        "ok": True,
        "edgeDeleted": edge_deleted,
        "centralDeleted": central_deleted,
    }
