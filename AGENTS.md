# AGENTS.md — working on the tuvl examples

This repository holds complete tuvl 2.0 projects, one per top-level directory. Each project carries
its own `AGENTS.md` and `.agents/skills/` (from `tuvl skills update`) — follow those inside a project.

## Ground rules

1. **Each project's spec is the contract.** Intent lives in `<project>/specs/*.md`; the task plan
   (`*.tasks.yaml`) is derived by `tuvl spec analyse`, and task status by `tuvl spec status` — never
   set it by hand.
2. **Ask tuvl, don't guess:** `tuvl validate --json`, `tuvl spec status --json`, or the `tuvl mcp`
   tools. The engine docs at [tuvl.dev](https://tuvl.dev) (the Agentic Manual) are the reference for
   YAML.
3. **Never edit generated files** (`agents/_generated/`, tests with `metadata.generated_from`,
   `tuvl.lock`) — regenerate them with `tuvl codegen` / `tuvl lock`.
4. **Every project passes the CI gate:**
   `tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict`.
5. **No secrets in git.** `.env` is ignored; `.env.example` lists what a project needs.
   Infrastructure per project: [REQUIREMENTS.md](./REQUIREMENTS.md).

## Changing an example

```bash
cd <project>
# edit specs/<name>.md, then:
tuvl spec analyse specs/<name>.md            # review the plan (dry run)
tuvl spec analyse specs/<name>.md --apply    # or --only <paths>
tuvl codegen && tuvl test && tuvl spec status
tuvl lock
```

Keep each README's "What it demonstrates" in step with the workflows.
