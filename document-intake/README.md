# Document Intake

Upload a text document to `POST /api/documents`. The file is kept in a named **blob store**, read back, classified (invoice, contract, report, letter, other), summarised and recorded. A second workflow, `daily_digest`, runs **on a schedule** and writes a digest of the latest documents.

Tier 3 · the example for uploads, blob storage and scheduled triggers. Built with [tuvl](https://tuvl.io) 2.0 — try it without installing at [try.tuvl.online](https://try.tuvl.online).

## What it demonstrates

- **`http.upload`**: the route takes `multipart/form-data`; the file is written to the `inbox` store under a generated key and the run gets a **file reference**, never the bytes. Limits are enforced while the body streams: `413` over 100 KB, `415` for a type outside `accept`, nothing stored for a refused request.
- **Storage**: [`storage/inbox.yaml`](storage/inbox.yaml) is a `local` store; change `provider` to `s3`, `azure` or `gcs` and nothing else moves. A `code` agent reads the file with `ctx.read_file`.
- **`trigger.schedule`**: `daily_digest` runs at 07:00 UTC, once across all workers. In Insight you can start it by hand from the workflow's **Run** button, or with `POST /api/workflows/daily_digest/runs`.
- Two bounded steps and two deterministic ones per workflow, an enum-typed extraction, and document text fenced as untrusted data.

## Spec, tests and the CI gate

The intent lives in [`specs/document-intake.md`](specs/document-intake.md); its `tuvl-example` blocks are the tests in `tests/`. The `read` step waives its offline test because it needs a stored file; the rest of both workflows runs for real.

```bash
tuvl lint spec && tuvl lint project --strict && tuvl generate code --check && tuvl verify lock && tuvl run tests --strict && tuvl verify spec --strict && tuvl list tasks --strict && tuvl review code --strict
```

## Run it

Prerequisites: [tuvl](https://tuvl.dev/getting-started/installation/) 2.0 (`uv tool install "tuvl[standard]>=2.0.1"`), PostgreSQL 15+ with a `tuvl_documents` database, and a model key (`GEMINI_API_KEY` by default).

```bash
cp .env.example .env          # Postgres settings and GEMINI_API_KEY
tuvl dev --auto-login         # Insight at http://localhost:8885/insight
```

```bash
curl -s -X POST localhost:8885/api/documents -F "document=@sample-docs/invoice-1042.txt;type=text/plain"
# {"id": "…", "filename": "invoice-1042.txt", "doc_type": "invoice", "title": "Invoice 1042 for Northwind Traders", "summary": "…"}

# the scheduled workflow, started by hand
curl -s -X POST localhost:8885/api/workflows/daily_digest/runs -H 'content-type: application/json' -d '{"input": {}}'
```

`sample-docs/` holds an invoice, a service agreement and an operations report to upload. Uploaded files land in `./data/storage/in/` (git-ignored). In production, give the store a lifecycle rule: files of a run that started are not deleted by tuvl.
