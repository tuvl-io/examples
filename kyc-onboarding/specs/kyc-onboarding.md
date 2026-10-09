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
Applicant (existing): id, full_name (secure), dob (secure), national_id (secure, unique), email,
country (us, gb, de, in, sg), status, created_at.
RiskAssessment (existing, pinned v1): id, applicant_id, score, band, rationale, decided_by, created_at.
The `compliance_policies` vector collection holds the policy documents.

# Flows
1. Policy authors ingest policy documents (`ingest_policy`).
2. An applicant submits name, date of birth, national id, email and country; the applicant is stored.
3. The applicant is screened by the sanctions service; a screening failure goes to review.
4. The policies relevant to the applicant's country are retrieved.
5. An agent investigates the applicant with the watchlist tool and concludes clear, elevated or
   refer-to-human; anything but clear goes to review.
6. A model scores the risk: low risk is approved automatically, medium and high go to review.
7. A compliance officer approves or rejects with a risk band and a note.
8. The assessment and the applicant's final status are recorded and returned.

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
  wait: human
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
