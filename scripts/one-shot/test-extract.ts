/**
 * Smoke test for the NL extraction. Goes around the server-only boundary by
 * calling OpenAI directly with the same prompt + schema the server action uses.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { EXTRACTION_SCHEMA, compactDirectory, systemPrompt, type DirectoryRow } from "../../lib/nl-prompt";

const note = process.argv.slice(2).join(" ").trim() ||
  "Hoy quedé con Pablo Corbelle a tomar un café. Me contó que está liado con un proyecto de logística para un cliente nuevo y le prometí mandarle el deck de OSIX el lunes. También me cruzo con Lucía en la cafetería y me presentó a su nuevo CTO.";

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("people")
    .select("id, full_name, aliases, company, role, tags")
    .eq("archived", false);
  if (error) throw error;
  const directory = (data ?? []) as DirectoryRow[];
  console.log(`Directory: ${directory.length} people`);
  console.log(`Today:     ${today}`);
  console.log(`Note:      ${note}\n`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const t0 = Date.now();
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o",
    temperature: 0.1,
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA as never },
    messages: [
      { role: "system", content: systemPrompt(today, compactDirectory(directory)) },
      { role: "user", content: note },
    ],
  });
  const ms = Date.now() - t0;
  console.log(`OpenAI latency: ${ms} ms\n`);
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response");
  console.log(JSON.stringify(JSON.parse(raw), null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
