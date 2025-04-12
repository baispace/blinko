import type * as trpcNext from '@trpc/server/adapters/next';
import requestIp from 'request-ip';
import Bowser from 'bowser';
import { getToken } from "@/server/routers/helper";
import { JWT } from "next-auth/jwt";

export interface User extends JWT {
  name: string;
  sub: string;
  role: string;
  id: string;
  exp: number;
  iat: number;
  ip?: string;
  userAgent?: any;
  permissions?: string[];
}

export async function createContext(
  opts: trpcNext.CreateNextContextOptions,
) {
  const token = await getToken(opts.req) as User;
  const ip = requestIp.getClientIp(opts.req);
  const ua = opts.req.headers['user-agent'];
  const userAgent = ua ? Bowser.parse(ua) : null;
  if (!token?.sub) {
    return { ip, userAgent } as User;
  }
  return { ...token, id: token.sub, ip, userAgent }
}

export type Context = Awaited<ReturnType<typeof createContext>>;