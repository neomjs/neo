import BaseServer            from '../BaseServer.mjs';
import aiConfig              from './config.mjs';
import logger                from './logger.mjs';
import HealthService         from '../../../services/github-workflow/HealthService.mjs';
import RepositoryService     from '../../../services/github-workflow/RepositoryService.mjs';
import SyncService           from '../../../services/github-workflow/SyncService.mjs';
import {listTools, callTool} from './toolService.mjs';

/**
 * @summary The GitHub Workflow MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the GitHub Workflow MCP server.
 * It sets up the MCP server instance, connects the stdio transport, registers tool handlers,
 * and performs initial health checks and permission validation.
 *
 * @class Neo.ai.mcp.server.github-workflow.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    /**
     * @summary MCP server identity for `createMcpServer()`.
     * @returns {{name: String, version: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-github-workflow',
            version     : process.env.npm_package_version || '1.0.0',
            capabilities: {
                tools: {listChanged: false}
            }
        };
    }

    /**
     * @summary Per-server tool registry for ListTools / CallTool dispatch.
     * @returns {{listTools: Function, callTool: Function}}
     */
    getToolService() {
        return {listTools, callTool};
    }

    /**
     * @summary Singleton services to await ready() before transport-connect. SyncService runs
     * a startup sync against GitHub; we wait for it to settle before announcing the server ready.
     * @returns {Array<Object>}
     */
    getDependentServices() {
        return [SyncService];
    }

    /**
     * @summary HealthService for the healthcheck gate + startup-status logging.
     * @returns {Object}
     */
    getHealthService() {
        return HealthService;
    }

    /**
     * @summary Tools allowed without the healthcheck gate. The github-workflow OpenAPI spec
     * declares a single canonical `healthcheck` operation; matches the original substring-based
     * exemption (`name.includes('healthcheck')`) since no other tool name contains it.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return ['healthcheck'];
    }

    /**
     * @summary Post-healthcheck hook: pre-fetches and caches the GitHub viewer permission so
     * subsequent tool calls don't pay the per-call API cost. Skipped when health is unhealthy
     * because the underlying `gh` CLI / API is unavailable.
     * @param {Object} health
     */
    async afterHealthcheck(health) {
        if (health?.status !== 'unhealthy') {
            await RepositoryService.fetchAndCacheViewerPermission();
        }
    }

    /**
     * @summary github-workflow-specific startup status formatting with `gh` CLI tip on unhealthy.
     * @param {Object} health
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] GitHub CLI is not available. Server will start but tools will fail until resolved.');
            health.githubCli.details.forEach(detail => logger.warn(`    ${detail}`));
            logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
        } else if (health.status === 'degraded') {
            logger.warn('⚠️  [Startup] GitHub CLI is partially configured. Some operations may fail.');
            health.githubCli.details.forEach(detail => logger.warn(`    ${detail}`));
        } else {
            logger.info('✅ [Startup] GitHub CLI health check passed');
        }
    }
}

export default Neo.setupClass(Server);
