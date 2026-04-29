import { randomUUID } from "node:crypto";
import type { Person } from "../../lib/types";

/**
 * Lightweight vCard 3.0/4.0 parser. Handles line folding (lines starting with
 * space/tab are continuations of the previous line) and the few field types
 * we care about: FN, N, ORG, TITLE, TEL, EMAIL, URL, X-SOCIALPROFILE.
 */

interface RawCard {
  fn?: string;
  n?: string;
  org?: string;
  title?: string;
  emails: string[];
  phones: string[];
  urls: string[];
  socials: Array<{ type?: string; value: string }>;
  note?: string;
}

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      out[out.length - 1] = (out[out.length - 1] ?? "") + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function decode(value: string, params: string): string {
  let v = value;
  if (/ENCODING=QUOTED-PRINTABLE/i.test(params)) {
    v = v.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (/CHARSET=UTF-8/i.test(params)) {
    try {
      v = Buffer.from(v, "binary").toString("utf-8");
    } catch {
      // fall through
    }
  }
  return v;
}

function splitCards(text: string): string[][] {
  const lines = unfold(text);
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) current = [];
    else if (/^END:VCARD/i.test(line)) {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return cards;
}

function parseCard(lines: string[]): RawCard {
  const card: RawCard = { emails: [], phones: [], urls: [], socials: [] };
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = decode(line.slice(colon + 1), head).trim();
    if (!value) continue;
    const semi = head.indexOf(";");
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? "" : head.slice(semi + 1);

    switch (name) {
      case "FN":
        card.fn = value;
        break;
      case "N":
        card.n = value
          .split(";")
          .filter(Boolean)
          .reverse()
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        break;
      case "ORG":
        card.org = value.split(";")[0]?.trim() ?? value;
        break;
      case "TITLE":
        card.title = value;
        break;
      case "EMAIL":
        card.emails.push(value);
        break;
      case "TEL":
        card.phones.push(value);
        break;
      case "URL":
        card.urls.push(value);
        break;
      case "X-SOCIALPROFILE":
      case "X-ABLABEL":
        card.socials.push({ type: params, value });
        break;
      case "NOTE":
        card.note = value;
        break;
      default:
        // ignore PHOTO, BDAY, ADR, etc. for now
        break;
    }
  }
  return card;
}

function pickHandle(socials: Array<{ type?: string; value: string }>, kind: string): string | undefined {
  for (const s of socials) {
    const t = (s.type ?? "").toLowerCase();
    if (t.includes(kind) || s.value.toLowerCase().includes(kind)) return s.value;
  }
  return undefined;
}

function extractFromUrl(url: string, host: string): string | undefined {
  try {
    const u = new URL(url);
    if (!u.hostname.includes(host)) return undefined;
    return u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
  } catch {
    return undefined;
  }
}

function toPerson(c: RawCard): Person | null {
  const fullName = (c.fn ?? c.n ?? "").trim();
  if (!fullName) return null;

  const handles: Person["handles"] = {};
  if (c.emails[0]) handles.email = c.emails[0];
  if (c.phones[0]) handles.phone = c.phones[0];

  const linkedinUrl = c.urls.find((u) => /linkedin\.com/i.test(u));
  if (linkedinUrl) {
    handles.linkedin = extractFromUrl(linkedinUrl, "linkedin.com") ?? linkedinUrl;
  } else {
    const fromSocial = pickHandle(c.socials, "linkedin");
    if (fromSocial) handles.linkedin = fromSocial;
  }
  const igUrl = c.urls.find((u) => /instagram\.com/i.test(u));
  if (igUrl) handles.instagram = extractFromUrl(igUrl, "instagram.com") ?? igUrl;
  else {
    const fromSocial = pickHandle(c.socials, "instagram");
    if (fromSocial) handles.instagram = fromSocial;
  }
  const otherUrl = c.urls.find((u) => !/linkedin\.com|instagram\.com/i.test(u));
  if (otherUrl) handles.website = otherUrl;

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    fullName,
    aliases: [],
    role: c.title,
    company: c.org,
    category: "otro",
    temperature: "frio",
    tags: ["from-phone"],
    handles: Object.keys(handles).length ? handles : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseVcardFile(text: string): { people: Person[]; skipped: number } {
  const cards = splitCards(text);
  const people: Person[] = [];
  let skipped = 0;
  for (const lines of cards) {
    const raw = parseCard(lines);
    const p = toPerson(raw);
    if (p) people.push(p);
    else skipped++;
  }
  return { people, skipped };
}
