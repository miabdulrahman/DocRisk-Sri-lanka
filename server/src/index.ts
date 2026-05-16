import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- GEMINI AI CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are a forensic document fraud analyst specialized in Sri Lanka.
You receive a document (image or PDF) that may contain Sinhala, Tamil, or English text and/or official seals.
Analyze the document for authenticity and signs of fraud.

CRITICAL: Output ONLY valid JSON with exactly these keys — no extra text, no markdown, no explanation outside the JSON:

{
  "document_type": one of "job_offer" | "land_deed" | "visa_letter" | "certificate" | "bank_notice" | "other",
  "risk_score": integer from 0 to 100,
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
If you cannot determine a field, use a reasonable default (e.g., "other" for document_type, 0 for risk_score, [] for red_flags).
Do NOT output anything other than the JSON object.`;

async function analyzeDocument(fileBase64: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: fileBase64, mimeType } },
          { text: SYSTEM_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 600,
    },
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

// --- SERVER UPLOAD ENDPOINT ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file limit
});

app.post("/api/analyze", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    const fileBase64 = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    const analysisResult = await analyzeDocument(fileBase64, mimeType);

    return res.json({
      success: true,
      result: analysisResult,
    });
  } catch (error: any) {
    console.error("Backend Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});