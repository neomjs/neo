import ClassSystemUtil  from '../../util/ClassSystem.mjs';
import ComponentManager from '../../manager/Component.mjs';
import List             from '../../list/Base.mjs';
import Picker           from './Picker.mjs';
import Store            from '../../data/Store.mjs';
import VDomUtil         from '../../util/VDom.mjs';
import { buffer }       from '../../util/Function.mjs';
/**
 * Provides a dropdown list to select one or multiple items.
 *
 * Conforms to ARIA accessiblity standards outlines in https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 * @class Neo.form.field.Select
 * @extends Neo.form.field.Picker
 */
class Select extends Picker {
    /**
     * Valid values for triggerAction
     * @member {String[]} triggerActions=['all','filtered']
     * @protected
     * @static
     */
    static triggerActions = ['all', 'filtered']

    static config = {
        /**
         * @member {String} className='Neo.form.field.Select'
         * @protected
         */
        className: 'Neo.form.field.Select',
        /**
         * @member {String} ntype='selectfield'
         * @protected
         */
        ntype: 'selectfield',
        /**
         * @member {String[]} baseCls=['neo-selectfield','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-selectfield', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * @member {String} filterOperator_='like'
         */
        filterOperator_: 'like',
        /**
         * True will only fire a change event, in case the TextField input value matches a record.
         * onFocusLeave() will try to select a hint record, if needed and possible.
         * @member {Boolean} forceSelection=false
         */
        forceSelection: false,
        /**
         * @member {String|Number|null} activeRecordId=null
         */
        activeRecordId: null,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            Down  : 'onKeyDownDown',
            Escape: 'onKeyDownEscape'
        },
        /**
         * @member {String|null} lastManualInput=null
         * @protected
         */
        lastManualInput: null,
        /**
         * @member {Neo.list.Base} list=null
         * @protected
         */
        list: null,
        /**
         * @member {Object|null} listConfig_=null
         */
        listConfig_: null,
        /**
         * The height of the picker container. Defaults to px.
         * @member {Number|null} pickerHeight=null
         */
        pickerHeight: null,
        /**
         * @member {Object} record_=null
         * @protected
         */
        record_: null,
        /**
         * @member {String|null} role='combobox'
         */
        role: 'combobox',
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * Showing the list via the down trigger can either show all list items or only show items which
         * match the filter string inside the input field.
         * Valid values: all, filtered
         * @member {String} triggerAction_='all'
         */
        triggerAction_: 'all',
        /**
         * Display the first matching result while typing
         * @member {Boolean} typeAhead_=true
         */
        typeAhead_: true,
        /**
         * Set this config to false, in case typing into the input field should not filter list items
         * @member {Boolean} useFilter_=true
         */
        useFilter_: true,
        /**
         * This config should point to the store keyProperty or a different model field,
         * which you want to submit instead
         * @member {Number|String} valueField='id'
         */
        valueField: 'id',
        /**
         * The millisecond time to delay between input field mutation and applying the input field's
         * new value to the filter
         * @member {Number} filterDelay=300
         */
        filterDelay : 300
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // Create buffered function to respond to input field mutation
        this.filterOnInput = buffer(this.filterOnInput, this, this.filterDelay);

        this.typeAhead && this.updateTypeAhead()
    }

    /**
     * Triggered after the record config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetRecord(value) {
        if (this._picker?.isVisible) {
            let me             = this,
                selectionModel = me.list?.selectionModel;

            if (value) {
                selectionModel?.select(value);
            }
            else {
                selectionModel.deselectAll();
            }
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this,
            filters;

        if (value) {
            if (me.useFilter) {
                filters = value.filters || [];

                filters.push({
                    includeEmptyValues: true,
                    operator          : me.filterOperator,
                    property          : me.displayField,
                    value             : value.get(me.value)?.[me.displayField] || me.value
                });

                value.filters = filters
            }

            if (me.list) {
                me.list.store = value
            }

            value.on('load', me.onStoreLoad, me)
        }
    }

    /**
     * Triggered after the typeAhead config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetTypeAhead(value, oldValue) {
        this.rendered && this.updateTypeAhead()
    }

    /**
     * Triggered before the listConfig config gets changed.
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetListConfig(value, oldValue) {
        value && this.parseItemConfigs(value);
        return value
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();

        // to reduce boilerplate code, a store config object without a defined model should default
        // to displayField & valueField defaults
        if (Neo.typeOf(value) === 'Object' && !value.model && !value.module && !value.ntype) {
            value.model = {
                fields: [
                    {name: 'id',   type: 'String'},
                    {name: 'name', type: 'String'}
                ]
            }
        }

        return ClassSystemUtil.beforeSetInstance(value, Store)
    }

    /**
     * Triggered before the triggerAction config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTriggerAction(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'triggerAction')
    }

    /**
     * Triggered before the value config gets changed.
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @returns {Number|String|null}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me           = this,
            displayField = me.displayField,
            store        = me.store,
            record;

        if (Neo.isObject(value)) {
            me.record = value;
            return value[displayField];
        } else {
            record = store.isFiltered() ? store.allItems.get(value) : store.get(value);

            if (record) {
                me.record = record;
                return record[displayField];
            }
        }

        me.record = store.find(displayField, value)[0] || null;

        return value
    }

    /**
     * @returns {Neo.list.Base}
     */
    createPickerComponent() {
        const me = this;

        me.list = Neo.create({
            module          : List,
            appName         : me.appName,
            displayField    : me.displayField,
            role            : 'listbox',
            itemRole        : 'option',
            parentId        : me.id,
            navigator       : {
                eventSource : me.getInputElId()
            },
            selectionModel  : {stayInList: false},
            store           : me.store,
            ...me.listConfig
        });
        me.getInputEl()['aria-controls'] = me.list.id;

        me.list.addDomListeners({
            neonavigate: {
                fn    : me.onListItemNavigate,
                scope : me
            }
        });
        me.list.selectionModel.on({
            selectionChange : me.onListItemSelectionChange,
            noChange        : me.onListItemSelectionNoChange,
            scope           : me
        })

        return me.list;
    }

    /**
     * Overrides form.field.Base
     * @param {*} value
     * @param {*} oldValue
     * @override
     */
    fireChangeEvent(value, oldValue) {
        let me            = this,
            FormContainer = Neo.form?.Container,
            record        = me.record,
            oldRecord, params;

        if (!(me.forceSelection && !record)) {
            oldRecord = me.store.get(oldValue) || null;

            params = {
                component: me,
                oldRecord,
                oldValue,
                record,
                value
            };

            me.fire('change', params);

            if (!me.suspendEvents) {
                ComponentManager.getParents(me).forEach(parent => {
                    if (FormContainer && parent instanceof FormContainer) {
                        parent.fire('fieldChange', params)
                    }
                })
            }
        }
    }

    /**
     * @returns {Object}
     */
    getInputHintEl() {
        return VDomUtil.findVdomChild(this.vdom, this.getInputHintId())?.vdom
    }

    /**
     * @returns {String}
     */
    getInputHintId() {
        return this.id + '__input-hint'
    }

    /**
     * Returns the first selected record or null
     * returns {Object}
     */
    getRecord() {
        let list      = this.list,
            recordKey = list.selectionModel.getSelection()[0];

        return recordKey && this.store.get(list.getItemRecordId(recordKey)) || null
    }

    /**
     * @returns {Number|String}
     */
    getValue() {
        let me = this;

        return me.record?.[me.valueField] || me.value
    }

    onConstructed() {
        const inputEl = this.getInputEl();

        inputEl['aria-expanded'] = false
        inputEl['aria-haspopup'] = 'listbox'
        inputEl['aria-activedescendant'] = ''
        super.onConstructed(...arguments);
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        let me = this;

        if (!me.record) {
            if (me.forceSelection) {
                me.value = me.forceSelection ? me.activeRecordId : null;
            }
            // If we exit without selecting a record, clear the filter input value.
            else {
                me.getInputEl().value = '';
            }
        }

        // Clear any typeahead hint
        me.updateTypeAheadValue('');

        // The VDOM must not carry the empty string permanently. Only while clearing the value.
        if (!me.record && !me.forceSelection) {
            delete me.getInputEl().value;
        }

        super.onFocusLeave(data)
    }

    filterOnInput(data) {
        if (data.value) {
            this.doFilter(data.value);
        }
        else if (this.picker) {
            this.picker?.hide();
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange(data) {
        // We do not call super here. The value of the Select is *not* connected to the value
        // typed into the input area. The input area is just a filter value to filter the list.
        this.lastManualInput = data.value
        this.filterOnInput(data);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownDown(data) {
        if (!this.picker || this.picker?.hidden) {
            this.onPickerTriggerClick();
        }
    }

    onPickerHiddenChange({ value }) {
        const inputEl = this.getInputEl();

        super.onPickerHiddenChange(...arguments);
        if (value) {
            inputEl['aria-activedescendant'] = '';
        }
        inputEl['aria-expanded'] = !value;
        this.update();
    }

    // TODO:
    // When we are using a `Collection` as our `valueCollection`, and that `Collection` is the
    // `items` of the List's `selectionModel`, then this will be `onValueCollectionChange`,
    // a `mutate` listener on our own `valueCollection` which backs our `value` field which
    // will be implemented by a getter which accesses `valueCollection`.
    // This will become important for implementing multiSelect
    /**
     * @param {Object} selectionChangeEvent
     * @param {Object[]} selectionChangeEvent.selection
     * @protected
     */
    onListItemSelectionChange({ selection }) {
        if (selection?.length) {
            const
                me           = this,
                oldValue     = me.value,
                selected     = selection[0],
                record       = typeof selected === 'string' ? me.store.get(me.list.getItemRecordId(selected)) : selected,
                value        = record[me.displayField];

            me.hidePicker();
            me.hintRecordId = null;
            me.record       = record;
            me._value       = value;
            me.getInputHintEl().value = null;

            me.afterSetValue(value, oldValue, true); // prevent the list from getting filtered

            me.fire('select', {
                record,
                value
            })
        }
    }

    /**
     * Selection was attempted to be changed but resulted in no action.
     * For example clicking on already selected list item.
     */
    onListItemSelectionNoChange() {
        this.hidePicker();
    }

    /**
     * @param {Object} record
     * @protected
     */
    onListItemNavigate({ activeItem, activeIndex }) {
        if (activeIndex >= 0) {
            const
                me        = this,
                { store } = me;

            me.activeRecord = store.getAt(activeIndex)
            me.activeRecordId = me.activeRecord[store.keyProperty || model.keyProperty]
            me.getInputEl()['aria-activedescendant'] = activeItem;

            // Update typeahead hint (which updates DOM), or update DOM
            me.typeAhead ? me.updateTypeAheadValue(me.lastManualInput) : me.update();
        }
    }

    /**
     * Selecting a record, if required
     * @param {Object[]} items
     */
    onStoreLoad(items) {
        let me    = this,
            value = me.value;

        if (value) {
            me._value = null; // silent update
            me.value  = value
        }
    }

    /**
     *
     */
    selectFirstListItem() {
        this.selectListItem(0)
    }

    /**
     *
     */
    selectLastListItem() {
        this.selectListItem(this.store.getCount() -1)
    }

    /**
     * If no index is passed, the index matching to the field input will get used (0 if none)
     * @param {Number} [index]
     */
    selectListItem(index) {
        let me = this;

        if (!Neo.isNumber(index)) {
            if (me.activeRecordId) {
                index = me.store.indexOfKey(me.activeRecordId);
            } else {
                index = 0;
            }
        }

        me.list.selectItem(index);
    }

    onPickerTriggerClick() {
        let me = this;

        if (me.picker?.isVisible) {
            me.picker.hidden = true;
        }
        else if (!me.readOnly && !me.disabled) {
            me.doFilter(null)
        }
    }

    /**
     * All routes which expect to open the picker route through here. This updates the
     * filter and ensures that the picker is visible and reflecting the state of the filter.
     *
     * Input event processing passes the current input field value in as the filter value.
     *
     * Invocation of the expand trigger passes `null` so as to clear filtering.
     * @private
     * @param {String}null} value The value to filter the picker by
     */
    doFilter(value) {
        let me     = this,
            filter = me.store.getFilter(me.displayField),
            {
                record,
                picker
            }      = me;

        if (filter) {
            filter.value = value;
        }

        // Filter resulting in something to show
        if (me.store.getCount()) {
            me.getPicker().hidden = false;

            // List might not exist until the picker is created
            const
                { list }           = me,
                { selectionModel } = list;

            // On show, set the active item to be the current selected record or the first
            if (record) {
                // We do not want to hear back about our own selection
                selectionModel.suspendEvents = true;
                selectionModel.select(record);
                selectionModel.suspendEvents = false;
            }
            setTimeout(() => {
                list.activeIndex = me.record || 0;
            }, 100)
        }
        // Filtered down to nothing - hide picker if it has been created.
        else if (picker) {
            picker._hidden = true;
        }
    }

    /**
     * @param {Boolean} [silent=false]
     * @protected
     */
    updateTypeAhead(silent=false) {
        let me      = this,
            inputEl = VDomUtil.findVdomChild(me.vdom, {flag: 'neo-real-input'}),
            vdom    = me.vdom;

        if (me.typeAhead) {
            inputEl.parentNode.cn[inputEl.index] = {
                tag: 'span',
                cls: ['neo-input-field-wrapper'],
                cn : [{
                    tag         : 'input',
                    autocomplete: 'off',
                    autocorrect : 'off',
                    cls         : ['neo-textfield-input', 'neo-typeahead-input'],
                    disabled    : true,
                    id          : me.getInputHintId(),
                    spellcheck  : 'false'
                }, inputEl.vdom]
            }
        } else {
            VDomUtil.replaceVdomChild(vdom, inputEl.parentNode.id, inputEl.vdom)
        }

        !silent && me.update()
    }

    /**
     * @param {String|null} [value=this.lastManualInput]
     * @param {Boolean} [silent=false]
     * @protected
     */
    updateTypeAheadValue(value=this.lastManualInput, silent=false) {
        let me          = this,
            match       = false,
            {
                store,
                displayField
            }
                        = me,
            inputHintEl = me.getInputHintEl();

        if (!me.record && value?.length > 0) {
            const search = value.toLocaleLowerCase();
            match = store.items.find(r => r[displayField]?.toLowerCase?.()?.startsWith(search));

            if (match && inputHintEl) {
                inputHintEl.value = value + match[displayField].substr(value.length);
                me.activeRecord = match;
                me.activeRecordId = match[store.keyProperty || store.model.keyProperty]
            }
        }

        if (!match && inputHintEl) {
            inputHintEl.value = me.activeRecord = me.activeRecordId = null;
        }

        !silent && me.update()
    }
}

/**
 * The select event fires when a list item gets selected
 * @event select
 * @param {Object} record
 * @param {value} record[store.keyProperty]
 * @returns {Object}
 */

Neo.applyClassConfig(Select);

export default Select;
