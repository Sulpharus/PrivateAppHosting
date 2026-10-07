// The "Geburtstage" tab: data, view and sheets. Pure logic is in birthdays.js; app.js passes in
// its helpers (`h` builds elements with textContent only, so user text never becomes HTML).
import { euro, parseLink, parsePrice } from './amazon.js';
import {
  eventToBirthday,
  GROUPS,
  mergePeople,
  reminderAt,
  reminderKey,
  withCountdown,
} from './birthdays.js';

const SETTINGS_KEY = 'birthday-settings';
/** The tables refuse more than 1,000,000 € (cents as integers). */
const MAX_CENTS = 100_000_000;
const DAYS = [0, 3, 7, 14, 30];
const REMIND_CHECK = 'birthday-reminded-at';
const daysIn = (month, year) =>
  month === 2
    ? (year ?? 2000) % 4 === 0 && ((year ?? 2000) % 100 !== 0 || (year ?? 2000) % 400 === 0)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

export function createBirthdayView({ h, t, icon, toast, ready, locale, S, render, openPerson }) {
  const B = {
    mn: [],
    aether: [],
    own: [],
    prefs: [],
    ideas: [],
    suiteDenied: false,
    filter: 'all',
    showHidden: false,
    daysBefore: 14,
    loaded: false,
  };
  S.bd = B;

  // ---------- data ----------
  async function load() {
    const mn = await ready;
    const settled = await Promise.allSettled([
      mn.birthdays(),
      mn.suite.type('event').list({ limit: 5000 }),
      mn.table('birthday_people').list(),
      mn.table('birthday_prefs').list(),
      mn.table('gift_ideas').list(),
      mn.kv.get(SETTINGS_KEY),
    ]);
    const [people, events, own, prefs, ideas, settings] = settled;
    B.mn = people.status === 'fulfilled' ? people.value : [];
    B.suiteDenied = events.status === 'rejected';
    B.aether =
      events.status === 'fulfilled'
        ? events.value.map((record) => eventToBirthday(record, S.me)).filter(Boolean)
        : [];
    B.own = own.status === 'fulfilled' ? own.value : [];
    B.prefs = prefs.status === 'fulfilled' ? prefs.value : [];
    B.ideas = ideas.status === 'fulfilled' ? ideas.value : [];
    const days = settings.status === 'fulfilled' ? settings.value?.daysBefore : null;
    B.daysBefore = DAYS.includes(days) ? days : 14;
    B.failed = [own, prefs, ideas].some((r) => r.status === 'rejected');
    B.loaded = true;
    void scheduleReminders(false);
  }

  const prefOf = (key) => B.prefs.find((p) => p.person_key === key);
  const hiddenKeys = () => new Set(B.prefs.filter((p) => p.hidden).map((p) => p.person_key));
  const people = (today = new Date()) =>
    withCountdown(
      mergePeople({
        mn: B.mn,
        aether: B.aether,
        own: B.own,
        hidden: hiddenKeys(),
        showHidden: B.showHidden,
      }),
      today,
    );
  const daysBeforeOf = (key) => prefOf(key)?.days_before ?? B.daysBefore;

  // One pending reminder per person (key `birthday:<person key>`), scheduled again only when its
  // time or text changed; reminders of people who are gone or hidden are cancelled. The device
  // keeps at most 500 reminders per app (platform limit), so a huge list would not all be scheduled.
  const REMINDERS = 'birthday-reminders';
  let running = null;
  let again = null; // a run was asked for while one was going: null = none, else its `force`

  function scheduleReminders(force) {
    if (running) {
      again = again === null ? force : again || force;
      return running;
    }
    running = (async () => {
      let next = force;
      while (next !== null) {
        again = null;
        await runReminders(next);
        next = again;
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  async function runReminders(force) {
    try {
      const mn = await ready;
      const last = Number((await mn.kv.get(REMIND_CHECK)) ?? 0);
      if (!force && Date.now() - last < 3_600_000) return;
      const now = new Date();
      const all = withCountdown(
        mergePeople({
          mn: B.mn,
          aether: B.aether,
          own: B.own,
          hidden: hiddenKeys(),
          showHidden: true,
        }),
        now,
      );
      const wanted = new Map();
      for (const person of all) {
        const at = person.hidden ? null : reminderAt(person, daysBeforeOf(person.key), now);
        if (!at) continue;
        const ideas = B.ideas.filter((i) => i.person_key === person.key && i.status !== 'given');
        const days = daysBeforeOf(person.key);
        wanted.set(reminderKey(person), {
          at,
          title: t('bd.pushTitle', { name: person.name.slice(0, 60) }),
          body: t(
            ideas.length === 0
              ? 'bd.pushNoIdea'
              : ideas.length === 1
                ? 'bd.pushIdea1'
                : 'bd.pushIdeas',
            {
              days,
              n: ideas.length,
            },
          ),
        });
      }
      const known = (await mn.kv.get(REMINDERS)) ?? {};
      const kept = {};
      for (const [key, w] of wanted) {
        const signature = `${w.at.toISOString()}|${w.title}|${w.body}`;
        if (known[key] === signature) {
          kept[key] = signature;
          continue;
        }
        try {
          await mn.push.schedule({
            key,
            at: w.at,
            title: w.title,
            body: w.body,
            path: '/?tab=birthdays',
          });
          kept[key] = signature;
        } catch (err) {
          // One person that fails (a refused text) must not stop the others; no push access stops all.
          if (err?.code === '42501') return;
        }
      }
      for (const key of Object.keys(known))
        if (!wanted.has(key)) await mn.push.cancel(key).catch(() => undefined);
      await mn.kv.set(REMINDERS, kept);
      await mn.kv.set(REMIND_CHECK, Date.now());
    } catch {
      // notifications are off or the device is offline: the list works without
    }
  }

  const dateText = (p) =>
    new Date(2024, p.month - 1, p.day).toLocaleDateString(locale(), {
      day: 'numeric',
      month: 'long',
    });
  const countdownText = (days) =>
    days === 0 ? t('bd.today') : days === 1 ? t('bd.tomorrow') : t('bd.inDays', { n: days });

  // ---------- view ----------
  function renderTab(main, tools, header) {
    const list = people();
    header(
      t('tab.birthdays'),
      list.length ? t('bd.next', { name: list[0].name, when: countdownText(list[0].days) }) : '',
    );
    tools.append(
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => openPersonEditor(null) },
        t('bd.add'),
      ),
      h('button', { type: 'button', class: 'mn-btn', onclick: openSettings }, t('bd.settings')),
    );
    if (B.suiteDenied)
      main.append(h('div', { class: 'mn-banner', role: 'status' }, t('bd.suiteDenied')));
    else if (B.aether.length === 0)
      main.append(h('p', { class: 'mn-hint', role: 'note' }, t('bd.noContacts')));
    if (B.failed)
      main.append(h('div', { class: 'mn-banner mn-banner--bad', role: 'alert' }, t('error.load')));

    const filters = [
      ['all', t('bd.filterAll')],
      ['mn', t('bd.filterMn')],
      ['aether', t('bd.filterContacts')],
      ['own', t('bd.filterOwn')],
    ];
    main.append(
      h(
        'div',
        { class: 'bd-filters', role: 'group', 'aria-label': t('bd.filterLabel') },
        filters.map(([id, label]) =>
          h(
            'button',
            {
              type: 'button',
              class: 'mn-chip bd-chip',
              'aria-pressed': B.filter === id ? 'true' : 'false',
              onclick: () => {
                B.filter = id;
                render();
              },
            },
            label,
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'mn-chip bd-chip',
            'aria-pressed': B.showHidden ? 'true' : 'false',
            onclick: () => {
              B.showHidden = !B.showHidden;
              render();
            },
          },
          t('bd.showHidden'),
        ),
      ),
    );

    const shown = list.filter(
      (p) => B.filter === 'all' || p.source === B.filter || (p.also ?? []).includes(B.filter),
    );
    if (shown.length === 0) {
      main.append(
        h(
          'div',
          { class: 'mn-empty' },
          h('div', { class: 'mn-empty-icon' }, icon('gift')),
          h('h3', {}, t('bd.emptyTitle')),
          h('p', {}, t('bd.emptyText')),
        ),
      );
      return;
    }
    for (const group of GROUPS) {
      const rows = shown.filter((p) => p.group === group);
      if (rows.length === 0) continue;
      main.append(
        h('h2', { class: 'bd-group' }, t(`bd.group.${group}`)),
        h(
          'div',
          { class: 'mn-list' },
          rows.map((p) => row(p)),
        ),
      );
    }
  }

  function sourceChips(p) {
    const sources = [p.source, ...(p.also ?? [])];
    return [...new Set(sources)].map((s) =>
      h('span', { class: 'mn-chip mn-chip--plain bd-source' }, t(`bd.source.${s}`)),
    );
  }

  function row(p) {
    const ideas = B.ideas.filter((i) => i.person_key === p.key && i.status !== 'given').length;
    return h(
      'button',
      {
        type: 'button',
        class: `mn-row bd-row${p.hidden ? ' bd-row--hidden' : ''}`,
        onclick: () => openSheet(p.key),
      },
      h(
        'span',
        {
          class: `mn-thumb bd-days${p.days === 0 ? ' bd-days--today' : ''}`,
          'aria-hidden': 'true',
        },
        p.days === 0 ? icon('gift') : String(p.days),
      ),
      h(
        'span',
        { class: 'wish-text' },
        h('span', { class: 'mn-row-title' }, p.name),
        h(
          'span',
          { class: 'mn-row-sub' },
          [dateText(p), p.turns ? t('bd.turns', { n: p.turns }) : null].filter(Boolean).join(' · '),
        ),
        h(
          'span',
          { class: 'bd-chips' },
          h(
            'span',
            { class: `mn-chip ${p.days <= 7 ? 'mn-chip--ok' : 'mn-chip--plain'}` },
            countdownText(p.days),
          ),
          sourceChips(p),
          ideas > 0 && h('span', { class: 'mn-chip mn-chip--plain' }, t('bd.ideas', { n: ideas })),
          p.hidden && h('span', { class: 'mn-chip mn-chip--plain' }, t('bd.hiddenChip')),
        ),
      ),
    );
  }

  // ---------- sheets ----------
  const field = (label, input, hint) =>
    h('label', { class: 'mn-field' }, label, input, hint && h('span', { class: 'mn-hint' }, hint));

  function sheet(title, body, foot) {
    const content = document.createDocumentFragment();
    content.append(
      h(
        'div',
        { class: 'mn-sheet-bar' },
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
          t('editor.cancel'),
        ),
        h('h2', {}, title),
        h('span', {}),
      ),
      body,
      foot,
    );
    window.mnui.sheet.open(content, { tall: true, modal: true });
  }

  const reload = async () => {
    await load();
    render();
  };

  /** The same person always gets the same row id, so two devices never create two rows (unique key). */
  async function prefId(key) {
    const bytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`birthday_prefs:${key}`)),
    ).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function savePref(key, patch) {
    const mn = await ready;
    const existing = prefOf(key);
    await mn.table('birthday_prefs').upsert({
      id: existing?.id ?? (await prefId(key)),
      person_key: key,
      days_before: existing?.days_before ?? null,
      budget_cents: existing?.budget_cents ?? null,
      hidden: existing?.hidden ?? false,
      ...patch,
    });
  }

  function openSheet(key) {
    const p =
      people(new Date()).find((x) => x.key === key) ??
      withCountdown(
        mergePeople({
          mn: B.mn,
          aether: B.aether,
          own: B.own,
          hidden: hiddenKeys(),
          showHidden: true,
        }),
        new Date(),
      ).find((x) => x.key === key);
    if (!p) return;
    const ideas = B.ideas
      .filter((i) => i.person_key === key)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const lastYear = ideas.filter((i) => i.status === 'given' && i.gifted_year);
    const pref = prefOf(key);

    const remind = h(
      'select',
      { name: 'days' },
      h('option', { value: '' }, t('bd.remindDefault', { n: B.daysBefore })),
      DAYS.map((d) =>
        h(
          'option',
          { value: String(d), selected: pref?.days_before === d ? true : null },
          t('bd.remindDays', { n: d }),
        ),
      ),
    );
    const budget = h('input', {
      name: 'budget',
      inputmode: 'decimal',
      placeholder: t('editor.pricePlaceholder'),
      value:
        pref?.budget_cents != null
          ? (pref.budget_cents / 100).toLocaleString(locale(), { minimumFractionDigits: 2 })
          : '',
    });
    const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
    const savePrefs = async () => {
      const cents = budget.value.trim() ? parsePrice(budget.value, locale()) : null;
      if (Number.isNaN(cents) || (cents ?? 0) > MAX_CENTS) {
        error.textContent = t('editor.errPrice');
        error.hidden = false;
        return;
      }
      try {
        await savePref(key, {
          days_before: remind.value === '' ? null : Number(remind.value),
          budget_cents: cents,
        });
      } catch {
        error.textContent = t('editor.errSave');
        error.hidden = false;
        return;
      }
      await reload();
      void scheduleReminders(true);
      toast(t('toast.saved'));
    };

    const spent = ideas
      .filter(
        (i) =>
          i.status !== 'idea' &&
          (i.gifted_year ?? new Date(i.created_at).getFullYear()) === new Date().getFullYear() &&
          i.price_cents,
      )
      .reduce((sum, i) => sum + i.price_cents, 0);

    const list = h(
      'div',
      { class: 'mn-list bd-ideas' },
      ideas.length === 0
        ? h('p', { class: 'mn-hint' }, t('bd.noIdeas'))
        : ideas.map((i) => ideaRow(i, key)),
    );

    const body = h(
      'div',
      { class: 'mn-form mn-sheet-body' },
      h(
        'p',
        { class: 'mn-row-sub' },
        [dateText(p), p.turns ? t('bd.turns', { n: p.turns }) : null, countdownText(p.days)]
          .filter(Boolean)
          .join(' · '),
      ),
      h('div', { class: 'bd-chips' }, sourceChips(p)),
      p.source === 'mn' &&
        h(
          'button',
          {
            type: 'button',
            class: 'mn-btn mn-btn--primary',
            onclick: () => {
              window.mnui.sheet.close();
              void openPerson(p.userId);
            },
          },
          icon('gift'),
          t('bd.seeWishes', { name: p.name }),
        ),
      lastYear.length > 0 &&
        h(
          'p',
          { class: 'mn-hint' },
          t('bd.lastGift', {
            what: lastYear[0].title,
            year: lastYear[0].gifted_year,
          }),
        ),
      h(
        'div',
        { class: 'mn-grid-2' },
        field(t('bd.remindLabel'), remind),
        field(t('bd.budgetLabel'), budget, spent ? t('bd.spent', { sum: euro(spent) }) : null),
      ),
      error,
      h(
        'button',
        { type: 'button', class: 'mn-btn', onclick: () => void savePrefs() },
        t('editor.save'),
      ),
      h('h3', { class: 'bd-sub' }, t('bd.giftIdeas')),
      list,
      h(
        'button',
        { type: 'button', class: 'mn-btn', onclick: () => openIdeaEditor(null, key) },
        t('bd.addIdea'),
      ),
    );
    const foot = h(
      'div',
      { class: 'mn-sheet-foot' },
      p.source === 'own' &&
        h(
          'button',
          {
            type: 'button',
            class: 'mn-btn',
            onclick: () => {
              window.mnui.sheet.close();
              openPersonEditor(B.own.find((o) => `own:${o.id}` === key));
            },
          },
          t('bd.editPerson'),
        ),
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        {
          type: 'button',
          class: 'mn-btn mn-btn--ghost',
          onclick: async () => {
            try {
              await savePref(key, { hidden: !p.hidden });
            } catch {
              toast(t('editor.errSave'));
              return;
            }
            window.mnui.sheet.close();
            await reload();
            void scheduleReminders(true);
          },
        },
        t(p.hidden ? 'bd.unhide' : 'bd.hide'),
      ),
    );
    sheet(p.name, body, foot);
  }

  function ideaRow(idea, key) {
    return h(
      'button',
      { type: 'button', class: 'mn-row', onclick: () => openIdeaEditor(idea, key) },
      h(
        'span',
        { class: 'wish-text' },
        h('span', { class: 'mn-row-title' }, idea.title),
        h(
          'span',
          { class: 'mn-row-sub' },
          [
            t(`bd.status.${idea.status}`),
            idea.price_cents != null ? euro(idea.price_cents) : null,
            idea.gifted_year,
          ]
            .filter((x) => x !== null && x !== undefined && x !== '')
            .join(' · '),
        ),
        idea.note && h('span', { class: 'wish-note' }, idea.note),
      ),
    );
  }

  function openIdeaEditor(idea, key) {
    const title = h('input', {
      name: 'title',
      required: true,
      maxlength: 200,
      value: idea?.title ?? '',
    });
    const note = h('textarea', { name: 'note', rows: 2, maxlength: 1000 }, idea?.note ?? '');
    const url = h('input', { name: 'url', type: 'url', inputmode: 'url', value: idea?.url ?? '' });
    const price = h('input', {
      name: 'price',
      inputmode: 'decimal',
      value:
        idea?.price_cents != null
          ? (idea.price_cents / 100).toLocaleString(locale(), { minimumFractionDigits: 2 })
          : '',
    });
    const status = h(
      'select',
      { name: 'status' },
      ['idea', 'bought', 'given'].map((s) =>
        h(
          'option',
          { value: s, selected: (idea?.status ?? 'idea') === s ? true : null },
          t(`bd.status.${s}`),
        ),
      ),
    );
    const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
    };
    const save = async () => {
      if (!title.value.trim()) return fail(t('editor.errTitle'));
      const cents = price.value.trim() ? parsePrice(price.value, locale()) : null;
      if (Number.isNaN(cents) || (cents ?? 0) > MAX_CENTS) return fail(t('editor.errPrice'));
      const link = url.value.trim() ? parseLink(url.value) : { url: null };
      if (!link) return fail(t('editor.errUrl'));
      const mn = await ready;
      try {
        await mn.table('gift_ideas').upsert({
          id: idea?.id ?? crypto.randomUUID(),
          person_key: key,
          title: title.value.trim().slice(0, 200),
          note: note.value.trim(),
          url: link.url,
          price_cents: cents,
          status: status.value,
          gifted_year:
            status.value === 'given' ? (idea?.gifted_year ?? new Date().getFullYear()) : null,
        });
      } catch {
        return fail(t('editor.errSave'));
      }
      window.mnui.sheet.close();
      toast(t('toast.saved'));
      await reload();
      void scheduleReminders(true);
    };
    let armed = false;
    const remove = idea
      ? h(
          'button',
          {
            type: 'button',
            class: 'mn-btn mn-btn--danger',
            onclick: async (e) => {
              if (!armed) {
                armed = true;
                e.currentTarget.textContent = t('editor.deleteConfirm');
                return;
              }
              try {
                const mn = await ready;
                await mn.table('gift_ideas').remove(idea.id);
              } catch {
                return fail(t('editor.errDelete'));
              }
              window.mnui.sheet.close();
              toast(t('toast.deleted'));
              await reload();
              void scheduleReminders(true);
            },
          },
          t('editor.delete'),
        )
      : null;
    const form = h(
      'form',
      { class: 'mn-form mn-sheet-body', novalidate: true },
      field(t('bd.ideaTitle'), title),
      h(
        'div',
        { class: 'mn-grid-2' },
        field(t('editor.price'), price),
        field(t('bd.statusLabel'), status),
      ),
      field(t('editor.url'), url),
      field(t('bd.ideaNote'), note),
      error,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void save();
    });
    sheet(
      t(idea ? 'bd.editIdea' : 'bd.addIdea'),
      form,
      h(
        'div',
        { class: 'mn-sheet-foot' },
        remove,
        h('span', { class: 'mn-grow' }),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
          t('editor.save'),
        ),
      ),
    );
    title.focus();
  }

  function openPersonEditor(person) {
    const name = h('input', {
      name: 'name',
      required: true,
      maxlength: 80,
      value: person?.name ?? '',
    });
    const num = (n, props) => h('input', { inputmode: 'numeric', maxlength: n, ...props });
    const day = num(2, { name: 'day', value: person?.day ?? '' });
    const month = num(2, { name: 'month', value: person?.month ?? '' });
    const year = num(4, { name: 'year', value: person?.year ?? '' });
    const note = h('textarea', { name: 'note', rows: 2, maxlength: 500 }, person?.note ?? '');
    const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
    };
    const save = async () => {
      const d = Number(day.value);
      const m = Number(month.value);
      const y = year.value.trim() ? Number(year.value) : null;
      if (!name.value.trim()) return fail(t('editor.errTitle'));
      if (
        !Number.isInteger(d) ||
        !Number.isInteger(m) ||
        m < 1 ||
        m > 12 ||
        d < 1 ||
        d > daysIn(m, y)
      )
        return fail(t('bd.errDate'));
      if (y !== null && (!Number.isInteger(y) || y < 1905 || y > new Date().getFullYear()))
        return fail(t('bd.errYear'));
      const mn = await ready;
      try {
        await mn.table('birthday_people').upsert({
          id: person?.id ?? crypto.randomUUID(),
          name: name.value.trim().slice(0, 80),
          month: m,
          day: d,
          year: y,
          note: note.value.trim(),
        });
      } catch {
        return fail(t('editor.errSave'));
      }
      window.mnui.sheet.close();
      toast(t('toast.saved'));
      await reload();
      void scheduleReminders(true);
    };
    let armed = false;
    const remove = person
      ? h(
          'button',
          {
            type: 'button',
            class: 'mn-btn mn-btn--danger',
            onclick: async (e) => {
              if (!armed) {
                armed = true;
                e.currentTarget.textContent = t('editor.deleteConfirm');
                return;
              }
              try {
                const mn = await ready;
                const key = `own:${person.id}`;
                await mn.table('birthday_people').remove(person.id);
                for (const idea of B.ideas.filter((i) => i.person_key === key))
                  await mn.table('gift_ideas').remove(idea.id);
                const pref = prefOf(key);
                if (pref) await mn.table('birthday_prefs').remove(pref.id);
              } catch {
                return fail(t('editor.errDelete'));
              }
              window.mnui.sheet.close();
              toast(t('toast.deleted'));
              await reload();
              void scheduleReminders(true);
            },
          },
          t('editor.delete'),
        )
      : null;
    const form = h(
      'form',
      { class: 'mn-form mn-sheet-body', novalidate: true },
      field(t('bd.nameLabel'), name),
      h(
        'div',
        { class: 'mn-grid-3' },
        field(t('bd.dayLabel'), day),
        field(t('bd.monthLabel'), month),
        field(t('bd.yearLabel'), year, t('bd.yearHint')),
      ),
      field(t('bd.ideaNote'), note),
      error,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void save();
    });
    sheet(
      t(person ? 'bd.editPerson' : 'bd.add'),
      form,
      h(
        'div',
        { class: 'mn-sheet-foot' },
        remove,
        h('span', { class: 'mn-grow' }),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
          t('editor.save'),
        ),
      ),
    );
    name.focus();
  }

  function openSettings() {
    const select = h(
      'select',
      { name: 'days' },
      DAYS.map((d) =>
        h(
          'option',
          { value: String(d), selected: B.daysBefore === d ? true : null },
          t('bd.remindDays', { n: d }),
        ),
      ),
    );
    const body = h(
      'div',
      { class: 'mn-form mn-sheet-body' },
      field(t('bd.defaultRemind'), select, t('bd.defaultRemindHint')),
      h('p', { class: 'mn-hint' }, t('bd.accountHint')),
    );
    sheet(
      t('bd.settings'),
      body,
      h(
        'div',
        { class: 'mn-sheet-foot' },
        h('span', { class: 'mn-grow' }),
        h(
          'button',
          {
            type: 'button',
            class: 'mn-btn mn-btn--primary',
            onclick: async () => {
              const mn = await ready;
              await mn.kv.set(SETTINGS_KEY, { daysBefore: Number(select.value) });
              window.mnui.sheet.close();
              toast(t('toast.saved'));
              await reload();
              void scheduleReminders(true);
            },
          },
          t('editor.save'),
        ),
      ),
    );
  }

  return { load, renderTab, reload };
}
