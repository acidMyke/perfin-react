import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { drizzle } from 'drizzle-orm/d1';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import * as schema from '../db/schema';
import { type CookieHeaders } from './lib';
import sessions from './sessions';
import { $ZodError } from 'zod/v4/core';
import z from 'zod';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';

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

export type AppErrorShapeData = DefaultErrorShape['data'] & {
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
};

export class FormInputError extends Error {
  static readonly NAME = 'FormInputError';
  readonly _type = FormInputError.NAME;
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
  constructor(opts: {
    fieldErrors?: Record<string, string[]>;
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
      console.log('OK request:', meta);
    }
    return result;
  }
  return opts.next();
});

export const protectedProcedure = publicProcedure.use(async opts => {
  const { user, session, promises } = await sessions.resolve(opts.ctx);
  // resolve will throw if unauthenticated
  const res = opts.next({
    ctx: {
      user: user!,
      session: session!,
    },
  });

  if (promises?.length) {
    await Promise.all(promises);
  }

  return res;
});
