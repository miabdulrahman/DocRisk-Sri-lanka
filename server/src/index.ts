import "./loadEnv.js";
import express, { type Request, type Response } from "express";
import cors from "cors";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { registerAdminRoutes } from "./routes/admin.js";
import analyzeRouter from "./routes/analyze.js";
import { initFirebaseAdmin, isFirebaseAuthRequired } from "./firebaseAdmin.js";

const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/mp3", "audio/x-wav", "audio/wave"]);
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid audio type. Upload MP3 or WAV files only."));
    }
  },
});

const app = express();
const port = process.env.PORT || 4000;
const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "Warning: GEMINI_API_KEY is not set. Copy server/.env.example to server/.env and add your key.",
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
  }),
);

function buildExpertTranscript(
  history: Array<{ role?: string; parts?: Array<{ text?: string }> }>,
  latestMessage: string,
): string {
  const turns = Array.isArray(history) ? history : [];
  const lines: string[] = [];
  for (const turn of turns.slice(-14)) {
    const roleLabel = turn.role === "model" ? "Expert" : "User";
    const txt = (turn.parts ?? []).map((p) => String(p.text ?? "").trim()).filter(Boolean).join("\n");
    if (!txt) continue;
    lines.push(`${roleLabel}: ${txt}`);
  }
  lines.push(`User: ${latestMessage.trim()}`);
  return lines.join("\n\n");
}

app.get("/", (_req: Request, res: Response) => {
  res.json({
    service: "DocRisk API",
    message: "This is the backend API only. Open the web app at http://localhost:5173 (run npm run dev in client/).",
    health: "/api/health",
  });
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    geminiModel,
    firebaseAuth: isFirebaseAuthRequired(),
  });
});

app.use("/api/analyze", analyzeRouter);
registerAdminRoutes(app);

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const AUDIO_FORENSIC_SYSTEM_INSTRUCTION = `You are an expert forensic audio analyst specializing in detecting voice deepfakes, audio splicing, replay attacks, and synthetic speech for Sri Lankan voice fraud cases.

Carefully scan the supplied audio for:
- Sudden cuts, jumps, or unnatural shifts in the background ambient noise floor (a classic splicing signature).
- Synthetic speech or voice cloning artifacts: unnatural formants, smoothed-out micro-prosody, inconsistent breathing/lip noise, robotic over-articulation.
- Robotic, machine-like, or unnaturally consistent cadence when the speaker pronounces local Sri Lankan words, Sinhala/Tamil names, place names, or recites identification numbers (NIC, phone, bank account).
- Acoustic signatures of replay attacks: double-recording reverb, codec stacking, narrow-band telephony filtering layered over studio audio, loudspeaker resonance, room echo on top of a "clean" capture.
- Pitch/energy discontinuities, sample-rate or compression boundary artifacts, and inconsistent SNR across segments.

Score the authenticity from 0 (almost certainly altered/synthetic) to 100 (clean, natural, consistent). Use these verdict bands:
- >= 80: "Authentic"
- 50 - 79: "Suspicious"
- < 50: "Altered"

Reference suspected events with approximate timestamps (mm:ss) where possible. Be specific and forensic — avoid generic statements. Do NOT fabricate findings; if the audio is clean, return an empty anomalies list.

Respond ONLY with a single JSON object that strictly matches this schema (no markdown, no commentary, no code fences):
{
  "authenticity_score": <number 0-100>,
  "verdict": "Authentic" | "Suspicious" | "Altered",
  "detected_anomalies": [<string>, ...],
  "summary": <string>,
  "technical_explanation": <string>
}`;

app.post(
  "/api/analyze-audio",
  (req: Request, res: Response, next) => {
    audioUpload.single("audio")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "Audio file must be 10 MB or smaller." });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        return res.status(500).json({ success: false, error: "Server is missing GEMINI_API_KEY." });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No audio file uploaded under field 'audio'." });
      }

      if (!AUDIO_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: "Invalid audio type. Upload MP3 or WAV files only.",
        });
      }

      const normalizedMime = req.file.mimetype === "audio/mp3" ? "audio/mpeg" : req.file.mimetype;
      const audioBase64 = req.file.buffer.toString("base64");
      const ai = new GoogleGenAI({ apiKey });

      let response;
      try {
        response = await ai.models.generateContent({
          model: geminiModel,
          contents: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: normalizedMime,
              },
            },
            {
              text: "Perform a forensic acoustic analysis of this audio clip and return ONLY the JSON object defined by the schema.",
            },
          ],
          config: {
            systemInstruction: AUDIO_FORENSIC_SYSTEM_INSTRUCTION,
            temperature: 0.2,
            maxOutputTokens: 900,
            responseMimeType: "application/json",
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          return res.status(500).json({
            success: false,
            error: `Configured Gemini model "${geminiModel}" is not available for this API key.`,
          });
        }
        throw err;
      }

      const raw = (response.text ?? "").trim();
      const cleaned = stripJsonFences(raw);

      if (!cleaned) {
        return res.status(502).json({ success: false, error: "AI returned an empty response. Please try again." });
      }

      let parsed: {
        authenticity_score?: unknown;
        verdict?: unknown;
        detected_anomalies?: unknown;
        summary?: unknown;
        technical_explanation?: unknown;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("[/api/analyze-audio] failed to parse model JSON:", cleaned);
        return res.status(502).json({
          success: false,
          error: "AI returned an unparsable response. Please try again.",
        });
      }

      const scoreNum = Number(parsed.authenticity_score);
      const authenticity_score = Number.isFinite(scoreNum)
        ? Math.min(100, Math.max(0, Math.round(scoreNum * 10) / 10))
        : 0;

      const verdictRaw = typeof parsed.verdict === "string" ? parsed.verdict : "";
      const allowedVerdicts = ["Authentic", "Suspicious", "Altered"] as const;
      type Verdict = (typeof allowedVerdicts)[number];
      const verdict: Verdict = (allowedVerdicts.find(
        (v) => v.toLowerCase() === verdictRaw.toLowerCase(),
      ) ??
        (authenticity_score >= 80
          ? "Authentic"
          : authenticity_score >= 50
            ? "Suspicious"
            : "Altered")) as Verdict;

      const detected_anomalies = Array.isArray(parsed.detected_anomalies)
        ? parsed.detected_anomalies
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
        : [];

      const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      const technical_explanation =
        typeof parsed.technical_explanation === "string" ? parsed.technical_explanation.trim() : "";

      return res.json({
        success: true,
        analysis: {
          authenticity_score,
          verdict,
          detected_anomalies,
          summary,
          technical_explanation,
        },
      });
    } catch (error) {
      console.error("[/api/analyze-audio] request failed", error);
      const message = error instanceof Error ? error.message : "Internal Server Error";
      return res.status(500).json({ success: false, error: message });
    }
  },
);

app.post("/api/chat-with-expert", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Server is missing GEMINI_API_KEY." });
    }

    const { scamTitle, scamExplanation, message, history } = req.body as {
      scamTitle?: string;
      scamExplanation?: string;
      message?: string;
      history?: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
    };

    if (!message?.trim() || !scamTitle) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: scamTitle and message.",
      });
    }

    const systemInstruction = `You are an expert Sri Lankan cybersecurity risk analyst at DocRisk. The user is asking about the following specific scam currently active in Sri Lanka:

Title: ${scamTitle}
Details: ${scamExplanation ?? "No additional details provided."}

Provide concise, professional advice focused on preventing financial loss and understanding the local context. Do not provide legal advice, but guide users to proper Sri Lankan authorities (such as the CID Cybercrime Division, SLCERT at info@cert.gov.lk, the Securities and Exchange Commission, or the SLBFE) when relevant. Keep responses brief and actionable. If the user writes in Sinhala or Tamil, reply in that language. Do not fabricate statistics or news — only rely on the scam details provided above.`;

    const transcript = buildExpertTranscript(history ?? [], message.trim());
    const ai = new GoogleGenAI({ apiKey });

    let result;
    try {
      result = await ai.models.generateContent({
        model: geminiModel,
        contents: [
          {
            text: transcript,
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.65,
          maxOutputTokens: 450,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("404") || msg.includes("not found")) {
        return res.status(500).json({
          success: false,
          error: `Configured Gemini model "${geminiModel}" was not found. Update GEMINI_MODEL in server/.env.`,
        });
      }
      throw error;
    }

    const reply = (result.text ?? "").trim();

    if (!reply) {
      return res.status(500).json({ success: false, error: "AI returned an empty response. Please try again." });
    }

    return res.json({ success: true, reply });
  } catch (error) {
    console.error("Chat Expert Error:", error);
    const messageText =
      error instanceof Error ? error.message : "Internal Server Error";
    return res.status(500).json({ success: false, error: messageText });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Gemini model: ${geminiModel}`);
});
