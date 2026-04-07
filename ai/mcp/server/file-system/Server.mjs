import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Base                                            from '../../../../src/core/Base.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

/**
 * @summary The File System MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the file-system MCP server.
 * Provides restricted, sandboxed file operations and execution feedback for agents.
 *
 * @class Neo.ai.mcp.server.fileSystem.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.fileSystem.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.fileSystem.Server'
    }

    /**
     * The MCP Server instance.
     * @member {McpServer|null} mcpServer=null
     * @protected
     */
    mcpServer = null

    /**
     * Async initialization sequence.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // 1. Initialize MCP Server instance
        this.mcpServer = new McpServer({
            name   : 'neo-file-system',
            version: process.env.npm_package_version || '1.0.0',
        }, {
            capabilities: {
                tools: {
                    listChanged: false
                }
            }
        });

        // 2. Setup Request Handlers
        this.setupRequestHandlers();

        // 3. Connect Transport (Only stdio supported for file-system currently)
        const {StdioServerTransport} = await import('@modelcontextprotocol/sdk/server/stdio.js');
        const transport = new StdioServerTransport();
        await this.mcpServer.connect(transport);

        console.log('[neo-file-system MCP] Server started on stdio transport');
    }

    /**
     * Wires up the MCP request handlers for listing and calling tools.
     */
    setupRequestHandlers() {
        // List Tools Handler
        this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                const {cursor, limit}     = request.params || {};
                const {tools, nextCursor} = listTools({cursor, limit});

                const mcpTools = tools.map(tool => ({
                    name        : tool.name,
                    title       : tool.title,
                    description : tool.description,
                    inputSchema : tool.inputSchema,
                    outputSchema: tool.outputSchema,
                    annotations : tool.annotations
                }));

                const result = { tools: mcpTools };

                if (nextCursor) {
                    result.nextCursor = nextCursor;
                }
                return result;
            } catch (error) {
                console.error('[MCP] Error listing tools:', error);
                return {tools: [], nextCursor: undefined, error: error.message};
            }
        });

        // Call Tool Handler
        this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const {name, arguments: args} = request.params;

            try {
                const result = await callTool(name, args);

                let contentBlock;
                let isError           = false;
                let structuredContent = null;

                if (typeof result === 'object' && result !== null) {
                    isError = 'error' in result;

                    if (isError) {
                        contentBlock = {
                            type: 'text',
                            text: `Tool Error: ${result.error || 'Unknown Error'}. Message: ${result.message || 'No message provided.'}`
                        };
                    } else {
                        contentBlock = {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        };
                        structuredContent = result;
                    }
                } else {
                    contentBlock = {
                        type: 'text',
                        text: String(result)
                    };
                }

                const response = {
                    content: [contentBlock],
                    isError
                };

                if (structuredContent) {
                    response.structuredContent = structuredContent;
                }

                return response;
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }
}

export default Neo.setupClass(Server);
