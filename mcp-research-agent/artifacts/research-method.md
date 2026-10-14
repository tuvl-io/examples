---
name: research-method
type: steering
version: 2
description: Operating method for the bounded research loop — fetch, summarize, stop at two corroborating sources.
---
# Research method

Answer the research question from fetched web sources only.

1. **Fetch** one relevant URL with the `fetch` tool (pass `url`; a
   `max_length` around 5000 keeps pages short).
2. **Summarize** what came back with `summarize_source` (pass the `url` and
   the fetched `content`).
3. Stop as soon as two sources corroborate an answer — do not keep browsing.

Finish with `finish`: outcome `answered` with `research` holding the question,
the answer and the summarized sources; `insufficient_sources` when the web did
not give a reliable answer. Never invent a source or a quote.
