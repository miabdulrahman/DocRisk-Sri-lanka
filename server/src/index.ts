import "./loadEnv.js";
import express, { type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { registerAdminRoutes } from "./routes/admin.js";
import analyzeRouter from "./routes/analyze.js";
import { initFirebaseAdmin, isFirebaseAuthRequired } from "./firebaseAdmin.js";

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
