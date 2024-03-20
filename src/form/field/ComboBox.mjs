import { buffer }       from '../../util/Function.mjs';
import ClassSystemUtil  from '../../util/ClassSystem.mjs';
import ComponentManager from '../../manager/Component.mjs';
import List             from '../../list/Base.mjs';
import Picker           from './Picker.mjs';
import Store            from '../../data/Store.mjs';
import VDomUtil         from '../../util/VDom.mjs';

/**
 * Provides a dropdown list to select one or multiple items.
 *
 * Conforms to ARIA accessibility standards outlines in https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 * @class Neo.form.field.ComboBox
 * @extends Neo.form.field.Picker
 */
class ComboBox extends Picker {
    /**
     * Valid values for triggerAction
     * @member {String[]} triggerActions=['all','filtered']
     * @protected
     * @static
     */
    static triggerActions = ['all', 'filtered']

    static config = {
        /**
         * @member {String} className='Neo.form.field.ComboBox'
         * @protected
         */
        className: 'Neo.form.field.ComboBox',
        /**
         * @member {String} ntype='combobox'
         * @protected
         */
        ntype: 'combobox',
        /**
         * @member {String|Number|null} activeRecordId=null
         */
        activeRecordId: null,
        /**
         * @member {String[]} baseCls=['neo-combobox','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * The millisecond time to delay between input field mutation and applying the input field's
         * new value to the filter
         * @member {Number} filterDelay=300
         */
        filterDelay : 300,
        /**
         * @member {String} filterOperator_='like'
         */
        filterOperator_: 'like',
        /**
         * True will only fire a change event, in case the TextField input value matches a record.
         * onFocusLeave() will try to select a hint record, if needed and possible.
         * @member {Boolean} forceSelection=true
         */
        forceSelection: true,
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
        valueField: 'id'
    }

    /**
     * Internal flag to store the value, in case it was set before the store was loaded
     * @member {Number|String} preStoreLoadValue=null
     */
    preStoreLoadValue = null
    /**
     * Internal flag to not show a picker when non user-based input value changes happen
     * @member {Boolean} programmaticValueChange=false
     */
    programmaticValueChange = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Create buffered function to respond to input field mutation
        //me.filterOnInput = buffer(me.filterOnInput, me, me.filterDelay);

        me.typeAhead && me.updateTypeAhead()
    }

    /**
     * Triggered after the inputValue config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetInputValue(value, oldValue) {
        super.afterSetInputValue(value, oldValue);
        this.updateTypeAheadValue(value);
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
                    value             : value?.[me.displayField] || null
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
     * Triggered after the value config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);

        let me = this;

        me.programmaticValueChange = false;

        if (me._picker?.isVisible) {
            let selectionModel = me.list?.selectionModel;

            if (value) {
                oldValue && selectionModel?.deselect(oldValue);
                selectionModel?.select(value)
            } else {
                selectionModel.deselectAll()
            }
        }
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
        const
            me                          = this,
            { valueField, displayField} = me;

        oldValue?.destroy();

        // Promote an array of items to be a Store
        if (Array.isArray(value)) {
            value = {
                data : value.map((v, i) => {
                    // Simplest case is just picking string values.
                    if (typeof v === 'string') {
                        v = {
                            [valueField]  : v,
                            [displayField]: v
                        }
                    }

                    return v
                })
            }
        }

        // to reduce boilerplate code, a store config object without a defined model should default
        // to displayField & valueField defaults
        if (Neo.typeOf(value) === 'Object' && !value.model && !value.module && !value.ntype) {
            value.model = {
                fields: [
                    {name: valueField,   type: 'String'},
                    {name: displayField, type: 'String'}
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
     * @param {Number|Object|String} value
     * @param {Number|Object|String} oldValue
     * @returns {Number|Object|String}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me           = this,
            displayField = me.displayField,
            store        = me.store,
            record;

        me.programmaticValueChange = true;

        // getting a record, nothing to do
        if (Neo.isObject(value)) {
            return value
        }

        if (value === null) {
            return null
        }

        // we can only match record ids or display values in case the store is loaded
        if (store.getCount() > 0) {
            record = store.isFiltered() ? store.allItems.get(value) : store.get(value);

            if (record) {
                return record
            }

            return store.find(displayField, value)[0] || null
        } else {
            // store not loaded yet
            me.preStoreLoadValue = value;
            return null
        }
    }

    /**
     * @returns {Neo.list.Base}
     */
    createPickerComponent() {
        const me = this;

        me.list = Neo.create({
            module        : List,
            appName       : me.appName,
            displayField  : me.displayField,
            itemRole      : 'option',
            itemsFocusable: false,
            navigator     : {eventSource: me.getInputElId()},
            parentId      : me.id,
            role          : 'listbox',
            selectionModel: {stayInList: false},
            store         : me.store,
            ...me.listConfig
        });

        me.getInputEl()['aria-controls'] = me.list.id;

        me.list.addDomListeners({
            neonavigate: {
                fn   : me.onListItemNavigate,
                scope: me
            }
        });

        me.list.selectionModel.on({
            noChange       : me.onListItemSelectionNoChange,
            selectionChange: me.onListItemSelectionChange,
            scope          : me
        });

        return me.list
    }

    /**
     * All routes which expect to open the picker route through here. This updates the
     * filter and ensures that the picker is visible and reflecting the state of the filter.
     *
     * Input event processing passes the current input field value in as the filter value.
     *
     * Invocation of the expand trigger passes `null` so as to clear filtering.
     * @private
     * @param {String|null} value The value to filter the picker by
     */
    doFilter(value) {
        let me     = this,
            store  = me.store,
            filter = store.getFilter(me.displayField),
            picker = me.picker,
            record = me.value;

        if (filter) {
            filter.value = value
        }

        // Filter resulting in something to show
        if (store.getCount()) {
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
                selectionModel.suspendEvents = false
            }
            setTimeout(() => {
                const index = store.indexOf(record);
                list._focusIndex = -1; // silent update to ensure afterSetFocusIndex() always gets called
                list.focusIndex  = index > -1 ? index : 0
            }, 100)
        }
        // Filtered down to nothing - hide picker if it has been created.
        else {
            picker?.hide()
        }
    }

    /**
     * @param {String} value
     */
    filterOnInput(value) {
        if (value) {
            this.doFilter(value)
        } else {
            this.picker?.hide()
        }
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
            params;

        if (!(me.forceSelection && !value)) {
            params = {component: me, oldValue, value};

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
     * @returns {Object}
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

        return me.value?.[me.valueField] || me.emptyValue
    }

    /**
     *
     */
    onConstructed() {
        const inputEl = this.getInputEl();

        inputEl['aria-activedescendant'] = '';
        inputEl['aria-expanded']         = false;
        inputEl['aria-haspopup']         = 'listbox';

        super.onConstructed(...arguments)
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        let me = this;

        if (me.forceSelection && !me.value) {
            me.programmaticValueChange = true;
            me.value                   = me.store.get(me.activeRecordId);
            me.programmaticValueChange = false;
        }

        me.updateTypeAheadValue(null);

        super.onFocusLeave(data)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownDown(data) {
        let me = this;

        if (!me.picker || me.picker?.hidden) {
            me.onPickerTriggerClick()
        }
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
    async onListItemSelectionChange({ selection }) {
        if (selection?.length) {
            const
                me       = this,
                selected = selection[0],
                record   = typeof selected === 'string' ? me.store.get(me.list.getItemRecordId(selected)) : selected;

            me.hintRecordId = null;

            me.updateTypeAheadValue(null, true);

            me.preventFiltering = true;
            me.value            = record;
            me.preventFiltering = false;

            me.fire('select', {
                value: record
            });

            // Short delay to let selection DOM updates get applied.
            // Alternatively, we could hide the picker before the selection happen and limit updates to the vdom.
            await me.timeout(20);

            await me.hidePicker()
        }
    }

    /**
     * Selection was attempted to be changed but resulted in no action.
     * For example clicking on already selected list item.
     */
    onListItemSelectionNoChange() {
        this.hidePicker()
    }

    /**
     * @param {Object} record
     * @protected
     */
    onListItemNavigate(record) {
        let {activeItem, activeIndex} = record;

        if (activeIndex >= 0) {
            const
                me        = this,
                { store } = me;

            me.activeRecord   = store.getAt(activeIndex);
            me.activeRecordId = me.activeRecord[store.keyProperty || model.keyProperty];

            // Update typeahead hint (which updates DOM), or update DOM
            me.typeAhead ? me.updateTypeAheadValue(me.lastManualInput) : me.update();
        }
    }

    /**
     * @param {Object} data
     */
    onPickerHiddenChange({ value }) {
        const inputEl = this.getInputEl();

        super.onPickerHiddenChange(...arguments);

        if (value) {
            inputEl['aria-activedescendant'] = ''
        }

        inputEl['aria-expanded'] = !value;
        this.update()
    }

    /**
     *
     */
    onPickerTriggerClick() {
        let me = this;

        if (me.picker?.isVisible) {
            me.picker.hidden = true
        } else if (!me.disabled && !me.readOnly) {
            me.doFilter(null)
        }
    }

    /**
     * Selecting a record, if required
     * @param {Object[]} items
     */
    onStoreLoad(items) {
        let me    = this,
            value = me.preStoreLoadValue;

        if (value !== null) {
            me._value = undefined; // silent update
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
                index = me.store.indexOfKey(me.activeRecordId)
            } else {
                index = 0
            }
        }

        me.list.selectItem(index)
    }

    /**
     * Override this method as needed inside class extensions.
     * @param {*} value
     * @protected
     */
    updateInputValueFromValue(value) {
        let inputValue = null;

        if (Neo.isObject(value)) {
            inputValue = value[this.displayField]
        }

        this.inputValue = inputValue
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
                    autocomplete: 'no', // while "off" is the correct value, browser vendors ignore it. Arbitrary strings do the trick.
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
     * @param {String|null} value=this.lastManualInput
     * @param {Boolean} silent=false
     * @protected
     */
    updateTypeAheadValue(value=this.lastManualInput, silent=false) {
        let me                    = this,
            match                 = false,
            inputHintEl           = me.getInputHintEl(),
            {displayField, store} = me;

        if (me.typeAhead) {
            if (!me.value && value?.length > 0) {
                const search = value.toLocaleLowerCase();
                match = store.items.find(r => r[displayField]?.toLowerCase?.()?.startsWith(search));

                if (match && inputHintEl) {
                    inputHintEl.value = value + match[displayField].substr(value.length);
                    me.activeRecord   = match;
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
     * @param {String} inputValue
     * @protected
     */
    updateValueFromInputValue(inputValue) {
        let me = this;

        me.lastManualInput = inputValue;

        if (!me.programmaticValueChange) {
            // changing the input => silent record reset
            me._value = null;

            me.filterOnInput(inputValue)
        }
    }
}

/**
 * The select event fires when a list item gets selected
 * @event select
 * @param {Object} record
 * @param {value} record[store.keyProperty]
 * @returns {Object}
 */

Neo.setupClass(ComboBox);

export default ComboBox;
