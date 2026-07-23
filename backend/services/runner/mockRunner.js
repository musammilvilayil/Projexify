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
  if (!lang) return 'plaintext';
  const key = lang.trim().toLowerCase();
  if (allowedLanguages[key]) return key;
  if (key === 'js') return 'javascript';
  if (key === 'ts') return 'typescript';
  if (key === 'py') return 'python';
  if (key === 'md') return 'markdown';
  if (key === 'txt') return 'plaintext';
  return 'plaintext'; // Fallback to plaintext instead of null
}

function createJob({ userId, language, code, files, args }) {
  const id = randomUUID();
  const now = new Date();
  // Stub: immediately mark as completed with echo output
  const stdout = [`[stub-runner] language=${language}`, '[stub-runner] execution not wired yet', code ? '--- code start ---' : '', code || '', code ? '--- code end ---' : ''].filter(Boolean).join('\n');
  const job = {
    id,
    userId,
    language,
    code,
    files,
    args,
    status: 'completed',
    exitCode: 0,
    stdout,
    stderr: '',
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
