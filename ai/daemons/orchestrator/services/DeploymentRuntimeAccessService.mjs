import http             from 'http';
import Base             from '../../../../src/core/Base.mjs';
import {RECOVERY_KNOBS} from '../../../services/memory-core/helpers/recoveryKnobRegistry.mjs';

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
    'restart',
    // A live cgroup memory-ceiling change (`POST /containers/{id}/update`), added for the store-class
    // ceiling raise: a store mid-ingestion must gain headroom WITHOUT the restart that would kill the
    // ingestion the raise exists to rescue. Governed by the store-variant actuator row in
    // ADR-0026 §2.8; // ticket-ref-ok: the ADR is the governing authority for this operation's envelope
    // still config-and-lifecycle-only — it moves one bounded resource limit on one allowlisted,
    // identity-proven target, never code or an open container field.
    'update-memory-limit'
]);

/**
 * The orchestrator's own Compose service key.
 *
 * Needed because the orchestrator has to be READABLE through the bridge it publishes — it is the only
 * process holding the tenant-repo-sync failure text, and excluding it made a wedged deployment
 * undiagnosable from a remote client — while never becoming a LIFECYCLE target of that same bridge.
 *
 * That asymmetry is structural rather than a policy preference, which is why it is a constant here and
 * not a config knob: restarting the orchestrator through its own bridge kills the process serving the
 * request, so the caller cannot observe the outcome and the audit entry dies with it. There is no
 * deployment for which self-restart-via-self-bridge is the right behaviour, so it is not offered.
 *
 * Kept honest by a fixture asserting this string equals the orchestrator service key in
 * `ai/deploy/docker-compose.yml` — a rename there must fail a test rather than silently disarm the
 * lifecycle refusal by making it match nothing.
 * @type {String}
 */
export const DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY = 'orchestrator';

const DEFAULT_RESPONSE_MAX_BYTES      = 1024 * 1024;
const DOCKER_SOCKET_FORBIDDEN_CODES   = new Set(['EACCES', 'EPERM']);
const DOCKER_SOCKET_UNAVAILABLE_CODES = new Set(['ENOENT', 'ECONNREFUSED']);

/**
 * @summary Performs one bounded HTTP request against the Docker Engine Unix socket.
 *
 * @param {Object} options
 * @param {String} options.socketPath Docker socket path.
 * @param {String} options.method HTTP method.
 * @param {String} options.path Docker Engine API path.
 * @param {String|null} [options.body=null] Optional request body.
 * @param {Object|null} [options.headers=null] Optional request headers. The Engine API rejects a
 *     JSON-bodied POST without `Content-Type: application/json`, so body-carrying operations must
 *     declare it; header-free requests stay byte-identical to before this parameter existed.
 * @param {Number} [options.timeoutMs=5000] Request timeout.
 * @param {Number} [options.maxBytes=1048576] Response byte cap.
 * @returns {Promise<{statusCode: Number, headers: Object, body: String}>}
 */
export function dockerSocketRequest({
    socketPath,
    method,
    path,
    body = null,
    headers = null,
    timeoutMs = 5000,
    maxBytes = DEFAULT_RESPONSE_MAX_BYTES
}) {
    return new Promise((resolve, reject) => {
        let requestFinished     = false,
            requestSocket       = null,
            socketBytesAtAttach = 0;

        const asTransportFailure = error => {
            const wroteRequestBytes = requestSocket &&
                Number.isFinite(requestSocket.bytesWritten) &&
                requestSocket.bytesWritten > socketBytesAtAttach;

            error.dockerTransportFailure = true;
            // `finish` proves the full request reached Node's transport. A positive byte delta is
            // deliberately weaker but still enough to make a negative effect claim unsafe: Docker
            // may have received a partial or complete request before the socket failed.
            error.requestDispatched = requestFinished || Boolean(wroteRequestBytes);

            return error
        };

        const req = http.request({
            socketPath,
            method,
            path,
            ...(headers ? {headers} : {}),
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
            res.on('aborted', () => {
                const error = new Error(`Docker API ${method} ${path} response aborted before completion`);

                error.code   = 'ECONNRESET';
                error.reason = 'docker-api-response-aborted';

                reject(asTransportFailure(error))
            });
            res.on('error', error => reject(asTransportFailure(error)));
        });

        req.on('socket', socket => {
            requestSocket       = socket;
            socketBytesAtAttach = Number.isFinite(socket.bytesWritten) ? socket.bytesWritten : 0
        });
        // `finish` proves the complete request left Node's writable side. It does NOT prove Docker
        // acknowledged or applied it — that is precisely why any later transport loss is uncertain.
        req.on('finish', () => {
            requestFinished = true
        });
        req.on('timeout', () => {
            const error = new Error(`Docker API ${method} ${path} timed out after ${timeoutMs}ms`);

            error.code   = 'ETIMEDOUT';
            error.reason = 'docker-api-timeout';

            req.destroy(asTransportFailure(error))
        });
        req.on('error', error => reject(asTransportFailure(error)));

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
 * Compose labels (`com.docker.compose.project` + `com.docker.compose.service`), so callers name an
 * allowlisted service key inside one configured deployment project and never pass an arbitrary
 * container id or shell command.
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
     * Per-target tail of the memory-limit critical section (`withMemoryLimitExclusion`). Process-local
     * on purpose: the recovery-actuator decision record puts the docker socket in exactly ONE
     * orchestrator-resident holder — ADR-0026 // ticket-ref-ok: the ADR is the governing authority for the single-holder topology this soundness argument rests on
     * (the singleton lease forbids a second), so there is no cross-process racer for this map to
     * miss — the assumption is architectural, not hopeful.
     * @member {Map} memoryLimitLocksByService=new Map()
     * @protected
     */
    memoryLimitLocksByService = new Map()

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
     * @summary Declares support for the pre-dispatch durable restart interlock callback.
     * @returns {Boolean}
     */
    get supportsRestartDispatchInterlock() {
        return true
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
     * @param {String|Number} [options.since] Lower bound of the incarnation interval for `logs`.
     * @param {String|Number} [options.until] Upper bound of the incarnation interval for `logs`.
     * @returns {Promise<Object>} Observation payload plus structured proof metadata.
     */
    async readObserve({serviceKey, operation = 'inspect', tail, since, until} = {}) {
        this.assertEnabled();
        this.assertMechanismSupported();
        this.assertOperationAllowed('read-observe', operation);

        const target = await this.resolveServiceTarget(serviceKey);

        if (operation === 'inspect') {
            return this.inspectTarget(target);
        }

        if (operation === 'logs') {
            return this.readTargetLogs(target, {tail, since, until});
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
     * @param {'restart'|'update-memory-limit'} options.operation Lifecycle operation.
     * @param {String} [options.reason='manual'] Audit reason.
     * @param {Number} [options.restartTimeoutSeconds] Docker restart timeout.
     * @param {Number} [options.memoryLimitBytes] Target memory ceiling for `update-memory-limit`.
     * @param {Function|null} [options.isAuthorityHeld=null] Current-authority oracle, re-asked AFTER
     * target resolution and immediately before the mutating call. Optional: a caller that omits it
     * keeps today's behaviour exactly.
     * @param {Function|null} [options.isEffectStillAdmitted=null] Live effect-admission oracle.
     * @param {String|null} [options.expectedContainerId=null] Diagnosed container incarnation.
     * @param {Function|null} [options.onBeforeRestartDispatch=null] Durable restart-interlock writer.
     * @returns {Promise<Object>} Lifecycle result plus structured proof metadata.
     */
    async applyLifecycle({serviceKey, operation = 'restart', reason = 'manual', restartTimeoutSeconds, memoryLimitBytes, isAuthorityHeld = null, isEffectStillAdmitted = null, expectedContainerId = null, onBeforeRestartDispatch = null} = {}) {
        this.assertEnabled();
        this.assertMechanismSupported();
        this.assertOperationAllowed('lifecycle-write', operation);
        this.assertNotSelfLifecycleTarget(serviceKey);

        const target = await this.resolveServiceTarget(serviceKey);

        // THE LAST POINT WE OWN. `resolveServiceTarget` is a runtime round-trip, so a caller that
        // checked authority before entering this method has yielded again since. This is the tightest
        // check available to us — after resolution, before the mutation — and it is deliberately the
        // last one rather than one of several: a fifth guard further out would narrow nothing.
        //
        // **The window is not closed here, and cannot be.** Beyond this line the effect belongs to the
        // container runtime, which has no notion of our lease and therefore cannot reject a stale
        // holder's request. There is no fencing token to hand it. So the design goal changes at this
        // boundary from PREVENTING a displaced write to bounding it and making it observable —
        // callers record the authority state their post-effect writes were made under rather than
        // pretending the race was eliminated.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-authority-lost',
                message: `Authority moved while resolving '${serviceKey}'; refusing the lifecycle write. `
                    + 'A displaced holder must not mutate a plane another holder now owns.',
                details: {serviceKey, operation}
            });
        }

        if (typeof expectedContainerId === 'string' && target.containerId !== expectedContainerId) {
            throw createRuntimeAccessError({
                reason : 'runtime-target-incarnation-changed',
                message: `Container '${serviceKey}' changed from '${expectedContainerId}' to '${target.containerId}' before lifecycle write; refusing stale recovery.`,
                details: {serviceKey, operation, expectedContainerId, actualContainerId: target.containerId}
            });
        }

        // Last-owned dynamic safety predicate. It intentionally follows target resolution and the
        // incarnation check, leaving no await before the Docker mutation. For residual provider load,
        // a request admitted during controller/actuator preparation therefore vetoes the restart.
        if (typeof isEffectStillAdmitted === 'function' && isEffectStillAdmitted() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-effect-not-admitted',
                message: `Lifecycle write for '${serviceKey}' is no longer admitted by live evidence.`,
                details: {serviceKey, operation}
            });
        }

        if (operation === 'restart') {
            return this.restartTarget(target, {
                reason,
                restartTimeoutSeconds,
                isAuthorityHeld,
                isEffectStillAdmitted,
                onBeforeRestartDispatch
            });
        }

        if (operation === 'update-memory-limit') {
            return this.updateTargetMemoryLimit(target, {memoryLimitBytes, reason});
        }

        throw new TypeError(`Unsupported lifecycle-write operation '${operation}'`);
    }

    /**
     * Ensures deployment runtime access is explicitly enabled.
     * @returns {void}
     */
    assertEnabled() {
        if (!this.configValues.enabled) {
            throw createRuntimeAccessError({
                reason : 'runtime-access-disabled',
                message: 'Deployment runtime access is disabled',
                details: this.createEffectiveConfigSummary()
            });
        }
    }

    /**
     * Ensures the configured runtime mechanism is supported by this holder.
     * @returns {void}
     */
    assertMechanismSupported() {
        if (!DEPLOYMENT_RUNTIME_MECHANISMS.includes(this.mechanism)) {
            throw createRuntimeAccessError({
                reason : 'runtime-mechanism-unsupported',
                message: `Unsupported deployment runtime mechanism '${this.mechanism}'`,
                details: this.createEffectiveConfigSummary()
            });
        }

        if (this.mechanism === 'sidecar') {
            throw createRuntimeAccessError({
                reason : 'runtime-sidecar-unimplemented',
                message: 'Deployment runtime sidecar mechanism is documented fallback only; docker-socket is the MVP implementation',
                details: this.createEffectiveConfigSummary()
            });
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
            throw createRuntimeAccessError({
                reason : 'runtime-operation-not-allowlisted',
                message: `Deployment runtime ${envelope} operation '${operation}' is not allowlisted`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    envelope,
                    operation
                }
            });
        }
    }

    /**
     * @summary Resolves an allowlisted Compose service key inside the configured deployment project.
     *
     * @param {String} serviceKey Allowlisted compose service key.
     * @returns {Promise<Object>} Resolved target.
     */
    async resolveServiceTarget(serviceKey) {
        this.assertServiceKeyAllowed(serviceKey);

        const composeProject = this.resolveComposeProject(),
              filters        = {
                  label: [
                      `com.docker.compose.service=${serviceKey}`,
                      `com.docker.compose.project=${composeProject}`
                  ]
              };

        let response,
            containers;

        try {
            response = await this.dockerRequest({
                method: 'GET',
                path  : `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify(filters))}`
            });
        } catch (error) {
            throw this.createDockerListError({serviceKey, filters, error});
        }

        try {
            containers = this.parseJson(response.body, 'container list');
        } catch (error) {
            throw createRuntimeAccessError({
                reason : 'docker-container-list-invalid-json',
                message: error.message,
                details: this.createLookupDetails({serviceKey, filters})
            });
        }

        if (!Array.isArray(containers)) {
            throw createRuntimeAccessError({
                reason : 'docker-container-list-invalid-shape',
                message: 'Docker API container list response is not an array',
                details: this.createLookupDetails({serviceKey, filters})
            });
        }

        if (containers.length === 0) {
            throw createRuntimeAccessError({
                reason : 'compose-service-no-match',
                message: `No Docker container found for compose service '${serviceKey}'`,
                details: this.createLookupDetails({serviceKey, filters, matchCount: 0})
            });
        }

        if (containers.length > 1) {
            throw createRuntimeAccessError({
                reason : 'compose-service-ambiguous',
                message: `Compose service '${serviceKey}' resolved to ${containers.length} containers inside the configured Compose project`,
                details: this.createLookupDetails({serviceKey, filters, matchCount: containers.length})
            });
        }

        const [container] = containers;

        this.assertTargetIdentity({container, serviceKey, composeProject, filters});

        return {
            serviceKey,
            containerId: container.Id,
            names      : container.Names || [],
            image      : container.Image || null,
            state      : container.State || null,
            status     : container.Status || null,
            composeProject,
            labels     : {
                composeService: serviceKey,
                composeProject
            }
        };
    }

    /**
     * @summary Resolves the mandatory Compose project identity before any Docker lookup.
     *
     * @returns {String} Configured Compose project identity.
     */
    resolveComposeProject() {
        const composeProject = this.configValues.composeProject;

        if (typeof composeProject !== 'string' || composeProject.trim().length === 0) {
            throw createRuntimeAccessError({
                reason : 'compose-project-unavailable',
                message: 'Deployment runtime access requires an explicit Compose project identity',
                details: this.createEffectiveConfigSummary()
            });
        }

        return composeProject.trim();
    }

    /**
     * @summary Verifies that Docker returned the exact project-and-service identity requested.
     *
     * Missing or malformed label maps fail through the existing bounded mismatch reasons. Diagnostic
     * details describe only the expected lookup contract and never echo label values returned by Docker.
     *
     * @param {Object} options
     * @param {Object} options.container Docker container-list item.
     * @param {String} options.serviceKey Expected Compose service key.
     * @param {String} options.composeProject Expected Compose project identity.
     * @param {Object} options.filters Docker label filter descriptor.
     * @returns {void}
     */
    assertTargetIdentity({container, serviceKey, composeProject, filters}) {
        const labels = container?.Labels && typeof container.Labels === 'object'
            ? container.Labels
            : {};

        if (labels['com.docker.compose.project'] !== composeProject) {
            throw createRuntimeAccessError({
                reason : 'compose-project-mismatch',
                message: 'Docker target did not prove the configured Compose project identity',
                details: this.createLookupDetails({serviceKey, filters, matchCount: 1})
            });
        }

        if (labels['com.docker.compose.service'] !== serviceKey) {
            throw createRuntimeAccessError({
                reason : 'compose-service-mismatch',
                message: 'Docker target did not prove the requested Compose service identity',
                details: this.createLookupDetails({serviceKey, filters, matchCount: 1})
            });
        }
    }

    /**
     * Refuses a lifecycle operation aimed at the orchestrator itself.
     *
     * The allowlist is one list for both envelopes — `readObserve` and `applyLifecycle` both resolve
     * through `resolveServiceTarget` — so allowlisting the orchestrator for reads necessarily
     * allowlists it for restart as well. This is the asymmetry that makes "readable but not
     * restartable" expressible without a second config surface to keep in sync.
     *
     * Deliberately NOT configurable. Restarting the orchestrator through the bridge the orchestrator
     * publishes kills the process serving the request mid-flight: the caller gets a dropped connection
     * rather than an outcome, and the audit record dies with the writer. A knob here would only offer
     * a way to be wrong.
     *
     * @param {String} serviceKey Compose service key.
     * @returns {void}
     * @throws When `serviceKey` names this orchestrator.
     */
    assertNotSelfLifecycleTarget(serviceKey) {
        if (serviceKey === DEPLOYMENT_RUNTIME_SELF_SERVICE_KEY) {
            throw createRuntimeAccessError({
                reason : 'runtime-self-lifecycle-refused',
                message: `Deployment runtime lifecycle operations cannot target '${serviceKey}' — it publishes `
                    + 'this bridge, so restarting it through the bridge would kill the process serving the '
                    + 'request before any outcome could be reported. Read operations on it ARE permitted; '
                    + 'restart it from the host.',
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey
                }
            });
        }
    }

    /**
     * Ensures the caller cannot address arbitrary services.
     * @param {String} serviceKey Compose service key.
     * @returns {void}
     */
    assertServiceKeyAllowed(serviceKey) {
        if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
            throw createRuntimeAccessError({
                Type   : TypeError,
                reason : 'runtime-service-key-required',
                message: 'Deployment runtime serviceKey is required',
                details: this.createEffectiveConfigSummary()
            });
        }

        if (!/^[a-zA-Z0-9_.-]+$/.test(serviceKey)) {
            throw createRuntimeAccessError({
                Type   : TypeError,
                reason : 'runtime-service-key-invalid',
                message: `Deployment runtime serviceKey '${serviceKey}' contains unsupported characters`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey
                }
            });
        }

        const allowedServices = this.configValues.allowedServices;

        if (!Array.isArray(allowedServices) || !allowedServices.includes(serviceKey)) {
            throw createRuntimeAccessError({
                reason : 'runtime-service-not-allowlisted',
                message: `Deployment runtime service '${serviceKey}' is not allowlisted`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey
                }
            });
        }
    }

    /**
     * Builds a non-secret summary of runtime-access config needed to debug service resolution.
     * @returns {Object}
     */
    createEffectiveConfigSummary() {
        const config = this.configValues;

        return {
            enabled             : Boolean(config.enabled),
            mechanism           : this.mechanism,
            composeProject      : config.composeProject || null,
            allowedServices     : Array.isArray(config.allowedServices) ? [...config.allowedServices] : [],
            readOperations      : Array.isArray(config.readOperations) ? [...config.readOperations] : [],
            lifecycleOperations : Array.isArray(config.lifecycleOperations) ? [...config.lifecycleOperations] : [],
            auditMode           : config.auditMode || 'metadata',
            socketPathConfigured: Boolean(config.socketPath)
        };
    }

    /**
     * Builds bounded lookup context for compose-label resolution failures.
     * @param {Object} options
     * @param {String} options.serviceKey Compose service key.
     * @param {Object} options.filters Docker label filter descriptor.
     * @param {Number|null} [options.matchCount=null] Number of matched containers when known.
     * @returns {Object}
     */
    createLookupDetails({serviceKey, filters, matchCount = null}) {
        return {
            ...this.createEffectiveConfigSummary(),
            serviceKey,
            filters,
            matchCount,
            hints: [
                'Set NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT to the exact deployment project before enabling runtime access.',
                'Keep the deployment project name stable across startup, inspection, self-heal, and redeploy operations.',
                'Align NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES with Docker com.docker.compose.service labels.',
                'Mount /var/run/docker.sock into the orchestrator only when B1 runtime diagnostics/recovery are intended.',
                'Disable NEO_ORCHESTRATOR_RUNTIME_ACCESS_ENABLED when the deployment intentionally has no runtime handle.'
            ]
        };
    }

    /**
     * Wraps Docker container-list transport failures with stable reason metadata.
     * @param {Object} options
     * @param {String} options.serviceKey Compose service key.
     * @param {Object} options.filters Docker label filter descriptor.
     * @param {Error} options.error Underlying request error.
     * @returns {Error}
     */
    createDockerListError({serviceKey, filters, error}) {
        let reason  = 'docker-container-list-failed',
            message = error.message;

        if (DOCKER_SOCKET_FORBIDDEN_CODES.has(error.code)) {
            reason  = 'docker-socket-forbidden';
            message = 'Docker socket access is forbidden';
        } else if (DOCKER_SOCKET_UNAVAILABLE_CODES.has(error.code)) {
            reason  = 'docker-socket-unavailable';
            message = 'Docker socket is unavailable';
        }

        return createRuntimeAccessError({
            reason,
            message,
            code   : error.code || null,
            details: this.createLookupDetails({serviceKey, filters})
        });
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
    async readTargetLogs(target, {tail, since, until} = {}) {
        const
            tailCount     = tail ?? this.configValues.logTail ?? 200,
            // The interval is what makes the slice attributable. Docker's log stream spans
            // restarts, so an unbounded tail can carry a fatal line from a PREVIOUS incarnation —
            // `since` removes that poison, and `until` additionally excludes output from an
            // auto-restart that races after the inspect this interval was derived from. Both
            // bounds or none: a half-bounded slice is not the run the stopped fact names.
            // The endpoints travel at FULL precision. Docker accepts RFC3339Nano, so flooring to
            // whole seconds is a choice the transport never imposed — and it is wrong in both
            // directions: a floored `since` reaches back into the previous incarnation, and a
            // floored `until` cuts the final sub-second, which is exactly when V8 writes its fatal
            // line. Truncating the upper edge can therefore discard the evidence being sought.
            sinceStamp    = normalizeDockerTime(since),
            untilStamp    = normalizeDockerTime(until),
            bounded       = sinceStamp !== null && untilStamp !== null &&
                            Date.parse(untilStamp) >= Date.parse(sinceStamp),
            query         = [
                'stdout=1',
                'stderr=1',
                `tail=${encodeURIComponent(String(tailCount))}`,
                ...(bounded ? [
                    `since=${encodeURIComponent(sinceStamp)}`,
                    `until=${encodeURIComponent(untilStamp)}`
                ] : [])
            ].join('&'),
            response      = await this.dockerRequest({
                method: 'GET',
                path  : `/containers/${encodeURIComponent(target.containerId)}/logs?${query}`
            });

        return {
            ok   : true,
            // The APPLIED bounds are echoed, never the requested ones. A consumer may only treat a
            // slice as incarnation-bounded on the strength of this receipt — a caller-supplied
            // boolean would let the claim originate at the layer that wants it to be true.
            data : {
                // The receipt echoes exactly what was SENT, at the precision it was sent — a
                // rounded echo would let a consumer believe an endpoint it never got.
                appliedSince: bounded ? sinceStamp : null,
                appliedUntil: bounded ? untilStamp : null,
                bounded,
                // The container this slice actually came from. `readObserve` resolves a target per
                // call, so inspect and logs can land on DIFFERENT containers across a recreate;
                // without this the consumer cannot tell whether the interval was applied to the
                // container whose death it is attributing.
                containerId: target.containerId ?? null,
                logs       : response.body,
                tail       : tailCount
            },
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
     * @param {Function|null} [options.isAuthorityHeld=null] Current-authority oracle.
     * @param {Function|null} [options.isEffectStillAdmitted=null] Live effect-admission oracle.
     * @param {Function|null} [options.onBeforeRestartDispatch=null] Durable restart-interlock writer.
     * @returns {Promise<Object>}
     */
    async restartTarget(target, {
        reason,
        restartTimeoutSeconds,
        isAuthorityHeld = null,
        isEffectStillAdmitted = null,
        onBeforeRestartDispatch = null
    } = {}) {
        const timeoutSeconds  = restartTimeoutSeconds ?? this.configValues.defaultRestartTimeoutSeconds ?? 10,
              requestMarginMs = this.timeoutMs;

        if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 0) {
            throw new TypeError('Docker restart timeout must be a non-negative integer number of seconds');
        }
        if (!Number.isFinite(requestMarginMs) || requestMarginMs <= 0) {
            throw new TypeError('Docker runtime-access timeout margin must be a positive finite number of milliseconds');
        }

        const clientTimeoutMs = timeoutSeconds * 1000 + requestMarginMs;

        if (!Number.isSafeInteger(clientTimeoutMs) || clientTimeoutMs <= timeoutSeconds * 1000) {
            throw new TypeError('Docker restart client timeout must safely exceed the daemon stop budget');
        }

        const inspection  = await this.inspectTarget(target),
              inspectedId = inspection.data?.Id || target.containerId,
              baseline    = {
                  containerId: inspectedId,
                  startedAt  : normalizeDockerTime(inspection.data?.State?.StartedAt)
              };

        if (inspectedId !== target.containerId) {
            throw createRuntimeAccessError({
                reason : 'runtime-target-incarnation-changed',
                message: `Container '${target.serviceKey}' changed from '${target.containerId}' to '${inspectedId}' before restart dispatch.`,
                details: {serviceKey: target.serviceKey, operation: 'restart', expectedContainerId: target.containerId, actualContainerId: inspectedId}
            });
        }

        // The baseline inspect above is awaited, so the guards in `applyLifecycle` are no longer at
        // the last-owned boundary. Re-ask both immediately before the POST; no await separates these
        // checks from the mutating request.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-authority-lost',
                message: `Authority moved while preparing '${target.serviceKey}'; refusing the restart.`,
                details: {serviceKey: target.serviceKey, operation: 'restart'}
            });
        }
        if (typeof isEffectStillAdmitted === 'function' && isEffectStillAdmitted() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-effect-not-admitted',
                message: `Lifecycle write for '${target.serviceKey}' is no longer admitted by live evidence.`,
                details: {serviceKey: target.serviceKey, operation: 'restart'}
            });
        }

        if (typeof onBeforeRestartDispatch === 'function') {
            await onBeforeRestartDispatch({
                baseline,
                clientTimeoutMs,
                restartTimeoutSeconds: timeoutSeconds
            })
        }

        // The durable marker above is awaited. Re-ask both guards so neither the marker write nor its
        // filesystem latency opens a stale-holder / stale-admission window before the POST.
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-authority-lost',
                message: `Authority moved after preparing '${target.serviceKey}'; refusing the restart.`,
                details: {serviceKey: target.serviceKey, operation: 'restart'}
            });
        }
        if (typeof isEffectStillAdmitted === 'function' && isEffectStillAdmitted() !== true) {
            throw createRuntimeAccessError({
                reason : 'runtime-effect-not-admitted',
                message: `Lifecycle write for '${target.serviceKey}' is no longer admitted after preparation.`,
                details: {serviceKey: target.serviceKey, operation: 'restart'}
            });
        }

        // Docker's `t` is the daemon-side graceful-stop budget. The HTTP client remains alive for
        // that whole interval PLUS its validated ordinary request margin.
        let response;

        try {
            response = await this.dockerRequest({
                method   : 'POST',
                path     : `/containers/${encodeURIComponent(target.containerId)}/restart?t=${encodeURIComponent(String(timeoutSeconds))}`,
                timeoutMs: clientTimeoutMs
            });
        } catch (error) {
            if (error?.dockerTransportFailure === true && error.requestDispatched === true) {
                const uncertain = createRuntimeAccessError({
                    reason : 'runtime-effect-disposition-uncertain',
                    message: error.message,
                    code   : error.code || 'ETIMEDOUT',
                    details: {
                        serviceKey           : target.serviceKey,
                        operation            : 'restart',
                        baseline,
                        restartTimeoutSeconds: timeoutSeconds,
                        clientTimeoutMs
                    }
                });

                uncertain.effectDisposition         = 'uncertain';
                uncertain.restartObservationBaseline = baseline;

                throw uncertain
            }

            throw error
        }

        return {
            ok        : true,
            data      : {restarted: true, reason, restartTimeoutSeconds: timeoutSeconds},
            proof     : this.createProofMetadata({envelope: 'lifecycle-write', operation: 'restart', target, reason}),
            statusCode: response.statusCode
        };
    }

    /**
     * @summary Applies a live memory-ceiling change to a resolved target WITHOUT a restart.
     *
     * `POST /containers/{id}/update` moves the cgroup limit on the running container — verified on the
     * live plane: `RestartCount` and `StartedAt` unchanged, `memory.max` moved, and the
     * interrupted 59,754-row restore resumed through the old cap instead of dying at it. That
     * no-restart property is the entire reason this operation exists beside `restart`; a caller that
     * wants the restart semantics already has `reconfigure`.
     *
     * `MemorySwap` is pinned to the same value: swap headroom would let the store balloon past the
     * declared ceiling into thrash instead of surfacing renewed saturation to the diagnosis layer.
     *
     * The operation is policy-bounded AT this boundary, not only in the actuator above it: the
     * closed knob registry decides which services are addressable and what band their values may
     * occupy, and the live limit decides raise-only — so "one bounded resource limit" is a property
     * of the raw capability, not a description of its best-behaved caller.
     *
     * The change is EPHEMERAL by Docker's contract — the next recreate re-applies the compose value.
     * Durability belongs to the knob overlay this operation is paired with in the actuator; this
     * method deliberately owns only the live half.
     *
     * @param {Object} target Resolved target.
     * @param {Object} options
     * @param {Number} options.memoryLimitBytes New ceiling in bytes.
     * @param {String} options.reason Audit reason.
     * @returns {Promise<Object>}
     */
    async updateTargetMemoryLimit(target, {memoryLimitBytes, reason} = {}) {
        if (!Number.isFinite(memoryLimitBytes) || memoryLimitBytes <= 0) {
            throw createRuntimeAccessError({
                Type   : TypeError,
                reason : 'runtime-memory-limit-invalid',
                message: `update-memory-limit requires a positive finite memoryLimitBytes, received ${JSON.stringify(memoryLimitBytes)}`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey: target.serviceKey
                }
            });
        }

        // A bound is only real when every authority-bearing path inherits it (reviewer falsifier,
        // review 1: the raw op under flat allowlists could lower chroma, exceed the cap, or resize
        // a transient — bypassing everything the knob enforces one layer up). The boundary therefore
        // consults the SAME closed registry the actuator validates against — one band source, never
        // a second constant able to drift — and refuses before any Docker access:
        //
        // 1. Only a service some ceiling knob DECLARES is resizable at all. The registry's closed
        //    set is the sanctioned-target list; a transient or unknown service has no knob, so the
        //    op cannot address it.
        // 2. That knob must govern THIS resource. `role: 'ceiling'` says a leaf is an upper bound; it
        //    does not say of WHAT. This op widens the cgroup envelope (`HostConfig.Memory`), and a
        //    ceiling over any other resource — a process-internal V8 old-space cap, say — is a
        //    different authority that happens to share the word. Matching on the role alone would let
        //    such a leaf sanction an envelope move for a service that declares no envelope knob, so
        //    the resource is required rather than inferred. Fail-closed by construction: a leaf that
        //    omits `resource` matches nothing here instead of defaulting to envelope.
        // 3. The value must sit inside that knob's band. The cap that terminates the autonomous
        //    ratchet holds here too — a caller with L0 access cannot express what the knob forbids.
        //    A knob with no finite band therefore sanctions NOTHING: comparing a value against an
        //    absent bound is NaN-false in BOTH directions, so an unbanded knob would silently delete
        //    the cap rather than tighten it, leaving raise-only as the only surviving bound.
        const containerCeilingLeafOf = knob => knob.leaves.find(
            leaf => leaf.role === 'ceiling' && leaf.resource === 'container-memory'
        );

        const ceilingKnob = Object.values(RECOVERY_KNOBS).find(knob =>
            knob.serviceKey === target.serviceKey && containerCeilingLeafOf(knob)
        );

        if (!ceilingKnob) {
            throw createRuntimeAccessError({
                reason : 'runtime-memory-limit-unsanctioned-target',
                message: `update-memory-limit refuses '${target.serviceKey}': no container-memory ceiling knob in the closed registry declares this service`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey: target.serviceKey
                }
            });
        }

        const ceilingLeaf = containerCeilingLeafOf(ceilingKnob);

        if (!Number.isFinite(ceilingLeaf.min) || !Number.isFinite(ceilingLeaf.max)) {
            throw createRuntimeAccessError({
                reason : 'runtime-memory-limit-unbanded-knob',
                message: `update-memory-limit refuses '${target.serviceKey}': its container-memory ceiling knob declares no finite band, so it sanctions no value`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey: target.serviceKey
                }
            });
        }

        if (memoryLimitBytes < ceilingLeaf.min || memoryLimitBytes > ceilingLeaf.max) {
            throw createRuntimeAccessError({
                reason : 'runtime-memory-limit-out-of-band',
                message: `update-memory-limit refuses ${memoryLimitBytes} for '${target.serviceKey}': outside the registry band ${ceilingLeaf.min}..${ceilingLeaf.max}`,
                details: {
                    ...this.createEffectiveConfigSummary(),
                    serviceKey: target.serviceKey
                }
            });
        }

        // 3. Raise-only, bound against what the container ACTUALLY enforces — evaluated INSIDE the
        //    per-target critical section, because the check is only as strong as its freshness.
        //    Cycle-2 falsifier (@neo-gpt, run red at the previous head): two concurrent callers both
        //    inspect 8 GiB; the 16 GiB update lands; the 12 GiB call — validated against its stale
        //    read — then lands a LOWERING each call individually forbids. Docker's update endpoint
        //    has no compare-and-set, so exclusion across inspect-through-update is the honest
        //    primitive. Docker reports 0 for an unlimited ceiling, and lowering a store's limit is
        //    an OOM instruction — the corpus does not shrink to fit. Within-band lowerings are
        //    exactly the case the band alone cannot catch. Monotonic-raise plus the band cap also
        //    bounds the direct path's total travel: it ratchets to the cap and then refuses forever.
        return this.withMemoryLimitExclusion(target.serviceKey, async () => {
            const inspection     = await this.inspectTarget(target),
                  liveLimitBytes = Number(inspection.data?.HostConfig?.Memory);

            if (!Number.isFinite(liveLimitBytes) || liveLimitBytes <= 0 || memoryLimitBytes <= liveLimitBytes) {
                throw createRuntimeAccessError({
                    reason : 'runtime-memory-limit-not-a-raise',
                    message: !Number.isFinite(liveLimitBytes)
                        ? `update-memory-limit refuses '${target.serviceKey}': the live memory limit is unreadable from inspect`
                        : liveLimitBytes <= 0
                            ? `update-memory-limit refuses '${target.serviceKey}': the container reports an unlimited ceiling, which cannot be raised`
                            : `update-memory-limit refuses ${memoryLimitBytes} for '${target.serviceKey}': at or below the live limit ${liveLimitBytes}`,
                    details: {
                        ...this.createEffectiveConfigSummary(),
                        serviceKey: target.serviceKey
                    }
                });
            }

            const response = await this.dockerRequest({
                method : 'POST',
                path   : `/containers/${encodeURIComponent(target.containerId)}/update`,
                headers: {'Content-Type': 'application/json'},
                body   : JSON.stringify({Memory: memoryLimitBytes, MemorySwap: memoryLimitBytes})
            });

            return {
                ok        : true,
                data      : {updated: true, memoryLimitBytes, reason},
                proof     : this.createProofMetadata({envelope: 'lifecycle-write', operation: 'update-memory-limit', target, reason}),
                statusCode: response.statusCode
            };
        });
    }

    /**
     * @summary Serializes the memory-limit check-through-write critical section per target.
     *
     * A raise-only check evaluated against a stale read is not raise-only: without exclusion, two
     * concurrent callers can both validate against the same live limit and the later, smaller update
     * lands a lowering each call individually forbids. The queue is a per-service promise chain — a
     * predecessor's FAILURE releases its successor (its error was already thrown to its own caller),
     * and the stored tail never rejects, so one refused raise cannot poison the lane for the next.
     * The map entry is deleted when its tail drains, so the map tracks in-flight targets only.
     *
     * @param {String} serviceKey Identity-proven compose service key.
     * @param {Function} criticalSection Async section spanning the live read through the update.
     * @returns {Promise<*>}
     */
    async withMemoryLimitExclusion(serviceKey, criticalSection) {
        const previous = this.memoryLimitLocksByService.get(serviceKey) ?? Promise.resolve(),
              run      = previous.then(criticalSection, criticalSection),
              tail     = run.then(() => {}, () => {});

        this.memoryLimitLocksByService.set(serviceKey, tail);

        try {
            return await run
        } finally {
            if (this.memoryLimitLocksByService.get(serviceKey) === tail) {
                this.memoryLimitLocksByService.delete(serviceKey)
            }
        }
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
            auditLabel        : `${envelope}:${operation}`,
            auditMode         : this.configValues.auditMode || 'metadata',
            serviceKey        : target.serviceKey,
            targetIdentity    : {
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

/**
 * Creates a runtime-access error that remains compatible with callers expecting thrown Error objects.
 * @param {Object} options
 * @param {Function} [options.Type=Error] Error constructor.
 * @param {String} options.reason Stable machine reason.
 * @param {String} options.message Human-readable message.
 * @param {String|null} [options.code=null] Optional low-level error code.
 * @param {Object|null} [options.details=null] Bounded diagnostic details.
 * @returns {Error}
 */
function createRuntimeAccessError({Type = Error, reason, message, code = null, details = null}) {
    const error = new Type(message);

    error.reason  = reason;
    error.code    = code;
    error.details = details;

    return error;
}

export default Neo.setupClass(DeploymentRuntimeAccessService);

/**
 * @summary Validates a Docker timestamp and returns it UNROUNDED, or null when it cannot be trusted.
 *
 * Docker reports an unset time as the zero instant (`0001-01-01T00:00:00Z`), which parses to a
 * valid but meaningless epoch — so a naive parse would hand the log query a bound that looks real.
 * Anything non-positive is therefore refused rather than passed through, which is what keeps the
 * interval fail-closed instead of silently unbounded.
 *
 * The value is validated but NOT rounded: Docker accepts RFC3339Nano, and truncating the upper
 * endpoint would cut the final sub-second in which a fatal line is written.
 * @param {String|Number|null} value
 * @returns {String|null}
 */
function normalizeDockerTime(value) {
    if (value === null || value === undefined) return null;

    const
        stamp  = typeof value === 'number' ? new Date(value * 1000).toISOString() : String(value),
        parsed = Date.parse(stamp);

    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    return stamp
}
