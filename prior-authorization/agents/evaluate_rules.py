from __future__ import annotations

from typing import Any

from tuvl import Ctx, agent

from agents._generated.schemas import EvaluateRulesIn, EvaluateRulesOut


def _date_key(row: Any) -> str:
    return f"{row.recorded_on.isoformat()}|{row.id}"


@agent("evaluate_rules")
async def evaluate_rules(inp: EvaluateRulesIn, ctx: Ctx) -> EvaluateRulesOut:
    """Check every policy rule against the evidence, in the policy's order"""
    if inp.policy is None:
        raise ValueError("no policy to evaluate")
    # A fixed order, so the result never depends on the order the database returned the rows in.
    evidence = sorted(inp.evidence, key=_date_key)
    findings: list[dict[str, Any]] = []
    for rule in inp.policy.criteria:
        severity = rule["severity"]
        kind = rule["kind"]
        evidence_id: str | None = None
        if kind == "diagnosis_in":
            met = inp.diagnosis_code in rule["value"]
            outcome = "met" if met else "not_met"
            detail = (
                f"diagnosis {inp.diagnosis_code} is covered"
                if met
                else f"diagnosis {inp.diagnosis_code} is not among {', '.join(rule['value'])}"
            )
        elif kind == "has_evidence":
            rows = [e for e in evidence if e.kind == rule["evidence_kind"]]
            if rows:
                outcome, evidence_id = "met", str(rows[-1].id)
                detail = f"{rule['evidence_kind']} on file ({rows[-1].recorded_on.isoformat()})"
            else:
                outcome, detail = "missing_evidence", f"no {rule['evidence_kind']} on file"
        else:  # attr_min
            attr, need = rule["attr"], rule["value"]
            rows = [
                e
                for e in evidence
                if e.kind == rule["evidence_kind"]
                and isinstance(e.attributes, dict)
                and isinstance(e.attributes.get(attr), (int, float))
            ]
            if not rows:
                outcome, detail = "missing_evidence", f"no {rule['evidence_kind']} records {attr}"
            else:
                best = max(rows, key=lambda e: (e.attributes[attr], _date_key(e)))
                have = best.attributes[attr]
                evidence_id = str(best.id)
                outcome = "met" if have >= need else "not_met"
                detail = f"{attr} is {have}, the policy needs at least {need}"
        findings.append(
            {
                "rule_id": rule["id"],
                "outcome": outcome,
                "severity": "warn" if outcome == "missing_evidence" else severity,
                "evidence_id": evidence_id,
                "detail": detail,
            }
        )
    blocking = sum(1 for f in findings if f["outcome"] == "not_met" and f["severity"] == "block")
    warnings = sum(1 for f in findings if f["outcome"] != "met" and f["severity"] == "warn")
    return EvaluateRulesOut(findings=findings, blocking=blocking, warnings=warnings)
