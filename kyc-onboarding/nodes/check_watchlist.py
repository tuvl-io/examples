"""Deterministic stub watchlist check — an AutonomousAgent tool.

The `investigate` AutonomousAgent step calls this tool with a `name` argument.
It compares (case-insensitively) against a small seeded fake watchlist and
returns a structured result to the model. This is a stub by design (see the
project spec "Out of scope"): swap in a real sanctions/PEP provider later.

Only the delta this node produces is fed back to the model (the tool declares
no `writes_context: true`), so nothing here mutates the shared workflow context.
"""

from typing import Any

from tuvl.core.nodes.base import node

# Two seeded names that deterministically trip the watchlist for the demo drills.
_SEEDED_WATCHLIST: set[str] = {"john doe", "ivan sanction"}


@node("check_watchlist")
async def check_watchlist(ctx: dict[str, Any]) -> dict[str, Any]:
    """Return whether the supplied name matches the seeded watchlist."""
    name = str(ctx.get("name") or "").strip().lower()
    hit = name in _SEEDED_WATCHLIST
    return {
        **ctx,
        "watchlist_checked": True,
        "watchlist_hit": hit,
        "watchlist_match": name if hit else None,
        "watchlist_source": "seeded-stub",
    }
