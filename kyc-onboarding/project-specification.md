# KYC Onboarding — Project Specification

> **Status:** SPECIFICATION — ready to implement · **Difficulty:** Complex
> **Engine:** tuvl >= 2026.2.6.1 · **Ground truth:** `tuvl-agentic-manual.md` (§4.13–4.14, §6.8, Golden Rules 25/26) + engine `docs/supervisor.md`, `docs/human-in-the-loop.md`, `docs/auth.md`
> **Requirements:** see `REQUIREMENTS.md` (Postgres `tuvl_kyc` **with pgvector**, `GEMINI_API_KEY`, judge preset; screening API stubbed)

Compliance-grade applicant onboarding: PII-safe intake, sanctions screening, policy-grounded autonomous investigation under a **fail-closed supervisor**, risk routing, **group-gated human approval**, and versioned risk schemas. This is the example that answers the "can I trust it in a regulated flow?" question — and it deliberately exercises every 2026.2.6-hardened surface.

## What it demonstrates

- `spec.supervisor`: deterministic `rules` (`when:`/`then:`) + LLM judge with scoped `criteria_file`, `on_violation: pause`, **`on_judge_error: abort` (fail-closed)** — plus the `aborted` reserved exit routed (Golden Rule 26)
- `HumanInTheLoop` with `auth.required_group: compliance` (no self-approval, 2026.2.6)
- `secure: true` PII masking end-to-end (spans, streamed snapshots); `Response` mapping as the redaction layer
- **Model versioning**: `RiskAssessment` v1 enabled + v2 authored `enabled: false`, activated via the admin toggle + restart (manual §6.8 flow), workflow pinned via `context.models[].version`
- IAM: roles/scopes/groups, `metadata.required_scope`, `iam:admin` bypass
- RAG for grounding (`DataSearch` over ingested compliance policies)
- A `tuvl test` suite with **LLM-judge evaluations**

## Project layout

```
kyc-onboarding/
├── README.md                          # run guide, IAM bootstrap, the v1→v2 activation drill
├── config.yaml
├── .env.example                       # DATABASE_URL, GEMINI_API_KEY, SCREENING_API_URL
├── models/applicant.yaml
├── models/risk_assessment.yaml        # v1 (enabled) + v2 (enabled: false), multi-doc file
├── models/embeddings.yaml
├── models/collections.yaml            # compliance_policies (1536)
├── datasources/postgres.yaml
├── llms/default.yaml                  # gemini/gemini-3.1-flash-lite
├── llms/judge.yaml                    # supervisor judge + tuvl test judge
├── workflows/ingest_policy.yaml
├── workflows/onboard_applicant.yaml
├── nodes/check_watchlist.py           # stub tool
├── nodes/apply_decision.py
├── agents/onboard_applicant__investigate/
│   ├── steering/investigation.md
│   └── skills/red-flags.md
├── agents/onboard_applicant__supervisor/
│   └── steering/criteria.md           # judge policy (scoped location is enforced)
├── policies/                          # 3 sample compliance policy markdown docs
└── tests/                             # tuvl test suite incl. judge evaluations
```

## Data models

`Applicant`, table `applicants`: `id` (uuid pk, uuid4, input:false) · `full_name` (string, required, **secure**) · `dob` (date, required, **secure**) · `national_id` (string, required, unique, **secure**) · `email` (string, required) · `country` (`enum` `[us, gb, de, in, sg]`, required) · `status` (`enum` `[received, investigating, pending_review, approved, rejected]`, input:false) · `created_at` (input:false).

`RiskAssessment` — **two documents in one file** (`---` separated):
- v1 (`metadata.schema_version: v1`, `enabled: true`, `tablename: risk_assessments`): `id` · `applicant_id` (uuid, required, index) · `score` (numeric) · `band` (`enum` `[low, medium, high]`) · `rationale` (text) · `decided_by` (string) · `created_at` (input:false).
- v2 (`schema_version: v2`, **`enabled: false`**, **distinct** `tablename: risk_assessments_v2`): v1 fields + `factors` (jsonb) + `policy_refs` (jsonb). Never enable two versions on one tablename (cross-version collision).

## IAM & auth (README section, done via bootstrap + admin API)

- Roles: `applicants` (scope `kyc:submit`), `compliance` (group used by the HITL gate + scopes to read assessments), plus the bootstrap admin.
- Workflow gate: `metadata.required_scope: kyc:submit` on `onboard_applicant`; `ingest_policy` gated `iam:admin`.
- `spec.access` on `RiskAssessment` CRUD: read scope `kyc:assess:read` (shows scope override).

## Workflow 1 — `workflows/ingest_policy.yaml`

`POST /api/kyc/policies` `{title, content}` → `DataIngest` into `compliance_policies` → `Response`. Ship 3 sample policies in `policies/` and a README one-liner to load them.

## Workflow 2 — `workflows/onboard_applicant.yaml`

Trigger: `POST /api/kyc/apply`, `input_schema: Applicant.create`, `response_schema` omitted (custom mapping). Context:

```yaml
context:
  models:
    - { name: Applicant }
    - { name: RiskAssessment, version: v1 }   # the version pin under test in the v2 drill
```

**Supervisor — sibling of `steps:`, not a step:**

```yaml
supervisor:
  watches: [agents]
  rules:
    - { when: iteration_reached, gte: 5, then: abort }
    - { when: tool_repeated, count: 3, then: pause }
  model: judge
  criteria_file: agents/onboard_applicant__supervisor/steering/criteria.md
  every_n_iterations: 2
  on_violation: pause
  on_judge_error: abort        # fail-closed: a dead judge stops the run, silence never passes
```

Steps (document order matters at the HITL boundary):

1. **`persist_applicant`** — `ModelOp` create (status `received`). `error → respond_failed`.
2. **`sanctions_screen`** — `APICall` POST `${SCREENING_API_URL}` with name/dob/country (stub echoes). `error → hitl_review` (screening outage → human decides; never auto-clear).
3. **`policy_context`** — `DataSearch` on `compliance_policies`, query built from country + screening result, `output_key: policies`. `error → hitl_review`.
4. **`investigate`** — `AutonomousAgent`: model `default`, `steering` + `steering_files` + `skills` (scoped dirs above), `max_iterations: 6`, `token_budget: 50000`, tools:
   - `check_watchlist` (`Functional` stub node; `description:` on the step — required) — deterministic fake watchlist with 2 seeded names
   - `fetch_registry` (`APICall` to the stub URL; `description:` set) — "company registry" lookalike
   `outcome: { enum: [clear, elevated, refer_human], output_key: investigation }`.
   Routes — **all reserved exits mapped** (rule 26; the supervisor CAN abort):
   `clear → assess` · `elevated → hitl_review` · `refer_human → hitl_review` · `max_iterations → hitl_review` · `budget_exceeded → hitl_review` · `aborted → hitl_review` · `error → respond_failed`.
   Everything uncertain funnels to the human — the agent can only fast-path `clear`.
5. **`assess`** — `Agent` json → `{score, band, rationale}` from investigation + policies. `error|parse_error|timeout → hitl_review`.
6. **`route_band`** — `Router` `match:` on `{{assessment.band}}`: `low → finalize_auto` · `medium → hitl_review` · `high → hitl_review`.
7. **`hitl_review`** — `HumanInTheLoop`, `display_context: [investigation, assessment, policies]` (PII fields stay out of the wire payload), `ui_interaction`: `decision enum [approve, reject]` + `band enum [low, medium, high]` + `note text`, `output_key: compliance_decision`, `auth: { required_group: compliance }`.
8. **`apply_decision`** — `Functional`, `runner: apply_decision` — **immediately after `hitl_review` in document order** (resume continues here). Normalizes the human decision or the auto path into `{status, band, decided_by}` (reads `{{_user_id}}` on the human path). Signals `approve|reject`.
9. **`finalize_auto`** — `Functional` (same runner, auto branch input) → merges into the same finalize path.
10. **`persist_assessment`** — `ModelOp` create on `RiskAssessment` (v1 pin) + **`update`** on `Applicant.status`.
11. **`respond`** — `Response` **mapping only** `{applicant_id, status, band}` — no PII in any response path. `respond_failed` likewise.

## The v1 → v2 activation drill (README section — this is a live test of §6.8)

1. Run the happy path on v1. 2. `PATCH /admin/models/RiskAssessment/v2/toggle` (admin token) → flag flips. 3. Restart tuvl → boot log shows the override applied; v2 table exists. 4. Re-pin the workflow to `version: v2` and demonstrate the version-pin `RuntimeError` protection by *not* re-pinning first and observing the clean failure. Document expected outputs at each step.

## Supervisor criteria — `agents/onboard_applicant__supervisor/steering/criteria.md`

The judge policy: the agent must not (a) call tools with PII fields other than the applicant under review, (b) conclude `clear` without at least one watchlist check, (c) loop on the registry tool. Conservative pass otherwise.

## Tests — `tests/` (`tuvl test`)

- Stubbed-loop tests: each `investigate` outcome + each reserved exit routes as specified (use scripted LLM turns).
- Supervisor tests: rule `iteration_reached` abort lands in `hitl_review` (via `aborted`); judge-FAIL → pause→(deadline)→abort path noted.
- Judge evaluations (`judge_model`/`TUVL_TEST_JUDGE`): "the final rationale cites at least one policy" and "no PII appears in the response body".

## Acceptance criteria

1. `tuvl validate` clean — supervisor block, scoped criteria file, all reserved exits, HITL group, versioned models.
2. Happy path (`clear` + `low`) completes without suspension; PII absent from responses and (telemetry on) masked in spans.
3. Seeded watchlist name → `elevated` → 202; submitter self-resume → **403**; compliance-group resume → decision applied, `decided_by` = reviewer.
4. Supervisor drills: force >5 iterations (temporarily lower `gte`) → run exits `aborted` into `hitl_review`; break the judge (bad judge model) → `on_judge_error: abort` stops the run (fail-closed proven).
5. The v1→v2 activation drill passes end-to-end, including the version-pin `RuntimeError` demonstration.
6. `tuvl test` suite green with stubs; judge evaluations pass with a real key.

## Out of scope

Real screening/registry providers, document/ID-image verification, multi-tenancy, notification channels, appeals.
