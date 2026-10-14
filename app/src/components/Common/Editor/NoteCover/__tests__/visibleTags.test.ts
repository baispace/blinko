import { describe, expect, it } from 'bun:test';
import { getDocumentVisibleTags } from '../visibleTags';

describe('document tags during editor initialization', () => {
  it('renders a new note when the selected note is null', () => {
    expect(getDocumentVisibleTags('', null, undefined)).toEqual([]);
    expect(getDocumentVisibleTags('', undefined, undefined)).toEqual([]);
  });
  it('does not borrow tags from the last viewed note in a new editor', () => {
    expect(getDocumentVisibleTags('', { id: 4, tags: [{ tag: { name: '旧笔记' } }] }, undefined)).toEqual([]);
  });
  it('uses persisted tags only for the current document', () => {
    const note = { id: 4, tags: [{ tag: { name: '项目', metadata: { path: '工作/项目' } } }] };
    expect(getDocumentVisibleTags('', note, 4)).toEqual(['工作/项目']);
    expect(getDocumentVisibleTags('', note, 5)).toEqual([]);
  });
  it('shows typed tags in a new note without requiring a saved document', () => {
    expect(getDocumentVisibleTags('正文 #工作/项目 #工作/项目', null, undefined)).toEqual(['工作/项目']);
  });
  it('handles empty or missing tag relations', () => {
    expect(getDocumentVisibleTags('', { id: 4 }, 4)).toEqual([]);
    expect(getDocumentVisibleTags('', { id: 4, tags: [{ tag: null }] }, 4)).toEqual([]);
  });
});
