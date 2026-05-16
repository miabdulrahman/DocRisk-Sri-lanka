import "../loadEnv.js";
import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult } from "../../../client/src/types.js";
import { normalizeOutputLang } from "../lib/outputLang.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";
const temperature = 0;
const maxOutputTokens = 900;

const SYSTEM_PROMPT = `You are a forensic document fraud analyst specialized in Sri Lanka.
You receive a document (image or PDF) that may contain Sinhala, Tamil, or English text and/or official seals.
Analyze the document for authenticity and signs of fraud.

CRITICAL: Output ONLY valid JSON with exactly these keys — no extra text, no markdown, no explanation outside the JSON:

{
  "document_type": one of "job_offer" | "land_deed" | "visa_letter" | "certificate" | "bank_notice" | "other",
  "risk_score": integer from 0 to 100,
  "confidence": integer 0-100 (100 = fully certain, 0 = cannot determine). Set confidence below 60 if document is blurry, cropped, or partially unreadable. Set above 80 only when seals, full text, and formatting are clearly visible,
  "risk_level": one of "low" | "medium" | "high",
  "summary": a brief one-sentence summary of your finding,
  "red_flags": an array of specific issues found (strings); use an empty array [] if none,
  "explanation": a short paragraph explaining the red_flags in context,
  "recommended_action": clear advice for the user on what to do next
}

When assessing, check for:
- Missing or inconsistent government stamps and official seals
- Upfront payment or wire transfer demands
- Urgency language ("act now", "within 24 hours", etc.)
- Generic or personal email addresses instead of official domains
- Inconsistent fonts, formatting, or document layout
- Unrecognized or misspelled place names in Sri Lanka
- Wrong date formats (Sri Lanka uses DD/MM/YYYY)
- Missing legal identifiers (company reg. number, NIC, land registry number)
- Unrealistic promises (e.g., visa in 3 days)
- Sinhala or Tamil text that appears machine-translated or inconsistent

Use a risk_score from 0 (completely legitimate) to 100 (clearly fraudulent).
If you cannot determine a field, use a reasonable default (e.g., "other" for document_type, 0 for risk_score, 50 for confidence, [] for red_flags).
Do NOT output anything other than the JSON object.`;

const langMap: Record<string, string> = {
  sinhala: "Sinhala (සිංහල)",
  tamil: "Tamil (தமிழ்)",
  english: "English",
};

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function resolveModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export async function analyzeDocument(
  fileBase64: string,
  mimeType: string,
  outputLang = "english",
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Server is missing GEMINI_API_KEY. Check server/.env");
  }

  const lang = normalizeOutputLang(outputLang);
  const langName = langMap[lang] ?? "English";
  const langInstruction = `OUTPUT LANGUAGE (required): Write "summary", "explanation", "recommended_action", and every string in "red_flags" entirely in ${langName}. Use natural ${langName} — not English. Keep JSON keys in English only.`;

  const modelName = resolveModelName();
  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          inlineData: {
            data: fileBase64,
            mimeType,
          },
        },
        {
          text: `${langInstruction}\n\nAnalyze this document and return the JSON result.`,
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") && msg.includes("not found")) {
      throw new Error(
        `Gemini model "${modelName}" is unavailable. Set GEMINI_MODEL=${DEFAULT_MODEL} in server/.env and restart.`,
      );
    }
    throw err;
  }

  const text = response.text ?? "";
  const cleaned = stripJsonFences(text);

  if (!cleaned) {
    throw new Error("AI returned an empty response. Please try again.");
  }

  let parsed: AnalysisResult & { confidence?: number };
  try {
    parsed = JSON.parse(cleaned) as AnalysisResult & { confidence?: number };
  } catch {
    throw new Error(
      "AI returned invalid JSON. Please try again with a clearer document image.",
    );
  }

  if (typeof parsed.confidence !== "number") parsed.confidence = 50;
  parsed.confidence = Math.max(0, Math.min(100, parsed.confidence));
  return parsed as AnalysisResult;
}
