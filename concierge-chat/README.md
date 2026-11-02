# Concierge Chat

A travel concierge at `POST /api/concierge/chat` that **remembers each traveller across conversations**. Tell it once that you want a window seat and eat vegetarian; ask about a trip tomorrow and it already knows. Replies can be **streamed token by token**, and a scheduled workflow folds old memories into summaries every night.

Tier 2 · the example for `llm.memory`, token streaming and the built-in memory compaction. Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at [try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- **`llm.memory`** on the `reply` agent: before the call the runtime recalls the signed-in traveller's last 6 memories plus the 3 older ones most related to the message; after a successful answer it stores the message and reply. The owner is `key: principal`, chosen in YAML and never by the model, so one traveller never sees another's memory. The journal records `memory_recalled` and `memory_written`.
- **Token streaming**: `stream_tokens: true` sends the reply text as `token_delta` events while the model writes (see below).
- **A scheduled built-in**: `compact_memory` runs `tuvl.memory_compact` nightly at 03:00 UTC, folding all but the latest 5 memories of any traveller with more than 20 into one summary.
- **Vector rails for memory**: [`vectorstore/`](vectorstore) declares the collection and the embedding model (pgvector).
- A deterministic `log_turn` step keeps a plain, queryable `Turn` table beside the vector memory.

## Spec, tests and the CI gate

The intent lives in [`specs/travel-concierge.md`](specs/travel-concierge.md); its `tuvl-example` blocks are the tests in `tests/`. Memory and compaction need the vector store, so the offline tests mock the model and the compaction waives its test.

```bash
tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict && tuvl review code --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0 (`uv tool install "tuvl[standard]>=2.0.1"`), PostgreSQL 15+ with a `tuvl_concierge` database and the **pgvector** extension, and a Gemini key (chat model and embeddings).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

Memory belongs to the signed-in traveller, so call the API with a token (in dev, the session key in `.tuvl/.dev-session` is accepted as a bearer token):

```bash
KEY=…   # contents of .tuvl/.dev-session
chat() { curl -s -X POST localhost:8885/api/concierge/chat -H "authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d "{\"message\": \"$1\"}"; }

chat "I always want a window seat, I eat vegetarian, and I prefer TAP Air Portugal."
chat "I need to go to Lisbon next Friday. What would you arrange?"   # uses what it remembers
```

Watch the replies stream: start the run without waiting, then follow its events with drafts on.

```bash
RID=$(curl -s -X POST "localhost:8885/api/workflows/chat/runs?wait=false" -H "authorization: Bearer $KEY" \
  -H 'content-type: application/json' -d '{"input": {"message": "Plan three days in Lisbon."}}' | jq -r .run_id)
curl -N "localhost:8885/api/runs/$RID/events?drafts=true" -H "authorization: Bearer $KEY"   # token_delta events
```

Inspect or erase what it knows in Insight → **Memory**, or with `tuvl prune memory concierge_memory --key <owner>`.

> **Known limit (2.0.1):** `llm.memory.retention` is left out on purpose — `tuvl run tests` runs on SQLite and the retention sweep uses a Postgres-only query, so a project that sets it cannot pass its own offline gate. Nightly compaction (and `tuvl prune memory --older-than 90d`) keep memory small instead.
