import { protectedProcedure } from '#server/lib/trpc';
import z from 'zod';
import { userDevicesTable } from '../../db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

const getWebPushSettingProcedure = protectedProcedure.query(async ({ ctx }) => {
  const { db, userId, deviceId } = ctx;
  const [{ isEnabled = false } = {}] = await db
    .select({ isEnabled: sql`1`.mapWith(Boolean) })
    .from(userDevicesTable)
    .where(
      and(
        eq(userDevicesTable.userId, userId),
        eq(userDevicesTable.deviceId, deviceId),
        eq(userDevicesTable.showNotification, true),
        isNotNull(userDevicesTable.push_endpoint),
        isNotNull(userDevicesTable.push_auth),
        isNotNull(userDevicesTable.push_p256dh),
      ),
    )
    .limit(1);

  return { isEnabled };
});

const setupWebPushProcedure = protectedProcedure
  .input(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const { db, userId, deviceId } = ctx;
    const { endpoint, p256dh, auth } = input;

    await db
      .update(userDevicesTable)
      .set({
        showNotification: true,
        push_endpoint: endpoint,
        push_auth: auth,
        push_p256dh: p256dh,
      })
      .where(and(eq(userDevicesTable.userId, userId), eq(userDevicesTable.deviceId, deviceId)));
  });

const disableWebPushSettingProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  const { db, userId, deviceId } = ctx;

  await db
    .update(userDevicesTable)
    .set({ showNotification: false })
    .where(and(eq(userDevicesTable.userId, userId), eq(userDevicesTable.deviceId, deviceId)));
});

export default {
  get: getWebPushSettingProcedure,
  setup: setupWebPushProcedure,
  disable: disableWebPushSettingProcedure,
};
