"use server";

/**
 * Read-side server actions for the observations / profile UI on the
 * contact detail page. Kept apart from server-actions.ts to avoid bloating
 * that file during the legacy transition.
 */

import {
  getObservationsByPerson,
  getProfileByPerson,
} from "./repository";
import type { Observation, PersonProfile } from "./types";

export async function fetchPersonObservations(
  personId: string,
  limit = 50
): Promise<Observation[]> {
  return getObservationsByPerson(personId, { limit });
}

export async function fetchPersonProfile(
  personId: string
): Promise<PersonProfile | null> {
  return getProfileByPerson(personId);
}
