from fastapi import APIRouter
from pydantic import BaseModel

from simulation import engine

connection_router = APIRouter(prefix="/api", tags=["connection"])


class ConnectionBody(BaseModel):
    online: bool


@connection_router.post("/connection")
async def toggle_connection(body: ConnectionBody):
    engine.set_online(body.online)
    return {"ok": True}


class MeshGatewayBody(BaseModel):
    active: bool


@connection_router.post("/mesh-gateway")
async def toggle_mesh_gateway(body: MeshGatewayBody):
    engine.set_mesh_gateway_active(body.active)
    return {"ok": True}
