import swUrl from './sw?worker&url';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(swUrl, { type: 'module' });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}
