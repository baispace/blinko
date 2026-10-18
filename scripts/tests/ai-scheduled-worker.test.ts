import { expect, mock, test } from 'bun:test';

let task: any = null;
let factoryOptions: any;
let prompts: any[] = [];
let failSchedule = false;
const workers = new Map<string, Function>();
const sent: any[] = [];
const boss = {
  createQueue: async () => {},
  work: async (name: string, _: unknown, worker: Function) => { workers.set(name, worker); return name; },
  schedule: async () => { if (failSchedule) throw new Error('Invalid schedule'); },
  unschedule: async () => {}, offWork: async () => {},
  send: async (_: string, data: unknown) => { sent.push(data); return 'job'; },
};
mock.module('../../server/lib/pgBoss', () => ({ getPgBoss: async () => boss }));
mock.module('../../server/prisma', () => ({ prisma: { aiScheduledTask: {
  findMany: async () => [],
  findUnique: async () => task,
  findFirst: async ({ where }: any) => task?.id === where.id && task?.accountId === where.accountId ? { ...task } : null,
  update: async ({ data }: any) => { task = { ...task, ...data }; return task; },
  create: async ({ data }: any) => { task = { id: 42, ...data }; return task; },
  deleteMany: async () => { task = null; },
} } }));
mock.module('../../server/aiServer/aiModelFactory', () => ({ AiModelFactory: { BaseChatAgent: async (options: any) => {
  factoryOptions = options;
  return { stream: async (messages: any) => {
    prompts = messages;
    return { fullStream: (async function* () { yield { type: 'text-delta', textDelta: '工作回顾结果' }; })() };
  } };
} } }));
const { AIScheduledTaskJob, AI_SCHEDULED_TASK_QUEUE } = await import('../../server/jobs/aiScheduledTaskJob');

test('worker uses the latest owned prompt and read-only tools, then records the result', async () => {
  await AIScheduledTaskJob.initialize();
  task = { id: 1, accountId: 9, isEnabled: true, prompt: '最新提示词' };
  await workers.get(AI_SCHEDULED_TASK_QUEUE)!([{ data: { taskId: 1, accountId: 9, prompt: '旧提示词' } }]);
  expect(prompts[0].content).toBe('最新提示词');
  expect(factoryOptions.readOnlyTools).toBe(true);
  expect(factoryOptions.withMcpTools).toBe(false);
  expect(task.lastResult.success).toBe(true);
  expect(task.lastResult.result).toBe('工作回顾结果');
});

test('paused schedules skip automatic jobs but accept explicit manual runs', async () => {
  task = { id: 1, accountId: 9, isEnabled: false, prompt: '暂停的任务' };
  expect((await workers.get(AI_SCHEDULED_TASK_QUEUE)!([{ data: { taskId: 1, accountId: 9, prompt: '' } }])).skipped).toBe(true);
  await AIScheduledTaskJob.runNow(1, 9);
  expect(sent[sent.length - 1].manual).toBe(true);
  await workers.get(AI_SCHEDULED_TASK_QUEUE)!([{ data: sent[sent.length - 1] }]);
  expect(task.lastResult.success).toBe(true);
  await expect(AIScheduledTaskJob.runNow(1, 99)).rejects.toThrow('access denied');
});

test('failed scheduling rolls back the task instead of leaving a falsely enabled entry', async () => {
  failSchedule = true;
  await expect(AIScheduledTaskJob.createTask({ name: '测试', prompt: '测试', schedule: 'bad bad bad bad bad', accountId: 9 })).rejects.toThrow('Invalid schedule');
  expect(task).toBeNull();
  failSchedule = false;
});

test('editing a task reschedules it and retains its enabled state with ownership checks', async () => {
  task = { id: 1, accountId: 9, isEnabled: true, name: '旧任务', prompt: '旧提示词', schedule: '0 1 * * 1-5' };
  await AIScheduledTaskJob.updateTask(1, 9, { name: '周报', prompt: '本周工作复盘', schedule: '0 10 * * 5' });
  expect(task.name).toBe('周报');
  expect(task.prompt).toBe('本周工作复盘');
  expect(task.schedule).toBe('0 10 * * 5');
  expect(task.isEnabled).toBe(true);
  await expect(AIScheduledTaskJob.updateTask(1, 99, { name: '错误', prompt: '错误', schedule: '0 10 * * 5' })).rejects.toThrow('access denied');
});
