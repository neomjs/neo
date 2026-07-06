/**
 * @summary C2 adapter for Fleet cockpit lifecycle intents: consume a per-card
 * `lifecycleIntent`, call the existing registry bridge lifecycle verb, and write the honest
 * round-trip state back to the card's `state.Provider`.
 *
 * The B4 control surface owns intent emission + rendering. This helper owns the transport-adapter
 * half only: no Node-side imports, no bespoke bridge path, and no optimistic success state. The
 * provider contract is the two-field seam consumed by the B4 control renderer:
 * `pendingAction:String|null` and `controlReason:{action,kind,reason}|null`.
 * @module apps/agentos/view/fleet/fleetLifecycleIntentAdapter
 */

export const DEFAULT_LIFECYCLE_TIMEOUT_MS = 30_000;

export const LIFECYCLE_ACTION_METHODS = Object.freeze({
    restart: 'restartAgent',
    start  : 'startAgent',
    stop   : 'stopAgent'
});

const SECRET_PATTERNS = [
    /\b(?:github_pat|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]+/gi,
    /\b(PAT|token|credential|secret)\b\s*[:=]?\s*[^\s,;]+/gi
];

/**
 * @summary Resolve the injected pane-facing Fleet registry bridge.
 * @returns {Object|null}
 */
export function getFleetRegistryBridge() {
    return globalThis.AgentOS?.fleet?.registryBridge || null
}

/**
 * @summary Redact secret-shaped material before a bridge error becomes UI/provider state.
 * @param {*} value
 * @param {String} fallback
 * @returns {String}
 */
export function sanitizeControlReason(value, fallback='Lifecycle request failed') {
    let reason = String(value || '').trim() || fallback;

    SECRET_PATTERNS.forEach(pattern => {
        reason = reason.replace(pattern, '[redacted]')
    });

    return reason
}

/**
 * @summary Build the terminal non-success provider payload.
 * @param {String} action
 * @param {'rejected'|'unauthorized'|'timeout'} kind
 * @param {*} reason
 * @returns {{action:String, kind:String, reason:String}}
 */
export function createControlReason(action, kind, reason) {
    return {
        action,
        kind,
        reason: sanitizeControlReason(reason, `${action || 'lifecycle'} request ${kind}`)
    }
}

/**
 * @summary Write one or more lifecycle-control fields onto a StateProvider-like object.
 * @param {Object} stateProvider A Neo.state.Provider or a test double exposing `setData()` / `data`.
 * @param {Object} values
 */
export function writeLifecycleControlState(stateProvider, values) {
    if (typeof stateProvider?.setData === 'function') {
        stateProvider.setData(values);
        return
    }

    if (stateProvider?.data && typeof stateProvider.data === 'object') {
        Object.assign(stateProvider.data, values);
        return
    }

    throw new Error('fleet lifecycle intent adapter requires a card stateProvider')
}

/**
 * @summary Create the adapter-local timeout sentinel error.
 * @param {String} action
 * @param {Number} timeoutMs
 * @returns {Error}
 */
function createTimeoutError(action, timeoutMs) {
    const error = new Error(`${action} timed out after ${timeoutMs}ms`);
    error.isFleetLifecycleTimeout = true;
    return error
}

/**
 * @summary Race a bridge operation against the lifecycle honesty timeout.
 * @param {Promise} promise
 * @param {String} action
 * @param {Object} options
 * @returns {Promise}
 */
function withTimeout(promise, action, {
    clearTimeoutFn = clearTimeout,
    setTimeoutFn   = setTimeout,
    timeoutMs      = DEFAULT_LIFECYCLE_TIMEOUT_MS
} = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
        return promise
    }

    let timeoutId;

    const timeout = new Promise((resolve, reject) => {
        timeoutId = setTimeoutFn(() => reject(createTimeoutError(action, timeoutMs)), timeoutMs)
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeoutFn(timeoutId))
}

/**
 * @summary Consume one per-card lifecycle intent and write honest provider state for B4 to render.
 * @param {Object} intent
 * @param {'start'|'stop'|'restart'} intent.action
 * @param {String} intent.agentId Durable fleet agent id.
 * @param {Object} stateProvider The target card's `state.Provider`.
 * @param {Object} [options]
 * @param {Object|null} [options.bridge=getFleetRegistryBridge()] Test seam or injected registry bridge.
 * @param {Number} [options.timeoutMs=30000] Timeout for settle-or-reject honesty.
 * @returns {Promise<Object>} Result metadata for controller/tests.
 */
export async function handleFleetLifecycleIntent(intent={}, stateProvider, options={}) {
    options ||= {};

    const
        {action, agentId} = intent,
        method            = LIFECYCLE_ACTION_METHODS[action],
        bridge            = Object.hasOwn(options, 'bridge') ? options.bridge : getFleetRegistryBridge();

    if (!method) {
        const controlReason = createControlReason(action, 'rejected', `Unsupported lifecycle action '${action}'`);

        writeLifecycleControlState(stateProvider, {pendingAction: null, controlReason});

        return {accepted: false, action, method: null, ok: false, status: 'rejected', controlReason}
    }

    if (!agentId) {
        const controlReason = createControlReason(action, 'rejected', 'Lifecycle intent is missing agentId');

        writeLifecycleControlState(stateProvider, {pendingAction: null, controlReason});

        return {accepted: false, action, method, ok: false, status: 'rejected', controlReason}
    }

    if (typeof bridge?.[method] !== 'function') {
        const controlReason = createControlReason(action, 'unauthorized', 'Fleet Registry bridge unavailable');

        writeLifecycleControlState(stateProvider, {pendingAction: null, controlReason});

        return {accepted: false, action, method, ok: false, status: 'unauthorized', controlReason}
    }

    writeLifecycleControlState(stateProvider, {
        controlReason: null,
        pendingAction: action
    });

    try {
        const result = await withTimeout(
            Promise.resolve().then(() => bridge[method](agentId)),
            action,
            options
        );

        writeLifecycleControlState(stateProvider, {
            controlReason: null,
            pendingAction: null
        });

        return {accepted: true, action, method, ok: true, status: 'settled', result}
    } catch (error) {
        const
            kind          = error?.isFleetLifecycleTimeout ? 'timeout' : 'rejected',
            controlReason = createControlReason(action, kind, error?.message);

        writeLifecycleControlState(stateProvider, {pendingAction: null, controlReason});

        return {accepted: true, action, method, ok: false, status: kind, controlReason}
    }
}
