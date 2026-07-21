# Invoice Extraction API

Paste raw invoice text at `POST /api/invoices/extract` and get back a validated,
persisted, structured invoice record. One LLM step, deterministic verification,
typed persistence — the smallest example that proves *"declare a model and a
workflow in YAML, get a production API."*

Built with [tuvl](https://tuvl.io) `>= 2026.3.1.0`. See the full brief in
[`project-specification.md`](./project-specification.md).

## What it demonstrates

- A `ModelDefinition` with `enum` fields (`currency`, `status`), a `secure: true`
  PII field (`vendor_tax_id`), and `input: false` server fields (`id`,
  `created_at`).
- An `Agent` step (`mode: completion`) with `outcome.format: json` for
  structured extraction (input is auto-merged — the prompt never pastes
  `raw_text` manually).
- A custom `Functional` node (`verify_totals`) emitting business signals
  (`valid` / `mismatch`) routed via `routes:`.
- `ModelOp` persistence coexisting with the auto-generated CRUD routes.
- `Response` **mapping mode** shaping the public payload so the `secure`
  `vendor_tax_id` never leaves the service.

## Prerequisites

See the repo-root [`../REQUIREMENTS.md`](../REQUIREMENTS.md) for the full matrix.
For this project specifically:

- **PostgreSQL 15+**, database `tuvl_invoices` (plain Postgres — no pgvector).
- **`GEMINI_API_KEY`** — the `extract` Agent uses `gemini/gemini-3.1-flash-lite` via LiteLLM.
- **tuvl** `>= 2026.3.1.0` on PATH (`uv tool install "tuvl[standard]>=2026.3.1.0"`).

```sql
CREATE DATABASE tuvl_invoices;
```

The engine creates all tables at boot (`SQLModel.metadata.create_all`) — no
migrations to run.

## Run

```bash
# 1. Configure secrets
cp .env.example .env          # then edit .env — set GEMINI_API_KEY and Postgres creds

# 2. Validate the project (static — no DB or API key needed)
tuvl validate

# 3. Boot the dev server
tuvl dev                      # http://localhost:8000  (+ /insight)
```

## Demo

### 1. Happy path — a balanced invoice is extracted and persisted

```bash
curl -s -X POST http://localhost:8000/api/invoices/extract \
  -H 'Content-Type: application/json' \
  -d '{"raw_text": "ACME CORP\nInvoice #INV-1001\nDate: 2026-06-01\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 108.50 USD\nTax ID: US-99-1234567"}'
```

Expected (`200`) — note `vendor_tax_id` is **absent** (redacted by the mapping
response):

```json
{
  "success": true,
  "status_code": 200,
  "data": {
    "id": "…uuid…",
    "vendor_name": "Acme Corp",
    "invoice_number": "INV-1001",
    "currency": "USD",
    "total": 108.5,
    "status": "extracted"
  },
  "error": null
}
```

Confirm the row via the auto-generated CRUD route. Unlike the workflow trigger,
the auto-CRUD routes are **always auth-guarded** (`invoice:read` scope) — even in
dev. `tuvl dev` mints a per-session key (persisted to `.tuvl/.dev-session`, mode
`0600`) that dev mode accepts as a Bearer token; pass it in the `Authorization`
header (run `tuvl dev --show-key` to print it):

```bash
KEY=$(python3 -c "import json; print(json.load(open('.tuvl/.dev-session'))['key'])")
curl -s http://localhost:8000/models/invoice/ -H "Authorization: Bearer $KEY"
```

Without the header the route returns `401 Unauthorized`. The raw model row here
includes `vendor_tax_id` because you are an authenticated admin (`iam:admin`) —
the `secure` field is redacted only from the public **workflow** responses, never
from this scoped CRUD API. In production, mint a real Biscuit with `invoice:read`.

### 2. Mismatch path — total ≠ subtotal + tax → rejected with reasons

```bash
curl -s -X POST http://localhost:8000/api/invoices/extract \
  -H 'Content-Type: application/json' \
  -d '{"raw_text": "ACME CORP\nInvoice #INV-2002\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 200.00 USD"}'
```

Expected: `data.status == "rejected"` and a `verification` object whose `reasons`
list explains the total mismatch. The record is persisted with `status: rejected`.

### 3. Garbage input — routes through `parse_error` / `mismatch`, never a 500

```bash
curl -s -X POST http://localhost:8000/api/invoices/extract \
  -H 'Content-Type: application/json' \
  -d '{"raw_text": "###### not an invoice ######"}'
```

Expected: a clean error payload (HTTP 200/400 business envelope), never an
unhandled 500, and no `status: extracted` row.

## Tests

Three LLM-as-a-Judge cases (happy / mismatch / garbage) live under
`tests/workflows/`. The `extract` (LLM) and `persist` (DB) steps are stubbed so
the workflow paths are deterministic; the evaluations still call a judge model.

```bash
tuvl test                     # needs GEMINI_API_KEY (judge); no Postgres required
```

## How it works

```
POST /api/invoices/extract  { "raw_text": "…" }
        │
        ▼
  extract (Agent, JSON)  ──parse_error/timeout/error──▶ respond_failed
        │ default → context["extracted"]
        ▼
  verify_totals (Functional)  ──mismatch──▶ persist_rejected ──▶ respond_rejected
        │ valid                                error │
        ▼                                            ▼
  persist (ModelOp create, status=extracted)   respond_failed
        │ default
        ▼
  respond_ok (Response mapping — vendor_tax_id redacted)
```

## Files

| Path | Role |
|------|------|
| `config.yaml` | `ProjectConfig` — directory layout |
| `datasources/postgres.yaml` | primary Postgres `DataSource` (env-interpolated creds) |
| `models/invoice.yaml` | `Invoice` `ModelDefinition` (enums, secure & server fields) |
| `llms/default.yaml` | `AgentModel` preset `default` → `gemini/gemini-3.1-flash-lite` |
| `workflows/extract_invoice.yaml` | the extract → verify → persist → respond pipeline |
| `nodes/verify_totals.py` | deterministic totals/required-field verification |
| `tests/workflows/*.yaml` | happy / mismatch / garbage test cases |

## Out of scope

PDF/OCR parsing (input is text), multi-page invoices, currency conversion, auth
(dev mode only).
