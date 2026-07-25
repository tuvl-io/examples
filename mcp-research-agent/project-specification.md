# MCP Research Agent — Project Specification

> **Status:** SPECIFICATION — ready to implement · **Difficulty:** Medium–Complex
> **Engine:** tuvl >= 1.0.0 · **Ground truth:** `tuvl-agentic-manual.md` (§4.7 MCP, §4.13 autonomous agents) + engine `docs/autonomous-agent.md`
> **Requirements:** see `REQUIREMENTS.md` (Postgres `tuvl_research`, `GEMINI_API_KEY` — Google Gemini `gemini/gemini-3.1-flash-lite` via LiteLLM, `uv` installed for `uvx mcp-server-fetch`, outbound network)

`POST /api/research` hands a question to a bounded **autonomous agent** (`kind: Agent`, `mode: autonomous`) that drives an **MCP fetch tool** across the web, summarizes sources as it goes, and returns a cited research brief — capped by iterations and a token budget, with live loop progress streamed to the caller.

## What it demonstrates

- `kind: MCP` over **stdio** transport — the only example exercising the MCP step; the server connection is a `type: mcp` structured artifact referenced via `mcp.server`
- `kind: Agent`, `mode: autonomous`: declared tool set, `outcome.enum`, `outcome.write`, `max_iterations`, `token_budget`, and **all four reserved exits routed** (`max_iterations` / `budget_exceeded` / `error` / `aborted` — Golden Rule 26; `aborted` can arrive from the operator API even without a supervisor; `guardrail_violation` is also reserved, only for agents with guardrails attached)
- Versioned prose artifacts: `steering` and `skills` as pinned `artifact://` refs to front-matter markdown in `artifacts/`
- Tool descriptions sourced from the referenced step's **`description:`** (required — `tuvl validate` errors without one)
- Live `agent_progress` frames consumed via the SDK's `agentProgress()` helper

## Project layout

```
mcp-research-agent/
├── README.md
├── config.yaml
├── .env.example                      # Postgres creds, GEMINI_API_KEY
├── models/research_brief.yaml
├── datasources/postgres.yaml
├── llms/default.yaml
├── workflows/research.yaml
├── nodes/summarize_source.py
├── artifacts/
│   ├── research-method.md            # type: steering — always injected
│   ├── citation-style.md             # type: skill — injected when relevant
│   └── fetch-web.yaml                # type: mcp — the fetch server's transport config
└── client/watch.ts                   # SDK live-progress demo
```

## Data model — `models/research_brief.yaml`

`ResearchBrief`, table `research_briefs`: `id` (uuid pk, uuid4, input:false) · `question` (text, required) · `brief` (text) · `sources` (jsonb — `[{url, title, takeaway}]`) · `outcome` (`enum` `[answered, insufficient_sources, capped]`) · `tokens_used` (integer) · `created_at` (input:false).

## Workflow — `workflows/research.yaml`

Trigger: `POST /api/research`, body `{ "question": "..." }`. `spec.context.models: [ResearchBrief]`.

1. **`investigate`** — `kind: Agent`, `mode: autonomous`:
   ```yaml
   agent:
     model: default
     steering: artifact://research-method@1     # type: steering prose artifact
     skills: ["artifact://citation-style@1"]    # type: skill prose artifact
     max_iterations: 6
     token_budget: 60000
     tools:
       - ref: fetch_page
         parameters:
           type: object
           properties: { url: { type: string } }
           required: [url]
       - ref: summarize_source
         parameters:
           type: object
           properties:
             url: { type: string }
             content: { type: string }
           required: [url, content]
     outcome:
       enum: [answered, insufficient_sources]
       write: research
   routes:
     answered: compose
     insufficient_sources: respond_partial
     max_iterations: respond_partial
     budget_exceeded: respond_partial
     error: respond_failed
     aborted: respond_failed
   ```
2. **`fetch_page`** — off-spine tool step, `kind: MCP`, **`description:` on this step is mandatory** (the model chooses tools by it). The transport config lives in a `type: mcp` structured artifact:
   ```yaml
   # artifacts/fetch-web.yaml
   kind: Artifact
   version: v1
   enabled: true
   metadata: { name: fetch-web, description: MCP fetch server (stdio). }
   spec:
     type: mcp
     transport: stdio
     command: uvx
     args: [mcp-server-fetch]
   ```
   ```yaml
   - id: fetch_page
     kind: MCP
     description: Fetch a web page and return its readable text content.
     mcp:
       server: artifact://fetch-web@1
       tool: fetch
       arguments: { url: "{{url}}" }
       timeout: 30
     response: { output_key: fetched }
   ```
   Not on the spine: no `routes:` needed — a tool's routes are ignored when dispatched by the agent; tool errors return to the agent as observations.
3. **`summarize_source`** — off-spine tool, `kind: Functional`, `runner: summarize_source`, `description: Summarize one fetched source into a two-sentence takeaway with its URL.` Implementation: pure-Python trim/normalize + structured `{url, title, takeaway}` append into the tool result (no nested LLM call — keeps the loop's cost inside the agent's own budget).
4. **`compose`** — `Agent` (`mode: completion`) producing the final brief from `research` (json outcome `{brief, sources}`). Routes: `error|timeout|parse_error → respond_partial`.
5. **`persist`** — `ModelOp` create on `ResearchBrief` (outcome per path; `capped` on the partial path).
6. **`respond` / `respond_partial` / `respond_failed`** — `Response` mapping. Partial responses must say what was gathered and why it stopped (`max_iterations` vs `budget_exceeded` — read the terminal signal, not the LLM's opinion).

Note: `respond_partial` path also runs a `persist` (`ModelOp`) before responding — dedupe via a shared persist step reached from both branches, or two persist steps; keep every signal mapped either way.

## Agent assets

- `artifacts/research-method.md` (`type: steering`, version 1): fetch → summarize → decide loop; never fetch the same URL twice; prefer primary sources; stop at two corroborating sources.
- `artifacts/citation-style.md` (`type: skill`, version 1): citation format for the brief (`[n] title — url`).
Both are front-matter markdown artifacts in `artifacts/`, referenced from the workflow as pinned `artifact://<name>@1` refs (floating refs draw a validate warning).

## SDK script — `client/watch.ts`

`client.execute("research", { payload, onProgress })` printing: iteration frames (`iteration n, tokens_used`), tool calls (`→ fetch_page: <url>`), and the terminal signal — via `agentProgress(ev)` (returns `null` for non-progress frames; handle all four reserved exits). Pin `@tuvl/client@^1.0.0`.

## Acceptance criteria

1. `tuvl validate` clean — including tool descriptions present and all reserved exits routed.
2. A researchable question (ship two in the README) completes with `answered`, ≥2 sources, persisted brief.
3. Set `max_iterations: 1` temporarily → run exits `max_iterations` and the partial response says so; same for a tiny `token_budget` → `budget_exceeded`.
4. Kill the network → tool errors surface as agent observations; the run ends via a declared outcome or reserved exit — never an unhandled 500.
5. `client/watch.ts` shows live iteration/tool frames while the run is in flight.
6. Operator abort demo (optional, dev-mode): `POST /api/agents/runs/{id}/abort` → workflow exits through `aborted → respond_failed`.
7. `tuvl test` suite with the stubbed tool-loop (scripted LLM turns) covering `answered` and `max_iterations` paths.

## Out of scope

Search-engine MCP servers (fetch-only keeps it keyless), multi-agent orchestration, dedup/caching of fetched pages, `spec.supervisor` (that's `kyc-onboarding`'s job).
