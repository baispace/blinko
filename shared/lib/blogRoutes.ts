/** Convert the established internal identifiers to explicit public routes. */
export function publicContentPath(path: string): string {
  const segment = path.split(/[/?#]/)[1];
  if (['subscribe', 'moments', 'friends', 'topics', 'about', 'stats', 'article', 'topic'].includes(segment)) return path;
  return path
    .replace(/^\/t\//, '/topic/')
    .replace(/^\/([a-z0-9]{8,64})(?=[?#]|$)/, '/article/$1');
}

export function internalContentPath(path: string): string {
  return path.replace(/^\/article\//, '/').replace(/^\/topic\//, '/t/');
}
