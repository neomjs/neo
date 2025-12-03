import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Base from '../../../../src/core/Base.mjs';
import aiConfig from './config.mjs';
import logger from './logger.mjs';
import ConnectionService from './services/ConnectionService.mjs';
import { listTools, callTool } from './services/toolService.mjs';

/**
 * @class Neo.ai.mcp.server.neural-link.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.neural-link.Server'
    }

    /**
     * Path to a custom configuration file.
     * @member {String|null} configFile=null
     */
    configFile = null
    /**
     * @member {McpServer|null} mcpServer=null
     */
    mcpServer = null
    /**
     * @member {StdioServerTransport|null} transport=null
     */
    transport = null

    async initAsync() {
        await super.initAsync();

        // 1. Load custom configuration if provided
        if (this.configFile) {
            try {
                await aiConfig.load(this.configFile);
            } catch (error) {
                logger.error('Failed to load configuration:', error);
                throw error;
            }
        }

        // 2. Initialize MCP Server
        this.mcpServer = new McpServer({
            name: 'neo-neural-link',
            version: '1.0.0'
        }, {
            capabilities: {
                tools: { listChanged: false }
            }
        });

        // 3. Setup Handlers
        this.setupRequestHandlers();

        // 4. Start Connection Service (WebSocket)
        if (!ConnectionService.isReady) {
            // Ensure initialized
        }

        // 5. Connect Transport (Stdio)
        this.transport = new StdioServerTransport();
        await this.mcpServer.connect(this.transport);

        logger.info('Neural Link MCP Server started');
    }

    setupRequestHandlers() {
        // List Tools Handler
        this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                const { cursor, limit } = request.params || {};
                const { tools, nextCursor } = listTools({ cursor, limit });

                const mcpTools = tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema
                }));

                return { tools: mcpTools, nextCursor: nextCursor || undefined };
            } catch (error) {
                logger.error('[MCP] Error listing tools:', error);
                return { tools: [], nextCursor: null, error: error.message };
            }
        });

        // Call Tool Handler
        this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                logger.debug(`[MCP] Calling tool: ${name} with params:`, JSON.stringify(request.params));
                const result = await callTool(name, args);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(result ?? null, null, 2)
                    }]
                };
            } catch (error) {
                logger.error(`[MCP] Error executing tool ${name}:`, error);
                return {
                    content: [{
                        type: 'text',
                        text: `Error: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }
}

export default Neo.setupClass(Server);
