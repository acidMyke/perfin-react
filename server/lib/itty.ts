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

type WithZodSchemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export type ValidatedData<T extends WithZodSchemas> = {
  [K in keyof T]: T[K] extends ZodType ? z.infer<T[K]> : undefined;
};

export type ValidatedRequest<T extends WithZodSchemas> = RequestWithContext & { validated: ValidatedData<T> };

export const withZod = <T extends WithZodSchemas>(schemas: T): RequestHandler<ValidatedRequest<T>, IttyCfArgs> => {
  return async request => {
    let parsedBody: any = undefined;
    let parsedQuery: any = undefined;
    let parsedParams: any = undefined;

    if (schemas.body) {
      try {
        const json = await request.json();
        const result = schemas.body.safeParse(json);

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
      const url = new URL(request.url);
      const queryObj = Object.fromEntries(url.searchParams);

      const result = schemas.query.safeParse(queryObj);
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
      const result = schemas.params.safeParse((request as any).params || {});

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
