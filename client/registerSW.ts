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

const bufferToBase64Url = (buffer: ArrayBuffer | null) => {
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

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

    const endpoint = subscription.endpoint;
    const p256dh = bufferToBase64Url(subscription.getKey('p256dh'));
    const auth = bufferToBase64Url(subscription.getKey('auth'));

    if (!p256dh || !auth) {
      throw 'Missing keys';
    }

    return { endpoint, p256dh, auth };
  } catch (error) {
    console.error('Service Worker registration / Push subscription failed:', error);
    throw error;
  }
}
