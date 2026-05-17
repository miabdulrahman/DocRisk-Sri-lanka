/**
 * Root entry point used by Render (start command: node server.js).
 * Delegates to the TypeScript server via tsx inside the server/ subdirectory.
 */
const { spawn } = require('child_process');
const path = require('path');

const serverDir = path.join(__dirname, 'server');
const tsx = path.join(serverDir, 'node_modules', '.bin', 'tsx');

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

app.use(cors({
  origin: "https://docrisk-frontend.onrender.com"
}));