---
name: candidate-screening
owner: talent
workflow: screen_candidates
---
# Intent
A recruiter pastes a role, what it requires and a list of candidate summaries. Every candidate is
scored against the role on its own, a few at a time, so one bad answer never sinks the batch. The
best three are stored as a ranked shortlist and returned.

# Actors
A recruiter (caller), a scoring model.

# Data
- **Screening** (new) — `id` (uuid), `role` (string; required), `candidate_count` (integer; required),
  `scored_count` (integer; required), `failed_count` (integer; required), `shortlist` (jsonb; required),
  `created_at` (timestamptz)

# Flows

## Flow: screen_candidates
Trigger: POST /api/screenings · signed-in
Input: `role` (str), `requirements` (str), `candidates` (list[json])
Ends: default 201 · failed 502

1. `score_each` — map score_candidate · in `role`, `requirements`, `candidates` · out `scores` (list[json]) · effect read
   - partial → `rank`
2. `rank` — code · effect read · in `scores` · out `shortlist` (list[json]), `candidate_count` (int), `scored_count` (int), `failed_count` (int)
3. `store` — tool db create Screening · in `role`, `candidate_count`, `scored_count`, `failed_count`, `shortlist` · out `screening` (Screening)
   - conflict → END.failed

## Flow: score_candidate
Trigger: tool
Input: `candidate` (json), `role` (str), `requirements` (str)
Ends: default 200 · failed 502
   - failed: no example — an item fails only when the model fails

1. `score` — llm default · in `candidate`, `role`, `requirements` · out `score` (int), `verdict` (enum[strong, maybe, weak]), `reason` (str) · budget 500 tok, 30s, retry 2
   - parse_error, timeout, budget_exceeded → END.failed

# Policies
- Each candidate is scored from their own summary only; candidates never see each other.
- At most 4 candidates are scored at the same time and at most 25 per batch.
- A candidate whose scoring fails is left out of the shortlist and counted in `failed_count`; the
  rest of the batch still completes.
- Only the best three are shortlisted, highest score first, and only candidates scoring 50 or more.

# Acceptance
```tuvl-example
name: the best three are shortlisted in score order
input:
  role: Backend engineer
  requirements: Python, PostgreSQL, 3+ years
  candidates:
    - { name: Ada, summary: "6 years of Python and PostgreSQL." }
    - { name: Bo, summary: "Frontend developer, 1 year of Python." }
    - { name: Cy, summary: "4 years of Python, some PostgreSQL." }
    - { name: Di, summary: "Data analyst who writes SQL daily." }
mocks:
  score_each: { outputs: { scores: [
    { name: Ada, score: 92, verdict: strong, reason: "Strong match." },
    { name: Bo, score: 35, verdict: weak, reason: "Too junior." },
    { name: Cy, score: 74, verdict: maybe, reason: "Partial match." },
    { name: Di, score: 58, verdict: maybe, reason: "No backend experience." } ] } }
expect:
  end: default
  path: [score_each, rank, store]
  output: { status: 201, body: { candidates: 4, scored: 4, failed: 0 } }
  assertions: ["output.body.shortlist[0].name == 'Ada'"]
```
```tuvl-example
name: candidates below 50 never make the shortlist
input:
  role: Backend engineer
  requirements: Python
  candidates:
    - { name: Ada, summary: "Python for 6 years." }
    - { name: Bo, summary: "Just started learning." }
    - { name: Cy, summary: "Some scripting." }
mocks:
  score_each: { outputs: { scores: [
    { name: Ada, score: 90, verdict: strong, reason: "Strong match." },
    { name: Bo, score: 30, verdict: weak, reason: "Too junior." },
    { name: Cy, score: 20, verdict: weak, reason: "Too junior." } ] } }
expect:
  end: default
  path: [score_each, rank, store]
  output: { status: 201, body: { candidates: 3, scored: 3, failed: 0 } }
  assertions: ["len(output.body.shortlist) == 1"]
```
```tuvl-example
name: a candidate that fails to score is counted, not fatal
input:
  role: Backend engineer
  requirements: Python
  candidates:
    - { name: Ada, summary: "Python for 6 years." }
    - { name: Bo, summary: "unreadable" }
mocks:
  score_each: { signal: partial, outputs: { scores: [
    { name: Ada, score: 90, verdict: strong, reason: "Strong match." }, null ] } }
expect:
  end: default
  path: [score_each, rank, store]
  output: { status: 201, body: { candidates: 2, scored: 1, failed: 1 } }
```
```tuvl-example
name: a candidate is scored by the model
workflow: score_candidate
input: { candidate: { name: Ada, summary: "Python for 6 years." }, role: Backend engineer, requirements: Python }
mocks:
  score: { outputs: { score: 90, verdict: strong, reason: "Strong match." } }
expect:
  end: default
  path: [score]
  output: { status: 200 }
```
