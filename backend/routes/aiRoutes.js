const express = require('express');
const mongoose = require('mongoose');
const { verifyToken } = require('../middleware/auth');
const aiOrchestrator = require('../services/ai/orchestrator');
const fileEditor = require('../services/ai/fileEditor');
const aiService = require('../services/aiService');
const ProjectWorkspace = require('../models/ProjectWorkspace');

const router = express.Router();

router.post('/assist', verifyToken, async (req, res) => {
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

  try {
    // 1. Write to disk
    const result = await fileEditor.writeFile(projectId, filePath, content);

    // 2. Update Database Record to keep file manager in sync
    let workspace = await ProjectWorkspace.findOne({ 
      projectId: new mongoose.Types.ObjectId(projectId),
      studentId: req.user.id 
    });
    if (workspace) {
      const existing = workspace.files.find(f => f.path === filePath);
      if (existing) {
        existing.modified_at = new Date();
        existing.size_bytes = Buffer.byteLength(content || '');
      } else {
        workspace.files.push({
          file_id: new mongoose.Types.ObjectId().toString(),
          path: filePath,
          name: filePath.split('/').pop(),
          type: 'file',
          size_bytes: Buffer.byteLength(content || ''),
          createdBy: req.user.id,
          created_at: new Date(),
          modified_at: new Date()
        });
      }
      await workspace.save();
    }

    return res.json({ 
      message: `Successfully updated ${filePath}`, 
      path: result.path 
    });
  } catch (error) {
    console.error("Apply Edit Error:", error);
    return res.status(500).json({ message: error.message || "Failed to apply edit" });
  }
});

router.post('/complete', verifyToken, async (req, res) => {
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
router.post('/calculate-project-pricing', verifyToken, async (req, res) => {
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
