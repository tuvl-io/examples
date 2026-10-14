/**
 * @tuvl/client demo for knowledge-base-qa: ingest two documents, then ask a
 * question and print the run's events as they happen.
 *
 *   pnpm add @tuvl/client@^2 tsx
 *   TUVL_URL=http://localhost:8885 pnpm tsx client/ask.ts
 */
import { TuvlClient } from "@tuvl/client";

const client = new TuvlClient({ baseUrl: process.env.TUVL_URL ?? "http://localhost:8885", token: process.env.TUVL_TOKEN });

const docs = [
  {
    title: "Travel & Expense Policy",
    content:
      "The daily meal allowance while travelling is $75 per day. Hotels are capped at $250 per night. Submit expenses within 30 days.",
    tags: ["finance", "policy"],
  },
  {
    title: "Security Basics",
    content:
      "Passwords must be at least 16 characters and stored in the company password manager. MFA is mandatory on all accounts.",
    tags: ["security", "it"],
  },
];

async function main(): Promise<void> {
  for (const doc of docs) console.log("ingested:", await client.execute("ingest_doc", doc));

  const question = "What is the daily meal allowance while travelling?";
  const run = await client.start("ask_kb", { question });
  for await (const event of run.events()) {
    console.log(`[${event.seq}] ${event.type}${event.agent_id ? ` ${event.agent_id}` : ""}`);
  }
  console.log("\nQ:", question);
  console.log("A:", JSON.stringify(await run.wait(), null, 2));
}

main().catch((err: unknown) => {
  console.error("client error:", err);
  process.exit(1);
});

