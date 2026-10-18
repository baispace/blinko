import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '@/lib/trpc';
import { Store } from './standard/base';

type Task = Awaited<ReturnType<typeof api.aiTask.list.query>>[number];

/** Scheduled task data and polling, active only while its page is mounted. */
export class AiTaskStore implements Store {
  sid = 'AiTaskStore';

  tasks: Task[] = [];
  loading = true;
  busy = false;
  error = '';

  private timer: ReturnType<typeof setInterval> | null = null;
  private subscribers = 0;
  private fetching = false;

  constructor() {
    // 与 AiStore / BlinkoStore 一致：implements Store + makeAutoObservable。
    // 不能 extends Store —— makeAutoObservable 要求没有父类。
    makeAutoObservable(this, {}, { autoBind: true });
  }

  start = () => {
    this.subscribers += 1;
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 5000);
  };

  stop = () => {
    this.subscribers = Math.max(0, this.subscribers - 1);
    if (this.subscribers > 0 || !this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  };

  refresh = async () => {
    // 上一次还没回来就跳过，避免切页面时堆积请求
    if (this.fetching) return;
    this.fetching = true;
    try {
      const tasks = await api.aiTask.list.query();
      runInAction(() => {
        this.tasks = tasks;
        this.loading = false;
        this.error = '';
      });
    } catch (error: any) {
      runInAction(() => {
        this.error = error?.message || '定时任务加载失败';
        this.loading = false;
      });
    } finally {
      this.fetching = false;
    }
  };

  /** 所有写操作的统一入口：跑完自动刷新列表，失败信息也落在同一处。 */
  run = async (fn: () => Promise<unknown>) => {
    this.busy = true;
    this.error = '';
    try {
      await fn();
      await this.refresh();
    } catch (error: any) {
      runInAction(() => {
        this.error = error?.message || '操作失败，请重试';
      });
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  };

}
