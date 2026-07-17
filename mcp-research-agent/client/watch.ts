/**
 * client/watch.ts — live-progress demo for the MCP research agent.
 *
 * Streams the `research` workflow and prints the AutonomousAgent's loop as it
 * runs: iteration frames, tool calls, and the terminal signal. Progress frames
 * are decoded with the SDK's `agentProgress()` helper, which returns `null` for
 * any non-progress frame.
 *
 * Run:
 *   npm i @tuvl/client@2026.3.1 tsx
 *   TUVL_URL=http://localhost:8000 npx tsx client/watch.ts "How does HTTP caching work?"
 */
import { TuvlClient, agentProgress } from "@tuvl/client";

const BASE_URL = process.env.TUVL_URL ?? "http://localhost:8000";

// The four reserved abnormal exits, mapped to human-readable notes.
const RESERVED_EXITS: Record<string, string> = {
  max_iterations: "hit the iteration cap before answering",
  budget_exceeded: "ran out of its token budget",
  error: "failed (LLM/tool error)",
  aborted: "was aborted by an operator or supervisor",
};

async function main(): Promise<void> {
  const question =
    process.argv.slice(2).join(" ") ||
    "What is the CAP theorem and what are its three properties?";

  const client = new TuvlClient({ baseUrl: BASE_URL });

  console.log(`▶ research: ${question}\n`);

  const result = await client.execute("research", {
    payload: { question },
    onProgress: (ev: unknown) => {
      const p = agentProgress(ev);
      if (p === null) return; // not an agent-progress frame — ignore

      switch (p.type) {
        case "iteration":
          console.log(
            `· iteration ${p.iteration}  (tokens_used=${p.tokens_used}, tool_calls=${p.tool_calls})`,
          );
          break;
        case "tool_call":
          // e.g. "  → fetch_page: <url>"  /  "  → summarize_source"
          console.log(`  → ${p.tool}${p.signal ? ` [${p.signal}]` : ""}`);
          break;
        case "outcome": {
          const note = RESERVED_EXITS[p.signal];
          console.log(
            note
              ? `■ terminal signal: ${p.signal} — the agent ${note}`
              : `■ terminal signal: ${p.signal}`,
          );
          break;
        }
      }
    },
  });

  console.log("\n── final response ──");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("watch.ts failed:", err);
  process.exit(1);
});
