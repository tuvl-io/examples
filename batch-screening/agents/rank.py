from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import RankIn, RankOut


@agent("rank")
async def rank(inp: RankIn, ctx: Ctx) -> RankOut:
    """Order the scored candidates and keep the best three that score 50 or more"""
    size = int(ctx.params.get("shortlist_size", 3))
    floor = int(ctx.params.get("min_score", 50))
    scored = [s for s in inp.scores if isinstance(s, dict)]
    scored.sort(key=lambda s: (-int(s["score"]), str(s["name"])))
    return RankOut(
        shortlist=[s for s in scored if int(s["score"]) >= floor][:size],
        candidate_count=len(inp.scores),
        scored_count=len(scored),
        failed_count=len(inp.scores) - len(scored),
    )
