export function searchSnippet(content: string, term: string) {
  const text = content.replace(/<[^>]*>/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[\t ]*(?:#{1,6}[\t ]+|>[\t ]*|[-*+][\t ]+(?:\[[ xX]\][\t ]*)?)/gm, '').replace(/[`*_]/g, '').trim();
  const title = text.split('\n').find(line => line.trim())?.trim().slice(0, 100) ?? '';
  const plain = text.replace(/\s+/g, ' ');
  const start = Math.max(0, plain.toLocaleLowerCase().indexOf(term.trim().toLocaleLowerCase()) - 45);
  const summary = (start ? '…' : '') + plain.slice(start, start + 160) + (plain.length > start + 160 ? '…' : '');
  return { title, summary: summary === title ? '' : summary };
}
export function tagPath(tag: { id: number; name: string; parent?: number }, tags: { id: number; name: string; parent?: number }[]) {
  const parts = [tag.name], seen = new Set([tag.id]);
  let parent = tag.parent;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const node = tags.find(item => item.id === parent);
    if (!node) break;
    parts.unshift(node.name); parent = node.parent;
  }
  return parts.join('/');
}
