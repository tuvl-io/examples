"""Apply the stricter EU moderation threshold to the classifier category.

EU submissions are held to a tighter bar: content the model rated ``borderline``
is escalated to ``violation`` (auto-removed) rather than being sent for human
review. This is a deliberately small, deterministic policy tweak — it exists to
show a ``Router`` ``match:`` branch changing an outcome, not to model real
regional law.
"""

from typing import Any

from tuvl.core.nodes.base import node


@node("apply_eu_policy")
async def apply_eu_policy(ctx: dict[str, Any]) -> dict[str, Any]:
    classification = dict(ctx.get("classification") or {})
    if classification.get("category") == "borderline":
        classification["category"] = "violation"
        classification["reason"] = (
            "EU policy: borderline content is escalated to a violation. "
            + str(classification.get("reason") or "")
        ).strip()
    return {**ctx, "classification": classification}
