import crypto       from 'crypto';
import GraphService from '../GraphService.mjs';

/**
 * @module ai/services/memory-core/helpers/nlActionTelemetryStore
 * @summary Container-plane admission for Neural Link action telemetry — the OPTIONAL, WRITE-ONLY half of
 * the NL relocation, and deliberately the poorer relation of the transaction archive.
 *
 * **Write-only is the contract, not an oversight.** There is no read operation here on purpose. The
 * archive needs a read because replay is a host-initiated round trip; telemetry does not, because its only
 * production consumers read it through the container-owned graph already (`GapInferenceEngine`'s
 * `inferNlActionDigest`) or from a disposable local aggregate (`genesisProbe`). Adding a remote
 * telemetry-read operation would contradict the direction invariant this relocation establishes, so its
 * absence is an asserted property rather than a gap someone should helpfully close.
 *
 * **The admitted record set is decided, not inherited.** The host's table persisted nine columns; a census
 * of every production READ found that `result`, `agent_id` and `reward` have no reader at all. Porting them
 * because they exist would relocate dead data and, worse, relocate an identity: the host's `sequenceId` was
 * `${agentId}_${turnId}`, so the correlation key WAS the agent's identity. This module admits a FRESH
 * opaque token instead — correlation without identification — and the storage row id is generated here
 * rather than accepted from the caller, so a host cannot address or overwrite another seat's row.
 *
 * **`targets` is a bounded projection, never raw args.** `GapInferenceEngine` consumes only target-bearing
 * fragments, so that is all that crosses: class names and component ids. Raw arguments could carry app
 * state, user content, or a `thought` — none of which telemetry needs and none of which should become
 * durable because a tool call happened to include it.
 */

/**
 * Graph node label for one admitted Neural Link action-telemetry row.
 * @type {String}
 */
export const NL_ACTION_TELEMETRY_NODE_TYPE = 'nl-action-telemetry';

/**
 * The exact fields an admitted row may carry. Anything outside this set is DROPPED rather than stored,
 * and the drop is asserted by spec — omission-by-forgetting and omission-by-contract look identical in a
 * passing test, so the contract has to be the thing under test.
 * @type {String[]}
 */
export const ADMITTED_ACTION_FIELDS = Object.freeze([
    'sequenceId', 'sessionId', 'timestamp', 'tool', 'success', 'durationMs', 'appName', 'targets'
]);

/**
 * @summary Projects one caller-supplied action into the admitted record, dropping everything else.
 *
 * Allowlist rather than denylist, and the difference is load-bearing: a denylist admits every field a
 * future NL version invents, so the first unexpected payload key becomes durable telemetry nobody decided
 * to keep. `targets` is re-projected rather than copied for the same reason.
 * @param {Object} action Caller-supplied action row.
 * @returns {Object} The admitted projection.
 */
export function projectAdmittedAction(action = {}) {
    const targets = action.targets || {};

    return {
        // A fresh token per admitted row: correlation without identification. Never the caller's own
        // sequence value, which on the host encoded `${agentId}_${turnId}`.
        sequenceId: crypto.randomUUID(),
        sessionId : typeof action.sessionId === 'string' ? action.sessionId : null,
        timestamp : Number.isFinite(action.timestamp) ? action.timestamp : null,
        tool      : typeof action.tool === 'string' ? action.tool : null,
        success   : action.success === true,
        durationMs: Number.isFinite(action.durationMs) ? action.durationMs : null,
        appName   : typeof action.appName === 'string' ? action.appName : null,
        targets   : {
            classNames  : Array.isArray(targets.classNames)   ? targets.classNames.filter(v => typeof v === 'string')   : [],
            componentIds: Array.isArray(targets.componentIds) ? targets.componentIds.filter(v => typeof v === 'string') : []
        }
    };
}

/**
 * @summary Admits a bounded batch of Neural Link action telemetry into the container graph.
 *
 * Host-initiated and write-only: the return value reports what was admitted, never the rows themselves.
 * Reporting the stored rows back would make this a read operation wearing a write's name, which is the
 * loophole the write-only contract exists to close.
 *
 * A row that cannot be stored is COUNTED as refused rather than aborting the batch — telemetry is
 * observability and must never take down the possession session that produced it. The count is the signal;
 * silence would let a wholly-failing admission read as a successful one.
 *
 * @param {Object} options
 * @param {Object[]} [options.actions=[]] Caller-supplied action rows.
 * @param {Number} [options.now=Date.now()] Injected clock.
 * @returns {{admitted: Number, refused: Number}}
 */
export function admitNlActions({actions = [], now = Date.now()} = {}) {
    const rows = Array.isArray(actions) ? actions : [];

    let admitted = 0,
        refused  = 0;

    for (const action of rows) {
        if (!action || typeof action !== 'object') {
            refused++;
            continue;
        }

        const projected = projectAdmittedAction(action);

        try {
            GraphService.upsertNode({
                // The storage id is generated HERE, so a caller cannot address, collide with, or overwrite
                // another seat's row by choosing its own key.
                id        : `${NL_ACTION_TELEMETRY_NODE_TYPE}:${projected.sequenceId}`,
                type      : NL_ACTION_TELEMETRY_NODE_TYPE,
                name      : projected.tool ?? NL_ACTION_TELEMETRY_NODE_TYPE,
                updatedAt : now,
                properties: projected
            });

            admitted++;
        } catch (error) {
            refused++;
        }
    }

    return {admitted, refused};
}
