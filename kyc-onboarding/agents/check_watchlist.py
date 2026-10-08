"""Sanctions/PEP watchlist check — the investigator's tool.

Used by the ``investigate`` loop agent once loops land (tuvl 2.0 phase 2).
A seeded stub: matches the name against a fixed set.
"""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent

_SEEDED_WATCHLIST: set[str] = {"john doe", "ivan sanction"}


@agent("check_watchlist")
async def check_watchlist(inp: Any, ctx: Ctx) -> dict[str, Any]:
    name = str(inp.name or "").strip().lower()
    hit = name in _SEEDED_WATCHLIST
    return {"hit": hit, "match": name if hit else None, "source": "seeded-stub"}
