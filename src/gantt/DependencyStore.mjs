import DependencyModel from './DependencyModel.mjs';
import Store           from '../data/Store.mjs';

/**
 * @summary Store of directed task-dependency edges (`Neo.gantt.DependencyStore`) for `Neo.gantt.Container`.
 * @description Holds {@link Neo.gantt.DependencyModel} records (`fromId` → `toId`) and exposes
 * {@link #getSuccessors} and {@link #getPredecessors} for topological dependency cascading and SVG arrow
 * projection in {@link Neo.gantt.DependencyLayer}.
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
     * @summary Creates a zero-lag finish-to-start edge if it adds a new, acyclic relation.
     * @param {Object} input Endpoints already resolved against the chart's task store.
     * @returns {Object} Plain admission receipt.
     */
    addFinishToStart({fromId, toId, id, type='FS', lag=0}) {
        if (this.isFiltered()) return {status: 'refused', reason: 'filtered-dependencies'};
        if (type !== 'FS' || lag !== 0) return {status: 'refused', reason: 'unsupported-dependency'};
        const from = String(fromId), to = String(toId), successors = new Map();
        if (from === to) return {status: 'refused', reason: 'self'};
        for (let index = 0; index < this.getCount(); index++) {
            const edge = this.getAt(index), source = String(edge.fromId), target = String(edge.toId);
            if (source === from && target === to && edge.type === type) return {status: 'refused', reason: 'duplicate'};
            if (!successors.has(source)) successors.set(source, []);
            successors.get(source).push(target)
        }
        const visited = new Set(), pending = [to];
        while (pending.length) {
            const key = pending.pop();
            if (key === from) return {status: 'refused', reason: 'cycle'};
            if (visited.has(key)) continue;
            visited.add(key);
            for (const next of successors.get(key) || []) pending.push(next)
        }
        let edgeId = id;
        if (edgeId == null) {
            do { edgeId = Neo.getId('gantt-link') } while (this.get(edgeId))
        }
        if (this.get(edgeId)) return {status: 'refused', reason: 'duplicate-id'};
        const edge = {id: edgeId, fromId: from, toId: to, type};
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
