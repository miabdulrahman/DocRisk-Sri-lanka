import type { DocumentReference } from "firebase-admin/firestore";
import { getFirestoreDb } from "../firebaseAdmin.js";

export function readString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

export async function resolveMemberByToken(token: string): Promise<{
  guardianId: string;
  memberId: string;
  memberRef: DocumentReference;
  memberName: string;
} | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const qs = await db.collectionGroup("members").where("memberToken", "==", token).limit(2).get();
  if (qs.empty) return null;
  const docSnap = qs.docs[0];
  if (!docSnap) return null;
  const memberRef = docSnap.ref;
  const parent = memberRef.parent?.parent;
  const guardianId = parent?.id;
  if (!guardianId) return null;
  const data = docSnap.data() as Record<string, unknown>;
  if (data.isActive === false) return null;
  const memberName = typeof data.name === "string" ? data.name.trim() : "Member";
  return {
    guardianId,
    memberId: docSnap.id,
    memberRef,
    memberName,
  };
}

function normalizeGuardianTel(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return plus ? `+${digits}` : `+${digits}`;
}

export async function getCircleContact(guardianId: string): Promise<{
  guardianName: string;
  guardianPhone: string | null;
}> {
  const db = getFirestoreDb();
  if (!db) return { guardianName: "your family member", guardianPhone: null };
  const snap = await db.collection("circles").doc(guardianId).get();
  const d = snap.data() as Record<string, unknown> | undefined;
  const guardianName =
    typeof d?.guardianName === "string" && d.guardianName.trim() ? d.guardianName.trim() : "your family member";
  const phoneRaw = typeof d?.guardianPhone === "string" ? d.guardianPhone : "";
  const guardianPhone = normalizeGuardianTel(phoneRaw);
  return { guardianName, guardianPhone };
}
