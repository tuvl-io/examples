# Knowledge-Base Q&A

Ingest markdown documents, then ask questions and get answers grounded in — and citing — the ingested content, on tuvl's built-in vector rails.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- `tuvl.data_ingest` and `tuvl.data_search`: built-in `code` agents with typed contracts,
  configured by `code.with` (collection `kb_docs`, `top_k`).
- An `llm` agent that answers only from the retrieved passages and returns `sources` and
  `confident`.
- Two workflows (`ingest_doc`, `ask_kb`) in one project and one spec.
- `client/ask.ts`: the same flow from TypeScript with `@tuvl/client`, following the run's events.

## Spec, tests and the CI gate

The intent lives in [`specs/knowledge-base.md`](specs/knowledge-base.md). Its task plan (`*.tasks.yaml`) is written by the coding agent from the checked spec (`tuvl lint spec`), and its `tuvl-example` blocks are the tests in `tests/` (`tuvl generate code`). All
of it runs offline:

```bash
tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install --prerelease=allow "tuvl[standard]>=2.0.0b8"`), PostgreSQL 15+ with a `tuvl_kb` database, and a model key
(`GEMINI_API_KEY` by default — any `provider/model` that tuvl supports works; edit `llms/*.yaml`).

This project needs **pgvector**:

```sql
\c tuvl_kb
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
for f in sample-docs/*.md; do
  curl -s localhost:8885/api/kb/ingest -H 'content-type: application/json' \
    -d "{\"title\": \"$(basename "$f" .md)\", \"content\": $(jq -Rs . < "$f")}"
done
curl -s localhost:8885/api/kb/ask -H 'content-type: application/json' \
  -d '{"question": "What is the daily meal allowance while travelling?"}'
```

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
