"""Billing account lookup — the triage investigator's tool (seeded stub data)."""

from __future__ import annotations

from tuvl import Ctx, agent

from agents._generated.schemas import LookupAccountIn, LookupAccountOut

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
async def lookup_account(inp: LookupAccountIn, ctx: Ctx) -> LookupAccountOut:
    """
    Look up a customer's billing account (plan, balance due, dispute flag) by
    customer_id
    """
    return {"account": _ACCOUNTS.get(str(inp.customer_id or "").strip(), _UNKNOWN)}
