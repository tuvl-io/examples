from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import LoadPolicyIn, LoadPolicyOut, LoadPolicySignal


@agent("load_policy")
async def load_policy(inp: LoadPolicyIn, ctx: Ctx) -> tuple[LoadPolicyOut, LoadPolicySignal]:
    """The active policy version for the procedure"""
    rows = await ctx.db.list("PolicyVersion", limit=100, procedure_code=inp.procedure_code, status="active")
    if not rows:
        return LoadPolicyOut(policy=None), "no_policy"
    newest = max(rows, key=lambda r: str(r.get("created_at") or ""))
    return LoadPolicyOut(policy=newest), "default"
