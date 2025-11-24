import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport}                          from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Base                                            from '../../../../src/core/Base.mjs';
import aiConfig                                        from './config.mjs';
import logger                                          from './logger.mjs';
import HealthService                                   from './services/HealthService.mjs';
import SessionService                                  from './services/SessionService.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

/**
 * @summary The Memory Core MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the MCP server.
 *
 * @class Neo.ai.mcp.server.memory-core.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Server'
    }

    /**
     * Path to a custom configuration file.
     * @member {String|null} configFile=null
     */
    configFile = null
    /**
     * The MCP Server instance.
     * @member {McpServer|null} mcpServer=null
     * @protected
     */
    mcpServer = null
    /**
     * The Transport instance.
     * @member {StdioServerTransport|null} transport=null
     * @protected
     */
    transport = null

    /**
     * Async initialization sequence.
     * Replaces the main() function of the previous procedural implementation.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // 1. Load custom configuration if provided
        if (this.configFile) {
            try {
                await aiConfig.load(this.configFile);
            } catch (error) {
                logger.error('Failed to load configuration:', error);
                throw error; // Re-throw to trigger ready() catch block in runner
            }
        }

        // 2. Initialize MCP Server instance
        this.mcpServer = new McpServer({
            name   : 'neo-memory-core',
            version: process.env.npm_package_version || '1.0.0',
        }, {
            capabilities: {
                tools: {
                    listChanged: false
                }
            }
        });

        // 3. Setup Request Handlers
        this.setupRequestHandlers();

        // 4. Wait for dependent services
        // SessionService is a singleton, so we wait for its global ready state
        await SessionService.ready();

        // 5. Perform Health Check & Log Status
        const health = await HealthService.healthcheck();
        this.logStartupStatus(health);

        // 6. Connect Transport
        this.transport = new StdioServerTransport();
        await this.mcpServer.connect(this.transport);

        logger.info('[neo-memory-core MCP] Server started on stdio transport');
        logger.info('[neo-memory-core MCP] Available tools loaded from OpenAPI spec');
    }

    /**
     * Helper to log collection statistics.
     * @param {Object} health The health check result object.
     */
    logCollectionStats(health) {
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    }

    /**
     * Logs the health status of the server during startup.
     * @param {Object} health The health check result object.
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database.process.running) {
                logger.warn('    💡 Tip: Use the start_database tool after server starts, or run:');
                logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
            }
            logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
        } else if (health.status === 'degraded') {
            logger.warn('⚠️  [Startup] Memory Core is degraded. Some features may be unavailable.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            logger.info('✅ [Startup] ChromaDB connectivity confirmed');
            this.logCollectionStats(health);
        } else {
            logger.info('✅ [Startup] Memory Core health check passed');
            this.logCollectionStats(health);
        }
    }

    /**
     * Wires up the MCP request handlers for listing and calling tools.
     */
    setupRequestHandlers() {
        // List Tools Handler
        this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
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

                if (nextCursor) {
                    result.nextCursor = nextCursor;
                }
                return result;
            } catch (error) {
                logger.error('[MCP] Error listing tools:', error);
                return { tools: [], nextCursor: null, error: error.message };
            }
        });

        // Call Tool Handler
        this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                logger.debug(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

                const exemptFromHealthCheck = ['healthcheck', 'start_database', 'stop_database'];

                if (!exemptFromHealthCheck.includes(name)) {
                    try {
                        await HealthService.ensureHealthy();
                    } catch (healthError) {
                        logger.error(`[MCP] Health check failed for tool ${name}:`, healthError.message);
                        return {
                            content: [{
                                type: 'text',
                                text: `Cannot execute ${name}: ${healthError.message}`
                            }],
                            isError: true
                        };
                    }
                }

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
                logger.error(`[MCP] Error executing tool ${name}:`, error);

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
