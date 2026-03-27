import { Router, type IRequest, type RouterOptions } from 'itty-router';

export type IttyCfArgs = [Env, ExecutionContext];

export const createIttyAppRouter = <RequestType = IRequest, ResponseType = any>(
  options?: RouterOptions<RequestType, IttyCfArgs>,
) => Router<RequestType, IttyCfArgs, ResponseType>(options);
