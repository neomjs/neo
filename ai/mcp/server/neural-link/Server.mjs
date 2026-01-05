import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport}                          from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Base                                            from '../../../../src/core/Base.mjs';
import aiConfig                                        from './config.mjs';
import logger                                          from './logger.mjs';
import ConnectionService                               from './services/ConnectionService.mjs';
import HealthService                                   from './services/HealthService.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

/**
 * @class Neo.ai.mcp.server.neural-link.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.Server'
    }

    /**
     * @member {String|null} bridgeCwd=null
     */
    bridgeCwd = null
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

        // 4. Connect Transport (Stdio)
        // We connect early to ensure the MCP client handshake succeeds even if the Bridge is down.
        this.transport = new StdioServerTransport();
        await this.mcpServer.connect(this.transport);
        logger.info('Neural Link MCP Server transport connected');

        // 5. Wait for Connection Service
        // This might take time if spawning a new Bridge process
        try {
            if (this.bridgeCwd) {
                ConnectionService.cwd = this.bridgeCwd;
            }
            await ConnectionService.ready();
        } catch (e) {
            logger.error('ConnectionService failed to initialize:', e);
            // We do not throw here, so the server stays alive to report health errors
        }

        // 6. Perform Health Check & Log Status
        const health = await HealthService.healthcheck();
        this.logStartupStatus(health);

        logger.info('Neural Link MCP Server started');
    }

    /**
     * Logs the health status of the server during startup.
     * @param {Object} health The health check result object.
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Neural Link is unhealthy. Server will start but tools will fail until resolved.');
            health.details?.forEach(detail => logger.warn(`    ${detail}`));
        } else {
            logger.info('✅ [Startup] Neural Link health check passed');
            logger.info(`   - Active Sessions: ${health.sessions.length}`);
            logger.info(`   - Connected Windows: ${health.windows.length}`);
        }
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
                return { tools: [], nextCursor: undefined, error: error.message };
            }
        });

        // Call Tool Handler
        this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                logger.debug(`[MCP] Calling tool: ${name} with params:`, JSON.stringify(request.params));

                // Health Check Gate
                const exemptFromHealthCheck = ['healthcheck', 'manage_connection'];

                if (!exemptFromHealthCheck.includes(name)) {
                    const health = await HealthService.healthcheck();
                    if (health.status !== 'healthy') {
                        return {
                            content: [{
                                type: 'text',
                                text: `Cannot execute ${name}: Neural Link is unhealthy.\nDetails: ${health.details.join(', ')}`
                            }],
                            isError: true
                        };
                    }
                }

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
