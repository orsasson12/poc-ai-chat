const CARD_MARKER_RE = /\[CARD:([\w-]+)\]/g;

export function stripUnknownCardMarkers(
  text: string,
  knownIds: Iterable<string>,
): { cleaned: string; strippedCount: number } {
  const known = new Set(knownIds);
  let strippedCount = 0;
  const cleaned = text.replace(CARD_MARKER_RE, (match, id: string) => {
    if (known.has(id)) return match;
    strippedCount += 1;
    return "";
  });
  return { cleaned, strippedCount };
}
