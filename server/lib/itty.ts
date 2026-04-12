import { z, type ZodType } from 'zod';
import { Router, type IRequest, type IRequestStrict, type RequestHandler, type RouterOptions } from 'itty-router';

export type IttyCfArgs = [Env, ExecutionContext];

export const createIttyAppRouter = <RequestType = IRequest, ResponseType = any>(
  options?: RouterOptions<RequestType, IttyCfArgs>,
) => Router<RequestType, IttyCfArgs, ResponseType>(options);

type WithZodSchemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export type ValidatedData<T extends WithZodSchemas> = {
  [K in keyof T]: T[K] extends ZodType ? z.infer<T[K]> : undefined;
};

export type ValidatedRequest<T extends WithZodSchemas> = IRequestStrict & { validated: ValidatedData<T> };

export const withZod = <T extends WithZodSchemas>(schemas: T): RequestHandler<ValidatedRequest<T>, IttyCfArgs> => {
  return async (request: IRequest) => {
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

    (request as any).validated = {
      body: parsedBody,
      query: parsedQuery,
      params: parsedParams,
    };
  };
};
