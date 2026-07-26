# KYC Onboarding — a compliance-grade tuvl example

Compliance-grade applicant onboarding on **tuvl ≥ 1.0.0**: PII-safe intake,
sanctions screening, policy-grounded autonomous investigation under a
**fail-closed supervisor**, risk routing, **group-gated human approval**, and
**versioned risk schemas**. This is the "can I trust it in a regulated flow?"
example — it deliberately exercises every security-hardened surface.

## What it demonstrates

- **`spec.supervisor`** (a sibling of `steps:`, not a step): deterministic
  `rules` (`iteration_reached` → abort, `tool_repeated` → pause) **plus** an LLM
  judge whose `criteria` is a pinned steering artifact
  (`artifact://supervisor-criteria@1`), `on_violation: pause`, and
  **`on_judge_error: abort`** (fail-closed: a dead judge stops the run). The
  `investigate` agent routes the reserved **`aborted`** exit (Golden Rule 26).
- **`kind: Agent`, `mode: autonomous`** bounded tool-loop (`max_iterations: 6`,
  `token_budget: 50000`) with two tools (a stub watchlist node + a stub registry
  APICall), a closed `outcome.enum`, and **all four reserved exits routed**
  (`guardrail_violation` is also reserved, for agents with guardrails attached).
- **Versioned prose artifacts** in `artifacts/` — the agent's steering
  (`investigation-policy`), its skill (`red-flags`), and the supervisor criteria
  (`supervisor-criteria`) are front-matter markdown, referenced as pinned
  `artifact://<name>@1` refs.
- **`HumanInTheLoop`** with `auth.required_group: compliance` — no self-approval
  (enforced on resume).
- **`secure: true` PII masking** end-to-end (spans/streamed snapshots); the
  `Response` steps are the redaction layer (mapping-only, no PII on the wire).
- **Model versioning**: `RiskAssessment` v1 (enabled) + v2 (authored
  `enabled: false`, distinct tablename), activated via the admin toggle +
  restart; the workflow is pinned via `context.models[].version`.
- **IAM**: roles/scopes/groups, `metadata.required_scope`, `spec.access` scope
  override on CRUD, `iam:admin` bypass.
- **RAG** grounding (`DataSearch` over ingested compliance policies).
- A **`tuvl test`** suite including **LLM-judge evaluations**.

## Prerequisites

See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) (the `kyc-onboarding` row). In short:

- **PostgreSQL 15+**, database `tuvl_kyc`, with the **pgvector** extension:
  ```sql
  CREATE DATABASE tuvl_kyc;
  \c tuvl_kyc
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- **`GEMINI_API_KEY`** — used by the chat model (`llms/default.yaml`,
  `gemini/gemini-3.1-flash-lite`), the **judge** model (`llms/judge.yaml`, drives
  the fail-closed supervisor and the `tuvl test` judge evaluations), and the
  `gemini/gemini-embedding-001` embeddings (1536 dims — matches the
  `compliance_policies` collection dimension).
- **Screening API**: the `sanctions_screen` step and the `fetch_registry` tool
  post to `https://postman-echo.com/post` — a **stub by design** (it echoes the
  body back under `json.*`). The URL is hardcoded in the workflow because an
  `APICall` `url` is `{{context}}`-templated only (it is **not** env-var
  substituted), so `${SCREENING_API_URL}` would not resolve. `SCREENING_API_URL`
  is still shipped in `.env.example` for when you swap in a real provider; no key
  needed.
- Redis is **not** required.

## Run

```bash
uv sync
cp .env.example .env          # fill GEMINI_API_KEY; DB/screening defaults are fine
tuvl validate                 # must print: 0 errors, 0 warnings
tuvl dev                      # http://localhost:8885  (+ /insight)
```

`tuvl dev` runs in dev mode: the printed dev key acts as an `iam:admin`
superuser for every scoped route, so you can exercise the demos without minting
Biscuits. The IAM bootstrap below is what a **production** (`tuvl run`) deployment
needs — and is required to prove the HITL group gate with real tokens.

## IAM bootstrap (production-mode / HITL group gate)

The HITL step is gated by `auth.required_group: compliance`; the workflow by
`required_scope: kyc:submit`; policy ingestion by `iam:admin`. To drill the
two-token flow with real tokens (`tuvl keys generate` first, then `tuvl run`):

```bash
# 1. First admin (only works while the IAM users table is empty)
ADMIN=$(curl -s -X POST localhost:8885/auth/bootstrap \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin-pw"}' | jq -r .access_token)

# 2. A role for submitters (scope kyc:submit) and one for reviewers (group `compliance`)
curl -s -X POST localhost:8885/auth/admin/roles -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"name":"applicants"}'
curl -s -X POST localhost:8885/auth/admin/roles -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"name":"compliance"}'
# assign scopes (PATCH .../roles/{id}/scopes): applicants -> [kyc:submit];
#   compliance -> [kyc:submit, kyc:assess:read]
# create two users, assign `applicants` to the submitter and `compliance` to the
# reviewer, then log each in via POST /auth/token to get their tokens.
```

The IAM role name (`compliance`) is exactly the token `group()` fact the HITL
gate checks. A submitter carrying only `applicants` **cannot** resume their own
review; a `compliance` member (or `iam:admin`) can.

## Demo commands & expected output

### 0. Seed the policy corpus (RAG)

Policy ingestion is admin-gated (`required_scope: iam:admin`), so the request
needs an `Authorization` header. In dev mode the printed dev key is an
`iam:admin` superuser; export it as `$ADMIN` (in production use an admin token):

```bash
for f in policies/*.md; do
  curl -s -X POST localhost:8885/api/kyc/policies \
    -H "Authorization: Bearer $ADMIN" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg t "$(basename "$f")" --rawfile c "$f" '{title:$t, content:$c}')"
  echo
done
# each → {"data": {"title": "01-sanctions-screening.md", "error": null}, ...}
```

### 1. Happy path — `clear` + `low`, auto-approved (no suspension)

```bash
curl -s -X POST localhost:8885/api/kyc/apply -H 'Content-Type: application/json' \
  -d '{"full_name":"Alice Benign","dob":"1990-01-01","national_id":"AL-1001",
       "email":"alice@example.com","country":"us"}' | jq
```

Expected: `200` with `{"data":{"applicant_id":"…","status":"approved","band":"low"}}`.
**No PII** (`full_name`/`dob`/`national_id`) appears in the body; with telemetry
on, those fields are masked (`*****`) in spans.

### 2. Seeded watchlist name → human review → the two-token drill

The watchlist stub seeds two names (`nodes/check_watchlist.py`): submit
`"John Doe"` so the agent finds a hit and routes to `hitl_review`:

```bash
curl -s -X POST localhost:8885/api/kyc/apply -H 'Content-Type: application/json' \
  -d '{"full_name":"John Doe","dob":"1980-02-02","national_id":"JD-9",
       "email":"jd@example.com","country":"gb"}' | jq
# → HTTP 202  {"instance_id":"<id>","paused_step_id":"hitl_review","ui":{…},
#              "human_feedback":[…],"auth":{"required_group":"compliance"}}
```

Resume — **two-token drill** (`POST /api/workflows/resume`):

```bash
# a) submitter resuming their own request  ->  403 (no self-approval)
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8885/api/workflows/resume \
  -H "Authorization: Bearer $SUBMITTER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"instance_id":"<id>","human_input":{"decision":"approve","band":"medium","note":"ok"}}'
# -> 403

# b) a `compliance` group member resuming  ->  200, decision applied
curl -s -X POST localhost:8885/api/workflows/resume \
  -H "Authorization: Bearer $COMPLIANCE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"instance_id":"<id>","human_input":{"decision":"approve","band":"medium","note":"cleared"}}' | jq
# -> 200  {"data":{"applicant_id":"…","status":"approved","band":"medium"}}
#    the persisted RiskAssessment.decided_by == the reviewer's user id
```

Resume continues at `apply_decision` — the step **immediately after**
`hitl_review` in document order (HITL resume ignores routes and continues at the
next step).

### 3. Supervisor drills (fail-closed)

- **Force an abort.** Temporarily lower the rule in `workflows/onboard_applicant.yaml`:
  `{when: iteration_reached, gte: 1, then: abort}`, restart, and submit any
  applicant. The supervisor aborts the agent at the turn boundary; the reserved
  **`aborted`** exit routes into `hitl_review` (→ 202) — never auto-clears.
- **Break the judge (prove fail-closed).** Point `llms/judge.yaml` at a bad
  model id (e.g. `gemini/does-not-exist`), restart, submit. With
  `on_judge_error: abort`, a dead judge **stops** the run rather than proceeding
  unsupervised — silence never passes.

### 4. The v1 → v2 activation drill (live test of manual §6.8)

1. Run the happy path (§1) on **v1**.
2. Flip the staged v2 flag (admin token / dev key):
   ```bash
   curl -s -X PATCH localhost:8885/admin/models/RiskAssessment/v2/toggle \
     -H "Authorization: Bearer $ADMIN"      # -> the DB enabled flag flips
   ```
3. **Restart tuvl.** The boot log shows the override applied and the
   `risk_assessments_v2` table is created.
4. Re-pin the workflow: set `context.models` `RiskAssessment` `version: v2` in
   `workflows/onboard_applicant.yaml`, restart, and re-run. To see the
   **version-pin protection**, do step 3 *without* re-pinning first: the run
   fails cleanly with a `RuntimeError` (pin `v1` ≠ enabled `v2`) rather than
   writing against the wrong shape.

## Tests

```bash
export TUVL_TEST_JUDGE=gemini/gemini-3.1-flash-lite    # judge for evaluations (or per-eval judge_model)
tuvl test
```

`tests/` covers: each `investigate` outcome (`clear`/`elevated`/`refer_human`)
and each reserved exit (`aborted`/`max_iterations`/`budget_exceeded` → human;
`error` → `respond_failed`) routing as specified, plus a **judge evaluation**
(`test_assess_rationale_judge.yaml`) that runs the real `assess` Agent and
verdicts that its rationale is policy-grounded. Every evaluation is an LLM judge,
so a judge model must be configured (a skipped evaluation counts as a failure);
the routing tests use scripted stubs for the LLM/DB steps.

## Notes

- `.env` holds real secrets and is git-ignored; `.env.example` is the safe
  template. Never commit `.env`.
- Out of scope (see the spec): real screening/registry providers, document/ID
  verification, multi-tenancy, notification channels, appeals.
