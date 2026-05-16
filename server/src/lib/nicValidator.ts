/**
 * Deterministic Sri Lankan NIC pre-validator.
 *
 * Old NIC: 9 digits + 'V' or 'X' (case-insensitive). First 2 digits = birth year (19xx).
 * New NIC: 12 digits. First 4 digits = full birth year.
 *
 * Day-of-year is encoded in digits 3-5 (old) / 5-7 (new):
 *   - 1..366    → male
 *   - 501..866  → female (subtract 500 to get day-of-year)
 *
 * This module is intentionally framework-agnostic so the frontend can mirror it.
 */

export type NicKind = "old" | "new";

export interface NicValidationResult {
  valid: boolean;
  kind: NicKind | null;
  /** Full 4-digit calendar year (e.g. 1992, 2003). */
  birthYear: number | null;
  /** Day of year (1..366) or null when out of range. */
  dayOfYear: number | null;
  /** "male" / "female" inferred from day-of-year encoding. */
  gender: "male" | "female" | null;
  /** Normalized canonical form (uppercase, trimmed, dashes/spaces removed). */
  normalized: string;
  /** User-facing error string when valid=false. */
  error: string | null;
}

const OLD_NIC_RE = /^([0-9]{9})([VX])$/;
const NEW_NIC_RE = /^([0-9]{12})$/;

const CURRENT_YEAR = new Date().getFullYear();

export function normalizeNic(raw: string): string {
  return String(raw ?? "")
    .replace(/[\s-]+/g, "")
    .trim()
    .toUpperCase();
}

export function validateNic(raw: string): NicValidationResult {
  const normalized = normalizeNic(raw);

  if (!normalized) {
    return {
      valid: false,
      kind: null,
      birthYear: null,
      dayOfYear: null,
      gender: null,
      normalized,
      error: "NIC number is empty.",
    };
  }

  const oldMatch = OLD_NIC_RE.exec(normalized);
  if (oldMatch && oldMatch[1]) {
    const digits = oldMatch[1];
    const yy = Number(digits.slice(0, 2));
    const dayCode = Number(digits.slice(2, 5));
    return decodeNic("old", normalized, 1900 + yy, dayCode);
  }

  const newMatch = NEW_NIC_RE.exec(normalized);
  if (newMatch && newMatch[1]) {
    const digits = newMatch[1];
    const yyyy = Number(digits.slice(0, 4));
    const dayCode = Number(digits.slice(4, 7));
    return decodeNic("new", normalized, yyyy, dayCode);
  }

  // Determine the most useful error for the user.
  if (/^[0-9]{9}[A-Z]$/.test(normalized)) {
    return failure(
      normalized,
      "Old NIC must end with the letter V or X.",
    );
  }
  if (/^[0-9]+$/.test(normalized) && normalized.length !== 12) {
    return failure(
      normalized,
      "New NIC must be exactly 12 digits.",
    );
  }
  if (/^[0-9]+[VX]$/.test(normalized) && normalized.length !== 10) {
    return failure(
      normalized,
      "Old NIC must be 9 digits followed by V or X.",
    );
  }
  return failure(
    normalized,
    "NIC must be 9 digits + V/X (old format) or 12 digits (new format).",
  );
}

function decodeNic(
  kind: NicKind,
  normalized: string,
  birthYear: number,
  dayCode: number,
): NicValidationResult {
  if (birthYear < 1900 || birthYear > CURRENT_YEAR) {
    return failure(
      normalized,
      `NIC encodes birth year ${birthYear}, which is outside the valid range (1900–${CURRENT_YEAR}).`,
    );
  }

  let gender: "male" | "female" | null = null;
  let dayOfYear: number | null = null;

  if (dayCode >= 1 && dayCode <= 366) {
    gender = "male";
    dayOfYear = dayCode;
  } else if (dayCode >= 501 && dayCode <= 866) {
    gender = "female";
    dayOfYear = dayCode - 500;
  } else if (dayCode === 0) {
    // Some legacy/test NICs use 000 — accept but flag as null day-of-year.
    gender = null;
    dayOfYear = null;
  } else {
    return failure(
      normalized,
      `NIC day-of-year code ${dayCode} is invalid (expected 1–366 male or 501–866 female).`,
    );
  }

  return {
    valid: true,
    kind,
    birthYear,
    dayOfYear,
    gender,
    normalized,
    error: null,
  };
}

function failure(normalized: string, error: string): NicValidationResult {
  return {
    valid: false,
    kind: null,
    birthYear: null,
    dayOfYear: null,
    gender: null,
    normalized,
    error,
  };
}

/**
 * Try to extract an NIC-shaped substring from arbitrary text such as a
 * filename. Returns the first match (normalized) or null. Callers can then
 * pass it through validateNic() to obtain a full result.
 */
export function findNicInText(text: string): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  const oldRe = /\b([0-9]{9})([VX])\b/;
  const newRe = /\b([0-9]{12})\b/;
  return (oldRe.exec(upper)?.[0] ?? newRe.exec(upper)?.[0] ?? null);
}

/**
 * Convenience: returns true when the given hint year clearly contradicts
 * the year encoded inside the NIC. Used by callers that have a separate
 * "claimed year" hint (e.g. from a filename or form field) and want to
 * fail fast before paying for an LLM round-trip.
 */
export function nicYearConflictsWith(
  nic: string,
  hintYear: number,
): { conflict: boolean; expected: number | null } {
  const r = validateNic(nic);
  if (!r.valid || r.birthYear == null) return { conflict: false, expected: null };
  return { conflict: r.birthYear !== hintYear, expected: r.birthYear };
}
