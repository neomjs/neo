import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport}                          from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {Command}                                       from 'commander';
import Neo                                             from '../../../../src/Neo.mjs';
import * as core                                       from '../../../../src/core/_export.mjs';
import InstanceManager                                 from '../../../../src/manager/Instance.mjs';
import aiConfig                                        from './config.mjs';
import HealthService                                   from './services/HealthService.mjs';
import SessionService                                  from './services/SessionService.mjs';
import logger                                          from './logger.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

const program = new Command();

program
    .name('neo-memory-core-mcp')
    .description('Neo.mjs Memory Core MCP Server')
    .option('-c, --config <path>', 'Path to the configuration file')
    .option('-d, --debug', 'Enable debug logging')
    .parse(process.argv);

const options = program.opts();

// Apply debug flag
if (options.debug) {
    aiConfig.data.debug = true;
}

// Load custom configuration if provided
if (options.config) {
    try {
        await aiConfig.load(options.config);
    } catch (error) {
        console.error('Failed to load configuration:', error);
        process.exit(1);
    }
}

const mcpServer = new McpServer({
    name: 'neo-memory-core',
    version: process.env.npm_package_version || '1.0.0',
}, {
    capabilities: {
        tools: {
            listChanged: false
        }
    }
});

// List all available tools from OpenAPI spec
mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
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
        logger.error('[MCP] Error listing tools:', error);
        return { tools: [], nextCursor: null, error: error.message };
    }
});

// Handle tool execution
mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        logger.debug(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

        const exemptFromHealthCheck = ['healthcheck', 'start_database', 'stop_database'];

        // Perform health check before tool execution (with caching)
        // Skip for lifecycle and healthcheck tools to avoid circular dependencies
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

        // Format the response based on the result type
        let contentBlock;
        let isError           = false;
        let structuredContent = null;

        if (typeof result === 'object' && result !== null) {
            isError = 'error' in result;

            if (isError) {
                // For errors, provide a descriptive text message and no structured content.
                contentBlock = {
                    type: 'text',
                    text: `Tool Error: ${result.error || 'Unknown Error'}. Message: ${result.message || 'No message provided.'}`
                };
            } else {
                // For successful results, stringify for text content and set structured content.
                contentBlock = {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                };
                structuredContent = result;
            }
        } else {
            // For simple string results.
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

/**
 * Main startup sequence for the Memory Core MCP server.
 *
 * Performs the following steps:
 * 1. Wait for async services - ensures SessionService is initialized and summarized.
 * 2. Health check - verifies ChromaDB connectivity.
 * 3. Status reporting - logs detailed diagnostics.
 * 4. Server startup - connects stdio transport.
 *
 * The server starts even if ChromaDB is unavailable, but tools will fail
 * gracefully with helpful error messages until dependencies are resolved.
 */
async function main() {
    // Wait for async services to initialize.
    // SessionService.ready() will internally wait for the DB and summarize sessions.
    await SessionService.ready();

    // Perform initial health check (non-blocking)
    const health = await HealthService.healthcheck();

    // Report status based on health check results
    if (health.status === 'unhealthy') {
        logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
        health.details.forEach(detail => logger.warn(`    ${detail}`));

        // Provide helpful guidance based on process status
        if (!health.database.process.running) {
            logger.warn('    💡 Tip: Use the start_database tool after server starts, or run:');
            logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
        }
        logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
    } else if (health.status === 'degraded') {
        logger.warn('⚠️  [Startup] Memory Core is degraded. Some features may be unavailable.');
        health.details.forEach(detail => logger.warn(`    ${detail}`));

        logger.info('✅ [Startup] ChromaDB connectivity confirmed');
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    } else {
        // Fully healthy - log success and collection stats
        logger.info('✅ [Startup] Memory Core health check passed');
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    }

    // Start the stdio transport
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    logger.info('[neo-memory-core MCP] Server started on stdio transport');
    logger.info('[neo-memory-core MCP] Available tools loaded from OpenAPI spec');
}

main().catch((error) => {
    logger.error('[neo-memory-core MCP] Fatal error:', error);
    process.exit(1);
});
