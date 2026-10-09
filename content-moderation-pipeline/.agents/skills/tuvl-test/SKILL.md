---
name: tuvl-test
description: "Write and run tuvl tests: Test documents, mocks, replayed fixtures, judges and calibration."
---
# Tests

```yaml
kind: Test
version: tuvl/v2
metadata: { name: large-refund-needs-a-manager }
spec:
  workflow: refund_flow
  input: { order_id: "…", reason: damaged }
  mocks:                                        # checked against the agent's contract
    load_order: { outputs: { order: { id: "…", total: 900 } } }
    triage: { signal: manual }                  # a mock can force a signal
  replay: tests/fixtures/refund_flow/large.journal.json   # or serve results from a pinned run
  expect:
    wait: human                                 # or end: <name>; not both
    path_includes: [triage]
    decisions: { triage: { source: "rule#1" } }
    output: { status: 202 }                     # partial match
    assertions: ["output.status == 202"]        # TEL over output, end and the context
    judge: [{ judge: artifact://reply-quality@1, target: "{{ output.body.reply }}" }]
```
- `tuvl test [--json] [--only name] [--live] [--allow-uncertain]`. Offline by default: unmocked
  llm/loop/http/mcp/model-decide agents fail with a pointer; `pending` agents use typed stubs; `db`
  tools use an in-memory database; unmocked human agents suspend.
- Tests generated from spec examples (`metadata.generated_from`) are owned by `tuvl codegen` —
  change the spec, not the file. Hand-written tests live beside them.
- Pin a real run: `tuvl runs pin <run_id>` → `tests/fixtures/…`; check equivalence after an engine
  change with `tuvl runs replay <fixture>`.
- Mock data reads: a `db` read/list agent is mocked like any other (`mocks: { load_order: { outputs:
  { order: { id: "…", total: 40 } } } }`, or `signal: not_found`); `db` writes run for real against
  the test's empty in-memory database, so a test never needs seed data.

## Judges
`artifacts/<name>.yaml` (structured artifact; reference it as `artifact://<name>@1`):
```yaml
kind: Artifact
metadata: { name: reply-quality, version: 1, description: The reply states the amount and promises nothing extra. }
spec:
  type: judge
  model: default                   # an AgentModel
  rubric: |
    Pass when the reply states the refunded amount and promises nothing beyond policy. Otherwise fail.
  verdict: [pass, fail, uncertain]
  min_score: 0.6
  calibration:                     # labelled examples, paths relative to the project
    - { input: fixtures/judge/good-reply.json, expect: pass }
    - { input: fixtures/judge/overpromise.json, expect: fail }
  min_agreement: 0.9
```
- A calibration fixture is a JSON file holding exactly what the judge will see (e.g. `"Refunded $40."`
  or an object). `tuvl test` calibrates every judge it uses first; below `min_agreement` the judge is
  untrusted (V023, `--strict` fails). Verdicts are cached in `.tuvl/judge-cache/` (deterministic CI).
- In a Test: `judge: [{ judge: artifact://reply-quality@1, target: "{{ output.body.reply }}" }]`.
- As a guardrail on an llm/loop agent: `guardrails: { output: [artifact://reply-quality@1] }` — a fail
  routes `guardrail_violation`.
