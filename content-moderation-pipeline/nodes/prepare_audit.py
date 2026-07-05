"""Resolve runtime config and pre-compute the automated audit-trail fields.

Two jobs, both needed because they cannot be expressed declaratively in the
workflow YAML:

1. **Webhook URL.** Workflow YAML is not environment-interpolated (only
   datasource/LLM loaders resolve ``${VAR}``), so the notification target is
   read from the environment here and handed to the ``notify`` APICall via
   ``{{ webhook_url }}``. Defaults to httpbin so the demo runs with no setup.

2. **Automated audit fields.** ``persist_approved`` / ``persist_removed`` and
   their ``ModerationAction`` creates are shared between the automated and the
   human-review paths. Templates have no conditional/fallback, so the automated
   path seeds ``mod_action`` / ``mod_actor`` / ``mod_reason`` / ``item_category``
   here; the human path overrides them in ``apply_review``.
"""

import os
from typing import Any

from tuvl.core.nodes.base import node

_DEFAULT_WEBHOOK_URL = "https://httpbin.org/post"


@node("prepare_audit")
async def prepare_audit(ctx: dict[str, Any]) -> dict[str, Any]:
    classification = ctx.get("classification") or {}
    category = classification.get("category") or "borderline"
    reason = classification.get("reason") or "automated classification"

    # safe -> auto_approved; anything else on the automated path -> auto_removed.
    if category == "safe":
        mod_action = "auto_approved"
    else:
        mod_action = "auto_removed"

    return {
        **ctx,
        "webhook_url": os.environ.get("MODERATION_WEBHOOK_URL", _DEFAULT_WEBHOOK_URL),
        "item_category": category,
        "mod_action": mod_action,
        "mod_actor": "system",
        "mod_reason": reason,
        # Flat keys for the `notify` APICall body. Templates in the APICall body
        # ({{ ... }}) do not traverse nested dicts, so `{{classification.category}}`
        # and `{{classification.reason}}` resolve to empty strings. Surface the
        # (post-EU-policy) category and reason as flat context keys here so the
        # violation webhook ships the real values.
        "notify_category": category,
        "notify_reason": reason,
    }
