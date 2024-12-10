import CredentialsProvider from 'next-auth/providers/credentials';
import NextAuth from 'next-auth';
import { prisma } from '@/server/prisma';
import { verifyPassword } from 'prisma/seed';
import { authenticator } from 'otplib';
import { verifyTOTP } from '@/server/routers/helper';
import { getGlobalConfig } from '@/server/routers/config';

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "User", type: "text" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "2FA Code", type: "text" },
        isSecondStep: { label: "Is Second Step", type: "boolean" }
      },
      async authorize(credentials) {
        try {
          const users = await prisma.accounts.findMany({
            where: { name: credentials!.username },
            select: {
              name: true,
              nickname: true,
              id: true,
              role: true,
              password: true,
            }
          })

          if (users.length === 0) {
            throw new Error("user not found")
          }
          const correctUsers = (await Promise.all(users.map(async (user) => {
            if (await verifyPassword(credentials!.password, user.password ?? '')) {
              return user
            }
          }))).filter(user => user !== undefined)

          if (!correctUsers || correctUsers.length === 0) {
            throw new Error("password is incorrect")
          }
          const user = correctUsers![0]!;

          const config = await getGlobalConfig({ id: user.id.toString() })

          // 2fa verification
          if (credentials?.isSecondStep === 'true') {

            const isValidToken = authenticator.verify({
              token: credentials.twoFactorCode,
              secret: config.twoFactorSecret ?? ''
            });

            if (!isValidToken) {
              throw new Error("Invalid 2FA code");
            }

            return {
              id: user.id.toString(),
              name: user.name || '',
              nickname: user.nickname,
              role: user.role
            };
          }
          console.log({ credentials })
          return {
            id: user.id.toString(),
            name: user.name || '',
            nickname: user.nickname,
            role: user.role,
            requiresTwoFactor: config.twoFactorEnabled ?? false
          }
        } catch (error) {
          console.log(error)
          throw new Error(error.message)
        }
      }
    })
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        //@ts-ignore
        if (user.requiresTwoFactor) {
          token.requiresTwoFactor = true;
        }
        //@ts-ignore
        token.nickname = user.nickname
        //@ts-ignore
        token.role = user.role
        //@ts-ignore
        token.id = user.id
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
    async session({ session, token }) {
      const user = await prisma.accounts.findUnique({
        where: { id: Number(token.id) },
      });
      if (!user) {
        throw new Error('User no longer exists');
      }
      //@ts-ignore
      session.user!.nickname = token.nickname
      //@ts-ignore
      session.user!.id = token.id
      //@ts-ignore
      session.user!.role = token.role
      //@ts-ignore
      return { ...session, token: token.token, requiresTwoFactor: token.requiresTwoFactor }
    },
  },
  session: {
    // Set session maxAge to 30 days (30 days * 24 hours * 60 minutes * 60 seconds)
    maxAge: 30 * 24 * 60 * 60, // 30 days
  }
});
