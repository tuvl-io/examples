from tuvl.core.nodes.base import node

# A stand-in "account service". A real deployment would hit a DB or an API;
# here it returns canned account state keyed off whatever the agent passes as
# customer_id, so the autonomous loop has something concrete to reason over.
_ACCOUNTS = {
    "cust_001": {"plan": "pro", "balance_due": 42.0, "dispute": False,
                 "note": "double-charged for one month after a plan change"},
    "cust_002": {"plan": "enterprise", "balance_due": 1300.0, "dispute": True,
                 "note": "open chargeback dispute on the last invoice"},
}


@node("lookup_account")
async def lookup_account(ctx: dict) -> dict:
    cid = str(ctx.get("customer_id") or "").strip()
    account = _ACCOUNTS.get(cid, {"plan": "unknown", "balance_due": 0.0,
                                  "dispute": False, "note": "no account on file"})
    return {**ctx, "account": account}
