/* Runs synchronously in <head> so the saved theme is applied before first paint (no flash). */
(function () {
  var theme = 'dark';
  try {
    var saved = localStorage.getItem('projexify-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  } catch (e) { /* storage unavailable: keep default */ }
  // The Virtual Lab is a dedicated dark IDE-style workspace with its own palette
  if (/virtual-lab/.test(location.pathname)) { theme = 'dark'; window.__themeLock = 'dark'; }
  document.documentElement.setAttribute('data-theme', theme);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#0b1020');
})();
