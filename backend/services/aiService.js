const { GoogleGenerativeAI } = require('@google/generative-ai');
const VirtualLabSession = require('../models/VirtualLabSession');
const StudentGroup = require('../models/StudentGroup');
require('dotenv').config();

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock_key');

// Get Socratic debugging hints for student code
const getDebuggingHint = async (codeSnippet, errorMessage, programmingLanguage = 'javascript') => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        question: "What do you think this line of code is doing?",
        hint: "Check the syntax around the error message.",
        guidance_question: "How would you explain this logic to a rubber duck?"
      };
    }

    const model = client.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are an expert mentor providing Socratic method guidance. 
    
A student is learning to code and has encountered an error. Instead of giving them the solution directly, 
guide them with questions to help them discover the fix themselves.

Programming Language: ${programmingLanguage}
Code with error:
\`\`\`
${codeSnippet}
\`\`\`

Error Message:
${errorMessage}

Please provide:
1. A clarifying question about what the code is trying to do
2. A hint about where the issue might be
3. A guiding question that helps them think through the solution
4. DO NOT provide the complete solution, just guidance

Format your response as JSON with fields: "question", "hint", "guidance_question"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON response
    let hint;
    try {
      hint = JSON.parse(text);
    } catch (e) {
      hint = {
        question: text,
        hint: 'Try re-reading the error message carefully.',
        guidance_question: 'What does the error message tell you about the problem?'
      };
    }

    return hint;
  } catch (error) {
    console.error('Error getting debugging hint:', error);
    throw error;
  }
};

// Generate project suggestions based on user interests
const generateProjectSuggestions = async (userInterests, skillLevel) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return [
        { title: "AI Chatbot", description: "Build a simple chatbot.", skills: ["Node.js", "NLP"], duration: 4, application: "Customer Service" }
      ];
    }

    const model = client.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are a project incubation platform AI advisor.
    
Generate 3 innovative project ideas for a student with the following profile:
- Interests: ${userInterests}
- Skill Level: ${skillLevel}

For each project, provide:
1. Project title
2. Brief description (2-3 sentences)
3. Key skills to learn
4. Estimated duration (weeks)
5. Real-world application

Format as JSON array with objects containing: "title", "description", "skills", "duration", "application"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let suggestions;
    try {
      suggestions = JSON.parse(text);
    } catch (e) {
      suggestions = [];
    }

    return suggestions;
  } catch (error) {
    console.error('Error generating suggestions:', error);
    throw error;
  }
};

// Generate milestone breakdown for a project
const generateMilestones = async (projectTitle, duration, techStack) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return [
        { week: 1, title: "Setup", deliverable: "Environment ready", hours: 10 }
      ];
    }

    const model = client.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are an expert project manager creating a structured learning path.

Create a detailed 12-week milestone breakdown for:
- Project: ${projectTitle}
- Duration: ${duration} weeks
- Tech Stack: ${techStack}

For each week, provide:
1. Week number
2. Milestone title
3. Key deliverable or learning outcome
4. Estimated time commitment (hours)

Format as JSON array with objects: "week", "title", "deliverable", "hours"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let milestones;
    try {
      milestones = JSON.parse(text);
    } catch (e) {
      milestones = [];
    }

    return milestones;
  } catch (error) {
    console.error('Error generating milestones:', error);
    throw error;
  }
};

// Calculate project pricing and difficulty using AI
const calculateProjectPricingAndDifficulty = async (projectDetails) => {
  try {
    const { title, description, techStack, duration, category } = projectDetails;
    
    if (!process.env.GEMINI_API_KEY) {
      // Return mock values if API key not available
      return {
        estimated_price: 5000,
        difficulty_level: 'intermediate',
        reasoning: 'Mock calculation - Gemini API key not configured'
      };
    }

    const model = client.getGenerativeModel({ model: 'gemini-pro' });

    const techStackStr = Array.isArray(techStack) ? techStack.join(', ') : techStack || 'General';
    const durationWeeks = duration || 12;

    const prompt = `You are an expert project pricing and assessment consultant for an educational platform.

Based on the following project details, calculate the fair market price in INR and determine the difficulty level.

Project Details:
- Title: ${title}
- Description: ${description}
- Technology Stack: ${techStackStr}
- Duration: ${durationWeeks} weeks
- Category: ${category}

Consider these factors for pricing:
1. Technology stack complexity (basic languages cheaper, ML/AI/Blockchain more expensive)
2. Project duration (longer = higher price)
3. Market demand for the skills
4. Mentorship intensity required
5. Typical educational project pricing (range: ₹2,000 - ₹50,000)

For difficulty level, choose from: beginner, intermediate, advanced
Consider:
- Prerequisite knowledge required
- Complexity of concepts
- Implementation challenges

Provide your analysis as JSON with exactly these fields:
{
  "estimated_price": <number in INR, range 2000-50000>,
  "difficulty_level": "<beginner|intermediate|advanced>",
  "reasoning": "<2-3 sentence explanation of the pricing and difficulty assessment>"
}

IMPORTANT: Return ONLY valid JSON, no additional text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let assessment;
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      assessment = JSON.parse(jsonStr);
      
      // Validate the response
      if (!assessment.estimated_price || !assessment.difficulty_level) {
        throw new Error('Invalid response structure');
      }
      
      // Ensure price is within reasonable range
      assessment.estimated_price = Math.max(2000, Math.min(50000, parseInt(assessment.estimated_price)));
      
      // Validate difficulty level
      if (!['beginner', 'intermediate', 'advanced'].includes(assessment.difficulty_level)) {
        assessment.difficulty_level = 'intermediate';
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError, 'Raw text:', text);
      // Return educated default based on tech stack
      assessment = {
        estimated_price: calculateDefaultPrice(techStackStr, durationWeeks),
        difficulty_level: getDefaultDifficulty(techStackStr),
        reasoning: 'Generated default pricing based on technology stack and duration.'
      };
    }

    return assessment;
  } catch (error) {
    console.error('Error calculating project pricing:', error);
    throw error;
  }
};

// Helper function to calculate default price
const calculateDefaultPrice = (techStack, duration) => {
  const techStackLower = (techStack || '').toLowerCase();
  
  // Base price mapping
  let basePrice = 5000;
  
  // Adjust based on tech stack complexity
  if (techStackLower.includes('ai') || techStackLower.includes('machine learning') || 
      techStackLower.includes('ml') || techStackLower.includes('tensorflow') ||
      techStackLower.includes('pytorch')) {
    basePrice = 15000;
  } else if (techStackLower.includes('blockchain') || techStackLower.includes('web3') || 
             techStackLower.includes('solidity')) {
    basePrice = 12000;
  } else if (techStackLower.includes('cloud') || techStackLower.includes('aws') || 
             techStackLower.includes('gcp') || techStackLower.includes('devops')) {
    basePrice = 10000;
  } else if (techStackLower.includes('react') || techStackLower.includes('vue') || 
             techStackLower.includes('angular') || techStackLower.includes('node')) {
    basePrice = 8000;
  } else if (techStackLower.includes('python') || techStackLower.includes('java') || 
             techStackLower.includes('cpp')) {
    basePrice = 6000;
  }
  
  // Adjust based on duration
  const durationFactor = Math.max(0.8, Math.min(1.5, duration / 12));
  
  return Math.round(basePrice * durationFactor);
};

// Helper function to get default difficulty
const getDefaultDifficulty = (techStack) => {
  const techStackLower = (techStack || '').toLowerCase();
  
  if (techStackLower.includes('ai') || techStackLower.includes('machine learning') || 
      techStackLower.includes('ml') || techStackLower.includes('blockchain') ||
      techStackLower.includes('web3')) {
    return 'advanced';
  } else if (techStackLower.includes('react') || techStackLower.includes('vue') || 
             techStackLower.includes('node') || techStackLower.includes('python')) {
    return 'intermediate';
  }
  
  return 'beginner';
};

// Log AI hint usage
const logAIHintUsage = async (sessionId, groupId, hintType) => {
  try {
    await VirtualLabSession.findByIdAndUpdate(sessionId, { $inc: { ai_hints_used: 1 } });
    await StudentGroup.findByIdAndUpdate(groupId, { $inc: { total_ai_hints_used: 1 } });
    return true;
  } catch (error) {
    console.error('Error logging AI hint:', error);
    throw error;
  }
};

// Generate code completion suggestions
const generateCodeCompletion = async (prompt, language = 'javascript', context = '') => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return {
        insertText: `// AI completion not available - please set GEMINI_API_KEY\nconsole.log('${prompt}');`,
        detail: 'Mock completion - API key not configured'
      };
    }

    const model = client.getGenerativeModel({ model: 'gemini-pro' });

    const fullPrompt = `You are an expert code completion assistant. Provide a helpful code completion for the following prompt.

Programming Language: ${language}
Context: ${context}
Prompt: ${prompt}

Provide a concise, correct code completion that fits the context. Return only the code snippet without explanation.`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const completion = response.text().trim();

    return {
      insertText: completion,
      detail: `AI completion for ${language}`
    };
  } catch (error) {
    console.error('Error generating code completion:', error);
    return {
      insertText: `// Error generating completion: ${error.message}`,
      detail: 'Error in AI completion'
    };
  }
};

module.exports = {
  getDebuggingHint,
  generateProjectSuggestions,
  generateMilestones,
  calculateProjectPricingAndDifficulty,
  logAIHintUsage,
  generateCodeCompletion,
};
