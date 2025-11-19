import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport}                          from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {Command}                                       from 'commander';
import Neo                                             from '../../../../src/Neo.mjs';
import * as core                                       from '../../../../src/core/_export.mjs';
import InstanceManager                                 from '../../../../src/manager/Instance.mjs';
import aiConfig                                        from './config.mjs';
import HealthService                                   from './services/HealthService.mjs';
import RepositoryService                               from './services/RepositoryService.mjs';
import logger                                          from './logger.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';

const program = new Command();

program
    .name('neo-github-workflow-mcp')
    .description('Neo.mjs GitHub Workflow MCP Server')
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
    name: 'neo-github-workflow',
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

        if (!name.includes('healthcheck')) {
            // Perform health check before tool execution (with caching)
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

// Start the stdio transport
async function main() {
    // Perform initial health check (non-blocking)
    const health = await HealthService.healthcheck();

    if (health.status === 'unhealthy') {
        logger.warn('⚠️  [Startup] GitHub CLI is not available. Server will start but tools will fail until resolved.');
        health.githubCli.details.forEach(detail => logger.warn(`    ${detail}`));
        logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
    } else if (health.status === 'degraded') {
        logger.warn('⚠️  [Startup] GitHub CLI is partially configured. Some operations may fail.');
        health.githubCli.details.forEach(detail => logger.warn(`    ${detail}`));
    } else {
        logger.info('✅ [Startup] GitHub CLI health check passed');
        // Proactively fetch and cache viewer permission
        await RepositoryService.fetchAndCacheViewerPermission();
    }

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    logger.info('[neo-github-workflow MCP] Server started on stdio transport');
    logger.info('[neo-github-workflow MCP] Available tools loaded from OpenAPI spec');
}

main().catch((error) => {
    logger.error('[neo-github-workflow MCP] Fatal error:', error);
    process.exit(1);
});
