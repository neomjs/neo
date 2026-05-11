import {execSync}            from 'node:child_process';
import Base                  from '../../../src/core/Base.mjs';
import aiConfig              from '../../mcp/server/memory-core/config.mjs';
import logger                from '../../mcp/server/memory-core/logger.mjs';
import AuthMiddleware        from '../../mcp/server/shared/services/AuthMiddleware.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';
import StdioIdentityResolver from '../../mcp/server/shared/services/StdioIdentityResolver.mjs';

import GraphService              from './GraphService.mjs';
import HealthService             from './HealthService.mjs';
import SessionService            from './SessionService.mjs';
import InferenceLifecycleService from './lifecycle/InferenceLifecycleService.mjs';
import WakeSubscriptionService   from './WakeSubscriptionService.mjs';
import CoalescingEngineService   from './CoalescingEngineService.mjs';

/**
 * @summary Integrates Memory Core SDK services with the MCP Server lifecycle.
 * Lifts transport hooks, identity binding, and boot orchestration out of Server.mjs.
 * @class Neo.ai.services.memory-core.McpIntegrationService
 * @extends Neo.core.Base
 * @singleton
 */
class McpIntegrationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.McpIntegrationService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.McpIntegrationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    aiConfig = aiConfig
    logger   = logger
    stdioIdentity = null

    getServerMetadata() {
        return {
            name        : 'neo-memory-core',
            version     : process.env.npm_package_version || '1.0.0',
            capabilities: {
                tools: {listChanged: false},
                experimental: {
                    'neo-wake-substrate': {
                        version: '1.0',
                        supportedEvents: ['wake/sent_to_me', 'wake/task_state_changed', 'wake/permission_granted']
                    }
                }
            }
        };
    }

    getHealthExemptTools() {
        return ['healthcheck', 'start_database', 'stop_database'];
    }

    async beforeToolDispatch({args}) {
        AuthMiddleware.validateNoIdentitySpoof(args);
    }

    async wrapDispatch(dispatch) {
        return this.stdioIdentity
            ? RequestContextService.run(this.stdioIdentity, dispatch)
            : dispatch();
    }

    createMcpServer(mcpServer) {
        CoalescingEngineService.addMcpServer(mcpServer);
        return mcpServer;
    }

    async boot(serverInstance) {
        await serverInstance.loadCustomConfig();

        await WakeSubscriptionService.init();

        serverInstance.mcpServer = serverInstance.createMcpServer();

        await InferenceLifecycleService.ready();
        await SessionService.ready();

        if (aiConfig.transport !== 'sse') {
            this.stdioIdentity = await this.resolveStdioIdentity();
            HealthService.setStdioIdentityState(this.stdioIdentity);

            if (this.stdioIdentity?.agentIdentityNodeId) {
                (async () => {
                    try {
                        const result = await RequestContextService.run(
                            this.stdioIdentity,
                            () => WakeSubscriptionService.bootstrap()
                        );
                        logger.info(`[neo-memory-core MCP] Wake subscription auto-bootstrap: ${result.status} (${result.subscriptionId})`);
                    } catch (err) {
                        logger.warn(`[neo-memory-core MCP] Wake subscription auto-bootstrap skipped (non-fatal): ${err.message}`);
                    }
                })();
            }
        }

        await serverInstance.runHealthcheckAndLogStatus();
        this.logSiblingConcurrency();

        await serverInstance.connectTransport();

        if (aiConfig.transport !== 'sse') {
            this.logIdentityStatus();
        }
    }

    async buildRequestContext(reqAuth) {
        if (!reqAuth?.userId) return {};

        const agentIdentityNodeId = await this.bindAgentIdentity(reqAuth.userId);

        return {
            userId             : reqAuth.userId,
            username           : reqAuth.username,
            agentIdentityNodeId,
            source             : reqAuth.source || 'oidc'
        };
    }

    onSessionClosed(sessionId, mcpServerInstance) {
        if (SessionService) {
            SessionService.queueSummarizationJob(sessionId);
        }
        if (mcpServerInstance) {
            CoalescingEngineService.removeMcpServer(mcpServerInstance);
        }
    }

    async resolveStdioIdentity() {
        const resolved = await StdioIdentityResolver.resolve();

        if (!resolved.githubLogin) return null;

        const agentIdentityNodeId = await this.bindAgentIdentity(resolved.githubLogin);

        return {
            userId             : resolved.githubLogin,
            username           : resolved.username,
            agentIdentityNodeId,
            source             : resolved.source
        };
    }

    async bindAgentIdentity(userId) {
        if (!userId) return null;

        const graphNodeId = '@' + userId;

        try {
            await GraphService.ready();

            let retries = 3;
            let node = null;

            while (retries > 0) {
                node = await GraphService.getNode({id: graphNodeId});
                if (node) {
                    return node.id;
                }

                if (GraphService.db && GraphService.db.vicinityLoadedNodes) {
                    GraphService.db.vicinityLoadedNodes.delete(graphNodeId);
                }

                await new Promise(resolve => setTimeout(resolve, 50));
                retries--;
            }

            logger.warn(`[neo-memory-core MCP] AgentIdentity graph lookup failed for ${graphNodeId}: Node not found in database`);
            return null;
        } catch (error) {
            logger.warn(`[neo-memory-core MCP] AgentIdentity graph lookup failed for ${graphNodeId}: ${error.message}`);
            return null;
        }
    }

    logIdentityStatus() {
        if (!this.stdioIdentity) {
            logger.info('[neo-memory-core MCP] Identity: unresolved (single-tenant fallthrough)');
            return;
        }

        const {userId, agentIdentityNodeId, source} = this.stdioIdentity;
        const bound = agentIdentityNodeId ? `bound to ${agentIdentityNodeId}` : 'unbound (no matching AgentIdentity node)';

        logger.info(`[neo-memory-core MCP] Identity: ${userId} via ${source} — ${bound}`);
    }

    logCollectionStats(health) {
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    }

    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database.process.running) {
                logger.warn('    💡 Tip: Use the start_database tool after server starts, or run:');
                logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
            }
            logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
        } else if (health.status === 'degraded') {
            logger.warn('⚠️  [Startup] Memory Core is degraded. Some features may be unavailable.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            logger.info('✅ [Startup] ChromaDB connectivity confirmed');
            this.logCollectionStats(health);
        } else {
            logger.info('✅ [Startup] Memory Core health check passed');
            this.logCollectionStats(health);
        }
    }

    logSiblingConcurrency() {
        const dbPath = aiConfig.storagePaths.graph;
        if (!dbPath) return;

        const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

        try {
            const raw = execSync(`lsof -F pcn -- ${files.map(f => `'${f}'`).join(' ')}`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let current = null;
            const records = [];
            for (const line of raw.split('\n')) {
                if (!line) continue;
                if (line[0] === 'p') {
                    if (current && current.pid !== process.pid) records.push(current);
                    current = {pid: parseInt(line.slice(1), 10)};
                } else if (current && line[0] === 'c') {
                    current.command = line.slice(1);
                }
            }
            if (current && current.pid !== process.pid) records.push(current);

            const uniquePids = new Set();
            const siblings = records.filter(r => {
                if (uniquePids.has(r.pid)) return false;
                uniquePids.add(r.pid);
                return true;
            });

            if (siblings.length > 0) {
                logger.info(`ℹ️  [Startup] Sibling concurrency: ${siblings.length} peer process(es) holding SQLite files. PIDs: ${siblings.map(s => s.pid).join(', ')}`);
            }
        } catch (error) {
            if (error.status !== 1 && error.code !== 'ENOENT') {
                logger.debug(`[Startup] Failed to check sibling concurrency: ${error.message}`);
            }
        }
    }
}

export default Neo.setupClass(McpIntegrationService);
