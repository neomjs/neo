import BaseServer            from '../BaseServer.mjs';
import aiConfig              from './config.mjs';
import logger                from './logger.mjs';
import HealthService         from '../../../services/gitlab-workflow/HealthService.mjs';
import {listTools, callTool} from './toolService.mjs';

/**
 * @summary The GitLab Workflow MCP Server application.
 *
 * Bootstraps the GitLab Workflow MCP surface as a sibling to `github-workflow`.
 * This initial scaffold deliberately registers the GitHub Workflow-compatible
 * tool contract while leaving real GitLab API calls to the later GitLab client
 * and syncer work.
 *
 * @class Neo.ai.mcp.server.gitlab-workflow.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.gitlab-workflow.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.gitlab-workflow.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    /**
     * @summary MCP server identity for `createMcpServer()`.
     * @returns {{name: String, version: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-gitlab-workflow',
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
     * @summary GitLab API/sync services are intentionally absent from this scaffold.
     * Later subtasks add dependent services once real API clients and syncers exist.
     * @returns {Array<Object>}
     */
    getDependentServices() {
        return [];
    }

    /**
     * @summary HealthService for the scaffold healthcheck gate.
     * @returns {Object}
     */
    getHealthService() {
        return HealthService;
    }

    /**
     * @summary Tools allowed without the healthcheck gate.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return ['healthcheck'];
    }

    /**
     * @summary GitLab-workflow-specific startup status formatting.
     * @param {Object} health
     */
    logStartupStatus(health) {
        if (health.status === 'healthy') {
            logger.info('[Startup] GitLab Workflow MCP scaffold health check passed');
        } else {
            logger.warn(`[Startup] GitLab Workflow MCP scaffold reported ${health.status}`);
            (health.details || []).forEach(detail => logger.warn(`    ${detail}`));
        }
    }
}

export default Neo.setupClass(Server);
