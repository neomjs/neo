import BaseServer            from '../BaseServer.mjs';
import aiConfig              from './config.mjs';
import logger                from './logger.mjs';
import ConnectionService     from '../../../services/neural-link/ConnectionService.mjs';
import HealthService         from '../../../services/neural-link/HealthService.mjs';
import {listTools, callTool} from './toolService.mjs';

let _turnId = 0;

export const getCurrentTurnId = () => _turnId;

/**
 * @summary The Neural Link MCP Server application.
 *
 * Bridges AI agents to the live browser application via WebSocket. Uses a non-canonical
 * bootstrap order: the stdio MCP transport is connected EARLY (before `ConnectionService`
 * is awaited) so the MCP client handshake succeeds even when the Bridge process is down or
 * still spawning. The Bridge readiness then proceeds asynchronously while the server is
 * already responsive to MCP-side health and tool inquiries.
 *
 * @class Neo.ai.mcp.server.neural-link.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    /**
     * Bridge daemon working directory; passed via CLI / env. When set, propagated to
     * `ConnectionService.cwd` before its `ready()` is awaited so the Bridge spawn uses the
     * correct working tree.
     * @member {String|null} bridgeCwd=null
     */
    bridgeCwd = null

    /**
     * @summary MCP server identity for `createMcpServer()`.
     * @returns {{name: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-neural-link',
            version     : '1.0.0',
            capabilities: {
                tools: {listChanged: false}
            }
        };
    }

    /**
     * @summary Per-server tool registry for ListTools / CallTool dispatch. Increments the
     * module-level `_turnId` counter on every CallTool dispatch (consumed by `getCurrentTurnId()`
     * for transcript-correlation).
     * @returns {{listTools: Function, callTool: Function}}
     */
    getToolService() {
        return {
            listTools,
            callTool: async (name, args) => {
                _turnId++;
                return callTool(name, args);
            }
        };
    }

    /**
     * @summary HealthService for the healthcheck gate + startup-status logging.
     * @returns {Object}
     */
    getHealthService() {
        return HealthService;
    }

    /**
     * @summary Tools allowed without the healthcheck gate. `manage_connection` runs while the
     * Bridge is unhealthy by design — it's the operator's recovery path.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return ['healthcheck', 'manage_connection'];
    }

    /**
     * @summary Custom boot order (override of `BaseServer.boot`): transport connects EARLY
     * so MCP-client handshake succeeds even when the Bridge is down or still spawning. The
     * canonical order would await `ConnectionService.ready()` before `connectTransport()`,
     * which would race against MCP clients trying to connect during Bridge spawn.
     *
     * Sequence:
     * 1. Load custom config
     * 2. Construct mcpServer + wire request handlers
     * 3. Connect stdio transport (early — handshake-tolerance for Bridge-down scenarios)
     * 4. Await ConnectionService.ready (non-fatal: logged but doesn't throw, so the server
     *    stays alive to report health errors via the MCP healthcheck tool)
     * 5. Healthcheck + startup-status log
     *
     * @returns {Promise<void>}
     */
    async boot() {
        await this.loadCustomConfig();

        this.mcpServer = this.createMcpServer();

        // Connect transport EARLY — see method JSDoc for rationale (#10455 lineage).
        await this.connectTransport();
        this.logger.info('Neural Link MCP Server transport connected');

        // ConnectionService — set cwd then ready, with non-fatal error tolerance.
        try {
            if (this.bridgeCwd) {
                ConnectionService.cwd = this.bridgeCwd;
            }
            await ConnectionService.ready();
        } catch (e) {
            this.logger.error('ConnectionService failed to initialize:', e);
            // Do not throw — server stays alive to report health errors via MCP healthcheck.
        }

        await this.runHealthcheckAndLogStatus();

        this.logger.info('Neural Link MCP Server started');
    }

    /**
     * @summary neural-link-specific startup status formatting with session + window counts on
     * healthy paths.
     * @param {Object} health
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
}

export default Neo.setupClass(Server);
