import { initTRPC, TRPCError, type inferProcedureBuilderResolverOptions } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { parseCookie, type CookieHeaders } from './CookieHeaders';
import sessions from './sessions';
import { $ZodError } from 'zod/v4/core';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { createDatabase } from './db';
import ErrorCodes from './ErrorCodes';

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
    const shapeData: AppErrorShapeData = {
      ...shape.data,
    };

    if (isFormInputError(error.cause)) {
      const { fieldErrors, formErrors } = error.cause;
      shapeData.fieldErrors = fieldErrors;
      shapeData.formErrors = formErrors;
    }

    if (error.cause instanceof $ZodError) {
      shapeData.fieldErrors = {};
      for (const { path, message } of error.cause.issues) {
        if (path.length === 0) {
          // Form level issue
          if (shapeData.formErrors) {
            shapeData.formErrors.push(message);
          } else {
            shapeData.formErrors = [message];
          }
        } else {
          const fullpath = path.map(key => (typeof key === 'number' ? `[${key}]` : key)).join('.');

          // ensure array exists
          if (shapeData.fieldErrors == undefined) {
            shapeData.fieldErrors = { [fullpath]: [message] };
          } else if (fullpath in shapeData.fieldErrors && shapeData.fieldErrors[fullpath]) {
            shapeData.fieldErrors[fullpath]!.push(message);
          } else {
            shapeData.fieldErrors[fullpath] = [message];
          }
          shapeData.fieldErrors ??= {};
          shapeData.fieldErrors[fullpath] ??= [];
        }
      }
    }

    return {
      ...shape,
      data: shapeData,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure.use(async opts => {
  const result = await opts.next();
  console.log();
  if (!result.ok) {
    // result.error is TRPCError
    const { cause: innerCause, code, message } = result.error;
    if (code == 'INTERNAL_SERVER_ERROR') {
      // innerCause can be DrizzleQueryError
      if (innerCause instanceof DrizzleQueryError) {
        // Which has error that is throw by D1
        // https://developers.cloudflare.com/d1/observability/debug-d1/
        const d1Error = innerCause.cause as Error;
        // Which has error that is throw internally
        const dbError = d1Error.cause as Error;
        console.error('SQLite error: ', dbError);
        return {
          ok: false,
          marker: result.marker,
          error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: ErrorCodes.SQLITE_ERROR }),
        };
      }
      console.error('Unhandled error: ', innerCause);
      return {
        ok: false,
        marker: result.marker,
        error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: ErrorCodes.UNHANDLED_EXCEPTION }),
      };
    }
    console.warn('Non-ok response: ', { code, path: opts.path, input: opts.input, message });
  }
  return result;
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
    throw new TRPCError({ code: 'FORBIDDEN', message: ErrorCodes.CSRF_FAILED });
  }

  return opts.next({
    ctx: opts.ctx,
  });
});

export const elevatedProcedure = protectedProcedure.use(async opts => {
  if (!opts.ctx.isAllowElevated) {
    throw new TRPCError({ code: 'FORBIDDEN', message: ErrorCodes.ELEVATION_REQUIRED });
  }

  return opts.next({
    ctx: opts.ctx,
  });
});

export type ProtectedContext = inferProcedureBuilderResolverOptions<typeof protectedProcedure>['ctx'];
