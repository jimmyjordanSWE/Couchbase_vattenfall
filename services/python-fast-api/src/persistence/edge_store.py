import db


async def put(doc: dict, key: str, *, keyspace: str = "central.data") -> None:
    await db.edge_put_async(doc, key, keyspace=keyspace)


async def delete(key: str, keyspace: str = "central.data") -> None:
    await db.edge_delete_async(key, keyspace=keyspace)


async def list_docs(limit: int = 100, keyspace: str = "central.data") -> list[dict]:
    return await db.edge_list_docs_async(limit=limit, keyspace=keyspace)


async def clear_all() -> None:
    await db.edge_clear_all_async()
