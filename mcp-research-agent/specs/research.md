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
- **ResearchBrief** (existing) — `id` (uuid), `question` (text; required), `brief` (text), `sources` (jsonb),
  `outcome` (enum: answered | insufficient_sources | capped), `tokens_used` (integer),
  `created_at` (timestamptz)

# Flows

## Flow: research
Trigger: POST /api/research · signed-in
Input: `question` (str)
Ends: default 200 · partial 200 · failed 502
   - failed: no example — only a database failure reaches it

1. `investigate` — loop default · in `question` · out `research` (json) · budget 8 iterations, 6 tool calls, 40000 tok, 4m
   · tools: mcp `fetch-web` (max 4 calls), `summarize_source`
   - answered → `compose`
   - insufficient_sources, max_iterations, budget_exceeded, timeout, aborted, error → `persist_partial`
T1. `summarize_source` — code · effect read · tool of `loop` · in `url`, `content` · out `summary` (json)
   - default → END
2. `compose` — llm default · in `question`, `research` · out `brief` (str), `sources` (list[json]) · budget 1500 tok, 45s, retry 2
   - parse_error, timeout, budget_exceeded, error → `persist_partial`
3. `persist` — tool db create ResearchBrief · in `question`, `brief`, `sources` · out `saved` (ResearchBrief)
   - default → END
   - conflict → END.failed
4. `persist_partial` — tool db create ResearchBrief · in `question` · out `saved` (ResearchBrief)
   - default → END.partial
   - conflict → END.failed

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
