export type DiffPart = { text: string; changed: boolean };
export type PromptDiffRow = {
  left?: string; right?: string; leftLine?: number; rightLine?: number;
  kind: 'equal' | 'added' | 'removed' | 'modified';
};

// Bound the LCS work: unusually large paragraphs fall back to one changed span.
function matches<T>(left: T[], right: T[], limit: number): [number, number][] {
  if (left.length * right.length > limit) return [];
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const result: [number, number][] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { result.push([i++, j++]); }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return result;
}

export function promptDiffRows(original: string, corrected: string): PromptDiffRow[] {
  const left = original === '' ? [] : original.split('\n');
  const right = corrected === '' ? [] : corrected.split('\n');
  const rows: PromptDiffRow[] = [];
  let i = 0, j = 0;
  for (const [nextI, nextJ] of [...matches(left, right, 250000), [left.length, right.length]]) {
    while (i < nextI || j < nextJ) {
      const hasLeft = i < nextI, hasRight = j < nextJ;
      const kind = hasLeft && hasRight ? left[i] === right[j] ? 'equal' : 'modified' : hasLeft ? 'removed' : 'added';
      rows.push({ left: hasLeft ? left[i] : undefined, right: hasRight ? right[j] : undefined,
        leftLine: hasLeft ? ++i : undefined, rightLine: hasRight ? ++j : undefined,
        kind });
    }
    if (i < left.length && j < right.length) rows.push({ left: left[i], right: right[j], leftLine: ++i, rightLine: ++j, kind: 'equal' });
  }
  return rows;
}

export function inlinePromptDiff(original: string, corrected: string): { left: DiffPart[]; right: DiffPart[] } {
  const a = Array.from(original), b = Array.from(corrected);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
  const leftMiddle = a.slice(prefix, a.length - suffix), rightMiddle = b.slice(prefix, b.length - suffix);
  const common = matches(leftMiddle, rightMiddle, 160000);
  const left: DiffPart[] = [], right: DiffPart[] = [];
  const append = (parts: DiffPart[], text: string, changed: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  append(left, a.slice(0, prefix).join(''), false); append(right, b.slice(0, prefix).join(''), false);
  let i = 0, j = 0;
  for (const [nextI, nextJ] of [...common, [leftMiddle.length, rightMiddle.length]]) {
    append(left, leftMiddle.slice(i, nextI).join(''), true); append(right, rightMiddle.slice(j, nextJ).join(''), true);
    if (nextI < leftMiddle.length && nextJ < rightMiddle.length) {
      append(left, leftMiddle[nextI], false); append(right, rightMiddle[nextJ], false);
    }
    i = nextI + 1; j = nextJ + 1;
  }
  if (suffix) { append(left, a.slice(-suffix).join(''), false); append(right, b.slice(-suffix).join(''), false); }
  return { left, right };
}
