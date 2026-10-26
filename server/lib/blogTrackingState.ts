import type { PrismaClient } from "@prisma/client";
import { readBlogSiteSettings } from "./blogSiteSettings";
import {
  isValidTrackingId,
  type TrackingVendor,
} from "../../shared/lib/blogTracking";

/**
 * 第三方统计脚本的接入状态。
 *
 * 这里刻意只记录三件能证实的事：
 *   1. 配置是否有效（启用 + 编号格式正确）
 *   2. 官方脚本是否真的加载了（由公开博客页上报）
 *   3. 页面事件是否已尝试发送（由公开博客页上报）
 *
 * 「服务商报表是否收到数据」不在这里 —— 没有报表 API 授权就无法证实，
 * 界面必须提示用户去服务商实时报告人工确认，不能拿前三条冒充第四条。
 */

export { TRACKING_VENDORS, type TrackingVendor } from "../../shared/lib/blogTracking";

export type TrackingState = {
  vendor: TrackingVendor;
  enabled: boolean;
  /** 编号格式是否合法 */
  idValid: boolean;
  /** 启用时必须有合法编号 */
  configValid: boolean;
  scriptLoaded: boolean;
  eventSent: boolean;
  scriptLoadedAt: string | null;
  eventSentAt: string | null;
  lastPath: string;
  lastHost: string;
};

/** 读两个平台的接入状态。 */
export async function readTrackingStates(
  db: PrismaClient,
  accountId: number,
): Promise<Record<TrackingVendor, TrackingState>> {
  const settings = await readBlogSiteSettings(db, accountId);
  const rows = await db.blogTrackingState.findMany({
    where: { accountId },
    select: {
      vendor: true,
      scriptLoadedAt: true,
      eventSentAt: true,
      lastPath: true,
      lastHost: true,
    },
  });
  const byVendor = new Map(rows.map((r) => [r.vendor, r]));

  const build = (vendor: TrackingVendor): TrackingState => {
    const enabled =
      vendor === "ga" ? settings.data.gaEnabled : settings.data.baiduEnabled;
    const rawId =
      vendor === "ga" ? settings.data.gaId : settings.data.baiduId;
    const idValid = isValidTrackingId(vendor, rawId);
    const row = byVendor.get(vendor);
    return {
      vendor,
      enabled: !!enabled,
      idValid,
      // 启用时必须编号合法；未启用时配置「有效」但不算接入。
      configValid: enabled ? idValid : false,
      scriptLoaded: !!row?.scriptLoadedAt,
      eventSent: !!row?.eventSentAt,
      scriptLoadedAt: row?.scriptLoadedAt?.toISOString() ?? null,
      eventSentAt: row?.eventSentAt?.toISOString() ?? null,
      lastPath: row?.lastPath ?? "",
      lastHost: row?.lastHost ?? "",
    };
  };

  return { ga: build("ga"), baidu: build("baidu") };
}

export type TrackingReportInput = {
  vendor: TrackingVendor;
  scriptLoaded?: boolean;
  eventSent?: boolean;
  path?: string;
  host?: string;
};

/**
 * 公开博客页上报脚本状态。
 *
 * 这是无凭据的公开接口，所以限制很紧：只认两个厂商、只存路径与主机名，
 * 且必须「该平台已启用且编号合法」才落库 —— 否则上报毫无意义。
 * 这里不写任何访客信息，只是「脚本跑起来了」的一个事实记录。
 */
export async function reportTrackingState(
  db: PrismaClient,
  accountId: number,
  input: TrackingReportInput,
) {
  const settings = await readBlogSiteSettings(db, accountId);
  const enabled =
    input.vendor === "ga" ? settings.data.gaEnabled : settings.data.baiduEnabled;
  const rawId =
    input.vendor === "ga" ? settings.data.gaId : settings.data.baiduId;
  if (!enabled || !isValidTrackingId(input.vendor, rawId)) {
    return { recorded: false, reason: "该平台未启用或编号无效" };
  }

  const now = new Date();
  const path = (input.path ?? "").trim().slice(0, 200);
  const host = (input.host ?? "").trim().slice(0, 120);
  const scriptLoaded = !!input.scriptLoaded;
  const eventSent = !!input.eventSent;

  await db.blogTrackingState.upsert({
    where: {
      accountId_vendor: { accountId, vendor: input.vendor },
    },
    create: {
      accountId,
      vendor: input.vendor,
      scriptLoadedAt: scriptLoaded ? now : null,
      eventSentAt: eventSent ? now : null,
      lastPath: path,
      lastHost: host,
    },
    update: {
      ...(scriptLoaded ? { scriptLoadedAt: now } : {}),
      ...(eventSent ? { eventSentAt: now } : {}),
      ...(path ? { lastPath: path } : {}),
      ...(host ? { lastHost: host } : {}),
    },
  });
  return { recorded: true };
}
