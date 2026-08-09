const MAX_CREDENTIAL_LENGTH = 1024;

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @summary Finds a sensitive string in any JSON-shaped key or value without relying on serialized
 * spelling. Direct value comparison remains correct when quotes, slashes, or control characters are
 * escaped by JSON serialization.
 * @param {*} value Candidate response subtree.
 * @param {String[]} sensitiveValues Non-empty secrets that must not cross into the renderer.
 * @param {WeakSet<Object>} [visited=new WeakSet()] Cycle guard for injected/custom transports.
 * @returns {Boolean}
 */
function containsSensitiveValue(value, sensitiveValues, visited=new WeakSet()) {
    if (typeof value === 'string') {
        return sensitiveValues.some(sensitive => value.includes(sensitive))
    }

    if (!value || typeof value !== 'object') return false;
    if (visited.has(value)) return false;

    visited.add(value);

    return Object.entries(value).some(([key, child]) =>
        sensitiveValues.some(sensitive => key.includes(sensitive)) ||
        containsSensitiveValue(child, sensitiveValues, visited)
    )
}

/**
 * @summary Projects the Body-authored Add-Peer intent onto the shell's explicit public field set.
 * Unknown fields are dropped by construction: command, args, env, executable paths, viewer claims,
 * and credential-shaped extras therefore have no route into the Brain request.
 * @param {*} intent
 * @returns {Object|null}
 */
export function projectPublicAgentIntent(intent) {
    if (!isRecord(intent)) return null;

    const
        githubUsername = typeof intent.githubUsername === 'string' ? intent.githubUsername.trim() : '',
        harnessType    = typeof intent.harnessType === 'string' ? intent.harnessType.trim() : '',
        id             = typeof intent.id === 'string' ? intent.id.trim() : '';

    if (!githubUsername || !harnessType) return null;

    return {
        ...(id ? {id} : {}),
        githubUsername,
        harnessType
    }
}

/**
 * @summary Projects a credential-bearing Fleet verb onto the public intent fields the Body may
 * author. Credential bytes are never read from this object; Electron main obtains them through its
 * injected shell-owned provider only after sender, method, and public-shape validation.
 * @param {String} method
 * @param {*} params
 * @returns {Object|null}
 */
export function projectPublicCredentialIntent(method, params) {
    if (method === 'defineAgent') {
        return projectPublicAgentIntent(params)
    }

    if (method === 'connectTenant' && isRecord(params)) {
        const tenantUrl = typeof params.tenantUrl === 'string' ? params.tenantUrl.trim() : '';

        return tenantUrl ? {tenantUrl} : null
    }

    return null
}

/**
 * @summary Creates the Electron-main owner for Fleet IPC. Sender trust and request shape are checked
 * before Brain readiness or network access; the bearer is attached only here, and every reply is
 * positively censused against both the bearer and (for Add-Peer) the submitted credential.
 * @param {Object} options
 * @param {String} options.bearerToken Main-owned per-boot Fleet bearer.
 * @param {Function} options.createWireOffer Creates the main-owned version/capability offer.
 * @param {Function} options.createWireRequest Creates the outbound versioned request.
 * @param {Function} options.createWireResponse Creates closed local refusal envelopes.
 * @param {String[]} options.credentialMethods Canonical credential-bearing Fleet methods.
 * @param {Function} options.getBrain Resolves the main-owned Brain boot receipt.
 * @param {Function} options.inspectWireResponse Validates the selected server contract.
 * @param {Function} options.isTrustedSender Validates a real Electron IPC event.
 * @param {Object} options.responseStates Canonical finite response-state vocabulary.
 * @param {String[]} options.wireMethods Canonical app↔Fleet method allowlist.
 * @param {Function|null} [options.credentialProvider=null] Main-owned async credential ingress. It
 * receives only `{event, intent, method}` after all public validation; Body-supplied secret fields
 * are projected away before invocation.
 * @param {Function} [options.fetchImpl=globalThis.fetch] Injectable transport for unit tests.
 * @param {Function|null} [options.onAdmitted=null] Non-secret post-success receipt hook. Receives
 * only `{method}` and cannot alter the response.
 * @returns {{request: Function}}
 */
export function createFleetCapability({
    bearerToken,
    createWireOffer,
    createWireRequest,
    createWireResponse,
    credentialMethods,
    credentialProvider = null,
    fetchImpl = globalThis.fetch,
    getBrain,
    inspectWireResponse,
    isTrustedSender,
    onAdmitted = null,
    responseStates,
    wireMethods
} = {}) {
    const
        validCredentialMethods = Array.isArray(credentialMethods) && credentialMethods.every(method => typeof method === 'string'),
        validWireMethods       = Array.isArray(wireMethods) && wireMethods.every(method => typeof method === 'string');

    if (typeof bearerToken !== 'string' ||
        typeof createWireOffer !== 'function' ||
        typeof createWireRequest !== 'function' ||
        typeof createWireResponse !== 'function' ||
        typeof getBrain !== 'function' ||
        typeof inspectWireResponse !== 'function' ||
        typeof isTrustedSender !== 'function' || typeof fetchImpl !== 'function' ||
        !validCredentialMethods || !validWireMethods ||
        credentialMethods.some(method => !wireMethods.includes(method)) ||
        !isRecord(responseStates) ||
        typeof responseStates.ok !== 'string' ||
        typeof responseStates.refused !== 'string' ||
        !(credentialProvider === null || typeof credentialProvider === 'function') ||
        !(onAdmitted === null || typeof onAdmitted === 'function')) {
        throw new TypeError('createFleetCapability requires the canonical wire contract, bearerToken, method allowlists, getBrain, isTrustedSender, fetchImpl, and optional credentialProvider/onAdmitted hooks')
    }

    const
        credentialMethodSet = new Set(credentialMethods),
        wireMethodSet       = new Set(wireMethods),
        reject              = error => createWireResponse(responseStates.refused, {error});

    const send = async (method, params, sensitiveValues = []) => {
        let boot, envelope, offer, request;

        try {
            offer   = createWireOffer();
            request = createWireRequest(method, params, offer)
        } catch {
            return reject('fleet: client wire contract failed')
        }

        try {
            boot = await getBrain()
        } catch {
            return reject('fleet: Brain readiness failed')
        }

        if (boot?.up !== true || !Number.isInteger(boot.fleetPort) || boot.fleetPort < 1 || boot.fleetPort > 65535) {
            return reject('fleet: Brain is not ready')
        }

        try {
            const response = await fetchImpl(`http://127.0.0.1:${boot.fleetPort}/fleet`, {
                body   : JSON.stringify(request),
                headers: {
                    Authorization : `Bearer ${bearerToken}`,
                    'content-type': 'application/json'
                },
                method: 'POST'
            });

            envelope = await response.json()
        } catch {
            return reject('fleet: request transport failed')
        }

        const protectedValues = [...new Set([bearerToken, ...sensitiveValues]
            .flatMap(value => typeof value === 'string' ? [value, value.trim()] : [])
            .filter(Boolean))];

        let containsSecret;

        try {
            JSON.stringify(envelope);
            containsSecret = containsSensitiveValue(envelope, protectedValues)
        } catch {
            return reject('fleet: invalid response')
        }

        if (containsSecret) {
            return reject('fleet: secret-bearing response rejected')
        }

        const inspection = inspectWireResponse(envelope, offer);

        if (!inspection?.ok) {
            return reject(inspection?.error || 'fleet: malformed wire response')
        }

        if (envelope.state !== responseStates.ok) {
            return envelope
        }

        try {
            onAdmitted?.({method: request.method})
        } catch {/* receipt instrumentation never owns the product response */}

        return envelope
    };

    return {
        async request(event, request) {
            if (!isTrustedSender(event)) return reject('fleet: untrusted shell sender');

            if (!isRecord(request) ||
                Object.keys(request).some(key => !['method', 'params'].includes(key)) ||
                typeof request.method !== 'string' ||
                !wireMethodSet.has(request.method)) {
                return reject('fleet: malformed or disallowed request')
            }

            if (credentialMethodSet.has(request.method)) {
                const intent = projectPublicCredentialIntent(request.method, request.params);

                if (!intent) {
                    return reject(`fleet: malformed public intent for '${request.method}'`)
                }

                if (!credentialProvider) {
                    return reject(`fleet: shell credential ingress unavailable for '${request.method}'`)
                }

                let credential;

                try {
                    credential = await credentialProvider({event, intent, method: request.method})
                } catch {
                    return reject(`fleet: shell credential ingress failed for '${request.method}'`)
                }

                if (typeof credential !== 'string' || !credential.trim() || credential.length > MAX_CREDENTIAL_LENGTH) {
                    return reject(`fleet: shell credential ingress canceled for '${request.method}'`)
                }

                return send(request.method, {...intent, credential}, [credential])
            }

            return send(request.method, request.params)
        }
    }
}
