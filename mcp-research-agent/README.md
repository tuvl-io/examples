# mcp-research-agent

> Built with [tuvl](https://tuvl.io) — a bounded **autonomous agent** that drives
> an **MCP fetch tool** across the web and returns a cited research brief.

`POST /api/research` hands a question to a bounded ReAct agent. The agent fetches
web pages through a `kind: MCP` tool (`uvx mcp-server-fetch` over stdio),
summarizes each source with a pure-Python `Functional` tool, and stops once it
can answer from at least two independent sources. A second LLM step composes the
final brief, which is persisted as a `ResearchBrief` record. The whole loop is
**capped by `max_iterations: 6` and `token_budget: 60000`**, and every terminal
signal — normal or reserved — is routed to a real response.

## What this example demonstrates

- **`kind: MCP` over stdio** — the only example that exercises the MCP step.
  The server's transport config is a `type: mcp` structured artifact
  (`artifacts/fetch-web.yaml`), referenced from the step as
  `mcp.server: artifact://fetch-web@1`.
- **`kind: Agent`, `mode: autonomous`** — a declared tool set, `outcome.enum`,
  `outcome.write`, `max_iterations`, `token_budget`, and **all four reserved
  exits routed** (`max_iterations` / `budget_exceeded` / `error` / `aborted`;
  `guardrail_violation` is also reserved, for agents with guardrails attached).
- **Versioned prose artifacts** — the agent's `steering` and `skills` are
  pinned `artifact://` refs to front-matter markdown in `artifacts/`
  (`research-method` steering, `citation-style` skill).
- **Tool descriptions from the referenced step's `description:`** — required, or
  `tuvl validate` errors.
- **Live `agent_progress` frames** consumed by the SDK (`client/watch.ts`).

## Prerequisites

See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) for the full matrix. For this project:

- **PostgreSQL 15+** with a database named `tuvl_research` (plain Postgres, no
  pgvector). The engine creates the `research_briefs` table at boot.
  ```sql
  CREATE DATABASE tuvl_research;
  ```
- **`GEMINI_API_KEY`** — the agent and the composer use Google Gemini
  (`gemini/gemini-3.1-flash-lite` via LiteLLM). Set it in `.env`.
- **`uv` / `uvx` installed** — the fetch tool is spawned as
  `uvx mcp-server-fetch` (Python MCP server) over stdio. `uvx` downloads it on
  first use.
- **Outbound network access (required)** — the fetch tool retrieves live web
  pages, and `uvx` downloads `mcp-server-fetch` on first use. No API key is
  needed for fetching, but the run cannot converge without outbound access.

> The MCP server is spawned **at runtime only** — `tuvl validate` is fully static
> and never launches it.
>
> **First-run noise is benign.** The first time `uvx mcp-server-fetch` starts, it
> may print `Failed to parse JSONRPC …` lines to stdout while `uvx` resolves and
> installs the package before the server's stdio handshake completes. These lines
> are harmless startup chatter — the MCP step still connects and fetches once the
> server is up.

## Run

```bash
# 1. Install dependencies
uv sync

# 2. Copy the secrets template and fill in GEMINI_API_KEY (+ Postgres creds)
cp .env.example .env

# 3. Validate — must be zero errors, zero warnings
tuvl validate --project-dir .

# 4. Start the dev server (http://localhost:8000, portal at /insight)
tuvl dev --project-dir .
```

> **Port note:** the curl examples below and `client/watch.ts` default to
> **`http://localhost:8000`** (hardcoded). If you start the server on another
> port (`tuvl dev --port 8004`), point the client at it with
> `TUVL_URL=http://localhost:8004` and adjust the curl URLs accordingly.

## Demo — the happy path (`answered`)

Two researchable questions that resolve cleanly with ≥2 sources:

```bash
curl -sS -X POST http://localhost:8000/api/research \
  -H 'Content-Type: application/json' \
  -d '{"question": "What is the CAP theorem and what are its three properties?"}' | jq

curl -sS -X POST http://localhost:8000/api/research \
  -H 'Content-Type: application/json' \
  -d '{"question": "What does HTTP status code 429 mean and how should a client respond?"}' | jq
```

Expected: HTTP 200, envelope `{"success": true, ...}`, and `data` shaped by the
`respond` step:

```json
{
  "id": "…uuid…",
  "question": "What is the CAP theorem and what are its three properties?",
  "outcome": "answered",
  "brief": "…a few grounded paragraphs…",
  "sources": [
    { "url": "https://…", "title": "…", "takeaway": "…" },
    { "url": "https://…", "title": "…", "takeaway": "…" }
  ]
}
```

The brief is persisted — verify with the auto-generated CRUD route. This route
is **auth-protected**: an unauthenticated request returns **HTTP 401**. In dev
mode, mint a short-lived dev token and pass it as a bearer header:

```bash
# Dev-mode auth: mint a token, then call the protected CRUD route.
TOKEN=$(tuvl auth dev-token 2>/dev/null || echo "$TUVL_DEV_TOKEN")
curl -sS http://localhost:8000/models/researchbrief/ \
  -H "Authorization: Bearer $TOKEN" | jq
```

> Without the bearer header this returns `401 Unauthorized` — that is expected,
> not a failure of persistence. The `POST /api/research` trigger itself is open
> in dev; only the auto-generated model CRUD routes require the dev token.

## Live progress (SDK)

`client/watch.ts` streams the loop while the run is in flight — iteration frames
(`iteration n, tokens_used`), tool calls (`→ fetch_page …`), and the terminal
signal:

```bash
npm i @tuvl/client@2026.3.1 tsx
TUVL_URL=http://localhost:8000 npx tsx client/watch.ts "How does HTTP caching work?"
```

## Reserved-exit drills

Each drill proves the run ends through a **declared exit**, never an unhandled
500. Edit `workflows/research.yaml`, restart `tuvl dev`, then re-run a curl.

| Drill | Change under `agent:` in `investigate` | Terminal signal | Route → response |
|---|---|---|---|
| **Iteration cap** | `max_iterations: 1` | `max_iterations` | `persist_partial` → `respond_partial` |
| **Token budget** | `token_budget: 200` | `budget_exceeded` | `persist_partial` → `respond_partial` |
| **Network down** | (no edit) fetch fails → observations | `insufficient_sources` **or** a reserved exit | a declared response |

The partial response reports **why** it stopped by reading the engine-recorded
terminal signal (not the model's opinion):

```json
{
  "question": "…",
  "outcome": "capped",
  "brief": "Research stopped before a complete answer was reached.",
  "stopped_reason": "max_iterations",   // or "budget_exceeded"
  "detail": "…"
}
```

- **Network down** (criterion 4): stop outbound access (or set an unreachable
  proxy). The MCP fetch errors surface to the agent as tool observations; the run
  still ends via `insufficient_sources` or a reserved exit — never a 500.
- **Operator abort** (criterion 6, dev-mode, optional): while a run is in flight,
  `POST /api/agents/runs/{id}/abort` (scope `agent:control`) exits the agent
  through `aborted → respond_failed`.

## How it maps to the workflow

| Step | Kind | Role |
|---|---|---|
| `investigate` | `Agent` (`mode: autonomous`) | the bounded loop; routes 2 outcomes + 4 reserved exits |
| `fetch_page` | `MCP` (stdio) | tool — server artifact `fetch-web` (`uvx mcp-server-fetch`), tool `fetch` |
| `summarize_source` | `Functional` | tool — pure-Python `{url, title, takeaway}` |
| `compose` | `Agent` (`mode: completion`) | composes the final cited brief (JSON) |
| `persist` / `persist_partial` | `ModelOp` | create `ResearchBrief` (`answered` / `capped`) |
| `respond` / `respond_partial` / `respond_failed` | `Response` | shape the three exit bodies |

## Common tasks

| Task | Command |
|------|---------|
| Validate all files | `tuvl validate --project-dir .` |
| Start dev server | `tuvl dev --project-dir .` |
| Add a Python dep | `uv add <package>` |

## Resources

| | |
|--|--|
| **Website** | <https://tuvl.io> |
| **Documentation** | <https://tuvl.dev> |
| **PyPI** | [pypi.org/project/tuvl](https://pypi.org/project/tuvl/) |
| **GitHub** | [github.com/tuvl-io](https://github.com/tuvl-io/) |
