/**
 * Root entry point used by Render (start command: node server.js).
 * Delegates to the TypeScript server via tsx inside the server/ subdirectory.
 */
const { spawn } = require('child_process');
const path = require('path');

const serverDir = path.join(__dirname, 'server');
const tsx = path.join(serverDir, 'node_modules', '.bin', 'tsx');

app.get("/", (_, res) => {
  res.json({
    service: "DocRisk Voice Verification API",
    version: "1.0.0",
    endpoints: {
      health: "GET /health",
      verify: "POST /api/voice/verify"
    }
  });
});

const proc = spawn(tsx, ['src/index.ts'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: { ...process.env },
});

proc.on('close', (code) => process.exit(code ?? 1));
proc.on('error', (err) => {
  console.error('[server.js] Failed to start server process:', err.message);
  process.exit(1);
});
