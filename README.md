# tuvl examples

Runnable sample projects built with **[tuvl](https://tuvl.io)** — the YAML-driven
workflow orchestration engine. Clone a project, run it locally in minutes, and
use it as a starting point or a reference for your own workflows.

Each example is a complete, self-contained tuvl project: models, datasources, LLM
presets, and YAML workflows that you can run with `tuvl dev` and explore in the
**Tuvl Insight** browser editor.

> ⚠️ **Beta.** These examples track tuvl **2026.2.4 (beta)** — great for learning
> and evaluation, but not yet recommended for production. APIs and schemas may
> change before the stable release. This repo is updated regularly as new samples
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

> No samples have been published yet — the first projects are on the way. ⭐ the
> repo to get notified, or [contribute one](#adding-an-example).

| Project | What it shows | Step kinds used |
|---------|---------------|-----------------|
| _coming soon_ | — | — |

<!-- When adding a project, add a row above, e.g.:
| [`recruitment-screening`](./recruitment-screening) | Resume intake → AI scoring → human approval | Functional · Agent · ModelOp · HumanInTheLoop · Response |
-->

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
