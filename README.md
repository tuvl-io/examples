# tuvl examples

Runnable sample projects built with **[tuvl](https://tuvl.io)** — the YAML-driven
workflow orchestration engine. Clone a project, run it locally in minutes, and
use it as a starting point or a reference for your own workflows.

Each example is a complete, self-contained tuvl project: models, datasources, LLM
presets, and YAML workflows that you can run with `tuvl dev` and explore in the
**Tuvl Insight** browser editor.

> **tuvl 2.0.** Every project is a 2.0 agent graph (`version: tuvl/v2`) with typed contracts, a
> spec in `specs/`, offline tests and a `tuvl.lock`, and passes the CI gate. The `main` branch tracks
> tuvl 1.x until 2.0 is released.

## ▶ Try it live — no install

Don't want to clone anything? Run any of these examples in a **live, throwaway
sandbox** right in your browser:

### **→ [try.tuvl.online](https://try.tuvl.online)**

Enter your name + email, pick an example, and hit **Run in sandbox**. In a few
seconds you get a private URL to a real running instance with the **Tuvl Insight**
editor — poke at the workflows, run them, read the code. Each sandbox is isolated,
resets automatically, and self-destructs after ~20 minutes. The landing page shows
live slot availability. The sandbox platform itself is open source too — see
[`sandbox-portal/`](./sandbox-portal).

---

## Repository layout

One project per top-level directory. Every project is a standalone tuvl project
with its own README that explains what it does and how to run it.

```
tuvl-examples/
├── <project-name>/
│   ├── README.md          # what it demonstrates + how to run it
│   ├── specs/             # intent (<name>.md) + derived task plan (<name>.tasks.yaml)
│   ├── workflows/         # kind: Workflow (version: tuvl/v2)
│   ├── agents/            # code agents (@agent) + _generated/ schemas (tuvl codegen)
│   ├── models/            # ModelDefinition / Embedding / Collection YAML
│   ├── llms/              # AgentModel presets (llm and decision models)
│   ├── artifacts/         # prompts, steering, MCP servers, judges
│   ├── tests/             # Test documents generated from the spec examples
│   ├── tuvl.lock          # pinned models, artifacts and MCP schemas
│   ├── AGENTS.md, .agents/  # rules and skills for coding agents
│   └── .env.example       # required env vars (copy to .env — never commit secrets)
└── ...
```

## Projects

> Seven complete projects — clone one and run it. Contributors and coding agents
> start at
> [AGENTS.md](./AGENTS.md); infrastructure and LLM needs per project:
> [REQUIREMENTS.md](./REQUIREMENTS.md).

| Project | Difficulty | What it shows | Engines |
|---------|------------|---------------|---------|
| [`sentiment-api`](./sentiment-api) | Easy | Classify a review and persist it — the reference for `tuvl ship` | llm · tool |
| [`invoice-extraction-api`](./invoice-extraction-api) | Easy | Raw invoice text → a verified, persisted record; per-signal outputs; a secure field | llm · code · tool |
| [`knowledge-base-qa`](./knowledge-base-qa) | Easy–Medium | Ingest markdown, ask questions, get cited answers on the built-in vector rails | code (`tuvl.data_*`) · llm |
| [`content-moderation-pipeline`](./content-moderation-pipeline) | Medium | Classify → regional policy in code → moderator review → audit + notification | llm · code · human · tool |
| [`support-triage`](./support-triage) | Medium | Rules-first `decide` with a decision model; an investigating `loop` whose credit tool needs approval | decide · loop · llm · tool · code |
| [`mcp-research-agent`](./mcp-research-agent) | Medium–Complex | A bounded loop over an allow-listed MCP server to a cited brief | loop · llm · tool · code |
| [`kyc-onboarding`](./kyc-onboarding) | Complex | PII-safe intake, sanctions screening, a judge-supervised investigation, a compliance decision | loop · human · llm · tool · code |

## Running an example

```bash
uv tool install "tuvl[standard]"           # Python 3.13; [standard] adds Insight
git clone https://github.com/tuvl-io/examples.git tuvl-examples
cd tuvl-examples/<project-name>
cp .env.example .env                       # Postgres settings and a model key
tuvl validate --strict && tuvl test        # offline checks
tuvl dev --auto-login                      # Insight at http://localhost:8885/insight
```

Infrastructure and model needs per project: [REQUIREMENTS.md](./REQUIREMENTS.md).

## Adding an example

1. Create a top-level directory named after the use case (kebab-case) with `tuvl init`.
2. Write the intent in `specs/<name>.md` with `tuvl-example` acceptance cases, plan it with
   `tuvl spec analyse`, and implement the tasks (`tuvl spec status` shows what is left).
3. It must pass the CI gate:
   `tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict`.
4. Add a README (what it demonstrates, prerequisites, run steps), a `.env.example` (never real
   secrets), and a row to the table above. Open a pull request.

## About tuvl

- **Website:** [tuvl.io](https://tuvl.io)
- **Docs:** [tuvl.dev](https://tuvl.dev)
- **Engine (PyPI):** [`tuvl`](https://pypi.org/project/tuvl/) · **TypeScript SDK (npm):** [`@tuvl/client`](https://www.npmjs.com/package/@tuvl/client)

> *Pronounced "Thoo-val" (തൂവൽ) — Malayalam for a bird's feather.*

## License

[MIT](./LICENSE) © tuvl
