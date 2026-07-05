# Policy 03 — Risk Banding & Approval Authority

Risk assessments assign a band that determines the approval path:

- **low** — may be auto-approved without human review when sanctions screening
  is clean and the applicant is in a Standard jurisdiction (Policy 02).
- **medium** — requires review and sign-off by a member of the `compliance`
  group. The submitting user may not approve their own application.
- **high** — requires `compliance` group sign-off and a written rationale;
  approval must cite the specific policy basis.

Every decision must record who decided (`decided_by`) and the band applied. The
final rationale must cite at least one compliance policy.
