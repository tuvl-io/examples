# Skill: Implement an Example Project from its Specification

Turn a `project-specification.md` in this repo into a complete, validated,
runnable tuvl project in the same directory. Read `AGENTS.md` at the repo root
first — it carries the hard constraints; this skill is the procedure.

## 0. Preflight

- `tuvl --version` → must be `>= 2026.3.1.0`, published on PyPI:
  `uv tool install "tuvl[standard]>=2026.3.1.0"` (add `--reinstall` to upgrade an
  older install).
- Read the project's row in `REQUIREMENTS.md`; create the database (and
  `CREATE EXTENSION vector` where required) before booting anything.
- Read the ENTIRE specification once before writing any file. Note the step
  ids, the routes table, and the acceptance criteria — they are the test plan.

## 1. Scaffold in place

`tuvl init <name>` refuses an existing directory, but `tuvl init .` scaffolds
into the current directory and leaves existing files (the spec) untouched:

```bash
cd <project-dir>
printf 'y\nlocalhost\n5432\n<db-from-REQUIREMENTS>\npostgres\npostgres\nn\n' | tuvl init .
```

Prompt order (adjust host/creds to your env): postgres? → host → port →
database → user → password → **llm? — answer `n`**: the specs use Gemini, which
init has no interactive preset for. Write `llms/default.yaml` from the spec
(`gemini/gemini-3.1-flash-lite`, `api_key: ${GEMINI_API_KEY}`) and put the key
in `.env` yourself.

Headless alternative: answer `n` to both confirms (`printf 'n\nn\n'`) and write
`datasources/postgres.yaml`, `llms/default.yaml`, and `.env` yourself from the
spec — the spec defines their exact shape anyway.

After scaffolding: keep `config.yaml`, `.env.example`, `.gitignore`, and the
directory layout; **replace** any scaffold sample YAML with the spec's files.
Put real secrets only in `.env` (gitignored); mirror the variable names into
`.env.example` with placeholder values.

## 2. Write the configuration, in dependency order

1. `datasources/postgres.yaml` — one `DataSource`, `metadata.primary: true`.
2. `models/embeddings.yaml` + `models/collections.yaml` — only if the spec has
   RAG; collection dimension must match the embedding model.
3. `models/*.yaml` — the `ModelDefinition`s exactly as specified: field names,
   `enum_values`, `secure: true`, `input: false`, `tablename`. Multi-version
   models (kyc) are `---`-separated documents in one file; the disabled version
   keeps `enabled: false` and its own distinct `tablename`.
4. `llms/*.yaml` — `AgentModel` presets named exactly as the workflows
   reference them (`default`, and `judge` where specified).
5. `workflows/*.yaml` — copy the spec's step ids and routes verbatim. Checks
   before moving on: every non-default signal routed; `spec.context.models`
   lists every model touched; trigger path/method/schemas match; `supervisor`
   (if any) is a sibling of `steps:`; tool steps carry a `description:`;
   the step after a `HumanInTheLoop` in document order is the one the spec
   says resumes.
6. `nodes/*.py` — one `@node("name")` per file, filename equal to the name,
   async `(context) -> (context, signal)`. Emit exactly the signals the
   workflow routes.
7. `artifacts/*.md` (prose: front-matter `name`/`type: steering|skill|prompt`/
   `version`/`description`) and `artifacts/*.yaml` (structured `kind: Artifact`,
   e.g. `type: mcp` servers) — where the spec defines them; reference them from
   workflows as pinned `artifact://<name>@<version>` refs.

## 3. Validate → fix → repeat

```bash
tuvl validate
```

Zero errors AND zero warnings. Common first-run failures: an unmapped signal,
a missing tool description, a model absent from `spec.context`, a node
filename/decorator mismatch, an unpinned or unresolvable `artifact://` ref.

## 4. Smoke, then prove acceptance

```bash
cp .env.example .env   # fill real values
tuvl dev               # http://localhost:8000 (+ /insight)
```

Run every curl/demo command the spec's acceptance criteria list, in order,
and capture the output. For HITL specs, run the two-token drill (submitter
403 vs group-member success). For agent specs, exercise the reserved-exit
drills (lowered `max_iterations`, tiny `token_budget`). Then:

```bash
tuvl test              # the spec's tests/ suite; judge cases need a real key
```

## 5. Finish

- Write the project `README.md`: what it demonstrates, prerequisites (link
  `../REQUIREMENTS.md`), run steps, the demo commands with expected output.
- Update the repo-root README Projects table: `📋 spec` → `✅ runnable`.
- Final sweep: `tuvl validate` still clean; no secrets in any committed file;
  `.env` not committed; every acceptance criterion demonstrably met.

## When the spec and the engine disagree

Do not silently work around it. Implement what the ENGINE accepts, and record
the discrepancy in your final report — these examples double as integration
tests of the engine, and a spec/engine mismatch is a finding, not an obstacle.
