/**
 * Observations: append-only atomic facts about people.
 *
 * The DB schema (observations table) keeps `facets` as untyped jsonb on
 * purpose — structure emerges over time. This module documents the
 * conventions the LLM extractor and the synthesis layer follow when
 * reading/writing facets, but it does NOT enforce them as constraints.
 *
 * Facet conventions (extend, don't break):
 *
 *   { type: 'pain_point' }
 *   { type: 'promesa', direction: 'yo-a-el' | 'el-a-mi',
 *     due_date?: 'YYYY-MM-DD', done?: boolean, completed_at?: ISO }
 *   { type: 'evento', event_id: string }
 *   { type: 'personal', topic?: string }
 *   { type: 'profesional', topic?: string }
 *   { type: 'interes', topic?: string }
 *   { type: 'relacion', kind?: 'conoce'|'trabaja-con'|... }
 *
 * `type` is the primary discriminator. Other keys are free-form, used by
 * synthesis to weight what matters.
 *
 * Sources for the `source` column:
 *   'nl-extraction'        -- created from an NL note via OpenAI
 *   'manual'               -- typed by the user in a structured form
 *   'import-linkedin'      -- bulk import from LinkedIn export
 *   'legacy-pain-point'    -- backfilled from pain_points table
 *   'legacy-promise'       -- backfilled from promises table
 *   'legacy-interaction'   -- backfilled from interactions.body
 */

import type { ObservationRole } from "./types";

export const OBSERVATION_ROLES: ObservationRole[] = [
  "primary",
  "co_subject",
  "related",
  "source",
  "mentioned",
  "promise_target",
];

export const OBSERVATION_SOURCES = [
  "nl-extraction",
  "manual",
  "import-linkedin",
  "legacy-pain-point",
  "legacy-promise",
  "legacy-interaction",
] as const;

export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

export type FacetType =
  | "pain_point"
  | "promesa"
  | "evento"
  | "personal"
  | "profesional"
  | "interes"
  | "relacion"
  | string; // extension point — extractor may invent new types

export interface PromesaFacets {
  type: "promesa";
  direction: "yo-a-el" | "el-a-mi";
  due_date?: string;
  done?: boolean;
  completed_at?: string;
}

export interface EventoFacets {
  type: "evento";
  event_id: string;
}

export function isPromesa(
  f: Record<string, unknown>
): f is PromesaFacets & Record<string, unknown> {
  return f.type === "promesa";
}

export function isPainPoint(f: Record<string, unknown>): boolean {
  return f.type === "pain_point";
}
