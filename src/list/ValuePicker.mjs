import Buffered from './Buffered.mjs';

/**
 * @summary Buffered checkbox options whose selection remains owned by the host.
 *
 * Bind a host-owned options Store with keyProperty `key` and Model fields `key`, `value`, `label`
 * and `count`. Keys carry typed identity; labels are presentation only. The host echoes each
 * {@link #selectionChange} request into {@link #selection}. Search and the unselected-match cap
 * only narrow this options Store, retaining selected options even at count zero.
 *
 * Rows use fixed-height pooled vdom, never an option component. Keyboard input runs in the worker
 * over logical records; Navigator retains pointer focus and performs the final DOM focus effect.
 * @class Neo.list.ValuePicker
 * @extends Neo.list.Buffered
 */
class ValuePicker extends Buffered {
    static config = {
        /**
         * @member {String} className='Neo.list.ValuePicker'
         * @protected
         */
        className: 'Neo.list.ValuePicker',
        /**
         * @member {String} ntype='value-picker'
         * @protected
         */
        ntype: 'value-picker',
        /** @member {Boolean} autoDestroyStore=false */
        autoDestroyStore: false,
        /** @member {String[]} baseCls=['neo-list','neo-buffered-list','neo-value-picker'] */
        baseCls: ['neo-list', 'neo-buffered-list', 'neo-value-picker'],
        /** @member {String} displayField='label' */
        displayField: 'label',
        /**
         * @member {Number} height=240
         * @reactive
         */
        height: 240,
        /**
         * @member {Number} itemHeight=32
         * @reactive
         */
        itemHeight: 32,
        /**
         * @member {Object} keys
         * @reactive
         * @protected
         */
        keys: {
            Down : 'onOptionKeyDown',
            End  : 'onOptionKeyDown',
            Enter: 'onOptionKeyDown',
            Home : 'onOptionKeyDown',
            Space: 'onOptionKeyDown',
            Up   : 'onOptionKeyDown'
        },
        /**
         * Maximum unselected label matches admitted; selected keys never consume the cap.
         * @member {Number} maxMatchingOptions_=1000
         * @reactive
         */
        maxMatchingOptions_: 1000,
        /**
         * Case-insensitive literal substring; does not change the selection.
         * @member {String} searchValue_=''
         * @reactive
         */
        searchValue_: '',
        /**
         * @member {String} role='listbox'
         * @reactive
         */
        role: 'listbox',
        /**
         * Host-written option keys. Array or Set input; toggles only report a proposed next set.
         * @member {Array} selection_=[]
         * @reactive
         */
        selection_: [],
        /**
         * @member {Boolean} useCheckBoxes=true
         * @reactive
         */
        useCheckBoxes: true,
        /** @member {Boolean} useInternalId=false */
        useInternalId: false,
        /**
         * @member {Object} _vdom
         * @protected
         */
        _vdom: {tag: 'ul', 'aria-label': 'Values', 'aria-multiselectable': true, cn: []}
    }

    /**
     * @member {Set} admittedKeys
     * @private
     */
    #admittedKeys = new Set()
    /**
     * @member {String|Number|null} focusedKey=null
     * @private
     */
    #focusedKey = null
    /**
     * @member {Number} focusSerial=0
     * @private
     */
    #focusSerial = 0
    /**
     * @member {Boolean} focusPending=false
     * @private
     */
    #focusPending = false
    /**
     * @member {Number} matchingCount=0
     * @private
     */
    #matchingCount = 0
    /**
     * @member {Neo.collection.Filter|null} optionsFilter=null
     * @private
     */
    #optionsFilter = null
    /**
     * @member {Boolean} overflowing=false
     * @private
     */
    #overflowing = false
    /**
     * @member {Boolean} refreshing=false
     * @private
     */
    #refreshing = false
    /**
     * @member {Boolean} refreshQueued=false
     * @private
     */
    #refreshQueued = false
    /**
     * @member {Number} refreshGeneration=0
     * @private
     */
    #refreshGeneration = 0
    /**
     * @member {Set} selectedKeys
     * @private
     */
    #selectedKeys = new Set()

    /**
     * @member {Object} navigator
     * @protected
     */
    navigator = {scrollIntoView: false, workerKeys: ['ArrowDown', 'ArrowUp', 'Home', 'End', ' ', 'Enter']}


    /**
     * @summary Registers logical focus events without a self-selecting model.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.addDomListeners({neonavigate: this.onOptionNavigate, scope: this})
    }

    /**
     * @summary Cancels a cleared cursor or requests logical focus.
     * @param {Number|Object|null} value
     * @param {Number|Object|null} oldValue
     * @protected
     */
    afterSetFocusIndex(value, oldValue) {
        if (value === null) {
            ++this.#focusSerial;
            this.#focusPending = false;
            this.#focusedKey = null
        } else this.updateItemFocus(value)
    }

    /**
     * @summary Rebuilds admission after the cap changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxMatchingOptions(value, oldValue) {
        this.isConstructed && this.refreshOptions()
    }

    /**
     * @summary Rebuilds admission after literal search changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetSearchValue(value, oldValue) {
        this.isConstructed && this.refreshOptions()
    }

    /**
     * @summary Projects external checks without emitting a toggle.
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    afterSetSelection(value, oldValue) {
        this.#selectedKeys = new Set(value);
        this.isConstructed && this.refreshOptions()
    }

    /**
     * Inherited single-selection configs have no authority over this projection.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetSelectedIndex(value, oldValue) {}

    /**
     * @summary Rebinds options and invalidates the old focus generation.
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        ++this.#refreshGeneration;
        this.#refreshQueued = false;
        this.#focusedKey = null;
        ++this.#focusSerial;
        super.afterSetStore(value, oldValue);
        this.isConstructed && this.refreshOptions()
    }

    /**
     * @summary Keeps the cap a finite non-negative integer.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetMaxMatchingOptions(value, oldValue) {
        return Number.isInteger(value) && value >= 0 ? value : (oldValue ?? 1000)
    }

    /**
     * @summary Normalizes empty search input.
     * @param {*} value
     * @returns {String}
     * @protected
     */
    beforeSetSearchValue(value) {
        return String(value ?? '')
    }

    /**
     * @summary Detaches the host's keys into a unique projection.
     * @param {Array|Set|null} value
     * @returns {Array}
     * @protected
     */
    beforeSetSelection(value) {
        return [...new Set(value || [])]
    }

    /**
     * A normal ListModel self-selects; this list renders only the host's projection.
     * @param {*} value
     * @param {Neo.selection.Model|null} oldValue
     * @returns {null}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        return null
    }

    /**
     * @summary Releases only this list's predicate and old Store listeners.
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (oldValue) {
            this.detachStoreListeners(oldValue);
            this.releaseOptionsFilter(oldValue)
        }
        return super.beforeSetStore(value, oldValue)
    }

    /**
     * @summary Composes safe text nodes for the label, literal search highlight and contextual count.
     * @param {Object} record
     * @param {Number} logicalIndex
     * @param {Number} poolIndex
     * @returns {Object[]}
     */
    createItemContent(record, logicalIndex, poolIndex) {
        const label = this.getOptionLabel(record), search = this.searchValue.toLowerCase(), cn = [];
        let   start = 0, index;

        while (search && (index = label.toLowerCase().indexOf(search, start)) !== -1) {
            if (index > start) cn.push({vtype: 'text', text: label.slice(start, index)});
            cn.push({tag: 'span', cls: ['neo-highlight-search'], cn: [{vtype: 'text', text: label.slice(index, index + search.length)}]});
            start = index + search.length
        }
        cn.push({vtype: 'text', text: label.slice(start)});

        return [{tag: 'span', cls: ['neo-value-picker-label'], cn}, {
            tag: 'span', cls: ['neo-value-picker-count'], cn: [{vtype: 'text', text: String(record.count ?? 0)}]
        }]
    }

    /**
     * @summary Adds one non-interactive refine message beyond the bottom spacer.
     * @param {Boolean} silent=false
     * @returns {Promise<*>}
     */
    createItems(silent=false) {
        if (this.isDestroyed) return Promise.resolve();
        const focus  = this.captureItemFocusState(), serial = this.#focusSerial;
        const result = super.createItems(true);
        if (!this.store) return result;
        const root       = this.getVdomRoot(), footerId = this.id + '__refine',
            descriptions = String(root['aria-describedby'] || '').split(/\s+/).filter(id => id && id !== footerId);
        if (this.#overflowing) {
            descriptions.push(footerId);
            root.cn.push({
                id   : footerId, tag: 'li', role: 'presentation', cls: ['neo-value-picker-refine'],
                style: {height: this.itemHeight + 'px'},
                cn   : [{vtype: 'text', text: this.#matchingCount.toLocaleString() + ' values match, narrow the search'}]
            })
        }
        if (descriptions.length) root['aria-describedby'] = descriptions.join(' ');
        else delete root['aria-describedby'];
        if (silent) return result;
        return this.promiseUpdate().then(data => {
            if (!this.isDestroyed && serial === this.#focusSerial) {
                this.restoreItemFocus(focus);
                this.fire('createItems')
            }
            return data
        })
    }

    /**
     * @summary Projects checks onto one physical slot.
     * @param {Object} item
     * @returns {Object}
     * @protected
     */
    createPooledItem(item) {
        const node = super.createPooledItem(item), selected = this.#selectedKeys.has(this.store.getKey(item.record));
        selected && node.cls.push('neo-selected');
        node.role = 'option';
        node['aria-label'] = this.getOptionLabel(item.record) + ', ' + (item.record.count ?? 0) + ' matches';
        node['aria-selected'] = selected;
        return node
    }

    /**
     * @summary Detaches this consumer before source replacement or teardown.
     * @param {Neo.data.Store} store
     * @protected
     */
    detachStoreListeners(store) {
        ['filter', 'load', 'recordChange', 'sort'].forEach(name => {
            store.un({[name]: 'onStore' + Neo.capitalize(name), scope: this})
        })
    }

    /**
     * @summary Includes the non-record footer in the scroll extent.
     * @param {Number} count
     * @returns {Number}
     * @protected
     */
    getMaxScrollTop(count=this.store?.getCount() || 0) {
        return Math.max(0, (count + Number(this.#overflowing)) * this.itemHeight - this.viewportHeight)
    }

    /**
     * @summary Reads display text with a typed-value fallback.
     * @param {Object} record
     * @returns {String}
     * @protected
     */
    getOptionLabel(record) {
        return String(record.label ?? record.value)
    }

    /**
     * @summary Admits the initial options after all configs exist.
     * @protected
     */
    onConstructed() {
        super.onConstructed();
        this.refreshOptions()
    }

    /**
     * @summary Releases pending focus/scroll ownership when focus leaves.
     * @param {Object} data
     */
    onFocusLeave(data) {
        ++this.#focusSerial;
        this.#focusPending = false;
        super.onFocusLeave(data)
    }

    /**
     * @summary Uses captured record identity for a pointer toggle.
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        const key = this.store.getCanonicalKey(node.data?.recordId ?? this.getItemRecordId(node.id));
        this.#focusedKey = key;
        this.#focusPending = false;
        ++this.#focusSerial;
        this.toggleOption(key)
    }

    /**
     * @summary Moves the requested logical cursor synchronously, then renders before DOM focus.
     * @param {Object} data
     */
    onOptionKeyDown(data) {
        const store = this.store, count = store?.getCount() || 0;
        if (!count) return;
        const record = store.get(this.#focusedKey), current = record ? store.indexOf(record) : -1;
        let next;
        switch (data.key) {
            case 'ArrowDown': case 'Down': next = current < 0 ? 0 : Math.min(count - 1, current + 1); break;
            case 'ArrowUp': case 'Up': next = current < 0 ? 0 : Math.max(0, current - 1); break;
            case 'Home': next = 0; break;
            case 'End': next = count - 1; break;
            case ' ': case 'Space': case 'Enter': this.toggleOption(this.#focusedKey); return;
            default: return
        }
        this.focusIndex = next
    }

    /**
     * @summary Rejects stale slot navigation and tracks the logical focus owner.
     * @param {Object} data
     */
    onOptionNavigate(data) {
        const key  = this.store.getCanonicalKey(data.activeRecordId ?? this.getItemRecordId(data.activeItem || '')),
            record = this.store.get(key);
        if (data.activeItem && this.getItemRecordId(data.activeItem) !== key) return;
        if (this.#focusPending && key !== this.#focusedKey) return;
        if (record) {
            this.#focusPending = false;
            this.#focusedKey = key;
            this._focusIndex = this.store.indexOf(record);
            this.fire('itemNavigate', {...data, record})
        }
    }

    /**
     * @summary Recounts the current unfiltered options after a load.
     * @protected
     */
    onStoreLoad() {
        if (!this.isDestroyed && this.isConstructed) this.refreshOptions()
    }

    /** @summary Renders externally driven membership changes after the options predicate is settled. */
    onStoreFilter() {
        if (!this.#refreshing) {
            if (!this.store.filters.includes(this.#optionsFilter)) this.refreshOptions();
            else return super.onStoreFilter()
        }
    }

    /**
     * @summary Updates mounted counts directly and coalesces admission-affecting edits per task.
     * @param {Object} data
     * @protected
     */
    onStoreRecordChange(data) {
        super.onStoreRecordChange(data);
        if (!data.fields?.length || data.fields.some(field => field.name !== 'count')) this.queueOptionsRefresh()
    }

    /**
     * @summary Coalesces a task's edits and cancels obsolete source generations.
     * @protected
     */
    queueOptionsRefresh() {
        if (this.#refreshQueued) return;
        this.#refreshQueued = true;
        const generation = this.#refreshGeneration;
        queueMicrotask(() => {
            if (generation !== this.#refreshGeneration || this.isDestroyed) return;
            this.#refreshQueued = false;
            this.refreshOptions()
        })
    }

    /**
     * A logical key jump owns its pending scroll effect; captures from earlier jumps cannot
     * move the pool back before its target focus lands.
     * @param {Object} data
     */
    onScrollCapture(data) {
        if (!this.#focusPending) super.onScrollCapture(data)
    }

    /**
     * @summary Defers intermediate scroll effects to the latest logical focus request.
     * @protected
     */
    syncDomScrollTop() {
        if (!this.#focusPending) super.syncDomScrollTop()
    }

    /**
     * @summary Computes selected ∪ capped unselected matches once over the full options population.
     * @protected
     */
    refreshOptions() {
        const me = this, store = me.store;
        if (!store || me.#refreshing) return;
        if (me.#refreshQueued) {
            ++me.#refreshGeneration;
            me.#refreshQueued = false
        }
        me.#refreshing = true;
        ++me.#focusSerial;
        me.#focusPending = false;
        try {
            const admitted   = new Set(), search = me.searchValue.toLowerCase();
            let   unselected = 0, matches = 0;
            (store.allItems || store).items.forEach(record => {
                const key = store.getKey(record), selected = me.#selectedKeys.has(key),
                    match = me.getOptionLabel(record).toLowerCase().includes(search);
                if (match) ++matches;
                if (selected || match && unselected++ < me.maxMatchingOptions) admitted.add(key)
            });
            me.#admittedKeys = admitted;
            me.#matchingCount = matches;
            me.#overflowing = unselected > me.maxMatchingOptions;
            if (!store.filters.includes(me.#optionsFilter)) {
                const role = 'value-picker:' + me.id;
                store.filters = [...store.filters, {
                    property: 'label', ownerRole: role,
                    filterBy: ({item}) => !me.#admittedKeys.has(store.getKey(item))
                }];
                me.#optionsFilter = store.filters.find(filter => filter.ownerRole === role)
            } else store.filter();
            const focused = store.get(me.#focusedKey);
            me._focusIndex = focused ? store.indexOf(focused) : null;
            if (!focused) me.#focusedKey = null;
            me.createItems()
        } finally {
            me.#refreshing = false
        }
    }

    /**
     * @summary Removes only the exact options predicate owned here.
     * @param {Neo.data.Store} store
     * @protected
     */
    releaseOptionsFilter(store) {
        if (store.filters.includes(this.#optionsFilter)) {
            store.filters = store.filters.filter(filter => filter !== this.#optionsFilter)
        }
        this.#optionsFilter = null
    }

    /**
     * @summary Reconciles a recycled focus owner without overriding pending input.
     * @param {Object|null} state
     * @protected
     */
    restoreItemFocus(state) {
        if (!this.#focusPending && state && state.recordId === this.#focusedKey) {
            super.restoreItemFocus(state);
            const record = Neo.isNumber(this.focusIndex) ? this.store.getAt(this.focusIndex) : this.focusIndex;
            this.#focusedKey = record ? this.store.getKey(record) : null
        }
    }

    /**
     * @summary Reports one toggle without changing the host-written selection.
     * @param {*} key
     */
    toggleOption(key) {
        const record = this.store?.get(key);
        if (!record || record[this.disabledField]) return;
        const selected = this.#selectedKeys.has(key), selection = this.selection.slice();
        if (selected) selection.splice(selection.indexOf(key), 1);
        else selection.push(key);
        /**
         * @event selectionChange
         * @param {Array} added Keys requested for inclusion.
         * @param {Array} removed Keys requested for removal.
         * @param {Array} selection Proposed next selection; the host must echo it.
         */
        this.fire('selectionChange', {added: selected ? [] : [key], removed: selected ? [key] : [], selection})
    }

    /**
     * @summary Fences the asynchronous focus effect against replacement, removal and newer keys.
     * @param {Number|Object} value
     * @returns {Promise<void>}
     */
    async updateItemFocus(value) {
        const store = this.store, index = Neo.isNumber(value) ? value : store?.indexOf(value), record = store?.getAt(index),
            serial  = ++this.#focusSerial;
        this.#focusPending = false;
        if (!record) {
            this.#focusedKey = null;
            this._focusIndex = null;
            return
        }
        this.#focusedKey = store.getKey(record);
        this.#focusPending = true;
        try {
            if (!this.scrollToIndex(index)) return;
            await this.promiseUpdate();
            if (this.isDestroyed || serial !== this.#focusSerial || this.store !== store || store.get(this.#focusedKey) !== record) return;
            this._focusIndex = store.indexOf(record);
            if (this.mounted) await Neo.main.DomAccess.scrollTo({
                direction: 'top', id: this.id, value: this.scrollTop, windowId: this.windowId
            });
            if (this.isDestroyed || serial !== this.#focusSerial || this.store !== store) return;
            const slot = this.recordSlotMap.get(this.toRecordMapKey(this.#focusedKey));
            if (slot !== undefined && this.mounted) await Neo.main.addon.Navigator.navigateTo({
                data  : this.navigator, fromTarget: this.id,
                target: this.getSlotId(slot), windowId: this.windowId
            })
        } catch (error) {
            if (error !== Neo.isDestroyed) throw error
        } finally {
            if (serial === this.#focusSerial) this.#focusPending = false
        }
    }

    /**
     * @summary Releases consumer state while leaving the host's options Store alive.
     * @param {Array} args
     */
    destroy(...args) {
        ++this.#refreshGeneration;
        this.#refreshQueued = false;
        ++this.#focusSerial;
        if (this.store) {
            this.detachStoreListeners(this.store);
            this.releaseOptionsFilter(this.store)
        }
        super.destroy(...args)
    }
}

export default Neo.setupClass(ValuePicker);
