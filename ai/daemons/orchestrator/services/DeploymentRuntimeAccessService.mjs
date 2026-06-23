import http from 'http';
import Base from '../../../../src/core/Base.mjs';

export const DEPLOYMENT_RUNTIME_MECHANISMS = Object.freeze([
    'docker-socket',
    'sidecar'
]);

export const DEPLOYMENT_RUNTIME_READ_OPERATIONS = Object.freeze([
    'inspect',
    'logs',
    'stats'
]);

export const DEPLOYMENT_RUNTIME_LIFECYCLE_OPERATIONS = Object.freeze([
    'restart'
]);

const DEFAULT_RESPONSE_MAX_BYTES = 1024 * 1024;

/**
 * @summary Performs one bounded HTTP request against the Docker Engine Unix socket.
 *
 * @param {Object} options
 * @param {String} options.socketPath Docker socket path.
 * @param {String} options.method HTTP method.
 * @param {String} options.path Docker Engine API path.
 * @param {String|null} [options.body=null] Optional request body.
 * @param {Number} [options.timeoutMs=5000] Request timeout.
 * @param {Number} [options.maxBytes=1048576] Response byte cap.
 * @returns {Promise<{statusCode: Number, headers: Object, body: String}>}
 */
export function dockerSocketRequest({
    socketPath,
    method,
    path,
    body = null,
    timeoutMs = 5000,
    maxBytes = DEFAULT_RESPONSE_MAX_BYTES
}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            socketPath,
            method,
            path,
            timeout: timeoutMs
        }, res => {
            const chunks = [];
            let   bytes  = 0;

            res.on('data', chunk => {
                bytes += chunk.length;

                if (bytes > maxBytes) {
                    req.destroy(new Error(`Docker API response exceeded ${maxBytes} bytes`));
                    return;
                }

                chunks.push(chunk);
            });

            res.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString('utf8');

                if (res.statusCode >= 400) {
                    reject(new Error(`Docker API ${method} ${path} failed with HTTP ${res.statusCode}: ${responseBody.slice(0, 512)}`));
                    return;
                }

                resolve({
                    statusCode: res.statusCode,
                    headers   : res.headers,
                    body      : responseBody
                });
            });
        });

        req.on('timeout', () => req.destroy(new Error(`Docker API ${method} ${path} timed out after ${timeoutMs}ms`)));
        req.on('error', reject);

        if (body !== null) {
            req.write(body);
        }

        req.end();
    });
}

/**
 * @summary Orchestrator-owned L0 deployment-runtime holder with separate read and lifecycle envelopes.
 *
 * The service deliberately talks to the Docker socket through a deny-by-default wrapper instead
 * of exposing docker/compose as a generic executor. Service identity resolves through Docker
 * Compose labels (`com.docker.compose.service`, optionally project-scoped), so callers name an
 * allowlisted service key and never pass an arbitrary container id or shell command.
 *
 * @class Neo.ai.daemons.services.DeploymentRuntimeAccessService
 * @extends Neo.core.Base
 */
export class DeploymentRuntimeAccessService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.DeploymentRuntimeAccessService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.DeploymentRuntimeAccessService',
        /**
         * @member {Object|null} runtimeAccessConfig_=null
         * @protected
         * @reactive
         */
        runtimeAccessConfig_: null,
        /**
         * @member {Function|null} dockerRequestFn_=null
         * @protected
         * @reactive
         */
        dockerRequestFn_: null,
        /**
         * @member {Function|null} nowFn_=null
         * @protected
         * @reactive
         */
        nowFn_: null,
        /**
         * @member {Function|null} writeLog_=null
         * @protected
         * @reactive
         */
        writeLog_: null
    }

    /**
     * Resolves the active runtime-access config.
     * @returns {Object}
     */
    get configValues() {
        return this.runtimeAccessConfig || {};
    }

    /**
     * Resolves the configured runtime mechanism.
     * @returns {String}
     */
    get mechanism() {
        return this.configValues.mechanism || 'docker-socket';
    }

    /**
     * Resolves the configured Docker socket path.
     * @returns {String}
     */
    get socketPath() {
        return this.configValues.socketPath || '/var/run/docker.sock';
    }

    /**
     * Resolves the request timeout.
     * @returns {Number}
     */
    get timeoutMs() {
        return this.configValues.timeoutMs ?? 5000;
    }

    /**
     * Resolves the bounded response cap.
     * @returns {Number}
     */
    get responseMaxBytes() {
        return this.configValues.responseMaxBytes ?? DEFAULT_RESPONSE_MAX_BYTES;
    }

    /**
     * Executes a read-only deployment observation through the read-observe envelope.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted compose service key.
     * @param {'inspect'|'logs'|'stats'} options.operation Read operation.
     * @param {Number} [options.tail] Log tail count for `logs`.
     * @returns {Promise<Object>} Observation payload plus structured proof metadata.
     */
    async readObserve({serviceKey, operation = 'inspect', tail} = {}) {
        this.assertEnabled();
        this.assertMechanismSupported();
        this.assertOperationAllowed('read-observe', operation);

        const target = await this.resolveServiceTarget(serviceKey);

        if (operation === 'inspect') {
            return this.inspectTarget(target);
        }

        if (operation === 'logs') {
            return this.readTargetLogs(target, {tail});
        }

        if (operation === 'stats') {
            return this.readTargetStats(target);
        }

        throw new TypeError(`Unsupported read-observe operation '${operation}'`);
    }

    /**
     * Executes a lifecycle operation through the lifecycle-write envelope.
     *
     * @param {Object} options
     * @param {String} options.serviceKey Allowlisted compose service key.
     * @param {'restart'} options.operation Lifecycle operation.
     * @param {String} [options.reason='manual'] Audit reason.
     * @param {Number} [options.restartTimeoutSeconds] Docker restart timeout.
     * @returns {Promise<Object>} Lifecycle result plus structured proof metadata.
     */
    async applyLifecycle({serviceKey, operation = 'restart', reason = 'manual', restartTimeoutSeconds} = {}) {
        this.assertEnabled();
        this.assertMechanismSupported();
        this.assertOperationAllowed('lifecycle-write', operation);

        const target = await this.resolveServiceTarget(serviceKey);

        if (operation === 'restart') {
            return this.restartTarget(target, {reason, restartTimeoutSeconds});
        }

        throw new TypeError(`Unsupported lifecycle-write operation '${operation}'`);
    }

    /**
     * Ensures deployment runtime access is explicitly enabled.
     * @returns {void}
     */
    assertEnabled() {
        if (!this.configValues.enabled) {
            throw new Error('Deployment runtime access is disabled');
        }
    }

    /**
     * Ensures the configured runtime mechanism is supported by this holder.
     * @returns {void}
     */
    assertMechanismSupported() {
        if (!DEPLOYMENT_RUNTIME_MECHANISMS.includes(this.mechanism)) {
            throw new Error(`Unsupported deployment runtime mechanism '${this.mechanism}'`);
        }

        if (this.mechanism === 'sidecar') {
            throw new Error('Deployment runtime sidecar mechanism is documented fallback only; docker-socket is the MVP implementation');
        }
    }

    /**
     * Ensures the requested operation is allowlisted for the requested capability envelope.
     * @param {'read-observe'|'lifecycle-write'} envelope Capability envelope.
     * @param {String} operation Operation name.
     * @returns {void}
     */
    assertOperationAllowed(envelope, operation) {
        const allowed = envelope === 'read-observe'
            ? this.configValues.readOperations
            : this.configValues.lifecycleOperations;

        if (!Array.isArray(allowed) || !allowed.includes(operation)) {
            throw new Error(`Deployment runtime ${envelope} operation '${operation}' is not allowlisted`);
        }
    }

    /**
     * Resolves an allowlisted compose service key to exactly one Docker container.
     * @param {String} serviceKey Allowlisted compose service key.
     * @returns {Promise<Object>} Resolved target.
     */
    async resolveServiceTarget(serviceKey) {
        this.assertServiceKeyAllowed(serviceKey);

        const composeProject = this.configValues.composeProject || null,
              filters        = {
                  label: [`com.docker.compose.service=${serviceKey}`]
              };

        if (composeProject) {
            filters.label.push(`com.docker.compose.project=${composeProject}`);
        }

        const response = await this.dockerRequest({
            method: 'GET',
            path  : `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify(filters))}`
        });
        const containers = this.parseJson(response.body, 'container list');

        if (!Array.isArray(containers)) {
            throw new Error('Docker API container list response is not an array');
        }

        if (containers.length === 0) {
            throw new Error(`No Docker container found for compose service '${serviceKey}'`);
        }

        if (containers.length > 1) {
            throw new Error(`Compose service '${serviceKey}' resolved to ${containers.length} containers; configure composeProject to disambiguate`);
        }

        const [container] = containers;

        return {
            serviceKey,
            containerId   : container.Id,
            names         : container.Names || [],
            image         : container.Image || null,
            state         : container.State || null,
            status        : container.Status || null,
            composeProject: container.Labels?.['com.docker.compose.project'] || composeProject,
            labels        : {
                composeService: container.Labels?.['com.docker.compose.service'] || serviceKey,
                composeProject: container.Labels?.['com.docker.compose.project'] || composeProject
            }
        };
    }

    /**
     * Ensures the caller cannot address arbitrary services.
     * @param {String} serviceKey Compose service key.
     * @returns {void}
     */
    assertServiceKeyAllowed(serviceKey) {
        if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
            throw new TypeError('Deployment runtime serviceKey is required');
        }

        if (!/^[a-zA-Z0-9_.-]+$/.test(serviceKey)) {
            throw new TypeError(`Deployment runtime serviceKey '${serviceKey}' contains unsupported characters`);
        }

        const allowedServices = this.configValues.allowedServices;

        if (!Array.isArray(allowedServices) || !allowedServices.includes(serviceKey)) {
            throw new Error(`Deployment runtime service '${serviceKey}' is not allowlisted`);
        }
    }

    /**
     * Reads Docker inspect data for a resolved target.
     * @param {Object} target Resolved target.
     * @returns {Promise<Object>}
     */
    async inspectTarget(target) {
        const response = await this.dockerRequest({
            method: 'GET',
            path  : `/containers/${encodeURIComponent(target.containerId)}/json`
        });

        return {
            ok        : true,
            data      : this.parseJson(response.body, 'container inspect'),
            proof     : this.createProofMetadata({envelope: 'read-observe', operation: 'inspect', target}),
            statusCode: response.statusCode
        };
    }

    /**
     * Reads bounded Docker logs for a resolved target.
     * @param {Object} target Resolved target.
     * @param {Object} options
     * @param {Number} [options.tail] Log tail count.
     * @returns {Promise<Object>}
     */
    async readTargetLogs(target, {tail} = {}) {
        const tailCount = tail ?? this.configValues.logTail ?? 200,
              response  = await this.dockerRequest({
                  method: 'GET',
                  path  : `/containers/${encodeURIComponent(target.containerId)}/logs?stdout=1&stderr=1&tail=${encodeURIComponent(String(tailCount))}`
              });

        return {
            ok        : true,
            data      : {logs: response.body, tail: tailCount},
            proof     : this.createProofMetadata({envelope: 'read-observe', operation: 'logs', target}),
            statusCode: response.statusCode
        };
    }

    /**
     * Reads one non-streaming Docker stats sample for a resolved target.
     * @param {Object} target Resolved target.
     * @returns {Promise<Object>}
     */
    async readTargetStats(target) {
        const response = await this.dockerRequest({
            method: 'GET',
            path  : `/containers/${encodeURIComponent(target.containerId)}/stats?stream=false`
        });

        return {
            ok        : true,
            data      : this.parseJson(response.body, 'container stats'),
            proof     : this.createProofMetadata({envelope: 'read-observe', operation: 'stats', target}),
            statusCode: response.statusCode
        };
    }

    /**
     * Restarts a resolved Docker target through the lifecycle-write envelope.
     * @param {Object} target Resolved target.
     * @param {Object} options
     * @param {String} options.reason Audit reason.
     * @param {Number} [options.restartTimeoutSeconds] Docker restart timeout.
     * @returns {Promise<Object>}
     */
    async restartTarget(target, {reason, restartTimeoutSeconds} = {}) {
        const timeoutSeconds = restartTimeoutSeconds ?? this.configValues.defaultRestartTimeoutSeconds ?? 10,
              response       = await this.dockerRequest({
                  method: 'POST',
                  path  : `/containers/${encodeURIComponent(target.containerId)}/restart?t=${encodeURIComponent(String(timeoutSeconds))}`
              });

        return {
            ok        : true,
            data      : {restarted: true, reason, restartTimeoutSeconds: timeoutSeconds},
            proof     : this.createProofMetadata({envelope: 'lifecycle-write', operation: 'restart', target, reason}),
            statusCode: response.statusCode
        };
    }

    /**
     * Performs a runtime request through the injected seam or Docker socket implementation.
     * @param {Object} request Request descriptor.
     * @returns {Promise<{statusCode: Number, headers: Object, body: String}>}
     */
    async dockerRequest(request) {
        const fn = this.dockerRequestFn || dockerSocketRequest;

        return fn({
            socketPath: this.socketPath,
            timeoutMs : this.timeoutMs,
            maxBytes  : this.responseMaxBytes,
            ...request
        });
    }

    /**
     * Parses Docker JSON response bodies with operation context.
     * @param {String} body Response body.
     * @param {String} label Response label.
     * @returns {*}
     */
    parseJson(body, label) {
        try {
            return JSON.parse(body);
        } catch (e) {
            throw new Error(`Invalid Docker ${label} JSON: ${e.message}`);
        }
    }

    /**
     * Creates structured proof metadata for graph/MCP consumers.
     * @param {Object} options
     * @param {'read-observe'|'lifecycle-write'} options.envelope Capability envelope.
     * @param {String} options.operation Operation name.
     * @param {Object} options.target Resolved target.
     * @param {String} [options.reason] Optional lifecycle reason.
     * @returns {Object}
     */
    createProofMetadata({envelope, operation, target, reason} = {}) {
        const observedAt = this.nowFn ? this.nowFn() : Date.now();

        return {
            schemaVersion     : 1,
            recordType        : 'deployment-runtime-access',
            runtimeMechanism  : this.mechanism,
            capabilityEnvelope: envelope,
            operation,
            auditLabel       : `${envelope}:${operation}`,
            auditMode     : this.configValues.auditMode || 'metadata',
            serviceKey    : target.serviceKey,
            targetIdentity: {
                kind: 'compose-service',
                id  : target.serviceKey
            },
            target: {
                containerId   : target.containerId,
                names         : target.names,
                image         : target.image,
                state         : target.state,
                status        : target.status,
                composeProject: target.composeProject,
                labels        : target.labels
            },
            observedAt,
            reason: reason || null
        };
    }
}

export default Neo.setupClass(DeploymentRuntimeAccessService);
