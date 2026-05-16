const VALID_LANGS = new Set(["english", "sinhala", "tamil"]);

export function normalizeOutputLang(value: unknown): string {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value[0]
        : "";
  const normalized = String(raw).toLowerCase().trim();
  return VALID_LANGS.has(normalized) ? normalized : "english";
}
