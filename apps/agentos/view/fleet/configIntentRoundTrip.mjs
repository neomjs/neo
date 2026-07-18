/**
 * @summary The one `configIntent` → `configureAgent` bridge round-trip, shared by every surface
 * that mounts the per-agent configuration card (the Accounts keeper-view and the AgentDetail
 * configuration tab): the registry validates + persists, and the RESPONSE — the canonical public
 * readback — is the only thing that mutates the local record. Fail-closed: without a bridge
 * nothing mutates locally, because a config that did not persist must never render as if it had.
 *
 * The card fires; an OWNER runs this round-trip — but supersession is arbitrated HERE, per shared
 * record, never per owner. Both owners resolve the SAME provider-hosted record instance, so the
 * module-scope {@link RECORD_GENERATIONS} WeakMap keyed by that instance is the ONE ordering
 * authority: a newer intent from EITHER surface marks every older in-flight response stale.
 * Supersede-correct: a newer intent always starts and bumps the generation — it is the STALE
 * RESPONSE that drops, never the operator's latest choice. A superseded response drops silently
 * (no record write, no status repaint): the newer intent owns the terminal state, and a losing
 * owner's chip keeping its last honest `pending` beats stamping "saved" beside a record that now
 * renders someone else's newer truth. The click-while-pending UI latch belongs to the card.
 *
 * Event envelopes never cross the wire: the intent is re-curated field-by-field so transport
 * metadata (`source`, …) cannot reach the Brain allowlist.
 */

/**
 * Latest issued request generation per shared definition record — module scope, so every owner
 * (Accounts, AgentDetail, any future mount) arbitrates against the same authority. Keyed by the
 * record INSTANCE: per-agent within a store by construction, and a WeakMap so a reloaded/removed
 * record releases its entry with the record itself.
 * @type {WeakMap<Object,Number>}
 * @private
 */
const RECORD_GENERATIONS = new WeakMap();

/**
 * @summary True when a newer intent against the same shared record has outdated this response.
 * @param {Object|null} arbiter The record instance resolved at issue time (`null` = no record existed).
 * @param {Number} requestGeneration This call's issued generation.
 * @returns {Boolean}
 * @private
 */
function isSuperseded(arbiter, requestGeneration) {
    return arbiter !== null && RECORD_GENERATIONS.get(arbiter) !== requestGeneration
}

/**
 * @summary Run one configuration round-trip and render its truth through the caller's sink.
 * @param {Object}        config
 * @param {Function|null} [config.bridgeResolver]     Injected bridge resolver (defaults to the global seam) — the DI discipline shared with `addAgentFlow`.
 * @param {Function}      config.getRecord            `agentId => record` — the caller resolves its own store; the accepted readback lands via `record.set()`. The record INSTANCE is the cross-owner arbitration key.
 * @param {Object}        config.intent               The card's `configIntent` payload: `{id, harnessType?, mcpServers?}` (+ event envelope noise, stripped here).
 * @param {Function|null} [config.onAcceptedReadback] Optional caller hook fired before the record write (e.g. Accounts bumps its boot-list load generation).
 * @param {Function}      config.setSaveStatus        `(agentId, state, reason)` — the caller's ephemeral status sink; states: `pending|accepted|rejected`.
 * @returns {Promise<void>}
 */
export async function runConfigIntentRoundTrip({
    bridgeResolver = null,
    getRecord,
    intent = {},
    onAcceptedReadback = null,
    setSaveStatus
}) {
    const
        agentId    = intent.id,
        bridge     = bridgeResolver ? bridgeResolver() : globalThis.AgentOS?.fleet?.registryBridge,
        wireIntent = {id: agentId};

    if (!agentId) {
        return
    }

    if (Object.hasOwn(intent, 'harnessType')) wireIntent.harnessType = intent.harnessType;
    if (Object.hasOwn(intent, 'mcpServers'))  wireIntent.mcpServers  = intent.mcpServers;

    // supersede-correct ACROSS owners: the arbitration key is the shared record instance, so a
    // newer intent from either surface outranks an older in-flight response from the other. A
    // NEWER intent always starts (and bumps the generation); it is the STALE RESPONSE that drops.
    const
        arbiter           = getRecord(agentId) ?? null,
        requestGeneration = arbiter ? (RECORD_GENERATIONS.get(arbiter) || 0) + 1 : 0;

    arbiter && RECORD_GENERATIONS.set(arbiter, requestGeneration);

    setSaveStatus(agentId, 'pending', 'Saving configuration…');

    if (typeof bridge?.configureAgent !== 'function') {
        setSaveStatus(agentId, 'rejected', 'Configuration is unavailable in dev-server mode. Nothing was changed.');
        return
    }

    try {
        const outcome = await bridge.configureAgent(wireIntent);

        if (isSuperseded(arbiter, requestGeneration)) {
            return
        }

        if (outcome?.status === 'accepted' && outcome.agent?.id === agentId) {
            const record = getRecord(agentId);

            if (!record) {
                setSaveStatus(agentId, 'rejected', 'Configuration response was invalid. Nothing was changed.');
                return
            }

            // the record identity moved mid-flight (a reload re-seated the row) and a newer intent
            // already targets the NEW instance → this response lost the race against it
            if (record !== arbiter && RECORD_GENERATIONS.has(record)) {
                return
            }

            onAcceptedReadback?.();
            // only the RESPONSE mutates the durable Body projection
            record.set(outcome.agent);
            setSaveStatus(agentId, 'accepted', 'Configuration saved.')
        } else {
            const reason = outcome?.status === 'rejected'
                ? (outcome.reason || 'Configuration was rejected.')
                : 'Configuration response was invalid. Nothing was changed.';

            setSaveStatus(agentId, 'rejected', reason)
        }
    } catch (error) {
        if (isSuperseded(arbiter, requestGeneration)) {
            return
        }

        // sanitized: a transport error's message is not a surface we let reach the DOM
        setSaveStatus(agentId, 'rejected', 'Could not save the configuration. Nothing was changed.')
    }
}

export default runConfigIntentRoundTrip;
