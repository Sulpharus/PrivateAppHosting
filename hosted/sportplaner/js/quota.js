// Memberships with credits or a visit allowance (Urban Sports Club, ClassPass, a studio's 10 visits a
// month): the membership (a "plan") says what it allows, each activity that belongs to it says what
// it costs or how often it may be visited. The sheets of the activity ask for it when the
// membership is chosen; every visit is checked against it and the use of the month is shown.
//
//   plan.quota = { mode: 'none' | 'credits' | 'visits', month: n, day: n }
//     credits: `month` = credits per month; visits: `month` = visits per month; 0 = no limit
//     `day` = visits per day over all activities of the plan; 0 = no limit
//   plan.links[activityId] = { credits: n, month: n }
//     credits = what one visit costs (credits mode); month = visits per month of this activity

const QUOTA_MODES = ['none', 'credits', 'visits'];
const wholeNumber = (v) => Math.max(0, Math.min(100000, Math.floor(Number(v)) || 0));

const planQuota = (p) => {
  const q = (p && p.quota) || {};
  return {
    mode: QUOTA_MODES.includes(q.mode) ? q.mode : 'none',
    month: wholeNumber(q.month),
    day: wholeNumber(q.day),
  };
};
const quotaOn = (p) => planQuota(p).mode !== 'none';
const planLink = (p, actId) => {
  const l = (p && p.links && p.links[actId]) || {};
  return { credits: wholeNumber(l.credits), month: wholeNumber(l.month) };
};
/** The plans with a quota that an activity belongs to. */
const quotaPlansOf = (a) =>
  S.plans.filter((p) => quotaOn(p) && (p.activities || []).includes(a.id));

/**
 * What a plan has used in the month of `ds`. `extra` ({ id, date }) is a visit that is about to be
 * added, so the answer says what the month would look like with it.
 */
function quotaUse(p, ds, extra) {
  const ym = ds.slice(0, 7);
  const per = [];
  let dayTotal = 0;
  for (const id of p.activities || []) {
    const a = S.acts.find((x) => x.id === id);
    if (!a) continue;
    const dates = new Set(a.done || []);
    if (extra && extra.id === id) dates.add(extra.date);
    const link = planLink(p, id);
    const month = [...dates].filter((d) => d.startsWith(ym)).length;
    if (dates.has(ds)) dayTotal += 1;
    per.push({ a, month, link, credits: month * link.credits });
  }
  return {
    q: planQuota(p),
    ym,
    per,
    dayTotal,
    visits: per.reduce((s, x) => s + x.month, 0),
    credits: per.reduce((s, x) => s + x.credits, 0),
  };
}

const monthName = (ds) => fmt(parse(`${ds.slice(0, 7)}-01`), { month: 'long' });

/** Messages for what a visit of `a` on `ds` would exceed (empty: it fits everywhere). */
function quotaProblems(a, ds) {
  const out = [];
  for (const p of quotaPlansOf(a)) {
    const u = quotaUse(p, ds, { id: a.id, date: ds });
    const mine = u.per.find((x) => x.a.id === a.id);
    const month = monthName(ds);
    if (u.q.mode === 'credits' && u.q.month && u.credits > u.q.month)
      out.push(tr('quota.overCredits', { plan: p.name, used: u.credits, max: u.q.month, month }));
    if (u.q.mode === 'visits' && u.q.month && u.visits > u.q.month)
      out.push(tr('quota.overVisits', { plan: p.name, used: u.visits, max: u.q.month, month }));
    if (u.q.day && u.dayTotal > u.q.day)
      out.push(tr('quota.overDay', { plan: p.name, max: u.q.day }));
    if (mine && mine.link.month && mine.month > mine.link.month)
      out.push(
        tr('quota.overActivity', { plan: p.name, name: a.name, max: mine.link.month, month }),
      );
  }
  return out;
}

/** The use of a plan in the month of `ds`, as lines of text for cards ("7 of 10 credits in October"). */
function quotaLines(p, ds) {
  if (!quotaOn(p)) return [];
  const u = quotaUse(p, ds);
  const month = monthName(ds);
  const lines = [];
  if (u.q.mode === 'credits')
    lines.push(
      u.q.month
        ? tr('quota.creditsUsed', {
            used: u.credits,
            max: u.q.month,
            left: Math.max(0, u.q.month - u.credits),
            month,
          })
        : tr('quota.creditsUsedOpen', { used: u.credits, month }),
    );
  else
    lines.push(
      u.q.month
        ? tr('quota.visitsUsed', {
            used: u.visits,
            max: u.q.month,
            left: Math.max(0, u.q.month - u.visits),
            month,
          })
        : tr('quota.visitsUsedOpen', { used: u.visits, month }),
    );
  if (u.q.day) lines.push(tr('quota.dayLimit', { max: u.q.day }));
  return lines;
}

/** What the plan means for one activity: its cost in credits and/or its own monthly limit, and the use so far. */
function quotaActivityLines(p, a, ds) {
  if (!quotaOn(p)) return [];
  const u = quotaUse(p, ds);
  const mine = u.per.find((x) => x.a.id === a.id);
  const link = planLink(p, a.id);
  const lines = [];
  if (u.q.mode === 'credits' && link.credits)
    lines.push(tr('quota.costsCredits', { n: link.credits }));
  if (link.month)
    lines.push(
      tr('quota.activityUsed', {
        used: mine ? mine.month : 0,
        max: link.month,
        month: monthName(ds),
      }),
    );
  return [...lines, ...quotaLines(p, ds)];
}

/** Shown after a visit was entered that goes beyond what the membership allows. */
function warnQuota(a, ds) {
  const problems = quotaProblems(a, ds);
  if (problems.length) toast(problems.join(' '));
}

// ---------- the inputs (activity editor and tariff editor) ----------
/**
 * The inputs for what an activity costs / allows within a membership. `name` is the stem of the
 * input names; `mode` the membership's mode (the credits input only shows in credits mode, the
 * wrapper is hidden until the activity is ticked).
 */
function quotaFieldsHTML(p, actId, name, mode, checked) {
  const link = planLink(p, actId);
  return `<div class="quota-link" data-q="${esc(name)}" data-qmode="${esc(mode)}"${checked ? '' : ' hidden'}>
    <label class="f q-credits-only">${esc(tr('quota.cost'))}<input name="${esc(name)}_credits" type="number" inputmode="numeric" min="1" max="1000" value="${link.credits || ''}" placeholder="${esc(tr('quota.costPh'))}"></label>
    <label class="f"><span class="q-credits-only">${esc(tr('quota.actMonthCredits'))}</span><span class="q-visits-only">${esc(tr('quota.actMonth'))}</span><input name="${esc(name)}_month" type="number" inputmode="numeric" min="0" max="1000" value="${link.month || ''}" placeholder="${esc(tr('quota.unlimited'))}"></label>
  </div>`;
}
const readQuotaLink = (fd, name) => ({
  credits: wholeNumber(fd.get(`${name}_credits`)),
  month: wholeNumber(fd.get(`${name}_month`)),
});

// Ticking an activity or a membership shows the question for its cost / allowance.
document.addEventListener('change', (e) => {
  const box = e.target;
  if (!box || box.type !== 'checkbox' || !box.dataset || !box.dataset.q) return;
  const fields = document.querySelector(`.quota-link[data-q="${CSS.escape(box.dataset.q)}"]`);
  if (!fields) return;
  fields.hidden = !box.checked;
  if (box.checked) fields.querySelector('input:not([hidden])')?.focus();
});

/** The quota of a plan from a backup file: only what `planQuota` and `planLink` read. */
function sanitizeQuota(raw) {
  const q = planQuota(raw);
  if (q.mode === 'none') return {};
  const links = {};
  for (const [id, link] of Object.entries(raw.links || {}))
    if (typeof id === 'string') links[id] = planLink({ links: { [id]: link } }, id);
  return { quota: q, links };
}
