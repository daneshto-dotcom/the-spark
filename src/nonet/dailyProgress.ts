/**
 * SPARK — S196 #16: which UTC day's ranked DAILY this device has already solved.
 *
 * On the DEVICE, labelled as such — no account system invented before Steam (spec §(d).5). The
 * `displayPrefs.ts` pattern: every read and write try/caught, a malformed value reads as "none", the
 * title screen can never throw because someone edited localStorage.
 */
import { isDayKey } from './dailySeed.ts';

export const DAILY_PROGRESS_KEY = 'spark.nonet.daily.v1';

/** The last day key whose ranked daily was solved here, or null. */
export function loadDailySolvedKey(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(DAILY_PROGRESS_KEY);
    return typeof raw === 'string' && isDayKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Record that `dayKey`'s ranked daily was solved here. Silent on a blocked/full store. */
export function saveDailySolvedKey(dayKey: string): void {
  if (!isDayKey(dayKey)) return;
  try {
    globalThis.localStorage?.setItem(DAILY_PROGRESS_KEY, dayKey);
  } catch {
    /* private mode / quota — the next DAILY is simply ranked again */
  }
}
