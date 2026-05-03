import "server-only";
import { supabaseAdmin } from "./supabase-admin";

interface PositionRow {
  company: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  started_on: string | null;   // "YYYY-MM"
  finished_on: string | null;  // "YYYY-MM" or null when current
}

interface EducationRow {
  school: string | null;
  degree: string | null;
  notes: string | null;
  activities: string | null;
  started_on: string | null;
  finished_on: string | null;
}

export interface MeProfileSummary {
  fullName: string;
  location: string | null;
  activePositions: PositionRow[];
  education: EducationRow[];
  linkedPersonId: string | null;
}

let cache: { value: MeProfileSummary | null; loadedAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export function invalidateMeProfileCache(): void {
  cache = null;
}

export async function getMeProfileSummary(): Promise<MeProfileSummary | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.value;

  const { data, error } = await supabaseAdmin
    .from("me_profile")
    .select("first_name, last_name, location, positions, education, linked_person_id")
    .eq("id", "me")
    .maybeSingle();
  if (error || !data) {
    cache = { value: null, loadedAt: Date.now() };
    return null;
  }

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  const positions = (data.positions ?? []) as PositionRow[];
  const activePositions = positions
    .filter((p) => p.company && !p.finished_on)
    .sort((a, b) => (b.started_on ?? "").localeCompare(a.started_on ?? ""));

  const education = ((data.education ?? []) as EducationRow[])
    .filter((e) => e.school)
    .sort((a, b) => (b.started_on ?? "").localeCompare(a.started_on ?? ""));

  const value: MeProfileSummary = {
    fullName: fullName || "el usuario",
    location: data.location ?? null,
    activePositions,
    education,
    linkedPersonId: data.linked_person_id ?? null,
  };
  cache = { value, loadedAt: Date.now() };
  return value;
}

/**
 * Compact "about you" block injected into the NL extraction system prompt.
 * Kept deliberately small — only fields that help with entity disambiguation
 * (current employers, schools) and grounding the user's identity. We do NOT
 * include summary, skills, honors, languages, projects, learning, phone, or
 * email since none of those help the model resolve mentions.
 */
export function compactAboutYou(profile: MeProfileSummary | null): string | null {
  if (!profile) return null;

  const lines: string[] = [];
  if (profile.activePositions.length) {
    const formatted = profile.activePositions
      .map((p) => {
        const role = p.title ? `${p.title} en ${p.company}` : p.company!;
        return p.started_on ? `${role} (desde ${p.started_on})` : role;
      })
      .join("; ");
    lines.push(`- Posiciones actuales: ${formatted}`);
  }
  if (profile.education.length) {
    const formatted = profile.education
      .map((e) => {
        const span = [e.started_on, e.finished_on].filter(Boolean).join("–") || "—";
        return e.degree ? `${e.school} (${e.degree}, ${span})` : `${e.school} (${span})`;
      })
      .join("; ");
    lines.push(`- Educación: ${formatted}`);
  }
  if (lines.length === 0) return null;

  const header = profile.location
    ? `Sobre el usuario (${profile.fullName}, ${profile.location}):`
    : `Sobre el usuario (${profile.fullName}):`;
  return [header, ...lines].join("\n");
}
