/** Generated blog cover / share images that belong to a note but are not user attachments. */
const INTERNAL_NOTE_ASSET_NAME = /^(ink-cover-|ink-share-)/i;

export function isInternalNoteAsset(file: {
  name?: string | null;
  metadata?: unknown;
}): boolean {
  const metadata = file.metadata as Record<string, unknown> | null | undefined;
  if (metadata && typeof metadata === 'object') {
    if (metadata.blogAICover || metadata.blogShareImage || metadata.aiCover) {
      return true;
    }
  }
  return INTERNAL_NOTE_ASSET_NAME.test(file.name ?? '');
}

export function visibleNoteAttachments<T extends { name?: string | null; metadata?: unknown }>(
  files: T[] | null | undefined,
): T[] {
  return (files ?? []).filter(file => !isInternalNoteAsset(file));
}
