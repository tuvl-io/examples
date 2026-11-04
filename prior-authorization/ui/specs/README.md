---
ui_spec: index
name: prior-authorization
contract_hash: 524abe64210c
generated_by: tuvl generate ui-spec
---

# UI specs — prior-authorization

How to build the user interface of this backend. Everything here is written from the implemented project by `tuvl generate ui-spec`: a file appears for each workflow once its tasks are done, so what is documented is what exists. Read this file first, then the file of the workflow or model you are building a screen for.

## Build with `@tuvl/client`

Use the official client: it knows the run lifecycle (a `202`, events, waiting for a person), approvals, CRUD and sign-in, so a UI does not re-implement them.

```bash
npm install @tuvl/client
npx tuvl-client generate --url http://localhost:8885 --out src/tuvl.generated.ts   # typed workflows from this backend's OpenAPI
```

```ts
import { TuvlAuth, TuvlClient } from "@tuvl/client";
import type { Workflows } from "./tuvl.generated";

const auth = new TuvlAuth({ baseUrl: "http://localhost:8885" });   // POST /auth/token, refresh, logout
const client = new TuvlClient<Workflows>({ baseUrl: "http://localhost:8885", token });
```

## Rules for whoever builds the UI (developer or coding agent)

1. Call only the endpoints in these files; do not guess routes or fields. If something is missing, the backend does not have it yet.
2. Use `@tuvl/client` for runs, events, approvals, CRUD and sign-in rather than hand-written `fetch`.
3. Handle every status each workflow can return, including `202`, `401`, `403`, `409` and `422`.
4. Never put a signing key, a token or a `secure` field into the repository, the bundle, logs or analytics.
5. Authorization is the backend's job; the UI only decides what to show. Hide actions the token's scopes do not allow, but expect a `403` anyway.
6. Use the real examples in each file as fixtures for UI tests; they are the backend's own acceptance cases.
7. Call only the routes under Backend surface and in the workflow and model files. Never call `/api/_system`, `/admin` or `/api/artifacts` unless the surface lists them.

## Workflows

| Workflow | Call | Auth | State |
|---|---|---|---|
| [`evaluate_request`](evaluate_request.md) | `POST /prior-auth/evaluate` | a bearer token with scope `reviewers` | ready |
| [`get_evaluation`](get_evaluation.md) | `GET /prior-auth/evaluation` | a bearer token with scope `reviewers` | ready |
| [`publish_policy`](publish_policy.md) | `POST /policies` | a bearer token with scope `policy_admins` | ready |

## Models

[Models with CRUD routes](models.md): `Evaluation`, `Evidence`, `Finding`, `PolicyVersion`.

## Backend surface

A production server of this project mounts these system routes, and nothing else besides the workflow routes and model CRUD listed in these files. Build a UI on them only:

- `/auth/*`: sign in, refresh, who am I
- `/api/runs/*`, `/api/approvals/*` and `POST /api/workflows/{name}/runs`: start, follow and decide runs

Do not call `/api/_system`, `/admin` or `/api/artifacts` from a UI unless they are listed above; a production server answers `404` for the rest.

Production serves no OpenAPI document (`/docs`, `/openapi.json`), so generate the typed client from `tuvl dev` or a staging server that has `spec.api.docs: workflows`, not from production.


This backend sends no CORS headers, so a browser app on another origin is blocked. Serve the UI from the backend's origin (a reverse proxy for `/api`, `/auth` and `/models`; a dev-server proxy in development), or ask for the UI's origin to be added to `spec.api.cors_origins`.

## Shared behaviour

| Topic | What to know |
|---|---|
| Base URL | `http://localhost:8885` in development; configure it per environment |
| Sign in | `POST /auth/token` (OAuth2 password form, `username` is the email) → a JWT; send it as `Authorization: Bearer …`; `GET /auth/me` shows its scopes and groups |
| Following a run | `GET /api/runs/{id}` (status) and `GET /api/runs/{id}/events` (Server-Sent Events, resumable with `Last-Event-ID`) |
| Run statuses | `running`, `waiting_human`, `waiting_approval`, `paused`, then a terminal one: `completed`, `failed`, `aborted`, `compensated` |
| Errors | `401` not signed in, `403` not allowed, `409 workflow_unavailable`, `422` invalid input with `detail[]` |


<!-- tuvl:notes — everything below this line is yours and is kept when this file is regenerated -->
