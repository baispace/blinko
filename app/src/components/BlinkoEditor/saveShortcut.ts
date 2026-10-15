export function isSaveShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's';
}
