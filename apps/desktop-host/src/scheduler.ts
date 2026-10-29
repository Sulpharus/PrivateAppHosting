import type { Miniflare } from 'miniflare';

/** The cron triggers of apps/api/wrangler.jsonc: every minute, and the Calendar sync at minute 2 of every fifth. */
export const CRONS = ['* * * * *', '2-59/5 * * * *'] as const;

/** Whether the cron fires in this minute of the hour (only the two crons above exist). */
export function due(cron: (typeof CRONS)[number], minute: number): boolean {
  return cron === '* * * * *' ? true : minute >= 2 && (minute - 2) % 5 === 0;
}

/** Calls the API Worker's scheduled handler like Cloudflare's cron would. */
export function startScheduler(mf: Miniflare, now: () => Date = () => new Date()): NodeJS.Timeout {
  let last = -1;
  return setInterval(async () => {
    const at = now();
    const slot = Math.floor(at.getTime() / 60_000);
    if (slot === last) return;
    last = slot;
    try {
      const api = await mf.getWorker('api');
      for (const cron of CRONS)
        if (due(cron, at.getUTCMinutes()))
          await api.scheduled({ scheduledTime: new Date(slot * 60_000), cron });
    } catch (error) {
      console.error('scheduled run failed', error instanceof Error ? error.message : error);
    }
  }, 10_000);
}
