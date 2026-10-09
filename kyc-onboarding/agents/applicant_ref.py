"""Project the stored applicant down to its id — what the investigator may see."""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent


@agent("applicant_ref")
async def applicant_ref(inp: Any, ctx: Ctx) -> dict[str, Any]:
    return {"applicant_id": inp.applicant.id}
