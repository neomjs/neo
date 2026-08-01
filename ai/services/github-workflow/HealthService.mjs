import {exec}                  from 'child_process';
import {promisify}             from 'util';
import aiConfig                from '../../mcp/server/github-workflow/config.mjs';
import RuntimeFreshnessService from '../../mcp/server/shared/services/RuntimeFreshnessService.mjs';
import Base                    from '../../../src/core/Base.mjs';
import logger                  from '../../mcp/server/github-workflow/logger.mjs';
import semver                  from 'semver';
import {assertExpectedIdentity} from '../../graph/assertExpectedIdentity.mjs';

const
    execAsync               = promisify(exec),
    runtimeFreshnessTracker = RuntimeFreshnessService.createTracker({
        rootDir: aiConfig.projectRoot,
        files  : [{
            key       : 'openApiDigest',
            path      : new URL('../../mcp/server/github-workflow/openapi.yaml', import.meta.url),
            errorLabel: 'OpenAPI digest'
        }],
        serviceName       : 'GitHub Workflow MCP server',
        identityLabel     : 'schema identity',
        assertionFacts    : 'tool-schema/source facts',
        restartScope      : 'cached tool definitions',
        statusFields      : ['openApiDigest'],
        unavailableSummary: 'git metadata and OpenAPI digest'
    });

/**
 * GitHub notification reasons that should become active wake-content signals.
 * `review_requested` is included alongside direct mentions because both are
 * user-addressed GitHub notification primitives an agent must discover in-session.
 * @type {String[]}
 */
export const GITHUB_WAKE_NOTIFICATION_REASONS = Object.freeze(['mention', 'review_requested']);

/**
 * @summary Projects a raw GitHub notification into the wake-safe shape shared by
 * the health preview and swarm-heartbeat ingestion.
 * @param {Object} notification Raw `gh api notifications` entry.
 * @returns {Object}
 */
export function projectWakeNotification(notification = {}) {
    return {
        id    : notification.id,
        reason: notification.reason,
        type  : notification.subject?.type,
        title : notification.subject?.title,
        url   : notification.subject?.url
    }
}

/**
 * @summary Filters raw GitHub notifications down to wake-relevant reasons.
 * @param {Object[]} notifications Raw `gh api notifications` payload.
 * @returns {Object[]} Wake-safe projected notifications.
 */
export function getWakeRelevantNotifications(notifications = []) {
    if (!Array.isArray(notifications)) return [];
    return notifications
        .filter(notification => GITHUB_WAKE_NOTIFICATION_REASONS.includes(notification?.reason))
        .map(projectWakeNotification)
        .filter(notification => notification.id)
}

/**
 * @summary Builds the passive healthcheck preview from the same notification
 * projection that the heartbeat lane consumes.
 * @param {Object[]} notifications Raw `gh api notifications` payload.
 * @returns {{unreadCount:Number,latest:Object[]}}
 */
export function buildNotificationPreview(notifications = []) {
    const relevant = getWakeRelevantNotifications(notifications);
    return {
        unreadCount: relevant.length,
        latest     : relevant.slice(0, 5)
    }
}

/**
 * @summary Monitors and validates the GitHub CLI dependency for the MCP server.
 *
 * This service acts as a gatekeeper, ensuring that the GitHub CLI (`gh`) is properly
 * installed, authenticated, and meets version requirements before any tools are executed.
 *
 * Key responsibilities:
 * - Version validation: Ensures `gh` meets the minimum required version using semantic versioning
 * - Authentication verification: Confirms the user is logged in to github.com
 * - Intelligent caching: Reduces overhead by caching health status for 5 minutes
 * - Graceful degradation: Provides clear, actionable error messages when dependencies are missing
 * - Recovery detection: Automatically detects when issues are resolved (e.g., after `gh auth login`)
 *
 * The service is designed to be non-blocking at startup, allowing the server to run even
 * when `gh` is not available, while failing gracefully at the tool-call level with helpful
 * error messages to guide users toward resolution.
 *
 * @class Neo.ai.services.github-workflow.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Duration (in milliseconds) for which cached HEALTHY results remain valid.
     * Set to 5 minutes to balance freshness with performance.
     * Unhealthy results are never cached to allow immediate recovery detection.
     * @member {number} #cacheDuration
     * @private
     */
    #cacheDuration = 5 * 60 * 1000;

    /**
     * Cached result of the most recent health check.
     * Used to avoid redundant `gh` CLI calls within the cache TTL window.
     * @member {Object|null} #cachedHealth
     * @private
     */
    #cachedHealth = null;

    /**
     * Timestamp (in milliseconds) of when the health check cache was last populated.
     * @member {number|null} #lastCheckTime
     * @private
     */
    #lastCheckTime = null;

    /**
     * Promise of the currently executing health check.
     * Used for request deduplication to prevent "thundering herd" of gh CLI calls.
     * @member {Promise<Object>|null} #healthCheckPromise
     * @private
     */
    #healthCheckPromise = null;

    /**
     * The status from the previous health check, used to detect state transitions
     * (e.g., recovery from 'unhealthy' to 'healthy') and log meaningful messages.
     * @member {string|null} #previousStatus
     * @private
     */
    #previousStatus = null;

    /**
     * Shared runtime freshness tracker.
     * @member {RuntimeFreshnessTracker} #runtimeFreshnessTracker
     * @private
     */
    #runtimeFreshnessTracker = runtimeFreshnessTracker;

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
     * Optional unit-test seam for injecting boot/current runtime identity reads.
     * @member {Function|null} runtimeFreshnessReader
     */
    runtimeFreshnessReader = null;

    /**
     * Optional unit-test seam for injecting the authenticated GitHub login read. Defaults to
     * resolving it via `gh api user --jq .login`; tests inject a drifted login to exercise the
     * degraded path without a live `gh`.
     * @member {Function|null} agentLoginReader
     */
    agentLoginReader = null;

    /**
     * Injectable reader for the Memory-Core self-identity — the second surface that shares the
     * agent's token. Its source (the MCP request context) lives above this service layer, so the
     * github-workflow server injects it at wire-up; left null elsewhere, where the GitHub-login leg
     * still asserts. A null or unresolvable read skips the Memory-Core leg rather than failing the
     * healthcheck on a missing supplementary signal. Mirrors {@link agentLoginReader}.
     * @member {Function|null} memoryCoreIdentityReader
     */
    memoryCoreIdentityReader = null;

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
     * Duration (in milliseconds) for which runtime freshness remains cached.
     * @member {Number} runtimeFreshnessCacheDuration
     */
    runtimeFreshnessCacheDuration = 30 * 1000;

    /**
     * Verifies that the user is authenticated with GitHub via the `gh` CLI.
     *
     * Intent: Authentication is required for all GitHub API operations. This check
     * ensures the user has run `gh auth login` and has valid credentials stored.
     *
     * @returns {Promise<Object>} {authenticated: boolean, error?: string}
     * @private
     */
    async #checkGhAuth() {
        try {
            const { stdout, stderr } = await execAsync('gh auth status');
            const out = this.#combineOutput(stdout, stderr);
            return this.#parseAuthOutput(out);
        } catch (e) {
            if (this.#interpretExecError(e)) {
                return {
                    authenticated: false,
                    error        : 'GitHub CLI is not installed or not available in PATH. Please install it or run `gh auth login`.'
                };
            }
            return {
                authenticated: false,
                error        : 'GitHub CLI is not authenticated. Please run `gh auth login`.'
            };
        }
    }

    /**
     * Checks if the GitHub CLI is installed and meets the minimum version requirement.
     *
     * Intent: This is the most critical check. Without `gh` installed, no GitHub
     * operations are possible. The version check ensures compatibility with the
     * specific `gh` commands and flags we rely on (e.g., `--json` output formats).
     *
     * We use semantic versioning comparison via the `semver` library to correctly
     * handle version strings like "2.10.0" vs "2.9.0" (which would fail with string
     * comparison).
     *
     * @returns {Promise<Object>} {installed: boolean, versionOk: boolean, version: string|null, error?: string}
     * @private
     */
    async #checkGhVersion() {
        try {
            const { stdout, stderr } = await execAsync('gh --version');
            const out = this.#combineOutput(stdout, stderr);
            return this.#parseVersionOutput(out, aiConfig.minGhVersion);
        } catch (e) {
            if (this.#interpretExecError(e)) {
                return {
                    installed: false,
                    versionOk: false,
                    version  : null,
                    error    : 'GitHub CLI is not installed. Please install it from https://cli.github.com/'
                };
            }
            return {
                installed: false,
                versionOk: false,
                version  : null,
                error    : 'GitHub CLI is not installed or could not be queried.'
            };
        }
    }

    /**
     * Clears the health check cache, forcing the next call to perform a fresh check.
     *
     * Intent: This is primarily useful for testing and debugging scenarios where
     * you need to immediately verify a fix (e.g., after running `gh auth login`)
     * without waiting for the 5-minute cache to expire.
     *
     * In production, this would rarely be called directly, but it could be useful
     * if we later add a "refresh" tool or administrative endpoint.
     */
    clearCache() {
        this.#cachedHealth  = null;
        this.#lastCheckTime = null;
        this.#runtimeFreshnessTracker.clearCache();
        logger.debug('[HealthService] Cache cleared, next health check will be fresh');
    }

    /**
     * @param stdout
     * @param stderr
     * @returns {string}
     */
    #combineOutput(stdout, stderr) {
        return `${stdout || ''}\n${stderr || ''}`;
    }

    /**
     * Ensures the GitHub CLI is healthy before allowing an operation to proceed.
     *
     * Intent: This is the "gatekeeper" method used by tool handlers and internal
     * services (like SyncService) to fail-fast with a clear error message if the
     * GitHub CLI is not available.
     *
     * By throwing an exception, we ensure that:
     * 1. The operation doesn't attempt to use `gh` and get cryptic subprocess errors
     * 2. The agent receives a clear, actionable error message via the MCP protocol
     * 3. Users understand exactly what needs to be fixed
     *
     * This method leverages the cached health check, so calling it frequently
     * (e.g., before each tool invocation) has minimal performance impact.
     * @throws {Error} If the GitHub CLI is unhealthy, with a detailed message
     * @returns {Promise<void>}
     */
    async ensureHealthy() {
        const health = await this.healthcheck();

        if (health.status === 'unhealthy') {
            // Build a multi-line error message with all the issues detected
            const details = health.githubCli.details.join('\n  - ');
            throw new Error(`GitHub CLI is not available:\n  - ${details}`);
        }
    }

    /**
     * Public API: Checks the health of the GitHub CLI with intelligent caching.
     *
     * Intent: This is the primary entry point for all health checks. It uses a
     * 5-minute cache to avoid hammering the `gh` CLI with redundant subprocess
     * calls, which is especially important when:
     * - The MCP server is handling multiple concurrent tool requests
     * - Agents are debugging issues and repeatedly calling healthcheck
     * - The SyncService is running frequent syncs
     *
     * IMPORTANT: Only 'healthy' results are cached. Unhealthy results are always
     * fresh, allowing immediate recovery detection when users fix issues (e.g.,
     * by running `gh auth login`). This ensures good UX - users don't have to
     * wait 5 minutes to retry after fixing a problem.
     *
     * Recovery detection: If the status changes between checks (e.g., from 'unhealthy'
     * to 'healthy'), we log a clear message so users know their fix worked.
     * @returns {Promise<object>} A health status payload with structure:
     *   {
     *     status: 'healthy' | 'degraded' | 'unhealthy',
     *     timestamp: ISO string,
     *     githubCli: {
     *       installed: boolean,
     *       authenticated: boolean,
     *       versionOk: boolean,
     *       version: string | null,
     *       details: string[]
     *     },
     *     runtimeFreshness: {
     *       status: 'current' | 'stale' | 'unknown',
     *       stale: object,
     *       details: string[],
     *       hint: string | null
     *     }
     *   }
     */
    async healthcheck() {
        const now = Date.now();

        // Only use cache if the previous result was healthy
        // Unhealthy results are never cached to allow immediate recovery
        if (this.#cachedHealth &&
            this.#cachedHealth.status === 'healthy' &&
            this.#lastCheckTime) {
            const age = now - this.#lastCheckTime;

            // If the cache is still fresh (< 5 minutes old), return it immediately
            if (age < this.#cacheDuration) {
                logger.debug(`[HealthService] Using cached health status (age: ${Math.round(age / 1000)}s)`);
                return {
                    ...this.#cachedHealth,
                    runtimeFreshness: await this.resolveRuntimeFreshness()
                };
            }
        }

        // Check for in-flight request (deduplication)
        if (this.#healthCheckPromise) {
            logger.debug('[HealthService] Joining in-flight health check...');
            return this.#healthCheckPromise;
        }

        // Cache is stale, was unhealthy, or doesn't exist - perform a fresh check
        logger.debug('[HealthService] Performing fresh health check');

        // Create the promise and store it
        this.#healthCheckPromise = this.#performHealthCheck().finally(() => {
            // Always clear the promise when done, success or fail
            this.#healthCheckPromise = null;
        });

        const health = await this.#healthCheckPromise;

        // Detect and log meaningful state transitions
        // This helps users understand when their fixes (like running `gh auth login`) succeed
        if (this.#previousStatus && this.#previousStatus !== health.status) {
            if (this.#previousStatus === 'unhealthy' && health.status === 'healthy') {
                logger.info('🎉 [HealthService] System recovered! GitHub CLI is now fully operational.');
            } else if (this.#previousStatus === 'healthy' && health.status === 'unhealthy') {
                logger.warn('⚠️  [HealthService] System became unhealthy. Tools may fail until dependencies are resolved.');
            }
        }

        // Update the cache with this fresh result
        // Note: Even unhealthy results are stored, but won't be returned from cache
        this.#cachedHealth   = health;
        this.#lastCheckTime  = now;
        this.#previousStatus = health.status;

        return health;
    }

    /**
     * Resolves the live runtime freshness diagnostic for the attached MCP process.
     *
     * Intent: A process can be infrastructure-healthy while stale relative to the checkout an
     * agent is inspecting. Keeping this as a lightweight, structured warning lets agents
     * choose restart/re-handshake instead of filing duplicate source tickets.
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
     * @param err
     * @returns {boolean}
     */
    #interpretExecError(err) {
        if (!err) return false;
        if (err.code === 'ENOENT') return true;
        const msg = String(err.message || err || '');
        return /not found|ENOENT|is not recognized as an internal or external command/i.test(msg);
    }

    /**
     * @summary Asserts the live authenticated identity is the EXPECTED agent (`NEO_AGENT_IDENTITY`).
     *
     * A drifted `GH_TOKEN` authenticates cleanly yet acts as the wrong identity — the silent failure
     * class that mis-attributes PRs and reviews. This resolves the live login (via {@link agentLoginReader},
     * defaulting to `gh api user --jq .login`) and, when a {@link memoryCoreIdentityReader} is injected,
     * the Memory-Core self-identity (the second surface sharing the token), then delegates the
     * fail-closed comparison to the pure `assertExpectedIdentity` core — so a drift on EITHER surface
     * degrades the healthcheck. Returns `{ok:true}` (a no-op) when no expected identity is configured,
     * fails closed when the login cannot be resolved, and skips the Memory-Core leg when its reader is
     * absent or yields nothing.
     *
     * @returns {Promise<{ok: Boolean, reason: (String|null)}>}
     */
    async checkAgentIdentity() {
        const expectedIdentity = process.env.NEO_AGENT_IDENTITY;

        // No expected identity declared (non-harness / unconfigured) — nothing to assert against.
        if (!expectedIdentity) {
            return {ok: true, reason: null};
        }

        let actualLogin;

        try {
            const readLogin = this.agentLoginReader || (async () => (await execAsync('gh api user --jq .login')).stdout.trim());
            actualLogin = await readLogin();
        } catch (e) {
            // The authed login could not be resolved — fail closed; a drift cannot be ruled out.
            return {ok: false, reason: `identity drift: could not resolve the authed GitHub login (${e.message})`};
        }

        // Second surface that shares the drifted token: the Memory-Core self-identity. Sourced via the
        // injected reader (its MCP request context lives above this layer); absent or unresolvable ->
        // left null so the core asserts the GitHub surface alone rather than failing the healthcheck on
        // a missing supplementary signal.
        let memoryCoreIdentity = null;

        if (this.memoryCoreIdentityReader) {
            try {
                memoryCoreIdentity = await this.memoryCoreIdentityReader();
            } catch (e) {
                memoryCoreIdentity = null;
            }
        }

        return assertExpectedIdentity({expected: expectedIdentity, actualLogin, memoryCoreIdentity});
    }

    /**
     * Performs a comprehensive health check without using the cache.
     *
     * Intent: This is the core health check logic, separated from the caching layer
     * for clarity. It systematically verifies each dependency and builds a detailed
     * status payload that can be used for diagnostics, logging, and error messages.
     *
     * The checks are performed in order of criticality:
     * 1. Installation check (if `gh` isn't installed, nothing else matters)
     * 2. Version check (ensures compatibility)
     * 3. Authentication check (required for API operations)
     *
     * @returns {Promise<object>} A comprehensive health status payload
     * @private
     */
    async #performHealthCheck() {
        const payload = {
            status   : 'healthy',
            timestamp: new Date().toISOString(),
            version  : process.env.npm_package_version || '1.0.0',
            githubCli: {
                installed    : false,
                authenticated: false,
                versionOk    : false,
                version      : null,
                details      : []
            }
        };

        payload.runtimeFreshness = await this.resolveRuntimeFreshness();

        // Step 1: Check version and installation
        // This single check answers both "is gh installed?" and "is the version OK?"
        const versionCheck = await this.#checkGhVersion();
        payload.githubCli.installed = versionCheck.installed;
        payload.githubCli.versionOk = versionCheck.versionOk;
        payload.githubCli.version   = versionCheck.version;

        // If `gh` is not installed, this is a fatal error. No other checks matter.
        // Mark as unhealthy and return immediately.
        if (!versionCheck.installed) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(versionCheck.error);
            // Emit a short structured diagnostic line so monitoring/CI can detect
            // that `gh` is missing without parsing free-form logs.
            // Example: `[HealthService] gh-status: missing; reason=GitHub CLI is not installed...`
            logger.info(`[HealthService] gh-status: missing; reason=${versionCheck.error}`);

            return payload;
        }

        // If the version is outdated, mark as unhealthy.
        // We consider this fatal because using an older version could lead to
        // unpredictable behavior or missing features we depend on.
        if (!versionCheck.versionOk) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(versionCheck.error);
            // Note: We still continue to check auth for a complete diagnostic picture
        }

        // Step 2: Check authentication
        // Even if the version is bad, checking auth is useful for providing a
        // complete list of what needs to be fixed.
        const authCheck = await this.#checkGhAuth();
        payload.githubCli.authenticated = authCheck.authenticated;

        if (!authCheck.authenticated) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(authCheck.error);
            logger.info('[HealthService] gh-status: unauthenticated');
        } else {
            // Step 3: Identity-drift assertion. The agent IS authenticated — but is it the EXPECTED
            // agent? A drifted GH_TOKEN authenticates cleanly yet acts as the wrong identity — the
            // silent failure that mis-attributes PRs and reviews. Degrade (not unhealthy: auth is
            // valid) so a drifted token is surfaced loudly here, before any state-changing write.
            const identityResult = await this.checkAgentIdentity();

            if (!identityResult.ok) {
                payload.status                  = 'degraded';
                payload.githubCli.identityDrift = identityResult.reason;
                payload.githubCli.details.push(identityResult.reason);
                logger.warn(`[HealthService] gh-status: degraded; ${identityResult.reason}`);
            }

            // Step 4: Enrich with Notifications (Passive Inbox) if authenticated
            try {
                const { stdout } = await execAsync("gh api 'notifications?participating=true'");
                const notifications = JSON.parse(stdout);
                payload.notificationPreview = buildNotificationPreview(notifications);
            } catch (e) {
                logger.warn(`[HealthService] Failed to fetch notifications for preview: ${e.message}`);
                // Don't fail the healthcheck if notifications fail, just omit the preview
            }
        }

        // If we made it here with no issues, everything is healthy
        if (payload.status === 'healthy') {
            payload.githubCli.details.push('GitHub CLI is installed, authenticated, and up to date.');
            logger.info('[HealthService] gh-status: healthy');
        }

        return payload;
    }

    #parseAuthOutput(out) {
        if (typeof out !== 'string') out = String(out || '');
        if (out.includes('Logged in to github.com')) {
            return { authenticated: true };
        }
        return { authenticated: false, error: 'Not logged in to github.com. Please run `gh auth login`.' };
    }

    #parseVersionOutput(out, minVersion = '2.0.0') {
        if (typeof out !== 'string') out = String(out || '');

        // Match version string, including pre-release versions
        const m = out.match(/gh version ([\d.]+(?:-[\w.]+)?)/);
        if (!m) {
            return { installed: false, versionOk: false, version: null, error: 'GitHub CLI is not installed. Please install it from https://cli.github.com/' };
        }
        const version = m[1];
        try {
            // Use semver library for robust version comparison
            // Handles edge cases like pre-release versions (e.g., v11.0.0-alpha.2)
            const versionOk = semver.gte(version, minVersion);

            if (versionOk) return { installed: true, versionOk: true, version };
            return { installed: true, versionOk: false, version, error: `gh version (${version}) is outdated. Please upgrade to at least ${minVersion}.` };
        } catch (e) {
            return { installed: true, versionOk: false, version, error: `Could not parse gh version: ${e.message}` };
        }
    }
}

export default Neo.setupClass(HealthService);
