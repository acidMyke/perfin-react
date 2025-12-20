import { initTRPC, TRPCError, type inferProcedureBuilderResolverOptions } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { parseCookie, type CookieHeaders } from './CookieHeaders';
import sessions from './sessions';
import { $ZodError } from 'zod/v4/core';
import z from 'zod';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { format } from 'date-fns/format';
import { createDatabase } from './db';

export function createContextFactory(env: Env, ctx: ExecutionContext, resHeaders: CookieHeaders) {
  const db = createDatabase(env);
  return async function ({ req }: FetchCreateContextFnOptions) {
    const reqCookie = parseCookie(req);
    const checkResult = await sessions.check(db, req, env, resHeaders, reqCookie);

    return {
      db,
      req,
      env, // Cloudflare workers enviroment
      wctx: ctx, // Cloudflare workers context
      url: new URL(req.url),
      resHeaders,
      ...checkResult,
      reqCookie,
    };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;

export type AppErrorShapeData = DefaultErrorShape['data'] & {
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
};

export class FormInputError extends Error {
  static readonly NAME = 'FormInputError';
  readonly _type = FormInputError.NAME;
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
  constructor(opts: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
    message?: string;
    cause?: Error;
  }) {
    const { message, cause, fieldErrors, formErrors } = opts;
    super(message, { cause });
    this.fieldErrors = fieldErrors;
    this.formErrors = formErrors;
  }
}

function isFormInputError(cause: any): cause is FormInputError {
  return typeof cause == 'object' && '_type' in cause && cause['_type'] === FormInputError.NAME;
}

const t = initTRPC.context<Context>().create({
  isDev: import.meta.env.DEV,
  errorFormatter(opts) {
    const { error, shape } = opts;
    const newShapeData: AppErrorShapeData = {
      ...shape.data,
    };

    if (isFormInputError(error.cause)) {
      const { fieldErrors, formErrors } = error.cause;
      newShapeData.fieldErrors = fieldErrors;
      newShapeData.formErrors = formErrors;
    }

    if (error.cause instanceof $ZodError) {
      const { fieldErrors, formErrors } = z.flattenError(error.cause);
      newShapeData.fieldErrors = fieldErrors;
      newShapeData.formErrors = formErrors;
    }

    return {
      ...shape,
      data: newShapeData,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure.use(async opts => {
  if (import.meta.env.DEV) {
    const start = Date.now();
    console.log(format(start, 'yyyy-MM-dd HH:mm:ss'), opts.path, opts.input);
    const result = await opts.next();
    const durationMs = Date.now() - start;
    const meta: Record<string, any> = { path: opts.path, type: opts.type, durationMs };
    if (!result.ok) {
      // result.error is TRPCError
      const { cause: innerCause, code } = result.error;
      if (code == 'INTERNAL_SERVER_ERROR') {
        // innerCause can be DrizzleQueryError
        if (innerCause instanceof DrizzleQueryError) {
          // Which has error that is throw by D1
          // https://developers.cloudflare.com/d1/observability/debug-d1/
          const d1Error = innerCause.cause as Error;
          // Which has error that is throw internally
          const dbError = d1Error.cause as Error;
          meta.innerCause = 'DB Error: ' + dbError.message;
          return {
            ok: false,
            error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: dbError }),
            marker: result.marker,
          };
        }
      }
      console.error('Non-OK request:', meta);
    } else {
      console.info('OK request:', meta);
    }
    return result;
  }
  return opts.next();
});

export const protectedProcedure = publicProcedure.use(async opts => {
  if (!opts.ctx.isAuthenticated) {
    // Throw when unauthenticated
    if (import.meta.env.DEV) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: opts.ctx.authFailureReason });
    }
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  if (opts.type === 'mutation' && !opts.ctx.isCsrfValid) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'CSRF verification failed' });
  }

  return opts.next({
    ctx: opts.ctx,
  });
});

export type ProtectedContext = inferProcedureBuilderResolverOptions<typeof protectedProcedure>['ctx'];
