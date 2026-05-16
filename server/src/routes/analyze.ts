import { Router } from "express";
import multer from "multer";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "../constants.js";
import {
  getFirestoreDb,
  isFirebaseAuthRequired,
  verifyIdToken,
} from "../firebaseAdmin.js";
import { normalizeOutputLang } from "../lib/outputLang.js";
import {
  findNicInText,
  validateNic,
  type NicValidationResult,
} from "../lib/nicValidator.js";
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

function readString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

function parseHintYear(value: unknown): number | null {
  const raw = readString(value);
  if (!raw) return null;
  const m = /(19|20)\d{2}/.exec(raw);
  if (!m) return null;
  const year = Number(m[0]);
  return Number.isFinite(year) ? year : null;
}

interface PreValidationFailure {
  status: 400;
  body: {
    success: false;
    error: string;
    preValidation: {
      field: "nic";
      code: string;
      message: string;
      details?: NicValidationResult;
    };
  };
}

/**
 * Deterministic, pre-Gemini gate for documents the user marked as a Sri Lankan NIC.
 * Returns a 400-style failure object if the NIC fails the formatting rules, or null
 * when the request can proceed to Gemini.
 */
function runNicPreValidation(opts: {
  documentHint: string;
  nicNumber: string;
  filename: string;
  hintYear: number | null;
}): PreValidationFailure | null {
  const isNicIntent = opts.documentHint.toLowerCase() === "nic";
  if (!isNicIntent && !opts.nicNumber) return null;

  // Choose the candidate NIC string in priority order: explicit field → filename match.
  let candidate = opts.nicNumber;
  if (!candidate && opts.filename) {
    candidate = findNicInText(opts.filename) ?? "";
  }

  if (isNicIntent && !candidate) {
    return {
      status: 400,
      body: {
        success: false,
        error:
          "This file is marked as a Sri Lankan NIC but no NIC number was provided. Enter the NIC number to enable fast pre-validation, or change the document type.",
        preValidation: {
          field: "nic",
          code: "nic/missing",
          message:
            "Provide the NIC number in the form, or include it in the filename so we can validate locally before calling the AI.",
        },
      },
    };
  }

  if (!candidate) return null;

  const validation = validateNic(candidate);
  if (!validation.valid) {
    return {
      status: 400,
      body: {
        success: false,
        error: validation.error ?? "Invalid Sri Lankan NIC format.",
        preValidation: {
          field: "nic",
          code: "nic/format",
          message: validation.error ?? "Invalid Sri Lankan NIC format.",
          details: validation,
        },
      },
    };
  }

  // Check for a hard year conflict against any explicit hint (e.g. filename year).
  if (
    opts.hintYear != null &&
    validation.birthYear != null &&
    Math.abs(validation.birthYear - opts.hintYear) > 0
  ) {
    return {
      status: 400,
      body: {
        success: false,
        error: `NIC encodes birth year ${validation.birthYear}, which conflicts with the year ${opts.hintYear} on this submission.`,
        preValidation: {
          field: "nic",
          code: "nic/year-conflict",
          message: `NIC encodes birth year ${validation.birthYear}, which conflicts with year ${opts.hintYear}.`,
          details: validation,
        },
      },
    };
  }

  return null;
}

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

    // ── Deterministic pre-validation (NIC) ────────────────────────────────────
    const documentHint = readString(req.body?.documentHint);
    const nicNumber = readString(req.body?.nicNumber);
    const hintYear =
      parseHintYear(req.body?.hintYear) ?? parseHintYear(req.file.originalname);

    const preFailure = runNicPreValidation({
      documentHint,
      nicNumber,
      filename: req.file.originalname ?? "",
      hintYear,
    });
    if (preFailure) {
      console.info("[/api/analyze] short-circuited by NIC pre-validator", {
        code: preFailure.body.preValidation.code,
        nicMasked: nicNumber ? `${nicNumber.slice(0, 2)}…${nicNumber.slice(-2)}` : null,
        filename: req.file.originalname,
      });
      return res.status(preFailure.status).json(preFailure.body);
    }

    // ── Gemini analysis ───────────────────────────────────────────────────────
    const outputLang = normalizeOutputLang(
      req.body?.outputLang ?? req.headers["x-output-lang"],
    );
    const fileBase64 = req.file.buffer.toString("base64");
    const analysisResult = await analyzeDocument(
      fileBase64,
      req.file.mimetype,
      outputLang,
    );

    // If the user explicitly tagged this as an NIC and gave a number, attach the
    // validator output as ground-truth metadata on extracted_data so the UI can
    // show the deterministic year/gender alongside the AI extraction.
    if (nicNumber) {
      const v = validateNic(nicNumber);
      if (v.valid) {
        const merged: Record<string, string | undefined> = {
          ...(analysisResult.extracted_data ?? {}),
          document_id:
            (analysisResult.extracted_data?.document_id?.trim?.() ?? "") ||
            v.normalized,
        };
        if (v.kind) merged.nic_kind = v.kind;
        if (v.birthYear != null) merged.nic_birth_year = String(v.birthYear);
        if (v.gender) merged.nic_gender = v.gender;
        analysisResult.extracted_data = merged;
      }
    }

    const db = getFirestoreDb();
    if (db) {
      try {
        await db.collection("fraud_telemetry").add({
          document_type: analysisResult.document_type,
          risk_level: analysisResult.risk_level,
          risk_score: analysisResult.risk_score,
          red_flag_count: analysisResult.red_flags.length,
          tamper_box_count: analysisResult.tamper_coordinates?.length ?? 0,
          had_extraction: Boolean(analysisResult.extracted_data),
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
