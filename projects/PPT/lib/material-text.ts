export function normalizeMaterialText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function materialUnits(text: string, minimumLength = 8) {
  return normalizeMaterialText(text)
    .split(/(?<=[。！？!?])\s*|(?<!\d)\.(?!\d)\s*|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > minimumLength);
}
