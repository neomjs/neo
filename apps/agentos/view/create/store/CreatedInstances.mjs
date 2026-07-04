import CreatedInstanceModel from '../model/CreatedInstance.mjs';
import Store                from '../../../../../src/data/Store.mjs';

/**
 * @class AgentOS.view.create.store.CreatedInstances
 * @extends Neo.data.Store
 *
 * @summary The ONE authoritative registry of agent-created widget instances — every surface that
 * needs "what exists" (mutation targeting, lifecycle controls, serialization) reads THIS store
 * instead of reaching around into the component tree.
 *
 * Exposed as a **singleton**: the accept path writes on instantiate, the mutation path updates
 * snapshots, dispose flips state — one shared instance, explicit-import consumption only.
 *
 * Lifecycle methods mirror the creation pipeline's refusal vocabulary: fail-closed, never throw,
 * always `{accepted, reason, record}` so callers branch on `accepted` exactly as they do on the
 * blueprint validators. Disposed records are kept (state `disposed`), never removed — the registry
 * is history-complete for serialization; only `live` records participate in target resolution.
 *
 * Snapshot ownership: `blueprintSnapshot` is REGISTRY-OWNED — cloned on registration and on
 * mutation, never aliased to caller state; consumers treat resolved records as read-only.
 */
class CreatedInstances extends Store {
    static config = {
        /**
         * @member {String} className='AgentOS.view.create.store.CreatedInstances'
         * @protected
         */
        className: 'AgentOS.view.create.store.CreatedInstances',
        /**
         * @member {Boolean} singleton=true
         */
        singleton: true,
        /**
         * @member {String} keyProperty='instanceId'
         */
        keyProperty: 'instanceId',
        /**
         * @member {Neo.data.Model} model=CreatedInstanceModel
         * @reactive
         */
        model: CreatedInstanceModel
    }

    /**
     * Registers a freshly instantiated widget as a live record. Refuses on missing identity
     * fields or a duplicate instanceId — one record per instance is the registry's authority.
     * @param {Object} data
     * @param {String} data.instanceId
     * @param {String} data.blueprintSchema The registered schema id string (e.g. 'grid@1')
     * @param {String} data.title
     * @param {Object} data.blueprintSnapshot The full accepted blueprint
     * @param {String|null} [data.paneRef=null]
     * @returns {{accepted: Boolean, reason: String|null, record: Object|null}}
     */
    registerCreated({instanceId, blueprintSchema, title, blueprintSnapshot, paneRef=null}) {
        for (const [name, value] of [['instanceId', instanceId], ['blueprintSchema', blueprintSchema], ['title', title]]) {
            if (typeof value !== 'string' || value.trim() === '') {
                return {accepted: false, reason: `registration requires a non-empty string ${name}`, record: null}
            }
        }

        if (blueprintSnapshot == null || typeof blueprintSnapshot !== 'object' || Array.isArray(blueprintSnapshot)) {
            return {accepted: false, reason: 'registration requires the accepted blueprint as blueprintSnapshot', record: null}
        }

        if (this.get(instanceId)) {
            return {accepted: false, reason: `instanceId "${instanceId}" is already registered — one record per instance`, record: null}
        }

        const snapshot = this.cloneSnapshot(blueprintSnapshot);

        if (!snapshot.accepted) {
            return {accepted: false, reason: snapshot.reason, record: null}
        }

        const record = this.add({
            instanceId,
            blueprintSchema,
            title,
            blueprintSnapshot: snapshot.value,
            paneRef,
            createdAt        : new Date().toISOString(),
            creationIndex    : this.nextCreationIndex(),
            state            : 'live'
        })[0];

        return {accepted: true, reason: null, record}
    }

    /**
     * Applies an accepted mutation to a live record: only `title` and/or `blueprintSnapshot` may
     * change — identity, ordering and lifecycle fields are immutable here. Mutation VALIDATION is
     * the shared blueprint validator's job on the accept path; this method records its outcome.
     * @param {String} instanceId
     * @param {Object} changes
     * @param {String} [changes.title]
     * @param {Object} [changes.blueprintSnapshot]
     * @returns {{accepted: Boolean, reason: String|null, record: Object|null}}
     */
    markMutated(instanceId, changes) {
        const record = this.get(instanceId);

        if (!record) {
            return {accepted: false, reason: `no record for instanceId "${instanceId}"`, record: null}
        }

        if (record.state !== 'live') {
            return {accepted: false, reason: `instanceId "${instanceId}" is disposed — disposed instances never mutate`, record: null}
        }

        if (changes == null || typeof changes !== 'object' || Array.isArray(changes)) {
            return {accepted: false, reason: 'mutation changes must be a plain object', record: null}
        }

        const unknownKeys = Object.keys(changes).filter(key => !['title', 'blueprintSnapshot'].includes(key));

        if (unknownKeys.length > 0) {
            return {accepted: false, reason: `only title/blueprintSnapshot may change — unexpected: ${unknownKeys.join(', ')}`, record: null}
        }

        let snapshot = null;

        if ('blueprintSnapshot' in changes) {
            snapshot = this.cloneSnapshot(changes.blueprintSnapshot);

            if (!snapshot.accepted) {
                return {accepted: false, reason: snapshot.reason, record: null}
            }
        }

        record.set({
            ...('title' in changes ? {title: changes.title} : {}),
            ...(snapshot ? {blueprintSnapshot: snapshot.value} : {})
        });

        return {accepted: true, reason: null, record}
    }

    /**
     * Flips a live record to `disposed`. The record is kept — the registry stays history-complete;
     * resolution simply stops seeing it. Double-dispose is refused so callers learn true state.
     * @param {String} instanceId
     * @returns {{accepted: Boolean, reason: String|null, record: Object|null}}
     */
    markDisposed(instanceId) {
        const record = this.get(instanceId);

        if (!record) {
            return {accepted: false, reason: `no record for instanceId "${instanceId}"`, record: null}
        }

        if (record.state !== 'live') {
            return {accepted: false, reason: `instanceId "${instanceId}" is already disposed`, record: null}
        }

        record.set({state: 'disposed'});

        return {accepted: true, reason: null, record}
    }

    /**
     * Snapshot ownership enforcement: the registry stores a structured clone, never a caller
     * reference — a caller mutating their original after the call can never rewrite recorded
     * history. Content a structured clone rejects (functions, DOM nodes — the executable-surface
     * class) becomes a bounded refusal, so such values cannot even be STORED here.
     * @param {Object} blueprintSnapshot
     * @returns {{accepted: Boolean, reason: String|null, value: Object|null}}
     */
    cloneSnapshot(blueprintSnapshot) {
        try {
            return {accepted: true, reason: null, value: structuredClone(blueprintSnapshot)}
        } catch (error) {
            return {accepted: false, reason: `blueprintSnapshot is not snapshot-safe data: ${error.message}`, value: null}
        }
    }

    /**
     * Next monotonic creation index, derived from the current maximum so it survives store
     * clears and needs no hidden counter state.
     * @returns {Number}
     */
    nextCreationIndex() {
        let max = 0;

        this.items.forEach(record => {
            if (record.creationIndex > max) {
                max = record.creationIndex
            }
        });

        return max + 1
    }

    /**
     * Resolves a follow-up target ("make THE GRID bigger"):
     * - `instanceId` wins and returns the record in ANY state (callers see `disposed` honestly);
     * - `title` returns the latest LIVE record with that exact title;
     * - no selector returns the latest LIVE record overall.
     * @param {Object} [selector={}]
     * @param {String} [selector.instanceId]
     * @param {String} [selector.title]
     * @returns {Object|null} the resolved record, or null
     */
    resolveTarget({instanceId, title}={}) {
        if (instanceId) {
            return this.get(instanceId) || null
        }

        let candidate = null;

        this.items.forEach(record => {
            if (record.state === 'live'
                && (title === undefined || record.title === title)
                && (!candidate || record.creationIndex > candidate.creationIndex)
            ) {
                candidate = record
            }
        });

        return candidate
    }
}

export default Neo.setupClass(CreatedInstances);
