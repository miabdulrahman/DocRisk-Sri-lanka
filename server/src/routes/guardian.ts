import { Router, type Request, type Response } from "express";
import { FieldValue, type DocumentData, type Timestamp } from "firebase-admin/firestore";
import type { AnalysisResult } from "../../../client/src/types.js";
import { ALLOWED_MIME_TYPES } from "../constants.js";
import { getFirestoreDb, verifyIdToken } from "../firebaseAdmin.js";
import {
  getCircleContact,
  readString,
  resolveMemberByToken,
} from "../lib/guardianMember.js";
import { analyzeDocument } from "../services/gemini.js";
import { checkUrl } from "../services/urlChecker.js";

const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const router = Router();

type RiskLevel = "low" | "medium" | "high";

function tsToIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toDate" in v && typeof (v as Timestamp).toDate === "function") {
    return (v as Timestamp).toDate().toISOString();
  }
  return null;
}

function mapCheckRow(id: string, data: DocumentData) {
  const type = data.type === "document" ? "document" : "link";
  const rawInput = typeof data.input === "string" ? data.input : "";
  let inputPreview = "";
  if (type === "link") {
    const u = rawInput.trim();
    inputPreview = u.length > 40 ? `${u.slice(0, 40)}…` : u || "—";
  } else {
    inputPreview = "Document image";
  }

  const result = data.result as AnalysisResult | undefined;
  const riskLevel =
    (data.riskLevel as RiskLevel | undefined) ?? result?.risk_level ?? null;
  const riskScore =
    typeof data.riskScore === "number" ? data.riskScore : (result?.risk_score ?? null);

  return {
    id,
    memberName: String(data.memberName ?? ""),
    type,
    inputPreview,
    riskLevel,
    riskScore,
    status: String(data.status ?? ""),
    createdAt: tsToIso(data.createdAt) ?? new Date().toISOString(),
    completedAt: tsToIso(data.completedAt),
  };
}

/** GET /api/guardian/history — paginated check history for the signed-in guardian. */
router.get("/guardian/history", async (req: Request, res: Response) => {
  try {
    const decoded = await verifyIdToken(req.headers.authorization);
    if (!decoded) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    const db = getFirestoreDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: "Firestore is not configured on the server.",
      });
    }

    const uid = decoded.uid;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const memberName =
      typeof req.query.memberName === "string" && req.query.memberName.trim()
        ? req.query.memberName.trim()
        : "";
    const riskFilterRaw = typeof req.query.riskLevel === "string" ? req.query.riskLevel.trim() : "";
    const riskFilter: RiskLevel | "" =
      riskFilterRaw === "low" || riskFilterRaw === "medium" || riskFilterRaw === "high"
        ? riskFilterRaw
        : "";

    let baseQuery = db.collection("check_requests").where("guardianId", "==", uid);
    if (memberName) {
      baseQuery = baseQuery.where("memberName", "==", memberName);
    }
    if (riskFilter) {
      baseQuery = baseQuery.where("riskLevel", "==", riskFilter);
    }

    const countSnap = await baseQuery.count().get();
    const total = countSnap.data().count;

    let q = baseQuery.orderBy("createdAt", "desc");
    const skip = (page - 1) * pageSize;
    if (skip > 0) {
      q = q.offset(skip);
    }
    const snap = await q.limit(pageSize).get();
    const items = snap.docs.map((d) => mapCheckRow(d.id, d.data()));

    const circleRef = db.collection("circles").doc(uid).collection("members");
    const [membersByChecksSnap, highSnap, medSnap, lowSnap] = await Promise.all([
      circleRef.orderBy("totalChecks", "desc").limit(1).get(),
      db
        .collection("check_requests")
        .where("guardianId", "==", uid)
        .where("riskLevel", "==", "high")
        .count()
        .get(),
      db
        .collection("check_requests")
        .where("guardianId", "==", uid)
        .where("riskLevel", "==", "medium")
        .count()
        .get(),
      db
        .collection("check_requests")
        .where("guardianId", "==", uid)
        .where("riskLevel", "==", "low")
        .count()
        .get(),
    ]);

    let mostActiveMemberName: string | null = null;
    const top = membersByChecksSnap.docs[0];
    if (top) {
      const md = top.data();
      const tc = typeof md.totalChecks === "number" ? md.totalChecks : 0;
      if (tc > 0) {
        mostActiveMemberName = String(md.name ?? "") || null;
      }
    }

    const totalAllSnap = await db
      .collection("check_requests")
      .where("guardianId", "==", uid)
      .count()
      .get();

    return res.json({
      success: true,
      page,
      pageSize,
      total,
      totalFamilyChecks: totalAllSnap.data().count,
      items,
      stats: {
        high: highSnap.data().count,
        medium: medSnap.data().count,
        safe: lowSnap.data().count,
        mostActiveMemberName,
      },
    });
  } catch (e) {
    console.error("[GET /api/guardian/history]", e);
    return res.status(500).json({ success: false, error: "Could not load history." });
  }
});

router.get("/guardian/member-context", async (req: Request, res: Response) => {
  try {
    const dbOk = getFirestoreDb();
    if (!dbOk) {
      return res.status(503).json({
        success: false,
        error: "Server cannot reach Firestore. Check Firebase Admin configuration.",
      });
    }

    const token = readString(req.query.token);
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing token." });
    }

    const resolved = await resolveMemberByToken(token);
    if (!resolved) {
      return res.status(404).json({ success: false, error: "Not found." });
    }

    const { guardianName, guardianPhone } = await getCircleContact(resolved.guardianId);

    return res.json({
      success: true,
      guardianId: resolved.guardianId,
      memberId: resolved.memberId,
      memberName: resolved.memberName,
      guardianName,
      guardianPhone,
    });
  } catch (e) {
    console.error("[GET /api/guardian/member-context]", e);
    return res.status(500).json({
      success: false,
      error: "Could not verify this link. Please try again.",
    });
  }
});

router.post("/guardian/check", async (req: Request, res: Response) => {
  const db = getFirestoreDb();
  if (!db) {
    return res.status(503).json({
      success: false,
      error: "Server cannot reach Firestore. Check Firebase Admin configuration.",
      guardianName: "your family member",
      guardianPhone: null,
    });
  }

  const body = req.body as {
    memberToken?: unknown;
    type?: unknown;
    input?: unknown;
    mimeType?: unknown;
  };

  const memberToken = readString(body.memberToken);
  const type = readString(body.type) as "link" | "document";
  const input = readString(body.input);
  const mimeTypeRaw = body.mimeType == null ? "" : readString(body.mimeType);

  if (!memberToken || (type !== "link" && type !== "document") || !input) {
    const resolvedEarly = memberToken ? await resolveMemberByToken(memberToken) : null;
    const contactEarly = resolvedEarly
      ? await getCircleContact(resolvedEarly.guardianId)
      : { guardianName: "your family member", guardianPhone: null as string | null };
    return res.status(400).json({
      success: false,
      error: "Missing information. Go back and try again.",
      guardianName: contactEarly.guardianName,
      guardianPhone: contactEarly.guardianPhone,
    });
  }

  const resolved = await resolveMemberByToken(memberToken);
  if (!resolved) {
    return res.status(401).json({ error: "Invalid member token" });
  }

  const { guardianName, guardianPhone } = await getCircleContact(resolved.guardianId);

  if (type === "document") {
    const mime = mimeTypeRaw || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.has(mime) && !IMAGE_MIMES.has(mime)) {
      return res.status(400).json({
        success: false,
        error: "Please use a photo (JPG or PNG) or PDF.",
        guardianName,
        guardianPhone,
      });
    }
    if (!IMAGE_MIMES.has(mime) && mime !== "application/pdf" && !mime.includes("wordprocessingml")) {
      return res.status(400).json({
        success: false,
        error: "For photos, use JPG or PNG.",
        guardianName,
        guardianPhone,
      });
    }
  }

  const checkRef = db.collection("check_requests").doc();
  const requestId = checkRef.id;
  const createdAt = FieldValue.serverTimestamp();

  await checkRef.set({
    memberToken,
    guardianId: resolved.guardianId,
    memberName: resolved.memberName,
    type: type === "link" ? "link" : "document",
    input: type === "link" ? input : "[binary omitted]",
    mimeType: type === "document" ? mimeTypeRaw || null : null,
    status: "analyzing",
    result: null,
    createdAt,
    completedAt: null,
    guardianNotified: false,
  });

  let result: AnalysisResult;
  try {
    if (type === "link") {
      result = await checkUrl(input);
    } else {
      const mime = mimeTypeRaw || "image/jpeg";
      result = await analyzeDocument(input, mime, "english");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    console.error("[POST /api/guardian/check] analysis error", e);
    await checkRef.set(
      {
        status: "error",
        completedAt: FieldValue.serverTimestamp(),
        error: msg,
        guardianNotified: false,
      },
      { merge: true },
    );
    return res.status(500).json({
      success: false,
      error: "Something went wrong.",
      guardianName,
      guardianPhone,
    });
  }

  const doneAt = FieldValue.serverTimestamp();

  await checkRef.set(
    {
      status: "done",
      result,
      completedAt: doneAt,
      guardianNotified: true,
      riskLevel: result.risk_level,
      riskScore: result.risk_score,
    },
    { merge: true },
  );

  await resolved.memberRef.set(
    {
      totalChecks: FieldValue.increment(1),
      lastCheckAt: doneAt,
    },
    { merge: true },
  );

  const notifRef = db.collection("notifications").doc(resolved.guardianId).collection("items").doc();

  await notifRef.set({
    type: "check_completed",
    memberName: resolved.memberName,
    checkType: type === "link" ? "link" : "document",
    riskLevel: result.risk_level ?? null,
    requestId,
    read: false,
    createdAt: doneAt,
  });

  return res.json({
    success: true,
    result,
    memberName: resolved.memberName,
    guardianName,
    guardianPhone,
  });
});

export default router;
