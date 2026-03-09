import db


async def upsert_item(item: dict) -> bool:
    return await db.upsert_drained_to_central_async(item)


async def list_items(limit: int = 30) -> list[dict]:
    return await db.central_list_storage_async(limit=limit)


async def clear_all() -> None:
    await db.central_clear_all_async()
