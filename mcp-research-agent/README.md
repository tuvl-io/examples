# MCP Research Agent

A bounded research loop drives an MCP fetch server across the web, summarises each source, and returns a cited brief — or a partial result explaining why it stopped.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- A `loop` (`investigate`) over an **MCP server** (`artifact://fetch-web@1`, `uvx mcp-server-fetch`)
  with an explicit `allow` list; the tool's input schema is pinned in `tuvl.lock`.
- A second tool that is an off-spine `code` agent (`summarize_source`).
- A supervisor, and `END.partial` on every abnormal exit (budgets, timeout, abort) instead of a failure.
- An `llm` agent composing the brief from the loop's typed output.
- `client/watch.ts`: follow the loop's turns and tool calls live with `@tuvl/client`.

## Spec, tests and the CI gate

The intent lives in [`specs/research.md`](specs/research.md). Its task plan (`*.tasks.yaml`) is written by the coding agent from the checked spec (`tuvl lint spec`), and its `tuvl-example` blocks are the tests in `tests/` (`tuvl generate code`). All
of it runs offline:

```bash
tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install --prerelease=allow "tuvl[standard]>=2.0.0b8"`), PostgreSQL 15+ with a `tuvl_research` database, and a model key
(`GEMINI_API_KEY` by default — any `provider/model` that tuvl supports works; edit `llms/*.yaml`).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/api/research -H 'content-type: application/json' \
  -d '{"question": "How does HTTP caching work?"}'
# or watch it: TUVL_URL=http://localhost:8885 npx tsx client/watch.ts "How does HTTP caching work?"
```

Needs `uv` (for `uvx mcp-server-fetch`) and outbound network access.

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
