// Query terms to highlight in passages, using the prototype's tokenizer:
// lower-case words, common words removed, simple suffix stemming.

const STOP = new Set(
  "a an and are as at be by can do does for from has have how i if in is it its of on or should the this that to what when where which who why will with you your me my we our there their them they not no yes about into than then so any all also more most".split(
    " ",
  ),
);

export function stem(word: string) {
  let w = word;
  if (w.length > 5) w = w.replace(/(ing|ed|es)$/, "");
  if (w.length > 4) w = w.replace(/s$/, "");
  return w;
}

export function queryTerms(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 1 && !STOP.has(w)).map(stem));
}

// Splits text into plain and highlighted parts.
export function highlightParts(text: string, terms: Set<string>): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[A-Za-z0-9]+/g)) {
    if (!terms.has(stem(m[0].toLowerCase()))) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hit: false });
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}
