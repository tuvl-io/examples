# Invoice Extraction API

Paste raw invoice text at `POST /api/invoices/extract` and get back a validated, persisted, structured invoice. A model extracts; deterministic code verifies.

Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at
[try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- An `llm` agent (`extract`) returning typed, optional fields.
- A `code` agent (`verify_totals`, `agents/verify_totals.py`) with **per-signal outputs**: `valid`
  and `mismatch` produce an invoice, `incomplete` only a verification report.
- Two `tool: db` writers routing to different named ends (`default`, `rejected`), `duplicate` (409)
  on a unique-number conflict, and `failed` (422).
- A `secure: true` field (`vendor_tax_id`) that is stored but never returned or logged.

## Spec, tests and the CI gate

The intent lives in [`specs/invoice-extraction.md`](specs/invoice-extraction.md). Its task plan (`*.tasks.yaml`) was derived by
`tuvl spec analyse`, and its `tuvl-example` blocks are the tests in `tests/` (`tuvl codegen`). All
of it runs offline:

```bash
tuvl validate --strict && tuvl codegen --check && tuvl lock --check && tuvl test && tuvl spec status --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0
(`uv tool install "tuvl[standard]"`), PostgreSQL 15+ with a `tuvl_invoices` database, and a model key
(`GEMINI_API_KEY` by default — any LiteLLM model works; edit `llms/*.yaml`).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/api/invoices/extract -H 'content-type: application/json' \
  -d '{"raw_text": "ACME CORP\nInvoice #INV-1001\nDate: 2026-06-01\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 108.50 USD\nTax ID: US-99-1234567"}'
# totals that don't add up → status "rejected"; text with no invoice → 422
```

Open **Workflows** in Insight to see the graph, **Runs** to follow a run's journal, and pin a run
as a test fixture.
