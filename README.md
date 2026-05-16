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

## Firebase authentication

1. [Create a Firebase project](https://console.firebase.google.com/) and add a **Web app**.
2. Under **Authentication → Sign-in method**, enable **Email/Password** and **Google**.
3. Copy `client/.env.example` → `client/.env` and paste your `VITE_FIREBASE_*` values.
4. Enable **Firestore** and deploy rules: `firebase deploy --only firestore:rules` (uses `firestore.rules`).
5. Restart the client: `npm run dev` in `client`.

When Firebase is configured, users see a **login screen** (email/password or Google) before uploading documents. Results are saved to Firestore per user.

**Optional API protection:** set `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in `server/.env` so `/api/analyze` requires a valid Firebase ID token.

Without Firebase keys in `client/.env`, the app runs in **local mode** (no sign-in; a setup notice is shown).

## API

- `GET /api/health` — server status
- `POST /api/analyze` — multipart field `document` (PDF/JPG/PNG, max 10 MB)
