import DependencyModel from './DependencyModel.mjs';
import Store           from '../data/Store.mjs';

/**
 * @summary Store of directed task-dependency edges (`Neo.gantt.DependencyStore`) for `Neo.gantt.Container`.
 * @description Holds {@link Neo.gantt.DependencyModel} records (`fromId` → `toId`).
 * {@link #getSuccessors} and {@link #getPredecessors} return the outgoing and incoming edges of one task.
 * @class Neo.gantt.DependencyStore
 * @extends Neo.data.Store
 * @see Neo.gantt.DependencyModel
 * @see Neo.gantt.DependencyLayer
 */
class DependencyStore extends Store {
    #indexedCount     = -1
    #indexedItems     = null
    #indexedMutations = -1
    #predecessors     = null
    #successors       = null

    static config = {
        /**
         * @member {String} className='Neo.gantt.DependencyStore'
         * @protected
         */
        className: 'Neo.gantt.DependencyStore',
        /**
         * @member {String} ntype='gantt-dependency-store'
         * @protected
         */
        ntype: 'gantt-dependency-store',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=DependencyModel
         * @reactive
         */
        model: DependencyModel
    }

    /**
     * @summary Checks a proposed finish-to-start link in a store of dependency records.
     * @param {Neo.data.Store} store Dependency store bound to the chart.
     * @param {Object} input Endpoints already resolved against the chart's task store.
     * @returns {String|null} Refusal reason, or null when the gesture may offer this link.
     */
    static getFinishToStartRefusal(store, {fromId, toId, id, type='FS', lag=0}) {
        if (store.isFiltered()) return 'filtered-dependencies';
        if (type !== 'FS' || lag !== 0) return 'unsupported-dependency';
        const from = String(fromId), to = String(toId), successors = new Map();
        if (from === to) return 'self';
        for (let index = 0; index < store.getCount(); index++) {
            const edge = store.getAt(index), source = String(edge.fromId), target = String(edge.toId);
            if (source === from && target === to && edge.type === type) return 'duplicate';
            if (!successors.has(source)) successors.set(source, []);
            successors.get(source).push(target)
        }
        const visited = new Set(), pending = [to];
        while (pending.length) {
            const key = pending.pop();
            if (key === from) return 'cycle';
            if (visited.has(key)) continue;
            visited.add(key);
            for (const next of successors.get(key) || []) pending.push(next)
        }
        return id != null && store.get(id) ? 'duplicate-id' : null
    }

    /**
     * @summary Previews the same link validation used by {@link #addFinishToStart}.
     * @param {Object} input Proposed link.
     * @returns {String|null} Refusal reason, or null if eligible.
     */
    getFinishToStartRefusal(input) {
        return this.constructor.getFinishToStartRefusal(this, input)
    }

    /**
     * @summary Creates a zero-lag finish-to-start edge if it adds a new, acyclic relation.
     * @param {Object} input Endpoints already resolved against the chart's task store.
     * @returns {Object} Committed edge or the reason for refusing the link.
     */
    addFinishToStart(input) {
        const reason = this.getFinishToStartRefusal(input);
        if (reason) return {status: 'refused', reason};

        let edgeId = input.id;
        if (edgeId == null) {
            do { edgeId = Neo.getId('gantt-link') } while (this.get(edgeId))
        }
        const edge = {id: edgeId, fromId: String(input.fromId), toId: String(input.toId), type: 'FS'};
        this.add(edge);
        return {status: 'committed', edge}
    }

    /**
     * @summary Drops cached predecessor and successor endpoint buckets.
     * @private
     */
    #clearEndpointIndex() {
        this.#indexedCount     = -1;
        this.#indexedItems     = null;
        this.#indexedMutations = -1;
        this.#predecessors     = null;
        this.#successors       = null
    }

    /**
     * @summary Clears cached endpoints alongside a silent collection clear.
     * @param {Boolean} [reset=true] True to also clear `allItems`.
     */
    clearSilent(reset=true) {
        super.clearSilent(reset);
        this.#clearEndpointIndex()
    }

    /**
     * @summary Releases cached endpoint buckets before destroying the store.
     */
    destroy() {
        this.#clearEndpointIndex();
        super.destroy()
    }

    /**
     * @summary Rebuilds predecessor and successor buckets once when membership, order, or endpoints changed.
     * @private
     */
    #ensureEndpointIndex() {
        const
            count     = this.getCount(),
            items     = this._items,
            mutations = this.getCountMutations();

        if (this.#predecessors && this.#indexedItems === items && this.#indexedCount === count && this.#indexedMutations === mutations) {
            return
        }

        const
            predecessors = new Map(),
            successors   = new Map(),
            pushEdge     = (map, key, edge) => {
                let bucket = map.get(key);
                if (!bucket) {
                    bucket = [];
                    map.set(key, bucket)
                }
                bucket.push(edge)
            };

        for (let i = 0; i < count; i++) {
            const edge = this.getAt(i);
            if (edge) {
                pushEdge(successors,   String(edge.fromId), edge);
                pushEdge(predecessors, String(edge.toId),   edge)
            }
        }

        this.#indexedCount     = count;
        this.#indexedItems     = items;
        this.#indexedMutations = mutations;
        this.#predecessors     = predecessors;
        this.#successors       = successors
    }

    /**
     * @summary Returns a fresh array of cached edges for one endpoint direction.
     * @param {String|Number} taskId
     * @param {Boolean} incoming
     * @returns {Neo.gantt.DependencyModel[]}
     * @private
     */
    #lookupEdges(taskId, incoming) {
        if (taskId === null || taskId === undefined) {
            return []
        }

        this.#ensureEndpointIndex();
        const edges = (incoming ? this.#predecessors : this.#successors).get(String(taskId));
        return edges ? edges.slice() : []
    }

    /**
     * @summary Invalidates endpoint bucket order after moving an item in place.
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    move(fromIndex, toIndex) {
        super.move(fromIndex, toIndex);
        this.#clearEndpointIndex()
    }

    /**
     * @summary Invalidates cached endpoints when `fromId` or `toId` changes on a record.
     * @param {Object} data
     */
    onRecordChange(data) {
        const fields = data?.fields;
        if (!Array.isArray(fields) || !fields.length || fields.some(field => field?.name === 'fromId' || field?.name === 'toId')) {
            this.#clearEndpointIndex()
        }
        super.onRecordChange(data)
    }

    /**
     * @summary Invalidates endpoint bucket order after in-place sorting.
     * @param {Object[]} arr
     * @protected
     */
    sortArray(arr) {
        super.sortArray(arr);
        if (arr === this._items) {
            this.#clearEndpointIndex()
        }
    }

    /**
     * @summary Invalidates cached endpoints when `updateRows` modifies `fromId` or `toId`.
     * @param {Object[]} rows
     * @returns {Error[]}
     * @protected
     */
    writeRows(rows) {
        const touchesEndpoints = rows.some(row => row?.values && (Object.hasOwn(row.values, 'fromId') || Object.hasOwn(row.values, 'toId')));
        if (touchesEndpoints) {
            this.#clearEndpointIndex()
        }
        try {
            return super.writeRows(rows)
        } finally {
            if (touchesEndpoints) {
                this.#clearEndpointIndex()
            }
        }
    }

    /**
     * @summary Returns all dependency records whose `toId` matches `taskId`.
     * @param {String|Number} taskId
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getPredecessors(taskId) {
        return this.#lookupEdges(taskId, true)
    }

    /**
     * @summary Returns all dependency records whose `fromId` matches `taskId`.
     * @param {String|Number} taskId
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getSuccessors(taskId) {
        return this.#lookupEdges(taskId, false)
    }
}

export default Neo.setupClass(DependencyStore);
