/**
 * Split deployment support: frontend on Vercel, backend elsewhere (e.g. Render free tier, which sleeps when idle).
 * - Sends /api, /uploads and Socket.IO traffic to window.PROJEXIFY_BACKEND_URL.
 * - Wakes the sleeping backend as soon as a page opens (shows a small banner), holds API calls until it answers,
 *   and keeps it awake with a ping every 8 minutes while a tab is visible.
 * No-op when PROJEXIFY_BACKEND_URL is empty.
 */
(function () {
  var base = String(window.PROJEXIFY_BACKEND_URL || '').replace(/\/+$/, '');
  if (!base) return;
  window.PROJEXIFY_API_BASE = base;

  var nativeFetch = window.fetch.bind(window);
  var isBackendPath = function (p) { return /^\/(api|uploads)(\/|$|\?)/.test(p); };
  var banner = null;
  var showBanner = function () {
    if (banner || !document.body) return;
    banner = document.createElement('div');
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;padding:10px 16px;border-radius:12px;background:#111827;color:#fff;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    banner.textContent = 'Starting the server… this can take up to a minute.';
    document.body.appendChild(banner);
  };
  var hideBanner = function () { if (banner) { banner.remove(); banner = null; } };

  var ping = function () {
    return nativeFetch(base + '/api/health', { cache: 'no-store' }).then(function (r) { return r.status < 500 || r.status === 503 ? r.ok : false; }, function () { return false; });
  };

  var awake = false;
  var wake = (async function () {
    var started = Date.now();
    var timer = setTimeout(function () { if (!awake) { if (document.body) showBanner(); else document.addEventListener('DOMContentLoaded', function () { if (!awake) showBanner(); }); } }, 1200);
    while (Date.now() - started < 120000) {
      if (await ping()) { awake = true; break; }
      await new Promise(function (r) { setTimeout(r, 2500); });
    }
    clearTimeout(timer); hideBanner();
    return awake;
  })();

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof input === 'string' && isBackendPath(url)) {
      var go = function () { return nativeFetch(base + url, init); };
      return awake ? go() : wake.then(go);
    }
    return nativeFetch(input, init);
  };

  // Keep-alive while the user is actively on the site (Render sleeps after ~15 idle minutes).
  setInterval(function () { if (document.visibilityState === 'visible') ping(); }, 8 * 60 * 1000);

  // /uploads/... media referenced by pages must come from the backend too.
  var fixAttr = function (el, attr) {
    var v = el.getAttribute && el.getAttribute(attr);
    if (v && /^\/uploads\//.test(v)) el.setAttribute(attr, base + v);
  };
  var sweep = function (root) {
    if (!root || root.nodeType !== 1) return;
    [root].concat([].slice.call(root.querySelectorAll('[src^="/uploads/"],[href^="/uploads/"],[poster^="/uploads/"]'))).forEach(function (el) {
      fixAttr(el, 'src'); fixAttr(el, 'href'); fixAttr(el, 'poster');
    });
  };
  document.addEventListener('DOMContentLoaded', function () {
    sweep(document.documentElement);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'attributes') fixAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(sweep);
      });
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href', 'poster'] });
  });

  // Socket.IO: point every io(...) call at the backend (namespace-aware).
  var realIo;
  Object.defineProperty(window, 'io', {
    configurable: true,
    get: function () { return realIo; },
    set: function (fn) {
      if (typeof fn !== 'function' || fn.__projexifyWrapped) { realIo = fn; return; }
      var wrapped = function (a, b) {
        if (a && typeof a === 'object') return fn(base, a);
        if (typeof a === 'string' && a.charAt(0) === '/') return fn(base + a, b);
        return fn(a || base, b);
      };
      Object.keys(fn).forEach(function (k) { wrapped[k] = fn[k]; });
      wrapped.__projexifyWrapped = true;
      realIo = wrapped;
    }
  });
})();
