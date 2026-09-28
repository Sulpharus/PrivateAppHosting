// Wiring for preview.html only: fills the demo calendar and heat grid and connects the controls.
const $ = (s) => document.querySelector(s);

$('#cells').innerHTML = Array.from({ length: 35 }, (_, i) => {
  const day = i; // September 2026 starts on a Tuesday; the first cell is 31 August
  const n = day === 0 ? 31 : day > 30 ? day - 30 : day;
  const out = day === 0 || day > 30;
  const dots = '<i></i>'.repeat([0, 1, 2, 1, 0, 3, 2][i % 7]);
  const cls = ['mn-cell', out && 'out', n === 28 && !out && 'today'].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" aria-pressed="${n === 28 && !out}"><span>${n}</span><span class="mn-dots">${dots}</span></button>`;
}).join('');

const levels = [
  0, 1, 0, 2, 3, 0, 1, 1, 0, 0, 2, 1, 3, 2, 0, 1, 0, 0, 2, 3, 1, 0, 1, 2, 0, 3, 1, 2, 0, 0,
];
$('#heat').innerHTML =
  '<i style="visibility:hidden"></i>' +
  levels.map((l) => `<i class="${l ? `l${l}` : ''}"></i>`).join('');

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.themeSet) {
    mnui.theme.set(t.dataset.themeSet);
    mnui.select(t);
  } else if (t.dataset.accentSet) {
    document.documentElement.dataset.accent = t.dataset.accentSet;
    mnui.select(t);
  } else if (t.dataset.open) {
    const tall = t.dataset.open === 'editor';
    mnui.sheet.open($(`#tpl-${t.dataset.open}`).content.cloneNode(true), { tall });
  } else if (t.dataset.toast !== undefined) {
    mnui.toast('Buch gespeichert');
  } else if (t.parentElement?.dataset.selectMany !== undefined) {
    t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true'));
  } else if (t.parentElement?.dataset.select !== undefined || t.classList.contains('mn-tab')) {
    mnui.select(t);
  }
});

const saved = mnui.theme.get();
const current = document.querySelector(`[data-theme-set="${saved}"]`);
if (current) mnui.select(current);
