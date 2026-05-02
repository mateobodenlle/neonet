/**
 * Imports the "about you" CSVs from a LinkedIn data export into me_profile.
 * Pass the directory containing the unzipped export (the one with
 * Profile.csv, Positions.csv, etc.) — the script reads every file it knows
 * about and ignores the rest.
 *
 * Re-running overwrites the single row. Field-level data is destructive on
 * re-import (no merge), since LinkedIn sends a complete snapshot each time.
 *
 * Usage:
 *   npm run import:linkedin-self -- /path/to/unzipped/export
 *   npm run import:linkedin-self -- /path/to/unzipped/export --commit
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

function readCsv(dir: string, name: string): Record<string, string>[] {
  const path = join(dir, name);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  }) as Record<string, string>[];
}

// LinkedIn dates: "Sep 2024", "Jun 2026", or "May 2022". Convert to "YYYY-MM"
// (or null). Day-resolution dates ("7/28/23, 2:24 AM") get a separate parser.
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
function parseMonthYear(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[2]}-${mm}`;
}

// "7/28/23, 2:24 AM" → ISO timestamptz
function parseUsTimestamp(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let [, mo, d, y, h, mi, ap] = m;
  let yyyy = parseInt(y, 10);
  if (yyyy < 100) yyyy += 2000;
  let hh = parseInt(h, 10);
  if (ap.toUpperCase() === "PM" && hh < 12) hh += 12;
  if (ap.toUpperCase() === "AM" && hh === 12) hh = 0;
  const iso = `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${String(hh).padStart(2, "0")}:${mi}:00Z`;
  return iso;
}

function splitListField(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(/[|,]/).map((x) => x.trim()).filter(Boolean);
}

function nonEmpty(s: string | undefined | null): string | null {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dir = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!dir) {
    console.error("Usage: npm run import:linkedin-self -- <export-dir> [--commit]");
    process.exit(1);
  }
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  // Profile.csv
  const profileRows = readCsv(dir, "Profile.csv");
  const profile = profileRows[0] ?? {};

  // Profile Summary.csv (often empty if same as Profile.summary)
  const summaryRows = readCsv(dir, "Profile Summary.csv");
  const profileSummary = summaryRows[0]?.["Profile Summary"];

  // Positions.csv
  const positions = readCsv(dir, "Positions.csv").map((r) => ({
    company: nonEmpty(r["Company Name"]),
    title: nonEmpty(r["Title"]),
    description: nonEmpty(r["Description"]),
    location: nonEmpty(r["Location"]),
    started_on: parseMonthYear(r["Started On"]),
    finished_on: parseMonthYear(r["Finished On"]),
  }));

  // Education.csv
  const education = readCsv(dir, "Education.csv").map((r) => ({
    school: nonEmpty(r["School Name"]),
    degree: nonEmpty(r["Degree Name"]),
    notes: nonEmpty(r["Notes"]),
    activities: nonEmpty(r["Activities"]),
    started_on: parseMonthYear(r["Start Date"]),
    finished_on: parseMonthYear(r["End Date"]),
  }));

  // Skills.csv
  const skills = readCsv(dir, "Skills.csv")
    .map((r) => nonEmpty(r["Name"]))
    .filter((x): x is string => !!x);

  // Honors.csv
  const honors = readCsv(dir, "Honors.csv").map((r) => ({
    title: nonEmpty(r["Title"]),
    description: nonEmpty(r["Description"]),
    issued_on: parseMonthYear(r["Issued On"]),
  }));

  // Languages.csv
  const languages = readCsv(dir, "Languages.csv").map((r) => ({
    name: nonEmpty(r["Name"]),
    proficiency: nonEmpty(r["Proficiency"]),
  }));

  // Projects.csv
  const projects = readCsv(dir, "Projects.csv").map((r) => ({
    title: nonEmpty(r["Title"]),
    description: nonEmpty(r["Description"]),
    url: nonEmpty(r["Url"]),
    started_on: parseMonthYear(r["Started On"]),
    finished_on: parseMonthYear(r["Finished On"]),
  }));

  // Courses.csv
  const courses = readCsv(dir, "Courses.csv").map((r) => ({
    name: nonEmpty(r["Name"]),
    number: nonEmpty(r["Number"]),
  }));

  // Learning.csv (LinkedIn Learning history)
  const learning = readCsv(dir, "Learning.csv").map((r) => ({
    title: nonEmpty(r["Content Title"]),
    description: nonEmpty(r["Content Description"]),
    type: nonEmpty(r["Content Type"]),
    last_watched: nonEmpty(r["Content Last Watched Date (if viewed)"]),
    completed_at: nonEmpty(r["Content Completed At (if completed)"]),
    saved: r["Content Saved"]?.toLowerCase() === "true",
  }));

  // PhoneNumbers.csv
  const phoneNumbers = readCsv(dir, "PhoneNumbers.csv")
    .map((r) => ({
      extension: nonEmpty(r["Extension"]),
      number: nonEmpty(r["Number"]),
      type: nonEmpty(r["Type"]),
    }))
    .filter((p) => p.number);

  // Email Addresses.csv
  const emails = readCsv(dir, "Email Addresses.csv")
    .map((r) => ({
      address: nonEmpty(r["Email Address"]),
      confirmed: r["Confirmed"]?.toLowerCase() === "yes",
      primary: r["Primary"]?.toLowerCase() === "yes",
      updated_at: parseUsTimestamp(r["Updated On"]),
    }))
    .filter((e) => e.address);

  // Jobs/Job Seeker Preferences.csv
  const jobsPrefRows = readCsv(dir, join("Jobs", "Job Seeker Preferences.csv"));
  const jobsPref = jobsPrefRows[0] ?? null;

  // Registration.csv
  const registration = readCsv(dir, "Registration.csv")[0] ?? null;

  const summaryFromProfile = nonEmpty(profile["Summary"]);
  const summaryFromFile = nonEmpty(profileSummary);

  const row = {
    id: "me",
    first_name: nonEmpty(profile["First Name"]),
    last_name: nonEmpty(profile["Last Name"]),
    maiden_name: nonEmpty(profile["Maiden Name"]),
    headline: nonEmpty(profile["Headline"]),
    summary: summaryFromProfile ?? summaryFromFile,
    industry: nonEmpty(profile["Industry"]),
    location: nonEmpty(profile["Geo Location"]),
    address: nonEmpty(profile["Address"]),
    zip_code: nonEmpty(profile["Zip Code"]),
    birth_date: nonEmpty(profile["Birth Date"]),
    twitter_handles: splitListField(profile["Twitter Handles"]),
    websites: splitListField(profile["Websites"]),
    instant_messengers: splitListField(profile["Instant Messengers"]),
    positions,
    education,
    skills,
    honors,
    languages,
    projects,
    courses,
    learning,
    phone_numbers: phoneNumbers,
    emails,
    jobs_preferences: jobsPref,
    registered_at: parseUsTimestamp(registration?.["Registered At"]),
    registration_ip: nonEmpty(registration?.["Registration Ip"]),
    subscription_types: splitListField(registration?.["Subscription Types"]),
    source: "linkedin",
    imported_at: new Date().toISOString(),
  };

  console.log("\n=== about-you import summary ===");
  console.log(`  name              ${row.first_name} ${row.last_name}`);
  console.log(`  headline          ${row.headline ?? "—"}`);
  console.log(`  summary           ${row.summary ? `${row.summary.length} chars` : "—"}`);
  console.log(`  positions         ${positions.length}`);
  console.log(`  education         ${education.length}`);
  console.log(`  skills            ${skills.length}`);
  console.log(`  honors            ${honors.length}`);
  console.log(`  languages         ${languages.length}`);
  console.log(`  projects          ${projects.length}`);
  console.log(`  courses           ${courses.length}`);
  console.log(`  learning          ${learning.length}`);
  console.log(`  phones            ${phoneNumbers.length}`);
  console.log(`  emails            ${emails.length}`);
  console.log(`  jobs preferences  ${jobsPref ? "yes" : "no"}`);

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to upsert into me_profile.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("me_profile").upsert(row, { onConflict: "id" });
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log("\n✓ me_profile updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
