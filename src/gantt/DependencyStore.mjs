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
     * @summary Returns all dependency records whose `toId` matches `taskId`.
     * @param {String|Number} taskId
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getPredecessors(taskId) {
        if (taskId === null || taskId === undefined) {
            return []
        }

        const
            target = String(taskId),
            result = [],
            count  = this.getCount();

        for (let i = 0; i < count; i++) {
            const edge = this.getAt(i);
            if (edge && String(edge.toId) === target) {
                result.push(edge)
            }
        }

        return result
    }

    /**
     * @summary Returns all dependency records whose `fromId` matches `taskId`.
     * @param {String|Number} taskId
     * @returns {Neo.gantt.DependencyModel[]}
     */
    getSuccessors(taskId) {
        if (taskId === null || taskId === undefined) {
            return []
        }

        const
            target = String(taskId),
            result = [],
            count  = this.getCount();

        for (let i = 0; i < count; i++) {
            const edge = this.getAt(i);
            if (edge && String(edge.fromId) === target) {
                result.push(edge)
            }
        }

        return result
    }
}

export default Neo.setupClass(DependencyStore);
