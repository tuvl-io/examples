# KYC Onboarding

Compliance-grade applicant onboarding: PII-safe intake, sanctions screening, a policy-grounded investigation by a supervised loop, a risk assessment, and a group-gated human decision.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- PII-safe intake: `national_id` and `dob` are `secure: true` — redacted in the journal and never
  sent to a model.
- Sanctions screening over `http` (`SCREENING_API_URL`, a stub by default), policy retrieval with
  `tuvl.data_search`, and an investigation `loop` whose supervisor uses a **calibrated judge**
  (`artifacts/supervisor-judge.yaml`, labelled subjects in `fixtures/judge/`).
- An `llm` risk assessment: low risk goes straight to `finalize`, everything else to a **human**
  compliance decision gated by an IAM group (no self-approval).
- A pinned model version (`RiskAssessment@v1`).

## Spec, tests and the CI gate

The intent lives in [`specs/kyc-onboarding.md`](specs/kyc-onboarding.md). Its task plan (`*.tasks.yaml`) was derived by
`tuvl spec analyse`, and its `tuvl-example` blocks are the tests in `tests/` (`tuvl codegen`). All
of it runs offline:

```bash
tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install "tuvl[standard]"`), PostgreSQL 15+ with a `tuvl_kyc` database, and a model key
(`GEMINI_API_KEY` by default — any LiteLLM model works; edit `llms/*.yaml`).

This project needs **pgvector**:

```sql
\c tuvl_kyc
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
# load the policies the investigation retrieves
for f in policies/*.md; do
  curl -s localhost:8885/api/kyc/policies -H 'content-type: application/json' \
    -d "{\"title\": \"$(basename "$f" .md)\", \"content\": $(jq -Rs . < "$f")}"
done
curl -s -X POST localhost:8885/api/kyc/apply -H 'content-type: application/json' \
  -d '{"full_name": "Ada Lovelace", "dob": "1990-12-10", "national_id": "X123", "email": "ada@example.com", "country": "gb"}'
```

The compliance decision needs a principal in the `compliance` group holding `approvals:decide`
(in dev mode the session key works).

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
