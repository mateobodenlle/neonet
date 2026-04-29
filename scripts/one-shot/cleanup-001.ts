/**
 * One-off manual cleanup confirmed by the user on 2026-04-29.
 *
 * Operations:
 *   1. Merge Pedro Rodríguez (phone) into Pedro Rodríguez García (LinkedIn).
 *   2. Merge Javier Outeiriño INFO (phone) into Javier Outeiriño Cortés (LinkedIn).
 *   3. Merge Alejandro Amoedo Peleteiro (phone) into Alejandro Amoedo Fontoira
 *      (LinkedIn) — "Peleteiro" is the school name, not a surname; tag the
 *      merged row with `colegio-peleteiro`.
 *   4. Rename PICAPORTE to Pablo Corbelle Fungueiriño (same phone as the
 *      vCard alias "Tito Corbi Drako KunGGGG"); aliases = both originals;
 *      tag `colegio-peleteiro`.
 *   5. Add alias "Propietario Piso Rosalía De Castro 47" to Chema Casero
 *      Pisopa (same phone after normalization).
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
  aliases: string[];
  handles: Record<string, string> | null;
  tags: string[];
  company: string | null;
  role: string | null;
  sector: string | null;
  seniority: string | null;
  location: string | null;
  category: string;
  temperature: string;
  next_step: string | null;
  interests: string[];
  affinity: number | null;
  trust: number | null;
}

async function fetchById(id: string): Promise<Row> {
  const { data, error } = await db.from("people").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`fetch ${id}: ${error?.message ?? "not found"}`);
  return data as Row;
}

function unique<T>(xs: (T | null | undefined)[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (x == null) continue;
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

async function mergeInto(keepId: string, dropId: string, opts: { addTags?: string[] } = {}) {
  const keep = await fetchById(keepId);
  const drop = await fetchById(dropId);

  const handles = { ...(drop.handles ?? {}), ...(keep.handles ?? {}) }; // keep wins on conflict
  const tags = unique([...(keep.tags ?? []), ...(drop.tags ?? []), ...(opts.addTags ?? [])]);
  const aliases = unique([
    ...(keep.aliases ?? []),
    ...(drop.aliases ?? []),
    drop.full_name !== keep.full_name ? drop.full_name : null,
  ]);

  const update = {
    handles,
    tags,
    aliases,
    company: keep.company ?? drop.company,
    role: keep.role ?? drop.role,
    sector: keep.sector ?? drop.sector,
    seniority: keep.seniority ?? drop.seniority,
    location: keep.location ?? drop.location,
    next_step: keep.next_step ?? drop.next_step,
    interests: unique([...(keep.interests ?? []), ...(drop.interests ?? [])]),
    affinity: keep.affinity ?? drop.affinity,
    trust: keep.trust ?? drop.trust,
  };

  console.log(`\nMERGE ${drop.full_name} (#${dropId.slice(0, 8)}) → ${keep.full_name} (#${keepId.slice(0, 8)})`);
  console.log(`  handles: ${JSON.stringify(update.handles)}`);
  console.log(`  tags: ${update.tags.join(", ")}`);
  console.log(`  aliases: ${update.aliases.join(", ") || "(none)"}`);

  if (!COMMIT) return;
  const { error: e1 } = await db.from("people").update(update).eq("id", keepId);
  if (e1) throw e1;
  const { error: e2 } = await db.from("people").delete().eq("id", dropId);
  if (e2) throw e2;
  console.log("  ✓ merged");
}

async function rename(id: string, newName: string, opts: { addAliases?: string[]; addTags?: string[] } = {}) {
  const row = await fetchById(id);
  const aliases = unique([
    ...(row.aliases ?? []),
    ...(opts.addAliases ?? []),
    row.full_name !== newName ? row.full_name : null,
  ]);
  const tags = unique([...(row.tags ?? []), ...(opts.addTags ?? [])]);

  console.log(`\nRENAME ${row.full_name} (#${id.slice(0, 8)}) → ${newName}`);
  console.log(`  aliases: ${aliases.join(", ") || "(none)"}`);
  console.log(`  tags: ${tags.join(", ")}`);

  if (!COMMIT) return;
  const { error } = await db.from("people").update({ full_name: newName, aliases, tags }).eq("id", id);
  if (error) throw error;
  console.log("  ✓ renamed");
}

async function addAlias(id: string, alias: string) {
  const row = await fetchById(id);
  if ((row.aliases ?? []).includes(alias)) {
    console.log(`\n${row.full_name}: alias "${alias}" already present, skipping`);
    return;
  }
  const aliases = [...(row.aliases ?? []), alias];
  console.log(`\nADD ALIAS to ${row.full_name} (#${id.slice(0, 8)}): "${alias}"`);
  if (!COMMIT) return;
  const { error } = await db.from("people").update({ aliases }).eq("id", id);
  if (error) throw error;
  console.log("  ✓ added");
}

async function main() {
  console.log(COMMIT ? "*** COMMIT MODE ***" : "*** dry run (use --commit to apply) ***");

  // 1. Pedro Rodríguez
  await mergeInto(
    "aa6f993f-d0c4-4911-826e-ea299fa1fe2b", // keep: Pedro Rodríguez García (LinkedIn)
    "a3f80e7f-a1a4-4127-a09a-2c9840173f99"  // drop: Pedro Rodríguez (phone)
  );

  // 2. Javier Outeiriño
  await mergeInto(
    "8a9bf355-c075-499c-a331-23d509515b00", // keep: Javier Outeiriño Cortés (LinkedIn)
    "be3016cd-2011-46c8-9122-363a62fba9fc"  // drop: Javier Outeiriño INFO (phone, no handles)
  );

  // 3. Alejandro Amoedo
  await mergeInto(
    "dd5abc3f-0b95-429a-9641-e1edfa6385c0", // keep: Alejandro Amoedo Fontoira (LinkedIn)
    "942534b6-b530-416c-957b-3ac50dbd1e9f", // drop: Alejandro Amoedo Peleteiro (phone)
    { addTags: ["colegio-peleteiro"] }
  );

  // 4. PICAPORTE → Pablo Corbelle Fungueiriño
  await rename(
    "00d64a3c-abec-4db4-bed5-ae432199282b",
    "Pablo Corbelle Fungueiriño",
    { addAliases: ["Tito Corbi Drako KunGGGG"], addTags: ["colegio-peleteiro"] }
  );

  // 5. Chema Casero Pisopa: add alias for the address-based label
  await addAlias("a529e07c-2bf6-48a1-8828-cdf937a88a7c", "Propietario Piso Rosalía De Castro 47");

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
