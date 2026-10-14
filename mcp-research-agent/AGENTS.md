# tuvl project — rules for coding agents

This is a **tuvl 2.0** project: typed YAML workflows of agents, run by a durable, journaled runtime.
Work spec-first and let tuvl tell you the state of the project.

## Non-negotiable
1. **Never infer project state — ask tuvl.** Use `tuvl spec check|verify|status --json`,
   `tuvl validate --json`, `tuvl test --json` or the `tuvl mcp` tools (`spec_check`, `spec_verify`,
   `spec_status`, `validate`, `get_contract`, …).
2. **Specs drive the work.** Intent lives in `specs/<name>.md`, in the grammar `tuvl spec check`
   checks. You write the task list (`specs/<name>.tasks.yaml`, skill `tuvl-plan`) and build what it
   names; `tuvl spec verify` says whether the build matches the spec. Never set a task's status — it
   is derived.
3. **Never hand-edit generated files**: `agents/_generated/`, tests whose `metadata.generated_from`
   is set, `tuvl.lock`. Regenerate with `tuvl codegen` / `tuvl lock`.
4. **Only `code` agents need Python**, and only the function body. The decorator, signature and
   docstring belong to `tuvl codegen`.
5. **Never invent fields, engines or kinds.** Engines: `pending code tool decide llm loop human`.
   Every document is `kind:` + `version:` + `metadata:` + `spec:`; workflows are `version: tuvl/v2`.
6. **Every change ends green**: `tuvl spec check && tuvl validate --strict && tuvl codegen --check && tuvl lock --check
   && tuvl test --strict && tuvl spec verify --strict && tuvl spec status --strict` (the CI gate).
7. PII fields are `secure: true` and never reach a model (V020). Secrets live in `.env`, never in YAML.

## Skills (`.agents/skills/`)
| Skill | Use it when |
|---|---|
| `tuvl-spec` | writing or changing `specs/<name>.md` |
| `tuvl-plan` | writing and maintaining the task list from a checked spec |
| `tuvl-task-loop` | **always** — the core loop for implementing tasks |
| `agent-code` / `agent-tool` / `agent-llm` / `agent-loop` / `agent-decide` / `agent-human` | implementing an agent with that engine |
| `tuvl-data` | models, fields, access, CRUD |
| `tuvl-test` | tests, mocks, fixtures, judges |
| `tuvl-harden` | changing a working workflow safely |
| `tuvl-ship` | lock, CI gate, shipping |
