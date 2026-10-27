/** Count visible non-space code points; cover copy stays compact in small thumbnails. */
export const shortCoverTitleLength = (title: string) => Array.from(title.trim().replace(/\s/g, '')).length;
export function validShortCoverTitle(title: string) {
  const length = shortCoverTitleLength(title);
  return length >= 4 && length <= 6;
}
