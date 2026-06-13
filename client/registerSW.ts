import swUrl from './sw?worker&url';

async function registerServiceWorkerInternally() {
  try {
    return await navigator.serviceWorker.register(swUrl, { type: 'module' });
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw error;
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => registerServiceWorkerInternally());
}

export async function subscribeToPush() {
  try {
    const registration = await registerServiceWorkerInternally();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
    }

    return {
      endpoint: subscription.endpoint,
      key: subscription.getKey('p256dh'),
      auth: subscription.getKey('auth'),
    };
  } catch (error) {
    console.error('Service Worker registration / Push subscription failed:', error);
    throw error;
  }
}
