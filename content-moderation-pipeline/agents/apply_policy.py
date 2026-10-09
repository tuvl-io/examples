"""Regional moderation policy — deterministic, no I/O.

EU policy is stricter: a borderline item is escalated to a violation. The
signal is the resulting category, so routing stays in the workflow.
"""

from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import ApplyPolicyIn, ApplyPolicyOut, ApplyPolicySignal


@agent("apply_policy")
async def apply_policy(inp: ApplyPolicyIn, ctx: Ctx) -> tuple[ApplyPolicyOut, ApplyPolicySignal]:
    """Apply the regional policy (EU escalates borderline to violation)"""
    category, reason = inp.verdict, inp.rationale
    if inp.region == "eu" and category == "borderline":
        category = "violation"
        reason = f"EU policy: borderline content is escalated to a violation. {reason}".strip()
    return {"category": category, "reason": reason}, category
