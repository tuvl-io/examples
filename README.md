# tuvl examples

Runnable sample projects built with **[tuvl](https://tuvl.io)**: *Intelligent Workflows.
Deterministic Execution.* Clone a project, run it locally in minutes, and use it as a
starting point or a reference for your own workflows.

Each example is a complete, self-contained tuvl project: models, datasources, LLM
presets, and YAML workflows that you can run with `tuvl dev` and explore in the
**Tuvl Insight** browser editor.

> **tuvl 2.0.** Every project is a 2.0 agent graph (`version: tuvl/v2`) with typed contracts, a
> spec in `specs/`, offline tests and a `tuvl.lock`, and passes the CI gate. They target the stable
> release, **`tuvl>=2.0.1`**, and the commands in every README are the 2.0 ones (`tuvl <verb> <thing>`).

## ▶ tuvl try: run them live, no install

Don't want to clone anything? Run any of these examples in a **live, throwaway
sandbox** right in your browser:

### **→ [try.tuvl.online](https://try.tuvl.online)**

**tuvl try** runs these same examples. Enter your name + email, pick an example, and hit **Run in sandbox**. In a few
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
│   ├── agents/            # code agents (@agent) + _generated/ schemas (tuvl generate code)
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

> Ten complete projects in five tiers of complexity — start at the top and work down. Clone one and run it.
> Contributors and coding agents start at [AGENTS.md](./AGENTS.md); infrastructure and LLM needs per project:
> [REQUIREMENTS.md](./REQUIREMENTS.md).

| Tier | Project | What it shows | Engines |
|------|---------|---------------|---------|
| 1 · Starter | [`sentiment-api`](./sentiment-api) | Classify a review and persist it — the reference for `tuvl ship` | llm · tool |
| 1 · Starter | [`invoice-extraction-api`](./invoice-extraction-api) | Raw invoice text → a verified, persisted record; per-signal outputs; a secure field | llm · code · tool |
| 2 · Core | [`concierge-chat`](./concierge-chat) | A concierge that remembers each traveller across sessions, streams its replies, and compacts memory every night | llm (memory, streaming) · tool · code (schedule) |
| 2 · Core | [`knowledge-base-qa`](./knowledge-base-qa) | Ingest markdown, ask questions, get cited answers on the built-in vector rails | code (`tuvl.data_*`) · llm |
| 3 · Intermediate | [`batch-screening`](./batch-screening) | Score a list of candidates, one child run each, a few at a time; a failed item never sinks the batch | map · llm · code · tool |
| 3 · Intermediate | [`document-intake`](./document-intake) | Upload a file to a blob store, extract its type and summary, and write a scheduled daily digest | code · llm · tool (uploads, schedule) |
| 4 · Advanced | [`content-moderation-pipeline`](./content-moderation-pipeline) | Classify → regional policy in code → moderator review → audit + notification | llm · code · human · tool |
| 4 · Advanced | [`support-triage`](./support-triage) | Rules-first `decide` with a decision model; an investigating `loop` whose credit tool needs approval | decide · loop · llm · tool · code |
| 5 · Complex | [`mcp-research-agent`](./mcp-research-agent) | A bounded loop over an allow-listed MCP server to a cited brief | loop · llm · tool · code |
| 5 · Complex | [`kyc-onboarding`](./kyc-onboarding) | PII-safe intake, sanctions screening, a judge-supervised investigation, a compliance decision | loop · human · llm · tool · code |
| 5 · Complex | [`prior-authorization`](./prior-authorization) | Evidence checked against a coverage policy: Pass, Warn or Block with a report, a clinician for every block, and screens for each role | decide · human · tool · code |

## Running an example

```bash
uv tool install "tuvl[standard]>=2.0.1"   # Python 3.13+; [standard] adds Insight
git clone https://github.com/tuvl-io/examples.git tuvl-examples
cd tuvl-examples/<project-name>
cp .env.example .env                       # Postgres settings and a model key
tuvl lint project --strict && tuvl run tests        # offline checks
tuvl dev --auto-login                      # Insight at http://localhost:8885/insight
```

Infrastructure and model needs per project: [REQUIREMENTS.md](./REQUIREMENTS.md).

## Branches

All work happens on `develop`: branch from it and open the pull request against it. `main` is the default branch and only takes
a pull request from `develop`, merged with a **merge commit** (not a squash); CI refuses any other head branch.

## Adding an example

1. Create a top-level directory named after the use case (kebab-case) with `tuvl init`.
2. Write the intent in `specs/<name>.md` with `tuvl-example` acceptance cases, check it with
   `tuvl lint spec`, have the coding agent write the task list, and implement the tasks (`tuvl list tasks` shows what is left).
3. It must pass the CI gate:
   `tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict && tuvl review code --strict`.
4. Add a README (what it demonstrates, prerequisites, run steps), a `.env.example` (never real
   secrets), and a row to the table above. Open a pull request against `develop`.

## About tuvl

- **Website:** [tuvl.io](https://tuvl.io)
- **Docs:** [tuvl.dev](https://tuvl.dev)
- **Try it:** [try.tuvl.online](https://try.tuvl.online)
- **Nest, the catalogue of what is built with tuvl:** [nest.tuvl.io](https://nest.tuvl.io). List your own project with `tuvl register project`.
- **Engine (PyPI):** [`tuvl`](https://pypi.org/project/tuvl/) · **TypeScript SDK (npm):** [`@tuvl/client`](https://www.npmjs.com/package/@tuvl/client)

> *Pronounced "Thoo-val" (തൂവൽ) — Malayalam for a bird's feather.*

## License

[Apache-2.0](./LICENSE) © tuvl.io — see [NOTICE](./NOTICE).
