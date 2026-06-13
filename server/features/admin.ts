import { createIttyAppRouter, withZod, type IttyCfArgs } from '#server/lib/itty.ts';
import { NotificationEventDataSchema } from '#server/lib/notification';
import { CHECKPOINT_EVENT_TYPE, VersionTwoDataMigratorParamSchema } from '#server/workflows/VersionTwoDataMigrator';
import { error, json, status, type IRequest, type RequestHandler } from 'itty-router';
import z from 'zod';
import { userDevicesTable } from '../../db/schema';
import { createDatabase } from '#server/lib/db';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { triggerWebPush } from '#server/lib/webpush';

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
    body: VersionTwoDataMigratorParamSchema,
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

adminApiRouter.post(
  '/web-push-test',
  withZod({
    body: z.object({
      userId: z.nanoid(),
      ...NotificationEventDataSchema.shape,
    }),
  }),
  async (request, env) => {
    const { userId, ...others } = request.validated.body;
    const db = createDatabase(env);
    const [subscription] = await db
      .select({
        endpoint: sql<string>`${userDevicesTable.push_endpoint}`,
        keys: {
          p256dh: sql<string>`${userDevicesTable.push_p256dh}`,
          auth: sql<string>`${userDevicesTable.push_auth}`,
        },
      })
      .from(userDevicesTable)
      .where(
        and(
          eq(userDevicesTable.userId, userId),
          eq(userDevicesTable.showNotification, true),
          isNotNull(userDevicesTable.push_endpoint),
          isNotNull(userDevicesTable.push_auth),
          isNotNull(userDevicesTable.push_p256dh),
        ),
      )
      .orderBy(desc(userDevicesTable.lastUsedAt))
      .limit(1);

    if (!subscription) {
      return error(404, `user ${userId} may not exists / have register for notification`);
    }

    const result = await triggerWebPush(env, subscription, { data: others });
    return json(result);
  },
);
