import ComponentList from './Component.mjs';
import TreeBuilder   from '../util/vdom/TreeBuilder.mjs';

/**
 * @summary A fixed-height, Store-bound component list whose mounted rows stay bounded.
 *
 * `Neo.list.Base` deliberately renders one semantic list item per Store record. That is the right
 * contract for ordinary lists and the wrong cost model for histories with hundreds or thousands of
 * rows. `Buffered` keeps the list contract (`ul` / `li`, ListModel, Navigator, Store) while borrowing
 * only the fixed-height range discipline from `Neo.grid.Body`: the viewport plus
 * {@link #bufferRowRange} rows on either side is mounted between two stable spacers.
 *
 * Physical pool slots and logical records are different identities. Slot ids never encode a record;
 * `data.recordId` does. A slot belongs to one mounted-range offset, keeping `[slot-0 … slot-N]` in
 * invariant DOM order while records rebind through Store position. Assistive technology therefore
 * reads the same order the operator sees without structural VDOM moves. Moving a range edge updates
 * bounded slot contents; it never creates one component per Store record.
 *
 * Consumers that need component rows provide {@link #itemConfig}: an object or function returning a
 * component config. The component is created once per physical slot and receives the current record
 * through {@link #recordProperty} on every recycle. Record-specific StateProvider bindings are not a
 * supported shortcut: as with `Neo.grid.column.Component`, pooled components must receive record facts
 * as configs because bindings are created only for the component instance, not per recycled record.
 *
 * Fixed height is the simplifying invariant. Variable-height measurement, correction, and prefix-sum
 * invalidation are intentionally not hidden behind this class; a missing or invalid `itemHeight`
 * fails at construction.
 *
 * @class Neo.list.Buffered
 * @extends Neo.list.Component
 */
class Buffered extends ComponentList {
    static config = {
        /**
         * @member {String} className='Neo.list.Buffered'
         * @protected
         */
        className: 'Neo.list.Buffered',
        /**
         * @member {String} ntype='buffered-list'
         * @protected
         */
        ntype: 'buffered-list',
        /**
         * @member {String[]} baseCls=['neo-list','neo-buffered-list']
         */
        baseCls: ['neo-list', 'neo-buffered-list'],
        /**
         * Rows kept mounted before and after the visible range. Non-negative integers only.
         * @member {Number} bufferRowRange_=3
         * @reactive
         */
        bufferRowRange_: 3,
        /**
         * Component config or factory for one pooled row. A factory receives
         * `{component, list, logicalIndex, poolIndex, record}` and must return a config whose module
         * stays compatible with the component already occupying that slot.
         * @member {Object|Function|null} itemConfig=null
         */
        itemConfig: null,
        /**
         * Defaults merged below every first-created pooled component.
         * @member {Object|null} itemDefaults=null
         */
        itemDefaults: null,
        /**
         * Property through which a pooled component receives its current Store record.
         * @member {String} recordProperty='record'
         */
        recordProperty: 'record',
        /**
         * Buffered lists own their vertical scroll seat.
         * @member {String} scrollable='y'
         */
        scrollable: 'y'
    }

    /**
     * Count of rows fitting the last observed viewport.
     * @member {Number} availableRows=1
     * @readonly
     */
    availableRows = 1
    /**
     * Stable logical record at the first visible pixel, used to preserve history position across
     * Store replacement/prepend/sort/filter.
     * @member {String|Number|null} anchorRecordId=null
     * @protected
     */
    anchorRecordId = null
    /**
     * Pixel offset inside {@link #anchorRecordId}'s row.
     * @member {Number} anchorOffset=0
     * @protected
     */
    anchorOffset = 0
    /**
     * Currently mounted logical Store range `[start, endExclusive]`.
     * @member {Number[]} mountedRange=[0,0]
     * @readonly
     */
    mountedRange = [0, 0]
    /**
     * Logical-record-key → physical pool slot for the current mounted range.
     * @member {Map<String,Number>} recordSlotMap
     * @protected
     */
    recordSlotMap = new Map()
    /**
     * Last observed scroll position.
     * @member {Number} scrollTop=0
     * @protected
     */
    scrollTop = 0
    /**
     * Physical slot → current logical record id.
     * @member {Array<String|Number|null>} slotRecordIds=[]
     * @protected
     */
    slotRecordIds = []
    /**
     * Last observed viewport height. Before the first resize delivery a numeric component height,
     * or one row as the fail-visible fallback, seeds the pool.
     * @member {Number} viewportHeight=0
     * @protected
     */
    viewportHeight = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (!Number.isFinite(me.itemHeight) || me.itemHeight <= 0) {
            throw new TypeError('[Neo.list.Buffered] itemHeight must be a positive finite number')
        }

        me.viewportHeight = Number.isFinite(me.height) && me.height > 0 ? me.height : me.itemHeight;
        me.syncAvailableRows();

        me.addDomListeners({
            resize: me.onResize,
            scope : me
        })
    }

    /**
     * Registers or unregisters the list root with the canonical main-thread ResizeObserver addon.
     * @param {Boolean} mounted
     * @returns {Promise<void>}
     * @protected
     */
    async addResizeObserver(mounted) {
        let {id, windowId} = this,
            ResizeObserver = await Neo.currentWorker.getAddon('ResizeObserver', windowId);

        // Main-thread ResizeObserver routes each delivery back through `componentIds`; the DOM
        // target and App-Worker recipient happen to be this list, but both identities are required.
        ResizeObserver[mounted ? 'register' : 'unregister']({componentId: id, id, windowId})
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferRowRange(value, oldValue) {
        this.isConstructed && this.createItems()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetItemHeight(value, oldValue) {
        if (this.isConstructed) {
            this.syncAvailableRows();
            this.createItems()
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        oldValue !== undefined && this.addResizeObserver(value)
    }

    /**
     * Resets physical/logical mappings before the replacement Store starts emitting into this list.
     * Pooled component instances survive and rebind; their class is a consumer contract, not Store
     * identity.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        me.anchorRecordId = null;
        me.anchorOffset   = 0;
        me.mountedRange   = [0, 0];
        me.recordSlotMap.clear();
        me.scrollTop      = 0;
        me.slotRecordIds  = [];

        super.afterSetStore(value, oldValue)
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetBufferRowRange(value, oldValue) {
        return Number.isInteger(value) && value >= 0 ? value : (oldValue ?? 3)
    }

    /**
     * Runtime invalid heights keep the prior valid bound. Construction still fails loudly when no
     * valid initial height was supplied.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @returns {Number|null}
     * @protected
     */
    beforeSetItemHeight(value, oldValue) {
        if (Number.isFinite(value) && value > 0) {
            return value
        }

        if (Number.isFinite(oldValue) && oldValue > 0) {
            return oldValue
        }

        throw new TypeError('[Neo.list.Buffered] itemHeight must be a positive finite number')
    }

    /**
     * Assigns current-range records to fixed physical slots by mounted-range offset. The physical
     * slot order is invariant while Store records rebind, so logical/DOM reading order stays aligned
     * without `moveNode`, `insertNode`, or `removeNode` deltas during steady-state range movement.
     * @param {Object[]} records
     * @param {Number} start Logical start index.
     * @param {Number} poolSize
     * @returns {Object[]} `{record, logicalIndex, poolIndex}` descriptors in logical order.
     * @protected
     */
    assignPoolSlots(records, start, poolSize) {
        let me          = this,
            assignments = records.slice(0, poolSize).map((record, poolIndex) => ({
                logicalIndex: start + poolIndex,
                poolIndex,
                record
            }));

        me.recordSlotMap = new Map();
        me.slotRecordIds = Array(poolSize).fill(null);

        assignments.forEach(item => {
            const recordId = me.getRecordId(item.record);

            me.recordSlotMap.set(me.toRecordMapKey(recordId), item.poolIndex);
            me.slotRecordIds[item.poolIndex] = recordId
        });

        return assignments
    }

    /**
     * Captures the first visible logical record + within-row pixel offset from current Store truth.
     * @protected
     */
    captureScrollAnchor() {
        let me    = this,
            count = me.store?.getCount() || 0;

        if (count === 0) {
            me.anchorRecordId = null;
            me.anchorOffset   = 0;
            return
        }

        const index  = Math.min(count - 1, Math.floor(me.scrollTop / me.itemHeight)),
              record = me.store.getAt(index);

        me.anchorRecordId = record ? me.getRecordId(record) : null;
        me.anchorOffset   = me.scrollTop - index * me.itemHeight
    }

    /**
     * Calculates the logical range to mount. The existing range stays put while the visible range
     * retains its requested buffer; once an edge consumes that buffer, the range advances just far
     * enough to restore it.
     * @param {Number} count
     * @param {Number} poolSize
     * @returns {Number[]} `[start, endExclusive]`
     * @protected
     */
    calculateMountedRange(count, poolSize) {
        let me           = this,
            buffer       = me.bufferRowRange,
            firstVisible = Math.min(Math.max(0, count - 1), Math.floor(me.scrollTop / me.itemHeight)),
            visibleEnd   = Math.min(count, firstVisible + me.availableRows),
            [start, end] = me.mountedRange,
            maxStart     = Math.max(0, count - poolSize);

        if (count === 0 || poolSize === 0) {
            return [0, 0]
        }

        if (end - start !== poolSize || start > maxStart) {
            start = Math.min(maxStart, Math.max(0, firstVisible - buffer))
        } else if (start > 0 && firstVisible < start + buffer) {
            start = Math.max(0, firstVisible - buffer)
        } else if (end < count && visibleEnd > end - buffer) {
            start = Math.min(maxStart, visibleEnd + buffer - poolSize)
        }

        return [start, start + poolSize]
    }

    /**
     * Creates/reconfigures the bounded rendered list. Stable spacer ids hold the unmounted extents;
     * stable slot ids hold pooled rows; vdom order follows the Store. Pool cardinality depends only
     * on viewport + buffer, never Store history length.
     * @param {Boolean} silent=false
     * @returns {Promise<*>} Settles after the bounded VDOM delivery, or immediately when silent.
     */
    createItems(silent=false) {
        let me    = this,
            store = me.store;

        if (!store || !Number.isFinite(me.itemHeight) || me.itemHeight <= 0) {
            return Promise.resolve()
        }

        const
            count    = store.getCount(),
            poolSize = Math.min(count, me.availableRows + 2 * me.bufferRowRange),
            maxTop   = me.getMaxScrollTop(count);

        me.scrollTop = Math.min(Math.max(0, me.scrollTop), maxTop);

        const
            range        = me.calculateMountedRange(count, poolSize),
            records      = [],
            topHeight    = range[0] * me.itemHeight,
            bottomHeight = Math.max(0, count - range[1]) * me.itemHeight;

        for (let index = range[0]; index < range[1]; index++) {
            records.push(store.getAt(index))
        }

        me.trimComponentPool(poolSize);

        const assignments = me.assignPoolSlots(records, range[0], poolSize),
              vdom        = me.getVdomRoot();

        me.mountedRange = range;
        vdom.scrollTop  = me.scrollTop;
        vdom.cn         = [
            me.createSpacer('top', topHeight),
            ...assignments.map(item => me.createPooledItem(item)),
            me.createSpacer('bottom', bottomHeight)
        ];

        me.captureScrollAnchor();
        me.selectionModel?.restoreSelection(true);

        if (silent) {
            return Promise.resolve()
        }

        return me.promiseUpdate().then(data => {
            me.fire('createItems')

            return data
        })
    }

    /**
     * Extends the existing list render hook with a bounded physical slot. When `itemConfig` exists,
     * the slot owns one reusable component; otherwise ordinary List text rendering remains available.
     * @param {Object} record
     * @param {Number} logicalIndex
     * @param {Number} poolIndex
     * @returns {Object[]|Object|String}
     */
    createItemContent(record, logicalIndex, poolIndex) {
        let me = this;

        if (!me.itemConfig) {
            return super.createItemContent(record, logicalIndex, poolIndex)
        }

        const component = me.getPooledComponent(record, logicalIndex, poolIndex);

        return component ? [component.createVdomReference()] : super.createItemContent(record, logicalIndex, poolIndex)
    }

    /**
     * One semantic pool row. The physical id is slot-owned; logical identity is explicit data.
     * @param {Object} item `{record, logicalIndex, poolIndex}`
     * @returns {Object}
     * @protected
     */
    createPooledItem({record, logicalIndex, poolIndex}) {
        let me       = this,
            recordId = me.getRecordId(record),
            item     = super.createItem(record, logicalIndex, poolIndex);

        item ??= {cls: [me.itemCls], tag: me.itemTagName};
        item.id = me.getSlotId(poolIndex);
        item.data = {
            ...(item.data || {}),
            logicalIndex,
            poolIndex,
            recordId
        };
        item['aria-posinset'] = logicalIndex + 1;
        item['aria-setsize']  = me.store.getCount();

        return item
    }

    /**
     * Stable spacer list item. `role=presentation` + `aria-hidden` keep geometry out of the list's
     * semantic item count.
     * @param {String} edge `top` or `bottom`
     * @param {Number} height
     * @returns {Object}
     * @protected
     */
    createSpacer(edge, height) {
        return {
            id           : `${this.id}__${edge}-spacer`,
            tag          : 'li',
            role         : 'presentation',
            'aria-hidden': true,
            cls          : ['neo-buffered-list-spacer', `neo-buffered-list-${edge}-spacer`],
            style        : {height: `${height}px`, listStyle: 'none', pointerEvents: 'none'}
        }
    }

    /**
     * Maps logical selection ids onto their currently mounted physical slot before delegating to
     * the normal vdom lookup. An unmounted selected record correctly resolves to null; selection
     * state remains tracked and is restored when the record mounts.
     * @param {String} id
     * @param {Object} vdom=this.vdom
     * @returns {Object|null}
     */
    getVdomChild(id, vdom=this.vdom) {
        let lookupId = id;

        if (typeof id === 'string' && id.startsWith(this.getLogicalIdPrefix())) {
            const recordId = this.getItemRecordId(id),
                  slot     = this.recordSlotMap.get(this.toRecordMapKey(recordId));

            lookupId = slot === undefined ? id : this.getSlotId(slot)
        }

        return super.getVdomChild(lookupId, vdom)
    }

    /**
     * @param {Number} [count=this.store.getCount()]
     * @returns {Number}
     * @protected
     */
    getMaxScrollTop(count=this.store?.getCount() || 0) {
        return Math.max(0, count * this.itemHeight - this.viewportHeight)
    }

    /**
     * A logical selection id remains record-owned even though mounted vdom ids are slot-owned.
     * @param {Object|String|Number} recordOrId
     * @returns {String}
     */
    getItemId(recordOrId) {
        const recordId = recordOrId?.isRecord ? this.getRecordId(recordOrId) : recordOrId;

        return `${this.getLogicalIdPrefix()}${encodeURIComponent(String(recordId))}`
    }

    /**
     * Resolves logical ids, physical slot ids, or event-path nodes to the currently represented
     * Store key.
     * @param {Object|String} nodeOrId
     * @returns {String|Number|null}
     */
    getItemRecordId(nodeOrId) {
        if (nodeOrId?.data?.recordId !== undefined) {
            return nodeOrId.data.recordId
        }

        if (typeof nodeOrId !== 'string') {
            return null
        }

        const logicalPrefix = this.getLogicalIdPrefix(),
              slotPrefix    = `${this.id}__slot-`;

        let value;

        if (nodeOrId.startsWith(logicalPrefix)) {
            value = decodeURIComponent(nodeOrId.slice(logicalPrefix.length))
        } else if (nodeOrId.startsWith(slotPrefix)) {
            value = this.slotRecordIds[Number(nodeOrId.slice(slotPrefix.length))]
        } else {
            return super.getItemRecordId(nodeOrId)
        }

        if (value !== null && value !== undefined && this.store.getKeyType()?.includes('int')) {
            value = Number(value)
        }

        return value ?? null
    }

    /**
     * @returns {String}
     * @protected
     */
    getLogicalIdPrefix() {
        return `${this.id}__record-`
    }

    /**
     * Creates or reconfigures the component assigned to one physical pool slot.
     * @param {Object} record
     * @param {Number} logicalIndex
     * @param {Number} poolIndex
     * @returns {Neo.component.Base|null}
     * @protected
     */
    getPooledComponent(record, logicalIndex, poolIndex) {
        let me        = this,
            component = me.items?.[poolIndex],
            config    = typeof me.itemConfig === 'function' ? me.itemConfig({
                component,
                list: me,
                logicalIndex,
                poolIndex,
                record
            }) : me.itemConfig;

        if (!config || Neo.typeOf(config) !== 'Object') {
            component?.destroy();
            me.items && delete me.items[poolIndex];
            return null
        }

        config = {...config, [me.recordProperty]: record};

        if (component && typeof config.module === 'function' && !(component instanceof config.module)) {
            component.destroy();
            delete me.items[poolIndex];
            component = null
        }

        if (component) {
            const update = {...config};

            delete update.appName;
            delete update.className;
            delete update.id;
            delete update.module;
            delete update.ntype;
            delete update.parentId;
            delete update.windowId;

            component.lastRecordVersion = record.version;
            component.set(update, true)
        } else {
            me.items ??= [];
            component = me.items[poolIndex] = Neo.create({
                ...(me.itemDefaults || {}),
                ...config,
                appName : me.appName,
                id      : me.getComponentId(poolIndex),
                parentId: me.id,
                theme   : me.theme,
                windowId: me.windowId
            });
            component.lastRecordVersion = record.version
        }

        // The list is one component boundary above the pooled item. Include that distance before
        // adding the item's own nested depth, otherwise mounted child components stop at
        // `neoIgnore` and keep the record that first occupied their physical slot.
        me.updateDepth = Math.max(me.updateDepth, 1 + TreeBuilder.getComponentDepth(component));

        return component
    }

    /**
     * @param {Number} poolIndex
     * @returns {String}
     * @protected
     */
    getSlotId(poolIndex) {
        return `${this.id}__slot-${poolIndex}`
    }

    /**
     * Ensures a logical Store index is mounted, updating both vdom scroll state and painted scroll
     * state before focus/selection delegates to the existing List contracts.
     * @param {Number} index
     * @returns {Boolean}
     */
    scrollToIndex(index) {
        let me    = this,
            count = me.store?.getCount() || 0;

        if (!Number.isInteger(index) || index < 0 || index >= count) {
            return false
        }

        const firstVisible = Math.floor(me.scrollTop / me.itemHeight),
              lastVisible  = firstVisible + me.availableRows - 1;

        let nextTop = me.scrollTop;

        if (index < firstVisible) {
            nextTop = index * me.itemHeight
        } else if (index > lastVisible) {
            nextTop = (index - me.availableRows + 1) * me.itemHeight
        }

        if (nextTop !== me.scrollTop || index < me.mountedRange[0] || index >= me.mountedRange[1]) {
            me.scrollTop     = Math.min(Math.max(0, nextTop), me.getMaxScrollTop(count));
            me.vdom.scrollTop = me.scrollTop;
            me.createItems();
            me.syncDomScrollTop()
        }

        return true
    }

    /**
     * Buffered override: make the target record visible before ListModel annotates it.
     * @param {Number|Object} item Store index or record.
     */
    selectItem(item) {
        let me    = this,
            index = Neo.isNumber(item) ? item : me.store.indexOf(item);

        if (!me.disableSelection && me.scrollToIndex(index)) {
            me.selectionModel?.selectAt(index)
        }
    }

    /**
     * Main-thread resize delivery.
     * @param {Object} data
     * @protected
     */
    onResize(data) {
        let me     = this,
            height = Number(data?.rect?.height ?? data?.contentRect?.height ?? data?.height);

        if (Number.isFinite(height) && height > 0 && height !== me.viewportHeight) {
            me.viewportHeight = height;
            me.syncAvailableRows();
            me.createItems()
        }
    }

    /**
     * Captured root scroll. Super keeps vdom/vnode scroll state coherent; this class changes the
     * mounted range only when the buffer edge is crossed.
     * @param {Object} data
     */
    onScrollCapture(data) {
        super.onScrollCapture(data);

        let me       = this,
            targetId = data?.target?.id;

        if (targetId === me.id || targetId === me.getVdomRoot().id) {
            const nextTop = Math.min(Math.max(0, Number(data.scrollTop) || 0), me.getMaxScrollTop());

            me.scrollTop = nextTop;
            me.createItems();
        }
    }

    /**
     * Restores the pre-mutation first-visible record when possible, then rebuilds the bounded range.
     */
    onStoreFilter() {
        const restored = this.restoreScrollAnchor();

        return this.createItems().then(() => {
            restored && this.syncDomScrollTop()
        })
    }

    /**
     * Store's coarse notification covers add/remove/reload and is intentionally fired before the
     * fine-grained sort event. One bounded refresh here is therefore the sort refresh too.
     */
    onStoreLoad() {
        const restored = this.restoreScrollAnchor();

        return this.createItems().then(() => {
            restored && this.syncDomScrollTop()
        })
    }

    /**
     * Updates only the mounted slot for the changed record. Store sort-triggered loads already ran
     * before this event; no second full refresh is needed.
     * @param {Object} data
     * @param {Number} data.index
     * @param {Object} data.record
     */
    onStoreRecordChange(data) {
        let me        = this,
            recordId  = me.getRecordId(data.record),
            poolIndex = me.recordSlotMap.get(me.toRecordMapKey(recordId)),
            orderIndex;

        if (poolIndex === undefined || data.index < me.mountedRange[0] || data.index >= me.mountedRange[1]) {
            return
        }

        orderIndex = data.index - me.mountedRange[0];
        me.vdom.cn[orderIndex + 1] = me.createPooledItem({
            logicalIndex: data.index,
            poolIndex,
            record      : data.record
        });

        me.selectionModel?.restoreSelection(true);
        me.update()
    }

    /**
     * Store emits `load` before its externally observed `sort`; rebuilding again here would bind the
     * same pool twice.
     */
    onStoreSort() {}

    /**
     * Repositions the scroll model by logical anchor after Store membership/order changed.
     * @returns {Boolean} Whether the physical scroll position must follow a restored value.
     * @protected
     */
    restoreScrollAnchor() {
        let me     = this,
            oldTop = me.scrollTop;

        if (me.scrollTop <= 0) {
            me.scrollTop = 0;
            return oldTop !== me.scrollTop
        }

        const record = me.anchorRecordId === null ? null : me.store?.get(me.anchorRecordId),
              index  = record ? me.store.indexOf(record) : -1;

        me.scrollTop = index > -1
            ? index * me.itemHeight + me.anchorOffset
            : Math.min(me.scrollTop, me.getMaxScrollTop());
        me.vdom.scrollTop = me.scrollTop;

        return oldTop !== me.scrollTop
    }

    /**
     * @summary Delivers the App-Worker scroll model to this mounted main-thread list.
     *
     * Native scroll capture remains physical authority; programmatic index jumps and Store anchor
     * restoration use this one effect so the next capture observes, rather than overwrites, the
     * semantic position.
     * @protected
     */
    syncDomScrollTop() {
        let me = this;

        me.mounted && Neo.main.DomAccess.scrollTo({
            direction: 'top',
            id       : me.id,
            value    : me.scrollTop,
            windowId : me.windowId
        })
    }

    /**
     * @protected
     */
    syncAvailableRows() {
        this.availableRows = Math.max(1, Math.ceil(this.viewportHeight / this.itemHeight))
    }

    /**
     * @param {String|Number|null} recordId
     * @returns {String}
     * @protected
     */
    toRecordMapKey(recordId) {
        return String(recordId)
    }

    /**
     * Destroys component slots beyond the new pool cardinality. Holes stay holes so
     * `Neo.list.Component#destroy` never calls `destroy()` on an undefined element.
     * @param {Number} poolSize
     * @protected
     */
    trimComponentPool(poolSize) {
        let items = this.items || [];

        for (let index = poolSize; index < items.length; index++) {
            items[index]?.destroy();
            delete items[index]
        }

        items.length = Math.min(items.length, poolSize)
    }

    /**
     * Focuses by logical Store position, never by the physical slot's position in the mounted DOM.
     * @param {Number|Object} value
     * @returns {Promise<void>}
     */
    async updateItemFocus(value) {
        let me     = this,
            index  = Neo.isNumber(value) ? value : me.store.indexOf(value),
            record = me.store.getAt(index);

        if (!record || !me.scrollToIndex(index)) {
            return
        }

        const navigate = () => {
            const slot = me.recordSlotMap.get(me.toRecordMapKey(me.getRecordId(record)));

            slot !== undefined && Neo.main.addon.Navigator.navigateTo({
                data    : me.navigator,
                target  : me.getSlotId(slot),
                windowId: me.windowId
            })
        };

        me.mounted ? navigate() : me.on('mounted', navigate, me, {once: true})
    }
}

export default Neo.setupClass(Buffered);
