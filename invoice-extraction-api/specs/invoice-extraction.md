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
Invoice (existing): id, vendor_name, invoice_number, invoice_date, currency (USD, EUR, GBP, INR),
subtotal, tax, total, vendor_tax_id (secure), status (extracted, rejected), created_at.

# Flows
1. The caller posts the raw invoice text.
2. A model extracts vendor, number, date, currency, subtotal, tax, total and the vendor tax id.
3. Code verifies the totals: subtotal + tax must equal total.
4. A valid invoice is stored as `extracted` and returned.
5. An invoice whose totals don't add up is stored as `rejected` and returned with the verification.
6. Text that yields no usable invoice is refused with 422.
7. A duplicate invoice number is refused with 409.

# Policies
- The vendor tax id is PII: it is stored but never returned.
- Verification is deterministic — never decided by the model.

# Acceptance
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
