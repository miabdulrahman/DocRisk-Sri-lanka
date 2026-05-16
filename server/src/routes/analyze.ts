import { Router } from "express";
import multer from "multer";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "../constants.js";
import {
  getFirestoreDb,
  isFirebaseAuthRequired,
  verifyIdToken,
} from "../firebaseAdmin.js";
import { normalizeOutputLang } from "../lib/outputLang.js";
import { analyzeDocument } from "../services/gemini.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Upload PDF, JPG, JPEG, PNG, or DOCX only."));
    }
  },
});

const router = Router();

router.post("/", upload.single("document"), async (req, res) => {
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
        error: "Invalid file type. Upload PDF, JPG, JPEG, PNG, or DOCX only.",
      });
    }

    const outputLang = normalizeOutputLang(
      req.body?.outputLang ?? req.headers["x-output-lang"],
    );
    const fileBase64 = req.file.buffer.toString("base64");
    const analysisResult = await analyzeDocument(
      fileBase64,
      req.file.mimetype,
      outputLang,
    );

    const db = getFirestoreDb();
    if (db) {
      try {
        await db.collection("fraud_telemetry").add({
          document_type: analysisResult.document_type,
          risk_level: analysisResult.risk_level,
          risk_score: analysisResult.risk_score,
          red_flag_count: analysisResult.red_flags.length,
          timestamp: new Date(),
        });
      } catch (telemetryErr) {
        console.warn("fraud_telemetry write failed:", telemetryErr);
      }
    }

    return res.json({
      success: true,
      result: analysisResult,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";

    console.error("[/api/analyze] request failed", {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              cause: error.cause,
            }
          : error,
      file: req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : null,
      outputLang: req.body?.outputLang ?? req.headers["x-output-lang"],
      authRequired: isFirebaseAuthRequired(),
    });

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File must be 10 MB or smaller.",
        });
      }
    }

    const status = message.includes("Invalid file type") ? 400 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

export default router;
