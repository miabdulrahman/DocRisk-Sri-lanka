import type { Express, Request, Response } from "express";
import { getFirestoreDb, isUserAdmin, verifyIdToken } from "../firebaseAdmin.js";

type RiskLevel = "low" | "medium" | "high";

async function adminStatsHandler(req: Request, res: Response) {
  try {
    const decoded = await verifyIdToken(req.headers.authorization);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: "Authentication required.",
      });
    }

    if (!(await isUserAdmin(decoded.uid))) {
      return res.status(403).json({
        success: false,
        error: "Admin access required.",
      });
    }

    const db = getFirestoreDb();
    if (!db) {
      return res.status(503).json({
        success: false,
        error: "Firestore is not configured on the server.",
      });
    }

    const snapshot = await db
      .collection("fraud_telemetry")
      .orderBy("timestamp", "desc")
      .limit(500)
      .get();

    const riskBreakdown: Record<RiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };
    const docTypeBreakdown: Record<string, number> = {};
    let riskScoreSum = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const level = data.risk_level as RiskLevel;
      if (level === "low" || level === "medium" || level === "high") {
        riskBreakdown[level] += 1;
      }

      const docType =
        typeof data.document_type === "string" ? data.document_type : "other";
      docTypeBreakdown[docType] = (docTypeBreakdown[docType] ?? 0) + 1;

      if (typeof data.risk_score === "number") {
        riskScoreSum += data.risk_score;
      }
    }

    const totalAnalyses = snapshot.size;
    const avgRiskScore =
      totalAnalyses > 0 ? Math.round((riskScoreSum / totalAnalyses) * 10) / 10 : 0;

    return res.json({
      success: true,
      totalAnalyses,
      riskBreakdown,
      docTypeBreakdown,
      avgRiskScore,
    });
  } catch (error: unknown) {
    console.error("Admin stats error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load admin stats.";
    return res.status(500).json({ success: false, error: message });
  }
}

export function registerAdminRoutes(app: Express) {
  app.get("/api/admin/stats", adminStatsHandler);
}
