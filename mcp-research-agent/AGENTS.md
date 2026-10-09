# tuvl project — rules for coding agents

This is a **tuvl 2.0** project: typed YAML workflows of agents, run by a durable, journaled runtime.
Work spec-first and let tuvl tell you the state of the project.

## Non-negotiable
1. **Never infer project state — ask tuvl.** Use `tuvl spec status --json`, `tuvl validate --json`,
   `tuvl test --json` or the `tuvl mcp` tools (`spec_status`, `validate`, `get_contract`, …).
2. **Specs drive the work.** Intent lives in `specs/<name>.md`; `tuvl spec analyse` turns it into
   contracts and a TaskPlan (`specs/<name>.tasks.yaml`). Never set a task's status — it is derived.
3. **The LLM never writes YAML for analysis, and you never hand-edit generated files**:
   `agents/_generated/`, tests whose `metadata.generated_from` is set, `tuvl.lock`. Regenerate with
   `tuvl codegen` / `tuvl lock`.
4. **Only `code` agents need Python**, and only the function body. The decorator, signature and
   docstring belong to `tuvl codegen`.
5. **Never invent fields, engines or kinds.** Engines: `pending code tool decide llm loop human`.
   Every document is `kind:` + `version:` + `metadata:` + `spec:`; workflows are `version: tuvl/v2`.
6. **Every change ends green**: `tuvl validate --strict && tuvl codegen --check && tuvl lock --check
   && tuvl test && tuvl spec status --strict` (the CI gate).
7. PII fields are `secure: true` and never reach a model (V020). Secrets live in `.env`, never in YAML.

## Skills (`.agents/skills/`)
| Skill | Use it when |
|---|---|
| `tuvl-spec` | writing or changing `specs/<name>.md` |
| `tuvl-plan` | turning a spec into contracts and tasks (`spec analyse`, `--apply`, re-plan) |
| `tuvl-task-loop` | **always** — the core loop for implementing tasks |
| `agent-code` / `agent-tool` / `agent-llm` / `agent-loop` / `agent-decide` / `agent-human` | implementing an agent with that engine |
| `tuvl-data` | models, fields, access, CRUD |
| `tuvl-test` | tests, mocks, fixtures, judges |
| `tuvl-harden` | changing a working workflow safely |
| `tuvl-ship` | lock, CI gate, shipping |
