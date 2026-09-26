import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** One light tap on drawer open. iOS only: Safari has no vibration API, so the web build skips it. */
export function lightHaptic(): void {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
