import {Server}               from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import Neo                    from '../../../../src/Neo.mjs';
import * as core              from '../../../../src/core/_export.mjs';
import InstanceManager        from '../../../../src/manager/Instance.mjs';

import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { listTools, callTool } from './services/toolService.mjs';

const server = new Server({
    name: 'neo-memory-core',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {
            listChanged: false
        }
    }
});

// List all available tools from OpenAPI spec
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    try {
        const { cursor, limit } = request.params || {};
        const { tools, nextCursor } = listTools({ cursor, limit });

        const mcpTools = tools.map(tool => ({
            name        : tool.name,
            title       : tool.title,
            description : tool.description,
            inputSchema : tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations : tool.annotations
        }));

        const result = { tools: mcpTools };

        // `nextCursor` must not have a null or undefined value
        if (nextCursor) {
            result.nextCursor = nextCursor;
        }
        return result;
    } catch (error) {
        console.error('[MCP] Error listing tools:', error);
        return { tools: [], nextCursor: null, error: error.message };
    }
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        console.error(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

        const result = await callTool(name, args);

        // Format the response based on the result type
        let contentBlock;
        let structuredContent = null;

        if (typeof result === 'object' && result !== null) {
            contentBlock = {
                type: 'text',
                text: JSON.stringify(result, null, 2)
            };
            structuredContent = result;
        } else {
            contentBlock = {
                type: 'text',
                text: String(result)
            };
        }

        const response = {
            content: [contentBlock],
            isError: false
        };

        if (structuredContent) {
            response.structuredContent = structuredContent;
        }

        return response;
    } catch (error) {
        console.error(`[MCP] Error executing tool ${name}:`, error);

        return {
            content: [{
                type: 'text',
                text: `Error executing ${name}: ${error.message}`
            }],
            isError: true
        };
    }
});

// Start the stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Log to stderr (stdout is reserved for MCP protocol)
    console.error('[neo-memory-core MCP] Server started on stdio transport');
    console.error('[neo-memory-core MCP] Available tools loaded from OpenAPI spec');
}

main().catch((error) => {
    console.error('[neo-memory-core MCP] Fatal error:', error);
    process.exit(1);
});
