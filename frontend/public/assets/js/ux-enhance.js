/* Projexify UX enhancements: progressive, non-breaking, safe to load on any page. */
(function () {
  'use strict';
  if (window.__uxEnhanced) return;
  window.__uxEnhanced = true;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ---------- Toasts (non-blocking replacement for alert) ---------- */
  var container;
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'ux-toasts';
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(message, type, duration) {
    type = type || 'info';
    duration = duration == null ? 4500 : duration;
    var icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
    var el = document.createElement('div');
    el.className = 'ux-toast ' + type;
    if (type === 'error') el.setAttribute('role', 'alert');
    var icon = document.createElement('strong');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[type] || icons.info;
    var text = document.createElement('span');
    text.textContent = String(message);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ux-toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    el.appendChild(icon); el.appendChild(text); el.appendChild(close);
    getContainer().appendChild(el);

    function dismiss() {
      el.classList.add('closing');
      setTimeout(function () { el.remove(); }, 250);
    }
    close.addEventListener('click', dismiss);
    if (duration > 0) setTimeout(dismiss, duration);
    return el;
  }
  window.uxToast = toast;

  function guessType(msg) {
    var m = String(msg).toLowerCase();
    if (/(error|fail|invalid|denied|unable|could not|cannot|not found)/.test(m)) return 'error';
    if (/(success|saved|created|updated|deleted|sent|copied|enrolled|approved|✅)/.test(m)) return 'success';
    if (/(warning|please|required|must)/.test(m)) return 'warning';
    return 'info';
  }
  // Non-blocking alert. confirm()/prompt() are left untouched because they need a return value.
  window.alert = function (msg) { toast(msg, guessType(msg), 5500); };

  /* ---------- Page-level a11y & structure ---------- */
  function addSkipLink() {
    var main = document.querySelector('main') || document.querySelector('.main-content');
    if (!main) return;
    if (!main.id) main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
    if (document.querySelector('.skip-link')) return;
    var a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#' + main.id;
    a.textContent = 'Skip to main content';
    document.body.insertBefore(a, document.body.firstChild);
  }

  function markCurrentNav() {
    var path = location.pathname.replace(/\/$/, '');
    document.querySelectorAll('nav a[href], .admin-nav a, .center-nav a, .sidebar-nav a').forEach(function (a) {
      try {
        var p = new URL(a.getAttribute('href'), location.href).pathname.replace(/\/$/, '');
        if (p === path) a.setAttribute('aria-current', 'page');
      } catch (e) { /* ignore bad hrefs */ }
    });
  }

  function labelControls() {
    // Icon-only / emoji-only buttons
    document.querySelectorAll('button:not([aria-label])').forEach(function (b) {
      var t = (b.textContent || '').trim();
      if (t.length > 0 && t.length <= 2 || (!t && b.title)) {
        b.setAttribute('aria-label', b.title || ({ '×': 'Close', '✕': 'Close', '✖': 'Close' }[t]) || 'Button');
      }
    });
    // Inputs without a label: fall back to placeholder / name
    document.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'hidden' || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
      var hasLabel = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || el.closest('label');
      if (!hasLabel) {
        var txt = el.getAttribute('placeholder') || el.name || el.id;
        if (txt) el.setAttribute('aria-label', txt);
      }
    });
    // Decorative aurora background
    document.querySelectorAll('.aurora-bg').forEach(function (n) { n.setAttribute('aria-hidden', 'true'); });
    // External links
    document.querySelectorAll('a[target="_blank"]').forEach(function (a) {
      var rel = (a.getAttribute('rel') || '').split(/\s+/);
      if (rel.indexOf('noopener') < 0) rel.push('noopener');
      a.setAttribute('rel', rel.join(' ').trim());
    });
  }

  function wrapTables() {
    document.querySelectorAll('table').forEach(function (t) {
      if (t.parentElement && t.parentElement.classList.contains('table-scroll')) return;
      var w = document.createElement('div');
      w.className = 'table-scroll';
      w.setAttribute('tabindex', '0');
      w.setAttribute('role', 'region');
      w.setAttribute('aria-label', 'Scrollable table');
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
  }

  /* ---------- Modals: scroll lock, Esc to close ---------- */
  function watchModals() {
    var sel = '[class*="modal-overlay"], .modal, [role="dialog"]';
    var pending = false;
    function sync() {
      pending = false;
      var open = Array.prototype.some.call(document.querySelectorAll(sel), function (el) {
        var cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.position === 'fixed' && el.getBoundingClientRect().height > 0;
      });
      if (document.body.classList.contains('modal-open') !== open) document.body.classList.toggle('modal-open', open);
    }
    new MutationObserver(function (muts) {
      // ignore our own body class toggle
      if (muts.every(function (m) { return m.target === document.body; })) return;
      if (!pending) { pending = true; requestAnimationFrame(sync); }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var closers = document.querySelectorAll('[class*="modal-overlay"] [class*="close"], .modal [class*="close"], [role="dialog"] [class*="close"]');
      for (var i = closers.length - 1; i >= 0; i--) {
        if (closers[i].offsetParent !== null) { closers[i].click(); break; }
      }
    });
  }

  /* ---------- Submit feedback: prevent double submit ---------- */
  function guardForms() {
    document.addEventListener('submit', function (e) {
      var btn = e.submitter || e.target.querySelector('button[type="submit"], input[type="submit"]');
      if (!btn || btn.dataset.uxBusy) return;
      btn.dataset.uxBusy = '1';
      btn.classList.add('is-loading');
      setTimeout(function () { // re-enable so failed validations / errors never lock the form
        delete btn.dataset.uxBusy;
        btn.classList.remove('is-loading');
      }, 4000);
    }, true);
  }

  /* ---------- Scroll reveal (fail-safe) ---------- */
  function reveal() {
    if (!('IntersectionObserver' in window)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.stat-card, .feature-card, .glass-card, .project-card').forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight) return; // already on screen: don't animate
      el.classList.add('ux-reveal');
      el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
      io.observe(el);
    });
    // Safety net: never leave content hidden
    setTimeout(function () {
      document.querySelectorAll('.ux-reveal:not(.in)').forEach(function (el) { el.classList.add('in'); });
    }, 4000);
  }


  /* ---------- Theme toggle (light / dark) ---------- */
  var SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function applyTheme(t, persist) {
    var root = document.documentElement;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f4f6fb' : '#0b1020');
    if (persist) { try { localStorage.setItem('projexify-theme', t); } catch (e) { /* ignore */ } }
    document.querySelectorAll('.theme-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', String(t === 'light'));
      b.setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      b.title = b.getAttribute('aria-label');
    });
    setTimeout(function () { root.classList.remove('theme-switching'); }, 350);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }
  window.setTheme = function (t) { applyTheme(t === 'light' ? 'light' : 'dark', true); };

  function ensureToggle() {
    if (window.__themeLock) return; // e.g. Virtual Lab stays dark
    var btn = document.querySelector('.theme-toggle');
    var host = document.querySelector('nav .nav-auth') || document.querySelector('nav .nav-menu');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-toggle';
      btn.innerHTML = SUN + MOON;
      btn.addEventListener('click', function () { window.setTheme(currentTheme() === 'light' ? 'dark' : 'light'); });
      applyTheme(currentTheme(), false); // sets labels for the new button
    }
    if (host) {
      if (btn.parentNode !== host) { btn.classList.remove('floating'); host.insertBefore(btn, host.firstChild); }
    } else if (!btn.parentNode) {
      btn.classList.add('floating');
      document.body.appendChild(btn);
    }
  }
  // follow OS changes until the user picks explicitly
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: light)');
    var onChange = function (e) {
      var saved = null; try { saved = localStorage.getItem('projexify-theme'); } catch (x) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'light' : 'dark', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  ready(function () {
    ensureToggle();
    setTimeout(ensureToggle, 600); // nav is injected by ui-manager.js after load
    addSkipLink();
    markCurrentNav();
    labelControls();
    wrapTables();
    watchModals();
    guardForms();
    reveal();
    // Dynamic content (rendered from API data) gets the same treatment
    var t;
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(function () { ensureToggle(); wrapTables(); labelControls(); markCurrentNav(); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
