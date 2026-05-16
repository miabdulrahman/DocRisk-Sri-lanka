import "./loadEnv.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerAdminRoutes } from "./routes/admin.js";
import analyzeRouter from "./routes/analyze.js";
import { initFirebaseAdmin, isFirebaseAuthRequired } from "./firebaseAdmin.js";

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    firebaseAuth: isFirebaseAuthRequired(),
  });
});

app.use("/api/analyze", analyzeRouter);
registerAdminRoutes(app);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
