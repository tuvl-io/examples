---
name: invoice-extraction
owner: finance-ops
workflow: extract_invoice
---
# Intent
Finance pastes raw invoice text and gets back a structured, verified invoice record. Extraction is
done by a model; verification is deterministic arithmetic; only verified invoices are accepted.

# Actors
Finance staff (callers), an extraction model.

# Data
- **Invoice** (existing) — `id` (uuid), `vendor_name` (string; required),
  `invoice_number` (string; required; unique), `invoice_date` (date),
  `currency` (enum: USD | EUR | GBP | INR; required), `subtotal` (numeric; required),
  `tax` (numeric; required), `total` (numeric; required), `vendor_tax_id` (string; secure),
  `status` (enum: extracted | rejected; required), `raw_text` (text), `created_at` (timestamptz)

# Flows

## Flow: extract_invoice
Trigger: POST /api/invoices/extract · signed-in
Input: `raw_text` (str)
Ends: default 200 · rejected 200 · duplicate 409 · failed 422

1. `extract` — llm default · in `raw_text` · out `vendor_name` (str?), `invoice_number` (str?), `invoice_date` (date?), `currency` (enum[USD, EUR, GBP, INR]?), `subtotal` (float?), `tax` (float?), `total` (float?), `vendor_tax_id` (str?) · budget 2000 tok, 60s, retry 2
   - parse_error, timeout, budget_exceeded → END.failed
2. `verify_totals` — code · effect read · in `vendor_name`, `invoice_number`, `invoice_date`, `currency`, `subtotal`, `tax`, `total`, `vendor_tax_id`, `raw_text`
   - valid (out `invoice` (Invoice.create), `verification` (json)) → `persist`
   - mismatch (out `invoice` (Invoice.create), `verification` (json)) → `persist_rejected`
   - incomplete (out `verification` (json)) → END.failed
   - default → END.failed
3. `persist` — tool db create Invoice · in `invoice` · out `saved` (Invoice)
   - default → END
   - conflict → END.duplicate
4. `persist_rejected` — tool db create Invoice · in `invoice` · out `rejected` (Invoice)
   - default → END.rejected
   - conflict → END.duplicate

# Policies
- The vendor tax id is PII: it is stored but never returned.
- Verification is deterministic — never decided by the model.

# Acceptance
```tuvl-example
name: a duplicate invoice number is refused
given: { Invoice: [{ id: "0b5e3f1a-6c2d-4d1e-8a77-5d9c1b2a3f40", vendor_name: Acme Corp, invoice_number: INV-1001, currency: USD, subtotal: 100.0, tax: 8.5, total: 108.5, status: extracted }] }
input:
  raw_text: "ACME CORP\nInvoice #INV-1001\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 108.50 USD"
mocks:
  extract:
    outputs: { vendor_name: Acme Corp, invoice_number: INV-1001, currency: USD, subtotal: 100.0, tax: 8.5, total: 108.5 }
expect:
  end: duplicate
  output: { status: 409 }
```
```tuvl-example
name: a valid invoice is extracted and stored
input:
  raw_text: "ACME CORP\nInvoice #INV-1001\nDate: 2026-06-01\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 108.50 USD\nTax ID: US-99-1234567"
mocks:
  extract:
    outputs: { vendor_name: Acme Corp, invoice_number: INV-1001, invoice_date: "2026-06-01", currency: USD,
               subtotal: 100.0, tax: 8.5, total: 108.5, vendor_tax_id: US-99-1234567 }
expect:
  end: default
  path: [extract, verify_totals, persist]
  output: { status: 200, body: { status: extracted, invoice_number: INV-1001 } }
  assertions: ["not contains(output.body, 'vendor_tax_id')"]
```
```tuvl-example
name: totals that do not add up are stored as rejected
input:
  raw_text: "ACME CORP\nInvoice #INV-2002\nSubtotal: 100.00 USD\nTax: 8.50 USD\nTotal: 200.00 USD"
mocks:
  extract:
    outputs: { vendor_name: Acme Corp, invoice_number: INV-2002, currency: USD, subtotal: 100.0, tax: 8.5, total: 200.0 }
expect:
  end: rejected
  path: [extract, verify_totals, persist_rejected]
  output: { status: 200, body: { status: rejected, invoice_number: INV-2002 } }
```
```tuvl-example
name: text with no invoice is refused
input: { raw_text: "hello there" }
mocks:
  extract: { outputs: {} }
expect:
  end: failed
  path: [extract, verify_totals]
  output: { status: 422 }
```
