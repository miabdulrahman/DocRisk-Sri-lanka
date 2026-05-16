/**
 * Client mirror of the deterministic Sri Lankan NIC validator.
 *
 * Kept in sync with `server/src/lib/nicValidator.ts`.
 *
 * - Old NIC: 9 digits + V/X. First two digits = 19xx birth year.
 * - New NIC: 12 digits. First four digits = full birth year.
 *
 * Day-of-year is encoded in the next three digits:
 *   1..366  → male
 *   501..866 → female (subtract 500)
 */

export type NicKind = 'old' | 'new'

export interface NicValidationResult {
  valid: boolean
  kind: NicKind | null
  birthYear: number | null
  dayOfYear: number | null
  gender: 'male' | 'female' | null
  normalized: string
  error: string | null
}

const OLD_NIC_RE = /^([0-9]{9})([VX])$/
const NEW_NIC_RE = /^([0-9]{12})$/

const CURRENT_YEAR = new Date().getFullYear()

export function normalizeNic(raw: string): string {
  return String(raw ?? '')
    .replace(/[\s-]+/g, '')
    .trim()
    .toUpperCase()
}

export function validateNic(raw: string): NicValidationResult {
  const normalized = normalizeNic(raw)

  if (!normalized) {
    return fail(normalized, 'NIC number is empty.')
  }

  const oldMatch = OLD_NIC_RE.exec(normalized)
  if (oldMatch) {
    const digits = oldMatch[1]
    const yy = Number(digits.slice(0, 2))
    const dayCode = Number(digits.slice(2, 5))
    return decode('old', normalized, 1900 + yy, dayCode)
  }

  const newMatch = NEW_NIC_RE.exec(normalized)
  if (newMatch) {
    const digits = newMatch[1]
    const yyyy = Number(digits.slice(0, 4))
    const dayCode = Number(digits.slice(4, 7))
    return decode('new', normalized, yyyy, dayCode)
  }

  if (/^[0-9]{9}[A-Z]$/.test(normalized)) {
    return fail(normalized, 'Old NIC must end with the letter V or X.')
  }
  if (/^[0-9]+$/.test(normalized) && normalized.length !== 12) {
    return fail(normalized, 'New NIC must be exactly 12 digits.')
  }
  if (/^[0-9]+[VX]$/.test(normalized) && normalized.length !== 10) {
    return fail(normalized, 'Old NIC must be 9 digits followed by V or X.')
  }
  return fail(
    normalized,
    'NIC must be 9 digits + V/X (old format) or 12 digits (new format).',
  )
}

function decode(
  kind: NicKind,
  normalized: string,
  birthYear: number,
  dayCode: number,
): NicValidationResult {
  if (birthYear < 1900 || birthYear > CURRENT_YEAR) {
    return fail(
      normalized,
      `NIC encodes birth year ${birthYear}, outside the valid 1900–${CURRENT_YEAR} range.`,
    )
  }
  let gender: 'male' | 'female' | null = null
  let dayOfYear: number | null = null

  if (dayCode >= 1 && dayCode <= 366) {
    gender = 'male'
    dayOfYear = dayCode
  } else if (dayCode >= 501 && dayCode <= 866) {
    gender = 'female'
    dayOfYear = dayCode - 500
  } else if (dayCode !== 0) {
    return fail(
      normalized,
      `NIC day-of-year code ${dayCode} is invalid (expected 1–366 male or 501–866 female).`,
    )
  }

  return {
    valid: true,
    kind,
    birthYear,
    dayOfYear,
    gender,
    normalized,
    error: null,
  }
}

function fail(normalized: string, error: string): NicValidationResult {
  return {
    valid: false,
    kind: null,
    birthYear: null,
    dayOfYear: null,
    gender: null,
    normalized,
    error,
  }
}
