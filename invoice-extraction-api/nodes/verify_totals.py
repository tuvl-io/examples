"""Deterministic invoice verification.

Reads the LLM-extracted invoice from ``context["extracted"]`` and checks two
things, with no LLM call and no I/O:

  1. every required field is present (non-null) and numeric where applicable, and
  2. ``subtotal + tax == total`` within a 0.01 tolerance.

Three outcomes, so the workflow never tries to persist an un-persistable row:

  * ``valid``      — both checks pass; the record is persisted (status extracted).
  * ``mismatch``   — all required fields are present & numeric but the arithmetic
                     is wrong (a doctored invoice). A ``rejected`` record IS
                     persistable, so this routes to ``persist_rejected``.
  * ``incomplete`` — one or more required fields are missing or non-numeric
                     (garbage / empty extraction). We must NOT try to persist a
                     row with null NOT-NULL columns (that would raise a DB error
                     and surface as a 500), so this routes straight to
                     ``respond_failed`` — a clean business error, no record.

The verdict is written to ``context["verification"] = {"ok": bool, "reasons":
[...]}`` for the response/persistence steps downstream.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from tuvl.core.nodes.base import node

# Fields the Invoice model marks required (excluding server-set status/id).
REQUIRED_FIELDS = (
    "vendor_name",
    "invoice_number",
    "currency",
    "subtotal",
    "tax",
    "total",
)

TOLERANCE = Decimal("0.01")


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


@node("verify_totals")
async def verify_totals(ctx: dict[str, Any]) -> tuple[dict[str, Any], str]:
    extracted = ctx.get("extracted") or {}

    if not isinstance(extracted, dict):
        ctx["verification"] = {"ok": False, "reasons": ["no structured data extracted"]}
        return ctx, "incomplete"

    reasons: list[str] = []

    def _present(value: Any) -> bool:
        return not (value is None or (isinstance(value, str) and value.strip() == ""))

    # 1. Required-field presence.
    for field in REQUIRED_FIELDS:
        if not _present(extracted.get(field)):
            reasons.append(f"missing required field: {field}")

    # 2. The three money fields must be numeric to be persistable at all. Only
    #    flag values that are PRESENT but unparseable — absent ones are already
    #    reported as missing above (avoids duplicate reasons).
    subtotal = _to_decimal(extracted.get("subtotal"))
    tax = _to_decimal(extracted.get("tax"))
    total = _to_decimal(extracted.get("total"))
    for fname, parsed in (("subtotal", subtotal), ("tax", tax), ("total", total)):
        raw = extracted.get(fname)
        if _present(raw) and parsed is None:
            reasons.append(f"{fname} is not a valid number: {raw!r}")

    # Missing/non-numeric required fields => an un-persistable record (would hit
    # a NOT-NULL / type violation). Return a clean business failure instead of
    # letting the ModelOp raise a 500.
    if reasons:
        ctx["verification"] = {"ok": False, "reasons": reasons}
        return ctx, "incomplete"

    # 3. All required fields present & numeric: only the arithmetic can fail now.
    #    A mismatch here is still persistable as a `rejected` record.
    if abs((subtotal + tax) - total) > TOLERANCE:
        ctx["verification"] = {
            "ok": False,
            "reasons": [
                f"total mismatch: subtotal ({subtotal}) + tax ({tax}) "
                f"!= total ({total})"
            ],
        }
        return ctx, "mismatch"

    ctx["verification"] = {"ok": True, "reasons": []}
    return ctx, "valid"
