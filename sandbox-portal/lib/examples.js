// The catalogue shown in the gallery. `id` is the URL/image key; the sandbox
// image is `tuvl-example-<id>:latest` (built from tuvl_project/examples/<dir>).
export const EXAMPLES = [
  {
    id: 'sentiment',
    dir: 'sentiment-api',
    title: 'Sentiment API',
    difficulty: 'Easy',
    blurb: 'Classify a review’s sentiment and persist it — the reference for packaging to production with `tuvl ship`.',
    steps: ['Agent', 'ModelOp', 'Response'],
  },
  {
    id: 'invoice-extraction',
    dir: 'invoice-extraction-api',
    title: 'Invoice Extraction API',
    difficulty: 'Easy',
    blurb: 'Raw invoice text → validated structured records via a single LLM step.',
    steps: ['Agent', 'Functional', 'ModelOp', 'Response'],
  },
  {
    id: 'knowledge-base-qa',
    dir: 'knowledge-base-qa',
    title: 'Knowledge Base Q&A',
    difficulty: 'Easy–Medium',
    blurb: 'Ingest markdown, ask questions, get cited answers — RAG on built-in rails.',
    steps: ['DataIngest', 'DataSearch', 'Agent', 'Response'],
  },
  {
    id: 'support-triage',
    dir: 'support-triage',
    title: 'Support Triage',
    difficulty: 'Easy–Medium',
    blurb: 'Both agent modes side by side — completion classify → autonomous investigate — with artifacts and a guardrail.',
    steps: ['Agent (completion + autonomous)', 'Functional', 'ModelOp', 'Response'],
  },
  {
    id: 'content-moderation',
    dir: 'content-moderation-pipeline',
    title: 'Content Moderation',
    difficulty: 'Medium',
    blurb: 'Classify → region-aware routing → group-gated human review (no self-approval).',
    steps: ['Agent', 'Router', 'APICall', 'HumanInTheLoop', 'Response'],
  },
  {
    id: 'mcp-research',
    dir: 'mcp-research-agent',
    title: 'MCP Research Agent',
    difficulty: 'Medium–Complex',
    blurb: 'Autonomous agent driving MCP tools to a cited research brief, on a token budget.',
    steps: ['Agent (autonomous)', 'MCP', 'Functional', 'Response'],
  },
  {
    id: 'kyc-onboarding',
    dir: 'kyc-onboarding',
    title: 'KYC Onboarding',
    difficulty: 'Complex',
    blurb: 'Supervised investigation, compliance approval gate, PII masking, versioned schemas.',
    steps: ['Agent (supervisor)', 'APICall', 'Router', 'HumanInTheLoop', 'Response'],
  },
]

export const EXAMPLE_BY_ID = Object.fromEntries(EXAMPLES.map((e) => [e.id, e]))
