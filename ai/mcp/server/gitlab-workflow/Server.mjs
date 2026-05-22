import BaseServer            from '../BaseServer.mjs';
import aiConfig              from './config.mjs';
import logger                from './logger.mjs';
import HealthService         from '../../../services/gitlab-workflow/HealthService.mjs';
import {listTools, callTool} from './toolService.mjs';

/**
 * @summary The GitLab Workflow MCP Server application.
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

    getServerMetadata() {
        return {
            name        : 'neo-gitlab-workflow',
            version     : process.env.npm_package_version || '1.0.0',
            capabilities: {
                tools: {listChanged: false}
            }
        };
    }

    getToolService() {
        return {listTools, callTool};
    }

    getDependentServices() {
        return [];
    }

    getHealthService() {
        return HealthService;
    }

    getHealthExemptTools() {
        return ['healthcheck'];
    }

    async afterHealthcheck(health) {
        // No caching logic for GitLab implemented yet.
    }

    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] GitLab CLI is not available. Server will start but tools will fail until resolved.');
        } else {
            logger.info('✅ [Startup] GitLab CLI health check passed');
        }
    }
}

export default Neo.setupClass(Server);
