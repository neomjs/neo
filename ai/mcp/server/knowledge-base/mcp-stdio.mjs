import {Server}                                        from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport}                          from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Neo                                             from '../../../../src/Neo.mjs';
import * as core                                       from '../../../../src/core/_export.mjs';
import InstanceManager                                 from '../../../../src/manager/Instance.mjs';
import logger                                          from './logger.mjs';
import DatabaseService                                 from './services/DatabaseService.mjs';
import HealthService                                   from './services/HealthService.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

const server = new Server({
    name: 'neo-knowledge-base',
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
        logger.error('[MCP] Error listing tools:', error);
        return { tools: [], nextCursor: null, error: error.message };
    }
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        logger.error(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

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
 * Main startup sequence for the Knowledge Base MCP server.
 *
 * Performs the following steps:
 * 1. Wait for async services - ensures DatabaseService is initialized and synchronized.
 * 2. Health check - verifies ChromaDB connectivity after the sync process.
 * 3. Status reporting - logs detailed diagnostics.
 * 4. Server startup - connects stdio transport.
 *
 * The server starts even if ChromaDB is unavailable, but tools will fail
 * gracefully with helpful error messages until dependencies are resolved.
 */
async function main() {
    // Wait for async services to initialize.
    // DatabaseService.ready() will internally wait for the DB lifecycle.
    await DatabaseService.ready();

    // Perform initial health check (non-blocking)
    const health = await HealthService.healthcheck();

    // Report status based on health check results
    if (health.status === 'unhealthy') {
        logger.warn('⚠️  [Startup] Knowledge Base is unhealthy. Server will start but tools will fail until resolved.');
        health.details.forEach(detail => logger.warn(`    ${detail}`));

        // Provide helpful guidance based on process status
        if (!health.database.process.running) {
            logger.warn('    💡 Tip: Use the start_database tool after server starts, or run:');
            logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
        }
        logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
    } else if (health.status === 'degraded') {
        logger.warn('⚠️  [Startup] Knowledge Base is degraded. Some features may be unavailable.');
        health.details.forEach(detail => logger.warn(`    ${detail}`));

        logger.info('✅ [Startup] ChromaDB connectivity confirmed');
        if (health.database.connection.collections) {
            logger.info(`   - Knowledge Base: ${health.database.connection.collections.knowledgeBase.count}`);
        }
    } else {
        // Fully healthy - log success and collection stats
        logger.info('✅ [Startup] Knowledge Base health check passed');
        if (health.database.connection.collections) {
            logger.info(`   - Knowledge Base: ${health.database.connection.collections.knowledgeBase.count}`);
        }
    }

    // Start the stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('[neo-knowledge-base MCP] Server started on stdio transport');
    logger.info('[neo-knowledge-base MCP] Available tools loaded from OpenAPI spec');
}

main().catch((error) => {
    logger.error('[neo-knowledge-base MCP] Fatal error:', error);
    process.exit(1);
});
