from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import ActivatePolicyIn, ActivatePolicyOut


@agent("activate_policy")
async def activate_policy(inp: ActivatePolicyIn, ctx: Ctx) -> ActivatePolicyOut:
    """Retire the active version and activate the new one"""
    for old in await ctx.db.list("PolicyVersion", limit=100, procedure_code=inp.procedure_code, status="active"):
        await ctx.db.update("PolicyVersion", old["id"], status="retired")
    row = await ctx.db.create(
        "PolicyVersion",
        procedure_code=inp.procedure_code,
        version=inp.version,
        source_ref=inp.source_ref,
        status="active",
        criteria=inp.criteria,
    )
    return ActivatePolicyOut(policy=row)
