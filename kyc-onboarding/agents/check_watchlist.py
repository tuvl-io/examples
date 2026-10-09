"""Sanctions/PEP watchlist check — the KYC investigator's tool.

Takes the applicant id, not a name: the applicant's PII is loaded here and
never passes through the model. A seeded stub matches against a fixed set.
"""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent

_SEEDED_WATCHLIST: set[str] = {"john doe", "ivan sanction"}


@agent("check_watchlist")
async def check_watchlist(inp: Any, ctx: Ctx) -> dict[str, Any]:
    applicant = await ctx.db.get("Applicant", inp.applicant_id)
    if applicant is None:
        return {"hit": False, "checked": False, "note": "no such applicant"}
    hit = str(applicant["full_name"]).strip().lower() in _SEEDED_WATCHLIST
    return {"hit": hit, "checked": True, "source": "seeded-stub"}
