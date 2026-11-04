---
ui_spec: workflow
name: get_evaluation
contract_hash: 6d33b1cf3bd6
generated_by: tuvl generate ui-spec
---

# UI spec — `get_evaluation`

get_evaluation, from specs/prior-authorization-check.md.

## Endpoint

|  |  |
|---|---|
| Call | `GET /prior-auth/evaluation` (or `POST /api/workflows/get_evaluation/runs` with `{ "input": … }`) |
| Which | The first route suits a plain frontend, or a gateway that allows exact paths. `@tuvl/client` starts every workflow through the second (`execute`, or `start` to get a handle at once), so it needs no per-workflow routing |
| Auth | a bearer token with scope `reviewers`; `iam:admin` also passes |
| Effect | `read` |
| Answer | The end's body when the run finishes within 30s; otherwise `202` with a run descriptor to follow |

## Request

| Field | Type | Required | Where |
|---|---|---|---|
| `evaluation_id` | `uuid` | yes | query |

Real examples from the spec's acceptance cases (use them as fixtures and mock data):

**a-stored-evaluation-is-returned-with-its-findings** → ends at `default`

```json
{
  "evaluation_id": "7a2d1b63-3b9f-4e1c-8b88-1c0e8d3a2f21"
}
```

**an-unknown-evaluation-is-not-found** → ends at `not_found`

```json
{
  "evaluation_id": "00000000-0000-4000-8000-000000000000"
}
```

## What can come back

| HTTP | End | Body fields | What the UI does |
|---|---|---|---|
| `200` | `END` | `id`, `procedure_code`, `verdict`, `status`, `report`, `findings` | Success: show the result. |
| `404` | `END.not_found` | `error` | A refusal the person can act on: show the reason, let them change the input. |
| `422` | `The input does not match trigger.input` | — | A refusal the person can act on: show the reason, let them change the input. |
| `500` | `END.failed` | `error` | A failure: say it did not complete and offer to retry. |
| `202` | run not finished | `run_id`, `status`, `status_url`, `events_url`, `approval?` | Show progress; follow the run (events) or poll `status_url` until it ends. |
| `401` | — | — | Not signed in or the token expired: sign in again. |
| `403` | — | — | Signed in but not allowed (missing scope or group): show a no-access state, do not retry. |
| `409` | `workflow_unavailable` | `reasons` | Temporarily unavailable (a model it needs is disabled): show a try-later state. |
| `422` | — | `detail[]` per field | Invalid input: show each message next to its field. |

Body of `200` (illustration):

```json
{
  "id": "00000000-0000-4000-8000-000000000000",
  "procedure_code": "string",
  "verdict": "pass",
  "status": "final",
  "report": "string",
  "findings": [
    {
      "id": "00000000-0000-4000-8000-000000000000",
      "evaluation_id": "00000000-0000-4000-8000-000000000000",
      "rule_id": "string",
      "outcome": "met",
      "severity": "block",
      "evidence_id": "00000000-0000-4000-8000-000000000000",
      "detail": "string",
      "created_at": "2026-01-01T09:00:00Z"
    }
  ]
}
```

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

## Build it with `@tuvl/client`

```ts
import { RunHandle, TuvlApiError, TuvlClient, TuvlRunError } from "@tuvl/client";
import type { Workflows } from "./tuvl.generated";

const client = new TuvlClient<Workflows>({ baseUrl: "http://localhost:8885", token });

try {
  const result = await client.execute("get_evaluation", {
    "evaluation_id": "7a2d1b63-3b9f-4e1c-8b88-1c0e8d3a2f21"
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
