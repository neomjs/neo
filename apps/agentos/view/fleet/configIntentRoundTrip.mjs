/**
 * @summary The one `configIntent` → `configureAgent` bridge round-trip, shared by every surface
 * that mounts the per-agent configuration card (the Accounts keeper-view and the AgentDetail
 * configuration tab): the registry validates + persists, and the RESPONSE — the canonical public
 * readback — is the only thing that mutates the local record. Fail-closed: without a bridge
 * nothing mutates locally, because a config that did not persist must never render as if it had.
 *
 * The card fires; an OWNER runs this round-trip. Each owner keeps its own request-generation map
 * and save-status sink, so a slow response can neither cross owners nor repaint a stale agent.
 * Supersede-correct: a newer intent always starts and bumps the generation — it is the STALE
 * RESPONSE that drops, never the operator's latest choice. The click-while-pending UI latch
 * belongs to the card.
 *
 * Event envelopes never cross the wire: the intent is re-curated field-by-field so transport
 * metadata (`source`, …) cannot reach the Brain allowlist.
 */

/**
 * @summary Run one configuration round-trip and render its truth through the caller's sink.
 * @param {Object}        config
 * @param {Function|null} [config.bridgeResolver]     Injected bridge resolver (defaults to the global seam) — the DI discipline shared with `addAgentFlow`.
 * @param {Map}           config.generations          Caller-owned per-agent request-generation map (stale responses drop silently).
 * @param {Function}      config.getRecord            `agentId => record` — the caller resolves its own store; the accepted readback lands via `record.set()`.
 * @param {Object}        config.intent               The card's `configIntent` payload: `{id, harnessType?, mcpServers?}` (+ event envelope noise, stripped here).
 * @param {Function|null} [config.onAcceptedReadback] Optional caller hook fired before the record write (e.g. Accounts bumps its boot-list load generation).
 * @param {Function}      config.setSaveStatus        `(agentId, state, reason)` — the caller's ephemeral status sink; states: `pending|accepted|rejected`.
 * @returns {Promise<void>}
 */
export async function runConfigIntentRoundTrip({
    bridgeResolver = null,
    generations,
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

    // supersede-correct by design: a NEWER intent always starts (and bumps the generation); it is
    // the STALE RESPONSE that drops. The click-while-pending UI latch is the card's job, not this
    // function's — an owner-level latch here would silently discard the operator's latest choice.
    const requestGeneration = (generations.get(agentId) || 0) + 1;
    generations.set(agentId, requestGeneration);

    setSaveStatus(agentId, 'pending', 'Saving configuration…');

    if (typeof bridge?.configureAgent !== 'function') {
        setSaveStatus(agentId, 'rejected', 'Configuration is unavailable in dev-server mode. Nothing was changed.');
        return
    }

    try {
        const outcome = await bridge.configureAgent(wireIntent);

        if (generations.get(agentId) !== requestGeneration) {
            return
        }

        if (outcome?.status === 'accepted' && outcome.agent?.id === agentId) {
            const record = getRecord(agentId);

            if (!record) {
                setSaveStatus(agentId, 'rejected', 'Configuration response was invalid. Nothing was changed.');
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
        if (generations.get(agentId) !== requestGeneration) {
            return
        }

        // sanitized: a transport error's message is not a surface we let reach the DOM
        setSaveStatus(agentId, 'rejected', 'Could not save the configuration. Nothing was changed.')
    }
}

export default runConfigIntentRoundTrip;
