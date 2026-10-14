---
name: kyc-onboarding
owner: compliance
workflow: onboard_applicant
---
# Intent
Onboard applicants under KYC rules without exposing their personal data: screen them against
sanctions lists, investigate them against the written compliance policies, assess the risk, approve
low-risk applicants automatically and send everyone else to a compliance officer.

# Actors
Applicants (via the onboarding form), a sanctions-screening service, an investigating agent with a
watchlist tool, a risk model, compliance officers, compliance policy authors.

# Data
- **Applicant** (existing) — `id` (uuid), `full_name` (string; required; secure), `dob` (date; required; secure),
  `national_id` (string; required; unique; secure), `email` (string; required),
  `country` (enum: us | gb | de | in | sg; required),
  `status` (enum: received | investigating | pending_review | approved | rejected), `created_at` (timestamptz)
- **RiskAssessment** (existing) — `id` (uuid), `applicant_id` (uuid; required), `score` (numeric),
  `band` (enum: low | medium | high), `rationale` (text), `decided_by` (string), `created_at` (timestamptz)

# Flows

## Flow: ingest_policy
Trigger: POST /api/kyc/policies · group iam:admin
Input: `title` (str), `content` (str)
Ends: default 201 · failed 502
   - failed: no example — only a vector-store write error reaches it

1. `ingest` — code · in `title`, `content` · out `doc_id` (uuid)
   - tests: waived — it embeds into the compliance_policies vector store, which no offline test has

## Flow: onboard_applicant
Trigger: POST /api/kyc/apply · group kyc:submit
Input: `full_name` (str), `dob` (date), `national_id` (str), `email` (str), `country` (enum[us, gb, de, in, sg])
Ends: default 200 · duplicate 409 · failed 502
   - duplicate: no example — the unique national id is enforced by the database

1. `persist_applicant` — tool db create Applicant · in `full_name`, `dob`, `national_id`, `email`, `country` · out `applicant` (Applicant) · compensate `discard_applicant`
   - conflict → END.duplicate
2. `applicant_ref` — code · effect read · in `applicant` · out `applicant_id` (uuid)
3. `sanctions_screen` — tool http POST sanctions_screen · effect read · in `full_name`, `dob`, `country` · out `screened_country` (str)
   - error → `review`
4. `policy_context` — code · effect read · in `country` · out `policies` (list[json])
   - error → `review`
   - tests: waived — it searches the compliance_policies vector store, which no offline test has
5. `investigate` — loop default · in `applicant_id`, `country`, `policies` · out `investigation` (str) · budget 6 iterations, 4 tool calls, 30000 tok, 2m
   · tools: `check_watchlist`
   - clear → `assess`
   - elevated, refer_human, max_iterations, budget_exceeded, timeout, aborted, error → `review`
T1. `check_watchlist` — code · effect read · tool of `loop` · in `applicant_id` · out `hit` (bool), `checked` (bool), `source` (str?)
6. `assess` — llm default · in `investigation`, `policies` · out `score` (int), `rationale` (str) · budget 600 tok, 30s, retry 2
   - low → `finalize`
   - medium, high, parse_error, timeout, budget_exceeded, error → `review`
7. `review` — human group compliance · in `applicant`, `investigation`?, `score`?, `rationale`? · out `decision` (enum[approve, reject]), `band` (enum[low, medium, high]), `note` (str?)
   - approve, reject → `finalize`
8. `finalize` — code · in `applicant`, `score`?, `rationale`?, `decision`?, `band`?, `note`? · out `status` (enum[approved, rejected]), `final_band` (enum[low, medium, high])
   - default → END
T2. `discard_applicant` — tool db delete Applicant · in `applicant`
   - default → END
   - not_found → END

# Policies
- Name, date of birth and national id never reach a model and are redacted in the journal.
- Only the compliance group decides reviews, and nobody approves their own application.
- The investigation is supervised: a calibrated judge stops a trajectory that skips the watchlist or
  repeats itself.
- A duplicate national id is refused with 409; a processing failure rolls back the stored applicant.

# Acceptance
```tuvl-example
name: a low-risk applicant is approved automatically
input: { full_name: Ada Lovelace, dob: "1990-12-10", national_id: X1, email: ada@example.com, country: gb }
mocks:
  sanctions_screen: { outputs: { screened_country: gb } }
  policy_context: { outputs: { policies: [{ content: "UK applicants need a watchlist check.", score: 0.9 }] } }
  investigate: { signal: clear, outputs: { investigation: "Watchlist checked: no hit." } }
  assess: { signal: low, outputs: { score: 12, rationale: "No adverse findings." } }
expect:
  end: default
  path: [persist_applicant, applicant_ref, sanctions_screen, policy_context, investigate, assess, finalize]
  output: { status: 200, body: { status: approved, band: low } }
```
```tuvl-example
name: an elevated investigation waits for a compliance officer
input: { full_name: Bob Example, dob: "1985-01-01", national_id: X2, email: bob@example.com, country: us }
mocks:
  sanctions_screen: { outputs: { screened_country: us } }
  policy_context: { outputs: { policies: [] } }
  investigate: { signal: elevated, outputs: { investigation: "Watchlist hit on a similar name." } }
expect:
  end_or_wait: human
  path_includes: [investigate]
```
```tuvl-example
name: a policy document is ingested
workflow: ingest_policy
input: { title: Sanctions screening, content: "Screen every applicant against the consolidated list." }
mocks:
  ingest: { outputs: { doc_id: "33333333-3333-3333-3333-333333333333" } }
expect:
  end: default
  output: { status: 201 }
```
```tuvl-example
name: a compliance officer rejects an elevated applicant
input: { full_name: Bob Example, dob: "1985-01-01", national_id: X3, email: bob@example.com, country: us }
mocks:
  sanctions_screen: { outputs: { screened_country: us } }
  policy_context: { outputs: { policies: [] } }
  investigate: { signal: elevated, outputs: { investigation: "Watchlist hit on a similar name." } }
  review: { signal: reject, outputs: { decision: reject, band: high, note: "Confirmed watchlist match." } }
expect:
  end: default
  path_includes: [investigate, review, finalize]
  output: { status: 200, body: { status: rejected, band: high } }
```
```tuvl-example
name: a processing failure rolls the applicant back
input: { full_name: Cy Example, dob: "1979-05-05", national_id: X4, email: cy@example.com, country: us }
mocks:
  sanctions_screen: { outputs: { screened_country: us } }
  policy_context: { outputs: { policies: [] } }
  investigate: { signal: elevated, outputs: { investigation: "Needs a person." } }
  review: { signal: error }
expect:
  end: failed
  path_includes: [investigate, review]
  output: { status: 502 }
```
