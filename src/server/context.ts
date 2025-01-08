import type * as trpcNext from '@trpc/server/adapters/next';
import { getToken } from 'next-auth/jwt';
import { prisma } from './prisma';
import requestIp from 'request-ip';
import Bowser from 'bowser';

export type User = {
  name: string,
  sub: string,
  role: string,
  id: string,
  exp: number,
  iat: number,
  ip?: string,
  userAgent?: Bowser.Parser.ParsedResult
}

export async function createContext(
  opts: trpcNext.CreateNextContextOptions,
) {
  const token = await getToken({ req: opts.req, secret: process.env.NEXTAUTH_SECRET }) as User;
  const ip = requestIp.getClientIp(opts.req);
  const ua = opts.req.headers['user-agent'];
  const userAgent = ua ? Bowser.parse(ua) : null;
  console.log({ userAgent })
  if (!token?.sub) {
    return { ip, userAgent } as User;
  }
  return { ...token, id: token.sub, ip, userAgent }
}

export type Context = Awaited<ReturnType<typeof createContext>>;