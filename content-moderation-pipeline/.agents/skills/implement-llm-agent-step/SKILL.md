# implement-llm-agent-step
description: Use an LLM inside a workflow for text generation, extraction, or routing.
options:
  argument-hint: "[agent-model]"

### Body

1. Add a step of `kind: Agent` with `mode: completion` (a single LLM call —
   every `Agent` step must declare `mode: completion` or `mode: autonomous`).
2. Define the `agent:` block:
   ```yaml
   - id: classify_text
     kind: Agent
     mode: completion
     agent:
       model: default # References llms/default.yaml or an inline LiteLLM string
       system: "You are a classifier."
       prompt: "Classify: {{ input_text }}"
       outcome:
         format: json
         map:
           category: text_category
     routes:
       default: next_step
       error: END
   ```
3. To route on the model's verdict, declare a closed signal set with
   `outcome.enum: [proceed, hold, reject]` and instruct the prompt to return an
   `"outcome"` field holding one of those values (the engine also appends the
   enum contract clause). Every enum value must be mapped in `routes:`.
4. To inject external context (like DataSearch RAG results), utilize the `context_injection: [context_key]` array.
