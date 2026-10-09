/**
 * client/watch.ts — follow the research loop live: each model turn, tool call
 * and the outcome, from the run's journal events.
 *
 *   npm i @tuvl/client@^2 tsx
 *   TUVL_URL=http://localhost:8885 npx tsx client/watch.ts "How does HTTP caching work?"
 */
import { TuvlClient, type RunEvent } from "@tuvl/client";

function describe(event: RunEvent): string | null {
  const p = event.payload;
  switch (event.type) {
    case "agent_started":
      return `▶ ${event.agent_id}`;
    case "llm_turn":
      return `· turn ${String(p.iteration ?? "")} (${String(p.total_tokens ?? 0)} tok)`;
    case "tool_call":
      return `  → ${String(p.tool ?? "")}`;
    case "signal":
    case "agent_completed":
      return p.signal ? `■ ${event.agent_id}: ${String(p.signal)}` : null;
    case "run_completed":
      return `✓ ended at ${String(p.end ?? "")}`;
    case "run_failed":
      return `✗ failed: ${JSON.stringify(p)}`;
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(" ") || "What is the CAP theorem and what are its three properties?";
  const client = new TuvlClient({ baseUrl: process.env.TUVL_URL ?? "http://localhost:8885", token: process.env.TUVL_TOKEN });

  console.log(`research: ${question}\n`);
  const run = await client.start("research", { question });
  for await (const event of run.events()) {
    const line = describe(event);
    if (line) console.log(line);
  }
  console.log("\n" + JSON.stringify(await run.wait(), null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
