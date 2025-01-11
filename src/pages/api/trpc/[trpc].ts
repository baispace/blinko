import * as trpcNext from '@trpc/server/adapters/next';
import { createContext } from '@/server/context';
import { appRouter } from '@/server/routers/_app';

export default trpcNext.createNextApiHandler({
  router: appRouter,
  /**
   * @link https://trpc.io/docs/context
   */
  createContext,
  /**
   * @link https://trpc.io/docs/error-handling
   */
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
  responseMeta({ ctx, paths, type, errors }) {
    if (errors.length) {
      return {};
    }
    
    const allOps = appRouter._def.procedures;
    const meta = paths?.reduce((acc, path) => {
      const procedure = allOps[path];
      if (procedure?._def?.headers || procedure?._def?.meta?.headers) {
        return { 
          ...acc, 
          ...procedure._def.headers,
          ...procedure._def.meta?.headers 
        };
      }
      return acc;
    }, {});

    return {
      headers: {
        ...(meta || {})
      },
    };
  },
  /**
   * Enable query batching
   */
  batching: {
    enabled: true,
  },
});
