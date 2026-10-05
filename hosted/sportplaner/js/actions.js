// Persistence and click/input handlers. Loaded in order by index.html; all files share one global scope.
/* ---------- persistence ---------- */
function applyLocal(act, del) {
  const next = S.acts.filter((x) => x.id !== act.id);
  if (!del) next.push(act);
  S.acts = next;
  dataChanged();
}
// Bumped on every write; a reload that overlaps a write is repeated instead of applied.
let writes = 0;
async function persist(act) {
  writes++;
  const mn = await ready;
  await mn.kv.set(ACT + act.id, act);
  applyLocal(act);
}
async function removeAct(a) {
  writes++;
  const mn = await ready;
  await mn.kv.delete(ACT + a.id);
  applyLocal(a, true);
  (a.photos || []).forEach(dropAsset);
  Object.values(a.thumbs || {}).forEach(dropAsset);
}

/* ---------- actions ---------- */
let delArmed = null,
  searchT;
const H = {
  tab: (t) => {
    S.view = t.dataset.tab;
    if (S.view === 'cal') {
      const d = parse(S.date);
      S.month = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
    window.scrollTo(0, 0);
  },
  pick: (t) => {
    S.date = t.dataset.date;
    render();
  },
  week: (t) => {
    S.date = ymd(addDays(parse(S.date), 7 * +t.dataset.dir));
    render();
  },
  today: () => {
    S.date = todayStr();
    render();
  },
  month: (t) => {
    S.month = new Date(S.month.getFullYear(), S.month.getMonth() + +t.dataset.dir, 1);
    render();
  },
  calpick: (t) => {
    S.date = t.dataset.date;
    const d = parse(S.date);
    if (d.getMonth() !== S.month.getMonth()) S.month = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  },
  cat: (t) => {
    S.cat = t.dataset.cat;
    render();
  },
  'filter-prov': (t) => {
    S.prov = t.dataset.prov;
    S.cat = 'Alle';
    S.q = '';
    closeSheet();
    S.view = 'lib';
    mounted = null;
    render();
    window.scrollTo(0, 0);
  },
  open: (t) => openDetail(t.dataset.id, t.dataset.date),
  new: () => (S.view === 'stats' ? openPlanEditor(null) : openEditor(null)),
  edit: () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (a) {
      closeSheet();
      openEditor(a);
    }
  },
  close: () => closeSheet(),
  backdrop: (t, e) => {
    if (e.target === t && S.sheet && S.sheet.type === 'detail') closeSheet();
  },
  'toggle-done': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    const ds = S.sheet.date,
      done = new Set(a.done || []);
    const adding = !done.has(ds);
    done.has(ds) ? done.delete(ds) : done.add(ds);
    try {
      // attended means it took place
      await persist({
        ...a,
        done: [...done].sort(),
        cancelled: (a.cancelled || []).filter((x) => !done.has(x)),
      });
      if (adding) warnQuota(a, ds);
    } catch {
      toast(tr('error.update'));
    }
  },
  'toggle-cancel': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a || !S.sheet.date) return;
    const ds = S.sheet.date,
      off = new Set(a.cancelled || []),
      was = off.has(ds);
    was ? off.delete(ds) : off.add(ds);
    try {
      // a session that did not take place cannot have been attended
      await persist({
        ...a,
        cancelled: [...off].sort(),
        done: was ? a.done || [] : (a.done || []).filter((x) => x !== ds),
      });
      toast(tr(was ? 'toast.sessionOn' : 'toast.markedCancelled'));
    } catch {
      toast(tr('error.update'));
    }
  },
  del: async (t) => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    if (delArmed !== a.id) {
      delArmed = a.id;
      t.textContent = tr('confirm.tapAgain');
      setTimeout(() => {
        if (delArmed === a.id) {
          delArmed = null;
          if (t.isConnected) t.textContent = tr('detail.delete');
        }
      }, 3000);
      return;
    }
    delArmed = null;
    closeSheet();
    try {
      await removeAct(a);
      toast(tr('toast.activityDeleted'));
    } catch {
      toast(tr('error.delete'));
    }
  },
  save: () => saveDraft(),
  'cancel-edit': () => cancelEdit(),
  calmode: (t) => {
    S.calMode = t.dataset.mode;
    S.agendaDays = 28;
    render();
  },
  calview: (t) => {
    S.calView = t.dataset.view;
    S.agendaDays = 28;
    render();
    window.scrollTo(0, 0);
  },
  'agenda-more': () => {
    S.agendaDays += 28;
    render();
  },
  pday: (t) => {
    const p = draft.planned,
      j = +t.dataset.j;
    p.days = (p.days || []).includes(j) ? p.days.filter((x) => x !== j) : [...(p.days || []), j];
    t.classList.toggle('on', p.days.includes(j));
    t.setAttribute('aria-pressed', p.days.includes(j));
  },
  'pdate-add': () => {
    const v = $('#pdate').value;
    if (!v) return;
    const p = draft.planned;
    p.dates = [...new Set([...(p.dates || []), v])].sort();
    renderPlanned();
  },
  'pdate-del': (t) => {
    const p = draft.planned;
    p.dates = (p.dates || []).filter((x) => x !== t.dataset.d);
    renderPlanned();
  },
  'plan-toggle': () => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (a && S.sheet.date) togglePlan(a, S.sheet.date);
  },
  'plan-day': (t) => {
    const a = S.acts.find((x) => x.id === t.dataset.id);
    if (a) togglePlan(a, t.dataset.date, true);
  },
};
async function togglePlan(a, ds, announce) {
  {
    const was = isPlanned(a, ds);
    const p = JSON.parse(JSON.stringify(a.planned || { mode: 'none' }));
    p.dates = p.dates || [];
    p.skip = p.skip || [];
    if (isPlanned(a, ds)) {
      if (p.dates.includes(ds)) p.dates = p.dates.filter((x) => x !== ds);
      else p.skip = [...p.skip, ds];
      if (p.mode === 'dates' && !p.dates.length) p.mode = 'none';
    } else {
      if (p.skip.includes(ds)) p.skip = p.skip.filter((x) => x !== ds);
      if (!isPlanned({ ...a, planned: p }, ds)) {
        p.dates = [...p.dates, ds].sort();
        p.mode = p.mode === 'weekly' ? 'both' : p.mode === 'none' ? 'dates' : p.mode;
      }
    }
    try {
      await persist({ ...a, planned: p });
      if (announce)
        toast(
          was
            ? tr('toast.unplanned')
            : tr('toast.planned', {
                date: fmt(parse(ds), { weekday: 'short', day: 'numeric', month: 'short' }),
              }),
        );
    } catch {
      toast(tr('error.update'));
    }
  }
}
Object.assign(H, {
  'photo-del': (t) => {
    const [r] = draft.photos.splice(+t.dataset.i, 1),
      th = draft.thumbs[r];
    delete draft.thumbs[r];
    for (const id of [r, th])
      if (id) {
        if (uploads.has(id)) {
          uploads.delete(id);
          dropAsset(id);
        } else removed.add(id);
      }
    renderPhotos();
  },
  'photo-cover': (t) => {
    const i = +t.dataset.i;
    if (i) {
      const [p] = draft.photos.splice(i, 1);
      draft.photos.unshift(p);
      renderPhotos();
    }
  },
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t || !H[t.dataset.action]) return;
  if (draft && draft.blocks && $('#slots')) syncSlotsDOM();
  H[t.dataset.action](t, e);
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    S.q = t.value;
    clearTimeout(searchT);
    searchT = setTimeout(updLib, 120);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'provsel') {
    S.prov = e.target.value;
    updLib();
    return;
  }
  if (e.target.id === 'file' && e.target.files.length) {
    const f = [...e.target.files];
    e.target.value = '';
    addPhotos(f);
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!draft) return;
  if (t.id === 'pmode') {
    const p = draft.planned;
    p.mode = t.value;
    if ((p.mode === 'weekly' || p.mode === 'both') && !(p.days || []).length)
      p.days = [...new Set(draft.blocks.flatMap((b) => b.rows.flatMap((r) => r.days)))].sort();
    if ((p.mode === 'weekly' || p.mode === 'both') && !p.season)
      p.season = { type: 'range', from: todayStr(), until: '' };
    renderPlanned();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.pf)
    draft.planned[t.dataset.pf] = t.dataset.pf === 'every' ? +t.value : t.value;
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.pf)
    draft.planned[t.dataset.pf] = t.dataset.pf === 'every' ? +t.value : t.value;
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'acc_member') {
    const b = $('#memberbox');
    if (b) b.hidden = !e.target.checked;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) S.sheet.type === 'edit' ? cancelEdit() : closeSheet();
});

let toastT;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

Object.assign(H, BLOCK_HANDLERS);
