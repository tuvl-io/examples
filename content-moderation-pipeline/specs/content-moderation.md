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
ContentItem (existing): id, author_id, region (us, eu, in), content, category, status, created_at.
ModerationAction (existing): id, item_id, action, actor, reason, created_at.

# Flows
1. The platform posts the author, region and content.
2. A model classifies it with a rationale and a confidence.
3. Code applies regional policy: in the EU, borderline content counts as a violation.
4. Safe content is approved and violations are removed automatically.
5. Borderline content, and anything the model fails on, waits for a moderator to approve or remove it.
6. The item and an audit action are stored together; the response is 201 with the item's status.
7. Automatic removals post a notification to the trust-and-safety channel.

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
  wait: human
  path: [classify, apply_policy]          # the run waits at review
```
