# Content Moderation Pipeline — Project Specification

> **Status:** SPECIFICATION — ready to implement · **Difficulty:** Medium
> **Engine:** tuvl >= 2026.3.1.0 · **Ground truth:** `tuvl-agentic-manual.md` (§4.5 Router `match:`, §4.10 HITL) + engine `docs/human-in-the-loop.md`
> **Requirements:** see `REQUIREMENTS.md` (Postgres `tuvl_moderation`, `GEMINI_API_KEY`; optional `MODERATION_WEBHOOK_URL`)

User-generated content arrives on a webhook; an LLM classifies it; deterministic routing applies region-specific policy; violations notify an external channel; borderline cases suspend for **group-gated human review** — where the submitter cannot approve their own content.

## What it demonstrates

- `Router` **`match:`** switch (data-driven, multi-way branching — never pushed into the LLM)
- `HumanInTheLoop` with **`auth.required_group`** (engine >= 2026.2.6: enforced on resume, no self-approval, 403 otherwise)
- The resume rule that matters for step ordering: **HITL `routes:` are never consulted on resume — execution continues at the next step in document order**
- `APICall` fire-and-forget notification, `enum` model fields, audit trail via `ModelOp`
- Workflow auth gate: `metadata.required_scope`

## Project layout

```
content-moderation-pipeline/
├── README.md                    # run guide + the two-token demo (submitter vs moderator)
├── config.yaml
├── .env.example                 # DATABASE_URL, GEMINI_API_KEY, MODERATION_WEBHOOK_URL
├── models/content_item.yaml
├── models/moderation_action.yaml
├── datasources/postgres.yaml
├── llms/default.yaml
├── workflows/moderate_content.yaml
└── nodes/apply_review.py
```

## Data models

`models/content_item.yaml` — `ContentItem`, table `content_items`:
`id` (uuid pk, uuid4, input:false) · `author_id` (string, required, index) · `region` (`enum` `[us, eu, in]`, required) · `content` (text, required) · `category` (`enum` `[safe, borderline, violation]`, input:false) · `status` (`enum` `[approved, removed, pending_review]`, input:false) · `created_at` (timestamptz, input:false).

`models/moderation_action.yaml` — `ModerationAction`, table `moderation_actions` (audit log):
`id` · `item_id` (uuid, required, index) · `action` (`enum` `[auto_approved, auto_removed, human_approved, human_removed]`) · `actor` (string — `"system"` or the reviewer id) · `reason` (text) · `created_at` (input:false).

## Workflow — `workflows/moderate_content.yaml`

Trigger: `POST /api/moderate`, body `{ author_id, region, content }`. Gate the workflow with `metadata.required_scope: moderation:submit` (Golden Rule 20 — metadata, not spec). `spec.context.models: [ContentItem, ModerationAction]`.

**Step order is load-bearing** because of the HITL resume rule — keep the document order exactly as specified:

1. **`classify`** — `Agent`, `output: {format: json, output_key: classification}` → `{ category: safe|borderline|violation, reason, confidence }`. Region-specific guidance goes in the prompt as *context*, but the **decision routing stays deterministic**. Routes: `error|timeout|parse_error → hitl_review` (fail toward human review, never fail open).
2. **`route_region`** — `Router` with `match:` on `{{region}}` mapping `eu → apply_eu_policy`, everything else default-continues. (`apply_eu_policy` is a small `Functional` node that tightens `classification.category` per a stricter EU threshold — demonstrates `match:` without inventing complex policy.)
3. **`route_category`** — `Router` `match:` on `{{classification.category}}`:
   `safe → persist_approved` · `violation → notify` · `borderline → hitl_review`.
4. **`notify`** — `APICall` POST `${MODERATION_WEBHOOK_URL}` (default httpbin) with item summary. Routes: `default → persist_removed`, `error → persist_removed` (notification failure must not block removal).
5. **`hitl_review`** — `HumanInTheLoop`:
   ```yaml
   ui_interaction:
     - { name: decision, type: enum, options: [approve, remove], required: true }
     - { name: note, type: text }
   output_key: review
   auth: { required_group: moderators }
   display_context: [content, region, classification]
   ```
   Suspends with HTTP 202 + `instance_id`. Resume: `POST /api/workflows/resume` `{instance_id, human_input}` — only a `moderators`-group token (or `iam:admin`) may resume; the submitting token gets **403** (this is the 2026.2.6 behavior — demo it).
6. **`apply_review`** — `Functional`, `runner: apply_review` — **must be the next step in document order after `hitl_review`** (resume continues here; HITL `routes:` are not consulted). Reads `review.decision`, emits `approved` / `removed`. Routes: `approved → persist_approved`, `removed → persist_removed`, `error → persist_removed`.
7. **`persist_approved`** / **`persist_removed`** — each a `ModelOp` create on `ContentItem` (status accordingly) followed by a `ModelOp` create on `ModerationAction` (actor = `"system"` or `{{_user_id}}` on the human path; reason from `classification.reason` or `review.note`), then →
8. **`respond`** — `Response` mapping `{ item_id, status, category, action }`.

## IAM setup (documented in README)

Bootstrap a `moderators` role carrying the resume permission and a plain `submitter` role with `moderation:submit`; create one user in each. Acceptance demo: submit borderline content with the submitter token → 202; attempt resume with the same token → **403**; resume with the moderator token → workflow completes. `iam:admin` bypass also shown once.

## Acceptance criteria

1. `tuvl validate` clean (all `match:` targets exist; every non-default signal mapped).
2. Safe content → `approved` end-to-end without suspension; violation → webhook fired (httpbin echo shown) + `removed` + audit row.
3. Borderline → 202 with `instance_id`; row `pending_review` absent until resume (instance persisted, not the item); self-resume 403; moderator resume → decision applied, audit row has the reviewer's actor id.
4. Double-resume returns 404 (one-shot instances).
5. Classifier failure routes to human review, never auto-approves.
6. `tuvl test` suite with stubbed classifier outputs covering all three categories + the EU-tightening branch.

## Out of scope

Real notification providers, ML thresholds, appeal flows, multi-tenancy.
