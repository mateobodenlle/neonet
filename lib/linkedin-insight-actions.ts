"use server";

import { generateLinkedinInsight, type InsightOutcome } from "./linkedin-insight";

export async function generateLinkedinInsightAction(
  personId: string
): Promise<InsightOutcome> {
  return generateLinkedinInsight(personId);
}
