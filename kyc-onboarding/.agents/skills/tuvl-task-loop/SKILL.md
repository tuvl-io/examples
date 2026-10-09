---
name: tuvl-task-loop
description: "The core loop for implementing a tuvl project: pick the next task from spec status, implement, validate, test, repeat. Use for every implementation task."
---
# The task loop

Repeat until `tuvl spec status --strict` exits 0:

1. **Status** — `tuvl spec status --json` (mcp `spec_status`). Each task has `status`
   (`todo → in_progress → implemented → tested → done`, or `untracked`), `blocked`, `stale` and
   `reasons`. Never edit a status; it is derived from the project.
2. **Pick** the first task that is not `done`, not `blocked`, not `obsolete`. If it is `stale`,
   re-plan first (`tuvl-plan`).
3. **Contract** — `get_contract(workflow, agent)` (mcp) or read the workflow YAML: inputs, outputs,
   routes, and the generated class names.
4. **Generate** — `tuvl codegen` (mcp `codegen_write`) after any contract change.
5. **Implement** with the skill for the agent's engine. A `pending` agent becomes implemented by
   choosing its engine and writing its block (only `code` needs Python).
6. **Validate** — `tuvl validate --json`; fix every error. Unknown code? `explain_error`.
7. **Test** — `tuvl test --json`. Add or fix tests (skill `tuvl-test`) until the task's workflow
   has a passing test that goes through the agent.
8. **Lock** — `tuvl lock` when models, artifacts, judges or MCP tools changed.
9. Back to 1. Reasons tell you what is missing ("pending agents: …", "no passing Test covers …",
   "tuvl.lock is out of date").

Stop and ask a person for `manual` tasks (credentials, external accounts) — never fake them.
