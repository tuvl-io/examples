"""The policy rule vocabulary, shared by the publisher (to check a rule list) and the evaluator (to run it)."""

from __future__ import annotations

from typing import Any

KINDS = ("diagnosis_in", "has_evidence", "attr_min")
SEVERITIES = ("block", "warn")
EVIDENCE_KINDS = ("clinical_note", "lab_result", "imaging", "therapy_record")


def problems(criteria: Any) -> list[str]:
    """Why a rule list is not a valid policy; an empty list means it is valid."""
    if not isinstance(criteria, list) or not criteria:
        return ["criteria must be a non-empty list of rules"]
    found: list[str] = []
    seen: set[str] = set()
    for i, rule in enumerate(criteria):
        where = f"rule {i + 1}"
        if not isinstance(rule, dict):
            found.append(f"{where}: must be an object")
            continue
        rid = rule.get("id")
        if not isinstance(rid, str) or not rid:
            found.append(f"{where}: id is required")
        elif rid in seen:
            found.append(f"{where}: duplicate id {rid}")
        else:
            seen.add(rid)
        if rule.get("kind") not in KINDS:
            found.append(f"{where}: kind must be one of {', '.join(KINDS)}")
            continue
        if rule.get("severity") not in SEVERITIES:
            found.append(f"{where}: severity must be block or warn")
        kind = rule["kind"]
        if kind == "diagnosis_in":
            value = rule.get("value")
            if not isinstance(value, list) or not value or not all(isinstance(v, str) for v in value):
                found.append(f"{where}: value must be a non-empty list of codes")
        else:
            if rule.get("evidence_kind") not in EVIDENCE_KINDS:
                found.append(f"{where}: evidence_kind must be one of {', '.join(EVIDENCE_KINDS)}")
            if kind == "attr_min":
                if not isinstance(rule.get("attr"), str) or not rule.get("attr"):
                    found.append(f"{where}: attr is required")
                value = rule.get("value")
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    found.append(f"{where}: value must be a number")
    return found
