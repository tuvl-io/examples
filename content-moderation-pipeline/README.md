# Content Moderation Pipeline

User-generated content arrives on a webhook, an LLM classifies it, deterministic
routing applies region-specific policy, violations notify an external channel,
and **borderline cases suspend for group-gated human review** — where the
submitter cannot approve their own content.

## What it demonstrates

- **`Router` `match:` switches** — data-driven, multi-way branching by `region`
  and by `classification.category`. The branching decision is deterministic and
  never pushed into the LLM.
- **`HumanInTheLoop` with `auth.required_group`** (engine >= 2026.2.6): the
  resume is enforced against a group — the submitting token cannot approve its
  own content (403); only a `moderators`-group token (or `iam:admin`) can.
- **The HITL resume rule**: a HITL step's `routes:` are never consulted on
  resume — execution continues at the **next step in document order**
  (`apply_review`). Step order in the workflow is therefore load-bearing.
- **`APICall` fire-and-forget** violation notification (failure never blocks
  removal), **`enum` model fields**, and an **audit trail** written via `ModelOp`.
- **Workflow auth gate** via `metadata.required_scope: moderation:submit`.

## Architecture

```
POST /api/moderate  (scope: moderation:submit)
  |
  classify (Agent, JSON)                       error/timeout/parse_error --+
  |  default                                                               |
  route_region (Router match: region)                                     |
  |  eu -> apply_eu_policy -> prepare_audit   default -> prepare_audit     |
  prepare_audit (resolve webhook URL + auto audit fields)                  |
  |                                                                        |
  route_category (Router match: classification.category)                  |
  |  safe -> persist_approved                                             |
  |  violation -> notify (APICall webhook) -> persist_removed             |
  |  borderline ---------------------------> hitl_review <----------------+
  |                                              | 202 + instance_id
  |                     POST /api/workflows/resume (group: moderators)
  |                                              v
  |                                          apply_review (reads review.decision)
  |                                approved -> persist_approved
  |                                removed  -> persist_removed
  persist_* -> ContentItem create -> ModerationAction create (audit) -> respond
```

`hitl_review` persists only a suspended-instance row — **no `ContentItem` is
created** until the run resumes and reaches a persist step (so a pending item is
never left in the table).

## Prerequisites

See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) for the full matrix. For this project:

- **PostgreSQL 15+** (plain — no pgvector). Database `tuvl_moderation`:
  ```sql
  CREATE DATABASE tuvl_moderation;
  ```
- **`GEMINI_API_KEY`** for the `classify` Agent (`gemini/gemini-3.1-flash-lite`).
- **`MODERATION_WEBHOOK_URL`** (optional) — violation notification target;
  defaults to `https://httpbin.org/post` so the demo runs with no setup.
- tuvl >= 2026.3.1.0 (`uv tool install "tuvl[standard]>=2026.3.1.0"`).

## Run

```bash
cp .env.example .env          # fill GEMINI_API_KEY; DB creds default to postgres/postgres
tuvl validate                 # zero errors, zero warnings
tuvl dev                      # http://localhost:8000  (+ /insight)
```

`tuvl dev` runs in dev mode: the dev session key acts as an `iam:admin`
superuser credential (see the auth deep-dive), so you can exercise every route
without minting real tokens. To demonstrate the **group gate** end-to-end you
need two distinct real users — see the IAM setup below.

## IAM setup (two-token HITL drill)

The interesting acceptance test is that the submitter cannot approve their own
borderline content. Bootstrap two roles and one user each:

1. **Bootstrap the first admin** (only works while the IAM tables are empty):
   ```bash
   curl -sX POST localhost:8000/auth/bootstrap \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@example.com","password":"admin-pw"}'
   # -> returns an iam:admin token; use it as ADMIN below.
   ```
2. **Create the roles** (admin token). A `submitter` role carrying
   `moderation:submit`, and a `moderators` role — membership in `moderators` is
   what the HITL resume requires:
   ```bash
   curl -sX POST localhost:8000/auth/admin/roles -H "Authorization: Bearer $ADMIN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"submitter","description":"can submit content"}'
   curl -sX POST localhost:8000/auth/admin/roles -H "Authorization: Bearer $ADMIN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"moderators","description":"can resolve human review"}'
   # Assign scopes (replace {id} with each role id from the responses):
   curl -sX PATCH localhost:8000/auth/admin/roles/{submitter_id}/scopes \
     -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
     -d '{"scopes":["moderation:submit"]}'
   # `moderators` only needs group membership for resume; also give it
   # moderation:submit if the same person should be able to submit too.
   ```
3. **Create one user in each role** (`POST /auth/admin/users`, then assign each
   role via `POST /auth/admin/users/{user_id}/roles/{role_id}` — both are path
   params, no body), then log each in to mint a token:
   ```bash
   SUBMITTER=$(curl -sX POST localhost:8000/auth/token \
     -d 'username=submitter@example.com&password=sub-pw' | jq -r .access_token)
   MODERATOR=$(curl -sX POST localhost:8000/auth/token \
     -d 'username=mod@example.com&password=mod-pw'       | jq -r .access_token)
   ```

## Demo commands & expected output

### 1. Safe content -> approved, no suspension

```bash
curl -sX POST localhost:8000/api/moderate -H "Authorization: Bearer $SUBMITTER" \
  -H 'Content-Type: application/json' \
  -d '{"author_id":"u1","region":"us","content":"I love this community, thanks!"}'
```
Expected: `200`, `data: { item_id, status: "approved", category: "safe", action: "auto_approved" }`.
No suspension; one `content_items` row (approved) + one `moderation_actions` row (`actor: "system"`).

### 2. Violation -> webhook fired + removed + audit row

```bash
curl -sX POST localhost:8000/api/moderate -H "Authorization: Bearer $SUBMITTER" \
  -H 'Content-Type: application/json' \
  -d '{"author_id":"u2","region":"us","content":"<something that violates policy>"}'
```
Expected: `200`, `status: "removed"`, `action: "auto_removed"`. The `notify`
step POSTs the violation summary to `MODERATION_WEBHOOK_URL`; with the httpbin
default the echoed JSON is visible in the httpbin response / server logs.

### 3. Borderline -> 202, group-gated resume (the two-token drill)

```bash
# Submit borderline content -> suspends with 202 + instance_id
INSTANCE=$(curl -sX POST localhost:8000/api/moderate -H "Authorization: Bearer $SUBMITTER" \
  -H 'Content-Type: application/json' \
  -d '{"author_id":"u3","region":"us","content":"<borderline text>"}' | jq -r .instance_id)
# -> HTTP 202; NO content_items row yet (only a suspended-instance row exists).

# a) Submitter tries to approve their own content -> 403 (no self-approval)
curl -isX POST localhost:8000/api/workflows/resume -H "Authorization: Bearer $SUBMITTER" \
  -H 'Content-Type: application/json' \
  -d "{\"instance_id\":\"$INSTANCE\",\"human_input\":{\"decision\":\"approve\",\"note\":\"looks fine\"}}"
# -> HTTP 403 (caller lacks required group 'moderators')

# b) Moderator approves -> workflow completes, audit row actor = moderator id
curl -sX POST localhost:8000/api/workflows/resume -H "Authorization: Bearer $MODERATOR" \
  -H 'Content-Type: application/json' \
  -d "{\"instance_id\":\"$INSTANCE\",\"human_input\":{\"decision\":\"approve\",\"note\":\"ok on review\"}}"
# -> HTTP 200; status: "approved", action: "human_approved";
#    moderation_actions.actor = the moderator's user id.

# c) Double-resume of the same instance -> 404 (one-shot instances)
curl -isX POST localhost:8000/api/workflows/resume -H "Authorization: Bearer $MODERATOR" \
  -H 'Content-Type: application/json' \
  -d "{\"instance_id\":\"$INSTANCE\",\"human_input\":{\"decision\":\"approve\"}}"
# -> HTTP 404
```

`iam:admin` bypasses the group check — the dev session key (or the bootstrap
admin token) can resume any instance, shown once for completeness.

### 4. EU tightening branch

Submit borderline content with `"region":"eu"`: `apply_eu_policy` escalates
`borderline -> violation`, so the item is auto-removed (and the webhook fires)
instead of going to human review — the `match:` branch changing the outcome.

### 5. Classifier failure -> human review

If the `classify` Agent errors / times out / returns unparseable JSON, it routes
to `hitl_review` (never auto-approves) — fail toward a human.

## Acceptance criteria -> how to verify

| # | Criterion | How |
|---|---|---|
| 1 | `tuvl validate` clean | `tuvl validate` -> 0 errors / 0 warnings |
| 2 | Safe -> approved end-to-end; violation -> webhook + removed + audit | demos 1 & 2 |
| 3 | Borderline -> 202; no item until resume; self-resume 403; moderator resume applies decision with reviewer actor id | demo 3 |
| 4 | Double-resume -> 404 (one-shot) | demo 3c |
| 5 | Classifier failure -> human review, never auto-approve | demo 5 |
| 6 | `tuvl test` suite with stubbed classifier covering all three categories + EU branch | `tuvl test` |

## Files

- `config.yaml` — project directory layout.
- `datasources/postgres.yaml` — primary Postgres (content, audit log, HITL instances).
- `llms/default.yaml` — classifier preset (`gemini/gemini-3.1-flash-lite`).
- `models/content_item.yaml` — `ContentItem` (enum `region` / `category` / `status`).
- `models/moderation_action.yaml` — `ModerationAction` audit log (enum `action`).
- `workflows/moderate_content.yaml` — the pipeline.
- `nodes/apply_eu_policy.py` — EU category tightening.
- `nodes/prepare_audit.py` — resolves the webhook URL + automated audit fields.
- `nodes/apply_review.py` — applies the human decision on resume.
