/**
 * SPARK — S196 #16 Option B: **CAMPAIGN PROGRESS, ON THIS DEVICE.**
 *
 * R196-D2 (6e): progress lives on the device under `spark.nonet.progress.v1`, try/caught like
 * `displayPrefs.ts`, and is LABELLED "this device" wherever it is shown. No account system is invented
 * before Steam — it would only be unpicked at Steam login.
 *
 * Everything but `load`/`save` is pure; a malformed or hand-edited value parses to the nearest sane
 * progress rather than throwing, because the title screen must never be able to crash on storage.
 */
import { CAMPAIGN_STAGE_COUNT } from './campaign.ts';

export const CAMPAIGN_PROGRESS_KEY = 'spark.nonet.progress.v1';

export interface CampaignProgress {
  /** The highest stage you may play (1..30). Clearing stage n unlocks n+1. */
  readonly unlocked: number;
  /** Best stars per stage, index = id − 1, each 0..3. Always `CAMPAIGN_STAGE_COUNT` long. */
  readonly stars: readonly number[];
}

export const FRESH_PROGRESS: CampaignProgress = { unlocked: 1, stars: new Array<number>(CAMPAIGN_STAGE_COUNT).fill(0) };

/** PURE — total ⇒ never throws; anything odd collapses to the nearest valid progress. */
export function parseProgress(raw: unknown): CampaignProgress {
  if (typeof raw !== 'object' || raw === null) return FRESH_PROGRESS;
  const u = Number((raw as { unlocked?: unknown }).unlocked);
  const unlocked = Number.isInteger(u) ? Math.min(CAMPAIGN_STAGE_COUNT, Math.max(1, u)) : 1;
  const src = (raw as { stars?: unknown }).stars;
  const stars = new Array<number>(CAMPAIGN_STAGE_COUNT).fill(0);
  if (Array.isArray(src)) {
    for (let i = 0; i < CAMPAIGN_STAGE_COUNT; i++) {
      const s = Number(src[i]);
      stars[i] = Number.isInteger(s) ? Math.min(3, Math.max(0, s)) : 0;
    }
  }
  return { unlocked, stars };
}

/** PURE — fold a clear of stage `id` with `got` stars (1..3). Stars only ever go up. */
export function recordClear(p: CampaignProgress, id: number, got: number): CampaignProgress {
  if (!Number.isInteger(id) || id < 1 || id > CAMPAIGN_STAGE_COUNT || got < 1) return p;
  if (id > p.unlocked) return p; // a stage you could not have played does not count
  const stars = [...p.stars];
  stars[id - 1] = Math.max(stars[id - 1] ?? 0, Math.min(3, got));
  return { unlocked: Math.min(CAMPAIGN_STAGE_COUNT, Math.max(p.unlocked, id + 1)), stars };
}

/** PURE — total stars banked (out of 90). */
export function totalStars(p: CampaignProgress): number {
  return p.stars.reduce((a, b) => a + b, 0);
}

/** PURE — is every stage cleared? */
export function campaignComplete(p: CampaignProgress): boolean {
  return p.stars.every((s) => s > 0);
}

/**
 * PURE — the stage the CAMPAIGN door plays: the highest unlocked stage. After the last stage is
 * cleared it stays on 30 (replays it).
 */
export function currentStage(p: CampaignProgress): number {
  return p.unlocked;
}

export function loadProgress(): CampaignProgress {
  try {
    const raw = globalThis.localStorage?.getItem(CAMPAIGN_PROGRESS_KEY);
    if (raw === null || raw === undefined) return FRESH_PROGRESS;
    return parseProgress(JSON.parse(raw));
  } catch {
    return FRESH_PROGRESS;
  }
}

export function saveProgress(p: CampaignProgress): void {
  try {
    globalThis.localStorage?.setItem(CAMPAIGN_PROGRESS_KEY, JSON.stringify({ unlocked: p.unlocked, stars: p.stars }));
  } catch {
    /* private mode / quota — this session's progress simply is not kept */
  }
}
