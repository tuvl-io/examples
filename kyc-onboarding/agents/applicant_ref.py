"""Project the stored applicant down to its id — what the investigator may see."""

from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import ApplicantRefIn, ApplicantRefOut


@agent("applicant_ref")
async def applicant_ref(inp: ApplicantRefIn, ctx: Ctx) -> ApplicantRefOut:
    """Keep only the applicant id for the investigator"""
    return {"applicant_id": inp.applicant.id}
