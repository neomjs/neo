import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { listTools, callTool } from './services/toolService.mjs';

const server = new Server(
    {
        name: 'neo-github-workflow',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List all available tools from OpenAPI spec
server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
        const tools = listTools();

        // Convert from your format to MCP format
        const mcpTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || tool.title,
            inputSchema: tool.inputSchema
        }));

        return { tools: mcpTools };
    } catch (error) {
        console.error('[MCP] Error listing tools:', error);
        return { tools: [] };
    }
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        console.error(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

        const result = await callTool(name, args);

        // Format the response based on the result type
        let responseText;
        if (typeof result === 'string') {
            responseText = result;
        } else {
            responseText = JSON.stringify(result, null, 2);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: responseText,
                },
            ],
        };
    } catch (error) {
        console.error(`[MCP] Error executing tool ${name}:`, error);

        return {
            content: [
                {
                    type: 'text',
                    text: `Error executing ${name}: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});

// Start the stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log to stderr (stdout is reserved for MCP protocol)
    console.error('[neo-github-workflow MCP] Server started on stdio transport');
    console.error('[neo-github-workflow MCP] Available tools loaded from OpenAPI spec');
}

main().catch((error) => {
    console.error('[neo-github-workflow MCP] Fatal error:', error);
    process.exit(1);
});
