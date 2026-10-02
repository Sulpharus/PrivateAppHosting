// Loads the data and renders the first view. Loaded in order by index.html; all files share one global scope.
/* ---------- boot ---------- */
S.lastBackup = null;
let loading = null;
function load() {
  loading ??= (async () => {
    let retry = false;
    try {
      const mn = await ready;
      const before = writes;
      const [acts, plans, last] = await Promise.all([
        mn.kv.list(ACT),
        mn.kv.list(PLAN),
        mn.kv.get(LAST_BACKUP),
      ]);
      // A save finished while we were reading: this snapshot may miss it, so read again.
      if (writes !== before) {
        retry = true;
        return;
      }
      S.acts = acts
        .filter((x) => x.value && typeof x.value === 'object')
        .map((x) => sanitizeAct({ ...x.value, id: x.key.slice(ACT.length) }, true));
      S.plans = plans
        .filter((x) => x.value && typeof x.value === 'object')
        .map((x) => sanitizePlan({ ...x.value, id: x.key.slice(PLAN.length) }));
      S.lastBackup = typeof last === 'number' ? last : null;
      dataChanged();
      plansChanged();
    } catch {
      toast(tr('error.load'));
    } finally {
      loading = null;
      if (retry) setTimeout(load, 300);
      else {
        S.loading = false;
        scheduleRender();
      }
    }
  })();
  return loading;
}
// The packages must be there before the first text is made; a language change redraws everything.
window.mnI18n.ready.then(() => {
  buildIndex();
  render();
  load();
  window.mnI18n.onChange(() => {
    mounted = null; // the skeleton carries texts too
    buildIndex();
    if (!S.sheet) render();
  });
});
// Other devices may have changed something while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    nextCache = null;
    if (!S.sheet || S.sheet.type === 'detail') load();
  }
});
