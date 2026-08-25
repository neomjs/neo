import VDomUtil  from '../../util/VDom.mjs';
import ComboBox  from './ComboBox.mjs';
import Text      from './Text.mjs';
import ValueList from './chip/ValueList.mjs';

/**
 * @summary An array-valued ComboBox whose selected Store records render as removable chips.
 *
 * The field's record array is canonical. Picker interactions update that value and then mirror it
 * through the multi-selection model; {@link Neo.form.field.chip.ValueList} is only a `list.Chip`
 * projection over those same records. Typing keeps ComboBox filtering, while native close buttons
 * and Backspace remove members through the same value path.
 *
 * @class Neo.form.field.Chip
 * @extends Neo.form.field.ComboBox
 */
class Chip extends ComboBox {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Chip'
         * @protected
         */
        className: 'Neo.form.field.Chip',
        /**
         * @member {String} ntype='chipfield'
         * @protected
         */
        ntype: 'chipfield',
        /**
         * @member {String[]} baseCls=['neo-chipfield','neo-combobox','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-chipfield', 'neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        /**
         * Additional input-field key handlers.
         * @member {Object} keys
         */
        keys: {
            Backspace: 'onKeyDownBackspace',
            Down     : 'onKeyDownDown',
            Escape   : 'onKeyDownEscape'
        },
        /**
         * Multi-select picker defaults. Consumers may hide checkboxes, but cannot turn the value
         * model back into single-select.
         * @member {Object} listConfig
         */
        listConfig: {
            autoDestroyStore: false,
            useCheckBoxes   : true,
            selectionModel  : {
                singleSelect : false,
                stayInList   : false,
                toggleOnClick: true
            }
        },
        /**
         * Type-ahead's single suggestion has no truthful meaning for an array value. Filtering stays.
         * @member {Boolean} typeAhead=false
         */
        typeAhead: false,
        /**
         * Selected Store records. Scalar inputs are promoted, but the stored/public contract is array.
         * @member {Object[]} value=[]
         * @reactive
         */
        value: [],
        /**
         * Selected-value chip projection.
         * @member {Neo.form.field.chip.ValueList|null} valueList=null
         * @protected
         */
        valueList: null
    }

    /**
     * Store keys captured before an owned Store replacement, re-resolved after the new
     * Store is installed so old record instances never survive invisibly.
     * @member {Array|null} storeReplacementKeys=null
     * @protected
     */
    storeReplacementKeys = null

    /**
     * Allows the terminal Store-load callback to resolve against the records that emitted it even
     * when fallback loading flips `isLoaded` immediately after the event.
     * @member {Boolean} resolvingStoreLoadValue=false
     * @protected
     */
    resolvingStoreLoadValue = false

    /**
     * Identity token for a deferred terminal-load replay. Any newer explicit value write cancels it.
     * @member {Object|null} storeLoadReplayToken=null
     * @protected
     */
    storeLoadReplayToken = null

    /**
     * @summary Compares submitted arrays against the original selection in its accepted input shapes.
     * @returns {Boolean}
     */
    get isDirty() {
        let me       = this,
            original = me.originalConfig.value,
            values   = original === null || original === undefined
                ? []
                : Array.isArray(original) ? original : [original],
            source   = me.store?.allItems || me.store;

        const normalized = values.map(item => {
            const record = me.resolveValueRecord(item, source);

            if (record) {
                return record[me.valueField]
            }

            if (Neo.isObject(item)) {
                return item[me.valueField] ?? item[me.store?.getKeyProperty()]
            }

            return item
        });

        return !Neo.isEqual(me.getSubmitValue(), normalized)
    }

    /**
     * @summary Creates and embeds the selected-value projection over the field-owned Store.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.valueList = Neo.create(ValueList, {
            appName     : me.appName,
            displayField: me.displayField,
            id          : `${me.id}-value-list`,
            parentId    : me.id,
            removable   : !me.disabled && !me.readOnly,
            selectedKeys: me.getValueKeys(),
            store       : me.store,
            windowId    : me.windowId
        });

        me.valueList.on('removevalue', me.onValueRemove, me);
        me.insertValueListVdom()
    }

    /**
     * @summary Keeps the chip projection on the same application identity.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);
        this.valueList && (this.valueList.appName = value)
    }

    /**
     * @summary Disables chip removal with the field.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);
        this.syncValueListRemovable()
    }

    /**
     * @summary Disables chip removal while the field is read-only.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetReadOnly(value, oldValue) {
        super.afterSetReadOnly(value, oldValue);
        this.syncValueListRemovable()
    }

    /**
     * @summary Keeps the selected-value projection on the field-owned Store instance.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);

        value?.on('mutate', this.onValueStoreMutate, this);

        if (this.valueList) {
            this.valueList.store = value;
        }

        if (oldValue && this.storeReplacementKeys) {
            const keys = this.storeReplacementKeys;

            this.storeReplacementKeys = null;
            this.value = keys
        } else {
            this.syncValueList()
        }
    }

    /**
     * @summary Re-inserts the chip projection if a dynamic trigger change rebuilds the input wrapper.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetTriggers(value, oldValue) {
        super.afterSetTriggers(value, oldValue);
        this.valueList && this.insertValueListVdom()
    }

    /**
     * @summary Synchronizes picker membership and the selected-value projection after every value change.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        // ComboBox's scalar hook selects into a visible picker before returning. On a multi-select
        // model that operation ADDS the new array to the old selection and emits an intermediate
        // selectionChange. Run the Text-field half directly, then replace picker membership once.
        me.programmaticValueChange = true;
        Text.prototype.afterSetValue.call(me, value, oldValue);
        me.programmaticValueChange = false;

        me.syncPickerSelection(value);
        me.syncValueList(value)
    }

    /**
     * @summary Keeps the selected-value projection in the same window realm.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        this.valueList && (this.valueList.windowId = value)
    }

    /**
     * @summary Enforces the field's multi-select picker contract while preserving consumer presentation config.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetListConfig(value, oldValue) {
        value = super.beforeSetListConfig(value || {}, oldValue) || {};

        return {
            autoDestroyStore: false,
            useCheckBoxes   : true,
            ...value,
            selectionModel: {
                stayInList: false,
                ...(value.selectionModel || {}),
                singleSelect : false,
                toggleOnClick: true
            }
        }
    }

    /**
     * @summary Detaches the shared value projection before ComboBox destroys an owned replacement Store.
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            me.storeReplacementKeys = me.getValueKeys(me.value, oldValue);

            oldValue.un('load', me.onStoreLoad, me);
            oldValue.un('mutate', me.onValueStoreMutate, me);

            if (me.list?.store === oldValue) {
                me.detachPickerStore(me.list, oldValue);
                me.list._store = null
            }

            if (me.valueList?.store === oldValue) {
                me.valueList.store = null
            }
        }

        return super.beforeSetStore(value, oldValue)
    }

    /**
     * @summary Normalizes ids, record objects, or scalar compatibility input into a unique Store-record array.
     * @param {Array|Number|Object|String|null} value
     * @param {Object[]} oldValue
     * @returns {Object[]}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me      = this,
            values  = value === null ? [] : Array.isArray(value) ? value : [value],
            {store} = me;

        !me.resolvingStoreLoadValue && (me.storeLoadReplayToken = null);

        if (!values.length) {
            me.preStoreLoadValue = null;
            return []
        }

        if (!store || (!store.isLoaded && !me.resolvingStoreLoadValue)) {
            me.preStoreLoadValue = values;
            return []
        }

        const
            source  = store.allItems || store,
            seen    = new Set(),
            records = [];

        values.forEach(item => {
            const record = me.resolveValueRecord(item, source);

            if (record) {
                const key = store.getKey(record);

                if (!seen.has(key)) {
                    seen.add(key);
                    records.push(record)
                }
            }
        });

        return records
    }

    /**
     * @summary Creates the picker, then aligns its multi-selection with the current field value.
     * @returns {Neo.list.Base}
     */
    createPickerComponent() {
        const list = super.createPickerComponent();

        list.getVdomRoot()['aria-multiselectable'] = true;
        this.syncPickerSelection(this.value);

        return list
    }

    /**
     * @summary Destroys the field-owned projection; its shared Store survives until ComboBox teardown.
     */
    destroy(...args) {
        let me          = this,
            store       = me.store,
            {valueList} = me;

        if (store) {
            store.un('load', me.onStoreLoad, me);
            store.un('mutate', me.onValueStoreMutate, me);

            me.list && me.detachPickerStore(me.list, store)
        }

        valueList?.un('removevalue', me.onValueRemove, me);
        valueList?.destroy();
        me.valueList = null;

        super.destroy(...args);

        !store?.isDestroyed && store?.destroy()
    }

    /**
     * @summary Detaches the picker list's inherited listeners from a shared/replaced Store.
     * @param {Neo.list.Base} list
     * @param {Neo.data.Store} store
     * @protected
     */
    detachPickerStore(list, store) {
        store.un({
            filter      : 'onStoreFilter',
            load        : 'onStoreLoad',
            recordChange: 'onStoreRecordChange',
            sort        : 'onStoreSort',
            scope       : list
        })
    }

    /**
     * @summary Returns selected records as a defensive array copy.
     * @returns {Object[]}
     */
    getRecords() {
        return [...(this.value || [])]
    }

    /**
     * @summary Returns the Store keys backing the selected-value projection.
     * @param {Object[]} value=this.value
     * @param {Neo.data.Store|null} store=this.store
     * @returns {Array}
     */
    getValueKeys(value=this.value, store=this.store) {
        return store ? (value || []).map(record => store.getKey(record)) : []
    }

    /**
     * @summary Submits one value-field entry per selected record.
     * @returns {Array}
     */
    getSubmitValue() {
        let me = this;

        return (me.value || []).map(record => record[me.valueField])
    }

    /**
     * @summary Selected chips count as field content even when the filter input is empty.
     * @returns {Boolean}
     */
    hasContent() {
        return this.value?.length > 0 || super.hasContent()
    }

    /**
     * @summary Inserts the chip-list component reference immediately before the real input.
     * @protected
     */
    insertValueListVdom() {
        let me      = this,
            wrapper = VDomUtil.find(me.vdom, {id: me.getInputWrapperId()})?.vdom,
            reference, inputIndex;

        if (!wrapper || wrapper.cn.some(item => item.id === me.valueList.id)) {
            return
        }

        reference  = me.valueList.createVdomReference();
        inputIndex = wrapper.cn.findIndex(item => item.flag === 'neo-real-input' || VDomUtil.find(item, {flag: 'neo-real-input'}));

        wrapper.cn.splice(inputIndex < 0 ? 0 : inputIndex, 0, reference)
    }

    /**
     * @summary Backspace removes the last chip only when the text input is empty.
     * @param {Object} data
     * @protected
     */
    onKeyDownBackspace(data) {
        let me    = this,
            value = me.value || [];

        if (!me.disabled && !me.readOnly && !me.inputValue && value.length) {
            me.value = value.slice(0, -1);
            data.cancelBubble = true;

            return false
        }
    }

    /**
     * @summary Converts the picker selection into the field's record-array value without hiding the picker.
     * @param {Object} selectionChangeEvent
     * @param {Array} selectionChangeEvent.selection
     * @protected
     */
    async onListItemSelectionChange({selection=[]}) {
        let me            = this,
            {list, store} = me,
            source        = store.allItems || store,
            records       = selection.map(item => {
                if (Neo.isRecord(item)) {
                    return item
                }

                const key = typeof item === 'string' ? list.getItemRecordId(item) : item;

                return source.get(key)
            }).filter(Boolean),
            filter = store.getFilter(me.displayField);

        me.hintRecordId = null;
        me.value        = records;

        // A committed selection starts the next search from a clean input and full option set.
        me.programmaticValueChange = true;
        me.inputValue              = null;
        me.programmaticValueChange = false;

        filter && (filter.value = null);

        me.fire('select', {
            value: records
        })
    }

    /**
     * @summary A no-op re-selection must not close a multi-select picker.
     * @protected
     */
    onListItemSelectionNoChange() {}

    /**
     * @summary Consumes a pending pre-load value exactly once so later Store loads/sorts cannot replay it.
     * @param {Object} data
     * @param {Boolean} [data.isLoading]
     * @protected
     */
    onStoreLoad(data) {
        let me      = this,
            pending = me.preStoreLoadValue;

        if (pending !== null && !data?.isLoading) {
            const token = {};

            me.preStoreLoadValue   = null;
            me.storeLoadReplayToken = token;

            me.trap(Promise.resolve()).then(() => {
                if (me.storeLoadReplayToken === token) {
                    me.storeLoadReplayToken = null;
                    me._value               = undefined;
                    me.resolvingStoreLoadValue = true;

                    try {
                        me.value = pending
                    } finally {
                        me.resolvingStoreLoadValue = false
                    }
                }
            })
        }
    }

    /**
     * @summary Removes one record by Store key.
     * @param {Object} data
     * @param {*} data.value
     * @protected
     */
    onValueRemove({value}) {
        if (!this.disabled && !this.readOnly) {
            this.value = (this.value || []).filter(record => this.store.getKey(record) !== value)
        }
    }

    /**
     * @summary Reconciles selected record identities after Store replacement/removal mutations.
     * @protected
     */
    onValueStoreMutate() {
        let me      = this,
            source  = me.store?.allItems || me.store,
            current = me.value || [],
            next    = current.map(record => source?.get(me.store.getKey(record))).filter(Boolean),
            changed = next.length !== current.length || next.some((record, index) => record !== current[index]);

        if (changed) {
            me.value = next
        } else {
            me.syncValueList(current)
        }
    }

    /**
     * @summary Resolves one accepted value input through the Store's canonical key domain first.
     * @param {*} item
     * @param {Neo.collection.Base|Neo.data.Store} [source=this.store.allItems||this.store]
     * @returns {Neo.data.Model|null}
     * @protected
     */
    resolveValueRecord(item, source=this.store?.allItems || this.store) {
        let me          = this,
            {store}     = me,
            keyProperty = store?.getKeyProperty(),
            isFullShape = Neo.isRecord(item) || Neo.isObject(item),
            lookup      = isFullShape ? store?.getKey(item) : item,
            items       = source?.items || [],
            findByKey   = key => key === undefined ? null : source?.get(key)
                || items.find(candidate => store.getKey(candidate) === key)
                || null,
            record      = Neo.isRecord(item) && items.includes(item) ? item : findByKey(lookup),
            canonical;

        if (!record && lookup !== undefined) {
            canonical = store?.getCanonicalKey(lookup);
            record    = findByKey(canonical)
        }

        if (!record && Neo.isObject(item) && lookup === undefined) {
            lookup    = item[me.valueField] ?? item[me.displayField];
            record    = findByKey(lookup);
            canonical = record || lookup === undefined ? undefined : store?.getCanonicalKey(lookup);
            record  ||= findByKey(canonical)
        }

        if (!record && me.valueField !== keyProperty) {
            record = source?.find(me.valueField, lookup)[0] || null
        }

        if (!record && me.displayField !== me.valueField) {
            record = source?.find(me.displayField, lookup)[0] || null
        }

        return record
    }

    /**
     * @summary Resets to an array value; `null` means an empty selection.
     * @param {Array|Number|Object|String|null} value=[]
     */
    reset(value=[]) {
        super.reset(value === null ? [] : value)
    }

    /**
     * @summary Aligns the picker model to the exact field value without creating a feedback event.
     * @param {Object[]} value=this.value
     * @protected
     */
    syncPickerSelection(value=this.value) {
        const model = this.list?.selectionModel;

        if (model) {
            model.suspendEvents = true;

            try {
                model.deselectAll(true);
                value?.length && model.select(value)
            } finally {
                model.suspendEvents = false
            }
        }
    }

    /**
     * @summary Writes one selected-key array into the Store-backed chip projection.
     * @param {Object[]} value=this.value
     * @protected
     */
    syncValueList(value=this.value) {
        this.valueList && (this.valueList.selectedKeys = this.getValueKeys(value))
    }

    /**
     * @summary Mirrors field mutability onto every native chip remove button.
     * @protected
     */
    syncValueListRemovable() {
        this.valueList && (this.valueList.removable = !this.disabled && !this.readOnly)
    }

    /**
     * @summary Selection arrays do not render as text; their records render through the chip projection.
     * @param {Object[]} value
     * @protected
     */
    updateInputValueFromValue(value) {
        this.inputValue = null
    }

    /**
     * @summary Typing filters picker options without clearing the existing selection.
     * @param {String|null} inputValue
     * @protected
     */
    updateValueFromInputValue(inputValue) {
        let me = this;

        me.lastManualInput = inputValue;

        if (!me.programmaticValueChange) {
            me.filterOnInput(inputValue)
        }
    }
}

/**
 * The select event fires with the complete selected-record array after picker membership changes.
 * @event select
 * @param {Object[]} value
 */

export default Neo.setupClass(Chip);
