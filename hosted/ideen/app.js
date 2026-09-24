// AI test app: calls the platform AI proxy through mn.ai (no API keys in the browser) and keeps
// the last five answers per user in mn.kv.
window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('ask');
  const prompt = document.getElementById('prompt');
  const submit = document.getElementById('submit');
  const answers = document.getElementById('answers');
  const error = document.getElementById('error');

  const MESSAGES = {
    budget_exceeded: 'Dein KI-Budget für diesen Monat ist aufgebraucht.',
    model_not_allowed: 'Dieses KI-Modell ist für die App nicht freigegeben.',
    unauthenticated: 'Bitte melde dich neu an.',
  };

  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };

  function render(history) {
    answers.replaceChildren();
    for (const entry of history) {
      const item = document.createElement('li');
      item.style.flexDirection = 'column';
      item.style.alignItems = 'stretch';
      const question = document.createElement('strong');
      question.textContent = entry.question;
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = entry.answer;
      item.append(question, text);
      answers.append(item);
    }
  }

  // Handlers work immediately; the SDK and the history load in the background.
  for (const button of document.querySelectorAll('[data-example]')) {
    button.addEventListener('click', () => {
      prompt.value = button.dataset.example;
      prompt.focus();
    });
  }

  const ready = (async () => {
    const mn = await window.mininode.mininode();
    await mn.auth.requireLogin();
    return mn;
  })();
  let history = [];
  void ready
    .then((mn) => mn.kv.get('history'))
    .then((stored) => {
      // Keep answers that arrived while the stored history was still loading.
      history = [...history, ...(stored ?? [])].slice(0, 5);
      render(history);
    })
    .catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = prompt.value.trim();
    if (!question) return;
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Denke nach …';
    try {
      const mn = await ready;
      const answer = await mn.ai.chat(`Ich brauche Ideen für: ${question}`, {
        model: 'gemini-flash',
        system:
          'Du antwortest auf Deutsch, per du, mit genau fünf kurzen, konkreten Ideen als ' +
          'nummerierte Liste. Keine Einleitung, kein Fazit.',
        maxOutputTokens: 600,
      });
      history = [{ question, answer }, ...history].slice(0, 5);
      render(history);
      prompt.value = '';
      await mn.kv.set('history', history).catch(() => {});
    } catch (err) {
      fail(
        MESSAGES[err?.code] ??
          'Die KI antwortet gerade nicht. Ist der KI-Proxy schon eingerichtet (Anbieter-Schlüssel)?',
      );
    } finally {
      submit.disabled = false;
      submit.textContent = 'Ideen holen';
    }
  });
});
