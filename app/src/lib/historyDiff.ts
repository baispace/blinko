import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: true, breaks: true });
export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

/** Bounded LCS: large documents fall back to whole changed sections, never lock the UI. */
export function diffTokens(before: string[], after: string[], budget = 250000): DiffPart[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const left = before.slice(prefix, before.length - suffix);
  const right = after.slice(prefix, after.length - suffix);
  const parts: DiffPart[] = [];
  const add = (kind: DiffPart['kind'], text: string) => {
    if (!text) return;
    if (parts[parts.length - 1]?.kind === kind) parts[parts.length - 1]!.text += text;
    else parts.push({ kind, text });
  };
  add('same', before.slice(0, prefix).join(''));
  if (left.length * right.length > budget) {
    add('removed', left.join('')); add('added', right.join(''));
  } else {
    const width = right.length + 1;
    const matrix = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
      matrix[i * width + j] = left[i] === right[j] ? matrix[(i + 1) * width + j + 1]! + 1 : Math.max(matrix[(i + 1) * width + j]!, matrix[i * width + j + 1]!);
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { add('same', left[i++]!); j++; }
      else if (i < left.length && (j === right.length || matrix[(i + 1) * width + j]! >= matrix[i * width + j + 1]!)) add('removed', left[i++]!);
      else add('added', right[j++]!);
    }
  }
  add('same', suffix ? before.slice(-suffix).join('') : '');
  return parts;
}

export function historyText(content: string): string {
  const html = markdown.render(content.replace(/\r\n/g, '\n'));
  const separated = html.replace(/<br\s*\/?\s*>\n?/gi, '\n').replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n').replace(/<\/(?:td|th)>/gi, '\t');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(separated, 'text/html');
    doc.querySelectorAll('script,style').forEach(node => node.remove());
    doc.querySelectorAll('img').forEach(node => node.replaceWith(`[图片 ${node.getAttribute('alt') || ''}] ${node.getAttribute('src') || ''}`));
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return separated.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function compareHistory(before: string, after: string): DiffPart[] {
  const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
  const blocks = diffTokens(lines(historyText(before)), lines(historyText(after)));
  const output: DiffPart[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const part = blocks[i]!;
    const next = blocks[i + 1];
    if (part.kind === 'removed' && next?.kind === 'added' && part.text.length + next.text.length < 2000) {
      output.push(...diffTokens(Array.from(part.text), Array.from(next.text))); i++;
    } else output.push(part);
  }
  return output;
}
