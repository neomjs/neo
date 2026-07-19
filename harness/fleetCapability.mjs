import {FLEET_CREDENTIAL_METHODS, FLEET_WIRE_METHODS} from '../src/ai/fleet/fleetWireMethods.mjs';

const MAX_CREDENTIAL_LENGTH = 1024;

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
 * @param {Function} options.getBrain Resolves the main-owned Brain boot receipt.
 * @param {Function} options.isTrustedSender Validates a real Electron IPC event.
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
    credentialProvider = null,
    fetchImpl = globalThis.fetch,
    getBrain,
    isTrustedSender,
    onAdmitted = null
} = {}) {
    if (typeof bearerToken !== 'string' || typeof getBrain !== 'function' ||
        typeof isTrustedSender !== 'function' || typeof fetchImpl !== 'function' ||
        !(credentialProvider === null || typeof credentialProvider === 'function') ||
        !(onAdmitted === null || typeof onAdmitted === 'function')) {
        throw new TypeError('createFleetCapability requires bearerToken, getBrain, isTrustedSender, fetchImpl, and optional credentialProvider/onAdmitted hooks')
    }

    const reject = error => ({ok: false, error});

    const send = async (request, sensitiveValues = []) => {
        let boot, envelope;

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

        let serialized;

        try {
            serialized = JSON.stringify(envelope)
        } catch {
            return reject('fleet: invalid response')
        }

        if ([bearerToken, ...sensitiveValues].some(value => value && serialized.includes(value))) {
            return reject('fleet: secret-bearing response rejected')
        }

        if (envelope?.ok !== true) {
            return reject(typeof envelope?.error === 'string' ? envelope.error.slice(0, 300) : 'fleet: request failed')
        }

        try {
            onAdmitted?.({method: request.method})
        } catch {/* receipt instrumentation never owns the product response */}

        return {ok: true, result: envelope.result}
    };

    return {
        async request(event, request) {
            if (!isTrustedSender(event)) return reject('fleet: untrusted shell sender');

            if (!isRecord(request) ||
                Object.keys(request).some(key => !['method', 'params'].includes(key)) ||
                typeof request.method !== 'string' ||
                !FLEET_WIRE_METHODS.includes(request.method)) {
                return reject('fleet: malformed or disallowed request')
            }

            if (FLEET_CREDENTIAL_METHODS.includes(request.method)) {
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

                return send({
                    method: request.method,
                    params: {...intent, credential}
                }, [credential])
            }

            return send({method: request.method, params: request.params})
        }
    }
}
