import { router, publicProcedure, authProcedure, superAdminAuthMiddleware, demoAuthMiddleware } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '../prisma';
import { encode } from 'next-auth/jwt';
import { Prisma } from '@prisma/client';
import { accountsSchema } from '@/lib/prismaZodType';
import { hashPassword, verifyPassword } from 'prisma/seed';
import { generateTOTP, generateTOTPQRCode, verifyTOTP } from "./helper";
import { deleteNotes } from './note';
import { createSeed } from 'prisma/seedData';

const genToken = async ({ id, name, role }: { id: number, name: string, role: string }) => {
  return await encode({
    token: {
      role,
      name,
      sub: id.toString(),
    },
    secret: process.env.NEXTAUTH_SECRET!
  })
}

export const userRouter = router({
  list: authProcedure.use(superAdminAuthMiddleware)
    .meta({
      openapi: {
        method: 'GET', path: '/v1/user/list', summary: 'Find user list',
        description: 'Find user list, need super admin permission', tags: ['User']
      }
    })
    .input(z.void())
    .output(z.array(accountsSchema))
    .query(async () => {
      return await prisma.accounts.findMany()
    }),
  nativeAccountList: authProcedure
    .meta({
      openapi: {
        method: 'GET', path: '/v1/user/native-account-list', summary: 'Find native account list',
        description: 'find native account list which use username and password to login', tags: ['User']
      }
    })
    .input(z.void())
    .output(z.array(z.object({
      id: z.number().int(),
      name: z.string(),
      nickname: z.string(),
    })))
    .query(async () => {
      const accounts = await prisma.accounts.findMany({
        where: {
          loginType: '',
          NOT: {
            id: {
              in: (await prisma.accounts.findMany({
                where: { linkAccountId: { not: null } },
                select: { linkAccountId: true }
              })).map(a => a.linkAccountId!)
            }
          }
        },
        select: {
          id: true,
          name: true,
          nickname: true,
        }
      })
      return accounts
    }),
  linkAccount: authProcedure
    .meta({
      openapi: {
        method: 'POST', path: '/v1/user/link-account', summary: 'Link account',
        description: 'Link account', tags: ['User']
      }
    })
    .input(z.object({
      id: z.number(),
      originalPassword: z.string()
    }))
    .output(z.boolean())
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.accounts.findFirst({ where: { id: input.id } })
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      }
      if (input.originalPassword) {
        if (!(await verifyPassword(input.originalPassword, user?.password ?? ''))) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password is incorrect' });
        }
      }
      await prisma.accounts.update({ where: { id: Number(ctx.id) }, data: { linkAccountId: user.id } })
      return true
    }),
  unlinkAccount: authProcedure
    .meta({
      openapi: {
        method: 'POST', path: '/v1/user/unlink-account', summary: 'Unlink account',
        description: 'Unlink account', tags: ['User']
      }
    })
    .input(z.object({ id: z.number() }))
    .output(z.boolean())
    .mutation(async ({ input }) => {
      await prisma.accounts.updateMany({
        where: { linkAccountId: input.id },
        data: { linkAccountId: null }
      })
      return true
    }),
  detail: authProcedure
    .meta({
      openapi: {
        method: 'GET', path: '/v1/user/detail', summary: 'Find user detail from user id',
        description: 'Find user detail from user id, need login', tags: ['User']
      }
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({
      id: z.number(),
      name: z.string(),
      nickName: z.string(),
      token: z.string(),
      isLinked: z.boolean(),
      loginType: z.string(),
      image: z.string().nullable()
    }))
    .query(async ({ input, ctx }) => {
      const user = await prisma.accounts.findFirst({ where: { id: input.id } })
      if (user?.id !== Number(ctx.id) && user?.role !== 'superadmin') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You are not allowed to access this user' })
      }
      const isLinked = await prisma.accounts.findFirst({ where: { linkAccountId: input.id } })
      return {
        id: input.id,
        name: user?.name ?? '',
        nickName: user?.nickname ?? '',
        token: user?.apiToken ?? '',
        loginType: user?.loginType ?? '',
        isLinked: isLinked ? true : false,
        image: user?.image ?? null
      }
    }),
  canRegister: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/user/can-register', summary: 'Check if can register admin', tags: ['User'] } })
    .input(z.void())
    .output(z.boolean())
    .mutation(async () => {
      const count = await prisma.accounts.count()
      if (count == 0) {
        return true
      } else {
        const res = await prisma.config.findFirst({ where: { key: 'isAllowRegister' } })
        //@ts-ignore
        return res?.config.value === true
      }
    }),
  register: publicProcedure
    .meta({
      openapi: {
        method: 'POST', path: '/v1/user/register', summary: 'Register user or admin',
        description: 'Register user or admin', tags: ['User']
      }
    })
    .input(z.object({
      name: z.string(),
      password: z.string()
    }))
    .output(z.union([z.boolean(), z.any()]))
    .mutation(async ({ input }) => {
      return prisma.$transaction(async () => {
        const { name, password } = input
        const passwordHash = await hashPassword(password)
        const count = await prisma.accounts.count()
        if (count == 0) {
          const res = await prisma.accounts.create({
            data: {
              name,
              password: passwordHash,
              nickname: name,
              role: 'superadmin',
            }
          })
          await prisma.accounts.update({
            where: { id: res.id },
            data: {
              apiToken: await genToken({ id: res.id, name, role: 'superadmin' })
            }
          })
          await prisma.config.create({
            data: {
              key: 'theme',
              config: { value: 'system' },
              userId: res.id
            }
          })
          await createSeed(res.id)
          return true
        } else {
          const config = await prisma.config.findFirst({ where: { key: 'isAllowRegister' } })
          //@ts-ignore
          if (config?.config?.value === false || !config) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'not allow register',
            });
          } else {
            const hasSameUser = await prisma.accounts.findFirst({ where: { name } })
            if (hasSameUser && await verifyPassword(password, hasSameUser?.password ?? '')) {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'User and password already exists',
              });
            }
            const res = await prisma.accounts.create({ data: { name, password: passwordHash, nickname: name, role: 'user' } })
            await prisma.accounts.update({ where: { id: res.id }, data: { apiToken: await genToken({ id: res.id, name, role: 'user' }) } })
            return true
          }
        }
      })
    }),
  regenToken: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/user/regen-token', summary: 'Regen token', tags: ['User'] } })
    .input(z.void())
    .output(z.boolean())
    .mutation(async ({ ctx }) => {
      const user = await prisma.accounts.findFirst({ where: { id: Number(ctx.id) } })
      if (user) {
        await prisma.accounts.update({ where: { id: user.id }, data: { apiToken: await genToken({ id: user.id, name: user.name ?? '', role: user.role }) } })
        return true
      } else {
        return false
      }
    }),
  upsertUser: authProcedure.use(demoAuthMiddleware)
    .meta({
      openapi: {
        method: 'POST', path: '/v1/user/upsert', summary: 'Update or create user',
        description: 'Update or create user, need login', tags: ['User']
      }
    })
    .input(z.object({
      id: z.number().optional(),
      name: z.string().optional(),
      originalPassword: z.string().optional(),
      password: z.string().optional(),
      nickname: z.string().optional(),
      image: z.string().optional()
    }))
    .output(z.union([z.boolean(), z.any()]))
    .mutation(async ({ input }) => {
      return prisma.$transaction(async () => {
        const { id, nickname, name, password, originalPassword, image } = input

        const update: Prisma.accountsUpdateInput = {}
        if (id) {
          if (name) update.name = name
          if (password) {
            const passwordHash = await hashPassword(password)
            update.password = passwordHash
          }
          if (nickname) update.nickname = nickname
          if (image) update.image = image
          if (originalPassword) {
            const user = await prisma.accounts.findFirst({ where: { id } })
            if (user && !(await verifyPassword(originalPassword, user?.password ?? ''))) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password is incorrect' });
            }
          }
          await prisma.accounts.update({ where: { id }, data: update })
          return true
        } else {
          if (!password) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password is required' });
          }
          const passwordHash = await hashPassword(password!)
          const res = await prisma.accounts.create({ data: { name, password: passwordHash, nickname: name, role: 'user' } })
          await prisma.accounts.update({ where: { id: res.id }, data: { apiToken: await genToken({ id: res.id, name: name ?? '', role: 'user' }) } })
          return true
        }
      })
    }),
  upsertUserByAdmin: authProcedure.use(superAdminAuthMiddleware).use(demoAuthMiddleware)
    .meta({
      openapi: {
        method: 'POST', path: '/v1/user/upsert-by-admin', summary: 'Update or create user by admin'
        , description: 'Update or create user by admin, need super admin permission', tags: ['User']
      }
    })
    .input(z.object({
      id: z.number().optional(),
      name: z.string().optional(),
      password: z.string().optional(),
      nickname: z.string().optional()
    }))
    .output(z.union([z.boolean(), z.any()]))
    .mutation(async ({ input }) => {
      return prisma.$transaction(async () => {
        const { id, nickname, name, password } = input

        const update: Prisma.accountsUpdateInput = {}
        const hasSameUser = await prisma.accounts.findFirst({ where: { name } })
        if (hasSameUser) {
          if (password) {
            if (hasSameUser && await verifyPassword(password, hasSameUser?.password ?? '')) {
              throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User and password already exists' });
            }
          }
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User and password already exists' });
        }
        if (id) {
          if (name) update.name = name
          if (password) {
            const passwordHash = await hashPassword(password)
            update.password = passwordHash
          }
          if (nickname) update.nickname = nickname
          await prisma.accounts.update({ where: { id }, data: update })
          return true
        } else {
          if (!password) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password is required' });
          }
          const passwordHash = await hashPassword(password!)
          const res = await prisma.accounts.create({ data: { name, password: passwordHash, nickname: name, role: 'user' } })
          await prisma.accounts.update({ where: { id: res.id }, data: { apiToken: await genToken({ id: res.id, name: name ?? '', role: 'user' }) } })
          return true
        }
      })
    }),
  generate2FASecret: authProcedure
    .input(z.object({
      name: z.string()
    }))
    .mutation(async ({ input }) => {
      const secret = generateTOTP();
      const qrCode = generateTOTPQRCode(input.name, secret);
      return { secret, qrCode };
    }),
  verify2FAToken: authProcedure.use(demoAuthMiddleware)
    .input(z.object({
      token: z.string(),
      secret: z.string()
    }))
    .mutation(async ({ input }) => {
      const isValid = verifyTOTP(input.token, input.secret);
      if (!isValid) {
        throw new Error('Invalid verification code');
      }
      return true;
    }),
  deleteUser: authProcedure.use(superAdminAuthMiddleware).use(demoAuthMiddleware)
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/v1/user/delete',
        summary: 'Delete user',
        description: 'Delete user and all related data, need super admin permission',
        tags: ['User']
      }
    })
    .input(z.object({
      id: z.number()
    }))
    .output(z.boolean())
    .mutation(async ({ input, ctx }) => {
      return prisma.$transaction(async () => {
        const { id } = input

        const userToDelete = await prisma.accounts.findFirst({
          where: { id }
        })



        if (!userToDelete) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found'
          })
        }

        if (userToDelete.role === 'superadmin') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete super admin account'
          })
        }

        if (userToDelete.id === Number(ctx.id)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete yourself'
          })
        }

        const userNotes = await prisma.notes.findMany({
          where: { accountId: id }
        })

        await deleteNotes(userNotes.map(note => note.id), ctx)

        await prisma.config.deleteMany({
          where: { userId: id }
        })

        await prisma.accounts.delete({
          where: { id }
        })

        return true
      })
    }),
})
