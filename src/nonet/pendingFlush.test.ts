/**
 * S196 MED-1 (audit) — a failed DAILY or STAGE submission must be delivered later. Those boards get no
 * "next submit to the same board" (a daily is ranked once a day; a stage board only after a re-try), so
 * every board's queue is flushed when ANY submit succeeds and when the NONET home opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { installFakeTextCanvas } from '../render/fakeTextCanvas.fixtures.ts';
import { RemoteLeaderboard, setLeaderboardForTests } from '../render/arcadeLeaderboard.ts';
import { loadPending, PENDING_MAX_AGE_MS, pendingBoardIds, savePending } from '../render/arcadeScores.ts';
import { mountNonetHome } from './homeScreen.ts';

installFakeTextCanvas();
vi.stubGlobal('requestAnimationFrame', () => 0);
vi.stubGlobal('cancelAnimationFrame', () => {});

const DAILY = 'nonet:d20261007';
const STAGE = 'nonet:s07';

function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

/** fetch: offline while `online()` is false; otherwise a 200 board. Records every POST's board + run ids. */
function stubNetwork(online: () => boolean): Array<{ board: string; ids: string[] }> {
  const posts: Array<{ board: string; ids: string[] }> = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    if (!online()) return Promise.reject(new Error('offline'));
    const board = decodeURIComponent(url.split('/board/')[1]!);
    const body = JSON.parse(String(init.body)) as { runs: Array<{ id: string; name: string; ms: number }> };
    posts.push({ board, ids: body.runs.map((r) => r.id) });
    const rows = body.runs.map((r) => ({ name: r.name, runs: 1, totalMs: r.ms }));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows }) } as Response);
  });
  return posts;
}

const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

beforeEach(installStorage);
afterEach(() => {
  setLeaderboardForTests(null);
  vi.unstubAllGlobals();
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('S196 MED-1 — undelivered DAILY / STAGE runs are delivered later', () => {
  it('a failed DAILY submit is delivered when the NONET HOME OPENS (the real page, its real flush)', async () => {
    let up = false;
    const posts = stubNetwork(() => up);
    const remote = new RemoteLeaderboard('https://lb.example');
    setLeaderboardForTests(remote);
    await remote.submit(DAILY, 'DAN', 61_000); // offline → queued
    const queued = loadPending(DAILY);
    expect(queued.length).toBe(1);
    expect(pendingBoardIds()).toContain(DAILY);

    up = true;
    const home = mountNonetHome(new Container(), { onDoor: () => {}, onBack: () => {} }, { loadHero: null, backdrop: false });
    home.show({ todayKey: '20261007', dailySolvedKey: '20261007' });
    await settle();
    expect(posts).toEqual([{ board: DAILY, ids: [queued[0]!.id] }]); // the SAME id — idempotent on the server
    expect(loadPending(DAILY)).toEqual([]);
  });

  it('a failed STAGE submit is delivered when a submit to ANOTHER board succeeds', async () => {
    let up = false;
    const posts = stubNetwork(() => up);
    const remote = new RemoteLeaderboard('https://lb.example');
    await remote.submit(STAGE, 'DAN', 90_000); // offline → queued
    const id = loadPending(STAGE)[0]!.id;
    up = true;
    await remote.submit('nonet', 'DAN', 70_000); // a PLAY run goes through…
    await settle();
    // …and carries the stage board's queue with it.
    expect(posts.map((p) => p.board)).toEqual(['nonet', STAGE]);
    expect(posts[1]!.ids).toEqual([id]);
    expect(loadPending(STAGE)).toEqual([]);
  });

  it('still offline: the run stays queued (nothing lost)', async () => {
    stubNetwork(() => false);
    const remote = new RemoteLeaderboard('https://lb.example');
    await remote.submit(DAILY, 'DAN', 61_000);
    expect(await remote.flushAllPending()).toBe(0);
    expect(loadPending(DAILY).length).toBe(1);
  });

  it('negative: a run older than PENDING_MAX_AGE_MS is NOT sent — it is dropped', async () => {
    const posts = stubNetwork(() => true);
    savePending([{ name: 'OLD', ms: 60_000, id: 'old-run', at: Date.now() - PENDING_MAX_AGE_MS - 1 }], STAGE);
    const remote = new RemoteLeaderboard('https://lb.example');
    expect(await remote.flushAllPending()).toBe(0);
    expect(posts).toEqual([]);
    expect(loadPending(STAGE)).toEqual([]);
  });

  it('a run queued WHILE a flush is in flight is kept', async () => {
    const remote = new RemoteLeaderboard('https://lb.example');
    savePending([{ name: 'AAA', ms: 60_000, id: 'r1', at: Date.now() }], DAILY);
    vi.stubGlobal('fetch', () => {
      // the player queues another run for the same board mid-request
      savePending([...loadPending(DAILY), { name: 'BBB', ms: 70_000, id: 'r2', at: Date.now() }], DAILY);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows: [] }) } as Response);
    });
    expect(await remote.flushAllPending()).toBe(1);
    expect(loadPending(DAILY).map((r) => r.id)).toEqual(['r2']);
  });
});

describe('S196 MED-A — a queued run is never in two OUTSTANDING POSTs (client half)', () => {
  /** fetch that never answers until `releaseAll()`; records each POST's board + run ids. */
  function deferredNetwork(): { posts: Array<{ board: string; ids: string[] }>; releaseAll: () => void } {
    const posts: Array<{ board: string; ids: string[] }> = [];
    const pending: Array<() => void> = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      const board = decodeURIComponent(url.split('/board/')[1]!);
      const body = JSON.parse(String(init.body)) as { runs: Array<{ id: string }> };
      posts.push({ board, ids: body.runs.map((r) => r.id) });
      return new Promise((resolve) => {
        pending.push(() => resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows: [] }) } as Response));
      });
    });
    return { posts, releaseAll: () => { for (const f of pending.splice(0)) f(); } };
  }
  const allIds = (posts: Array<{ ids: string[] }>): string[] => posts.flatMap((p) => p.ids);

  it('submit in flight, then the home-open flush → the flush does NOT re-send the queued run', async () => {
    savePending([{ name: 'DAN', ms: 60_000, id: 'r1', at: Date.now() }], 'nonet');
    const net = deferredNetwork();
    const remote = new RemoteLeaderboard('https://lb.example');
    const submitting = remote.submit('nonet', 'DAN', 70_000); // POST [r1, new] outstanding…
    await settle();
    await remote.flushAllPending(); // …and the NONET home opens (ESC during SAVING…)
    expect(net.posts.length).toBe(1);
    expect(net.posts[0]!.ids[0]).toBe('r1');
    expect(new Set(allIds(net.posts)).size).toBe(allIds(net.posts).length); // no id twice
    net.releaseAll();
    await submitting;
    await settle();
    expect(loadPending('nonet')).toEqual([]);
  });

  it('flush in flight, then a submit to the SAME board → the submit sends only its NEW run', async () => {
    savePending([{ name: 'DAN', ms: 60_000, id: 'r1', at: Date.now() }], STAGE);
    const net = deferredNetwork();
    const remote = new RemoteLeaderboard('https://lb.example');
    const flushing = remote.flushAllPending(); // POST [r1] outstanding
    await settle();
    const submitting = remote.submit(STAGE, 'DAN', 90_000);
    await settle();
    expect(net.posts.length).toBe(2);
    expect(net.posts[0]!.ids).toEqual(['r1']);
    expect(net.posts[1]!.ids).not.toContain('r1');
    expect(net.posts[1]!.ids.length).toBe(1);
    net.releaseAll();
    await Promise.all([flushing, submitting]);
    await settle();
    // and r1 is not resurrected by the submit's save
    expect(loadPending(STAGE)).toEqual([]);
  });
});
