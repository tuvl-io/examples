# Infrastructure & LLM Requirements

What each example needs before `tuvl dev` boots. All examples target **tuvl >= 2026.4.0.0** (the unified `kind: Agent` + `mode:` contract, the `outcome` block, and `artifact://` references require the 2026.4 engine — older engines reject these projects at load).

## Summary matrix

| Project | Difficulty | Postgres DB | pgvector | Redis | LLM calls | Embeddings | External |
|---|---|---|---|---|---|---|---|
| `support-triage` | Easy–Medium | `tuvl_support` | — | — | 2 chat calls (1 completion + 1 tool-calling loop) | — | Ollama (local, tool-capable model) — or any hosted LLM |
| `invoice-extraction-api` | Easy | `tuvl_invoices` | — | — | 1 chat model | — | — |
| `knowledge-base-qa` | Easy–Medium | `tuvl_kb` | **required** | — | 1 chat model | **required** | — |
| `content-moderation-pipeline` | Medium | `tuvl_moderation` | — | — | 1 chat model | — | optional webhook URL |
| `mcp-research-agent` | Medium–Complex | `tuvl_research` | — | — | 1 chat model | — | `uvx` + `mcp-server-fetch`, outbound network |
| `kyc-onboarding` | Complex | `tuvl_kyc` | **required** | — | 1 chat model + 1 judge model | **required** | — (screening API is stubbed) |
| `sentiment-api` | Easy | `tuvl_reviews` | — | — | 1 chat model | — | Docker + Helm (for `tuvl ship`) |

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

All model access goes through LiteLLM, configured per project in `llms/*.yaml` (`kind: AgentModel`). The specs default to Google Gemini — one `GEMINI_API_KEY` covers everything:

- **Chat model** (`llms/default.yaml`): `gemini/gemini-3.1-flash-lite` — used by every `Agent` step (both `mode: completion` and `mode: autonomous`).
- **Judge model** (`kyc-onboarding` only, `llms/judge.yaml`): a second preset for the `spec.supervisor` LLM judge and the `tuvl test` evaluations. Can be the same model id; a separate preset keeps cost/temperature tunable independently.
- **Embeddings** (`knowledge-base-qa`, `kyc-onboarding`): `gemini/gemini-embedding-001` declared in `models/embeddings.yaml` with `dimensions: 1536` — the engine passes the declared dimensions to the provider (Matryoshka truncation from the model's native 3072), and the collection's vector dimension must match.

Note: `tuvl init` has no interactive Gemini preset — answer `n` at the LLM-provider prompt and write `llms/default.yaml` from the spec (it defines the exact preset), with `GEMINI_API_KEY` in `.env`.

Swapping providers: any LiteLLM model string works (`openai/gpt-…`, `anthropic/claude-…`, `ollama/llama3`, …) — edit the `llms/*.yaml` preset, no workflow changes. Caveat for fully-local runs: the embedding model must also be swapped to a local one and the collection dimension updated to match.

Estimated cost to run every acceptance test once with the Gemini defaults: well under $1; the `mcp-research-agent` is the most expensive (bounded by its `token_budget: 60000`).

## External services

- **`mcp-research-agent`**: the agent's fetch tool is an MCP server spawned over stdio — `uvx mcp-server-fetch` (Python; needs `uv` installed) — and needs outbound internet access to fetch pages. No API key.
- **`content-moderation-pipeline`**: `MODERATION_WEBHOOK_URL` for violation notifications; defaults to `https://httpbin.org/post` so the demo runs with no setup.
- **`kyc-onboarding`**: the sanctions-screening `APICall` points at `SCREENING_API_URL` (default `https://httpbin.org/post`) — a stub by design; swap in a real provider later.

## Engine

- `tuvl[standard] >= 2026.4.0.0` — published on PyPI: `uv tool install "tuvl[standard]>=2026.4.0.0"`, Python 3.13 (3.14 is not yet supported — biscuit-python ships no cp314 wheels; uv picks 3.13 automatically, or pass `--python 3.13`).
- Each project is scaffolded with `tuvl init <name>` and validated with `tuvl validate` before first boot.
- Production-mode extras (Biscuit signing key via `tuvl keys generate`, IAM roles) are only needed where a spec says so (`content-moderation-pipeline`, `kyc-onboarding` — their HITL group gates need real tokens; `tuvl dev` covers everything else).
