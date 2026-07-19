# Sentiment API

Post a product review at `POST /api/reviews/analyze` and get back a persisted
sentiment classification. One LLM step, typed persistence, a clean response —
the smallest complete service, chosen to show the **production packaging path**
with [`tuvl ship`](https://tuvl.dev/cli/commands/#tuvl-ship).

Built with [tuvl](https://tuvl.io) `>= 2026.3.1.0` (early stable). See the CLI
reference for [`tuvl ship`](https://tuvl.dev/cli/commands/#tuvl-ship).

## What it demonstrates

- A `ModelDefinition` (`Review`) with an `enum` field (`sentiment`), a `numeric`
  score, and `input: false` server fields (`id`, `created_at`).
- An `Agent` step (`mode: completion`) with `outcome.format: json` for
  structured classification (the review text is auto-merged — the prompt never
  pastes it manually).
- `ModelOp` persistence coexisting with the auto-generated CRUD routes.
- A `Response` **mapping mode** shaping the public payload.
- **`tuvl ship`** — turning the validated project into a production container
  image and a Helm chart in one command.

## Prerequisites

- **PostgreSQL 15+**, database `tuvl_reviews` (plain Postgres — no pgvector).
- **`GEMINI_API_KEY`** — the `classify` Agent uses `gemini/gemini-3.1-flash-lite`
  via LiteLLM.
- **tuvl** `>= 2026.3.1.0` on PATH (`uv tool install "tuvl[standard]>=2026.3.1.0"`).

```sql
CREATE DATABASE tuvl_reviews;
```

The engine creates all tables at boot (`SQLModel.metadata.create_all`) — no
migrations to run.

## Run locally

```bash
# 1. Configure secrets
cp .env.example .env          # then edit .env — set GEMINI_API_KEY and Postgres creds

# 2. Start the dev server (hot reload + Insight editor at /insight)
uv run tuvl dev

# 3. Classify a review
curl -X POST http://localhost:8000/api/reviews/analyze \
  -H 'Content-Type: application/json' \
  -d '{"text": "Battery lasts two days and the screen is gorgeous.", "source": "web"}'
```

```json
{ "id": "…", "sentiment": "positive", "confidence": 0.97, "source": "web" }
```

## Ship to production

`tuvl ship` validates the project, generates a production `Dockerfile` +
`.dockerignore` and a Helm chart under `deploy/`, then builds the container
image:

```bash
tuvl ship --tag ghcr.io/acme/sentiment-api:0.1.0 --push
```

The generated image runs `tuvl run` as a non-root user with
`TUVL_ENV=production` (no dev routes, no Insight UI, JSON logs, telemetry on) and
a `/health` HEALTHCHECK.

Deploy the chart:

```bash
# Runtime secrets: Biscuit signing key (tuvl keys generate), DB password, LLM key
kubectl create secret generic sentiment-api-env --from-env-file=.env

helm install sentiment-api deploy/chart/sentiment-api \
  --set image.repository=ghcr.io/acme/sentiment-api
```

> `tuvl run` (and therefore the container) refuses to boot without a persistent
> `TUVL_BISCUIT_PRIVATE_KEY` — generate one with `tuvl keys generate` and include
> it in the referenced Secret.
