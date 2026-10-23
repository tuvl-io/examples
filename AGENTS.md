# AGENTS.md — working on the tuvl examples

This repository holds complete tuvl 2.0 projects, one per top-level directory. Each project carries
its own `AGENTS.md` and `.agents/skills/` (from `tuvl update skills`) — follow those inside a project.

## Ground rules

1. **Each project's spec is the contract.** Intent lives in `<project>/specs/*.md`; the task plan
   (`*.tasks.yaml`) is written by the coding agent from the checked spec, and task status is derived by `tuvl list tasks` — never
   set it by hand.
2. **Ask tuvl, don't guess:** `tuvl lint project --json`, `tuvl list tasks --json`, or the `tuvl serve mcp`
   tools. The engine docs at [tuvl.dev](https://tuvl.dev) (the Agentic Manual) are the reference for
   YAML.
3. **Never edit generated files** (`agents/_generated/`, tests with `metadata.generated_from`,
   `tuvl.lock`) — regenerate them with `tuvl generate code` / `tuvl generate lock`.
4. **Every project passes the CI gate:**
   `tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict`.
5. **No secrets in git.** `.env` is ignored; `.env.example` lists what a project needs.
   Infrastructure per project: [REQUIREMENTS.md](./REQUIREMENTS.md).

## Changing an example

```bash
cd <project>
# edit specs/<name>.md, then:
tuvl lint spec                              # fix every blocking finding
# the coding agent then writes specs/<name>.tasks.yaml (skill tuvl-plan)
tuvl generate code && tuvl run tests && tuvl list tasks
tuvl generate lock
```

Keep each README's "What it demonstrates" in step with the workflows.
