import Base from '../../../src/core/Base.mjs';

/**
 * @summary The one `configIntent` → `configureAgent` bridge round-trip, shared by every surface
 * that mounts the per-agent configuration card (the Accounts keeper-view and the AgentDetail
 * configuration tab): the registry validates + persists, and the RESPONSE — the canonical public
 * readback — is the only thing that mutates the local record. Fail-closed: without a bridge
 * nothing mutates locally, because a config that did not persist must never render as if it had.
 *
 * The card fires; an OWNER runs this round-trip — but the shared-state authorities live HERE,
 * never per owner, because both owners resolve the SAME provider-hosted store:
 *
 * - **Intent ordering** ({@link RECORD_GENERATIONS}, keyed by record instance): a newer intent
 *   from EITHER surface marks every older in-flight response stale. Supersede-correct: a newer
 *   intent always starts and bumps the generation — it is the STALE RESPONSE that drops, never
 *   the operator's latest choice.
 * - **Losing-surface honesty**: a response superseded by ANOTHER owner paints its own sink
 *   `superseded` — a non-terminal, non-latching state — so the losing card unlatches and can
 *   correct (a chip latched at `pending` forever is a dead surface). A response superseded by its
 *   OWN owner stays silent: the newer request owns that same sink's next paint, and stamping
 *   `superseded` over it would mislabel an in-flight save.
 * - **Write recency** ({@link STORE_WRITE_GENERATIONS}, keyed by store instance): every accepted
 *   readback bumps the store's write generation, so a slow boot-list read from ANY owner can
 *   detect that newer canonical truth landed while it was in flight and discard itself
 *   (see {@link getDefinitionsWriteGeneration}).
 *
 * Event envelopes never cross the wire: the intent is re-curated field-by-field so transport
 * metadata (`source`, …) cannot reach the Brain allowlist.
 */

/**
 * Latest issued request authority per shared definition record — `{generation, owner}`, module
 * scope, so every owner (Accounts, AgentDetail, any future mount) arbitrates against the same
 * authority. Keyed by the record INSTANCE: per-agent within a store by construction, and a
 * WeakMap so a reloaded/removed record releases its entry with the record itself. `owner` is the
 * issuing view (an opaque identity token) — it lets a stale response distinguish "my own newer
 * request owns this sink" (stay silent) from "another surface superseded me" (paint `superseded`).
 * @type {WeakMap<Object,{generation: Number, owner: Object|null}>}
 * @private
 */
const RECORD_GENERATIONS = new WeakMap();

/**
 * Accepted-readback write counter per shared definitions store — bumped on EVERY accepted
 * configure write, regardless of owner. A boot-list hydration captures it before its bridge read
 * and discards the response if it moved: a list snapshot older than an accepted readback must
 * never regress the store (the cross-owner twin of the per-record intent ordering above).
 * @type {WeakMap<Object,Number>}
 * @private
 */
const STORE_WRITE_GENERATIONS = new WeakMap();

/**
 * Static shared-state arbitration for AgentOS configuration intents.
 * @class AgentOS.util.ConfigIntentRoundTrip
 * @extends Neo.core.Base
 */
class ConfigIntentRoundTrip extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.ConfigIntentRoundTrip'
         * @protected
         */
        className: 'AgentOS.util.ConfigIntentRoundTrip'
    }

    /**
     * @summary The store's current accepted-write generation — capture before a boot-list read,
     * compare after: any movement means newer canonical truth landed while the list was in flight.
     * @param {Object|null} store The shared definitions store instance.
     * @returns {Number}
     */
    static getDefinitionsWriteGeneration(store) {
        return (store && STORE_WRITE_GENERATIONS.get(store)) || 0
    }

    /**
     * @summary Run one configuration round-trip and render its truth through the caller's sink.
     * @param {Object}        config
     * @param {Function|null} [config.bridgeResolver] Injected bridge resolver (defaults to the global seam) — the DI discipline shared with `addAgentFlow`.
     * @param {Object}        config.intent           The card's `configIntent` payload: `{id, harnessType?, mcpServers?, mcpTarget?}` (+ event envelope noise, stripped here).
     * @param {Object|null}   [config.owner]          The calling view — an opaque identity token for cross-owner supersede honesty. Omitting it degrades stale drops to silent.
     * @param {Function}      config.setSaveStatus    `(agentId, state, reason)` — the caller's ephemeral status sink; states: `pending|accepted|rejected|superseded` (`superseded` is non-terminal and must not latch).
     * @param {Neo.data.Store|null} config.store      The shared definitions store — record resolution, the arbitration keys, and the write-generation bump all derive from it.
     * @returns {Promise<void>}
     */
    static async runConfigIntentRoundTrip({
        bridgeResolver = null,
        intent = {},
        owner = null,
        setSaveStatus,
        store = null
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
        if (Object.hasOwn(intent, 'mcpTarget')) wireIntent.mcpTarget = intent.mcpTarget;

        // supersede-correct ACROSS owners: the arbitration key is the shared record instance, so a
        // newer intent from either surface outranks an older in-flight response from the other. A
        // NEWER intent always starts (and bumps the generation); it is the STALE RESPONSE that drops.
        const
            arbiter           = store?.get(agentId) ?? null,
            requestGeneration = arbiter ? ((RECORD_GENERATIONS.get(arbiter)?.generation || 0) + 1) : 0;

        arbiter && RECORD_GENERATIONS.set(arbiter, {generation: requestGeneration, owner});

        /**
         * The ONE staleness authority, consulted by EVERY outcome path (accepted, rejected, thrown)
         * before any record write or status repaint. Two ways a response goes stale: a newer intent
         * bumped MY record instance's generation — or the instance itself was REPLACED mid-flight (a
         * reload) and a newer intent already targets the replacement, which my instance's counter
         * cannot see. Returns the SUPERSEDING authority entry (so the caller can tell whose newer
         * request won), or `null` while this response is still the latest truth.
         * @returns {Object|null}
         */
        const staleAuthority = () => {
            if (!arbiter) {
                return null
            }

            const mine = RECORD_GENERATIONS.get(arbiter);

            if (mine && mine.generation !== requestGeneration) {
                return mine
            }

            const current = store?.get(agentId) ?? null;

            return (current !== arbiter && current && RECORD_GENERATIONS.get(current)) || null
        };

        /**
         * Handle a stale outcome honestly: a CROSS-owner supersession paints this caller's sink with
         * the non-terminal, non-latching `superseded` — the losing surface unlatches and can correct.
         * A SAME-owner supersession stays silent: the newer request owns this sink's next paint.
         * @param {Object} authority The superseding {@link RECORD_GENERATIONS} entry.
         */
        const dropStale = authority => {
            if (owner !== null && authority.owner !== owner) {
                setSaveStatus(agentId, 'superseded', 'Superseded by a newer change from another surface.')
            }
        };

        setSaveStatus(agentId, 'pending', 'Saving configuration…');

        if (typeof bridge?.configureAgent !== 'function') {
            setSaveStatus(agentId, 'rejected', 'Configuration is unavailable in dev-server mode. Nothing was changed.');
            return
        }

        try {
            const outcome = await bridge.configureAgent(wireIntent);

            const staleBy = staleAuthority();

            if (staleBy) {
                dropStale(staleBy);
                return
            }

            if (outcome?.status === 'accepted' && outcome.agent?.id === agentId) {
                const record = store?.get(agentId);

                if (!record) {
                    setSaveStatus(agentId, 'rejected', 'Configuration response was invalid. Nothing was changed.');
                    return
                }

                // the write-target is not my issue-time instance (it appeared or was replaced
                // mid-flight) and a newer intent already targets it → this response lost the race.
                // For a non-null arbiter staleAuthority() caught this upstream; this line is the
                // recordless-issue edge (arbiter === null, record materialized during the flight).
                if (record !== arbiter && RECORD_GENERATIONS.has(record)) {
                    return
                }

                // newer canonical truth is landing: any in-flight boot-list read is now stale,
                // regardless of which owner started it (see getDefinitionsWriteGeneration)
                STORE_WRITE_GENERATIONS.set(store, ConfigIntentRoundTrip.getDefinitionsWriteGeneration(store) + 1);

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
            const staleBy = staleAuthority();

            if (staleBy) {
                dropStale(staleBy);
                return
            }

            // sanitized: a transport error's message is not a surface we let reach the DOM
            setSaveStatus(agentId, 'rejected', 'Could not save the configuration. Nothing was changed.')
        }
    }
}

export default Neo.setupClass(ConfigIntentRoundTrip);
