import {execFile, execFileSync} from 'child_process';
import {createHash}             from 'crypto';
import {readFileSync}           from 'fs';
import {promisify}              from 'util';
import Base                     from '../../../../../src/core/Base.mjs';

const execFileAsync = promisify(execFile);

/**
 * @summary Normalizes comparable runtime identity values.
 * @param {*} value Candidate identity value.
 * @returns {String|null}
 */
function normalizeComparableValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    return trimmed || null;
}

/**
 * @summary Compares one boot/current runtime identity field.
 * @param {String} field Field name to compare.
 * @param {Object} boot Boot-time identity.
 * @param {Object} current Current identity.
 * @returns {Boolean|null}
 */
function compareIdentityField(field, boot, current) {
    const
        bootValue    = normalizeComparableValue(boot[field]),
        currentValue = normalizeComparableValue(current[field]);

    if (!bootValue || !currentValue) {
        return null;
    }

    return bootValue !== currentValue;
}

/**
 * @summary Normalizes runtime identity file descriptors.
 *
 * Each file descriptor contributes one SHA-256 digest field to the runtime identity block.
 * The descriptor label is used only for compact diagnostic errors; the digest value itself
 * stays private to the boot/current comparison and is not echoed in public healthcheck output.
 *
 * @param {Object[]} files File descriptors.
 * @returns {Object[]}
 */
function normalizeIdentityFiles(files = []) {
    return files
        .filter(Boolean)
        .map(file => ({
            key       : file.key,
            path      : file.path,
            errorLabel: file.errorLabel || file.key
        }));
}

/**
 * @summary Per-consumer runtime freshness tracker created by RuntimeFreshnessService.
 *
 * The tracker owns boot identity capture, current identity reads, compact stale classification,
 * and a short per-consumer cache. Consumers only provide the identity inputs and service-facing
 * wording, so GitHub Workflow, Memory Core, and Knowledge Base cannot drift the semantics apart.
 */
export class RuntimeFreshnessTracker {
    #cachedRuntimeFreshness = null;
    #fieldKeys;
    #files;
    #lastRuntimeFreshnessCheckTime = null;
    #runtimeService;
    #statusFieldSet;

    /**
     * @param {Object} options
     * @param {RuntimeFreshnessService} options.runtimeService Shared runtime freshness service.
     * @param {String} [options.rootDir] Git project root for contextual `gitHead` reads. Omit to
     * disable gitHead tracking entirely (e.g. cloud-deployed services with no git checkout); the
     * tracker then never spawns `git` and never surfaces a `gitHead` field. Only services whose
     * domain is git itself (GitHub Workflow) should supply it.
     * @param {Object[]} options.files Runtime identity files to digest.
     * @param {String} options.serviceName Service display name used in restart guidance.
     * @param {String} options.identityLabel Human-readable identity label.
     * @param {String} options.assertionFacts Facts callers should not assert while stale.
     * @param {String} options.restartScope Cached state refreshed by restarting/reconnecting.
     * @param {String[]} options.statusFields Fields that drive `status:'stale'`.
     * @param {String} options.unavailableSummary Compact list of unavailable identity sources.
     * @param {String} options.startedAt Runtime module load timestamp.
     */
    constructor(options = {}) {
        this.#runtimeService = options.runtimeService;
        this.rootDir         = options.rootDir;
        this.files           = options.files || [];
        this.serviceName     = options.serviceName || 'MCP server';
        this.identityLabel   = options.identityLabel || 'source/config/schema identity';
        this.assertionFacts  = options.assertionFacts || 'source, config, or tool-schema facts';
        this.restartScope    = options.restartScope || 'cached source, config, and tool definitions';
        this.unavailableSummary = options.unavailableSummary ||
            'git metadata, config digest, and OpenAPI digest';
        this.startedAt          = options.startedAt || new Date().toISOString();

        this.#fieldKeys      = [...(this.rootDir ? ['gitHead'] : []), ...this.#files.map(file => file.key)];
        this.#statusFieldSet = new Set(options.statusFields || this.#fieldKeys.filter(key => key !== 'gitHead'));

        const boot = this.#runtimeService.readRuntimeIdentitySync({
            files  : this.#files,
            phase  : 'boot',
            rootDir: this.rootDir
        });

        this.bootRuntimeIdentity        = boot.identity;
        this.bootRuntimeFreshnessErrors = boot.errors;
    }

    /**
     * @member {Object[]} files
     */
    set files(files) {
        this.#files = normalizeIdentityFiles(files);
    }

    get files() {
        return this.#files;
    }

    /**
     * Clears the short runtime freshness cache.
     * @returns {void}
     */
    clearCache() {
        this.#cachedRuntimeFreshness        = null;
        this.#lastRuntimeFreshnessCheckTime = null;
    }

    /**
     * Reads the current checkout/config/schema identity.
     * @returns {Promise<{current: Object, errors: String[]}>}
     */
    async readCurrentIdentity() {
        const {identity, errors} = await this.#runtimeService.readRuntimeIdentity({
            files  : this.#files,
            phase  : 'current',
            rootDir: this.rootDir
        });

        return {current: identity, errors};
    }

    /**
     * Resolves and caches the compact runtime freshness diagnostic.
     *
     * `gitHead` is intentionally contextual: it helps explain that a checkout advanced, but a
     * repo-wide SHA change alone does not prove this MCP server's source/config/schema is stale.
     * Service-owned digests such as `configDigest` and `openApiDigest` drive `status:'stale'`.
     *
     * @param {Object} options
     * @param {Function|null} options.reader Optional test seam returning `{boot,current,errors}`.
     * @param {Number} options.cacheDuration Cache duration in milliseconds.
     * @param {Number} options.now Current timestamp in milliseconds.
     * @returns {Promise<Object>}
     */
    async resolve({reader = null, cacheDuration = 30 * 1000, now = Date.now()} = {}) {
        if (
            this.#cachedRuntimeFreshness &&
            this.#lastRuntimeFreshnessCheckTime !== null &&
            (now - this.#lastRuntimeFreshnessCheckTime) < cacheDuration
        ) {
            return this.#cachedRuntimeFreshness;
        }

        let freshness;

        try {
            const identity = reader
                ? await reader()
                : await this.readCurrentIdentity();

            const runtimeErrors = Array.isArray(identity.errors)
                ? identity.errors
                : [identity.errors].filter(Boolean);

            freshness = this.#runtimeService.classifyRuntimeFreshness({
                assertionFacts  : this.assertionFacts,
                boot            : identity.boot || this.bootRuntimeIdentity,
                current         : identity.current || {},
                errors          : [
                    ...this.bootRuntimeFreshnessErrors,
                    ...runtimeErrors
                ],
                fieldKeys       : this.#fieldKeys,
                identityLabel   : this.identityLabel,
                restartScope    : this.restartScope,
                serviceName     : this.serviceName,
                startedAt       : this.startedAt,
                statusFields    : [...this.#statusFieldSet],
                unavailableSummary: this.unavailableSummary
            });
        } catch (e) {
            freshness = this.#runtimeService.classifyRuntimeFreshness({
                assertionFacts  : this.assertionFacts,
                boot            : this.bootRuntimeIdentity,
                current         : {},
                errors          : [
                    ...this.bootRuntimeFreshnessErrors,
                    `runtime freshness reader failed: ${e.message}`
                ],
                fieldKeys       : this.#fieldKeys,
                identityLabel   : this.identityLabel,
                restartScope    : this.restartScope,
                serviceName     : this.serviceName,
                startedAt       : this.startedAt,
                statusFields    : [...this.#statusFieldSet],
                unavailableSummary: this.unavailableSummary
            });
        }

        this.#cachedRuntimeFreshness        = freshness;
        this.#lastRuntimeFreshnessCheckTime = now;

        return freshness;
    }
}

/**
 * @summary Shared runtime freshness infrastructure for Neo.mjs MCP healthchecks.
 *
 * Long-lived MCP processes can stay dependency-healthy while their checkout, config, or
 * OpenAPI schema has moved underneath them. This service centralizes the boot-vs-current
 * comparison used by MCP healthchecks and keeps the public payload compact: callers see stale
 * booleans and restart guidance, never raw boot/current identity objects.
 *
 * `gitHead` is kept as contextual diagnostic metadata only, and ONLY for consumers that supply a
 * `rootDir`. A repo-wide commit can be unrelated to a specific MCP server, so service-owned digests
 * decide whether `status` becomes `stale`. Services with no git checkout (e.g. cloud-deployed
 * Memory Core / Knowledge Base) omit `rootDir`, never spawn `git`, and drop `gitHead` from the
 * payload — keeping the freshness signal digest-only and fully portable off a GitHub workflow.
 *
 * @class Neo.ai.mcp.server.shared.services.RuntimeFreshnessService
 * @extends Neo.core.Base
 * @singleton
 */
class RuntimeFreshnessService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.RuntimeFreshnessService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.RuntimeFreshnessService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Classifies boot-vs-current runtime identity into compact healthcheck metadata.
     *
     * @param {Object} options
     * @param {String} options.startedAt Runtime module load timestamp.
     * @param {Object} options.boot Boot-time identity.
     * @param {Object} options.current Current identity.
     * @param {String[]} options.errors Identity-read errors.
     * @param {String[]} options.fieldKeys Comparable identity fields.
     * @param {String[]} options.statusFields Fields that drive `status:'stale'`.
     * @param {String} options.serviceName Service display name.
     * @param {String} options.identityLabel Identity label for details.
     * @param {String} options.assertionFacts Facts guarded by stale status.
     * @param {String} options.restartScope Cached state refreshed by restart/reconnect.
     * @param {String} options.unavailableSummary Compact unavailable-source label.
     * @returns {Object}
     */
    classifyRuntimeFreshness({
        startedAt,
        boot = {},
        current = {},
        errors = [],
        fieldKeys = [],
        statusFields = [],
        serviceName = 'MCP server',
        identityLabel = 'source/config/schema identity',
        assertionFacts = 'source, config, or tool-schema facts',
        restartScope = 'cached source, config, and tool definitions',
        unavailableSummary = 'git metadata, config digest, and OpenAPI digest'
    } = {}) {
        const
            stale          = {},
            statusFieldSet = new Set(statusFields),
            details        = [];

        for (const field of fieldKeys) {
            stale[field] = compareIdentityField(field, boot, current);
        }

        const
            comparableFields = Object.entries(stale)
                                      .filter(([, value]) => value !== null)
                                      .map(([key]) => key),
            staleFields      = Object.entries(stale)
                                      .filter(([, value]) => value === true)
                                      .map(([key]) => key),
            statusComparableFields  = comparableFields.filter(field => statusFieldSet.has(field)),
            statusStaleFields       = staleFields.filter(field => statusFieldSet.has(field)),
            contextualStaleFields = staleFields.filter(field => !statusFieldSet.has(field));

        let status;

        if (statusStaleFields.length) {
            status = 'stale';
            details.push(
                `Runtime ${identityLabel} differs from the current checkout (${statusStaleFields.join(', ')}). ` +
                `Restart or reconnect the ${serviceName} before asserting ${assertionFacts}.`
            );
        } else if (statusComparableFields.length || (!statusFieldSet.size && comparableFields.length)) {
            status = 'current';
            details.push(`Runtime ${identityLabel} matches the current checkout.`);
        } else {
            status = 'unknown';
            details.push(
                `Runtime ${identityLabel} could not be compared; ` +
                `${unavailableSummary} reads were unavailable or incomplete.`
            );
        }

        if (contextualStaleFields.length) {
            details.push(
                `Contextual runtime identity differs (${contextualStaleFields.join(', ')}); these fields ` +
                `are informational and do not by themselves mark the ${serviceName} stale.`
            );
        }

        for (const error of errors.filter(Boolean)) {
            details.push(error);
        }

        return {
            status,
            startedAt,
            stale,
            details,
            hint: status === 'stale'
                ? `Restart or reconnect the ${serviceName} to refresh ${restartScope}.`
                : null
        };
    }

    /**
     * Computes a stable SHA-256 digest for runtime freshness file identity.
     *
     * @param {String} filePath Absolute file path.
     * @returns {String}
     */
    createFileDigest(filePath) {
        const contents = readFileSync(filePath);

        return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
    }

    /**
     * Creates a per-consumer runtime freshness tracker.
     *
     * @param {Object} options Tracker configuration.
     * @returns {RuntimeFreshnessTracker}
     */
    createTracker(options = {}) {
        return new RuntimeFreshnessTracker({
            ...options,
            runtimeService: this
        });
    }

    /**
     * Reads source/config/schema identity with async git access for request-time checks.
     *
     * @param {Object} options
     * @param {String} [options.rootDir] Git project root. When omitted, `git` is never spawned and `gitHead` is not read.
     * @param {Object[]} options.files File descriptors to digest.
     * @param {String} options.phase Error-label prefix.
     * @returns {Promise<{identity: Object, errors: String[]}>}
     */
    async readRuntimeIdentity({rootDir, files = [], phase = 'current'} = {}) {
        const
            identity = {},
            errors   = [];

        if (rootDir) {
            try {
                const {stdout} = await execFileAsync('git', ['-C', rootDir, 'rev-parse', 'HEAD']);

                identity.gitHead = stdout.trim();
            } catch (e) {
                errors.push(`${phase} gitHead unavailable: ${e.message}`);
            }
        }

        for (const file of normalizeIdentityFiles(files)) {
            try {
                identity[file.key] = this.createFileDigest(file.path);
            } catch (e) {
                errors.push(`${phase} ${file.errorLabel} unavailable: ${e.message}`);
            }
        }

        return {identity, errors};
    }

    /**
     * Reads source/config/schema identity with sync git access for module boot capture.
     *
     * @param {Object} options
     * @param {String} [options.rootDir] Git project root. When omitted, `git` is never spawned and `gitHead` is not read.
     * @param {Object[]} options.files File descriptors to digest.
     * @param {String} options.phase Error-label prefix.
     * @returns {{identity: Object, errors: String[]}}
     */
    readRuntimeIdentitySync({rootDir, files = [], phase = 'boot'} = {}) {
        const
            identity = {},
            errors   = [];

        if (rootDir) {
            try {
                const stdout = execFileSync('git', ['-C', rootDir, 'rev-parse', 'HEAD'], {
                    encoding: 'utf8',
                    stdio   : ['ignore', 'pipe', 'pipe']
                });

                identity.gitHead = stdout.trim();
            } catch (e) {
                errors.push(`${phase} gitHead unavailable: ${e.message}`);
            }
        }

        for (const file of normalizeIdentityFiles(files)) {
            try {
                identity[file.key] = this.createFileDigest(file.path);
            } catch (e) {
                errors.push(`${phase} ${file.errorLabel} unavailable: ${e.message}`);
            }
        }

        return {identity, errors};
    }
}

export default Neo.setupClass(RuntimeFreshnessService);
