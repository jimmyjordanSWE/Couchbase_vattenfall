import db


def init() -> None:
    db.init_db()


async def save_pipeline_state(state_dict: dict) -> None:
    await db.save_pipeline_state(state_dict)


async def load_pipeline_state() -> dict | None:
    return await db.load_pipeline_state()


async def save_model_state(state_dict: dict) -> None:
    await db.save_model_state(state_dict)
