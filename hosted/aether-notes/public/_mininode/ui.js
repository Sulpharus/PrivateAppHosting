// MiniNode UI runtime helper
(() => {
  let toastTimeout = null;

  window.mnui = {
    toast: (message) => {
      let toastEl = document.querySelector('.mn-toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'mn-toast';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = message;
      toastEl.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toastEl.classList.remove('show');
      }, 3200);
    },
    theme: {
      set: (theme) => {
        if (theme === 'system') {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', theme);
        }
        try {
          localStorage.setItem('mn_theme', theme);
        } catch (e) {}
      },
      get: () => document.documentElement.getAttribute('data-theme') || 'system',
    },
    select: (el) => {
      if (!el) return;
      const siblings = el.parentElement ? el.parentElement.children : [];
      for (const sib of siblings) {
        sib.removeAttribute('aria-current');
      }
      el.setAttribute('aria-current', 'page');
    },
  };
})();
