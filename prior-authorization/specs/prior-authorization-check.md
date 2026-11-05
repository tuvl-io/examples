---
name: prior-authorization-check
owner: unassigned
workflow: evaluate_request
status: approved
approved_by: tuvl-io <developer@tuvl.io>
approved_at: '2026-11-04T15:56:50Z'
approved_hash: 9c737740d074
---
# Intent
First slice of an evidence-based policy evaluation service, shown on a healthcare prior-authorization check. A request
asks: does the evidence on file meet the coverage policy for this procedure? The service loads the active policy for
the procedure, reads the evidence for the member, checks every policy rule, and answers Pass, Warn or Block with a
report and one stored finding per rule. A Block is never final on its own: a clinical reviewer confirms or overrides
it, so no automatic denial is possible.

The point of the example is determinism. The verdict is a pure function of the policy version, the evidence and the
request. No model is called and no clock is read, so the same inputs always give the same verdict, and a stored
evaluation can be explained rule by rule.

Smallest sensible choices where the brief is silent:
- Policies are data. A `PolicyVersion` holds a list of rules in `criteria`; the rule kinds are `diagnosis_in`,
  `has_evidence` and `attr_min`. One version per procedure is active; publishing a new one retires the old.
- Publishing a policy checks its rules first. A policy that fails the check is refused and the last good version stays
  active. This flow stands in for the sync from a source of truth such as GitLab; the fetch itself is a later spec.
- Evidence lives in an `Evidence` model of synthetic records that stands in for the clinical record system. Swapping
  `fetch_evidence` for an HTTP or MCP tool is a later spec, as is an agent loop that chooses which evidence tools to
  call. Neither changes the verdict logic.
- Each rule has a severity, `block` or `warn`. A rule that is not met contributes its severity. Evidence that is
  absent is a `missing_evidence` finding and contributes `warn`, so a gap in the paperwork asks for documents instead
  of ending in a denial.
- Rules are checked in the order the policy lists them, and the findings keep that order.
- Time-based rules (evidence no older than N days), appeals, notifications and payer-specific policy sets are left to
  later specs.

# Data
- **PolicyVersion** (new) — `procedure_code` (string; required), `version` (string; required),
  `source_ref` (string; required), `status` (enum: active | retired; required; default active),
  `criteria` (jsonb; required)
- **Evidence** (new) — `member_ref` (string; required; secure),
  `kind` (enum: clinical_note | lab_result | imaging | therapy_record; required), `recorded_on` (date; required),
  `summary` (string), `attributes` (jsonb)
- **Evaluation** (new) — `member_ref` (string; required; secure), `procedure_code` (string; required),
  `policy_version_id` (uuid → PolicyVersion; required), `verdict` (enum: pass | warn | block; required),
  `status` (enum: final | in_review | upheld | overridden; required; default final), `report` (jsonb; required)
- **Finding** (new) — `evaluation_id` (uuid → Evaluation; required), `rule_id` (string; required),
  `outcome` (enum: met | not_met | missing_evidence; required), `severity` (enum: block | warn; required),
  `evidence_id` (uuid → Evidence), `detail` (string)

# Flows

## Flow: evaluate_request
Trigger: POST /prior-auth/evaluate · group reviewers
Input: `member_ref` (str), `procedure_code` (str), `diagnosis_code` (str)
Ends: default 200 · warn 200 · block 200 · overridden 200 · expired 202 · no_policy 404 · failed 500
   - expired: no example — a review deadline cannot be reached offline
   - failed: no example — a database conflict cannot be reproduced offline

1. `load_policy` — code · effect read · in `procedure_code` · out `policy` (PolicyVersion?)
   - no_policy → END.no_policy
2. `fetch_evidence` — tool db list Evidence · in `member_ref` · out `evidence` (list[Evidence])
3. `evaluate_rules` — code · in `policy`, `evidence`, `diagnosis_code` · out `findings` (list[json]), `blocking` (int), `warnings` (int)
4. `classify` — decide rules · in `blocking`, `warnings` · out `lane` (enum[pass, warn, block])
   - `blocking > 0` → block
   - `warnings > 0` → warn
   - otherwise → pass
   - pass → `record_pass`
   - warn → `record_warn`
   - block → `record_block`
5. `record_pass` — code · effect write · in `member_ref`, `procedure_code`, `policy`, `findings` · out `evaluation` (Evaluation)
   - default → END
6. `record_warn` — code · effect write · in `member_ref`, `procedure_code`, `policy`, `findings` · out `evaluation` (Evaluation)
   - default → END.warn
7. `record_block` — code · effect write · in `member_ref`, `procedure_code`, `policy`, `findings` · out `evaluation` (Evaluation)
8. `clinical_review` — human group clinical_reviewers · expires 48h · in `evaluation`, `findings` · out `upheld` (bool)
   - true, false → `settle_review`
   - expired → END.expired
9. `settle_review` — code · effect write · in `evaluation`, `upheld` · out `settled` (Evaluation)
   - upheld → END.block
   - overridden → END.overridden

## Flow: publish_policy
Trigger: POST /policies · group policy_admins
Input: `procedure_code` (str), `version` (str), `source_ref` (str), `criteria` (json)
Ends: default 201 · invalid 422 · failed 500
   - failed: no example — a database conflict cannot be reproduced offline

1. `check_criteria` — code · in `criteria` · out `rule_count` (int)
   - invalid → END.invalid
2. `activate_policy` — code · effect write · in `procedure_code`, `version`, `source_ref`, `criteria` · out `policy` (PolicyVersion)

## Flow: get_evaluation
Trigger: GET /prior-auth/evaluation · group reviewers
Input: `evaluation_id` (uuid)
Ends: default 200 · not_found 404 · failed 500
   - failed: no example — a database conflict cannot be reproduced offline

1. `find_evaluation` — tool db read Evaluation · in `evaluation_id` · out `evaluation` (Evaluation)
   - not_found → END.not_found
2. `list_findings` — tool db list Finding · in `evaluation_id` · out `findings` (list[Finding])

# Policies
- Determinism: `evaluate_rules` reads only its inputs. It uses no clock, no randomness and no model, and it does not
  depend on the order evidence rows come back in. The same policy version, evidence and request always produce the
  same findings and the same verdict.
- The verdict comes only from rules. `classify` is a `decide rules` step on two counts, so the mapping from findings to
  Pass, Warn or Block is visible in the spec and in the report.
- Fail closed: an unknown procedure, a missing policy or a failed step never yields a Pass. The request ends in
  `no_policy` or `failed`.
- No automatic denial: a Block always goes to a clinical reviewer. The reviewer can uphold it, which ends in `block`,
  or override it, which ends in `overridden`. The reviewer's decision is stored on the evaluation.
- Audit: every evaluation stores the policy version it used, a report, and one finding per rule with its outcome,
  severity and the evidence row it relied on. The run journal adds the step-by-step record.
- Privacy: `member_ref` is a secure field everywhere. It never reaches a model and is redacted on export. All data in
  this example is synthetic.
- Access: evaluating and reading evaluations need the `reviewers` group; publishing a policy needs `policy_admins`.
  Nothing here is public.

# Acceptance
```tuvl-example
name: a request that meets every rule passes
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }, { member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 56 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
expect: { end: default, path_includes: [evaluate_rules, classify, record_pass] }
```

```tuvl-example
name: a missing clinical note is a warning
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 56 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
expect: { end: warn, path_includes: [record_warn] }
```

```tuvl-example
name: missing therapy evidence is a warning, not a denial
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
expect: { end: warn }
```

```tuvl-example
name: too little therapy goes to a clinical reviewer
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }, { member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 14 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
expect: { end_or_wait: human, path_includes: [record_block] }
```

```tuvl-example
name: an uncovered diagnosis goes to a clinical reviewer
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }, { member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 56 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "J45.909" }
expect: { end_or_wait: human }
```

```tuvl-example
name: a reviewer who upholds the block ends it as a block
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }, { member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 14 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
mocks:
  clinical_review: { signal: "true", outputs: { upheld: true } }
expect: { end: block, path_includes: [clinical_review, settle_review] }
```

```tuvl-example
name: a reviewer who overrides the block ends it as overridden
workflow: evaluate_request
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5", "M51.16", "M51.26"], severity: block }, { id: R2, kind: attr_min, evidence_kind: therapy_record, attr: duration_days, value: 42, severity: block }, { id: R3, kind: has_evidence, evidence_kind: clinical_note, severity: warn }] }], Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }, { member_ref: "M-100", kind: therapy_record, recorded_on: "2026-01-12", summary: "synthetic", attributes: { duration_days: 14 } }] }
input: { member_ref: "M-100", procedure_code: "MRI-LUMBAR", diagnosis_code: "M54.5" }
mocks:
  clinical_review: { signal: "false", outputs: { upheld: false } }
expect: { end: overridden }
```

```tuvl-example
name: a procedure with no active policy is not found
workflow: evaluate_request
given: { Evidence: [{ member_ref: "M-100", kind: clinical_note, recorded_on: "2026-01-11", summary: "synthetic" }] }
input: { member_ref: "M-100", procedure_code: "CT-HEAD", diagnosis_code: "R51" }
expect: { end: no_policy }
```

```tuvl-example
name: a valid policy is published
workflow: publish_policy
input: { procedure_code: "MRI-LUMBAR", version: "2", source_ref: "d4e5f6a", criteria: [{ id: R1, kind: diagnosis_in, value: ["M54.5"], severity: block }] }
expect: { end: default, path_includes: [check_criteria, activate_policy] }
```

```tuvl-example
name: a policy with an unknown rule kind is refused
workflow: publish_policy
input: { procedure_code: "MRI-LUMBAR", version: "2", source_ref: "d4e5f6a", criteria: [{ id: R1, kind: guess, severity: block }] }
expect: { end: invalid }
```

```tuvl-example
name: a stored evaluation is returned with its findings
workflow: get_evaluation
given: { PolicyVersion: [{ id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", procedure_code: "MRI-LUMBAR", version: "1", source_ref: "a1b2c3d", status: active, criteria: [] }], Evaluation: [{ id: "7a2d1b63-3b9f-4e1c-8b88-1c0e8d3a2f21", member_ref: "M-100", procedure_code: "MRI-LUMBAR", policy_version_id: "6f1c0a52-2a8e-4d0b-9a77-0b9d7c2f1e10", verdict: pass, report: {} }], Finding: [{ evaluation_id: "7a2d1b63-3b9f-4e1c-8b88-1c0e8d3a2f21", rule_id: R1, outcome: met, severity: block }] }
input: { evaluation_id: "7a2d1b63-3b9f-4e1c-8b88-1c0e8d3a2f21" }
expect: { end: default, path_includes: [find_evaluation, list_findings] }
```

```tuvl-example
name: an unknown evaluation is not found
workflow: get_evaluation
input: { evaluation_id: "00000000-0000-4000-8000-000000000000" }
expect: { end: not_found }
```
