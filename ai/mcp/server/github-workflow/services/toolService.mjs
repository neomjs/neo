import { tools } from './tools.mjs';

const toolMap = new Map(tools.map(tool => [tool.name, tool]));

/**
 * Lists all available tools.
 * @returns {object[]} A list of tool definitions.
 */
function listTools() {
    return tools.map(tool => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
    }));
}

/**
 * Calls a tool by its name with the given arguments.
 * @param {string} toolName - The name of the tool to call.
 * @param {object} args - The arguments for the tool.
 * @returns {Promise<any>} The result of the tool execution.
 */
async function callTool(toolName, args) {
    const tool = toolMap.get(toolName);

    if (!tool || !tool.handler) {
        throw new Error(`Tool "${toolName}" not found or not implemented.`);
    }

    return tool.handler(args);
}

export {
    listTools,
    callTool
};