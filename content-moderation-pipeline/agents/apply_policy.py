"""Regional moderation policy — deterministic, no I/O.

EU policy is stricter: a borderline item is escalated to a violation. The
signal is the resulting category, so routing stays in the workflow.
"""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent


@agent("apply_policy")
async def apply_policy(inp: Any, ctx: Ctx) -> tuple[dict[str, Any], str]:
    category, reason = inp.verdict, inp.rationale
    if inp.region == "eu" and category == "borderline":
        category = "violation"
        reason = f"EU policy: borderline content is escalated to a violation. {reason}".strip()
    return {"category": category, "reason": reason}, category
