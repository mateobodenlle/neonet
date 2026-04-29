/**
 * Imports a vCard (.vcf) export into the people table.
 *
 * Usage:
 *   npm run import:vcard -- data/contacts.vcf            # dry run
 *   npm run import:vcard -- data/contacts.vcf --commit   # actually insert
 *
 * Defaults for imported people: category="otro", temperature="frio",
 * tags=["from-phone"]. You can edit them in the app afterwards.
 */

import { readFileSync } from "node:fs";
import { parseVcardFile } from "./lib/vcard";
import { fetchExistingPeople, classify, printReport, commit } from "./lib/import-runner";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!file) {
    console.error("Usage: npm run import:vcard -- <path-to.vcf> [--commit]");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const { people: candidates, skipped } = parseVcardFile(raw);
  console.log(`Parsed ${candidates.length} cards from ${file}${skipped ? ` (${skipped} skipped, no name)` : ""}.`);

  const existing = await fetchExistingPeople();
  console.log(`Existing in DB: ${existing.length} people.`);

  const result = classify(candidates, existing);
  printReport("vCard import", result);

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to insert the new rows.");
    return;
  }

  if (result.newRows.length === 0) {
    console.log("\nNothing new to commit.");
    return;
  }

  console.log(`\nCommitting ${result.newRows.length} new rows ...`);
  await commit(result.newRows);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
