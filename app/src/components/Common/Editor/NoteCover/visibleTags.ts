type NoteTagSource = {
  id?: number;
  tags?: { tag?: { name?: string; metadata?: { path?: string } } | null }[];
};

export function getDocumentVisibleTags(content: string, selectedNote: NoteTagSource | null | undefined, noteId: number | undefined): string[] {
  const normalize = (value: unknown) => String(value ?? '').replace(/\\/g, '').replace(/[**?.。,，!！;；:：]+$/u, '').trim();
  // A new editor and an absent selected note both have undefined IDs.
  // Equality alone must not treat them as the same persisted document.
  const persisted = selectedNote && noteId != null && selectedNote.id === noteId
    ? (selectedNote.tags ?? []).map(relation => normalize(relation?.tag?.metadata?.path || relation?.tag?.name)).filter(Boolean)
    : [];
  const inline = Array.from(content.matchAll(/(?:^|\s)#([^\s#]+)/gu)).map(match => normalize(match[1])).filter(Boolean);
  return Array.from(new Set(inline.length ? inline : persisted));
}
