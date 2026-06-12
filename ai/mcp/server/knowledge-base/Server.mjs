import BaseServer            from '../BaseServer.mjs';
import aiConfig              from './config.mjs';
import logger                from './logger.mjs';
import DatabaseService       from '../../../services/knowledge-base/DatabaseService.mjs';
import HealthService         from '../../../services/knowledge-base/HealthService.mjs';
import KBRecorderService     from '../../../services/knowledge-base/KBRecorderService.mjs';
import {listTools, callTool} from './toolService.mjs';

/**
 * @summary The Knowledge Base MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Knowledge Base MCP server.
 * This server uses a dual-transport architecture, allowing it to communicate with local CLI clients
 * via `stdio` (the default) or with cloud-native/remote clients via `sse` (StreamableHTTPServerTransport).
 *
 * The transport mode and HTTP port can be configured using `aiConfig.transport` and `aiConfig.mcpHttpPort`.
 *
 * @class Neo.ai.mcp.server.knowledge-base.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    /**
     * @summary MCP server identity for `createMcpServer()`.
     * @returns {{name: String, version: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-knowledge-base',
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
     * @summary Singleton services to await ready() before transport-connect.
     * @returns {Array<Object>}
     */
    getDependentServices() {
        return [DatabaseService, KBRecorderService];
    }

    /**
     * @summary HealthService for the healthcheck gate + startup-status logging.
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
        return ['healthcheck', 'list_agent_faqs'];
    }

    /**
     * @summary SSE-only hook: builds the KB RequestContext from authenticated transport identity.
     *
     * Knowledge Base read and ingest services enforce tenant isolation from
     * `RequestContextService.getUserId()`. Propagating the SSE auth context here keeps
     * proxy/OIDC deployments tenant-aware while preserving single-tenant fallthrough when
     * no identity is present.
     * @param {Object|undefined} reqAuth
     * @returns {Promise<Object>}
     */
    async buildRequestContext(reqAuth) {
        if (!reqAuth?.userId) return {};

        return {
            userId  : reqAuth.userId,
            username: reqAuth.username,
            source  : reqAuth.source || 'oidc'
        };
    }

    /**
     * @summary Records failed tool dispatch to KBRecorderService when the healthcheck gate rejects.
     * Preserves the existing telemetry shape (agent_id, session_id, sequence_id, timestamp,
     * tool, args, result, success, duration_ms) so KB-level analytics stay continuous post-migration.
     * @param {{toolName: String, args: Object, error: Error, t0: Number}} context
     */
    async onHealthGateFailure({toolName, args, error, t0}) {
        const agent_id = process.env.NEO_AGENT_ID || process.env.USER || 'unknown';

        KBRecorderService.log({
            agent_id,
            session_id : args?.sessionId || process.env.NEO_SESSION_ID || null,
            sequence_id: `${agent_id}_${t0}`,
            timestamp  : t0,
            tool       : toolName,
            args,
            result     : {error: error.message},
            success    : false,
            duration_ms: Date.now() - t0
        });
    }

    /**
     * @summary KB-specific startup status formatting with ChromaDB-tip on unhealthy + collection
     * stats on degraded/healthy.
     * @param {Object} health
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Knowledge Base is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database.process.running) {
                logger.warn('    💡 Tip: Start ChromaDB externally, or run:');
                logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
            }
            logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
        } else if (health.status === 'degraded') {
            logger.warn('⚠️  [Startup] Knowledge Base is degraded. Some features may be unavailable.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            logger.info('✅ [Startup] ChromaDB connectivity confirmed');
            this.logCollectionStats(health);
        } else {
            logger.info('✅ [Startup] Knowledge Base health check passed');
            this.logCollectionStats(health);
        }
    }

    /**
     * @summary Collection-count log helper, called from logStartupStatus on degraded/healthy paths.
     * @param {Object} health
     */
    logCollectionStats(health) {
        if (health.database.connection.collections) {
            logger.info(`   - Knowledge Base: ${health.database.connection.collections.knowledgeBase.count}`);
        }
    }
}

export default Neo.setupClass(Server);
