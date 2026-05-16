import admin from "firebase-admin";

let initialized = false;

export function initFirebaseAdmin(): boolean {
  if (initialized) return true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return false;

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    }
    initialized = true;
    return true;
  } catch (err) {
    console.warn("Firebase Admin init skipped:", err);
    return false;
  }
}

export async function verifyIdToken(
  authHeader: string | undefined
): Promise<admin.auth.DecodedIdToken | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  if (!initFirebaseAdmin()) return null;

  const token = authHeader.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export function isFirebaseAuthRequired(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}
