---
ui_spec: models
name: models
contract_hash: 2f2c7f2e9224
generated_by: tuvl generate ui-spec
---

# UI spec — models with CRUD routes

These models opt in to REST routes under `/models/<name>/`. Use `client.crud("<name>")` from `@tuvl/client`; the name is lower-cased in the path.

## Evaluation

| Operation | Call | Scope | Group (also needed) |
|---|---|---|---|
| list | `GET /models/evaluation/` | `evaluation:read` | — |
| read | `GET /models/evaluation/{id}` | `evaluation:read` | — |

List takes `limit` (1–1000, default 100), `offset`, `filter[field]=value` and `include=relation,…`. `iam:admin` passes every check.

| Field | Type | Required | Sent on create | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | no (server-set) | primary key |
| `member_ref` | `string` | yes | yes | secure: do not log, echo or cache |
| `procedure_code` | `string` | yes | yes |  |
| `policy_version_id` | `uuid` | yes | yes |  |
| `verdict` | `enum` | yes | yes |  |
| `status` | `enum` | yes | yes |  |
| `report` | `jsonb` | yes | yes |  |
| `created_at` | `timestamptz` | no | no (server-set) |  |

```ts
const evaluation = client.crud("evaluation");
const rows = await evaluation.list({ limit: 20, filters: { /* field: value */ } });
```

## Evidence

| Operation | Call | Scope | Group (also needed) |
|---|---|---|---|
| create | `POST /models/evidence/` | `evidence:write` | — |
| list | `GET /models/evidence/` | `evidence:read` | — |
| read | `GET /models/evidence/{id}` | `evidence:read` | — |
| delete | `DELETE /models/evidence/{id}` | `evidence:delete` | — |

List takes `limit` (1–1000, default 100), `offset`, `filter[field]=value` and `include=relation,…`. `iam:admin` passes every check.

| Field | Type | Required | Sent on create | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | no (server-set) | primary key |
| `member_ref` | `string` | yes | yes | secure: do not log, echo or cache |
| `kind` | `enum` | yes | yes |  |
| `recorded_on` | `date` | yes | yes |  |
| `summary` | `string` | no | yes |  |
| `attributes` | `jsonb` | no | yes |  |
| `created_at` | `timestamptz` | no | no (server-set) |  |

```ts
const evidence = client.crud("evidence");
const rows = await evidence.list({ limit: 20, filters: { /* field: value */ } });
```

## Finding

| Operation | Call | Scope | Group (also needed) |
|---|---|---|---|
| list | `GET /models/finding/` | `finding:read` | — |
| read | `GET /models/finding/{id}` | `finding:read` | — |

List takes `limit` (1–1000, default 100), `offset`, `filter[field]=value` and `include=relation,…`. `iam:admin` passes every check.

| Field | Type | Required | Sent on create | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | no (server-set) | primary key |
| `evaluation_id` | `uuid` | yes | yes |  |
| `rule_id` | `string` | yes | yes |  |
| `outcome` | `enum` | yes | yes |  |
| `severity` | `enum` | yes | yes |  |
| `evidence_id` | `uuid` | no | yes |  |
| `detail` | `string` | no | yes |  |
| `created_at` | `timestamptz` | no | no (server-set) |  |

```ts
const finding = client.crud("finding");
const rows = await finding.list({ limit: 20, filters: { /* field: value */ } });
```

## PolicyVersion

| Operation | Call | Scope | Group (also needed) |
|---|---|---|---|
| list | `GET /models/policyversion/` | `policyversion:read` | — |
| read | `GET /models/policyversion/{id}` | `policyversion:read` | — |

List takes `limit` (1–1000, default 100), `offset`, `filter[field]=value` and `include=relation,…`. `iam:admin` passes every check.

| Field | Type | Required | Sent on create | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | no (server-set) | primary key |
| `procedure_code` | `string` | yes | yes |  |
| `version` | `string` | yes | yes |  |
| `source_ref` | `string` | yes | yes |  |
| `status` | `enum` | yes | yes |  |
| `criteria` | `jsonb` | yes | yes |  |
| `created_at` | `timestamptz` | no | no (server-set) |  |

```ts
const policyversion = client.crud("policyversion");
const rows = await policyversion.list({ limit: 20, filters: { /* field: value */ } });
```


<!-- tuvl:notes — everything below this line is yours and is kept when this file is regenerated -->
