"""Normalize an onboarding decision into {status, band, decided_by}.

Runs on both finalize paths:

* Human path — reached as `apply_decision`, immediately after `hitl_review` in
  document order (HITL resume continues at the NEXT step, routes are not
  consulted). Reads the reviewer's answer from `compliance_decision`
  (output_key of the HITL step) and `{{ _user_id }}` for the audit trail.
* Auto path — reached as `finalize_auto` (same runner) when `route_band` sends
  a `low`-band applicant straight through. No human answer; the assessment band
  is trusted and the record is auto-approved.

Emits `approve` / `reject` so both finalize steps can route to persistence.
Writes non-PII normalized keys the downstream ModelOp steps consume.
"""

from typing import Any

from tuvl.core.nodes.base import node


@node("apply_decision")
async def apply_decision(ctx: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Resolve the final decision from either the human answer or the auto path."""
    human = ctx.get("compliance_decision") or {}
    assessment = ctx.get("assessment") or {}

    if human:
        # Human-in-the-loop path: the compliance reviewer decided.
        decision = str(human.get("decision") or "reject").strip().lower()
        band = human.get("band") or assessment.get("band") or "high"
        decided_by = str(ctx.get("_user_id") or "unknown-reviewer")
    else:
        # Auto path (low band): trust the assessment and auto-approve.
        decision = "approve"
        band = assessment.get("band") or "low"
        decided_by = "auto"

    if decision not in ("approve", "reject"):
        decision = "reject"

    status = "approved" if decision == "approve" else "rejected"

    ctx["decision_status"] = status
    ctx["decision_band"] = band
    ctx["decided_by"] = decided_by
    # Expose the applicant id as a FLAT context key. Downstream ModelOp steps
    # read `record_id`/payload ids via {{ applicant_id }}: the engine resolves a
    # ModelOp `record_id` with the flat interpolator (no dot-path support), so a
    # nested `{{ applicant_record.id }}` would render empty there.
    applicant_record = ctx.get("applicant_record") or {}
    ctx["applicant_id"] = str(applicant_record.get("id") or "")
    return ctx, decision
