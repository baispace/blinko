import { makeAutoObservable } from "mobx";
import { Store } from "./standard/base";
import { api } from "@/lib/trpc";

/**
 * 服务就绪状态。
 *
 * 「模型 ID 填了」不等于「服务能用」—— 服务商的 API Key 删了、模型被删了、
 * 默认模型指到了别处，都会出现「配置看起来在，功能却是坏的」。
 * 所以就绪状态必须由服务端算（那边能看到凭据），前端只读结论。
 *
 * 用途：依赖某个服务的入口，只在对应服务真的就绪时才出现在菜单里。
 * 点进去再报错是最差的体验 —— 入口本身就不该在那儿。
 *
 *   chat      对话模型就绪（AI 标签、总结这类功能）
 *   embedding 向量模型就绪（关联笔记这类需要向量检索的功能）
 */
export class ServiceCapabilityStore implements Store {
  sid = "serviceCapabilityStore";
  autoObservable = true;

  /** 对话模型是否真的可用。 */
  chat = false;
  /** 向量模型是否真的可用。 */
  embedding = false;
  /** 是否已经读过一次 —— 读过一次就不重复打扰服务端。 */
  loaded = false;

  /** 进行中的请求。并发调用合并成一个，不会打出一串重复请求。 */
  pending: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(this, { pending: false });
  }

  /**
   * 读一次服务就绪状态。
   *
   * force = true 时无视缓存强制重读 —— AI 设置改完之后要用它刷新。
   */
  load = (force = false): Promise<void> => {
    if (!force && this.loaded) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const result = await api.ai.serviceCapabilities.query();
        this.chat = result.chat;
        this.embedding = result.embedding;
        this.loaded = true;
      } catch {
        // 读不到就当作没配置：入口不出现，比点了报错好。
        this.chat = false;
        this.embedding = false;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  };
}
