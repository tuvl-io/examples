# Content Moderation Pipeline

User-generated content is classified by a model, regional policy is applied in code, borderline items wait for a moderator, every decision is recorded with an audit action, and automatic removals notify a channel.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- An `llm` classifier whose failures go to a person instead of publishing.
- Regional policy as a `code` agent (`apply_policy`) whose **signal is the category**, so routing
  stays visible in the workflow (the EU treats borderline as a violation).
- A `human` agent (`review`): the run waits, durably, until a moderator decides.
- A `code` agent writing two rows through `ctx.db` in one step, and an `http` tool that notifies
  `MODERATION_WEBHOOK_URL` (default `https://httpbin.org/post`) on automatic removals.

## Spec, tests and the CI gate

The intent lives in [`specs/content-moderation.md`](specs/content-moderation.md). Its task plan (`*.tasks.yaml`) is written by the coding agent from the checked spec (`tuvl lint spec`), and its `tuvl-example` blocks are the tests in `tests/` (`tuvl generate code`). All
of it runs offline:

```bash
tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install --prerelease=allow "tuvl[standard]>=2.0.0b8"`), PostgreSQL 15+ with a `tuvl_moderation` database, and a model key
(`GEMINI_API_KEY` by default — any `provider/model` that tuvl supports works; edit `llms/*.yaml`).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/api/moderate -H 'content-type: application/json' \
  -d '{"author_id": "u1", "region": "us", "content": "Great recipe, thanks for sharing!"}'
# borderline content outside the EU answers 202: the run waits at `review`.
# Decide it on the Insight Runs page, or:
curl -s localhost:8885/api/approvals
curl -s -X POST localhost:8885/api/approvals/<approval_id> -H 'content-type: application/json' \
  -d '{"values": {"decision": "remove", "note": "spam"}}'
```

In dev mode the session key is an admin token and unscoped workflows need no token; in production
the moderator needs `approvals:decide`.

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
