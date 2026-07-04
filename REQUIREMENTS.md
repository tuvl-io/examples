# Infrastructure & LLM Requirements

What each example needs before `tuvl dev` boots. All examples target **tuvl >= 2026.2.6**.

## Summary matrix

| Project | Difficulty | Postgres DB | pgvector | Redis | LLM calls | Embeddings | External |
|---|---|---|---|---|---|---|---|
| `invoice-extraction-api` | Easy | `tuvl_invoices` | — | — | 1 chat model | — | — |
| `knowledge-base-qa` | Easy–Medium | `tuvl_kb` | **required** | — | 1 chat model | **required** | — |
| `content-moderation-pipeline` | Medium | `tuvl_moderation` | — | — | 1 chat model | — | optional webhook URL |
| `mcp-research-agent` | Medium–Complex | `tuvl_research` | — | — | 1 chat model | — | `uvx` + `mcp-server-fetch`, outbound network |
| `kyc-onboarding` | Complex | `tuvl_kyc` | **required** | — | 1 chat model + 1 judge model | **required** | — (screening API is stubbed) |

## Database

- **PostgreSQL 15+**, one database per project (names above; override in the project's `datasources/postgres.yaml` / `.env`). The engine creates all tables at boot (`SQLModel.metadata.create_all`) — no migrations to run.
- **pgvector** extension must be installed and creatable (`CREATE EXTENSION vector`) for the two RAG projects (`knowledge-base-qa`, `kyc-onboarding`). The other projects run on plain Postgres.
- **Redis is not required** for any example. It only adds cross-worker agent control (pause/steer/abort fan-out across multiple workers); single-worker `tuvl dev` is fully functional without it.

Quick start for all five databases:

```sql
CREATE DATABASE tuvl_invoices;
CREATE DATABASE tuvl_kb;
CREATE DATABASE tuvl_moderation;
CREATE DATABASE tuvl_research;
CREATE DATABASE tuvl_kyc;
\c tuvl_kb
CREATE EXTENSION IF NOT EXISTS vector;
\c tuvl_kyc
CREATE EXTENSION IF NOT EXISTS vector;
```

## LLM

All model access goes through LiteLLM, configured per project in `llms/*.yaml` (`kind: AgentModel`). The specs default to OpenAI:

- **Chat model** (`llms/default.yaml`): `openai/gpt-4o-mini` — used by every `Agent` / `AutonomousAgent` step. Requires `OPENAI_API_KEY`.
- **Judge model** (`kyc-onboarding` only, `llms/judge.yaml`): a second preset for the `spec.supervisor` LLM judge and the `tuvl test` evaluations. Can be the same model id; a separate preset keeps cost/temperature tunable independently.
- **Embeddings** (`knowledge-base-qa`, `kyc-onboarding`): `text-embedding-3-small` (1536 dims) declared in `models/embeddings.yaml`. The collection's vector dimension must match the model.

Swapping providers: any LiteLLM model string works (`anthropic/claude-…`, `ollama/llama3`, …) — edit the `llms/*.yaml` preset, no workflow changes. Caveat for fully-local runs: the embedding model must also be swapped to a local one and the collection dimension updated to match.

Estimated cost to run every acceptance test once with the OpenAI defaults: well under $1; the `mcp-research-agent` is the most expensive (bounded by its `token_budget: 60000`).

## External services

- **`mcp-research-agent`**: the agent's fetch tool is an MCP server spawned over stdio — `uvx mcp-server-fetch` (Python; needs `uv` installed) — and needs outbound internet access to fetch pages. No API key.
- **`content-moderation-pipeline`**: `MODERATION_WEBHOOK_URL` for violation notifications; defaults to `https://httpbin.org/post` so the demo runs with no setup.
- **`kyc-onboarding`**: the sanctions-screening `APICall` points at `SCREENING_API_URL` (default `https://httpbin.org/post`) — a stub by design; swap in a real provider later.

## Engine

- `tuvl[standard] >= 2026.2.6` — published on PyPI: `uv tool install "tuvl[standard]>=2026.2.6"`, Python 3.12+.
- Each project is scaffolded with `tuvl init <name>` and validated with `tuvl validate` before first boot.
- Production-mode extras (Biscuit signing key via `tuvl keys generate`, IAM roles) are only needed where a spec says so (`content-moderation-pipeline`, `kyc-onboarding` — their HITL group gates need real tokens; `tuvl dev` covers everything else).
