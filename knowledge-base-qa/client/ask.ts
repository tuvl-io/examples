/**
 * @tuvl/client demo for the knowledge-base-qa project.
 *
 * Ingests two sample documents through the `ingest_doc` workflow, then asks a
 * question through `ask_kb` while streaming step events. The SDK resolves each
 * workflow's route by name (GET /workflows) and auto-selects the transport:
 * plain REST by default, SSE when an `onProgress` callback is supplied.
 *
 * Run against a live `tuvl dev` server:
 *   pnpm add @tuvl/client@2026.2.6 tsx
 *   pnpm tsx client/ask.ts
 */
import { createClient } from "@tuvl/client";

const client = createClient({
  baseUrl: process.env.TUVL_BASE_URL ?? "http://localhost:8000",
});

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

async function main() {
  // 1) Ingest the sample documents (REST — no onProgress).
  for (const payload of docs) {
    const res = await client.execute("ingest_doc", { payload });
    console.log("ingested:", res.data);
  }

  // 2) Ask a question, streaming each step event as it happens (SSE).
  const question = "What is the daily meal allowance while travelling?";
  const res = await client.execute("ask_kb", {
    payload: { question },
    onProgress: (event) => {
      console.log(`[step] ${event.step ?? event.type}`);
    },
  });

  console.log("\nQ:", question);
  console.log("A:", JSON.stringify(res.data, null, 2));
}

main().catch((err) => {
  console.error("client error:", err);
  process.exit(1);
});
