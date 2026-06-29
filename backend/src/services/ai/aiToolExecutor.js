/**
 * AI Tool Executor Module
 * Executes AI tools for fleet operations
 */

import { executeTool, getAvailableTools } from '../aiTools.js';

/**
 * Get available AI tools
 */
export function getTools() {
  return getAvailableTools();
}

/**
 * Execute an AI tool
 */
export async function executeAITool(toolName, parameters) {
  try {
    console.log('AI_TOOL_EXECUTION_START', { toolName, parameters });
    
    const result = await executeTool(toolName, parameters);
    
    console.log('AI_TOOL_EXECUTION_SUCCESS', { toolName });
    
    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('AI_TOOL_EXECUTION_FAILED', { toolName, error: error.message });
    
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Check if a tool is available
 */
export function isToolAvailable(toolName) {
  const tools = getAvailableTools();
  return tools.some(tool => tool.name === toolName);
}
