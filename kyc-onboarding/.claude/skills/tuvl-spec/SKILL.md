---
name: tuvl-spec
description: "Write or change a tuvl spec (specs/<name>.md): sections, tuvl-example acceptance blocks, policies."
---
# Writing a spec

Start from the template: `tuvl spec new <name> [--workflow <snake_name>]` → `specs/<name>.md`.

## Shape
```markdown
---
name: refund-automation
owner: support-platform
workflow: refund_flow          # the workflow its examples run
---
# Intent      — what is automated and why
# Actors      — people and systems involved
# Data        — models: Order (existing), Refund (new: id, order_id, amount, status)
# Flows       — numbered steps; name each decision and who makes it
# Policies    — rules that must always hold (thresholds, approvals, token budgets, PII)
# Acceptance  — tuvl-example blocks + free-text criteria
```

## Acceptance examples become tests
````markdown
```tuvl-example
name: small damaged refund is automatic
input: { order_id: "00000000-0000-0000-0000-000000000040", reason: damaged }
mocks:                               # model/tool agents must be mocked (tests run offline)
  triage: { outputs: { lane: auto } }
expect: { end: default, path_includes: [issue_refund], output: { status: 200 } }
```
````
- `expect` keys: `end`, `path`, `path_includes`, `decision`/`decisions` (`{agent: {route, source}}`),
  `output` (partial match), `assertions` (TEL), `judge`, `end_or_wait: human|approval|<end>`.
- `tuvl codegen` writes each example to `tests/<workflow>/<name>.yaml`; keep names unique.
- Free-text acceptance bullets become assertion or judge tasks during analysis.

## Rules
- State thresholds as numbers ("over $500"), approvals as "a <role> must approve", budgets as tokens.
- Each `#`/`##` section is hashed: editing one marks its tasks **stale** (`tuvl spec diff`). After
  editing, re-run `tuvl spec analyse` (skill `tuvl-plan`).
