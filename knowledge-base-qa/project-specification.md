# Knowledge-Base Q&A — Project Specification

> **Status:** SPECIFICATION — ready to implement · **Difficulty:** Easy–Medium
> **Engine:** tuvl >= 2026.3.1.0 · **Ground truth for all YAML:** `tuvl-agentic-manual.md` (esp. §4.2 built-in runners, Golden Rule 16)
> **Requirements:** see `REQUIREMENTS.md` (Postgres `tuvl_kb` **with pgvector**, `GEMINI_API_KEY` for chat + embeddings)

Ingest markdown documents, then ask questions and get answers grounded in — and citing — the ingested content. The entire RAG pipeline runs on tuvl's built-in rails: **zero custom Python**.

## What it demonstrates

- `EmbeddingRegistry` + `CollectionRegistry` (pgvector-backed vector store)
- The built-in `Functional` runners **`DataIngest`** and **`DataSearch`** (RRF hybrid retrieval)
- Golden Rule 16: RAG = `DataSearch` then `Agent` with `context_injection` — never hand-concatenated prompts
- Two workflows sharing one collection; metadata filters
- The `@tuvl/client` TypeScript SDK driving both endpoints

## Project layout

```
knowledge-base-qa/
├── README.md
├── config.yaml
├── .env.example              # DATABASE_URL, GEMINI_API_KEY
├── models/embeddings.yaml    # EmbeddingRegistry
├── models/collections.yaml   # CollectionRegistry
├── datasources/postgres.yaml # primary: true, pgvector
├── llms/default.yaml         # gemini/gemini-3.1-flash-lite
├── workflows/ingest_doc.yaml
├── workflows/ask_kb.yaml
└── client/ask.ts             # SDK demo script (@tuvl/client)
```

## Registries

- `models/embeddings.yaml` — `kind: EmbeddingRegistry`: one model, name `default`, `gemini/gemini-embedding-001` (Matryoshka-truncated to 1536 dims), `${GEMINI_API_KEY}`.
- `models/collections.yaml` — `kind: CollectionRegistry`: collection `kb_docs`, embedding `default`, dimension **1536** (must match the model; per-collection dim is validated at load).

No `ModelDefinition` is needed — the vector store rows live in the engine's system table. (Optionally add a `Document` model for bookkeeping; not required.)

## Workflow 1 — `workflows/ingest_doc.yaml`

`POST /api/kb/ingest`, body `{ "title": "...", "content": "<markdown>", "tags": ["..."] }`.

1. **`ingest`** — `kind: Functional`, `runner: DataIngest` with:
   ```yaml
   collection: kb_docs
   scope: global
   document: "{{content}}"
   metadata: { title: "{{title}}", tags: "{{tags}}" }
   ```
   Routes: `error → respond_failed`.
2. **`respond`** — `Response` mapping `{ ingested: true, title }`.

## Workflow 2 — `workflows/ask_kb.yaml`

`POST /api/kb/ask`, body `{ "question": "...", "tag": "optional-filter" }`.

1. **`search`** — `kind: Functional`, `runner: DataSearch`:
   ```yaml
   collection: kb_docs
   query: "{{question}}"
   top_k: 5
   output_key: kb_hits
   # metadata_filter: { tags: "{{tag}}" }   # include the filtered variant in the README demo
   ```
   Routes: `error → respond_failed`.
2. **`answer`** — `kind: Agent`, model `default`, `context_injection: [kb_hits]` (Golden Rule 16 — the engine injects retrieval results; do not concatenate them into the prompt). Prompt: answer strictly from the provided sources; cite the `title` of each source used; say "not in the knowledge base" when the sources don't contain the answer. `output: { format: json, output_key: answer }` with shape `{ answer, sources: [title], confident: bool }`. Routes: `error|timeout|parse_error → respond_failed`.
3. **`respond`** — `Response` with `source: answer`.

## SDK script — `client/ask.ts`

A ~40-line `@tuvl/client` script (documented in the README): `client.execute("ingest_doc", ...)` for two sample docs, then `client.execute("ask_kb", { payload: { question } , onProgress })` printing step events. Uses `mode` defaults (REST, SSE when `onProgress` present). Pin `@tuvl/client@2026.3.1`.

## Acceptance criteria

1. `tuvl validate` clean; boot fails gracefully with a clear message if pgvector is missing.
2. Ingest 3 sample markdown docs (ship them in `sample-docs/`); ask a question answerable from doc 2 → answer cites doc 2's title.
3. Ask something not in the docs → the "not in the knowledge base" shape, `confident: false` — no hallucinated citation.
4. The `metadata_filter` variant restricts hits to the tagged doc.
5. `client/ask.ts` runs end-to-end against `tuvl dev` with `pnpm tsx client/ask.ts`.
6. `tuvl test` suite: a stubbed-LLM routing case + a grounded-answer case for `ask_kb`, both with fully stubbed retrieval + answer steps (no pgvector). Each evaluation pins `judge_model: gemini/gemini-3.1-flash-lite`, so `tuvl test` runs green (`2/2`) on the `GEMINI_API_KEY` already in `.env`. (A judge evaluation with no resolvable model — no `judge_model` and no `TUVL_TEST_JUDGE` — is reported as skipped→FAIL, so there is no keyless-green mode; `TUVL_TEST_JUDGE` can override the judge without editing the YAML.)

## Out of scope

Chunking strategies (ingest whole docs; note the extension point in README), reranking, auth, UI.
