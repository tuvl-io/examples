---
name: red-flags
type: skill
version: 1
description: Checklist for recognizing KYC red flags when interpreting screening results and policies.
---
# Skill: recognizing KYC red flags (apply when relevant)

Use this checklist when interpreting the screening result and policies. Any one
of these should push the outcome toward `elevated` or `refer_human`, never
`clear`:

- **Watchlist / sanctions match** on the applicant's name (`check_watchlist`
  returned `watchlist_hit: true`).
- **High-risk or restricted jurisdiction** called out by the retrieved policies
  for the applicant's `country`.
- **Identity inconsistency** — the declared details cannot be corroborated via
  the registry lookup, or the registry returns conflicting information.
- **Screening anomaly** — the screening provider returned an error, a partial
  match, or an ambiguous status.
- **Politically exposed person (PEP)** indicators surfaced by policy guidance.

When none of these apply and the watchlist check is clean, `clear` is
appropriate. When several apply, prefer `elevated`. When you simply cannot tell,
`refer_human`.
