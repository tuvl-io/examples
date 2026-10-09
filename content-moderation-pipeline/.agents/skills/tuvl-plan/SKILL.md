---
name: tuvl-plan
description: "Turn a spec into contracts and a TaskPlan with tuvl spec analyse; review, apply, re-plan after spec changes."
---
# Planning from a spec

1. `tuvl spec analyse specs/<name>.md --json` (or mcp `spec_analyse`). It is a **dry run**: the
   analysis model returns a structured plan, tuvl renders the YAML, validates it with the plan
   applied and repairs at most twice. Read `errors`, `notes`, `diff`, `plan.tasks`, `cost_usd`.
2. If `errors` is non-empty the plan cannot be applied: clarify the spec (skill `tuvl-spec`) and
   analyse again. Never hand-write the plan's YAML instead.
3. Review the diff. Apply: `tuvl spec analyse specs/<name>.md --apply [--only <path,...>]` (mcp
   `spec_apply`). It refuses if the spec changed since analysis.
4. Then `tuvl codegen` (generated schemas, stubs, tests) and start the task loop (`tuvl-task-loop`).

## What a plan contains
- Models (new only), workflows whose agents are `pending` contracts unless the spec makes them
  obvious (`decide` for stated rules, `human` for approvals), prose artifacts, and
  `specs/<name>.tasks.yaml` with ids, targets, dependencies and LLM effort estimates.

## Re-planning
- `tuvl spec diff --json` lists tasks whose spec section changed (`stale`) and sections no task covers.
- Re-analyse: implemented agents and existing models are never rewritten (contract changes are
  reported in `notes` — apply them by hand), task ids stay stable, dropped tasks are flagged
  `obsolete: true` — remove them yourself once you agree.
