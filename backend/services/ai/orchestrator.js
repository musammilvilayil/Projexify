const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in .env. AI features will fail.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const fileTools = {
  functionDeclarations: [
    {
      name: "update_file",
      description: "Creates a new file or updates an existing one with new content. Use this to help students by providing code they can apply.",
      parameters: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING", description: "Relative path to the file (e.g., 'src/index.js' or 'index.html')" },
          content: { type: "STRING", description: "The full content to write to the file." }
        },
        required: ["filePath", "content"]
      }
    }
  ]
};

/**
 * Orchestrates LLM calls for the Virtual Lab assistant.
 */
class AIOrchestrator {
  /**
   * Generates a context-aware response for the chat assistant.
   */
  async getAssistantResponse({ prompt, filePath, fileContent, consoleTail, errorStack }) {
    try {
      // Use gemini-3-flash-preview as per project requirements
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash-preview",
        tools: [fileTools],
        safetySettings
      });

      const systemPrompt = `
You are the Projexify AI Assistant, an expert software engineer guiding students in a Virtual Lab.
Your goal is to provide concise, helpful, and technically accurate advice.

Context for the current session:
- Current File: ${filePath || 'No file selected'}
- File Content (snippet): 
\`\`\`
${fileContent || '// No content available'}
\`\`\`
- Recent Console Output/History:
\`\`\`
${consoleTail || 'No logs available'}
\`\`\`
- Error/Exception Detail:
\`\`\`
${errorStack || 'No specific error detected'}
\`\`\`

Instructions:
1. If an error is provided, analyze the logs and code to suggest a specific fix.
2. If the user asks general questions, answer them in the context of their current project where possible.
3. If the user asks you to write, update, or fix code, use the 'update_file' tool to propose the changes.
4. Keep responses under 250 words. Use Markdown for code snippets in your text response.
5. Be encouraging but professional.
`;

      const result = await model.generateContent([systemPrompt, prompt]);
      const response = await result.response;
      
      let calls = null;
      try {
        calls = response.functionCalls();
      } catch (e) {
        // No function calls
      }

      let text = "";
      try {
        text = response.text();
      } catch (e) {
        // If it's ONLY a function call, text() throws
        if (calls && calls.length > 0) {
          text = "I've prepared the changes you requested:";
        } else {
          throw e; // Real error
        }
      }

      return {
        message: text,
        toolCalls: calls || []
      };
    } catch (error) {
      console.error("Gemini AI Error:", error);
      throw new Error("Failed to generate AI response: " + error.message);
    }
  }

  /**
   * Generates inline code suggestions (simplified).
   */
  async getCodeCompletion({ filePath, prompt }) {
    // This is a placeholder for a more specialized completion model call
    return [{ insertText: "// Suggestion coming soon", detail: "LLM completion" }];
  }
}

module.exports = new AIOrchestrator();
