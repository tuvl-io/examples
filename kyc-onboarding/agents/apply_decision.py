"""Record the KYC outcome: the risk assessment and the applicant's status.

Two paths reach this agent: the automatic one (``assess`` routed ``low`` —
approve) and human review (``decision``/``band`` from a compliance officer;
the approval record and the journal hold who decided). Both writes commit in
this step's transaction.
"""

from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import FinalizeIn, FinalizeOut


@agent("apply_decision")
async def apply_decision(inp: FinalizeIn, ctx: Ctx) -> FinalizeOut:
    """Record the assessment and the applicant's final status"""
    if inp.decision is not None:
        approved = inp.decision == "approve"
        band = inp.band or "high"
        decided_by, rationale = "compliance-review", inp.note or inp.rationale
    else:
        approved, band = True, "low"
        decided_by, rationale = "auto", inp.rationale

    status = "approved" if approved else "rejected"
    applicant_id = inp.applicant.id
    await ctx.db.create(
        "RiskAssessment",
        applicant_id=applicant_id,
        score=inp.score,
        band=band,
        rationale=rationale,
        decided_by=decided_by,
    )
    await ctx.db.update("Applicant", applicant_id, status=status)
    return {"status": status, "final_band": band}
