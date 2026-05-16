import "../loadEnv.js";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import type { AnalysisResult, ExtractedData, TamperBox } from "../../../client/src/types.js";
import { normalizeOutputLang } from "../lib/outputLang.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";
const temperature = 0;
const maxOutputTokens = 4096;

const SYSTEM_PROMPT = `You are a forensic document fraud analyst specialized in Sri Lanka.
You receive a document (image or PDF) that may contain Sinhala, Tamil, or English text and/or official seals.
Analyze the document for authenticity and signs of fraud, AND extract structured fields when the document
is a Sri Lankan identity-style document (NIC, passport, driving license, certificate, etc.).

CRITICAL: Output ONLY valid JSON with exactly these keys — no extra text, no markdown, no explanation outside the JSON:

{
  "document_type": one of "job_offer" | "land_deed" | "visa_letter" | "certificate" | "bank_notice" | "nic" | "other",
  "risk_score": integer from 0 to 100,
  "confidence": integer 0-100 (100 = fully certain, 0 = cannot determine). Set confidence below 60 if document is blurry, cropped, or partially unreadable. Set above 80 only when seals, full text, and formatting are clearly visible,
  "risk_level": one of "low" | "medium" | "high",
  "summary": a brief one-sentence summary of your finding,
  "extracted_data": {
    "full_name": legible full name or empty string if not present/illegible,
    "document_id": ID number / NIC / passport number / certificate number, or empty string,
    "date_of_birth": DOB in DD/MM/YYYY when present, otherwise empty string
  },
  "tamper_coordinates": [
    {
      "field_name": short label (e.g. "Date of Birth", "Photo", "Signature"),
      "box_2d": [ymin, xmin, ymax, xmax],
      "reason": one-sentence forensic explanation of the editing artifacts in that region
    }
  ],
  "red_flags": an array of specific issues found (strings); use an empty array [] if none,
  "explanation": a short paragraph explaining the red_flags in context,
  "recommended_action": clear advice for the user on what to do next
}

VISUAL TAMPER COORDINATES — STRICT RULES:
- box_2d values MUST be normalized integers on a 0..1000 scale that represents the boundaries of the
  tampered field on the supplied image. 0 is the top/left edge, 1000 is the bottom/right edge.
- Order is exactly [ymin, xmin, ymax, xmax]. ymin < ymax, xmin < xmax, all between 0 and 1000.
- Only emit a box when you are reasonably confident the region was edited (font mismatch, splice line,
  cloning artifacts, JPEG ghost, mismatched lighting, misaligned baseline, etc.). When you cannot see
  any tampering, return an empty array [].
- Do NOT emit boxes for non-image inputs (text, DOCX). For non-image inputs return [].

EXTRACTION RULES:
- Only fill extracted_data with text you can actually read on the document. Never invent values.
- If the document is not an identity/credential document, return all extracted_data fields as empty strings.

When assessing risk, check for:
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
If you cannot determine a field, use a reasonable default (e.g., "other" for document_type, 0 for risk_score, 50 for confidence, [] for red_flags, [] for tamper_coordinates, "" for extracted_data fields).
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

function clampBoxScale(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1000, Math.round(n)));
}

function sanitizeTamperCoordinates(raw: unknown): TamperBox[] {
  if (!Array.isArray(raw)) return [];
  const out: TamperBox[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const box = Array.isArray(r.box_2d) ? r.box_2d : null;
    if (!box || box.length !== 4) continue;
    const ymin = clampBoxScale(box[0]);
    const xmin = clampBoxScale(box[1]);
    const ymax = clampBoxScale(box[2]);
    const xmax = clampBoxScale(box[3]);
    if (ymin == null || xmin == null || ymax == null || xmax == null) continue;
    if (ymax <= ymin || xmax <= xmin) continue;
    const fieldName =
      typeof r.field_name === "string" && r.field_name.trim()
        ? r.field_name.trim()
        : "Suspicious region";
    const reason =
      typeof r.reason === "string" && r.reason.trim()
        ? r.reason.trim()
        : "Possible tampering detected.";
    out.push({
      field_name: fieldName,
      box_2d: [ymin, xmin, ymax, xmax],
      reason,
    });
  }
  return out;
}

function sanitizeExtractedData(raw: unknown): ExtractedData {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: ExtractedData = {};
  for (const [key, value] of Object.entries(r)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
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
  const langInstruction = `OUTPUT LANGUAGE (required): Write "summary", "explanation", "recommended_action", and every string in "red_flags" entirely in ${langName}. Use natural ${langName} — not English. Keep JSON keys in English only. Keep "extracted_data" values verbatim from the document (do not translate names or IDs). Keep "tamper_coordinates[].field_name" short and English (or the document's native script if more natural).`;

  const modelName = resolveModelName();
  const ai = new GoogleGenAI({ apiKey });

  let documentContent: any;

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const fileBuffer = Buffer.from(fileBase64, "base64");
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    const extractedText = result.value;
    documentContent = { text: `Document text:\n${extractedText}` };
  } else {
    documentContent = {
      inlineData: {
        data: fileBase64,
        mimeType,
      },
    };
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model: modelName,
      contents: [
        documentContent,
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
  console.log("Raw Gemini response:", text);
  console.log("Cleaned Gemini response:", cleaned);

  if (!cleaned) {
    throw new Error("AI returned an empty response. Please try again.");
  }

  let parsed: AnalysisResult & {
    confidence?: number;
    extracted_data?: unknown;
    tamper_coordinates?: unknown;
  };
  try {
    parsed = JSON.parse(cleaned) as AnalysisResult & {
      confidence?: number;
      extracted_data?: unknown;
      tamper_coordinates?: unknown;
    };
  } catch {
    throw new Error(
      "AI returned invalid JSON. Please try again with a clearer document image.",
    );
  }

  if (typeof parsed.confidence !== "number") parsed.confidence = 50;
  parsed.confidence = Math.max(0, Math.min(100, parsed.confidence));

  const cleanedExtracted = sanitizeExtractedData(parsed.extracted_data);
  const cleanedTampers = mimeType.startsWith("image/")
    ? sanitizeTamperCoordinates(parsed.tamper_coordinates)
    : [];

  const result: AnalysisResult = {
    document_type: parsed.document_type ?? "other",
    risk_score: parsed.risk_score ?? 0,
    confidence: parsed.confidence,
    risk_level: parsed.risk_level ?? "medium",
    summary: parsed.summary ?? "",
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
    explanation: parsed.explanation ?? "",
    recommended_action: parsed.recommended_action ?? "",
    extracted_data: Object.keys(cleanedExtracted).length ? cleanedExtracted : undefined,
    tamper_coordinates: cleanedTampers.length ? cleanedTampers : undefined,
  };

  return result;
}
