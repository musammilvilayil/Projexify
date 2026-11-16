/**
 * Tiny Express stand-in so route modules can be exercised without node_modules.
 * Routes are matched in registration order (like Express), with :params and '*' wildcards.
 */
const Module = require('module');

function compile(routePath) {
  const keys = [];
  let re = routePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+?)'; })
    .replace(/\*/g, () => { keys.push(String(keys.filter((k) => /^\d+$/.test(k)).length)); return '(.*)'; });
  return { regex: new RegExp(`^${re}/?$`), keys };
}

function Router() {
  const routes = [];
  const add = (method) => (p, ...handlers) => { routes.push({ method, ...compile(p), handlers: handlers.flat() }); };
  const router = { routes, get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE'), use() {} };
  router.dispatch = async (method, url, { user, body = {}, query = {}, file, contentType = 'application/json', app } = {}) => {
    const [pathname, qs] = url.split('?');
    const q = { ...query };
    if (qs) new URLSearchParams(qs).forEach((v, k) => (q[k] = v));
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      const req = { params, body, query: q, user, file, app: app || { get: () => null }, is: (t) => (contentType.includes(t) ? t : false), headers: {} };
      let i = 0;
      const next = async (err) => {
        if (err) { res.status(err.status || 500).json({ message: err.message }); return; }
        const h = r.handlers[i++];
        if (h) await h(req, res, next);
      };
      await next();
      return { status: res.statusCode, body: res.body, matchedIndex: routes.indexOf(r) };
    }
    return { status: 404, body: { message: 'no route' } };
  };
  return router;
}

const express = () => ({});
express.Router = Router;
express.json = () => () => {};

function withStubs(stubs, loader) {
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return orig.apply(this, arguments);
  };
  try { return loader(); } finally { Module._load = orig; }
}

module.exports = { Router, express, withStubs };
