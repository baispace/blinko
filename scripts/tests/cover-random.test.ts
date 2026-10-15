import { test, expect, spyOn } from 'bun:test';
import { DEFAULT_COVERS, randomCoverValue, randomDefaultCoverKey, toCoverUrl } from '../../app/src/components/Common/Editor/NoteCover/defaultCovers';

test('random covers store a resolvable gallery value and exclude the current cover', () => {
  const random = spyOn(Math, 'random').mockReturnValue(0);
  try {
    const first = DEFAULT_COVERS[0]!.key;
    const next = randomCoverValue(`cover:${first}`);
    expect(toCoverUrl(first)).toBe(toCoverUrl(`cover:${first}`));
    expect(next.startsWith('cover:')).toBe(true);
    expect(next).not.toBe(`cover:${first}`);
    expect(toCoverUrl(next)?.startsWith('data:image/svg+xml')).toBe(true);
    expect(randomDefaultCoverKey(first)).not.toBe(first);
    expect(toCoverUrl(randomCoverValue('/api/file/upload.png'))).toBeDefined();
  } finally {
    random.mockRestore();
  }
});
