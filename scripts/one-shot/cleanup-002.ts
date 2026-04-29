/**
 * One-off cleanup #2 — confirmed by the user on 2026-04-29.
 *
 * Operation A — Olimpiada Economía contacts:
 *   - Find rows whose full_name starts with "Olimpiada Economía" / "Olimpiada Economia".
 *   - Rename: strip that prefix, leave only the rest (e.g. "Olimpiada Economía Abril" → "Abril").
 *   - Tag: add `olimpiada-economia`.
 *   - Save the original full_name as an alias.
 *
 * Operation B — Peleteiro contacts:
 *   - Find rows where "Peleteiro" appears in full_name or any alias.
 *   - Add tag `colegio-peleteiro` (idempotent).
 *   - Note: per user, "05/04/03..." numeric tokens do NOT mean promotion year, so
 *     don't try to be clever. Some of these contacts are teachers, not students;
 *     the tag is intentionally broad. Refinement comes later, with AI assistance.
 *   - Names are NOT renamed in this pass — only the tag is added. The user
 *     will revisit naming later.
 *
 * Refuses to write without --commit.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const COMMIT = process.argv.includes("--commit");

interface Row {
  id: string;
  full_name: string;
  aliases: string[] | null;
  tags: string[] | null;
}

/**
 * Strips "Olimpiada Economía" / "Olimpiada Economia" / bare "Olimpiada"
 * appearing as either a leading or trailing tag in the contact name. Returns
 * the cleaned name and whether the pattern matched. Patterns seen in the
 * Galaxy vCard:
 *   "Olimpiada Economía Alba"        → "Alba"
 *   "Pol Cataluña, Olimpiada Economía" → "Pol Cataluña"
 *   "Yasin Olimpiada"                → "Yasin"
 */
function cleanOlimpiada(name: string): { newName: string; matched: boolean } {
  // Leading: "Olimpiada Econom[ií]a X" → "X"
  let m = name.match(/^Olimpiada\s+Econom[ií]a\b[\s,]*(.*)$/i);
  if (m && m[1]?.trim()) return { newName: m[1].trim(), matched: true };

  // Trailing with comma: "X, Olimpiada Econom[ií]a" → "X"
  m = name.match(/^(.+?)\s*,\s*Olimpiada\s+Econom[ií]a\s*$/i);
  if (m) return { newName: m[1].trim(), matched: true };

  // Trailing without comma: "X Olimpiada Econom[ií]a" → "X"
  m = name.match(/^(.+?)\s+Olimpiada\s+Econom[ií]a\s*$/i);
  if (m) return { newName: m[1].trim(), matched: true };

  // Bare "Olimpiada" trailing (the user said this also signals the event).
  m = name.match(/^(.+?)\s+Olimpiada\s*$/i);
  if (m) return { newName: m[1].trim(), matched: true };

  return { newName: name, matched: false };
}

async function main() {
  console.log(COMMIT ? "*** COMMIT MODE ***" : "*** dry run (use --commit to apply) ***");

  const { data: people, error } = await db.from("people").select("id, full_name, aliases, tags");
  if (error) throw error;
  const rows = (people ?? []) as Row[];
  console.log(`Loaded ${rows.length} people.`);

  // ----- A. Olimpiada Economía -----
  const olimpiadaTargets = rows
    .map((r) => ({ row: r, ...cleanOlimpiada(r.full_name) }))
    .filter((x) => x.matched && x.newName);
  console.log(`\n[A] Olimpiada Economía: ${olimpiadaTargets.length} matches`);
  for (const { row, newName } of olimpiadaTargets) {
    const aliases = uniqueStrings([...(row.aliases ?? []), row.full_name]);
    const tags = uniqueStrings([...(row.tags ?? []), "olimpiada-economia"]);
    console.log(`  · ${row.full_name} → ${newName}   tags+olimpiada-economia`);
    if (!COMMIT) continue;
    const { error } = await db
      .from("people")
      .update({ full_name: newName, aliases, tags })
      .eq("id", row.id);
    if (error) throw error;
  }

  // ----- B. Peleteiro tag -----
  const peleteiroTargets = rows.filter((r) => {
    const inName = /peleteiro/i.test(r.full_name);
    const inAlias = (r.aliases ?? []).some((a) => /peleteiro/i.test(a));
    const alreadyTagged = (r.tags ?? []).includes("colegio-peleteiro");
    return (inName || inAlias) && !alreadyTagged;
  });
  console.log(`\n[B] Peleteiro tag (missing): ${peleteiroTargets.length} matches`);
  for (const r of peleteiroTargets) {
    const tags = uniqueStrings([...(r.tags ?? []), "colegio-peleteiro"]);
    console.log(`  · ${r.full_name}  (#${r.id.slice(0, 8)}) tags+colegio-peleteiro`);
    if (!COMMIT) continue;
    const { error } = await db.from("people").update({ tags }).eq("id", r.id);
    if (error) throw error;
  }

  console.log(COMMIT ? "\n✓ committed" : "\nDry run, no writes.");
}

function uniqueStrings(xs: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!x) continue;
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
