import crypto                                   from 'crypto';
import Base                                     from '../../../src/core/Base.mjs';
import GraphService                             from './GraphService.mjs';
import aiConfig                                 from '../../mcp/server/memory-core/config.mjs';
import RequestContextService, {normalizeUserId} from '../../mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary Graph-backed active-turn presence writer for agent liveness beacons.
 *
 * `HARNESS_PRESENCE` is a wake-routing overlay: it says whether a receiver route appears
 * addressable. This service records a separate `AGENT_TURN_PRESENCE` interval: a trusted harness
 * turn began, may refresh progress, and eventually expires or terminalizes. These turn-presence
 * records are NOT the `who_is_online` liveness signal — `who_is_online` derives liveness from
 * `add_memory` recency (roster-scoped); turn-presence is a separate active-turn substrate.
 *
 * @class Neo.ai.services.memory-core.TurnPresenceService
 * @extends Neo.core.Base
 * @singleton
 */
class TurnPresenceService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.TurnPresenceService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.TurnPresenceService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String[]} validActions
     * @protected
     */
    validActions = ['start', 'progress', 'terminal']

    /**
     * @member {String[]} validTerminalStates
     * @protected
     */
    validTerminalStates = ['completed', 'blocked', 'aborted', 'stale']

    /**
     * Shape of a wake-submit correlation id. Matched here rather than trusted because this value is now
     * supplied by a client over the tool surface, and the daemon that consumes it matches on equality —
     * a nonce that is merely *stored* but never matchable is indistinguishable from an absent one.
     * @member {RegExp} wakeSubmitNoncePattern
     * @protected
     */
    wakeSubmitNoncePattern = /^[0-9a-fA-F-]{36}$/

    /**
     * Records a turn-presence event for the request-bound AgentIdentity.
     *
     * The caller may provide `turnId` on progress/terminal updates. When it is omitted, the newest
     * active turn for the bound identity is used. This lets completed-turn signals such as
     * `add_memory` close the interval without inheriting `add_memory` as the liveness primary — and
     * it is what allows a harness hook to emit progress at all: a hook that reaches this service over
     * MCP holds no turn id of its own, and the server is the only party that can answer which turn is
     * the caller's. Requiring the id from a client that cannot know it forces the client to open the
     * store directly, which is precisely the bypass this surface exists to remove.
     *
     * A `progress` or `terminal` event with no open interval is a **no-op, not an error**: the turn it
     * would refresh has already expired or closed, and refusing the call would turn an ordinary race
     * into a failed write.
     *
     * @param {Object} options
     * @param {'start'|'progress'|'terminal'} [options.action='start'] Event kind.
     * @param {String} [options.turnId] Stable active-turn identifier. Optional throughout: `start`
     * mints one, `progress` and `terminal` resolve the newest active interval when it is omitted.
     * @param {'completed'|'blocked'|'aborted'|'stale'} [options.terminalState] Terminal state.
     * @param {String} [options.source] Harness/source emitting the event.
     * @param {String} [options.note] Optional bounded diagnostic note.
     * @param {String} [options.wakeSubmitNonce] Per-submit correlation id linking this interval back to
     * the wake submit that caused it. The wake daemon's delivery proof matches on this exact value, so a
     * malformed one is rejected rather than dropped — a silently discarded nonce degrades every
     * subsequent proof to `wake-submit-unknown`, which reads as "delivery unverifiable" rather than
     * "correlation key was malformed".
     * @param {String|Date|Number} [options.now=new Date()] Clock override for tests.
     * @returns {Object} Persisted turn-presence payload.
     */
    recordTurnPresence({
        action = 'start',
        turnId,
        terminalState = 'completed',
        source = 'mcp-client',
        note,
        wakeSubmitNonce,
        now = new Date()
    } = {}) {
        GraphService.requireDb('TurnPresenceService.recordTurnPresence');

        const agentIdentity = RequestContextService.getAgentIdentityNodeId();
        if (!agentIdentity) {
            throw new Error('Cannot record turn presence: no agent identity context bound.');
        }

        if (!this.validActions.includes(action)) {
            throw new Error(`Invalid turn presence action '${action}'. Must be one of: ${this.validActions.join(', ')}.`);
        }

        if (action === 'terminal' && !this.validTerminalStates.includes(terminalState)) {
            throw new Error(`Invalid terminalState '${terminalState}'. Must be one of: ${this.validTerminalStates.join(', ')}.`);
        }
        if (wakeSubmitNonce !== undefined && wakeSubmitNonce !== null && !this.wakeSubmitNoncePattern.test(String(wakeSubmitNonce).trim())) {
            throw new Error(`Invalid wakeSubmitNonce '${wakeSubmitNonce}'. Must be a 36-character UUID.`);
        }

        const nowDate = this._coerceDate(now),
              nowIso  = nowDate.toISOString(),
              freshMs = aiConfig.turnPresence.freshMs,
              ttlMs   = aiConfig.turnPresence.ttlMs;

        if (!Number.isFinite(freshMs) || freshMs <= 0) {
            throw new Error(`turnPresence.freshMs must be a positive finite number, got ${freshMs}`);
        }
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error(`turnPresence.ttlMs must be a positive finite number, got ${ttlMs}`);
        }

        // `start` mints an interval; everything else joins the newest open one. A null result here is the
        // no-op path below, not a failure — see the contract note on this method.
        const targetTurnId = turnId || (action === 'start'
            ? crypto.randomUUID()
            : this._findNewestActiveTurnId(agentIdentity, nowDate));
        if (!targetTurnId) {
            return {
                status: 'noop',
                reason: 'no-active-turn',
                action,
                agentIdentity
            };
        }

        const nodeId = this._buildTurnPresenceId(agentIdentity, targetTurnId),
              current = this._getTurnPresenceProperties(nodeId) || {},
              startedAt = current.startedAt || nowIso,
              properties = {
                  ...current,
                  agentIdentity,
                  turnId        : targetTurnId,
                  startedAt,
                  lastProgressAt: nowIso,
                  freshUntil    : new Date(nowDate.getTime() + freshMs).toISOString(),
                  expiresAt     : new Date(nowDate.getTime() + ttlMs).toISOString(),
                  terminalState : action === 'terminal' ? terminalState : null,
                  status        : action === 'terminal' ? 'terminal' : 'active',
                  source,
                  note          : typeof note === 'string' ? note.slice(0, aiConfig.turnPresence.noteMaxChars) : null,
                  updatedAt     : nowIso,
                  userId        : normalizeUserId(agentIdentity),   // canonical isolation key (no @-form); agentIdentity above stays the @-form label
                  sharedEntity  : false,
                  // Spread last and only when supplied, so a later progress event without a nonce keeps the
                  // one its `start` carried (via `...current`) instead of erasing the correlation mid-turn.
                  ...(wakeSubmitNonce ? {wakeSubmitNonce: String(wakeSubmitNonce).trim().toLowerCase()} : {})
              };

        GraphService.upsertNode({
            id  : nodeId,
            type: 'AGENT_TURN_PRESENCE',
            name       : `TurnPresence ${agentIdentity}`,
            description: 'Bounded active-turn liveness interval emitted by a trusted harness hook.',
            properties
        });

        const response = {
            ...properties,
            status: 'recorded',
            action,
            id    : nodeId
        };

        // `terminalState` is meaningful only on a `terminal` close. The declared output schema's enum
        // carries no null member (the MCP structured-content validator does not honor OpenAPI
        // `nullable: true`), so returning a non-terminal `terminalState: null` fails client-side
        // validation — every `start` / `progress` call would error. Omit it off the terminal path.
        if (action !== 'terminal') {
            delete response.terminalState;
        }

        return response;
    }

    /**
     * @summary Public liveness read — the newest fresh active turn-presence beacon for an agent, or null.
     *
     * The LOCAL-ONLY corroboration primitive for `who_is_online`: where a turn-presence beacon is wired,
     * a fresh one rescues a mid-turn agent whose last `add_memory` write has aged past the recency
     * window — the consolidate-then-save gate lands the memory only at the turn boundary, so a long
     * mid-turn agent can read `add_memory`-stale yet be live. Returns `null` when no beacon exists, so a
     * beaconless deployment's memory-recency verdict is never gated on a signal it cannot emit.
     *
     * The beacon HORIZONS (`freshUntil` / `expiresAt`) are vouched verbatim alongside the derived
     * boolean: `fresh` answers "is it fresh NOW" for this service's own clock, while a banded
     * consumer (the roster's `active-turn / fresh / recent / dark` vocabulary) needs the horizons
     * themselves to grade recency without minting a second clock authority. A legacy beacon row
     * written before the horizons existed vouches `null` for the absent field — never a fabricated
     * timestamp. `who_is_online`'s verbose rows carry this projection verbatim as
     * `signals.turnPresence`, so the vouching reaches the plane's wire without a projection change.
     *
     * @param {String} agentIdentity AgentIdentity node id.
     * @param {String|Date|Number} [now=new Date()] Clock source.
     * @returns {{turnId: String, startedAt: String, lastProgressAt: String, fresh: Boolean, freshUntil: String|null, expiresAt: String|null}|null}
     */
    getFreshTurnPresence(agentIdentity, now = new Date()) {
        if (!agentIdentity) return null;

        const nowDate = this._coerceDate(now),
              turnId  = this._findNewestActiveTurnId(agentIdentity, nowDate);
        if (!turnId) return null;

        const props = this._getTurnPresenceProperties(this._buildTurnPresenceId(agentIdentity, turnId));
        if (!props) return null;

        const fresh = !!props.freshUntil && this._coerceDate(props.freshUntil).getTime() > nowDate.getTime();

        return {
            turnId,
            startedAt     : props.startedAt,
            lastProgressAt: props.lastProgressAt,
            fresh,
            freshUntil    : props.freshUntil ?? null,
            expiresAt     : props.expiresAt  ?? null
        };
    }

    /**
     * @summary Builds the canonical graph node id for one agent turn interval.
     * @param {String} agentIdentity AgentIdentity node id.
     * @param {String} turnId Stable active-turn id.
     * @returns {String}
     * @protected
     */
    _buildTurnPresenceId(agentIdentity, turnId) {
        return `AGENT_TURN_PRESENCE:${agentIdentity}:${turnId}`;
    }

    /**
     * @summary Coerces supported clock inputs into a valid Date.
     * @param {String|Date|Number} value Clock input.
     * @returns {Date}
     * @protected
     */
    _coerceDate(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Invalid turn presence timestamp: ${value}`);
        }
        return date;
    }

    /**
     * @summary Reads one full turn-presence properties payload from the graph.
     * @param {String} nodeId Graph node id.
     * @returns {Object|null}
     * @protected
     */
    _getTurnPresenceProperties(nodeId) {
        return GraphService.getNodeRecord({id: nodeId})?.properties || null;
    }

    /**
     * @summary Finds the newest non-expired active turn for an identity.
     * @param {String} agentIdentity AgentIdentity node id.
     * @param {Date} nowDate Clock source.
     * @returns {String|null}
     * @protected
     */
    _findNewestActiveTurnId(agentIdentity, nowDate) {
        const sqlite = GraphService.db?.storage?.db;
        if (!sqlite) return null;

        const row = sqlite.prepare(`
            SELECT data FROM Nodes
            WHERE json_extract(data, '$.label') = 'AGENT_TURN_PRESENCE'
              AND json_extract(data, '$.properties.agentIdentity') = ?
              AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
              AND (
                json_extract(data, '$.properties.expiresAt') IS NULL
                OR json_extract(data, '$.properties.expiresAt') > ?
              )
            ORDER BY json_extract(data, '$.properties.lastProgressAt') DESC
            LIMIT 1
        `).get(agentIdentity, nowDate.toISOString());

        if (!row?.data) return null;

        try {
            return JSON.parse(row.data).properties?.turnId || null;
        } catch {
            return null;
        }
    }
}

export default Neo.setupClass(TurnPresenceService);
