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
  // A daily plan is separate from the deadline and the original start date.
  if (action.planDate != null) metadata.planDate = action.planDate || null;
  if (action.nextStep?.trim()) metadata.nextStep = action.nextStep.trim();
  if (action.progress?.trim()) {
    const entry = { at: now.toISOString(), date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now), content: action.progress.trim(), nextStep: action.nextStep?.trim() || '' };
    const previous = Array.isArray(metadata.progressHistory) ? metadata.progressHistory : [];
    metadata.progressHistory = previous.some((item: any) => item.date === entry.date && item.content === entry.content && item.nextStep === entry.nextStep) ? previous : [...previous, entry];
    metadata.latestProgress = entry.content;
  }
  if (action.status === 'done') { metadata.taskStatus = 'done'; if (!action.nextStep?.trim()) metadata.nextStep = ''; }
  else if (action.status === 'open') metadata.taskStatus = !task.isArchived && metadata.taskStatus && !['todo', 'delayed', 'done'].includes(metadata.taskStatus) ? metadata.taskStatus : action.progress?.trim() || action.nextStep?.trim() ? 'doing' : 'todo';
  else if (!task.isArchived && action.progress?.trim() && (!metadata.taskStatus || ['todo', 'delayed'].includes(metadata.taskStatus))) metadata.taskStatus = 'doing';
  if (action.status !== null) metadata.completedAt = action.status === 'done' ? metadata.completedAt || now.toISOString() : null;
  return { content, metadata, ...(action.status !== null ? { isArchived: action.status === 'done' } : {}) };
}
