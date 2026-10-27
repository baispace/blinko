import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routerTrpc/_app";
import superjson from "superjson";
import { publicTrpcUrl } from "./blogPublicBase";
// Public pages must never initialize workspace stores or send account tokens.
export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      // 前后端分开部署时，API 地址来自运行时配置（服务端注入）或构建期变量。
      url: publicTrpcUrl(),
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "omit",
          signal: AbortSignal.timeout(15000),
        });
      },
    }),
  ],
});
