/** Haptics behind a tiny wrapper so Capacitor Haptics can replace it later. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* unsupported */ }
}
export const haptics = {
  land: () => vibrate(12),
  perfect: () => vibrate([20, 30, 20]),
  fail: () => vibrate(60),
  click: () => vibrate(6),
};
