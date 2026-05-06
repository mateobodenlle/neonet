"use server";

/**
 * v2 of the natural-language flow — observation-based.
 *
 *   extractFromNoteV2(text, today)            → ExtractionV2
 *   extractForPersonV2(text, personId, today) → ExtractionV2 with subject hint
 *   applyPlanV2(plan)                         → persists observations, etc.
 *
 * v1 (lib/nl-actions.ts) stays in place during the transition. UI flips to
 * v2 in phase 5.
 */

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { openai, EXTRACTION_MODEL } from "./openai";
import { withLlmLoggingDetailed, type LlmPurpose } from "./llm-observability";
import {
  insertExtraction,
  updateExtractionApplied,
  insertCorrections,
  diffPlan,
} from "./eval-builder/persistence";
import { supabaseAdmin } from "./supabase-admin";
import { embedText, embedObservation } from "./embeddings";
import {
  EXTRACTION_SCHEMA_V2,
  compactDirectoryV2,
  compactContextObservations,
  systemPromptV2,
  type DirectoryRowV2,
  type ContextObservation,
} from "./nl-prompt-v2";
import { getMeProfileSummary, compactAboutYou } from "./me-profile";
import {
  persistPerson,
  persistObservation,
  persistObservationParticipants,
  persistEvent,
  applySupersede,
  markPersonProfileDirty,
} from "./server-actions";
import { refreshPriorsForPersons } from "./person-prior";
import type {
  ExtractionV2,
  ConfirmedPlanV2,
  ExtractedPersonUpdateV2,
  ProposedNewPerson,
} from "./nl-types";
import type {
  Person,
  Observation,
  ObservationParticipant,
  ObservationRole,
  Event as DomainEvent,
} from "./types";
import { vectorToWire } from "./mappers";

// ---------- directory + context retrieval ----------

async function loadDirectory(excludePersonId?: string | null): Promise<DirectoryRowV2[]> {
  // Left join with person_profiles to pick up the narrative snippet. Two
  // round-trips kept simple — both tables are small.
  let query = supabaseAdmin
    .from("people")
    .select("id, full_name, aliases, company, role, tags, closeness, prior_score")
    .eq("archived", false);
  if (excludePersonId) query = query.neq("id", excludePersonId);
  const { data: people, error } = await query;
  if (error) throw error;
  const ids = (people ?? []).map((p) => p.id);
  const { data: profiles } = await supabaseAdmin
    .from("person_profiles")
    .select("person_id, narrative")
    .in("person_id", ids);
  const narrativeById = new Map<string, string>();
  for (const r of profiles ?? []) {
    if (r.narrative) narrativeById.set(r.person_id, r.narrative);
  }
  return (people ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    aliases: p.aliases,
    company: p.company,
    role: p.role,
    tags: p.tags,
    closeness: p.closeness,
    prior_score: Number(p.prior_score ?? 0),
    narrative_snippet: narrativeById.get(p.id) ?? null,
  }));
}

/**
 * Picks observations that are likely relevant to this note via a single
 * embedding query against the global observation index. Limit kept tight
 * to bound prompt size — we mostly care about giving the model enough to
 * detect supersedes, not full historical context.
 */
async function loadContextObservations(
  noteText: string,
  opts: { limit?: number } = {}
): Promise<ContextObservation[]> {
  const { limit = 12 } = opts;
  try {
    const { vector } = await embedText(noteText);
    const { data, error } = await supabaseAdmin.rpc("search_observations", {
      query_embedding: vectorToWire(vector),
      match_limit: limit,
      filter_person_id: null,
      min_score: 0.15,
    });
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      observation: {
        id: string;
        content: string;
        observed_at: string;
        primary_person_id: string;
        facets: Record<string, unknown> | null;
      };
    }>;
    if (rows.length === 0) return [];
    const personIds = Array.from(
      new Set(rows.map((r) => r.observation.primary_person_id))
    );
    const { data: people } = await supabaseAdmin
      .from("people")
      .select("id, full_name")
      .in("id", personIds);
    const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
    return rows.map((r) => ({
      id: r.observation.id,
      content: r.observation.content,
      observed_at: r.observation.observed_at,
      primary_person_full_name:
        nameById.get(r.observation.primary_person_id) ?? r.observation.primary_person_id,
      facet_type:
        r.observation.facets &&
        typeof r.observation.facets === "object" &&
        "type" in r.observation.facets
          ? String((r.observation.facets as Record<string, unknown>).type)
          : null,
    }));
  } catch (e) {
    console.warn("loadContextObservations: falling back to empty context.", e);
    return [];
  }
}

// ---------- extraction ----------

interface RunOpts {
  systemContent: string;
  userContent: string;
  cacheKey: string;
  purpose: LlmPurpose;
  personIds?: string[];
  metadata?: Record<string, unknown>;
}

interface RunExtractionResult {
  extraction: ExtractionV2;
  llmCallId: string;
  durationMs: number;
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
}

async function runExtraction(opts: RunOpts): Promise<RunExtractionResult> {
  type ChatBody = OpenAI.ChatCompletionCreateParamsNonStreaming & {
    prompt_cache_key?: string;
  };
  const body: ChatBody = {
    model: EXTRACTION_MODEL,
    temperature: 0.1,
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA_V2 as never },
    messages: [
      { role: "system", content: opts.systemContent },
      { role: "user", content: opts.userContent },
    ],
    prompt_cache_key: opts.cacheKey,
  };
  const { result, trace } = await withLlmLoggingDetailed(
    {
      purpose: opts.purpose,
      model: EXTRACTION_MODEL,
      personIds: opts.personIds,
      metadata: opts.metadata,
    },
    async () => {
      const completion = await openai.chat.completions.create(body);
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty response from OpenAI");
      const parsed = JSON.parse(raw) as ExtractionV2;
      const mentionsByText = new Map<string, { candidate_ids: string[]; proposed_new: unknown }>();
      for (const o of parsed.observations ?? []) {
        if (o.primary_mention) mentionsByText.set(o.primary_mention.text, o.primary_mention);
        for (const p of o.participants ?? []) {
          if (p.mention) mentionsByText.set(p.mention.text, p.mention);
        }
      }
      for (const u of parsed.person_updates ?? []) {
        if (u.primary_mention) mentionsByText.set(u.primary_mention.text, u.primary_mention);
      }
      const mentionList = [...mentionsByText.values()];
      const ambiguous = mentionList.filter((m) => (m.candidate_ids?.length ?? 0) > 1).length;
      const unresolved = mentionList.filter(
        (m) => (m.candidate_ids?.length ?? 0) === 0 && !m.proposed_new,
      ).length;
      return {
        result: parsed,
        usage: completion.usage ?? undefined,
        extraMetadata: {
          observations_extracted: parsed.observations?.length ?? 0,
          mentions_total: mentionList.length,
          mentions_ambiguous: ambiguous,
          mentions_unresolved: unresolved,
        },
      };
    },
  );
  return {
    extraction: result,
    llmCallId: trace.llmCallId,
    durationMs: trace.durationMs,
    promptTokens: trace.promptTokens,
    cachedTokens: trace.cachedTokens,
    completionTokens: trace.completionTokens,
  };
}

function directoryCacheKey(directory: string): string {
  // Lightweight hash — 32-bit DJB2. Enough to shard cache.
  let h = 5381;
  for (let i = 0; i < directory.length; i++) {
    h = ((h << 5) + h + directory.charCodeAt(i)) | 0;
  }
  return `nl-v${2}-${(h >>> 0).toString(16)}`;
}

export interface ExtractionResultV2 {
  extraction: ExtractionV2;
  extractionId: string;
}

const PROMPT_VERSION_V2 = "v2";

export async function extractFromNoteV2(
  text: string,
  today: string
): Promise<ExtractionResultV2> {
  if (!text.trim()) throw new Error("Empty note");
  const me = await getMeProfileSummary();
  const directoryRows = await loadDirectory(me?.linkedPersonId ?? null);
  const directory = compactDirectoryV2(directoryRows);
  const aboutYou = compactAboutYou(me);
  const contextObs = await loadContextObservations(text);
  const systemContent = systemPromptV2(
    directory,
    compactContextObservations(contextObs),
    aboutYou
  );
  const userContent = `Hoy es ${today}.\n\n## Nota\n${text.trim()}`;
  const run = await runExtraction({
    systemContent,
    userContent,
    cacheKey: directoryCacheKey(directory),
    purpose: "extraction",
    metadata: {
      note_length: text.length,
      directory_size: directoryRows.length,
      context_observations: contextObs.length,
    },
  });
  const extractionId = randomUUID();
  await insertExtraction({
    id: extractionId,
    noteText: text,
    noteContext: null,
    todayDate: today,
    promptVersion: PROMPT_VERSION_V2,
    extractionType: "global",
    subjectPersonId: null,
    model: EXTRACTION_MODEL,
    llmCallId: run.llmCallId,
    rawExtraction: run.extraction,
    directorySize: directoryRows.length,
    durationMs: run.durationMs,
    promptTokens: run.promptTokens ?? null,
    cachedTokens: run.cachedTokens ?? null,
    completionTokens: run.completionTokens ?? null,
  });
  return { extraction: run.extraction, extractionId };
}

export async function extractForPersonV2(
  text: string,
  personId: string,
  today: string
): Promise<ExtractionResultV2> {
  if (!text.trim()) throw new Error("Empty note");
  const me = await getMeProfileSummary();
  const directoryRows = await loadDirectory(me?.linkedPersonId ?? null);
  const subject = directoryRows.find((d) => d.id === personId);
  if (!subject) throw new Error(`Subject person not found: ${personId}`);
  const directory = compactDirectoryV2(directoryRows);
  const aboutYou = compactAboutYou(me);
  const contextObs = await loadContextObservations(text);
  const systemContent = systemPromptV2(
    directory,
    compactContextObservations(contextObs),
    aboutYou
  );
  const userContent = [
    `Hoy es ${today}.`,
    "",
    `Sujeto implícito de esta nota: **${subject.full_name}** (id=\`${subject.id}\`). Cualquier afirmación sin sujeto explícito ("trabaja en X", "le interesa Y") se refiere a esta persona — usa su nombre exacto como mention.text y pon su id en candidate_ids.`,
    "",
    "## Nota",
    text.trim(),
  ].join("\n");
  const run = await runExtraction({
    systemContent,
    userContent,
    cacheKey: directoryCacheKey(directory),
    purpose: "extraction-for-person",
    personIds: [personId],
    metadata: {
      note_length: text.length,
      directory_size: directoryRows.length,
      context_observations: contextObs.length,
    },
  });
  const extractionId = randomUUID();
  await insertExtraction({
    id: extractionId,
    noteText: text,
    noteContext: `subject=${subject.full_name} (id=${subject.id})`,
    todayDate: today,
    promptVersion: PROMPT_VERSION_V2,
    extractionType: "per-person",
    subjectPersonId: personId,
    model: EXTRACTION_MODEL,
    llmCallId: run.llmCallId,
    rawExtraction: run.extraction,
    directorySize: directoryRows.length,
    durationMs: run.durationMs,
    promptTokens: run.promptTokens ?? null,
    cachedTokens: run.cachedTokens ?? null,
    completionTokens: run.completionTokens ?? null,
  });
  return { extraction: run.extraction, extractionId };
}

// ---------- apply ----------

function nowIso(): string {
  return new Date().toISOString();
}

function newPersonStub(suggested: ProposedNewPerson): Person {
  return {
    id: randomUUID(),
    fullName: suggested.full_name,
    aliases: [],
    role: suggested.role ?? undefined,
    company: suggested.company ?? undefined,
    category: "otro",
    temperature: "frio",
    tags: ["from-nl-input"],
    autoCreated: true,
    handles: undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

interface ApplyOpts {
  embedSync?: boolean; // default true
  extractionId?: string;
  rawExtraction?: ExtractionV2;
}

export interface ApplyResultV2 {
  createdPeople: Person[];
  updatedPersonIds: string[];
  createdEvents: DomainEvent[];
  createdObservationIds: string[];
  supersededObservationIds: string[];
  dirtyPersonIds: string[];
}

function pickField(
  patch: Record<string, unknown>,
  field: ExtractedPersonUpdateV2["field"],
  value: string
): void {
  // The enum values match people.* column names 1:1 (next_step already
  // snake-cased). Arrays are handled by the caller.
  if (field === "interests" || field === "tags") return;
  patch[field] = value;
}

function parseFacets(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function applyPlanV2(
  plan: ConfirmedPlanV2,
  opts: ApplyOpts = {}
): Promise<ApplyResultV2> {
  const embedSync = opts.embedSync ?? true;

  // Best-effort: persist the diff between raw LLM output and the user-confirmed
  // plan as correction rows. Never blocks the apply flow.
  if (opts.extractionId && opts.rawExtraction) {
    try {
      const diffs = diffPlan(opts.rawExtraction, plan);
      if (diffs.length > 0) {
        await insertCorrections(
          diffs.map((d) => ({
            extractionId: opts.extractionId!,
            correctionType: d.correctionType,
            before: d.before,
            after: d.after,
          })),
        );
      }
    } catch (e) {
      console.error("applyPlanV2 diff persistence failed", e);
    }
  }

  const personIdByText = new Map<string, string>();
  const createdPeople: Person[] = [];

  // 1. resolve mentions → personIds, creating stubs when needed.
  for (const [text, res] of Object.entries(plan.resolutions)) {
    if (res.kind === "existing") personIdByText.set(text, res.personId);
    else if (res.kind === "new") {
      const person = newPersonStub(res.person);
      await persistPerson(person);
      createdPeople.push(person);
      personIdByText.set(text, person.id);
    }
  }
  const resolve = (text: string): string | null => personIdByText.get(text) ?? null;

  // 2. events.
  const createdEvents: DomainEvent[] = [];
  const eventIdByName = new Map<string, string>();
  for (const e of plan.events) {
    const event: DomainEvent = {
      id: randomUUID(),
      name: e.name,
      date: e.date,
      location: e.location ?? undefined,
    };
    await persistEvent(event);
    createdEvents.push(event);
    eventIdByName.set(e.name.trim().toLowerCase(), event.id);
  }

  // 3. person_updates — write to people.* directly.
  const updatedPersonIds = new Set<string>();
  for (const u of plan.person_updates) {
    const id = resolve(u.primary_mention.text);
    if (!id) continue;
    const { data: row, error } = await supabaseAdmin
      .from("people")
      .select("interests, tags")
      .eq("id", id)
      .single();
    if (error || !row) continue;
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (u.field === "interests") {
      const next = Array.from(
        new Set([
          ...(row.interests ?? []),
          ...u.new_value.split(",").map((s: string) => s.trim()).filter(Boolean),
        ])
      );
      patch.interests = next;
    } else if (u.field === "tags") {
      const next = Array.from(
        new Set([
          ...(row.tags ?? []),
          ...u.new_value.split(",").map((s: string) => s.trim()).filter(Boolean),
        ])
      );
      patch.tags = next;
    } else {
      pickField(patch, u.field, u.new_value);
    }
    const { error: ue } = await supabaseAdmin.from("people").update(patch).eq("id", id);
    if (!ue) updatedPersonIds.add(id);
  }

  // 4. observations.
  const createdObservationIds: string[] = [];
  const dirtyPersonIds = new Set<string>([...updatedPersonIds]);
  const supersededObservationIds: string[] = [];
  for (let i = 0; i < plan.observations.length; i++) {
    const o = plan.observations[i];
    const primaryId = resolve(o.primary_mention.text);
    if (!primaryId) continue;
    const observationId = randomUUID();
    const facets = parseFacets(o.facets.raw);
    // Resolve event_name → event_id when relevant.
    if (
      facets.type === "evento" &&
      typeof facets.event_name === "string" &&
      !facets.event_id
    ) {
      const id = eventIdByName.get(String(facets.event_name).trim().toLowerCase());
      if (id) facets.event_id = id;
    }
    const observation: Observation = {
      id: observationId,
      primaryPersonId: primaryId,
      content: o.content,
      observedAt: o.observed_at,
      source: "nl-extraction",
      tags: o.tags ?? [],
      facets,
      createdAt: nowIso(),
    };
    await persistObservation(observation);
    createdObservationIds.push(observationId);

    // Participants — primary + extras, dedupe per (person, role).
    const seen = new Set<string>();
    const participants: ObservationParticipant[] = [];
    const pushParticipant = (personId: string, role: ObservationRole) => {
      const key = `${personId}|${role}`;
      if (seen.has(key)) return;
      seen.add(key);
      participants.push({ observationId, personId, role });
    };
    pushParticipant(primaryId, "primary");
    for (const p of o.participants) {
      const pid = resolve(p.mention.text);
      if (!pid) continue;
      pushParticipant(pid, p.role as ObservationRole);
    }
    await persistObservationParticipants(participants);
    for (const p of participants) dirtyPersonIds.add(p.personId);

    // Supersedes — confirmed by user.
    const confirmedSupersedes = plan.supersedes?.[i] ?? [];
    for (const oldId of confirmedSupersedes) {
      await applySupersede(oldId, observationId);
      supersededObservationIds.push(oldId);
    }

    if (embedSync) {
      try {
        await embedObservation(observationId);
      } catch (e) {
        console.error(`embedObservation failed for ${observationId}:`, e);
      }
    }
  }

  // 5. mark profiles dirty + refresh priors for every touched person.
  if (dirtyPersonIds.size > 0) {
    await markPersonProfileDirty([...dirtyPersonIds]);
    await refreshPriorsForPersons([...dirtyPersonIds]);
  }

  if (opts.extractionId) {
    const affectedPersons = Array.from(
      new Set([
        ...createdPeople.map((p) => p.id),
        ...updatedPersonIds,
        ...dirtyPersonIds,
      ]),
    );
    await updateExtractionApplied(opts.extractionId, plan, affectedPersons, []);
  }

  return {
    createdPeople,
    updatedPersonIds: [...updatedPersonIds],
    createdEvents,
    createdObservationIds,
    supersededObservationIds,
    dirtyPersonIds: [...dirtyPersonIds],
  };
}

