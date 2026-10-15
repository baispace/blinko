import type { DailyAction } from './aiWorkflows';
import { todoPriorityMetadata } from './todoPriority';
export function buildDailyTaskPatch(task: { content: string; metadata?: any; isArchived?: boolean }, action: DailyAction, now = new Date()) {
  const metadata = { ...(task.metadata || {}) };
  const previousTitle = String(metadata.title || task.content.split('\n')[0]?.replace(/^#+\s*/, '') || '');
  const title = action.title?.trim() || previousTitle;
  const oldBody = task.content.split('\n')[0]?.replace(/^#+\s*/, '').trim() === previousTitle.trim() ? task.content.split('\n').slice(1).join('\n').trim() : task.content;
  const tags = Array.from(task.content.matchAll(/(?:^|\s)(#[^\s#]+)/g)).map(match => match[1]!);
  const body = action.description === null ? oldBody : action.description.trim();
  const missingTags = action.description === null ? [] : tags.filter(tag => !body.split(/\s+/).includes(tag));
  const content = action.title === null && action.description === null ? task.content : [title, body, missingTags.join(' ')].filter(Boolean).join('\n\n');
  if (action.title !== null) metadata.title = title;
  if (action.priority !== null) Object.assign(metadata, todoPriorityMetadata(action.priority));
  if (action.due !== null) {
    const next = action.due ? new Date(action.due + 'T23:59:59+08:00').toISOString() : null;
    if (metadata.expireAt && next && Date.parse(next) > Date.parse(metadata.expireAt) && action.postponeReason.trim()) {
      metadata.snoozeCount = (Number(metadata.snoozeCount) || 0) + 1;
      metadata.lastSnoozedAt = now.toISOString(); metadata.postponeReason = action.postponeReason.trim();
    }
    metadata.expireAt = next;
  }
  if (action.status !== null) metadata.completedAt = action.status === 'done' ? metadata.completedAt || now.toISOString() : null;
  return { content, metadata, ...(action.status !== null ? { isArchived: action.status === 'done' } : {}) };
}
