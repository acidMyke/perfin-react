import { z, type ZodType } from 'zod';
import { error, Router, type IRequestStrict, type RequestHandler, type RouterOptions } from 'itty-router';
import { createDatabase, type AppDatabase } from './db';
import { CookieHeaders, parseCookie } from './CookieHeaders';
import sessions, { type SessionCheckResult } from './sessions';
import ErrorCodes from './ErrorCodes';

export type IttyCfArgs = [Env, ExecutionContext];

export type Context = {
  db: AppDatabase;
  req: Request;
  env: Env;
  wctx: ExecutionContext;
  url: URL;
  resHeaders: CookieHeaders;
  reqCookie: ReturnType<typeof parseCookie>;
} & SessionCheckResult;

export type RequestWithContext = IRequestStrict & { context: Context };

export const withContext: RequestHandler<RequestWithContext, IttyCfArgs> = async (req, env, wctx) => {
  const db = createDatabase(env);
  const reqCookie = parseCookie(req);
  const resHeaders = new CookieHeaders();
  const url = new URL(req.url);
  const checkResult = await sessions.check(db, req, env, resHeaders, reqCookie);

  req.context = { db, req, env, wctx, url, resHeaders, reqCookie, ...checkResult };
};

export const createIttyAppRouter = <ResponseType = any>(options?: RouterOptions<RequestWithContext, IttyCfArgs>) =>
  Router<RequestWithContext, IttyCfArgs, ResponseType>(options);

// Middleware chaining and types propagations

type ChainableHandler<T> = RequestHandler<T, IttyCfArgs> & {
  then: <U>(nextHandler: RequestHandler<U, IttyCfArgs>) => ChainableHandler<T & U>;
};

export function chainHandler<T>(handler: RequestHandler<T>): ChainableHandler<T> {
  const _h: RequestHandler<T, IttyCfArgs> = (req: T, ...args) => handler(req, ...args);

  const then = <U>(nextHandler: RequestHandler<U, IttyCfArgs>) => {
    const _ch: RequestHandler<T & U, IttyCfArgs> = async (req, ...args) =>
      (await _h(req, ...args)) ?? (await nextHandler(req, ...args));
    return chainHandler(_ch) as ChainableHandler<T & U>;
  };

  return Object.assign(_h, { then }) as ChainableHandler<T>;
}

type Middleware<T> = RequestHandler<RequestWithContext & T, IttyCfArgs>;

export function withProperty<TKey extends string, TResult>(
  key: TKey,
  resolver: (request: RequestWithContext, ...args: IttyCfArgs) => TResult,
): Middleware<Record<TKey, Awaited<TResult>>> {
  return async (request, ...args) => {
    (request as any)[key] = await resolver(request, ...args);
  };
}

// Zod Middleware

type WithZodSchemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export type ValidatedData<T extends WithZodSchemas> = {
  [K in keyof T]: T[K] extends ZodType ? z.infer<T[K]> : undefined;
};

export type ValidatedRequest<T extends WithZodSchemas> = RequestWithContext & { validated: ValidatedData<T> };

export const withZod = <T extends WithZodSchemas>(schemas: T): Middleware<ValidatedRequest<T>> => {
  return async request => {
    let parsedBody: any = undefined;
    let parsedQuery: any = undefined;
    let parsedParams: any = undefined;

    if (schemas.body) {
      try {
        const contentType = request.headers.get('content-type') ?? '';
        let payload: any;

        if (contentType.includes('application/json')) {
          payload = await request.json();
        } else if (
          contentType.includes('multipart/form-data') ||
          contentType.includes('application/x-www-form-urlencoded')
        ) {
          payload = await request.formData();
        } else {
          return new Response(JSON.stringify({ error: 'Invalid body' }), {
            status: 415,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const result = await schemas.body.safeParseAsync(payload);

        if (!result.success) {
          return new Response(JSON.stringify({ error: 'Invalid body', issue: result.error.issues }), {
            status: 415,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        parsedBody = result.data;
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: 'Invalid body',
            issues: err?.issues ?? [],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    if (schemas.query) {
      const result = await schemas.query.safeParseAsync(request.query);

      if (!result.success) {
        return new Response(
          JSON.stringify({
            error: 'Invalid query',
            issues: result.error.issues,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      parsedQuery = result.data;
    }

    if (schemas.params) {
      const result = await schemas.params.safeParseAsync(request.params);

      if (!result.success) {
        return new Response(
          JSON.stringify({
            error: 'Invalid params',
            issues: result.error.issues,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      parsedParams = result.data;
    }

    request.validated = {
      body: parsedBody,
      query: parsedQuery,
      params: parsedParams,
    } as ValidatedData<T>;
  };
};

type WithAuthOptions = {
  requiresElevation?: boolean;
};

type ProtectedContext<T extends WithAuthOptions> = Extract<Context, { isAuthenticated: true }> & {
  isAllowElevated: T['requiresElevation'] extends true ? true : boolean;
};

export type RequestWithProtectedContext<T extends WithAuthOptions> = IRequestStrict & { context: ProtectedContext<T> };

export const withAuth = <T extends WithAuthOptions>(options?: T): Middleware<{ context: ProtectedContext<T> }> => {
  return request => {
    if (!request.context.isAuthenticated) {
      return error(401, import.meta.env.DEV ? request.context.authFailureReason : undefined);
    }

    if (request.method !== 'GET' && !request.context.isCsrfValid) {
      return error(403, ErrorCodes.CSRF_FAILED);
    }

    if (options?.requiresElevation && !request.context.isAllowElevated) {
      return error(403, ErrorCodes.ELEVATION_REQUIRED);
    }

    request.context = request.context;
  };
};
