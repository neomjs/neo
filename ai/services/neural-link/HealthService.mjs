import path                     from 'path';
import {fileURLToPath}          from 'url';
import Base                     from '../../../src/core/Base.mjs';
import ConnectionService        from './ConnectionService.mjs';
import logger                   from '../../mcp/server/neural-link/logger.mjs';
import RuntimeFreshnessService  from '../../mcp/server/shared/services/RuntimeFreshnessService.mjs';

const
    serviceDir              = path.dirname(fileURLToPath(import.meta.url)),
    configPath              = path.resolve(serviceDir, '../../config.mjs'),
    openApiPath             = path.resolve(serviceDir, '../../mcp/server/neural-link/openapi.yaml'),
    runtimeFreshnessTracker = RuntimeFreshnessService.createTracker({
        files  : [{
            key       : 'configDigest',
            path      : configPath,
            errorLabel: 'config digest'
        }, {
            key       : 'openApiDigest',
            path      : openApiPath,
            errorLabel: 'OpenAPI digest'
        }],
        serviceName       : 'Neural Link MCP server',
        identityLabel     : 'source/config identity',
        assertionFacts    : 'tool-schema/source facts',
        restartScope      : 'cached source, config, and tool definitions',
        statusFields      : ['configDigest', 'openApiDigest'],
        unavailableSummary: 'config digest and OpenAPI digest'
    });

/**
 * @summary Monitors the health of the Neural Link MCP Server.
 *
 * This service checks the status of the WebSocket server and the active connections
 * to the App Worker(s). It provides a `healthcheck` tool that agents can use
 * to verify if the runtime bridge is operational.
 *
 * A long-lived Neural Link MCP process can stay bridge-healthy while its checkout, config, or
 * OpenAPI schema has moved underneath it — the gap that lets a stale bridge process keep forwarding
 * pre-merge frames undetected. The `runtimeFreshness` block in the healthcheck payload surfaces that
 * drift via the shared, digest-based {@link Neo.ai.mcp.server.shared.services.RuntimeFreshnessService}
 * (cloud-safe — no `gitHead` coupling), bringing the bridge to parity with the Memory Core, Knowledge
 * Base, and GitHub Workflow MCP servers.
 *
 * @class Neo.ai.services.neural-link.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Shared runtime freshness tracker.
     * @member {RuntimeFreshnessTracker} #runtimeFreshnessTracker
     * @private
     */
    #runtimeFreshnessTracker = runtimeFreshnessTracker;

    /**
     * Optional unit-test seam for injecting boot/current runtime identity reads.
     * @member {Function|null} runtimeFreshnessReader
     */
    runtimeFreshnessReader = null;

    /**
     * Duration (in milliseconds) for which runtime freshness remains cached.
     * @member {Number} runtimeFreshnessCacheDuration
     */
    runtimeFreshnessCacheDuration = 30 * 1000;

    /**
     * Boot-time runtime identity captured before long-lived MCP clients can go stale.
     * @member {Object} bootRuntimeIdentity
     */
    get bootRuntimeIdentity() {
        return this.#runtimeFreshnessTracker.bootRuntimeIdentity;
    }

    set bootRuntimeIdentity(value) {
        this.#runtimeFreshnessTracker.bootRuntimeIdentity = value || {};
    }

    /**
     * Boot-time runtime identity read errors.
     * @member {String[]} bootRuntimeFreshnessErrors
     */
    get bootRuntimeFreshnessErrors() {
        return this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors;
    }

    set bootRuntimeFreshnessErrors(value) {
        this.#runtimeFreshnessTracker.bootRuntimeFreshnessErrors = Array.isArray(value) ? value : [];
    }

    /**
     * ISO timestamp captured when this server module was loaded.
     * @member {String} runtimeStartedAt
     */
    get runtimeStartedAt() {
        return this.#runtimeFreshnessTracker.startedAt;
    }

    set runtimeStartedAt(value) {
        this.#runtimeFreshnessTracker.startedAt = value;
    }

    /**
     * Checks the health of the Neural Link server.
     * @returns {Promise<Object>} The health status payload.
     */
    async healthcheck() {
        try {
            const status = ConnectionService.getStatus();
            let   health = 'healthy';

            if (!status.bridgeConnected) {
                health = 'unhealthy'
            }

            return {
                status   : health,
                timestamp: new Date().toISOString(),
                bridge   : {
                    connected: status.bridgeConnected,
                    agentId  : status.agentId,
                    port     : ConnectionService.port
                },
                sessions : status.sessions,
                windows  : status.windows,
                agents   : status.agents,
                version  : process.env.npm_package_version || '1.0.0',
                uptime   : process.uptime(),
                runtimeFreshness: await this.resolveRuntimeFreshness()
            };
        } catch (error) {
            logger.error('[HealthService] Unexpected error during health check:', error);
            return {
                status : 'unhealthy',
                error  : 'Health check failed unexpectedly',
                message: error.message,
                code   : 'HEALTH_CHECK_ERROR'
            };
        }
    }

    /**
     * Resolves the live runtime freshness diagnostic for the attached Neural Link MCP process.
     *
     * A process can be bridge-healthy while stale relative to the checkout/config an agent is
     * inspecting. Surfacing this lightweight warning in the healthcheck avoids duplicate source
     * tickets when the right action is restart/reconnect.
     *
     * @returns {Promise<Object>} Runtime freshness diagnostic payload.
     */
    async resolveRuntimeFreshness() {
        return this.#runtimeFreshnessTracker.resolve({
            reader       : this.runtimeFreshnessReader,
            cacheDuration: this.runtimeFreshnessCacheDuration
        });
    }

    /**
     * Clears the short runtime-freshness cache, forcing the next resolve to re-read identity.
     */
    clearCache() {
        this.#runtimeFreshnessTracker.clearCache();
    }
}

export default Neo.setupClass(HealthService);
