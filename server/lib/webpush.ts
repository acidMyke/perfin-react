import { type PushMessage, type PushSubscription, buildPushPayload } from '@block65/webcrypto-web-push';
import type { NotificationEventData } from './notification';

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
        return { success: false, isGone: true, status: res.status };
      }

      if (res.status === 429) {
        console.warn(`[Web Push] Rate limited by provider.`);
      }

      const errorText = await res.text().catch(() => 'No response body');
      console.error(`[Web Push] Provider returned HTTP ${res.status}:`, errorText);

      return { success: false, isGone: false, status: res.status, error: errorText };
    }

    return { success: true };
  } catch (error) {
    console.error('[Web Push] Internal or network error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, isGone: false, error: errorMessage };
  }
}
