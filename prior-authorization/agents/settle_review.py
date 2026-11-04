from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import SettleReviewIn, SettleReviewOut, SettleReviewSignal


@agent("settle_review")
async def settle_review(inp: SettleReviewIn, ctx: Ctx) -> tuple[SettleReviewOut, SettleReviewSignal]:
    """Store the reviewer's decision on the evaluation"""
    await ctx.db.update("Evaluation", inp.evaluation.id, status="upheld" if inp.upheld else "overridden")
    row = await ctx.db.get("Evaluation", inp.evaluation.id)
    return SettleReviewOut(settled=row), ("upheld" if inp.upheld else "overridden")
