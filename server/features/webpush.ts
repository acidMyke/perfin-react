import { protectedProcedure } from '#server/lib/trpc';
import z from 'zod';

const getWebPushSettingProcedure = protectedProcedure.query(() => {
  return { isSubscribed: false, isEnabled: false };
});

const setupWebPushProcedure = protectedProcedure
  .input(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const { db, userId, deviceId } = ctx;
    const { endpoint, p256dh, auth } = input;
  });

const disableWebPushSettingProcedure = protectedProcedure.mutation(async ({ ctx }) => {
  const { db, userId, deviceId } = ctx;
});

export default {
  get: getWebPushSettingProcedure,
  setup: setupWebPushProcedure,
  disable: disableWebPushSettingProcedure,
};
