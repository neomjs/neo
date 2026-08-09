import BaseServer                             from '../BaseServer.mjs';
import aiConfig                               from './config.mjs';
import ConfigBase, {PLANE_MEMBER_PATHS}       from './configBase.mjs';
import logger                                 from './logger.mjs';
import DatabaseService                        from '../../../services/knowledge-base/DatabaseService.mjs';
import HealthService                          from '../../../services/knowledge-base/HealthService.mjs';
import KBRecorderService                      from '../../../services/knowledge-base/KBRecorderService.mjs';
import {listTools, callTool}                  from './toolService.mjs';
import {describeCollectionStats, STATS_LEVEL} from './describeCollectionStats.mjs';

/**
 * @summary The Knowledge Base MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Knowledge Base MCP server.
 * This server uses a dual-transport architecture, allowing it to communicate with local CLI clients
 * via `stdio` (the default) or with cloud-native/remote clients via `streamable-http`.
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
     * @summary The Knowledge Base opens durable plane storage (the unified Chroma persist
     * dir, shared telemetry SQLite) — a declared plane MEMBER: the boot-time plane-identity
     * assertion fails loud rather than ever silently skipping.
     * @returns {Boolean}
     * @protected
     */
    isPlaneMember() {
        return true;
    }

    /**
     * @summary The COMPLETE plane this server opens: its local claimed member paths PLUS the
     * inherited Tier-1 claims, composed by `BaseServer.collectMemberEntries` — the boot-time
     * input for the F-invariant's member-coherence clause.
     * @returns {Object[]}
     * @protected
     */
    getPlaneMembers() {
        return this.collectMemberEntries({
            localPaths         : PLANE_MEMBER_PATHS,
            localDescriptorData: ConfigBase.config.data
        });
    }

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
     * @summary Starts the lifecycle-owned embedding producer and awaits its first bounded
     * observation before the server publishes startup health.
     *
     * Health reads remain pure snapshots. The explicit 30-second consumer deadline bounds boot
     * even when a provider accepts the request and never answers; process exit disarms scheduling.
     * @returns {Promise<void>}
     */
    async beforeHealthcheck() {
        const firstObservation = HealthService.startEmbeddingProbe();

        process.once('exit', () => HealthService.stopEmbeddingProbe());

        if (firstObservation) {
            await firstObservation;
        }
    }

    /**
     * @summary Publishes this server's heap observation as the `kb-server` Compose service.
     *
     * The label matches this server's own `logger.filePrefix` and the orchestrator bridge's
     * `allowedServices` entry — the same string the bridge resolves `kb-server.json` from, so the
     * record's identity check passes for the right reason rather than by coincidence.
     * @returns {String}
     */
    getHeapObservationServiceKey() { return 'kb-server' }

    /**
     * @summary Tools allowed without the healthcheck gate.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return ['healthcheck', 'get_ingestion_progress', 'list_agent_faqs', 'manage_knowledge_base'];
    }

    /**
     * @summary Streamable-HTTP-only hook: builds the KB RequestContext from authenticated transport identity.
     *
     * Knowledge Base read and ingest services enforce tenant isolation from
     * `RequestContextService.getUserId()`. Propagating the Streamable HTTP auth context here keeps
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

            if (!health.database.connection.connected) {
                logger.warn('    💡 Tip: Start or recover the orchestrator-managed ChromaDB instance.');
            } else if (!health.database.process.running) {
                logger.info('    Unified topology: Knowledge Base is connected to the orchestrator-managed ChromaDB instance.');
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
        // The decision lives in `describeCollectionStats` so it can be witnessed without standing up
        // an MCP server; this method owns only the forwarding. Reviewers asked for proof that the
        // replacement instrument fires, and a decision reachable only through a class boot is a
        // decision nothing asserts.
        const {level, lines} = describeCollectionStats(health.database.connection.collections?.knowledgeBase);

        lines.forEach(line => level === STATS_LEVEL.warn ? logger.warn(line) : logger.info(line));
    }
}

export default Neo.setupClass(Server);
