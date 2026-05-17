/**
 * Vercel catch-all serverless function.
 * Forwards every /api/* request to the shared Express app.
 * The app is imported directly from the server source — Vercel bundles
 * it (and all its node_modules) at deploy time via nft.
 */
import "../server/src/loadEnv.js";
import app from "../server/src/app.js";

export default app;
