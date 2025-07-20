import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { CookieHeaders } from './lib';

export function createContextFactory(env: Env, ctx: ExecutionContext, resHeaders: CookieHeaders) {
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
      resHeaders,
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

export const protectedProcedure = publicProcedure.use(async opts => {
  const { req, env, db } = opts.ctx;
  let token: undefined | string;
  let failureReason = '';
  const cookieHeader = req.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(cookie => cookie.trim());

    if (cookies.length === 0) {
      failureReason = 'Empty cookie header';
    }

    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split('=');
      if (name === env.TOKEN_COOKIE_NAME) {
        token = decodeURIComponent(rest.join('='));
      }
    }
  } else {
    failureReason = 'Missing cookie header';
  }

  if (token) {
    const session = await db.query.sessionsTable.findFirst({
      where: (session, { eq, gt, and }) => and(eq(session.token, token), gt(session.expiresAt, new Date())),
      columns: { createdAt: true, expiresAt: true, lastUsedAt: true },
      with: {
        user: { columns: { id: true, name: true } },
      },
    });

    if (session) {
      opts.next({
        ctx: {
          user: session.user,
          session,
        },
      });
    } else {
      failureReason = 'Unable to find token';
    }
  } else {
    failureReason = 'Missing token';
  }

  if (import.meta.env.DEV) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: failureReason });
  }
  throw new TRPCError({ code: 'UNAUTHORIZED' });
});
