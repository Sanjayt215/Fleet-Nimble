export function normalizeDisplayText(value) {
  if (value == null) return "";

  if (typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDisplayText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    return (
      normalizeDisplayText(value.message) ||
      normalizeDisplayText(value.reply) ||
      normalizeDisplayText(value.text) ||
      normalizeDisplayText(value.content) ||
      normalizeDisplayText(value.error) ||
      normalizeDisplayText(value.actionResult) ||
      "An unexpected error occurred."
    );
  }

  return String(value);
}
