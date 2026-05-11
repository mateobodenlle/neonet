import "server-only";

import { randomUUID } from "node:crypto";
import { buildSeed, sampleExtraction } from "./seed";
import type { DemoSessionState } from "./types";

const TTL_MS = 30 * 60 * 1000;

// Map keyed por session id. Vive en el proceso (se evapora en cold start /
// redeploy) — suficiente para una demo y cero coste de infra.
const sessions: Map<string, DemoSessionState> = (globalThis as never as {
  __demoSessions?: Map<string, DemoSessionState>;
}).__demoSessions ?? new Map();
(globalThis as never as { __demoSessions?: Map<string, DemoSessionState> }).__demoSessions = sessions;

function gc(): void {
  const now = Date.now();
  for (const [sid, state] of sessions) {
    if (now - state.lastTouched > TTL_MS) sessions.delete(sid);
  }
}

export function createSession(sid: string): DemoSessionState {
  gc();
  const seed = buildSeed();
  const state: DemoSessionState = {
    sid,
    createdAt: Date.now(),
    lastTouched: Date.now(),
    people: seed.people,
    observations: seed.observations,
    participants: seed.participants,
    events: seed.events,
    encounters: seed.encounters,
    edges: seed.edges,
    narratives: seed.narratives,
    extractions: new Map(),
  };
  // Una extracción de muestra pre-cargada para que la pantalla de pendientes
  // no esté vacía nada más entrar.
  const sampleId = randomUUID();
  state.extractions.set(sampleId, {
    id: sampleId,
    createdAt: new Date().toISOString(),
    noteText:
      "Hablé con Marta en su oficina; me cuenta que en BBVA están evaluando un launchpad de IA para startups en Q3. Me sugiere hablar con Pedro Iglesias, su jefe, antes de mandar nada formal.",
    rawExtraction: sampleExtraction(),
    status: { kind: "pending" },
  });
  sessions.set(sid, state);
  return state;
}

export function getSession(sid: string): DemoSessionState | null {
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.lastTouched > TTL_MS) {
    sessions.delete(sid);
    return null;
  }
  s.lastTouched = Date.now();
  return s;
}

export function getOrCreateSession(sid: string): DemoSessionState {
  return getSession(sid) ?? createSession(sid);
}
