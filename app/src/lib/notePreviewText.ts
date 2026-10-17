/** Display-only text extraction; stored outline HTML remains untouched. */
export function notePreviewText(content: string): string {
  if (!/<\/?(?:div|ul|li|p|h[1-6]|section)\b/i.test(content)) return content;
  // Summaries may end in a truncated HTML attribute. Drop that unfinished tag.
  const html = content.replace(/<[^>]*$/, '').replace(/<\/(?:p|li|h[1-6]|div|ul)>/gi, '$&\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(node => node.remove());
  return doc.body.textContent || '';
}
