"""Billing account lookup — the triage investigator's tool (seeded stub data)."""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent

_ACCOUNTS = {
    "cust_001": {"plan": "pro", "balance_due": 42.0, "dispute": False,
                 "note": "double-charged for one month after a plan change"},
    "cust_002": {"plan": "enterprise", "balance_due": 1300.0, "dispute": True,
                 "note": "open chargeback dispute on the last invoice"},
    "cust_003": {"plan": "team", "balance_due": 240.0, "dispute": False,
                 "note": "billed twice for the annual renewal; overcharged by 120"},
}
_UNKNOWN = {"plan": "unknown", "balance_due": 0.0, "dispute": False, "note": "no account on file"}


@agent("lookup_account")
async def lookup_account(inp: Any, ctx: Ctx) -> dict[str, Any]:
    return {"account": _ACCOUNTS.get(str(inp.customer_id or "").strip(), _UNKNOWN)}
