const { randomUUID } = require('crypto');

// In-memory job store for stubbed execution
const jobs = new Map();

// Allowed languages and simple command mapping (for future real runner wiring)
const allowedLanguages = {
  node: { name: 'Node.js', image: 'runner-node:lts' },
  javascript: { name: 'Node.js', image: 'runner-node:lts' },
  typescript: { name: 'TypeScript', image: 'runner-node:lts' },
  python: { name: 'Python', image: 'runner-python:3.10' },
  py: { name: 'Python', image: 'runner-python:3.10' },
  html: { name: 'HTML', image: 'runner-static' },
  css: { name: 'CSS', image: 'runner-static' },
  markdown: { name: 'Markdown', image: 'runner-static' },
  plaintext: { name: 'Plain Text', image: 'runner-static' },
  java: { name: 'Java', image: 'runner-java:17' },
  cpp: { name: 'C++', image: 'runner-cpp:14' },
  c: { name: 'C', image: 'runner-c:11' },
  json: { name: 'JSON', image: 'runner-static' }
};

function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') return 'plaintext';
  const key = lang.trim().toLowerCase();
  if (allowedLanguages[key]) return key;
  if (key === 'js') return 'javascript';
  if (key === 'ts') return 'typescript';
  if (key === 'py') return 'python';
  if (key === 'md') return 'markdown';
  if (key === 'txt') return 'plaintext';
  return 'plaintext'; // Fallback to plaintext instead of null
}

const MAX_JOBS = 500;
const JOB_TTL_MS = 60 * 60 * 1000; // keep results for an hour

function purgeJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt.getTime() < cutoff) jobs.delete(id);
  }
  // Hard cap (Map iterates in insertion order, so this drops the oldest first)
  while (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value);
}

/**
 * Server-side execution is not wired to a sandbox yet, so we must NOT pretend the code ran
 * (the old stub echoed the source back with exit code 0 and "completed").
 * Running untrusted code needs a real isolated runner; until then we report that honestly.
 * JavaScript is executed in the learner's own browser by the lab page instead.
 */
function createJob({ userId, language, code, files, args }) {
  purgeJobs();
  const id = randomUUID();
  const now = new Date();
  const label = (allowedLanguages[language] && allowedLanguages[language].name) || language;
  const staticTypes = ['html', 'css', 'markdown', 'plaintext', 'json'];
  const isStatic = staticTypes.includes(language);

  const job = {
    id,
    userId,
    language,
    code: undefined, // not retained: nothing was executed
    files: undefined,
    args: Array.isArray(args) ? args.slice(0, 20) : [],
    status: 'unavailable',
    exitCode: isStatic ? 0 : 1,
    stdout: isStatic ? `${label} files are not executable. Use Preview to view them.` : '',
    stderr: isStatic ? '' : `Running ${label} is not available on this server yet. JavaScript runs directly in your browser.`,
    createdAt: now,
    completedAt: now
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = {
  normalizeLanguage,
  createJob,
  getJob,
  allowedLanguages
};
