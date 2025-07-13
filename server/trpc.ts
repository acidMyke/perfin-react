import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';

export function createContextFactory(env: Env, ctx: ExecutionContext) {
  const db = drizzle(env.db, {
    logger: import.meta.env.DEV,
    casing: 'snake_case',
    schema,
  });
  return function ({ req }: FetchCreateContextFnOptions) {
    return {
      db,
      req,
      env, // Cloudflare workers enviroment
      wctx: ctx, // Cloudflare workers context
    };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure.use(async opts => {
  if (import.meta.env.DEV) {
    const start = Date.now();
    const result = await opts.next();
    const durationMs = Date.now() - start;
    const meta = { path: opts.path, type: opts.type, durationMs };
    result.ok ? console.log('OK request timing:', meta) : console.error('Non-OK request timing', meta);
    return result;
  } else {
    return opts.next();
  }
});
