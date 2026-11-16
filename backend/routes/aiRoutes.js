const express = require('express');
const { verifyToken } = require('../middleware/auth');
const aiOrchestrator = require('../services/ai/orchestrator');
const rateLimit = require('express-rate-limit');
const { checkRole } = require('../middleware/auth');
const fsx = require('../utils/workspaceFs');
const { prepare, syncRecord } = require('../services/workspaceService');
const fs = require('fs');
const path = require('path');
const aiService = require('../services/aiService');

const router = express.Router();

// AI calls cost money: throttle per user (always behind verifyToken)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => String((req.user && req.user.id) || 'anonymous'),
  message: { message: 'Too many AI requests. Please wait a minute and try again.' },
});

router.post('/assist', verifyToken, aiLimiter, async (req, res) => {
  const { prompt, filePath, fileContent, consoleTail, errorStack } = req.body || {};
  
  try {
    const result = await aiOrchestrator.getAssistantResponse({
      prompt: prompt || "Explain this code.",
      filePath,
      fileContent: typeof fileContent === 'string' ? fileContent.slice(0, 10000) : "",
      consoleTail,
      errorStack
    });

    return res.json({
      message: result.message,
      toolCalls: result.toolCalls,
      summary: prompt && prompt.toLowerCase().includes('explain') ? "Code/Error Explanation" : "AI Assistance",
    });
  } catch (error) {
    console.error("AI Route Error:", error);
    // Send back specialized message if it's a safety/quota block
    const errorMsg = error.message && error.message.includes('safety') 
      ? "I can't process that request due to safety filters. Try rephrasing." 
      : "AI Assistant is temporarily unavailable. Check server logs.";
    return res.status(500).json({ message: errorMsg, details: error.message });
  }
});

router.post('/apply-edit', verifyToken, async (req, res) => {
  const { projectId, filePath, content } = req.body || {};

  if (!projectId || !filePath || content === undefined) {
    return res.status(400).json({ message: "Missing projectId, filePath or content" });
  }
  if (typeof content !== 'string' || Buffer.byteLength(content) > fsx.MAX_FILE_BYTES) {
    return res.status(413).json({ message: 'Edit content is missing or too large (max 2 MB)' });
  }

  try {
    // Same access rules as the file manager: students write to their own copy only
    const ctx = await prepare(req, { write: true });
    const { full, clean } = fsx.safeResolve(ctx.root, filePath, { reserveStudents: ctx.isShared });
    const isNew = !fs.existsSync(full);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
    if (isNew) await syncRecord(ctx);

    return res.json({
      message: `Successfully updated ${clean}`,
      path: clean
    });
  } catch (error) {
    if (error instanceof fsx.HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("Apply Edit Error:", error);
    return res.status(500).json({ message: "Failed to apply edit" });
  }
});

router.post('/complete', verifyToken, aiLimiter, async (req, res) => {
  try {
    const { filePath, prompt, language = 'javascript', context = '' } = req.body || {};
    
    const completion = await aiService.generateCodeCompletion(prompt, language, context);
    
    return res.json({
      completions: [
        {
          insertText: completion.insertText,
          detail: completion.detail,
          filePath
        }
      ],
      promptEcho: typeof prompt === 'string' ? prompt.slice(0, 500) : ''
    });
  } catch (error) {
    console.error('Error in code completion:', error);
    return res.status(500).json({ message: 'Error generating code completion', error: error.message });
  }
});

// POST /api/ai/calculate-project-pricing - Calculate project price and difficulty using AI
router.post('/calculate-project-pricing', verifyToken, checkRole('center_admin', 'admin'), aiLimiter, async (req, res) => {
  try {
    const { title, description, techStack, duration, category } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ 
        message: 'Title and description are required for price calculation' 
      });
    }

    const aiService = require('../services/aiService');
    const assessment = await aiService.calculateProjectPricingAndDifficulty({
      title,
      description,
      techStack: techStack || [],
      duration: duration || 12,
      category: category || 'general'
    });

    return res.json({
      message: 'Project pricing calculated successfully',
      assessment
    });
  } catch (error) {
    console.error('Error calculating project pricing:', error);
    return res.status(500).json({ 
      message: 'Error calculating project pricing',
      error: error.message 
    });
  }
});

module.exports = router;
