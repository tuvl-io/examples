"""Billing account lookup — the investigator's tool (used once loops land)."""

from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent

_ACCOUNTS = {
    "cust_001": {"plan": "pro", "balance_due": 42.0, "dispute": False,
                 "note": "double-charged for one month after a plan change"},
    "cust_002": {"plan": "enterprise", "balance_due": 1300.0, "dispute": True,
                 "note": "open chargeback dispute on the last invoice"},
}
_UNKNOWN = {"plan": "unknown", "balance_due": 0.0, "dispute": False, "note": "no account on file"}


@agent("lookup_account")
async def lookup_account(inp: Any, ctx: Ctx) -> dict[str, Any]:
    return {"account": _ACCOUNTS.get(str(inp.customer_id or "").strip(), _UNKNOWN)}
