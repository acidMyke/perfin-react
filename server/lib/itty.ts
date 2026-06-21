import { z, type ZodType } from 'zod';
import { Router, type IRequestStrict, type RequestHandler, type RouterOptions } from 'itty-router';
import { createDatabase, type AppDatabase } from './db';
import { CookieHeaders, parseCookie } from './CookieHeaders';
import sessions from './sessions';

export type IttyCfArgs = [Env, ExecutionContext];

export type Context = {
  db: AppDatabase;
  req: Request;
  env: Env;
  wctx: ExecutionContext;
  url: URL;
  resHeaders: CookieHeaders;
  reqCookie: ReturnType<typeof parseCookie>;
} & Awaited<ReturnType<typeof sessions.check>>;

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
  then: <U>(middleware: RequestHandler<U, IttyCfArgs>) => ChainableHandler<T & U>;
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

        const result = schemas.body.safeParse(payload);

        if (!result.success) throw result.error;
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
      const result = schemas.query.safeParse(request.query);

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
      const result = schemas.params.safeParse(request.params);

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
