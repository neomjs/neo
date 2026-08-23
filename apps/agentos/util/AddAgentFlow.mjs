import Base from '../../../src/core/Base.mjs';

/**
 * @summary The add-agent flow logic — the pure, mount-independent half of the S5 define-agent
 * surface: payload validation, the fail-closed bridge round-trip, and the canonical
 * readback guard, expressed as one typed outcome vocabulary.
 *
 * The flow's honest-lifecycle contract (design SSOT Lane D1): a submission is only ever in one of
 * the states below, the **readback is the sole success truth** — the roster renders from
 * the Brain's canonical response, never from an optimistic insert — and an absent bridge is a
 * first-class `gated` outcome — disabled-with-reason at the surface, never a fake success and
 * never browser-side persistence.
 *
 * Credential boundary (the fleet credential matrix): a direct-browser bridge receives the PAT in
 * the submit payload, while a shell-owned credential ingress receives only the public definition
 * intent and resolves its credential outside the App Worker. A direct PAT is referenced after the
 * submit ONLY to reject an accidental echo in the readback. It is never stored, logged, or included
 * in any outcome object — outcomes carry public definition fields and operator-facing reasons
 * exclusively.
 *
 * @see apps/agentos/view/fleet/instances/AddAgentForm.mjs — the rendering consumer
 * @see apps/agentos/view/accounts/Panel.mjs — the keeper-view ancestor this logic is lifted from
 */

/**
 * The flow's complete state vocabulary. `idle → validating → submitting` are surface-driven;
 * `readback-confirmed | gated | rejected` are the three terminal outcomes a submission resolves to.
 * @member {String[]} ADD_AGENT_STATES
 */
const ADD_AGENT_STATES = ['idle', 'validating', 'submitting', 'readback-confirmed', 'gated', 'rejected'];

/**
 * Top-level keys whose presence in a readback marks it as leaking secret material — the Brain's
 * canonical public definition is credential-free by contract (AgentDefinition's shape).
 * @member {String[]} SECRET_KEYS
 */
const SECRET_KEYS = ['authorization', 'credential', 'password', 'pat', 'token'];

/**
 * Static validation and bridge-round-trip utilities for defining an AgentOS resident.
 * @class AgentOS.util.AddAgentFlow
 * @extends Neo.core.Base
 */
class AddAgentFlow extends Base {
    static ADD_AGENT_STATES = ADD_AGENT_STATES

    static config = {
        /**
         * @member {String} className='AgentOS.util.AddAgentFlow'
         * @protected
         */
        className: 'AgentOS.util.AddAgentFlow'
    }

    /**
     * @summary Validate the define-agent payload before any bridge contact. Pure + synchronous: the
     * surface renders `validating` around this call and never submits an incomplete definition.
     * @param {Object} payload
     * @param {String} [payload.credential]   The PAT in direct-browser mode (write-only — validated for
     *     presence, never inspected further).
     * @param {String} payload.githubUsername
     * @param {String} payload.harnessType
     * @param {Object}  [options]
     * @param {Boolean} [options.credentialRequired=true] Whether this ingress owns credential entry.
     * @returns {{valid: Boolean, reason: String}} Operator-facing reason when invalid.
     */
    static validateDefinePayload(
        {credential, githubUsername, harnessType}={},
        {credentialRequired=true}={}
    ) {
        if (!githubUsername?.trim() || !harnessType || (credentialRequired && !credential)) {
            return {
                valid : false,
                reason: credentialRequired
                    ? 'GitHub username, harness type, and PAT are required.'
                    : 'GitHub username and harness type are required.'
            }
        }

        return {valid: true, reason: ''}
    }

    /**
     * @summary The canonical-readback guard: a definition is only trustworthy when it carries the
     * required public identity fields, serializes cleanly, exposes no top-level secret key, and does
     * not echo the submitted credential anywhere in its serialized form. Anything else fails closed.
     * @param {Object} definition          The bridge response claiming to be a public agent definition.
     * @param {String} submittedCredential Ephemeral — used solely for the echo check.
     * @returns {{valid: Boolean, reason: String}}
     */
    static validateReadback(definition, submittedCredential) {
        let serialized;

        try {
            serialized = JSON.stringify(definition)
        } catch {/* circular / non-serializable → invalid */}

        const
            hasIdentity = Boolean(definition?.id && definition.githubUsername && definition.harnessType),
            hasSecret   = Boolean(definition) && SECRET_KEYS.some(key => Object.hasOwn(definition, key)),
            echoes      = Boolean(submittedCredential && serialized?.includes(submittedCredential));

        if (!hasIdentity || !serialized || hasSecret || echoes) {
            return {valid: false, reason: 'Fleet Registry returned an invalid public agent definition. Nothing was changed.'}
        }

        return {valid: true, reason: ''}
    }

    /**
     * @summary Resolve the Fleet Registry bridge from its injected seam. The Body never constructs a
     * bridge — an Agent OS shell injects one; its absence is the `gated` state, not an error.
     * @param {Function|null} [resolver] Optional injected resolver (the DI seam for owners and tests).
     * @returns {Object|null} The bridge, or null when none is injected.
     */
    static resolveRegistryBridge(resolver=null) {
        if (resolver) {
            return resolver() ?? null
        }

        return globalThis.AgentOS?.fleet?.registryBridge ?? null
    }

    /**
     * @summary Whether credential entry belongs to the native shell rather than the App Worker.
     * The explicit bridge marker is the authority; an absent/unknown marker preserves the existing
     * direct-browser contract.
     * @param {Object|null} bridge
     * @returns {Boolean}
     */
    static isShellCredentialIngress(bridge) {
        return bridge?.credentialIngress === 'shell'
    }

    /**
     * @summary Project a form payload onto the exact define-agent request allowed across the bridge.
     * Shell mode carries public intent only; direct-browser mode preserves the credential-bearing
     * request. Explicit projection prevents unrelated form or caller fields from crossing either mode.
     * @param {Object}      payload
     * @param {Object|null} bridge
     * @returns {Object}
     */
    static createDefineAgentIntent(payload={}, bridge=null) {
        const intent = {
            githubUsername: payload.githubUsername?.trim(),
            harnessType   : payload.harnessType
        };

        if (!AddAgentFlow.isShellCredentialIngress(bridge)) {
            intent.credential = payload.credential
        }

        return intent
    }

    /**
     * @summary The full submit round-trip as one typed outcome — the flow's only async step.
     *
     * Outcome shapes (state ∈ the terminal vocabulary):
     * - `{state: 'gated',              reason}`             — no bridge, or the bridge lacks `defineAgent`; fail-closed, nothing attempted.
     * - `{state: 'rejected',           reason}`             — payload invalid, controlled domain rejection, invalid readback, or transport error (reason is sanitized; never echoes credential bytes).
     * - `{state: 'readback-confirmed', definition, reason}` — the validated canonical public definition; the ONLY success shape.
     *
     * @param {Object}        config
     * @param {Function|null} [config.bridgeResolver] Injected bridge resolver (defaults to the global seam).
     * @param {Object}        config.payload          `{credential, githubUsername, harnessType}`.
     * @returns {Promise<Object>} One terminal outcome — this function never throws.
     */
    static async submitDefineAgent({bridgeResolver=null, payload}) {
        const
            bridge     = AddAgentFlow.resolveRegistryBridge(bridgeResolver),
            shellOwned = AddAgentFlow.isShellCredentialIngress(bridge),
            request    = AddAgentFlow.createDefineAgentIntent(payload, bridge),
            validation = AddAgentFlow.validateDefinePayload(request, {credentialRequired: !shellOwned});

        if (!validation.valid) {
            return {state: 'rejected', reason: validation.reason}
        }

        if (!bridge?.defineAgent) {
            return {
                state : 'gated',
                reason: 'Fleet Registry bridge unavailable — agent setup fails closed. Start the fleet server (npm run ai:fleet-server).'
            }
        }

        let outcome;

        try {
            outcome = await bridge.defineAgent(request)
        } catch (error) {
            // transport failure: the reason stays generic — an error message assembled elsewhere is
            // not a surface we allow to carry credential bytes into the DOM
            return {state: 'rejected', reason: 'Could not reach the Fleet Registry. Nothing was stored in browser state.'}
        }

        if (outcome?.status === 'rejected') {
            return {state: 'rejected', reason: outcome.reason || 'Agent definition was rejected. Nothing was changed.'}
        }

        const readback = AddAgentFlow.validateReadback(outcome, request.credential);

        if (!readback.valid) {
            return {state: 'rejected', reason: readback.reason}
        }

        return {state: 'readback-confirmed', definition: outcome, reason: ''}
    }
}

export default Neo.setupClass(AddAgentFlow);
