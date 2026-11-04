from __future__ import annotations

from collections import Counter
from uuid import UUID

from tuvl import Ctx, agent

from agents._generated.schemas import RecordPassIn, RecordPassOut


@agent("record_evaluation")
async def record_evaluation(inp: RecordPassIn, ctx: Ctx) -> RecordPassOut:
    """Store a Pass with its report and findings"""
    if inp.policy is None:
        raise ValueError("no policy to record against")
    verdict = ctx.params["verdict"]
    counts = Counter(f["outcome"] for f in inp.findings)
    report = {
        "policy": {
            "id": str(inp.policy.id),
            "procedure_code": inp.policy.procedure_code,
            "version": inp.policy.version,
            "source_ref": inp.policy.source_ref,
        },
        "verdict": verdict,
        "run_id": str(ctx.run_id),
        "requested_by": str(ctx.principal),
        "counts": {k: counts.get(k, 0) for k in ("met", "not_met", "missing_evidence")},
        "findings": inp.findings,
    }
    evaluation = await ctx.db.create(
        "Evaluation",
        member_ref=inp.member_ref,
        procedure_code=inp.procedure_code,
        policy_version_id=inp.policy.id,
        verdict=verdict,
        status="in_review" if verdict == "block" else "final",
        report=report,
    )
    for f in inp.findings:
        await ctx.db.create(
            "Finding",
            evaluation_id=evaluation["id"],
            rule_id=f["rule_id"],
            outcome=f["outcome"],
            severity=f["severity"],
            evidence_id=UUID(f["evidence_id"]) if f["evidence_id"] else None,
            detail=f["detail"],
        )
    return RecordPassOut(evaluation=evaluation)
