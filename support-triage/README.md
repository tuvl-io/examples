# Support Triage — the two agent modes, side by side

Post a support ticket to `POST /support/triage`; get back a triaged, persisted
ticket. Along the way it runs **both modes of the unified `kind: Agent` step**:

1. a **completion** agent classifies the ticket in one call and routes on a
   closed outcome set, then
2. an **autonomous** agent investigates billing tickets in a bounded tool-loop —
   it looks up the account, reasons over what it finds, and returns a resolution
   or escalates to a human.

It also shows the **artifact subsystem** (prompt / steering / guardrail assets
referenced by `artifact://`), a **guardrail** on the agent's output, and a
tool wired as an off-spine step. This is the clearest single-file tour of how
agents work in tuvl `>= 1.0.0`.

**Runs fully locally on [Ollama](https://ollama.com) — no cloud API key.** (A
one-line switch to a hosted model like Gemini is documented in `llms/default.yaml`.)

Built with [tuvl](https://tuvl.io) `>= 1.0.0`.

## What it demonstrates

| Concept | Where |
|---|---|
| `kind: Agent`, `mode: completion` — one call, routes on `outcome.enum` | `classify` step |
| `kind: Agent`, `mode: autonomous` — bounded ReAct tool-loop | `investigate` step |
| The unified `outcome {write, format, enum, map}` contract | both agents |
| **Artifacts** — `prompt` / `steering` prose + a `guardrail`, via `artifact://` | `artifacts/` |
| A **tool** = an off-spine `Functional` step the agent may call | `lookup_account` |
| A **guardrail** gating the agent's output (`guardrail_violation` route) | `no-secrets` |
| Deterministic routing from a closed enum — a model string can't invent a path | `routes:` |
| `ModelOp` persistence + a `Response` **mapping** payload | `persist`, `respond` |

## How the two agents are built

Both are the **same step kind** (`kind: Agent`) — the required `mode:` field is
the only structural difference.

### 1. Completion agent — `classify`

One retried LLM call. Its system prompt lives in an **artifact** (not inline
YAML), and its `outcome.enum` is the closed set of route signals: the model
returns an `"outcome"` field, the engine validates it against the enum, and that
value picks the next step. Every enum value is mapped in `routes:` (the
validator enforces this).

```yaml
- id: classify
  kind: Agent
  mode: completion
  agent:
    model: default
    system: artifact://triage-prompt@1        # prose lives in artifacts/, version-pinned
    prompt: "Ticket subject: {{ subject }}\n\nBody: {{ body }}"
    outcome:
      format: json
      enum: [billing, technical, account]     # the model's "outcome" field → the route
  routes:
    billing: investigate                       # only billing tickets get the autonomous agent
    technical: persist
    account: persist
    error: persist
```

`category`, `urgency`, and `summary` from the model's JSON auto-merge into the
workflow context — the prompt never has to re-list them.

### 2. Autonomous agent — `investigate`

A bounded tool-loop. Its persistent instruction is a **steering artifact**; it
declares one **tool** (an off-spine step); a **guardrail artifact** gates its
final answer; and its `outcome.enum` decides the branch. The reserved abnormal
exits (`max_iterations`, `budget_exceeded`, `error`, `aborted`,
`guardrail_violation`) are all routed.

```yaml
- id: investigate
  kind: Agent
  mode: autonomous
  agent:
    model: default
    steering: artifact://investigator-steering@1
    max_iterations: 5
    tools:
      - ref: lookup_account                    # names the off-spine step below
        parameters:
          type: object
          properties: { customer_id: { type: string } }
          required: [customer_id]
    guardrails:
      output: [artifact://no-secrets@1]        # gate the reply before it merges/returns
    outcome:
      enum: [resolved, needs_human]
      write: resolution                        # result payload → ctx["resolution"]
  routes:
    resolved: persist
    needs_human: persist
    max_iterations: persist
    budget_exceeded: persist
    error: persist
    aborted: persist
    guardrail_violation: persist

# The tool: a declared Functional step the agent may call. Its top-level
# `description` is what the model reads when choosing the tool.
- id: lookup_account
  kind: Functional
  runner: lookup_account
  description: Look up a customer's billing account (plan, balance, dispute flag) by customer_id.
```

The agent decides `resolved` vs `needs_human` **from what the tool returns** — an
account with an open dispute or a large balance escalates; otherwise it resolves.
Same workflow, different outcome, driven by real data rather than a guess.

### The artifacts

Everything the model reads is a named, versioned artifact under `artifacts/`,
referenced with `artifact://name@version` — edit the prose without touching the
workflow, and (in `tuvl dev`) `.md` edits apply without a restart:

| File | Type | Used by |
|---|---|---|
| `triage_prompt.md` | `prompt` | `classify` system prompt |
| `investigator_steering.md` | `steering` | `investigate` operating instruction |
| `no_secrets.yaml` | `guardrail` | `investigate` output gate (`regex_deny` + `max_chars`) |

## Prerequisites

- **PostgreSQL 15+**, an empty database (default name `tuvl_support`). Plain
  Postgres — no pgvector needed. The engine creates the table at boot.
- **[Ollama](https://ollama.com)** running locally with a tool-capable model:

  ```bash
  ollama serve
  ollama pull llama3.1:latest        # supports native tool-calling (required by the autonomous step)
  ```

  Prefer a hosted model? Edit `llms/default.yaml` (a commented Gemini block is
  right there) and set the key in `.env`.
- **tuvl** `>= 1.0.0` on PATH:
  `uv tool install "tuvl[standard]>=1.0.0"`.

```sql
CREATE DATABASE tuvl_support;
```

## Run it

```bash
# 1. Configure
cp .env.example .env      # set POSTGRES_* to your database

# 2. Start the dev server (hot-reloading; Insight UI at http://localhost:8000/insight)
tuvl dev --project-dir .

# 3. Send a billing ticket → completion classify → autonomous investigate → resolve
curl -s -X POST http://localhost:8000/support/triage \
  -H 'Content-Type: application/json' \
  -d '{
        "customer_id": "cust_001",
        "subject": "I was charged twice this month",
        "body": "Two Pro-plan charges after my upgrade — please refund the extra one."
      }' | python3 -m json.tool
```

Try the two other paths:

- `customer_id: "cust_002"` (an account with an open dispute) → the autonomous
  agent reaches **`needs_human`** instead of resolving.
- a **technical** ticket (e.g. `"subject": "API returns 500 on webhook config"`)
  → the completion classifier routes it straight to `persist`, **skipping the
  autonomous agent entirely** (`resolution` comes back `null`).

### Watch the agent loop live (SSE)

Add `Accept: text/event-stream` to stream the per-iteration frames the
autonomous agent emits — you'll see `iteration → tool_call → outcome`:

```bash
curl -sN -X POST http://localhost:8000/support/triage \
  -H 'Content-Type: application/json' -H 'Accept: text/event-stream' \
  -d '{"customer_id":"cust_001","subject":"charged twice","body":"two Pro charges, please refund"}'
```

### Validate without running

```bash
tuvl validate --project-dir .
```

## A note on small local models

The autonomous step asks the model to end its loop with a strict
`{"outcome": ..., "result": ...}` JSON object. Small local models occasionally
fumble that final turn — and when they do, **the engine refuses to route on a
malformed or missing outcome** (`outcome '<x>' not in [...]`) rather than
inventing a branch. That is the design working, not a bug: a model's output can
only steer the workflow through a declared, closed set. Larger or hosted models
follow the contract more reliably; the steering artifact is written to make the
final format unambiguous.

## The account data

`nodes/lookup_account.py` is a stand-in "account service" with two canned
accounts so the loop has something concrete to reason over — swap it for a real
DB read or an `APICall` in a production build:

- `cust_001` — Pro plan, `$42` due, no dispute → the agent **resolves**.
- `cust_002` — Enterprise, `$1300` due, open dispute → the agent **escalates**.
