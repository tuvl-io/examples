"""Deterministic invoice verification — no LLM call, no I/O.

Checks the extracted fields and routes one of three signals:

  * ``valid``      — required fields present and numeric, and
                     subtotal + tax == total (±0.01): store it as ``extracted``.
  * ``mismatch``   — fields present but the arithmetic is wrong (a doctored
                     invoice): still storable, as ``rejected``.
  * ``incomplete`` — a required field is missing or not a number: nothing is
                     storable, so the workflow answers with a clean 422.

``valid``/``mismatch`` produce ``invoice`` (an ``Invoice.create``) and
``verification``; ``incomplete`` produces only ``verification``.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from tuvl import Ctx, agent

REQUIRED_FIELDS = ("vendor_name", "invoice_number", "currency", "subtotal", "tax", "total")
TOLERANCE = Decimal("0.01")


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _present(value: Any) -> bool:
    return not (value is None or (isinstance(value, str) and value.strip() == ""))


@agent("verify_totals")
async def verify_totals(inp: Any, ctx: Ctx) -> tuple[dict[str, Any], str]:
    fields = {name: getattr(inp, name) for name in REQUIRED_FIELDS}
    reasons = [f"missing required field: {name}" for name, value in fields.items() if not _present(value)]

    amounts = {name: _to_decimal(fields[name]) for name in ("subtotal", "tax", "total")}
    for name, parsed in amounts.items():
        if _present(fields[name]) and parsed is None:
            reasons.append(f"{name} is not a valid number: {fields[name]!r}")
    if reasons:
        return {"verification": {"ok": False, "reasons": reasons}}, "incomplete"

    subtotal, tax, total = amounts["subtotal"], amounts["tax"], amounts["total"]
    assert subtotal is not None and tax is not None and total is not None
    ok = abs((subtotal + tax) - total) <= TOLERANCE
    invoice = {
        **fields,
        "invoice_date": inp.invoice_date,
        "vendor_tax_id": inp.vendor_tax_id,
        "raw_text": inp.raw_text,
        "status": "extracted" if ok else "rejected",
    }
    if ok:
        return {"invoice": invoice, "verification": {"ok": True, "reasons": []}}, "valid"
    reason = f"total mismatch: subtotal ({subtotal}) + tax ({tax}) != total ({total})"
    return {"invoice": invoice, "verification": {"ok": False, "reasons": [reason]}}, "mismatch"
