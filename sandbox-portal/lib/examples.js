// The catalogue shown in the gallery, easiest first, in the order of the examples README. `id` is the URL/image key; the
// sandbox image is `tuvl-example-<id>:latest` (built from examples/<dir> with Dockerfile.dev).
// `tier` is the complexity tier; `engines` are the tuvl 2.0 engines the workflow uses; `spec` is the file in that project's specs/.
export const SOURCE = 'https://github.com/tuvl-io/examples/tree/main'

const ex = (id, dir, title, tier, blurb, engines, spec) => ({
  id, dir, title, difficulty: tier, blurb, engines,
  source: `${SOURCE}/${dir}`,
  spec: `${SOURCE}/${dir}/specs/${spec}.md`,
})

export const EXAMPLES = [
  ex('sentiment', 'sentiment-api', 'Sentiment API', '1 · Starter',
    'Classify a review and persist it: the reference for packaging with `tuvl ship`.',
    ['llm', 'tool'], 'review-sentiment'),
  ex('invoice-extraction', 'invoice-extraction-api', 'Invoice Extraction API', '1 · Starter',
    'Raw invoice text becomes a verified, persisted record, with per-signal outputs and a secure field.',
    ['llm', 'code', 'tool'], 'invoice-extraction'),
  ex('concierge-chat', 'concierge-chat', 'Concierge Chat', '2 · Core',
    'A travel concierge that remembers each traveller across sessions and streams its replies.',
    ['llm', 'memory', 'tool', 'code'], 'travel-concierge'),
  ex('knowledge-base-qa', 'knowledge-base-qa', 'Knowledge Base Q&A', '2 · Core',
    'Ingest markdown, ask questions and get cited answers, on tuvl’s built-in vector search.',
    ['code', 'llm'], 'knowledge-base'),
  ex('batch-screening', 'batch-screening', 'Batch Screening', '3 · Intermediate',
    'Score a list of candidates, one child run each, a few at a time; a failed item never sinks the batch.',
    ['map', 'llm', 'code', 'tool'], 'candidate-screening'),
  ex('document-intake', 'document-intake', 'Document Intake', '3 · Intermediate',
    'Upload a file to a blob store, extract its type and summary, and let a schedule write the daily digest.',
    ['code', 'llm', 'tool'], 'document-intake'),
  ex('content-moderation', 'content-moderation-pipeline', 'Content Moderation', '4 · Advanced',
    'Classify, apply a regional policy in code, let a moderator review it, then audit and notify.',
    ['llm', 'code', 'human', 'tool'], 'content-moderation'),
  ex('support-triage', 'support-triage', 'Support Triage', '4 · Advanced',
    'Rules first with a decision model; an investigating loop whose credit tool needs approval.',
    ['decide', 'loop', 'llm', 'tool', 'code'], 'support-triage'),
  ex('mcp-research', 'mcp-research-agent', 'MCP Research Agent', '5 · Complex',
    'A bounded loop over an allow-listed MCP server writes a cited brief.',
    ['loop', 'llm', 'tool', 'code'], 'research'),
  ex('kyc-onboarding', 'kyc-onboarding', 'KYC Onboarding', '5 · Complex',
    'PII-safe intake, sanctions screening, a judge-supervised investigation and a compliance decision.',
    ['loop', 'human', 'llm', 'tool', 'code'], 'kyc-onboarding'),
]

export const EXAMPLE_BY_ID = Object.fromEntries(EXAMPLES.map((e) => [e.id, e]))
