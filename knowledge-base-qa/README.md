# Knowledge-Base Q&A (RAG on tuvl's built-in rails)

Ingest markdown documents, then ask questions and get answers **grounded in — and
citing — the ingested content**. The whole Retrieval-Augmented-Generation
pipeline runs on tuvl's built-in `DataIngest` / `DataSearch` runners plus one
`Agent` step. There is **no hand-written RAG logic**.

## What it demonstrates

- `EmbeddingRegistry` + `CollectionRegistry` backed by **pgvector**.
- The built-in `Functional` runners **`DataIngest`** and **`DataSearch`**
  (Reciprocal-Rank-Fusion hybrid retrieval).
- **Golden Rule 16:** RAG = `DataSearch` → `Agent` with
  `context_injection: [kb_hits]`. The engine injects retrieval results; the
  prompt never concatenates them.
- Two workflows sharing one collection (`kb_docs`) and metadata filters.
- Driving both endpoints from the `@tuvl/client` TypeScript SDK.

## Prerequisites

See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) for the full matrix. For this
project specifically:

- **PostgreSQL 15+** with a database named **`tuvl_kb`**.
- **The pgvector extension must be installed and enabled** in that database —
  `DataIngest` / `DataSearch` require it and the server fails fast with an
  install pointer if it is missing:

  ```sql
  CREATE DATABASE tuvl_kb;
  \c tuvl_kb
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

- **`GEMINI_API_KEY`** — used for both the chat model
  (`gemini/gemini-3.1-flash-lite`) and the embedding model
  (`gemini/gemini-embedding-001`, truncated to 1536 dims via Matryoshka).
- tuvl **>= 1.0.0** (`uv tool install "tuvl[standard]>=1.0.0"`).

## Run

```bash
cp .env.example .env       # fill in POSTGRES_PASSWORD + GEMINI_API_KEY
uv sync
tuvl validate              # → 0 errors, 0 warnings
tuvl dev --project-dir .   # http://localhost:8000  (+ /insight)
# Pick another port with `tuvl dev --port 8002`; then point the demo curls and
# client/ask.ts at it via TUVL_BASE_URL (see below).
```

## Project layout

```
knowledge-base-qa/
├── config.yaml                 # ProjectConfig (directory hints)
├── datasources/postgres.yaml   # primary DataSource (holds the pgvector store)
├── vectorstore/embeddings.yaml # EmbeddingRegistry — gemini-embedding-001, 1536
├── vectorstore/collections.yaml# CollectionRegistry — kb_docs → default embedding
├── models/document.yaml        # optional Document bookkeeping model (CRUD only)
├── llms/default.yaml           # AgentModel — gemini/gemini-3.1-flash-lite
├── nodes/DataIngest.py         # validator-compat shim → built-in runner (see note)
├── nodes/DataSearch.py         # validator-compat shim → built-in runner (see note)
├── workflows/ingest_doc.yaml   # POST /api/kb/ingest
├── workflows/ask_kb.yaml       # POST /api/kb/ask
├── sample-docs/                # 3 markdown docs to ingest
└── client/ask.ts               # @tuvl/client SDK demo
```

## Demo commands & expected output

> **Port note.** The commands below assume the server is on the default
> `localhost:8000`. If you started `tuvl dev --port <N>` (e.g. `--port 8002`),
> substitute that port in every `curl` URL, and export `TUVL_BASE_URL` so
> `client/ask.ts` targets it too:
> ```bash
> export TUVL_BASE_URL=http://localhost:8002
> ```

### 1. Ingest the three sample documents

```bash
for f in sample-docs/*.md; do
  title=$(head -1 "$f" | sed 's/^# //')
  # tags line at the bottom, e.g. "Tags: finance, policy"
  tags=$(grep -i '^Tags:' "$f" | sed 's/^Tags:[[:space:]]*//' \
        | awk -F', *' '{printf "["; for(i=1;i<=NF;i++){printf "%s\"%s\"",(i>1?",":""),$i}; printf "]"}')
  curl -s localhost:8000/api/kb/ingest \
    -H 'content-type: application/json' \
    -d "{\"title\": \"$title\", \"content\": $(jq -Rs . < "$f"), \"tags\": $tags}"
  echo
done
```

Each call returns the success envelope:

```json
{ "success": true, "status_code": 200, "data": { "title": "Travel & Expense Policy" }, "error": null }
```

### 2. Ask a question answerable from document 2 → cites document 2's title

```bash
curl -s localhost:8000/api/kb/ask -H 'content-type: application/json' \
  -d '{"question": "What is the daily meal allowance while travelling?"}' | jq .data
```

```json
{
  "answer": "The daily meal allowance while travelling is $75 per day.",
  "sources": ["Travel & Expense Policy"],
  "confident": true
}
```

### 3. Ask something not in the knowledge base → no hallucinated citation

```bash
curl -s localhost:8000/api/kb/ask -H 'content-type: application/json' \
  -d '{"question": "What is the company vacation carry-over limit?"}' | jq .data
```

```json
{ "answer": "not in the knowledge base", "sources": [], "confident": false }
```

### 4. Filtered retrieval (metadata filter)

`ask_kb` ships **without** an active metadata filter, because an always-on
`{{tag}}` filter would break every un-tagged question. To restrict retrieval to a
single tag, uncomment the `metadata_filter` block in
[`workflows/ask_kb.yaml`](workflows/ask_kb.yaml):

```yaml
# in the `search` step:
metadata_filter:
  tags: "{{tag}}"
```

Then a request carrying a `tag` only draws hits from documents ingested with that
tag:

```bash
curl -s localhost:8000/api/kb/ask -H 'content-type: application/json' \
  -d '{"question": "What are the password requirements?", "tag": "security"}' | jq .data
```

Hits (and therefore citations) are limited to the `security`-tagged document.

### 5. TypeScript SDK

```bash
pnpm add @tuvl/client@^1.0.0 tsx
pnpm tsx client/ask.ts
```

Ingests two docs, then streams step events for one question and prints the JSON
answer.

### 6. Tests

`tuvl test` runs two cases against fully stubbed retrieval + answer steps, so no
pgvector is needed:

- **`ask_kb_routing`** — verifies the `search → answer → respond` happy path
  routes cleanly with canned step outputs.
- **`ask_kb_grounded`** — the same shape, checking the grounded/citation shape.

Both cases carry a judge evaluation pinned to
`judge_model: gemini/gemini-3.1-flash-lite`, so `tuvl test` exercises the judge
using the `GEMINI_API_KEY` already in `.env` and reports `2/2 passed`. There is
no keyless mode: a judge evaluation with no resolvable model is reported as a
**skipped → FAIL**, so the suite needs the Gemini key (or a `TUVL_TEST_JUDGE`
override) to go green. To swap judges globally without editing the YAML, set
`TUVL_TEST_JUDGE` (it is overridden by any per-evaluation `judge_model`).

## Extension points (out of scope here)

- **Chunking:** documents are ingested whole. To chunk, split `content` before
  calling `DataIngest` (e.g. a small `Functional` splitter that loops the runner)
  — the retrieval/answer half is unchanged.
- Reranking, auth, and a UI are intentionally omitted.

## Implementation notes / engine discrepancies

These are faithful adaptations where the spec's literal YAML and the tuvl
engine disagree (the engine is authoritative per the spec's ground-truth rule):

1. **`nodes/DataIngest.py` + `nodes/DataSearch.py` shims.** The engine registers
   `DataIngest` / `DataSearch` as built-in runners at boot, but `tuvl validate`
   only resolves a step's `runner:` against files under `nodes/` — it
   has no knowledge of the built-ins, so a bare `runner: DataIngest` fails
   validation. Each shim is a one-line delegate to the engine's own
   implementation (`tuvl.core.nodes.rag._data_ingest` / `_data_search`), so
   runtime behaviour is identical to the built-in; they exist only to keep
   `tuvl validate` at zero errors. Delete them once the validator recognises
   built-in runners.
2. **Registries under `vectorstore/`, not `models/`.** The spec places
   `embeddings.yaml` / `collections.yaml` in `models/`, but `tuvl validate` warns
   on any non-`ModelDefinition` kind found in the models directory. Config is
   discovered by a full-tree walk keyed on `kind:`, so the location does not
   affect runtime — the files are moved to `vectorstore/` purely to keep
   validation warning-free.
3. **`models/document.yaml`.** `tuvl validate` also warns unless the models
   directory holds at least one `ModelDefinition`. The spec explicitly allows an
   optional `Document` bookkeeping model, so it is included (CRUD only; the
   workflows do not touch it).
4. **Answer shaping.** The spec's `answer` step returns JSON and a `Response`
   with `source: answer`. A completion-mode `Agent` step without an explicit
   `outcome.write` merges all JSON fields into context. So the step uses
   `outcome: { format: json }` (fields `answer` / `sources` / `confident` merge
   into context) and the `respond` step uses `mapping:` to project exactly the
   `{ answer, sources, confident }` shape the spec intends.
5. **Ingest response.** The spec's ingest `respond` maps `{ ingested: true, title }`.
   The `Response` step resolves mapping values as context dot-paths only (no
   literal/boolean support), and — with zero custom Python for shaping —
   `ingested: true` cannot be emitted declaratively. The `respond` step returns
   `{ title }`; success is already conveyed by the REST envelope's
   `success: true`.
```
