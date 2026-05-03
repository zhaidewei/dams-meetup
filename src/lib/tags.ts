// Free-form tag parsing for post composer input.
// Splits on whitespace / comma (CN+EN) / semicolon, strips leading "#",
// lowercases, dedupes, caps at 5.

export const MAX_TAGS = 5

export function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,，；;]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, MAX_TAGS)
}
