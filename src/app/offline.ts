import { Capacitor } from '@capacitor/core';

/**
 * Mobile web only: the service worker caches the whole build (about 9 MB with the dictionary) on the
 * first visit, so the app then runs with no network. It also asks Safari not to evict the storage.
 * The iOS app bundles everything and needs neither.
 */
export function registerOffline(): void {
  if (Capacitor.isNativePlatform() || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {});
    void navigator.storage?.persist?.().catch(() => false);
  });
}
