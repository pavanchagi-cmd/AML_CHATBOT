// Citation markers like [2] or [1, 3]. Shared by the server (cleaning the stored answer)
// and the browser (rendering chips and copying).

const CITE_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function validNumbers(group: string, count: number) {
  return group
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= count);
}

// Removes citation numbers that don't match a source; keeps the valid ones in the same marker.
export function stripInvalidCitations(text: string, count: number) {
  return text.replace(CITE_RE, (_, group: string) => {
    const valid = validNumbers(group, count);
    return valid.length ? `[${valid.join(", ")}]` : "";
  });
}

// Removes every citation marker.
export function stripAllCitations(text: string) {
  return text.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "");
}

// Plain text for copying: no citation markers and no **bold** markers.
export function copyText(text: string) {
  return stripAllCitations(text)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1");
}

// Turns each valid [n] into a Markdown link "#cite-n" so the renderer can draw a chip;
// invalid numbers are dropped.
export function citationsToLinks(text: string, count: number) {
  return text.replace(CITE_RE, (_, group: string) =>
    validNumbers(group, count)
      .map((n) => `[${n}](#cite-${n})`)
      .join(""),
  );
}

export function citeNumberFromHref(href: string | undefined) {
  const m = href?.match(/^#cite-(\d+)$/);
  return m ? Number(m[1]) : null;
}
