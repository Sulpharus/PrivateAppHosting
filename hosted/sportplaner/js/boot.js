// Loads the data and renders the first view. Loaded in order by index.html; all files share one global scope.
/* ---------- boot ---------- */
S.lastBackup = null;
buildIndex();
render();
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
      toast('Deine Daten konnten nicht geladen werden. Lade die Seite neu.');
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
load();
// Other devices may have changed something while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    nextCache = null;
    if (!S.sheet || S.sheet.type === 'detail') load();
  }
});
