# tuvl examples

Runnable sample projects built with **[tuvl](https://tuvl.io)** — the YAML-driven
workflow orchestration engine. Clone a project, run it locally in minutes, and
use it as a starting point or a reference for your own workflows.

Each example is a complete, self-contained tuvl project: models, datasources, LLM
presets, and YAML workflows that you can run with `tuvl dev` and explore in the
**Tuvl Insight** browser editor.

> **Early stable.** These examples track tuvl **2026.4.0.0** — the API and YAML
> schemas are stable and versioned. This repo is updated regularly as new samples
> land.

---

## Repository layout

One project per top-level directory. Every project is a standalone tuvl project
with its own README that explains what it does and how to run it.

```
tuvl-examples/
├── <project-name>/
│   ├── README.md          # what it demonstrates + how to run it
│   ├── config.yaml        # project config (dirs, deployment mode)
│   ├── .env.example       # required env vars (copy to .env — never commit secrets)
│   ├── models/            # ModelDefinition / Collection / Embedding YAML
│   ├── datasources/       # Postgres / Redis DataSource YAML
│   ├── llms/              # AgentModel (LLM) presets
│   ├── workflows/         # the workflow YAML files
│   └── nodes/             # optional custom Python @node functions
└── ...
```

## Projects

> Six complete projects — clone one and run it. Contributors and coding agents
> start at
> [AGENTS.md](./AGENTS.md); infrastructure and LLM needs per project:
> [REQUIREMENTS.md](./REQUIREMENTS.md).

| Project | Difficulty | What it shows | Step kinds used | Status |
|---------|------------|---------------|-----------------|--------|
| [`invoice-extraction-api`](./invoice-extraction-api) | Easy | Raw invoice text → validated structured records via one LLM step | Agent · Functional · ModelOp · Response | ✅ runnable |
| [`knowledge-base-qa`](./knowledge-base-qa) | Easy–Medium | Ingest markdown, ask questions, get cited answers — RAG on built-in rails | Functional (DataIngest/DataSearch) · Agent · Response | ✅ runnable |
| [`content-moderation-pipeline`](./content-moderation-pipeline) | Medium | Classify → region-aware routing → group-gated human review (no self-approval) | Agent · Router (match) · APICall · HumanInTheLoop · Functional · ModelOp · Response | ✅ runnable |
| [`mcp-research-agent`](./mcp-research-agent) | Medium–Complex | Autonomous agent driving MCP tools to a cited research brief, on a token budget | Agent (autonomous + completion) · MCP · Functional · ModelOp · Response | ✅ runnable |
| [`kyc-onboarding`](./kyc-onboarding) | Complex | Supervised investigation, compliance approval gate, PII masking, versioned schemas | Agent (autonomous + supervisor, completion) · APICall · Router (match) · HumanInTheLoop · Functional · ModelOp · Response | ✅ runnable |
| [`sentiment-api`](./sentiment-api) | Easy | Classify a review's sentiment, persist it — the reference for packaging to production with `tuvl ship` | Agent · ModelOp · Response | ✅ runnable |

## Running an example

1. **Install tuvl** (Python 3.13+):
   ```bash
   uv tool install "tuvl[standard]"     # [standard] bundles the Tuvl Insight UI
   ```
2. **Pick a project and configure it:**
   ```bash
   git clone https://github.com/tuvl-io/examples.git tuvl-examples
   cd tuvl-examples/<project-name>
   cp .env.example .env                 # fill in DB url, API keys, etc.
   ```
   Each example needs Postgres (with the `pgvector` extension for RAG samples) and,
   for LLM steps, a provider key or a local model — see the project's own README.
3. **Run it in dev mode and open the editor:**
   ```bash
   tuvl dev --project-dir .
   # → http://localhost:8000/insight
   ```
4. **Validate, then run in production mode:**
   ```bash
   tuvl validate --project-dir .
   tuvl run --project-dir .             # multi-worker uvicorn
   ```

## Adding an example

Contributions welcome — each example should be a clean, self-contained project:

1. Create a new top-level directory named after the use case (kebab-case).
2. Make it a runnable tuvl project (`tuvl init` is a good starting point) with:
   - a **`README.md`** describing what it demonstrates, prerequisites, and run steps;
   - a **`.env.example`** listing required variables — **never commit real secrets**;
   - workflows that follow the schema in the
     [agentic manual](https://tuvl.dev) (PascalCase step kinds, every signal mapped
     in `routes:`, models declared in `spec.context.models`).
3. Run `tuvl validate --project-dir <dir>` — it must pass.
4. Add a row to the **[Projects](#projects)** table above.
5. Open a pull request.

## About tuvl

- **Website:** [tuvl.io](https://tuvl.io)
- **Docs:** [tuvl.dev](https://tuvl.dev)
- **Engine (PyPI):** [`tuvl`](https://pypi.org/project/tuvl/) · **TypeScript SDK (npm):** [`@tuvl/client`](https://www.npmjs.com/package/@tuvl/client)

> *Pronounced "Thoo-val" (തൂവൽ) — Malayalam for a bird's feather.*

## License

[MIT](./LICENSE) © tuvl
