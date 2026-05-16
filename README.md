# DocRisk Sri Lanka

Document fraud analysis for Sri Lankan paperwork (job offers, deeds, visas, etc.) using Gemini AI.

## Quick start

1. **Backend env** — copy `server/.env.example` to `server/.env` and set `GEMINI_API_KEY`.
2. **Frontend env** — copy `client/.env.example` to `client/.env` (defaults work for local dev).
3. **Install & run both** from the repo root:

```powershell
npm install
npm run dev
```

- API: http://localhost:4000  
- App: http://localhost:5173  

Or run separately:

```powershell
cd server && npm run dev
cd client && npm run dev
```

## Firebase (optional)

1. Create a Firebase project and enable **Google** sign-in under Authentication.
2. Enable **Firestore** and deploy rules from `firestore.rules`.
3. Fill `client/.env` with your web app config (`VITE_FIREBASE_*`).
4. For protected API: set `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in `server/.env`.

Without Firebase config, the app runs in local mode (no sign-in, analyses are not saved).

## API

- `GET /api/health` — server status
- `POST /api/analyze` — multipart field `document` (PDF/JPG/PNG, max 10 MB)
