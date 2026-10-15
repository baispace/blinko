export function reviewProgress(total: number, index: number, reviewed: number, skipped: number) {
  const visited = Math.max(0, Math.min(index, total));
  return { visited, percent: total ? visited / total * 100 : 0, reviewed, skipped };
}
