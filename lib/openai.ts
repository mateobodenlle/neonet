import "server-only";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

export const openai = new OpenAI({ apiKey });

export const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o";
