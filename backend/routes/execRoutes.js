const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const { normalizeLanguage, createJob, getJob, allowedLanguages } = require('../services/runner/mockRunner');

const router = express.Router();

// Per-user simple rate limit: 5 runs per minute
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: 'Rate limit exceeded: max 5 runs per minute' }
});

router.post('/run', verifyToken, limiter, (req, res) => {
  const { language, code = '', files = [], args = [] } = req.body || {};
  const normalized = normalizeLanguage(language);

  if (!normalized) {
    return res.status(400).json({ message: 'Unsupported language', supported: Object.keys(allowedLanguages) });
  }

  // Truncate code to protect store
  const safeCode = typeof code === 'string' ? code.slice(0, 200_000) : '';

  const job = createJob({
    userId: req.user.id,
    language: normalized,
    code: safeCode,
    files,
    args
  });

  return res.json({ jobId: job.id, status: job.status, stdout: job.stdout, stderr: job.stderr, exitCode: job.exitCode });
});

router.get('/logs/:jobId', verifyToken, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }
  if (job.userId !== req.user.id && !(req.user.roles || []).includes('admin')) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  return res.json({
    jobId: job.id,
    status: job.status,
    stdout: job.stdout,
    stderr: job.stderr,
    exitCode: job.exitCode,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  });
});

module.exports = router;
