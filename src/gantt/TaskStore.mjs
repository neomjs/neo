import TaskModel from './TaskModel.mjs';
import Events    from '../timeline/store/Events.mjs';
import TreeStore from '../data/TreeStore.mjs';

const derivedFields = ['startDate', 'endDate', 'percentDone'];

/**
 * @summary Hierarchical task store (`Neo.gantt.TaskStore`) for `Neo.gantt.Container`.
 * @description Extends `Neo.data.TreeStore` with {@link Neo.gantt.TaskModel} so `Neo.grid.Body` and
 * `Neo.grid.column.Tree` project the flattened visible (expanded) task hierarchy while `get(id)` resolves
 * any task in $O(1)$ across both expanded and collapsed branches. Also provides `getRangeRecords(start, end)`
 * over currently visible tasks intersecting `[start, end)`.
 * @class Neo.gantt.TaskStore
 * @extends Neo.data.TreeStore
 * @see Neo.gantt.TaskModel
 * @see Neo.gantt.Container
 */
class TaskStore extends TreeStore {

    static config = {
        /**
         * @member {String} className='Neo.gantt.TaskStore'
         * @protected
         */
        className: 'Neo.gantt.TaskStore',
        /**
         * @member {String} ntype='gantt-task-store'
         * @protected
         */
        ntype: 'gantt-task-store',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=TaskModel
         * @reactive
         */
        model: TaskModel,
        /**
         * @member {Boolean} rollupParents_=false Derive phase spans and elapsed-duration-weighted leaf progress.
         * Zero-duration work has no weight; an empty phase keeps its stored values. @reactive
         */
        rollupParents_: false
    }

    #rollingUp = false
    #rollupListeners = null
    #bookingStore = null
    #bookingListeners = null
    #bookingMutationVersion = 0

    /**
     * @summary Returns the owned flat booking view, independent of tree expansion and with its own filters.
     * @description The view borrows canonical leaf Records, never the TaskStore's Model instance. Its separate Model
     * keeps record-change ownership on this TaskStore; source notifications are forwarded to the view. Callers borrow
     * the view and must not destroy it or write its membership: this store owns its membership and lifetime.
     * @returns {Neo.timeline.store.Events}
     */
    getBookingStore() {
        let view = this.#bookingStore;

        if (!view || view.isDestroyed) {
            const config = Neo.clone(this.model.originalConfig || {}, true, true);
            delete config.id;
            delete config.storeId;
            delete config.ntype;
            delete config.className;
            config.module = this.model.constructor;
            view = this.#bookingStore = Neo.create(Events, {
                data: this.#getBookingRecords(), keyProperty: this.getKeyProperty(), model: config, sorters: []
            });
            if (!this.#bookingListeners) {
                this.#bookingListeners = {recordChange: this.onBookingRecordChange, rowsChange: this.onBookingRowsChange,
                    updateKey: this.onBookingUpdateKey, mutate: {fn: this.onBookingSourceMutate, order: 'before'}, scope: this};
                this.on(this.#bookingListeners)
            }
        }
        return view
    }

    /** @summary Reads canonical structural leaves, including those under collapsed or filtered phases. @returns {Object[]} */
    #getBookingRecords() {
        const result = [], walk = children => {
            for (const record of children) {
                const key = this.getKey(record), children = this.getChildren(key);
                if (children.length) walk(children);
                else if (record.isLeaf !== false) result.push(record)
            }
        };
        walk(this.getChildren());
        return result
    }

    /** @summary Reconciles the view after structural writes, including silent and hidden writes. */
    splice(index, removeCountOrToRemoveArray, toAddArray, silent=false) {
        const version = this.#bookingMutationVersion,
            result    = super.splice(index, removeCountOrToRemoveArray, toAddArray, silent);
        if (version === this.#bookingMutationVersion) this.onBookingMutation(silent);
        return result
    }

    /** @summary Settles structural membership before source observers, ignoring visibility-only mutations. @param {Object} event */
    onBookingSourceMutate({addedItems=[], removedItems=[]}) {
        const view = this.#bookingStore;
        if (!view || view.isDestroyed) return;
        this.#bookingMutationVersion++;
        const differs = item => {
            const key = this.getKey(item), current = view.getRow(key), canonical = this.get(key);
            return current ? current !== canonical : canonical?.isLeaf !== false && !!canonical
        };
        if (addedItems.some(differs) || removedItems.some(differs)) this.onBookingMutation()
    }

    /** @summary Reconciles membership only when structural leaves have actually changed. @param {Boolean} [silent=false] */
    onBookingMutation(silent=false) {
        const view = this.#bookingStore;
        if (!view || view.isDestroyed) return;

        const records = this.#getBookingRecords(), next = new Map(records.map(record => [this.getKey(record), record])),
            current   = (view.allItems || view).items,
            removed   = current.filter(record => next.get(this.getKey(record)) !== record),
            added     = records.filter(record => view.getRow(this.getKey(record)) !== record);

        if (removed.length || added.length) view.splice(null, removed, added, silent)
    }

    /** @summary Forwards edits of borrowed records so view filters and consumers react. @param {Object} event */
    onBookingRecordChange(event) {
        const view = this.#bookingStore;
        if (!view || view.isDestroyed) return;
        if (event.fields?.some(field => (typeof field === 'string' ? field : field.name) === 'isLeaf')) {
            this.onBookingMutation()
        }
        if (view.getRow(this.getKey(event.record)) === event.record) {
            view.onRecordChange(event)
        }
    }

    /** @summary Relays a canonical batch receipt for rows held by the view. @param {Object} event */
    onBookingRowsChange(event) {
        const view = this.#bookingStore;
        if (!view || view.isDestroyed) return;
        const keys = (event.keys || []).filter(key => view.getRow(key));
        if (keys.length) view.fire('rowsChange', {...event, keys, scope: view})
    }

    /** @summary Re-keys a borrowed record after the canonical store commits its key. @param {Object} event */
    onBookingUpdateKey({item, oldKey, newKey}) {
        const view = this.#bookingStore;
        if (!view || view.isDestroyed || (view.allItems || view).map.get(oldKey) !== item) return;

        for (const collection of [view, view.allItems].filter(Boolean)) {
            if (collection.map.get(oldKey) === item) {
                collection.map.delete(oldKey);
                collection.map.set(newKey, item)
            }
        }
        view.onRecordChange({record: item, model: this.model,
            fields: [{name: this.getKeyProperty(), oldValue: oldKey, value: newKey}]});
        view.fire('updateKey', {item, oldKey, newKey, scope: view})
    }

    /** @summary Retires the owned booking view and detaches its source listeners. */
    destroy() {
        if (this.#bookingListeners) this.un(this.#bookingListeners);
        this.#bookingListeners = null;
        if (this.#bookingStore && !this.#bookingStore.isDestroyed) this.#bookingStore.destroy();
        this.#bookingStore = null;
        super.destroy()
    }

    /** @summary Recomputes the plan when the opt-in policy is enabled. */
    afterSetRollupParents(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.syncRollupListeners();
            if (value) this.rollupParentTasks()
        }
    }

    /** @summary A parent is derived only while the policy is enabled and it has structural children. */
    isDerivedParent(record) {
        return !!(this.rollupParents && record && this.getChildren(this.getKey(record)).length)
    }

    /** @summary Subscribes once to direct edits and structural changes, independent of chart count. */
    onConstructed() {
        super.onConstructed();
        this.syncRollupListeners();
        if (this.rollupParents) this.rollupParentTasks()
    }

    /** @summary Attaches derivation only while the opt-in policy is enabled. */
    syncRollupListeners() {
        if (this.#rollupListeners) this.un(this.#rollupListeners);
        this.#rollupListeners = this.rollupParents ? {recordChange: this.onRollupRecordChange,
            mutate: this.onRollupMutation, load: this.onRollupMutation, scope: this} : null;
        if (this.#rollupListeners) this.on(this.#rollupListeners)
    }

    /** @summary Recomputes for direct schedule-field edits; batch rows settle on rowsChange. */
    onRollupRecordChange({fields, record}) {
        if (!this.isUpdatingRows && (!Array.isArray(fields) || fields.some(field =>
            derivedFields.includes(typeof field === 'string' ? field : field.name)))) {
            this.rollupParentTasks(record)
        }
    }

    /** @summary Recomputes after a structural change or reload. */
    onRollupMutation() {
        if (!this.isUpdatingRows) this.rollupParentTasks()
    }

    /**
     * @summary Returns leaf work and the structural envelope for a subtree, regardless of visibility.
     * @param {Object} record Task record.
     * @returns {Object} Envelope and weighted completion.
     */
    #summary(record, cache, pending) {
        if (cache.has(record)) return cache.get(record);
        const children = this.getChildren(this.getKey(record));
        let result;
        if (children.length) {
            result = {start: Infinity, end: -Infinity, weight: 0, completed: 0};
            for (const child of children) {
                const part = this.#summary(child, cache, pending);
                result.start = Math.min(result.start, part.start);
                result.end = Math.max(result.end, part.end);
                result.weight += part.weight;
                result.completed += part.completed
            }
        } else {
            const values     = pending.get(record) || {},
                  startValue = Object.hasOwn(values, 'startDate') ? values.startDate : record.startDate,
                  endValue   = Object.hasOwn(values, 'endDate') ? values.endDate : record.endDate,
                  progress   = Object.hasOwn(values, 'percentDone') ? values.percentDone : record.percentDone,
                  start      = startValue == null ? NaN : new Date(startValue).getTime(),
                  end        = endValue == null ? NaN : new Date(endValue).getTime(),
                  valid      = Number.isFinite(start) && Number.isFinite(end) && end >= start,
                  weight     = valid ? end - start : 0,
                  percent    = Number.isFinite(progress) ? progress : 0;
            result = {start: valid ? start : Infinity, end: valid ? end : -Infinity, weight, completed: weight * percent}
        }
        cache.set(record, result);
        return result
    }

    /**
     * @summary Plans one phase using pending leaf values without mutating records.
     * @param {Object} record Parent task.
     * @param {Map} [pending] Staged model fields keyed by task.
     * @param {Map} [cache] Subtree summaries for this set of staged fields.
     * @returns {Object|null} Changed parent receipt.
     */
    planParentRollup(record, pending=new Map(), cache=new Map()) {
        if (!this.isDerivedParent(record)) return null;
        const total  = this.#summary(record, cache, pending), changes = {}, previous = {};
        const values = {percentDone: total.weight ? total.completed / total.weight : 0};
        if (Number.isFinite(total.start) && Number.isFinite(total.end)) {
            values.startDate = new Date(total.start);
            values.endDate = new Date(total.end)
        }
        for (const [field, value] of Object.entries(values)) {
            const old = record[field], same = value instanceof Date ? old instanceof Date && old.getTime() === value.getTime() : old === value;
            if (!same) { previous[field] = old; changes[field] = value }
        }
        if (!Object.keys(changes).length) return null;
        return {record, previous, changes}
    }

    /**
     * @summary Plans phases bottom-up, optionally limited to the ancestors of changed records.
     * @param {Map} [pending] Staged values keyed by record.
     * @param {Object[]} [changed] Changed records, or omitted for the whole tree.
     * @returns {Object[]}
     */
    planParentRollups(pending=new Map(), changed) {
        if (!this.rollupParents) return [];
        const parents = [], cache = new Map(), affected = changed ? new Set() : null;
        if (affected) {
            for (const record of changed) {
                let node = record;
                while (node && !affected.has(node)) {
                    affected.add(node);
                    node = node.parentId == null || node.parentId === 'root' ? null : this.get(node.parentId)
                }
            }
        }
        // A subtree enters the cache after its children, giving every receipt its dependency order.
        for (const record of affected || this.getChildren()) this.#summary(record, cache, pending);
        for (const record of cache.keys()) {
            if (affected && !affected.has(record)) continue;
            const receipt = this.planParentRollup(record, pending, cache);
            if (receipt) parents.push(receipt)
        }
        return parents
    }

    /** @summary Adds derived phase writes to the same prepared batch as edited tasks. */
    writeRows(rows) {
        const scheduled = this.rollupParents && !this.#rollingUp &&
            rows.filter(({values}) => derivedFields.some(field => Object.hasOwn(values, field)));
        if (scheduled?.length) {
            // getChildren hydrates Turbo rows. Bind staged inputs to those same identities before planning.
            for (const row of rows) row.item = this.get(row.key) || row.item;
            const pending  = new Map(rows.map(({item, values}) => [item, values])),
                  existing = new Map(rows.map(row => [row.item, row]));
            for (const {item, values} of scheduled) {
                if (this.isDerivedParent(item)) {
                    for (const field of derivedFields) delete values[field]
                }
            }
            const changed = scheduled.map(({item}) => item);
            for (const {record, changes} of this.planParentRollups(pending, changed)) {
                const row = existing.get(record);
                if (row) Object.assign(row.values, changes);
                else rows.push({item: record, key: this.getKey(record), values: changes})
            }
        }
        return super.writeRows(rows)
    }

    /**
     * @summary Updates phases bottom-up, or just a changed task's ancestors, and returns changed receipts.
     * @param {Object} [changed] A changed task, when the hierarchy itself has not changed.
     * @returns {Object[]}
     */
    rollupParentTasks(changed) {
        if (!this.rollupParents || this.#rollingUp || this.isUpdatingRows) return [];
        const parents = this.planParentRollups(new Map(), changed ? [changed] : undefined);
        this.#rollingUp = true;
        try {
            if (parents.length) this.updateRows(parents.map(({record, changes}) => ({key: this.getKey(record), values: changes})))
        } finally { this.#rollingUp = false }
        return parents
    }

    /**
     * @summary Returns visible tree rows in a range, or structural leaf bookings for an explicit resource.
     * @param {Date|Number|String} start Range start (inclusive)
     * @param {Date|Number|String} end Range end (exclusive for positive-duration intervals)
     * @param {String|Number|null} [resourceId=null] When present, filters canonical leaf bookings by resource.
     * @returns {Neo.gantt.TaskModel[]}
     */
    getRangeRecords(start, end, resourceId=null) {
        if (resourceId != null) return this.getBookingStore().getRangeRecords(start, end, resourceId);
        const
            me      = this,
            startMs = start instanceof Date ? start.getTime() : new Date(start).getTime(),
            endMs   = end   instanceof Date ? end.getTime()   : new Date(end).getTime(),
            result  = [],
            count   = me.getCount();

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
            return result
        }

        for (let i = 0; i < count; i++) {
            const record = me.getAt(i);
            if (!record) {
                continue
            }

            const
                recStart = record.startDate instanceof Date ? record.startDate.getTime() : new Date(record.startDate).getTime(),
                recEnd   = record.endDate   instanceof Date ? record.endDate.getTime()   : new Date(record.endDate).getTime();

            if (Events.intersectsRange(recStart, recEnd, startMs, endMs)) {
                result.push(record)
            }
        }

        return result
    }
}

export default Neo.setupClass(TaskStore);
