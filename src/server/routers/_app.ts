/**
 * This file contains the root router of your tRPC-backend
 */
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { router, t } from '../trpc';
import { Context } from '../context';
import { lazy } from '@trpc/server';
import { noteRouter } from './note';
import { configRouter } from './config';
import { followsRouter } from './follows';
import { notificationRouter } from './notification';

export const appRouter = router({
  ai: lazy(() => import('./ai')),
  notes: noteRouter,
  tags: lazy(() => import('./tag')),
  users: lazy(() => import('./user')),
  attachments: lazy(() => import('./attachment')),
  config: configRouter,
  public: lazy(() => import('./public')),
  task: lazy(() => import('./task')),
  analytics: lazy(() => import('./analytics')),
  comments: lazy(() => import('./comment')),
  follows: followsRouter,
  notifications: notificationRouter,
  plugin: lazy(() => import('./plugin')),
  conversation: lazy(() => import('./conversation')),
  message: lazy(() => import('./message')),
});

export const createCaller = t.createCallerFactory(appRouter);

//not recommend to use this
export const adminCaller = createCaller({ id: '1', name: 'admin', sub: '1', role: 'superadmin', exp: 0, iat: 0 });

export const userCaller = (ctx: Context) => {
  return createCaller(ctx);
};

export type AppRouter = typeof appRouter;
export type RouterOutput = inferRouterOutputs<AppRouter>;
export type RouterInput = inferRouterInputs<AppRouter>;
