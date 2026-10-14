---
name: content-moderation
owner: trust-and-safety
workflow: moderate_content
---
# Intent
User-generated content is checked before it is published. A model classifies it as safe, borderline
or a violation; regional policy is applied in code; borderline content goes to a moderator; every
decision is recorded with an audit action, and automatic removals notify the trust-and-safety channel.

# Actors
Authors (via the platform), a classification model, moderators, the trust-and-safety channel.

# Data
- **ContentItem** (existing) — `id` (uuid), `author_id` (string; required), `region` (enum: us | eu | in; required),
  `content` (text; required), `category` (enum: safe | borderline | violation),
  `status` (enum: approved | removed | pending_review), `created_at` (timestamptz)
- **ModerationAction** (existing) — `id` (uuid), `item_id` (uuid; required), `action` (enum: auto_approved |
  auto_removed | human_approved | human_removed), `actor` (string), `reason` (text),
  `created_at` (timestamptz)

# Flows

## Flow: moderate_content
Trigger: POST /api/moderate · group moderation:submit
Input: `author_id` (str), `region` (enum[us, eu, in]), `content` (str)
Ends: default 201 · failed 502
   - failed: no example — only a database or code error reaches it; a model failure goes to review

1. `classify` — llm default · in `region`, `content` · out `verdict` (enum[safe, borderline, violation]), `rationale` (str), `confidence` (float) · budget 400 tok, 30s, retry 2
   - parse_error, timeout, budget_exceeded, error → `review`
2. `apply_policy` — code · effect read · in `region`, `verdict`, `rationale` · out `category` (enum[safe, borderline, violation]), `reason` (str)
   - safe, violation → `record`
   - borderline → `review`
3. `review` — human group moderators · in `author_id`, `region`, `content` · out `decision` (enum[approve, remove]), `note` (str?)
   - approve, remove → `record`
4. `record` — code · in `author_id`, `region`, `content`, `category`?, `reason`?, `decision`?, `note`? · out `item_id` (uuid), `status` (enum[approved, removed]), `recorded_category` (enum[safe, borderline, violation]), `action` (str)
   - notify → `notify`
   - recorded → END
5. `notify` — tool http POST moderation_webhook · in `author_id`, `region`, `recorded_category`, `reason`?, `item_id`
   - default → END
   - error → END

# Policies
- Regional policy is deterministic code, never the model's call.
- A model failure never publishes content: it goes to a moderator.
- Every decision has an audit action naming who decided (system or moderator).

# Acceptance
```tuvl-example
name: safe content is approved automatically
input: { author_id: u1, region: us, content: "Great recipe, thanks for sharing!" }
mocks:
  classify: { outputs: { verdict: safe, rationale: friendly comment, confidence: 0.97 } }
expect:
  end: default
  path: [classify, apply_policy, record]
  output: { status: 201, body: { status: approved, category: safe, action: auto_approved } }
```
```tuvl-example
name: a violation is removed and the channel is notified
input: { author_id: u2, region: us, content: "buy followers now!!! spam link" }
mocks:
  classify: { outputs: { verdict: violation, rationale: spam, confidence: 0.91 } }
  notify: { outputs: {} }
expect:
  end: default
  path: [classify, apply_policy, record, notify]
  output: { status: 201, body: { status: removed, action: auto_removed } }
```
```tuvl-example
name: borderline content in the EU is treated as a violation
input: { author_id: u3, region: eu, content: "edgy joke" }
mocks:
  classify: { outputs: { verdict: borderline, rationale: possibly offensive, confidence: 0.6 } }
  notify: { outputs: {} }
expect:
  end: default
  path_includes: [apply_policy, notify]
  output: { body: { category: violation, status: removed } }
```
```tuvl-example
name: borderline content elsewhere waits for a moderator
input: { author_id: u4, region: in, content: "edgy joke" }
mocks:
  classify: { outputs: { verdict: borderline, rationale: possibly offensive, confidence: 0.6 } }
expect:
  end_or_wait: human
  path: [classify, apply_policy]          # the run waits at review
```
```tuvl-example
name: a moderator approves borderline content
input: { author_id: u5, region: in, content: "edgy joke" }
mocks:
  classify: { outputs: { verdict: borderline, rationale: possibly offensive, confidence: 0.6 } }
  review: { signal: approve, outputs: { decision: approve, note: "fine in context" } }
expect:
  end: default
  path: [classify, apply_policy, review, record]
  output: { status: 201, body: { status: approved, action: human_approved } }
```
