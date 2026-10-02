// Course prices and German money input. Pure functions, loaded before core.js; the editor, the
// detail view and the statistics all use the same rule, and test/price.test.js checks it.
/* ---------- course price ---------- */

/* Splits a course price over its sessions.
   - course: { price, priceType: 'total' | 'month' }
   - dates: every course session date (yyyy-mm-dd, sorted), cancelled ones included
   - cancelled: Set of cancelled dates
   Whole course: the price is shared by the sessions that take place.
   Monthly fee: it is due for every calendar month that has course sessions, and shared by that
   month's sessions that take place. A month whose sessions were all cancelled still costs the
   fee; it is booked on that month's first session date, so the shares always add up to the
   total. Returns null without a price or without sessions. */
function splitCoursePrice(course, dates, cancelled) {
  const price = +(course && course.price) || 0;
  if (!(price > 0) || !dates.length) return null;
  const taking = dates.filter((d) => !cancelled.has(d)),
    per = new Map();
  let total = price;
  if (course.priceType === 'month') {
    const months = new Map();
    for (const d of dates) {
      const m = d.slice(0, 7);
      if (!months.has(m)) months.set(m, []);
      months.get(m).push(d);
    }
    total = price * months.size;
    for (const list of months.values()) {
      const held = list.filter((d) => !cancelled.has(d));
      if (held.length) for (const d of held) per.set(d, price / held.length);
      else per.set(list[0], price);
    }
  } else if (taking.length) for (const d of taking) per.set(d, price / taking.length);
  else return null;
  return {
    price,
    type: course.priceType === 'month' ? 'month' : 'total',
    total,
    months: course.priceType === 'month' ? new Set(dates.map((d) => d.slice(0, 7))).size : 0,
    sessions: taking.length,
    cancelled: dates.length - taking.length,
    avg: taking.length ? total / taking.length : null,
    per,
  };
}

/* Money input in German or English notation: "1.200", "1.200,50", "12,5", "8.50", "1,200.50" (a
   dot or comma followed by exactly three digits is a thousands separator). NaN for anything else,
   e.g. "12abc". */
function parseEuro(text) {
  const s = String(text ?? '')
    .replace(/\s|€/g, '')
    .trim();
  if (!s) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return +s.replace(/\./g, '').replace(',', '.');
  if (/^\d+(,\d{1,2})?$/.test(s)) return +s.replace(',', '.');
  if (/^\d+\.\d{1,2}$/.test(s)) return +s;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return +s.replace(/,/g, '');
  return NaN;
}
