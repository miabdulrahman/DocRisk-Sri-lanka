import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

let initialized = false;

function resolveCredentialPath(relOrAbs: string): string {
  if (path.isAbsolute(relOrAbs)) return path.normalize(relOrAbs);
  return path.resolve(process.cwd(), relOrAbs);
}

export function initFirebaseAdmin(): boolean {
  if (initialized) return true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return false;

  try {
    if (!admin.apps.length) {
      const credEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
      const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

      let credentialUsed = "application-default";
      let credentialInstance: admin.credential.Credential;

      if (inlineJson) {
        try {
          const parsed = JSON.parse(inlineJson);
          credentialInstance = admin.credential.cert(parsed as admin.ServiceAccount);
          credentialUsed = "FIREBASE_SERVICE_ACCOUNT_JSON";
        } catch (e) {
          credentialInstance = admin.credential.applicationDefault();
          console.warn(
            "[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed; falling back to application default.",
            e,
          );
        }
      } else if (credEnv) {
        const credPath = resolveCredentialPath(credEnv);
        if (existsSync(credPath)) {
          try {
            const parsed = JSON.parse(readFileSync(credPath, "utf8"));
            credentialInstance = admin.credential.cert(parsed as admin.ServiceAccount);
            credentialUsed = credPath;
          } catch {
            credentialInstance = admin.credential.applicationDefault();
            console.warn(
              `[firebase-admin] Could not read JSON at ${credPath}; falling back to application default.`,
            );
          }
        } else {
          credentialInstance = admin.credential.applicationDefault();
          console.warn(
            `[firebase-admin] GOOGLE_APPLICATION_CREDENTIALS="${credEnv}" not found at resolved path "${credPath}"; using application default.`,
          );
        }
      } else {
        credentialInstance = admin.credential.applicationDefault();
      }

      admin.initializeApp({
        credential: credentialInstance,
        projectId,
      });

      if (process.env.NODE_ENV !== "test") {
        console.info(`[firebase-admin] Initialized (credential: ${credentialUsed})`);
      }
    }
    initialized = true;
    return true;
  } catch (err) {
    console.warn("Firebase Admin init skipped:", err);
    return false;
  }
}

export async function verifyIdToken(
  authHeader: string | undefined,
): Promise<admin.auth.DecodedIdToken | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  if (!initFirebaseAdmin()) return null;

  const token = authHeader.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[firebase-admin] verifyIdToken failed:", msg);
    return null;
  }
}

export function isFirebaseAuthRequired(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID);
}

export function getFirestoreDb(): admin.firestore.Firestore | null {
  if (!initFirebaseAdmin()) return null;
  return admin.firestore();
}

/** Collect possible UID arrays from admins document shapes. */
function collectAdminUids(data: Record<string, unknown> | undefined): string[] {
  if (!data) return [];

  const fromArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .flatMap((item) =>
        typeof item === "string" ? item.trim() : typeof item === "number" ? String(item).trim() : [],
      )
      .filter(Boolean);
  };

  const lists = [...fromArray(data.uids), ...fromArray(data.adminUids)];
  if (typeof data.uid === "string" && data.uid.trim()) {
    lists.push(data.uid.trim());
  }

  return [...new Set(lists)];
}

export async function isUserAdmin(uid: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  const normalized = uid.trim();
  try {
    const snap = await db.collection("config").doc("admins").get();
    if (!snap.exists) {
      console.warn("[firebase-admin] Firestore doc config/admins is missing.");
      return false;
    }
    const candidates = collectAdminUids(snap.data() as Record<string, unknown>);
    const ok = candidates.includes(normalized);
    if (!ok) {
      console.warn(
        `[firebase-admin] User ${normalized.slice(0, 8)}… is not listed in config/admins (found ${candidates.length} UID(s)).`,
      );
    }
    return ok;
  } catch (err) {
    console.warn("Admin check failed:", err);
    return false;
  }
}
