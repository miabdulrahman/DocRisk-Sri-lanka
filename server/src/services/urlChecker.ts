import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult, RiskLevel } from "../../../client/src/types.js";

const URL_CHECK_MODEL = "gemini-1.5-flash";

const URL_EXPERT_SYSTEM = `You are a cybersecurity expert specializing in online scams in Sri Lanka.

When given a URL, analyze it for signs of fraud, phishing, or scam activity.

Check for:
- Domain looks similar to but is NOT a real Sri Lankan bank, government, or company website
- URL contains suspicious parameters (token=, verify=, claim=, prize=, reward=)
- URL uses HTTP instead of HTTPS
- Domain was recently registered (common in scams)
- URL requests personal information, OTP, or banking details
- URL promises prizes, lottery wins, visa approval, or job offers
- Shortened URL services hiding the real destination (bit.ly, tinyurl, etc.)
- Impersonates known Sri Lankan institutions (BOC, People's Bank, Dialog, SLT, government portals)

Output ONLY valid JSON matching exactly:
{
  "document_type": "other",
  "risk_score": <integer 0-100>,
  "risk_level": "low" | "medium" | "high",
  "summary": "<one sentence in plain English describing what this link likely is>",
  "red_flags": [<array of strings listing specific problems found>],
  "explanation": "<short paragraph explaining the risks>",
  "recommended_action": "<clear advice for a non-technical Sri Lankan person>"
}`;

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function sanitizeRiskLevel(v: unknown): RiskLevel {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function parseUrlJsonToAnalysisResult(cleaned: string): AnalysisResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_JSON");
  }

  const risk_score =
    typeof parsed.risk_score === "number" && Number.isFinite(parsed.risk_score)
      ? Math.max(0, Math.min(100, Math.round(parsed.risk_score)))
      : 40;

  const red_flags = Array.isArray(parsed.red_flags)
    ? parsed.red_flags.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
    : [];

  const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 75;

  return {
    document_type: "other",
    risk_score,
    confidence,
    risk_level: sanitizeRiskLevel(parsed.risk_level),
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    red_flags,
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
    recommended_action: typeof parsed.recommended_action === "string" ? parsed.recommended_action : "",
    tamper_coordinates: undefined,
    extracted_data: undefined,
  };
}

async function generateUrlAnalysis(url: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Server is missing GEMINI_API_KEY. Check server/.env");
  }

  const userPrompt = `Analyze this URL for signs of fraud, phishing, or scam activity: ${url}

Return ONLY the JSON object specified in your instructions.`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: URL_CHECK_MODEL,
    contents: [{ text: userPrompt }],
    config: {
      systemInstruction: URL_EXPERT_SYSTEM,
      temperature: 0.0,
      maxOutputTokens: 600,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  return stripJsonFences(text);
}

/**
 * URL-only Gemini check (no vision). Uses gemini-1.5-flash with a Sri Lanka–focused prompt.
 * Parses JSON with the same fence-stripping and retry-once pattern as `gemini.ts` analysis.
 */
export async function checkUrl(url: string): Promise<AnalysisResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("That does not look like a valid web link.");
  }
  if (!/^https?:$/i.test(parsedUrl.protocol)) {
    throw new Error("Only http or https links can be checked.");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generateUrlAnalysis(url);
      if (!raw) {
        lastErr = new Error("empty response");
        continue;
      }
      try {
        return parseUrlJsonToAnalysisResult(raw);
      } catch (e) {
        if (e instanceof Error && e.message === "INVALID_JSON") {
          lastErr = e;
          continue;
        }
        throw e;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.warn("[checkUrl] failed after retry:", msg);

  if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
    throw new Error(
      `Gemini model "${URL_CHECK_MODEL}" is not available for this API key. Confirm the model name in Google AI Studio.`,
    );
  }

  throw new Error("We could not analyze this link. Please try again.");
}
