import { type PushMessage, type PushSubscription, buildPushPayload } from '@block65/webcrypto-web-push';
import type { NotificationEventData } from './notification';
import type { AppDatabase } from './db';
import { maybeBatch, type BatchCollector } from './BatchCollector';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { userDevicesTable } from '../../db/schema';

export async function triggerWebPush(
  env: Env,
  subscription: Omit<PushSubscription, 'expirationTime'>,
  message: PushMessage<NotificationEventData>,
) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VITE_VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  try {
    const payload = await buildPushPayload(message, { ...subscription, expirationTime: null }, vapid);
    //@ts-ignore tsconfig.app.json with "dom" lib is too strict, payload not allowed
    const res = await fetch(subscription.endpoint, payload);

    if (!res.ok) {
      // 404 or 410 means the subscription is permanently invalid/unsubscribed
      if (res.status === 404 || res.status === 410) {
        console.warn(`[Web Push] Subscription expired or unsubscribed. Status: ${res.status}`);
        return { success: false, isGone: true, status: res.status } as const;
      }

      if (res.status === 429) {
        console.warn(`[Web Push] Rate limited by provider.`);
      }

      const errorText = await res.text().catch(() => 'No response body');
      console.error(`[Web Push] Provider returned HTTP ${res.status}:`, errorText);

      return { success: false, isGone: false, status: res.status, error: errorText } as const;
    }

    return { success: true } as const;
  } catch (error) {
    console.error('[Web Push] Internal or network error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, isGone: false, error: errorMessage } as const;
  }
}

type GetWebPushSubscriptionCriteria = {
  userId: string;
  deviceId?: string;
};

export async function getWebPushSubscription(db: AppDatabase, criteria: GetWebPushSubscriptionCriteria) {
  const { userId, deviceId } = criteria;
  const [subscription] = await db
    .select({
      userId: userDevicesTable.userId,
      deviceId: userDevicesTable.deviceId,
      endpoint: sql<string>`${userDevicesTable.pushEndpoint}`,
      keys: {
        p256dh: sql<string>`${userDevicesTable.pushP256dh}`,
        auth: sql<string>`${userDevicesTable.pushAuth}`,
      },
    })
    .from(userDevicesTable)
    .where(
      and(
        eq(userDevicesTable.userId, userId),
        deviceId ? eq(userDevicesTable.deviceId, deviceId) : undefined,
        eq(userDevicesTable.showNotification, true),
        isNotNull(userDevicesTable.pushEndpoint),
        isNotNull(userDevicesTable.pushAuth),
        isNotNull(userDevicesTable.pushP256dh),
      ),
    )
    .orderBy(desc(userDevicesTable.lastUsedAt))
    .limit(1);

  return subscription;
}

type SubscriptionDetail = Awaited<ReturnType<typeof getWebPushSubscription>>;
type WebPushResult = Awaited<ReturnType<typeof triggerWebPush>>;

export async function processWebPushResult(
  db: AppDatabase,
  subscription: SubscriptionDetail,
  result: WebPushResult,
  collector?: BatchCollector,
) {
  const { userId, deviceId } = subscription;
  if (result.isGone) {
    await maybeBatch(
      collector,
      db
        .update(userDevicesTable)
        .set({ showNotification: false })
        .where(and(eq(userDevicesTable.userId, userId), eq(userDevicesTable.deviceId, deviceId))),
    );
  }
}
