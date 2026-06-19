import crypto                from 'crypto';
import Base                  from '../../../src/core/Base.mjs';
import GraphService          from './GraphService.mjs';
import aiConfig              from '../../mcp/server/memory-core/config.mjs';
import RequestContextService from '../../mcp/server/shared/services/RequestContextService.mjs';

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
     * Records a turn-presence event for the request-bound AgentIdentity.
     *
     * The caller may provide `turnId` on progress/terminal updates. When it is omitted for a
     * terminal update, the newest active turn for the bound identity is terminalized. This lets
     * completed-turn signals such as `add_memory` close the interval without inheriting
     * `add_memory` as the liveness primary.
     *
     * @param {Object} options
     * @param {'start'|'progress'|'terminal'} [options.action='start'] Event kind.
     * @param {String} [options.turnId] Stable active-turn identifier.
     * @param {'completed'|'blocked'|'aborted'|'stale'} [options.terminalState] Terminal state.
     * @param {String} [options.source] Harness/source emitting the event.
     * @param {String} [options.note] Optional bounded diagnostic note.
     * @param {String|Date|Number} [options.now=new Date()] Clock override for tests.
     * @returns {Object} Persisted turn-presence payload.
     */
    recordTurnPresence({
        action = 'start',
        turnId,
        terminalState = 'completed',
        source = 'mcp-client',
        note,
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
        if (action === 'progress' && !turnId) {
            throw new Error('turnId is required when action is progress.');
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

        const targetTurnId = turnId || (action === 'terminal' ? this._findNewestActiveTurnId(agentIdentity, nowDate) : crypto.randomUUID());
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
                  turnId: targetTurnId,
                  startedAt,
                  lastProgressAt: nowIso,
                  freshUntil: new Date(nowDate.getTime() + freshMs).toISOString(),
                  expiresAt : new Date(nowDate.getTime() + ttlMs).toISOString(),
                  terminalState: action === 'terminal' ? terminalState : null,
                  status: action === 'terminal' ? 'terminal' : 'active',
                  source,
                  note: typeof note === 'string' ? note.slice(0, aiConfig.turnPresence.noteMaxChars) : null,
                  updatedAt: nowIso,
                  userId: agentIdentity,
                  sharedEntity: false
              };

        GraphService.upsertNode({
            id         : nodeId,
            type       : 'AGENT_TURN_PRESENCE',
            name       : `TurnPresence ${agentIdentity}`,
            description: 'Bounded active-turn liveness interval emitted by a trusted harness hook.',
            properties
        });

        return {
            ...properties,
            status: 'recorded',
            action,
            id: nodeId
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
