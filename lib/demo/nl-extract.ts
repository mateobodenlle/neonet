import "server-only";

import OpenAI from "openai";
import {
  EXTRACTION_SCHEMA_V2,
  compactDirectoryV2,
  compactContextObservations,
  systemPromptV2,
  type DirectoryRowV2,
  type ContextObservation,
} from "@/lib/nl-prompt-v2";
import { chatClientFor, EXTRACTION_MODEL, providerBodyParams, temperatureParam } from "@/lib/openai";
import type { ExtractionV2 } from "@/lib/nl-types";
import type { DemoSessionState } from "./types";

function directoryFromSession(state: DemoSessionState): DirectoryRowV2[] {
  return [...state.people.values()]
    .filter((p) => !p.archived)
    .map((p) => ({
      id: p.id,
      full_name: p.fullName,
      aliases: p.aliases ?? null,
      company: p.company ?? null,
      role: p.role ?? null,
      tags: p.tags ?? null,
      closeness: p.closeness ?? null,
      prior_score: p.priorScore ?? 0,
      narrative_snippet: state.narratives.get(p.id) ?? null,
    }));
}

function contextFromSession(state: DemoSessionState, limit = 12): ContextObservation[] {
  const obs = [...state.observations.values()]
    .filter((o) => !o.supersededBy)
    .sort((a, b) => (b.observedAt > a.observedAt ? 1 : -1))
    .slice(0, limit);
  return obs.map((o) => {
    const person = state.people.get(o.primaryPersonId);
    const facetType =
      o.facets && typeof o.facets === "object" && "type" in o.facets
        ? String((o.facets as Record<string, unknown>).type)
        : null;
    return {
      id: o.id,
      observed_at: o.observedAt,
      primary_person_full_name: person?.fullName ?? o.primaryPersonId,
      facet_type: facetType,
      content: o.content,
    };
  });
}

const DEMO_ABOUT_YOU =
  "Eres el extractor del CRM personal de **Mateo (demo)**. Mateo es founder de una startup de visión artificial e IA en Santiago de Compostela; red activa en banca, retail, hostelería, comunidad founder gallega y VCs de Madrid.";

export async function extractFromNoteDemo(
  state: DemoSessionState,
  text: string,
  today: string,
): Promise<ExtractionV2> {
  if (!text.trim()) throw new Error("Empty note");
  const directoryRows = directoryFromSession(state);
  const directory = compactDirectoryV2(directoryRows);
  const contextObs = contextFromSession(state);
  const systemContent = systemPromptV2(
    directory,
    compactContextObservations(contextObs),
    DEMO_ABOUT_YOU,
  );
  const userContent = `Hoy es ${today}.\n\n## Nota\n${text.trim()}`;

  type ChatBody = OpenAI.ChatCompletionCreateParamsNonStreaming & {
    prompt_cache_key?: string;
    provider?: { require_parameters: boolean };
  };
  const body: ChatBody = {
    model: EXTRACTION_MODEL,
    ...temperatureParam(EXTRACTION_MODEL, 0.1),
    ...providerBodyParams(EXTRACTION_MODEL),
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA_V2 as never },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    prompt_cache_key: "demo-v2",
  };
  const completion = await chatClientFor(EXTRACTION_MODEL).chat.completions.create(body);
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI");
  return JSON.parse(raw) as ExtractionV2;
}
