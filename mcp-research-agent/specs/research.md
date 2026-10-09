---
name: research
owner: developer-relations
workflow: research
---
# Intent
Answer a research question with a short brief that cites the web pages it is based on. An agent
fetches and reads sources itself, within a fixed budget, and when it can't finish it says so instead
of failing.

# Actors
Researchers (callers), a research agent with a web-fetch tool, a writing model.

# Data
ResearchBrief (existing): id, question, brief, sources, outcome (answered, capped), created_at.

# Flows
1. The caller posts a question.
2. A research agent fetches pages through an MCP fetch server (only the `fetch` tool is allowed) and
   summarises each source, until it can answer or decides the sources are insufficient.
3. With an answer, a model writes the brief with its sources; the brief is stored as `answered` and
   returned.
4. When the sources are insufficient, the budget runs out, the time is up or the run is aborted, a
   `capped` brief is stored and returned as a partial result.

# Policies
- The research agent is bounded: 8 iterations, 6 tool calls, 40k tokens, 4 minutes.
- Only allow-listed MCP tools may be called; their schemas are pinned in tuvl.lock.
- A model failure while writing the brief also returns the partial result.

# Acceptance
```tuvl-example
name: an answered question returns a cited brief
input: { question: "How does HTTP caching work?" }
mocks:
  investigate: { signal: answered, outputs: { research: { notes: ["Cache-Control drives caching."] } } }
  compose: { outputs: { brief: "HTTP caching is controlled by Cache-Control headers.", sources: [{ url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching" }] } }
expect:
  end: default
  path: [investigate, compose, persist]
  output: { status: 200, body: { outcome: answered } }
```
```tuvl-example
name: running out of budget returns a partial brief
input: { question: "Summarise every RFC ever written." }
mocks:
  investigate: { signal: budget_exceeded }
expect:
  end: partial
  path: [investigate, persist_partial]
  output: { status: 200, body: { outcome: capped } }
```
```tuvl-example
name: insufficient sources return a partial brief
input: { question: "What did the 2031 standards meeting decide?" }
mocks:
  investigate: { signal: insufficient_sources, outputs: { research: { notes: [] } } }
expect:
  end: partial
  path: [investigate, persist_partial]
```
