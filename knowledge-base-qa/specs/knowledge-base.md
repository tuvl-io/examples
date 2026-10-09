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
The `kb_docs` vector collection: document text, title and tags as metadata.

# Flows
1. Ingest (`ingest_doc`): a writer posts a title, markdown content and optional tags; the document is
   embedded and stored, and its id is returned with 201.
2. Ask (`ask_kb`): an asker posts a question; the five most similar passages are retrieved.
3. A model answers from those passages only, listing the titles it used as sources and saying whether
   it is confident.
4. The answer, sources and confidence are returned.

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
