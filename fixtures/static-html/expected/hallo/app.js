// Visits are stored per user with mn.kv, so they sync across devices.
window.addEventListener('DOMContentLoaded', async () => {
  const mn = await window.mininode.mininode();
  await mn.auth.requireLogin();
  const visits = ((await mn.kv.get('visits')) ?? 0) + 1;
  await mn.kv.set('visits', visits);
  document.getElementById('count').textContent = String(visits);
});
