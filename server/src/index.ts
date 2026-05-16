import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "./constants.js";
import {
  initFirebaseAdmin,
  isFirebaseAuthRequired,
  verifyIdToken,
} from "./firebaseAdmin.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "Warning: GEMINI_API_KEY is not set. Copy server/.env.example to server/.env and add your key."
  );
}

initFirebaseAdmin();

app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests. Please try again later." },
  })
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function analyzeDocument(fileBase64: string, mimeType: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Server is missing GEMINI_API_KEY. Check server/.env");
  }

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
  const cleaned = stripJsonFences(text);

  if (!cleaned) {
    throw new Error("AI returned an empty response. Please try again.");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "AI returned invalid JSON. Please try again with a clearer document image."
    );
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Upload PDF, JPG, JPEG, or PNG only."));
    }
  },
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    firebaseAuth: isFirebaseAuthRequired(),
  });
});

app.post("/api/analyze", upload.single("document"), async (req, res) => {
  try {
    if (isFirebaseAuthRequired()) {
      const decoded = await verifyIdToken(req.headers.authorization);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          error: "Authentication required. Sign in and try again.",
        });
      }
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: "Invalid file type. Upload PDF, JPG, JPEG, or PNG only.",
      });
    }

    const fileBase64 = req.file.buffer.toString("base64");
    const analysisResult = await analyzeDocument(fileBase64, req.file.mimetype);

    return res.json({
      success: true,
      result: analysisResult,
    });
  } catch (error: unknown) {
    console.error("Backend Error:", error);

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File must be 10 MB or smaller.",
        });
      }
    }

    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    const status = message.includes("Invalid file type") ? 400 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
