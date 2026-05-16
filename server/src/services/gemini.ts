import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AnalysisResult } from "../../client/src/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const modelName = "gemini-1.5-flash";
const temperature = 0.0;
const maxOutputTokens = 600;

const SYSTEM_PROMPT = `
You are a highly accurate and strict forensic document fraud analyst, focused on documents issued in Sri Lanka. 
Your objective is to analyze the provided text or data extracted from official documents (like passports, ID cards, and driver's licenses) for any signs of forgery, fraud, or anomalies. 

Instructions:
- Determine the 'documentType' as one of: 'passport', 'id_card', 'driver_license', or 'other'.
- Assess the overall 'riskLevel' as one of: 'low', 'medium', or 'high'.
- List any issues or suspicious findings as an array of short strings in 'issues'.
- Write a brief summary explaining your main reasoning in 'summary'.
- Respond ONLY as valid, compact JSON compatible with this interface (do not use markdown, no code fences, and no additional explanations):

{
  documentType: "passport" | "id_card" | "driver_license" | "other",
  riskLevel: "low" | "medium" | "high",
  issues: string[],
  summary: string
}
`;

function stripMarkdownFences(text: string): string {
  // Removes triple backticks (```json, ``` or ```) and trims whitespace
  return text
    .replace(/^```(?:json)?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

export async function analyzeDocument(documentText: string): Promise<AnalysisResult> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  });

  const prompt = [
    { role: "system", parts: [{ text: SYSTEM_PROMPT.trim() }] },
    { role: "user",   parts: [{ text: documentText }] }
  ];

  const result = await model.generateContent({
    contents: prompt
  });

  let text = result.response.text();
  text = stripMarkdownFences(text);
  let analysisResult: AnalysisResult;
  try {
    analysisResult = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse Gemini output: ${e}\nRaw output: ${text}`);
  }
  return analysisResult;
}