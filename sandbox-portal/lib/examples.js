// The catalogue shown in the gallery, in the order of the examples README. `id` is the URL/image key; the
// sandbox image is `tuvl-example-<id>:latest` (built from examples/<dir> with Dockerfile.dev).
// `engines` are the tuvl 2.0 engines the workflow uses; `spec` is the file in that project's specs/.
export const SOURCE = 'https://github.com/tuvl-io/examples/tree/release'

const ex = (id, dir, title, difficulty, blurb, engines, spec) => ({
  id, dir, title, difficulty, blurb, engines,
  source: `${SOURCE}/${dir}`,
  spec: `${SOURCE}/${dir}/specs/${spec}.md`,
})

export const EXAMPLES = [
  ex('sentiment', 'sentiment-api', 'Sentiment API', 'Easy',
    'Classify a review and persist it: the reference for packaging with `tuvl ship`.',
    ['llm', 'tool'], 'review-sentiment'),
  ex('invoice-extraction', 'invoice-extraction-api', 'Invoice Extraction API', 'Easy',
    'Raw invoice text becomes a verified, persisted record, with per-signal outputs and a secure field.',
    ['llm', 'code', 'tool'], 'invoice-extraction'),
  ex('knowledge-base-qa', 'knowledge-base-qa', 'Knowledge Base Q&A', 'Easy–Medium',
    'Ingest markdown, ask questions and get cited answers, on tuvl’s built-in vector search.',
    ['code', 'llm'], 'knowledge-base'),
  ex('content-moderation', 'content-moderation-pipeline', 'Content Moderation', 'Medium',
    'Classify, apply a regional policy in code, let a moderator review it, then audit and notify.',
    ['llm', 'code', 'human', 'tool'], 'content-moderation'),
  ex('support-triage', 'support-triage', 'Support Triage', 'Medium',
    'Rules first with a decision model; an investigating loop whose credit tool needs approval.',
    ['decide', 'loop', 'llm', 'tool', 'code'], 'support-triage'),
  ex('mcp-research', 'mcp-research-agent', 'MCP Research Agent', 'Medium–Complex',
    'A bounded loop over an allow-listed MCP server writes a cited brief.',
    ['loop', 'llm', 'tool', 'code'], 'research'),
  ex('kyc-onboarding', 'kyc-onboarding', 'KYC Onboarding', 'Complex',
    'PII-safe intake, sanctions screening, a judge-supervised investigation and a compliance decision.',
    ['loop', 'human', 'llm', 'tool', 'code'], 'kyc-onboarding'),
]

export const EXAMPLE_BY_ID = Object.fromEntries(EXAMPLES.map((e) => [e.id, e]))
