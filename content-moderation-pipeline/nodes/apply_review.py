"""Apply the human reviewer's decision after a HITL resume.

This is the step the engine continues at when a suspended ``moderate_content``
run resumes — it is the step immediately AFTER ``hitl_review`` in document order
(a HITL step's ``routes:`` are never consulted on resume). It reads the
reviewer's answer (merged into context under ``review`` = the HITL step's
``output_key``), records the human audit fields, and emits ``approved`` /
``removed`` so the shared persist steps run with the reviewer as the actor.
"""

from typing import Any

from tuvl.core.nodes.base import node


@node("apply_review")
async def apply_review(ctx: dict[str, Any]) -> tuple[dict[str, Any], str]:
    review = ctx.get("review") or {}
    decision = str(review.get("decision") or "").strip().lower()
    note = str(review.get("note") or "").strip()

    # On resume, _user_id is the resumer (the moderator) — the audit actor.
    reviewer = str(ctx.get("_user_id") or "unknown")

    classification = ctx.get("classification") or {}
    # Classifier may have failed (routed straight to review) — fall back safely.
    item_category = classification.get("category") or "borderline"

    if decision == "approve":
        mod_action, signal = "human_approved", "approved"
    elif decision == "remove":
        mod_action, signal = "human_removed", "removed"
    else:
        # Unknown/absent decision → fail toward removal via the error route.
        ctx["_last_error"] = f"unrecognized review decision: {review.get('decision')!r}"
        return ctx, "error"

    updated = {
        **ctx,
        "item_category": item_category,
        "mod_action": mod_action,
        "mod_actor": reviewer,
        "mod_reason": note or "reviewed by moderator",
    }
    return updated, signal
