# AGENTS.md — Implementing an Example from its Specification

Instructions for AI coding agents (and humans) delivering the projects in this
repo. Each top-level directory contains a `project-specification.md`; your job
is to turn one specification into a complete, working tuvl project **in that
same directory**.

## Ground rules

1. **The specification is the contract.** Implement exactly what it says —
   models, step ids, routes, acceptance criteria. Do not add features, rename
   steps, or "improve" the design. Ambiguity → the engine manual decides.
2. **The engine manual is the authority on YAML.** `docs/TUVL_AGENTIC_MANUAL.md`
   in the [tuvl engine repo](https://github.com/tuvl-io/tuvl) is ground truth;
   its Golden Rules are hard constraints. The engine's `docs/` deep-dives
   (`autonomous-agent.md`, `supervisor.md`, `human-in-the-loop.md`,
   `functional-node.md`, `model-op.md`, `response.md`, `auth.md`) explain the
   internals the specs reference.
3. **Never invent kinds or fields.** Document kinds and step kinds are closed
   sets. Step kinds are PascalCase: `Functional`, `Agent`, `AutonomousAgent`,
   `Router`, `APICall`, `MCP`, `ModelOp`, `Response`, `HumanInTheLoop`.
4. **`tuvl validate` must pass with zero errors and zero warnings** before you
   run anything. Treat every warning as a bug in your YAML.
5. Check the infra prerequisites in [`REQUIREMENTS.md`](./REQUIREMENTS.md)
   (database name, pgvector, API keys, MCP tooling) before booting.

## The implementation loop

Follow the skill at
[`.agents/skills/implement-example-from-spec/SKILL.md`](.agents/skills/implement-example-from-spec/SKILL.md)
— short version:

```
# engine 2026.2.6 is published on PyPI — install/upgrade it first:
uv tool install "tuvl[standard]>=2026.2.6"
tuvl --version                   # must print v2026.2.6 or later

cd <project-dir>                 # the dir holding project-specification.md
# scaffold IN PLACE (init refuses existing dirs, but "." is allowed):
printf 'y\nlocalhost\n5432\n<db-name>\npostgres\npostgres\ny\nopenai\n\ngpt-4o-mini\n' | tuvl init .
# then: write models/ datasources/ llms/ workflows/ nodes/ agents/ per the spec
tuvl validate                    # loop until clean
tuvl dev                         # smoke the endpoints with the spec's curl demos
tuvl test                        # the spec's test suite
```

## The traps that fail first-time implementations

- **Every non-`default` emitted signal must be mapped in `routes:`** — including
  the four `AutonomousAgent` reserved exits `max_iterations` /
  `budget_exceeded` / `error` / `aborted` when the spec routes them.
- **`AutonomousAgent` uses `steering:`** — `goal:` is not a recognized key and
  is silently ignored.
- **Tool descriptions live on the referenced step's `description:`** (the tool
  entry's `description:` is only a fallback). A tool without one is a validate
  error.
- **HITL resume continues at the next step in document order** — the HITL
  step's `routes:` are never consulted on resume. The specs order steps
  accordingly; keep that order.
- **`spec.supervisor` is a sibling of `steps:`, not a step.**
- **Every model a workflow touches must be listed in `spec.context.models`**,
  or the first repo call raises `PermissionError`.
- **One `@node("name")` per file, filename `nodes/name.py`** — validate warns,
  and the Insight editor breaks on mismatch.
- **Secrets via `${ENV_VAR}` only**; PII fields get `secure: true`; server
  fields get `input: false`; finite value sets use `type: enum` +
  `enum_values`.

## Definition of done

Work through the spec's **Acceptance criteria** section literally — each item
is a check you must demonstrate (curl output, test run, validation output).
Then: a project `README.md` (what it shows, how to run, the demo commands),
`.env.example` complete, no secrets committed, and the repo-root README's
status column for your project flipped from `📋 spec` to `✅ runnable`.
