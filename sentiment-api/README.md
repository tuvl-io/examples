# Sentiment API

Post a product review at `POST /api/reviews/analyze` and get back a persisted sentiment classification — the smallest complete service, and the reference for shipping with `tuvl ship`.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- A two-agent workflow: an `llm` agent (`classify`) with a typed enum output and a token budget,
  and a `tool` agent (`persist`, `use: db`) whose write commits with the step's checkpoint.
- Named ends: `default` (200, the stored review) and `failed` (502); the end bodies are typed in the
  generated OpenAPI (`/docs`).
- A spec whose `tuvl-example` acceptance cases run offline (the model result is mocked).
- **`tuvl ship`**: a production image (pinned tuvl version) and a Helm chart in one command.

## Spec, tests and the CI gate

The intent lives in [`specs/review-sentiment.md`](specs/review-sentiment.md). Its task plan (`*.tasks.yaml`) was derived by
`tuvl spec analyse`, and its `tuvl-example` blocks are the tests in `tests/` (`tuvl codegen`). All
of it runs offline:

```bash
tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install "tuvl[standard]"`), PostgreSQL 15+ with a `tuvl_reviews` database, and a model key
(`GEMINI_API_KEY` by default — any LiteLLM model works; edit `llms/*.yaml`).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/api/reviews/analyze -H 'content-type: application/json' \
  -d '{"text": "Battery lasts two days and the screen is gorgeous.", "source": "web"}'
# {"id": "…", "sentiment": "positive", "confidence": 0.97, "source": "web"}
```

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.

## Ship to production

```bash
tuvl keys generate --write                      # persistent Biscuit key in .env
tuvl ship --tag ghcr.io/acme/sentiment-api:0.1.0 --push
kubectl create secret generic sentiment-api-env --from-env-file=.env
helm install sentiment-api deploy/chart/sentiment-api --set image.repository=ghcr.io/acme/sentiment-api
# split HTTP and execution: --set split=true --set worker.replicaCount=2
```

`tuvl ship` refuses a project that fails validation, has `pending` agents, or has a stale
`tuvl.lock`. The image runs `tuvl run` as a non-root user in production mode.
