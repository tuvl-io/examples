"""Route billing tickets to the investigator — a placeholder for a `decide` rule."""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent


@agent("route_by_category")
async def route_by_category(inp: Any, ctx: Ctx) -> str:
    return "investigate" if inp.category == "billing" else "store"
