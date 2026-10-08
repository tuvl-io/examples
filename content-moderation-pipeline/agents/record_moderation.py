"""Record the moderated item and its audit action in one transaction.

Two paths reach this agent:

  * automated — ``category``/``reason`` from the classifier and policy;
    safe items are approved, violations removed (and then notified);
  * human review — ``decision``/``note`` from a moderator (the approval
    record and the journal hold who decided).

Both rows are written through ``ctx.db``, so they commit together with this
step's checkpoint.
"""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent


@agent("record_moderation")
async def record_moderation(inp: Any, ctx: Ctx) -> tuple[dict[str, Any], str]:
    category = inp.category or "borderline"
    if inp.decision is not None:
        removed = inp.decision == "remove"
        action = "human_removed" if removed else "human_approved"
        actor, reason = "moderator", inp.note or "reviewed by a moderator"
    else:
        removed = category == "violation"
        action = "auto_removed" if removed else "auto_approved"
        actor, reason = "system", inp.reason or "automated classification"

    status = "removed" if removed else "approved"
    item = await ctx.db.create(
        "ContentItem",
        author_id=inp.author_id,
        region=inp.region,
        content=inp.content,
        category=category,
        status=status,
    )
    await ctx.db.create("ModerationAction", item_id=item["id"], action=action, actor=actor, reason=reason)
    outputs = {"item_id": item["id"], "status": status, "recorded_category": category, "action": action}
    notify = action == "auto_removed"
    return outputs, "notify" if notify else "recorded"
