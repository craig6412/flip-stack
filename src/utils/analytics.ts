/**
 * Local-first analytics (Phase 4.3). Logs to console in dev and keeps a
 * ring buffer in localStorage so a real backend can drain it later.
 */
export type AnalyticsEvent =
  | 'run_start'
  | 'run_end'
  | 'tutorial_step'
  | 'mission_complete'
  | 'shop_purchase'
  | 'continue_used';

const KEY = 'flipstack.analytics';
const MAX_EVENTS = 200;

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  const entry = { event, props, at: new Date().toISOString() };
  if (import.meta.env.DEV) console.log('[analytics]', event, props);
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    list.push(entry);
    while (list.length > MAX_EVENTS) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}
