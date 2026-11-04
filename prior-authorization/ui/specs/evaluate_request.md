---
ui_spec: workflow
name: evaluate_request
contract_hash: 48f56f902951
generated_by: tuvl generate ui-spec
---

# UI spec — `evaluate_request`

evaluate_request, from specs/prior-authorization-check.md.

## Endpoint

|  |  |
|---|---|
| Call | `POST /prior-auth/evaluate` (or `POST /api/workflows/evaluate_request/runs` with `{ "input": … }`) |
| Which | The first route suits a plain frontend, or a gateway that allows exact paths. `@tuvl/client` starts every workflow through the second (`execute`, or `start` to get a handle at once), so it needs no per-workflow routing |
| Auth | a bearer token with scope `reviewers`; `iam:admin` also passes |
| Effect | `write` |
| Answer | The end's body when the run finishes within 30s; otherwise `202` with a run descriptor to follow |

## Request

| Field | Type | Required | Where |
|---|---|---|---|
| `member_ref` | `string` | yes | body |
| `procedure_code` | `string` | yes | body |
| `diagnosis_code` | `string` | yes | body |

Real examples from the spec's acceptance cases (use them as fixtures and mock data):

**a-missing-clinical-note-is-a-warning** → ends at `warn`

```json
{
  "member_ref": "M-100",
  "procedure_code": "MRI-LUMBAR",
  "diagnosis_code": "M54.5"
}
```

**a-procedure-with-no-active-policy-is-not-found** → ends at `no_policy`

```json
{
  "member_ref": "M-100",
  "procedure_code": "CT-HEAD",
  "diagnosis_code": "R51"
}
```

**a-request-that-meets-every-rule-passes** → ends at `default`

```json
{
  "member_ref": "M-100",
  "procedure_code": "MRI-LUMBAR",
  "diagnosis_code": "M54.5"
}
```

**a-reviewer-who-overrides-the-block-ends-it-as-overridden** → ends at `overridden`

```json
{
  "member_ref": "M-100",
  "procedure_code": "MRI-LUMBAR",
  "diagnosis_code": "M54.5"
}
```

## What can come back

| HTTP | End | Body fields | What the UI does |
|---|---|---|---|
| `200` | `END`, `END.warn`, `END.block`, `END.overridden` | — | Success: show the result. |
| `404` | `END.no_policy` | `error` | A refusal the person can act on: show the reason, let them change the input. |
| `422` | `The input does not match trigger.input` | — | A refusal the person can act on: show the reason, let them change the input. |
| `500` | `END.failed` | `error` | A failure: say it did not complete and offer to retry. |
| `202` | run not finished | `run_id`, `status`, `status_url`, `events_url`, `approval?` | Show progress; follow the run (events) or poll `status_url` until it ends. |
| `401` | — | — | Not signed in or the token expired: sign in again. |
| `403` | — | — | Signed in but not allowed (missing scope or group): show a no-access state, do not retry. |
| `409` | `workflow_unavailable` | `reasons` | Temporarily unavailable (a model it needs is disabled): show a try-later state. |
| `422` | — | `detail[]` per field | Invalid input: show each message next to its field. |

Body of `404` (illustration):

```json
{
  "error": "string"
}
```

Body of `500` (illustration):

```json
{
  "error": "string"
}
```

## Waiting for a person

This workflow can stop and wait, so a run's status may be `waiting_human` or `waiting_approval`. The `202` body then carries `approval` (title, form, `decide_url`). Whoever decides needs the `approvals:decide` scope plus the group below, and is never the person who started the run when a group is required.

### Step `clinical_review` — Clinical review of a blocked request

The criteria are not met. Review the findings and uphold the block, or override it.

- decided by group `clinical_reviewers`
- expires after 48h


```ts
const open = await client.approvals.list();               // what this person may decide
await client.approvals.decide(open[0].approval_id, { values: { /* the form */ } });
```

## Build it with `@tuvl/client`

```ts
import { RunHandle, TuvlApiError, TuvlClient, TuvlRunError } from "@tuvl/client";
import type { Workflows } from "./tuvl.generated";

const client = new TuvlClient<Workflows>({ baseUrl: "http://localhost:8885", token });

try {
  const result = await client.execute("evaluate_request", {
    "member_ref": "M-100",
    "procedure_code": "MRI-LUMBAR",
    "diagnosis_code": "M54.5"
  });
  if (result instanceof RunHandle) {
    for await (const event of result.events()) showProgress(event); // agent_started, decision, …
    showResult(await result.wait());
  } else {
    showResult(result); // the end's body
  }
} catch (error) {
  if (error instanceof TuvlRunError) showFailure(error);        // the run ended in an error end
  else if (error instanceof TuvlApiError) showRefusal(error);   // 401, 403, 409, 422 …
  else throw error;
}
```

## Checklist

- [ ] Every status in the table above has a visible state (success, refusal, failure, waiting, no access, sign in).
- [ ] A `202` is followed to its end (events or polling); the screen survives a refresh using the `run_id`.
- [ ] Field errors (`422`) appear next to their inputs.
- [ ] The token lives in memory or a secure cookie, never in the repository or the bundle.


<!-- tuvl:notes — everything below this line is yours and is kept when this file is regenerated -->
