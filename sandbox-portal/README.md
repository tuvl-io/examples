# tuvl sandbox portal

The on-demand playground that powers **[try.tuvl.online](https://try.tuvl.online)** —
a lead-captured landing page where anyone can spin up a real, running
[tuvl example](../) in a private, throwaway sandbox and explore it in the **Tuvl
Insight** editor. No install, no signup friction, no lingering state.

## What it does

1. **Landing + capture** — visitors may enter a name and email (both optional; recorded in
   `data/signups.jsonl`) and always get a random visitor ID shown on screen; the landing page shows live slot availability.
2. **Gallery** — all the example projects, each with a **Run in sandbox** button.
3. **Launch** — one click provisions a per-sandbox database on a shared Postgres,
   `docker run`s that example's image, and returns a **private `https://sN.tuvl.online`
   link** with a countdown.
4. **Auto-cleanup** — a reaper destroys each sandbox (container **and** database)
   when its TTL (default 20 min) expires; visitors can also Stop early.

## Usage tracking and the admin dashboard

The portal records, as JSONL under `DATA_DIR` (`./data`, a volume in the compose files):

| File | Holds |
|---|---|
| `signups.jsonl` | optional name and email, visitor id, time of every start |
| `visits.jsonl` | one row per landing-page load: random visitor id, referrer, `utm_*` |
| `presence.jsonl` | seconds a visitor kept the page open and visible (30 s pings, snapshots) |
| `launches.jsonl` | every sandbox: project, who, when it ended and why, lifetime, active time, requests, whether it was opened |

A sandbox's *active time* is the number of 30-second windows in which the visitor's browser sent it traffic;
*lifetime* is launch to teardown. A visitor id looks like `IN-KAB-0042`: the first two letters are the country (from the request IP, looked up in a local DB-IP Lite database baked into the image, `GEO_MONTH` build arg; `XX` = unknown), then a three-letter series, then a number `0000` to `9999` within that country's series. Arrivals are counted in order, but the number shown is a keyed permutation of the count (so every number is used once and ids reveal neither volume nor order); the dashboard shows the real arrival number. A country moves to a new series once its 10,000 ids are used. The series letters encode the year and month the series started and which series of that month it is, spelled with `SERIES_KEY` so they do not read as a date; the dashboard decodes them (keep the key: changing it makes older series unreadable). Counters live in `data/counters.json`. The IP is never stored. The id is kept in a signed cookie and a signed copy in the browser's localStorage, so it comes back next visit and an id typed by hand is ignored. People are counted by visitor id; an email is only a label, and the dashboard flags addresses that look fake.

`/admin` on the portal host shows people, projects tried, time spent, sources, a 30-day chart and a CSV export. It signs in with
Google and lets in `ADMIN_EMAIL` only (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`; see `.env.example`). Without
the Google settings it answers 503. The sign-up form tells visitors what is kept.

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
| `MAX_PER_SESSION` | 2 | One visitor (session or visitor id) can't hog the pool |
| `MAX_PER_IP` | 6 | Cap per network address |

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
| `POST /api/hit`, `POST /api/ping` | anonymous visit and time-on-page |
| `GET /admin`, `/admin/api/data`, `/admin/export.csv` | admin only |

> Built with [tuvl](https://tuvl.io). The sandboxed Insight editor is public and
> writable **by design** — sandboxes are ephemeral and reset on their TTL.
