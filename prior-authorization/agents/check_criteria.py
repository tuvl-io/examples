from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import CheckCriteriaIn, CheckCriteriaOut, CheckCriteriaSignal


@agent("check_criteria")
async def check_criteria(inp: CheckCriteriaIn, ctx: Ctx) -> tuple[CheckCriteriaOut, CheckCriteriaSignal]:
    """Check the rule list before it can become a policy"""
    from agents._rules import problems

    found = problems(inp.criteria)
    if found:
        ctx.log.info("policy rejected", problems=found)
        return CheckCriteriaOut(rule_count=0), "invalid"
    return CheckCriteriaOut(rule_count=len(inp.criteria)), "default"
