import { describe, it, expect } from 'bun:test';
import { isInternalNoteAsset, visibleNoteAttachments } from '../noteAttachments';

describe('noteAttachments', () => {
  it('hides generated cover and share images by metadata', () => {
    expect(isInternalNoteAsset({ name: 'photo.webp', metadata: { blogAICover: { noteId: 18 } } })).toBe(true);
    expect(isInternalNoteAsset({ name: 'photo.webp', metadata: { blogShareImage: { noteId: 18 } } })).toBe(true);
    expect(isInternalNoteAsset({ name: 'photo.webp', metadata: { aiCover: { assetKind: 'complete-cover' } } })).toBe(true);
  });

  it('hides generated cover and share images by filename', () => {
    expect(isInternalNoteAsset({ name: 'ink-cover-base-18-abc.webp' })).toBe(true);
    expect(isInternalNoteAsset({ name: 'ink-cover-icon-18-abc.webp' })).toBe(true);
    expect(isInternalNoteAsset({ name: 'ink-share-18-8.webp' })).toBe(true);
  });

  it('keeps ordinary note attachments', () => {
    expect(isInternalNoteAsset({ name: 'screenshot.png' })).toBe(false);
    expect(isInternalNoteAsset({ name: 'notes.pdf', metadata: { foo: 1 } })).toBe(false);
  });

  it('filters a mixed attachment list', () => {
    const visible = visibleNoteAttachments([
      { name: 'ink-share-18-8.webp' },
      { name: 'diagram.png' },
      { name: 'cover.webp', metadata: { blogAICover: { noteId: 18 } } },
    ]);
    expect(visible.map(file => file.name)).toEqual(['diagram.png']);
  });
});
