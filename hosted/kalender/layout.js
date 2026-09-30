// Day and week columns: overlapping timed events sit side by side in lanes.

/**
 * Assigns `lane` and `lanes` to timed items of one day ({ start, end } as Date), so that
 * overlapping ones share the width. Items are grouped into clusters of overlaps.
 */
export function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [];
  let lanesEnd = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const item of cluster) item.lanes = lanesEnd.length;
    cluster = [];
    lanesEnd = [];
  };
  for (const item of sorted) {
    const start = item.start.getTime();
    const end = Math.max(item.end.getTime(), start + 15 * 60_000);
    if (start >= clusterEnd) flush();
    let lane = lanesEnd.findIndex((e) => e <= start);
    if (lane < 0) {
      lane = lanesEnd.length;
      lanesEnd.push(end);
    } else lanesEnd[lane] = end;
    const placed = { ...item, lane };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

/** Monday of the week that contains `d` (00:00 local). */
export function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** ISO 8601 week number. */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7);
}

/** The 6×7 days shown for a month (weeks start on Monday). */
export function monthGrid(year, month) {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  );
}
