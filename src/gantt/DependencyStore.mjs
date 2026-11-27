import DependencyModel from './DependencyModel.mjs';
import RecordFactory   from '../data/RecordFactory.mjs';
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
    /**
     * The store's count when the endpoint index was built, -1 without an index.
     * @member {Number} #indexedCount=-1
     * @private
     */
    #indexedCount = -1
    /**
     * The items array the endpoint index was built from, null without an index.
     * @member {Object[]|null} #indexedItems=null
     * @private
     */
    #indexedItems = null
    /**
     * The store's mutation count when the endpoint index was built, -1 without an index.
     * @member {Number} #indexedMutations=-1
     * @private
     */
    #indexedMutations = -1
    /**
     * The write epoch of each record class in the endpoint index, null without an index.
     * @member {Map|null} #indexedRecordEpochs=null
     * @private
     */
    #indexedRecordEpochs = null
    /**
     * The incoming edges of each task by its id, null without an index.
     * @member {Map|null} #predecessors=null
     * @private
     */
    #predecessors = null
    /**
     * The outgoing edges of each task by its id, null without an index.
     * @member {Map|null} #successors=null
     * @private
     */
    #successors = null

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
     * @param {Neo.data.Store}      store             Dependency store bound to the chart.
     * @param {Object}              input             Endpoints already resolved against the chart's task store.
     * @param {String|Number}       input.fromId      Predecessor task key
     * @param {String|Number}       input.toId        Successor task key
     * @param {String|Number}       [input.id]        Key for the new edge; one that exists refuses the link
     * @param {String}              [input.type='FS'] Dependency type; only `'FS'` is admitted
     * @param {Number}              [input.lag=0]     Lag; only zero is admitted
     * @param {Neo.gantt.TaskStore} [tasks]           Structural parents also depend on their children in a rollup plan.
     * @returns {String|null} Refusal reason, or null when the gesture may offer this link.
     */
    static getFinishToStartRefusal(store, {fromId, toId, id, type='FS', lag=0}, tasks) {
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
            if (tasks?.rollupParents) {
                const parentId = tasks.get(key)?.parentId;
                if (parentId != null && tasks.get(parentId)) pending.push(String(parentId))
            }
            for (const next of successors.get(key) || []) pending.push(next)
        }
        return id != null && store.get(id) ? 'duplicate-id' : null
    }

    /**
     * @summary Previews the same link validation used by {@link #addFinishToStart}.
     * @param {Object}              input   Proposed link.
     * @param {Neo.gantt.TaskStore} [tasks] The chart's task store, whose phases count in a rollup plan
     * @returns {String|null} Refusal reason, or null if eligible.
     */
    getFinishToStartRefusal(input, tasks) {
        return this.constructor.getFinishToStartRefusal(this, input, tasks)
    }

    /**
     * @summary Creates a zero-lag finish-to-start edge if it adds a new, acyclic relation.
     * @param {Object}              input   Endpoints already resolved against the chart's task store.
     * @param {Neo.gantt.TaskStore} [tasks] The chart's task store, whose phases count in a rollup plan
     * @returns {Object} Committed edge or the reason for refusing the link.
     */
    addFinishToStart(input, tasks) {
        const reason = this.getFinishToStartRefusal(input, tasks);
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
        this.#indexedCount        = -1;
        this.#indexedItems        = null;
        this.#indexedMutations    = -1;
        this.#indexedRecordEpochs = null;
        this.#predecessors        = null;
        this.#successors          = null
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
     * @summary Checks whether cached endpoint buckets match current store membership, order, and record epochs.
     * @returns {Boolean}
     * @private
     */
    #hasValidEndpointIndex() {
        if (
            !this.#predecessors ||
            this.#indexedItems !== this._items ||
            this.#indexedCount !== this.getCount() ||
            this.#indexedMutations !== this.getCountMutations()
        ) {
            return false
        }

        for (const [cls, epoch] of this.#indexedRecordEpochs) {
            if (RecordFactory.getWriteEpoch(cls) !== epoch) {
                return false
            }
        }

        return true
    }

    /**
     * @summary Rebuilds predecessor and successor buckets once when membership, order, or endpoints changed.
     * @private
     */
    #ensureEndpointIndex() {
        if (this.#hasValidEndpointIndex()) {
            return
        }

        const
            count         = this.getCount(),
            items         = this._items,
            mutations     = this.getCountMutations(),
            predecessors  = new Map(),
            successors    = new Map(),
            recordClasses = new Set(),
            pushEdge      = (map, key, edge) => {
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
                if (RecordFactory.isRecord(edge)) {
                    recordClasses.add(edge.constructor)
                }
                pushEdge(successors,   String(edge.fromId), edge);
                pushEdge(predecessors, String(edge.toId),   edge)
            }
        }

        const recordEpochs = new Map();
        for (const cls of recordClasses) {
            recordEpochs.set(cls, RecordFactory.getWriteEpoch(cls))
        }

        this.#indexedCount        = count;
        this.#indexedItems        = items;
        this.#indexedMutations    = mutations;
        this.#indexedRecordEpochs = recordEpochs;
        this.#predecessors        = predecessors;
        this.#successors          = successors
    }

    /**
     * @summary Returns a fresh array of cached edges for one endpoint direction.
     * @param {String|Number} taskId   The task whose edges are read
     * @param {Boolean}       incoming True reads the edges that end at the task, false those that start at it
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
     * @param {Number} fromIndex The item's current index
     * @param {Number} toIndex   The index it moves to
     */
    move(fromIndex, toIndex) {
        super.move(fromIndex, toIndex);
        this.#clearEndpointIndex()
    }

    /**
     * @summary Invalidates endpoint bucket order after reversing items in place.
     * @returns {Object[]}
     */
    reverse() {
        const items = super.reverse();
        this.#clearEndpointIndex();
        return items
    }

    /**
     * @summary Invalidates endpoint bucket order after in-place sorting.
     * @param {Object[]} arr The array being sorted in place
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
     * @param {Object[]} rows One per row: `{item, key, values}`
     * @returns {Error[]} The errors subscribers threw while the records published
     * @protected
     */
    writeRows(rows) {
        const touchesEndpoints = rows.some(row => row?.values && (Object.hasOwn(row.values, 'fromId') || Object.hasOwn(row.values, 'toId')));
        if (touchesEndpoints) {
            this.#clearEndpointIndex();
            if (this.allItems instanceof DependencyStore) {
                this.allItems.#clearEndpointIndex()
            }
        }
        try {
            return super.writeRows(rows)
        } finally {
            if (touchesEndpoints) {
                this.#clearEndpointIndex();
                if (this.allItems instanceof DependencyStore) {
                    this.allItems.#clearEndpointIndex()
                }
            }
        }
    }

    /**
     * @summary Returns all dependency records whose `toId` matches `taskId`.
     * @param {String|Number} taskId The task's key
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getPredecessors(taskId) {
        return this.#lookupEdges(taskId, true)
    }

    /**
     * @summary Returns all dependency records whose `fromId` matches `taskId`.
     * @param {String|Number} taskId The task's key
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getSuccessors(taskId) {
        return this.#lookupEdges(taskId, false)
    }
}

export default Neo.setupClass(DependencyStore);
