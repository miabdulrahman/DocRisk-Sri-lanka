import { Router, type Request, type Response } from "express";
import { getOfficialTrendingScams } from "../services/officialScams.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const { scams, sources, cached } = await getOfficialTrendingScams();
    return res.json({
      success: true,
      scams,
      fetchedAt: new Date().toISOString(),
      sources,
      cached,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load official scam advisories.";
    console.error("[/api/trending-scams]", error);
    return res.status(502).json({
      success: false,
      scams: [],
      fetchedAt: new Date().toISOString(),
      sources: [],
      error: message,
    });
  }
});

export default router;
