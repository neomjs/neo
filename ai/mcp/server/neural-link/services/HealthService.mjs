import Base              from '../../../../../src/core/Base.mjs';
import ConnectionService from './ConnectionService.mjs';
import logger            from '../logger.mjs';

/**
 * @summary Monitors the health of the Neural Link MCP Server.
 *
 * This service checks the status of the WebSocket server and the active connections
 * to the App Worker(s). It provides a `healthcheck` tool that agents can use
 * to verify if the runtime bridge is operational.
 *
 * @class Neo.ai.mcp.server.neural-link.services.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.HealthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Checks the health of the Neural Link server.
     * @returns {Promise<Object>} The health status payload.
     */
    async healthcheck() {
        try {
            const status = ConnectionService.getStatus();
            const details = [];

            if (status.sessions === 0) {
                details.push('No active App Worker sessions');
            } else {
                details.push(`${status.sessions} active App Worker session(s)`);
                details.push(`${status.windows.length} connected window(s)`);
            }

            return {
                status   : 'healthy',
                timestamp: new Date().toISOString(),
                server   : {
                    port            : ConnectionService.port,
                    activeSessions  : status.sessions,
                    connectedWindows: status.windows.length
                },
                details,
                version  : process.env.npm_package_version || '1.0.0',
                uptime   : process.uptime()
            };
        } catch (error) {
            logger.error('[HealthService] Unexpected error during health check:', error);
            return {
                status : 'unhealthy',
                details: [`Unexpected error: ${error.message}`],
                error  : 'Health check failed unexpectedly',
                message: error.message,
                code   : 'HEALTH_CHECK_ERROR'
            };
        }
    }
}

export default Neo.setupClass(HealthService);
