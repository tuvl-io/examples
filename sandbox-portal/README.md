# tuvl sandbox portal

The on-demand playground that powers **[try.tuvl.online](https://try.tuvl.online)** —
a lead-captured landing page where anyone can spin up a real, running
[tuvl example](../) in a private, throwaway sandbox and explore it in the **Tuvl
Insight** editor. No install, no signup friction, no lingering state.

## What it does

1. **Landing + capture** — visitors enter a name + work email (tracked to
   `data/signups.jsonl`); the landing page shows live slot availability.
2. **Gallery** — all the example projects, each with a **Run in sandbox** button.
3. **Launch** — one click provisions a per-sandbox database on a shared Postgres,
   `docker run`s that example's image, and returns a **private `https://sN.tuvl.online`
   link** with a countdown.
4. **Auto-cleanup** — a reaper destroys each sandbox (container **and** database)
   when its TTL (default 20 min) expires; visitors can also Stop early.

## Architecture

A single Node process (`server.js`) does three jobs:

- **Portal** — serves the SPA (`public/`) + JSON API on `PORTAL_HOST`.
- **Reverse proxy** — routes `sN.tuvl.online` → the sandbox container `sb-sN:8000`
  (HTTP + websockets, for the Insight editor).
- **Reaper** — tears down expired sandboxes and reaps orphans on boot.

```
browser ──▶ nginx (TLS) ──▶ portal (:3000)
                                 ├─ try.tuvl.online   → landing + API
                                 └─ sN.tuvl.online    → proxy → sb-sN:8000 (tuvl dev)
                            shared pgvector ← per-sandbox DB (sb_sN)
```

Sandboxes run on subdomains from a fixed pool (`s1..sN`), each covered by a
pre-issued TLS cert (`SLOT_COUNT` = the concurrency cap). Every example image is
built from [`../Dockerfile.dev`](../Dockerfile.dev) and runs `tuvl dev`.

## Resource management

| Control | Default | Why |
|---|---|---|
| `SLOT_COUNT` | 12 | Hard concurrency cap (= the slot/cert pool) |
| `SANDBOX_MEM_MB` | 512 | Per-sandbox memory limit |
| `TTL_MINUTES` | 20 | Auto-teardown; frees the slot |
| `MAX_PER_SESSION` | 2 | One visitor can't hog the pool |

The landing page surfaces `GET /api/capacity` (`{used,total,available}`) live, and
disables **Run** with a banner when the pool is full.

## Run it

```bash
cp .env.example .env          # set GEMINI_API_KEY etc.
docker compose up -d --build  # portal on :8120, shared pgvector alongside
# open http://localhost:8120  (set PORTAL_HOST=localhost SANDBOX_SCHEME=http for local)
```

The portal needs the Docker socket (to orchestrate sandboxes) and the example
images present locally (`tuvl-example-<id>:latest`, built from `../<example>`).

## API

| Route | Purpose |
|---|---|
| `POST /api/signup` | `{name,email}` → session cookie (lead capture) |
| `GET /api/examples` | gallery catalogue |
| `GET /api/capacity` | `{used,total,available}` |
| `POST /api/launch` | `{exampleId}` → provisions a sandbox, returns its URL |
| `GET /api/sandbox/:id` | launch status (`starting`/`ready`) |
| `POST /api/stop` | tear a sandbox down early |
| `GET /api/mine` | this visitor's active sandboxes |

> Built with [tuvl](https://tuvl.io). The sandboxed Insight editor is public and
> writable **by design** — sandboxes are ephemeral and reset on their TTL.
