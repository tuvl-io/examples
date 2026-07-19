# Invoice Extraction API — Project Specification

> **Status:** SPECIFICATION — ready to implement · **Difficulty:** Easy
> **Engine:** tuvl >= 2026.3.1.0 · **Ground truth for all YAML:** `tuvl-agentic-manual.md` in the engine repo (golden rules are hard constraints)
> **Requirements:** see repo-root `REQUIREMENTS.md` (Postgres `tuvl_invoices`, `GEMINI_API_KEY`; no pgvector, no Redis)

Paste raw invoice text at `POST /api/invoices/extract` and get back a validated, persisted, structured invoice record. One LLM step, deterministic verification, typed persistence — the smallest example that proves "declare a model and a workflow in YAML, get a production API."

## What it demonstrates

- `ModelDefinition` with `enum` fields, a `secure: true` PII field, and `input: false` server fields
- `Agent` step (`mode: completion`) with `outcome.format: json` (structured extraction, auto-merged input)
- A custom `Functional` node emitting business signals (`valid` / `mismatch`) routed via `routes:`
- `ModelOp` persistence + the auto-generated CRUD routes coexisting with the workflow
- `Response` mapping mode shaping the public payload (the `secure` field never leaves)

## Project layout

Scaffold with `tuvl init invoice-extraction-api`, then produce:

```
invoice-extraction-api/
├── README.md                # how to run + demo curl
├── config.yaml              # from scaffold
├── .env.example             # DATABASE_URL, GEMINI_API_KEY
├── models/invoice.yaml
├── datasources/postgres.yaml
├── llms/default.yaml
├── workflows/extract_invoice.yaml
└── nodes/verify_totals.py
```

## Data model — `models/invoice.yaml`

```yaml
kind: ModelDefinition
enabled: true
metadata: { name: Invoice, schema_version: v1 }
spec:
  tablename: invoices
  fields:
    - { name: id, type: uuid, primary_key: true, default: uuid4, input: false }
    - { name: vendor_name, type: string, required: true }
    - { name: invoice_number, type: string, required: true, unique: true, index: true }
    - { name: invoice_date, type: date }
    - { name: currency, type: enum, enum_values: [USD, EUR, GBP, INR], required: true }
    - { name: subtotal, type: numeric, required: true }
    - { name: tax, type: numeric, required: true }
    - { name: total, type: numeric, required: true }
    - name: vendor_tax_id
      type: string
      secure: true          # masked in telemetry snapshots — verify in acceptance
    - { name: status, type: enum, enum_values: [extracted, rejected], required: true }
    - { name: raw_text, type: text }
    - { name: created_at, type: timestamptz, input: false }
```

Datasource: single Postgres `DataSource` with `metadata.primary: true`, database `tuvl_invoices`, connection via `${DATABASE_URL}` (Golden Rule 9 — never inline credentials).

LLM preset `llms/default.yaml`: `kind: AgentModel`, name `default`, model `gemini/gemini-3.1-flash-lite`, `api_key: ${GEMINI_API_KEY}`.

## Workflow — `workflows/extract_invoice.yaml`

`POST /api/invoices/extract`, body `{ "raw_text": "<invoice text>" }` (untyped trigger; the model contract is enforced downstream by the Create schema at the ModelOp).

Step sequence (every non-`default` signal must be routed — Golden Rule 6):

1. **`extract`** — `kind: Agent`, `mode: completion`, model `default`, `outcome: { format: json }` (the prompt asks for a single `extracted` object, which merges into context). Prompt: extract `vendor_name, invoice_number, invoice_date (ISO), currency (one of USD|EUR|GBP|INR), subtotal, tax, total, vendor_tax_id` from `raw_text`; do not invent values, use `null` for absent fields. Do **not** paste `raw_text` into the prompt manually — the engine appends the input block (Golden Rule 15). Routes: `error → respond_failed`, `timeout → respond_failed`, `parse_error → respond_failed`.
2. **`verify_totals`** — `kind: Functional`, `runner: verify_totals`. Emits `valid` when `subtotal + tax == total` (within 0.01) and all required fields are present; else `mismatch` with a reason list written to `verification`. Routes: `valid → persist`, `mismatch → persist_rejected`, `error → respond_failed`.
3. **`persist`** — `kind: ModelOp`, operation `create` on `Invoice`, payload from `extracted` plus `status: extracted` and `raw_text` — then continue to `respond_ok`.
4. **`persist_rejected`** — `ModelOp` create with `status: rejected` → `respond_rejected`.
5. **`respond_ok` / `respond_rejected` / `respond_failed`** — `kind: Response`, **mapping mode** projecting id, vendor_name, invoice_number, currency, total, status (+ `verification` reasons on the rejected path). Never use `source:` on the full record here — `vendor_tax_id` is secure and mapping is the correct redaction tool (see engine `docs/response.md` §6).

`spec.context` must declare `models: [Invoice]` (Golden Rule 5). `Invoice` must appear in the context or every repo call raises `PermissionError`.

## Custom node — `nodes/verify_totals.py`

Exactly one `@node("verify_totals")` in a file named `verify_totals.py` (Golden Rule 14 — `tuvl validate` now warns on mismatch). Async signature; reads `context["extracted"]`; returns `(context, "valid" | "mismatch")`; writes `context["verification"] = {"ok": bool, "reasons": [...]}`. Pure Python, no LLM, no I/O.

## Acceptance criteria

1. `tuvl validate` — zero errors, zero warnings.
2. `tuvl dev` boots; `POST /api/invoices/extract` with a realistic invoice text returns `200` `{success: true, data: {...status: "extracted"}}` and the row exists via auto-CRUD `GET /models/invoice/`.
3. A doctored invoice (total ≠ subtotal+tax) returns the rejected shape with reasons, `status: rejected` persisted.
4. Garbage input routes through `parse_error`/`mismatch` — never a 500.
5. `vendor_tax_id` is absent from every workflow response and (with `TUVL_TELEMETRY_ENABLED=true`) masked in span context snapshots.
6. A `tests/` suite for `tuvl test` covering the three paths (happy, mismatch, garbage) with stubbed LLM output.

## Out of scope

PDF/OCR parsing (input is text), multi-page invoices, currency conversion, auth (dev mode only).
