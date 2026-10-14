---
name: knowledge-base
owner: support-content
workflow: ask_kb
---
# Intent
Support writers add markdown documents to a knowledge base; anyone can ask a question and get an
answer grounded in those documents, with the sources it used and whether it is confident.

# Actors
Support writers (ingest), askers (support agents, the help widget), an embedding model, an answer model.

# Data
- **Document** (existing) — `id` (uuid), `title` (string; required), `tags` (jsonb),
  `created_at` (timestamptz)

# Flows

## Flow: ingest_doc
Trigger: POST /api/kb/ingest · signed-in
Input: `title` (str), `content` (str), `tags` (list[str]?)
Ends: default 201 · failed 502
   - failed: no example — only a vector-store write error reaches it

1. `ingest` — code · in `title`, `content`, `tags`? · out `doc_id` (uuid)
   - error → END.failed
   - tests: waived — it embeds into the kb_docs vector store, which no offline test has

## Flow: ask_kb
Trigger: POST /api/kb/ask · signed-in
Input: `question` (str)
Ends: default 200 · failed 502

1. `search` — code · effect read · in `question` · out `passages` (list[json])
   - error → END.failed
   - tests: waived — it queries the kb_docs vector store, which no offline test has
2. `answer` — llm default · in `question`, `passages` · out `answer` (str), `sources` (list[str]), `confident` (bool) · budget 1000 tok, 30s, retry 2
   - parse_error, timeout, budget_exceeded → END.failed

# Policies
- Answers use only the retrieved passages; with nothing relevant, the answer says so and is not confident.
- Retrieval or model failures return 502.

# Acceptance
```tuvl-example
name: a question is answered from the retrieved passages
input: { question: "How many days of annual leave do employees get?" }
mocks:
  search:
    outputs:
      passages:
        - { content: "All employees are entitled to 25 days annual leave.", metadata: { title: Leave policy }, score: 0.91 }
  answer: { outputs: { answer: "25 days per year.", sources: [Leave policy], confident: true } }
expect:
  end: default
  path: [search, answer]
  output: { status: 200, body: { confident: true, sources: [Leave policy] } }
```
```tuvl-example
name: a retrieval failure returns 502
input: { question: "anything" }
mocks:
  search: { signal: error }
expect:
  end: failed
  path: [search]
  output: { status: 502 }
```
```tuvl-example
name: a document is ingested
workflow: ingest_doc
input: { title: Leave policy, content: "All employees are entitled to 25 days annual leave.", tags: [hr] }
mocks:
  ingest: { outputs: { doc_id: "22222222-2222-2222-2222-222222222222" } }
expect:
  end: default
  output: { status: 201, body: { title: Leave policy, doc_id: "22222222-2222-2222-2222-222222222222" } }
```
