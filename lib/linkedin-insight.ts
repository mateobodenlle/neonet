import "server-only";

/**
 * On-demand "Generate insight from LinkedIn history" for a single contact.
 *
 *   generateLinkedinInsight(personId)
 *
 * Pulls DMs and comments that involve the person from the raw tables,
 * filters out noise, asks the LLM for atomic observations + a short
 * narrative summary, persists the observations and marks the person's
 * profile dirty so the next synthesis pass folds them in.
 */

import { randomUUID } from "node:crypto";
import { openai, EXTRACTION_MODEL } from "./openai";
import { supabaseAdmin } from "./supabase-admin";
import {
  persistObservation,
  persistObservationParticipants,
  markPersonProfileDirty,
} from "./server-actions";
import { embedObservation } from "./embeddings";
import { getMeProfileSummary, compactAboutYou } from "./me-profile";
import type { Observation, ObservationParticipant } from "./types";

const MIN_TOTAL_CHARS = 300;
const MAX_INPUT_CHARS = 24000; // ~6K tokens of context, plenty for the cheaper model

// --- noise heuristics ---

function isNoiseMessage(m: { from_name: string; content: string | null }): boolean {
  if (!m.content) return true;
  const c = m.content.trim();
  if (c.length < 20) return true;
  // LinkedIn Premium ads come from the synthetic "LinkedIn Member" sender
  // and contain HTML markers from the in-app rich editor.
  if (m.from_name === "LinkedIn Member") return true;
  if (c.includes("spinmail-quill-editor")) return true;
  if (c.includes("%FIRSTNAME%")) return true;
  return false;
}

// --- data load ---

interface RawMessage {
  id: string;
  conversation_id: string | null;
  from_name: string;
  sender_handle: string | null;
  to_names: string | null;
  recipient_handles: string[] | null;
  date: string;
  content: string | null;
}

interface RawComment {
  id: string;
  date: string;
  link: string | null;
  message: string;
}

async function loadMessagesForHandle(handle: string): Promise<RawMessage[]> {
  // Match either when the person sent it or when they're a recipient.
  const { data: a, error: aErr } = await supabaseAdmin
    .from("linkedin_messages_raw")
    .select("id, conversation_id, from_name, sender_handle, to_names, recipient_handles, date, content")
    .eq("sender_handle", handle)
    .order("date", { ascending: true });
  if (aErr) throw aErr;
  const { data: b, error: bErr } = await supabaseAdmin
    .from("linkedin_messages_raw")
    .select("id, conversation_id, from_name, sender_handle, to_names, recipient_handles, date, content")
    .contains("recipient_handles", [handle])
    .order("date", { ascending: true });
  if (bErr) throw bErr;
  const seen = new Set<string>();
  const out: RawMessage[] = [];
  for (const r of [...(a ?? []), ...(b ?? [])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r as RawMessage);
  }
  out.sort((x, y) => x.date.localeCompare(y.date));
  return out;
}

async function loadCommentsMentioning(name: string): Promise<RawComment[]> {
  const { data, error } = await supabaseAdmin
    .from("linkedin_comments_raw")
    .select("id, date, link, message")
    .ilike("message", `%${name}%`)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RawComment[];
}

// --- prompt ---

const INSIGHT_SCHEMA = {
  name: "linkedin_insight",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["narrative", "observations", "tags", "sufficient"],
    properties: {
      sufficient: {
        type: "boolean",
        description:
          "True if there is enough substance in the supplied history to extract anything meaningful. False if the texts are mostly logistics/greetings.",
      },
      narrative: {
        type: "string",
        description:
          "2-3 sentences in Spanish summarizing who this person is to Mateo and the relationship. Empty string if sufficient=false.",
      },
      observations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["content", "observed_at", "tags", "facets_raw"],
          properties: {
            content: {
              type: "string",
              description:
                "A single atomic fact about the person, in Spanish, self-contained. NOT about Mateo unless framed as a commitment by Mateo to this person.",
            },
            observed_at: {
              type: "string",
              description: "YYYY-MM-DD — date of the originating message/comment.",
            },
            tags: { type: "array", items: { type: "string" } },
            facets_raw: {
              type: "string",
              description:
                'JSON-encoded object. Examples: {"type":"profesional","topic":"trabajo-actual"}, {"type":"interes","topic":"emprendimiento"}, {"type":"promesa","direction":"yo-a-el"}, {"type":"evento","event_name":"GDG Ourense"}, or "{}".',
            },
          },
        },
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "0-5 tags applicable to the person overall (interests, communities, etc.).",
      },
    },
  },
} as const;

interface LLMOut {
  sufficient: boolean;
  narrative: string;
  observations: Array<{
    content: string;
    observed_at: string;
    tags: string[];
    facets_raw: string;
  }>;
  tags: string[];
}

function buildSystemPrompt(aboutYou: string | null): string {
  const aboutBlock = aboutYou
    ? `## ${aboutYou}\n\n`
    : "";
  return [
    "Eres analista de relaciones para el CRM personal del usuario. Recibirás:",
    "  1. El historial de mensajes directos de LinkedIn entre el usuario y un contacto X.",
    "  2. Comentarios públicos donde X aparece mencionado (por nombre).",
    "",
    "Tu tarea: extraer **observaciones atómicas** sobre X y un breve resumen narrativo.",
    "",
    "Reglas duras:",
    "- No inventes nada que no esté en los textos.",
    "- Cada observación es UN hecho concreto. Si los textos hablan de varios temas, emite varias observaciones.",
    "- Excluye saludos, 'gracias', 'ok', logística trivial (\"¿a qué hora?\", \"te paso link\").",
    "- Las observaciones son sobre X, NO sobre el usuario, salvo en el caso de promesas (`{\"type\":\"promesa\",\"direction\":\"yo-a-el\"}`).",
    "- Si los textos son mayoritariamente ruido, devuelve `sufficient: false`, narrative vacío, observations: [].",
    "- Las fechas deben venir en formato YYYY-MM-DD, calculadas a partir de la fecha del mensaje/comentario que aporta el hecho.",
    "- Las menciones a 'Mateo' o al usuario en los comentarios SE TE PASAN porque X aparece nombrado; entiende que son comentarios escritos POR el usuario hablando DE X (o respondiendo a X).",
    "",
    aboutBlock + "Responde estrictamente con el schema JSON.",
  ].join("\n");
}

function compactMessages(messages: RawMessage[], userName: string): string {
  return messages
    .filter((m) => !isNoiseMessage(m))
    .map((m) => {
      const who = m.from_name === userName ? "USUARIO" : m.from_name;
      const date = m.date.slice(0, 16).replace("T", " ");
      const content = (m.content ?? "").replace(/\s+/g, " ").trim();
      return `[${date}] ${who}: ${content}`;
    })
    .join("\n");
}

function compactComments(comments: RawComment[]): string {
  return comments
    .map((c) => {
      const date = c.date.slice(0, 10);
      return `[${date}] ${c.message.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n");
}

function trimToBudget(s: string, max: number): string {
  if (s.length <= max) return s;
  // Keep the most recent half — recent context is usually more relevant.
  return "(...truncado...)\n" + s.slice(s.length - max);
}

// --- public ---

export interface InsightOutcome {
  sufficient: boolean;
  narrative: string;
  observationsCreated: number;
  messagesUsed: number;
  commentsUsed: number;
  totalChars: number;
  reason?: string;
}

export async function generateLinkedinInsight(personId: string): Promise<InsightOutcome> {
  // Person + handle
  const { data: person, error: pErr } = await supabaseAdmin
    .from("people")
    .select("id, full_name, handles, role, company")
    .eq("id", personId)
    .single();
  if (pErr || !person) throw pErr ?? new Error("person not found");
  const handle = (person.handles?.linkedin ?? "").toLowerCase().trim();
  const fullName = person.full_name as string;

  if (!handle) {
    return {
      sufficient: false,
      narrative: "",
      observationsCreated: 0,
      messagesUsed: 0,
      commentsUsed: 0,
      totalChars: 0,
      reason: "Sin handle de LinkedIn en este contacto.",
    };
  }

  // me_profile for prompt grounding + figuring out user's display name
  const me = await getMeProfileSummary();
  const userName = me?.fullName ?? "Mateo Bodenlle Villarino";
  const aboutYou = compactAboutYou(me);

  // Load raw history
  const [allMessages, allComments] = await Promise.all([
    loadMessagesForHandle(handle),
    loadCommentsMentioning(fullName),
  ]);

  const cleanMessages = allMessages.filter((m) => !isNoiseMessage(m));
  const totalChars =
    cleanMessages.reduce((s, m) => s + (m.content?.length ?? 0), 0) +
    allComments.reduce((s, c) => s + c.message.length, 0);

  if (cleanMessages.length + allComments.length === 0 || totalChars < MIN_TOTAL_CHARS) {
    return {
      sufficient: false,
      narrative: "",
      observationsCreated: 0,
      messagesUsed: cleanMessages.length,
      commentsUsed: allComments.length,
      totalChars,
      reason:
        totalChars === 0
          ? "Sin DMs ni menciones en comentarios."
          : `Volumen insuficiente (${totalChars} chars, umbral ${MIN_TOTAL_CHARS}).`,
    };
  }

  const messagesBlock = trimToBudget(compactMessages(allMessages, userName), MAX_INPUT_CHARS / 2);
  const commentsBlock = trimToBudget(compactComments(allComments), MAX_INPUT_CHARS / 2);

  const systemContent = buildSystemPrompt(aboutYou);
  const userContent = [
    `Contacto: **${fullName}**${person.role ? ` — ${person.role}` : ""}${person.company ? ` en ${person.company}` : ""}.`,
    "",
    "## Mensajes directos (cronológicos)",
    messagesBlock || "(ninguno)",
    "",
    "## Comentarios públicos donde aparece su nombre",
    commentsBlock || "(ninguno)",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    temperature: 0.1,
    response_format: { type: "json_schema", json_schema: INSIGHT_SCHEMA as never },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  });
  const rawOut = completion.choices[0]?.message?.content;
  if (!rawOut) throw new Error("Empty LLM response");
  const out = JSON.parse(rawOut) as LLMOut;

  if (!out.sufficient) {
    return {
      sufficient: false,
      narrative: "",
      observationsCreated: 0,
      messagesUsed: cleanMessages.length,
      commentsUsed: allComments.length,
      totalChars,
      reason: "El modelo consideró que no hay sustancia destilable.",
    };
  }

  // Persist observations
  let created = 0;
  for (const o of out.observations) {
    let facets: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(o.facets_raw);
      if (parsed && typeof parsed === "object") facets = parsed;
    } catch {
      // ignore
    }
    const obs: Observation = {
      id: randomUUID(),
      primaryPersonId: personId,
      content: o.content,
      observedAt: o.observed_at,
      source: "linkedin-insight",
      tags: o.tags,
      facets,
      createdAt: new Date().toISOString(),
    };
    await persistObservation(obs);
    const participants: ObservationParticipant[] = [
      { observationId: obs.id, personId, role: "primary" },
    ];
    await persistObservationParticipants(participants);
    try {
      await embedObservation(obs.id);
    } catch (e) {
      console.error("embedObservation failed:", e);
    }
    created++;
  }

  // Apply person-level tags returned by the model (don't overwrite existing).
  if (out.tags.length) {
    const { data: cur } = await supabaseAdmin
      .from("people")
      .select("tags")
      .eq("id", personId)
      .single();
    const existing = new Set<string>(cur?.tags ?? []);
    for (const t of out.tags) if (t.trim()) existing.add(t.trim());
    await supabaseAdmin
      .from("people")
      .update({ tags: [...existing] })
      .eq("id", personId);
  }

  await markPersonProfileDirty([personId]);

  return {
    sufficient: true,
    narrative: out.narrative,
    observationsCreated: created,
    messagesUsed: cleanMessages.length,
    commentsUsed: allComments.length,
    totalChars,
  };
}
