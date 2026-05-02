"use server";

import { supabaseAdmin } from "./supabase-admin";
import { invalidateMeProfileCache } from "./me-profile";

export interface MeProfileFull {
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  summary: string | null;
  industry: string | null;
  location: string | null;
  address: string | null;
  zip_code: string | null;
  birth_date: string | null;
  twitter_handles: string[];
  websites: string[];
  instant_messengers: string[];
  positions: Position[];
  education: EducationItem[];
  skills: string[];
  honors: Honor[];
  languages: Language[];
  projects: Project[];
  courses: Course[];
  learning: Learning[];
  phone_numbers: PhoneNumber[];
  emails: EmailEntry[];
  jobs_preferences: Record<string, unknown> | null;
  source: string;
  imported_at: string;
  updated_at: string;
  linked_person_id: string | null;
}

export interface Position {
  company: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  started_on: string | null;
  finished_on: string | null;
}
export interface EducationItem {
  school: string | null;
  degree: string | null;
  notes: string | null;
  activities: string | null;
  started_on: string | null;
  finished_on: string | null;
}
export interface Honor {
  title: string | null;
  description: string | null;
  issued_on: string | null;
}
export interface Language {
  name: string | null;
  proficiency: string | null;
}
export interface Project {
  title: string | null;
  description: string | null;
  url: string | null;
  started_on: string | null;
  finished_on: string | null;
}
export interface Course {
  name: string | null;
  number: string | null;
}
export interface Learning {
  title: string | null;
  description: string | null;
  type: string | null;
  last_watched: string | null;
  completed_at: string | null;
  saved: boolean;
}
export interface PhoneNumber {
  extension: string | null;
  number: string | null;
  type: string | null;
}
export interface EmailEntry {
  address: string | null;
  confirmed: boolean;
  primary: boolean;
  updated_at: string | null;
}

export async function getMeProfileFull(): Promise<MeProfileFull | null> {
  const { data, error } = await supabaseAdmin
    .from("me_profile")
    .select("*")
    .eq("id", "me")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as MeProfileFull;
}

export type Editable =
  | "headline"
  | "summary"
  | "location"
  | "address"
  | "zip_code"
  | "birth_date"
  | "industry";

export async function updateMeProfileScalar(
  field: Editable,
  value: string | null
): Promise<void> {
  const trimmed = value?.trim() ?? null;
  const { error } = await supabaseAdmin
    .from("me_profile")
    .update({ [field]: trimmed && trimmed.length > 0 ? trimmed : null })
    .eq("id", "me");
  if (error) throw error;
  invalidateMeProfileCache();
}

export async function updateMeProfileSkills(skills: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(skills.map((s) => s.trim()).filter((s) => s.length > 0))
  );
  const { error } = await supabaseAdmin
    .from("me_profile")
    .update({ skills: cleaned })
    .eq("id", "me");
  if (error) throw error;
  invalidateMeProfileCache();
}

/**
 * Toggle a position's `finished_on` field — empty string sets it to null
 * (i.e. position is current), a "YYYY-MM" string marks it finished.
 */
export async function updatePositionFinished(
  index: number,
  finishedOn: string | null
): Promise<void> {
  const { data, error: rErr } = await supabaseAdmin
    .from("me_profile")
    .select("positions")
    .eq("id", "me")
    .single();
  if (rErr) throw rErr;
  const positions: Position[] = (data?.positions ?? []) as Position[];
  if (index < 0 || index >= positions.length) throw new Error("position index out of range");
  positions[index] = { ...positions[index], finished_on: finishedOn };
  const { error: uErr } = await supabaseAdmin
    .from("me_profile")
    .update({ positions })
    .eq("id", "me");
  if (uErr) throw uErr;
  invalidateMeProfileCache();
}
