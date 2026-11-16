// Vercel build step: writes the backend URL into the static frontend (see vercel.json).
const fs = require('fs');
const path = require('path');
const url = String(process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
if (process.env.VERCEL && !url) {
  console.error('BACKEND_URL is not set. Add it in Vercel > Project Settings > Environment Variables (e.g. https://projexify-api.onrender.com).');
  process.exit(1);
}
const out = path.join(__dirname, '../frontend/public/assets/js/env-config.js');
fs.writeFileSync(out, `// Generated at build time.\nwindow.PROJEXIFY_BACKEND_URL = ${JSON.stringify(url)};\n`);
console.log(`Frontend backend URL: ${url || '(same origin)'}`);
