import { createIttyAppRouter, withZod, type IttyCfArgs } from '#server/lib/itty.ts';
import { CHECKPOINT_EVENT_TYPE } from '#server/workflows/VersionTwoDataMigrator';
import { error, json, status, type IRequest, type RequestHandler } from 'itty-router';
import z from 'zod';

const withAdminCheck: RequestHandler<IRequest, IttyCfArgs> = (request, env) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.split(' ')[1];

  if (token !== env.ADMIN_API_KEY) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const adminApiRouter = createIttyAppRouter({ base: '/admin', before: [withAdminCheck] });

adminApiRouter.post(
  '/invoke-v2-migrator',
  withZod({
    body: z.object({
      maxCount: z.number(),
      maxCycle: z.number(),
      maxDelay: z.number(),
      after: z.string().optional(),
    }),
  }),
  async (request, env) => {
    const { body } = request.validated;
    const instance = await env.V2_MIGRATOR.create({ params: body });

    return json({ instanceId: instance.id });
  },
);

adminApiRouter.post(
  '/v2-migrator-checkpoint',
  withZod({
    body: z.object({
      instanceId: z.guid(),
      kill: z.boolean(),
    }),
  }),
  async (request, env) => {
    const { instanceId, kill } = request.validated.body;
    const instance = await env.V2_MIGRATOR.get(instanceId);
    if (!instance) {
      return error(404, `instance ${instanceId} not found`);
    }
    await instance.sendEvent({ type: CHECKPOINT_EVENT_TYPE, payload: { kill } });
    return status(204);
  },
);
