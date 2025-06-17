import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

export function createContextFactory(env: Env, ctx: ExecutionContext) {
  return function ({ req }: FetchCreateContextFnOptions) {
    return {
      req,
      env, // Cloudflare workers enviroment
      wctx: ctx, // Cloudflare workers context
    };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
