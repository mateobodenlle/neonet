/**
 * Imports messages.csv and Comments.csv from a LinkedIn data export into
 * the raw tables (linkedin_messages_raw, linkedin_comments_raw). These
 * back the on-demand "Generate insight" feature per contact.
 *
 * Idempotent: ON CONFLICT DO NOTHING via the unique tuples. Re-runnable
 * against the same or a newer export.
 *
 * Usage:
 *   npm run import:linkedin-content -- <export-dir>
 *   npm run import:linkedin-content -- <export-dir> --commit
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

interface MessageRow {
  "CONVERSATION ID"?: string;
  "CONVERSATION TITLE"?: string;
  FROM?: string;
  "SENDER PROFILE URL"?: string;
  TO?: string;
  "RECIPIENT PROFILE URLS"?: string;
  DATE?: string;
  SUBJECT?: string;
  CONTENT?: string;
  FOLDER?: string;
}

interface CommentRow {
  Date?: string;
  Link?: string;
  Message?: string;
}

function extractHandle(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const parts = path.split("/");
    const inIdx = parts.indexOf("in");
    const raw = inIdx >= 0 && parts[inIdx + 1] ? parts[inIdx + 1] : parts[0];
    return raw ? decodeURIComponent(raw).toLowerCase() : null;
  } catch {
    return null;
  }
}

function parseDateUtc(s: string | undefined): string | null {
  if (!s) return null;
  // Messages.csv uses "YYYY-MM-DD HH:MM:SS UTC"
  // Comments.csv uses "YYYY-MM-DD HH:MM:SS"
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}Z`;
}

function nonEmpty(s: string | undefined | null): string | null {
  const v = (s ?? "").trim();
  return v ? v : null;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dir = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!dir) {
    console.error("Usage: import:linkedin-content -- <export-dir> [--commit]");
    process.exit(1);
  }
  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const sourceTag = basename(dir.replace(/\/+$/, ""));

  const messagesPath = join(dir, "messages.csv");
  const commentsPath = join(dir, "Comments.csv");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Messages -----------------------------------------------------
  let messageRows: Array<Record<string, unknown>> = [];
  if (existsSync(messagesPath)) {
    const raw = readFileSync(messagesPath, "utf8");
    const rows: MessageRow[] = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    });

    let skippedNoDate = 0;
    let skippedNoFrom = 0;
    for (const r of rows) {
      const date = parseDateUtc(r.DATE);
      const fromName = nonEmpty(r.FROM);
      if (!date) {
        skippedNoDate++;
        continue;
      }
      if (!fromName) {
        skippedNoFrom++;
        continue;
      }
      const senderUrl = nonEmpty(r["SENDER PROFILE URL"]);
      const senderHandle = extractHandle(senderUrl ?? undefined);
      const recipientUrls = nonEmpty(r["RECIPIENT PROFILE URLS"]);
      const recipientHandles = (recipientUrls ?? "")
        .split(/\s+/)
        .map((u) => extractHandle(u))
        .filter((h): h is string => !!h);

      messageRows.push({
        conversation_id: nonEmpty(r["CONVERSATION ID"]),
        conversation_title: nonEmpty(r["CONVERSATION TITLE"]),
        from_name: fromName,
        sender_profile_url: senderUrl,
        sender_handle: senderHandle,
        to_names: nonEmpty(r.TO),
        recipient_profile_urls: recipientUrls,
        recipient_handles: recipientHandles,
        date,
        subject: nonEmpty(r.SUBJECT),
        content: nonEmpty(r.CONTENT),
        folder: nonEmpty(r.FOLDER),
        source_export: sourceTag,
      });
    }
    console.log(`messages: parsed ${rows.length}, ready ${messageRows.length}, skipped ${skippedNoDate}/no-date ${skippedNoFrom}/no-from`);
  } else {
    console.log("messages.csv not found, skipping");
  }

  // Comments -----------------------------------------------------
  let commentRows: Array<Record<string, unknown>> = [];
  if (existsSync(commentsPath)) {
    const raw = readFileSync(commentsPath, "utf8");
    const rows: CommentRow[] = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    });
    for (const r of rows) {
      const date = parseDateUtc(r.Date);
      const message = nonEmpty(r.Message);
      if (!date || !message) continue;
      commentRows.push({
        date,
        link: nonEmpty(r.Link),
        message,
        source_export: sourceTag,
      });
    }
    console.log(`comments: parsed ${rows.length}, ready ${commentRows.length}`);
  } else {
    console.log("Comments.csv not found, skipping");
  }

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to upsert.");
    return;
  }

  // Upsert in batches.
  const BATCH = 200;

  if (messageRows.length) {
    let inserted = 0;
    for (let i = 0; i < messageRows.length; i += BATCH) {
      const slice = messageRows.slice(i, i + BATCH);
      const { data, error } = await db
        .from("linkedin_messages_raw")
        .upsert(slice, {
          onConflict: "conversation_id,date,from_name",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      inserted += data?.length ?? 0;
      console.log(`  messages upserted ${Math.min(i + BATCH, messageRows.length)} / ${messageRows.length}  (${data?.length ?? 0} new)`);
    }
    console.log(`✓ ${inserted} new messages`);
  }

  if (commentRows.length) {
    let inserted = 0;
    for (let i = 0; i < commentRows.length; i += BATCH) {
      const slice = commentRows.slice(i, i + BATCH);
      const { data, error } = await db
        .from("linkedin_comments_raw")
        .upsert(slice, {
          onConflict: "date,link,message",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      inserted += data?.length ?? 0;
      console.log(`  comments upserted ${Math.min(i + BATCH, commentRows.length)} / ${commentRows.length}  (${data?.length ?? 0} new)`);
    }
    console.log(`✓ ${inserted} new comments`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
