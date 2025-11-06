import {buffer}         from '../../util/Function.mjs';
import ClassSystemUtil  from '../../util/ClassSystem.mjs';
import ComponentManager from '../../manager/Component.mjs';
import List             from '../../list/Base.mjs';
import Picker           from './Picker.mjs';
import Store            from '../../data/Store.mjs';
import VDomUtil         from '../../util/VDom.mjs';

/**
 * @summary A highly configurable input field that provides a dropdown list for item selection, filtering, and autocompletion.
 *
 * The ComboBox is a powerful and flexible component that combines a text input with a dropdown list (picker).
 * It supports several key operational modes controlled by its configuration, making it adaptable to a wide range of use cases.
 *
 * ---
 * ### Core Features & Modes:
 *
 * 1.  **Editable vs. Non-Editable (`editable` config):**
 *     - `editable: true` (default): Users can type freely into the input field. A click focuses the field, and picker visibility is typically triggered by typing, arrow keys, or the trigger icon.
 *     - `editable: false`: The field behaves more like a traditional `<select>` element. The input is non-editable, and a click on either the field or the trigger icon opens the picker.
 *
 * 2.  **Type Ahead (`typeAhead` config):**
 *     - When `true`, the component displays a "hint" of the first matching record in a grayed-out overlay within the input field as the user types. This provides an immediate suggestion for autocompletion.
 *
 * 3.  **Force Selection (`forceSelection` config):**
 *     - When `true` (default), the component ensures that the field's final value corresponds to a valid record from the store.
 *     - On blur, if the user has typed partial text, the component will automatically select the "closest" match (the current typeahead suggestion) and fill the input with its full `displayField` value.
 *
 * 4.  **Filtering (`useFilter`, `filterOperator`, `triggerAction`):**
 *     - The dropdown list can be dynamically filtered as the user types.
 *     - The `triggerAction` config determines whether clicking the trigger icon shows all items or only the currently filtered items.
 *
 * ---
 * Conforms to ARIA accessibility standards outlined in https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
 *
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
         * @member {Number} filterDelay=50
         */
        filterDelay : 50,
        /**
         * @member {String} filterOperator_='like'
         * @reactive
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
         * @reactive
         */
        listConfig_: null,
        /**
         * The height of the picker container. Defaults to px.
         * @member {Number|null} pickerHeight=null
         */
        pickerHeight: null,
        /**
         * @member {String|null} role='combobox'
         * @reactive
         */
        role: 'combobox',
        /**
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Showing the list via the down trigger can either show all list items or only show items which
         * match the filter string inside the input field.
         * Valid values: all, filtered
         * @member {String} triggerAction_='all'
         * @reactive
         */
        triggerAction_: 'all',
        /**
         * Display the first matching result while typing
         * @member {Boolean} typeAhead_=true
         * @reactive
         */
        typeAhead_: true,
        /**
         * Set this config to false, in case typing into the input field should not filter list items
         * @member {Boolean} useFilter_=true
         * @reactive
         */
        useFilter_: true,
        /**
         * This config should point to the store keyProperty or a different model field,
         * which you want to submit instead
         * @member {Number|String} valueField='id'
         */
        valueField: 'id',
        /**
         * Default width to prevent rendering issues.
         * @member {Number} width=150
         * @reactive
         */
        width: 150
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
        me.filterOnInput = buffer(me.filterOnInput, me, me.filterDelay);

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
        this.updateTypeAheadValue(value)
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
        this.vnodeInitialized && this.updateTypeAhead()
    }

    /**
     * Triggered after the value config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        // input value changes (super call) need a flag to prevent showing the picker
        me.programmaticValueChange = true;
        super.afterSetValue(value, oldValue);
        me.programmaticValueChange = false;

        if (me._picker?.isVisible) {
            let selectionModel = me.list?.selectionModel;

            if (value) {
                selectionModel?.select(value)
            } else {
                selectionModel?.deselectAll()
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
        let me                         = this,
            {displayField, valueField} = me;

        // Do not create a default store instance, in case there is a bound store to be created
        if (!value && me.bind?.store) {
            return null
        }

        oldValue?.destroy();

        // Promote an array of items to be a Store
        if (Array.isArray(value)) {
            value = {
                data: value.map((v, i) => {
                    // Simplest case is just picking string values.
                    if (typeof v === 'string') {
                        v = {
                            [displayField]: v,
                            [valueField]  : v
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
                    {name: displayField, type: 'String'},
                    {name: valueField,   type: 'String'}
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
        let me                    = this,
            {displayField, store} = me,
            record;

        // getting a record, nothing to do
        if (Neo.isRecord(value)) {
            return value
        }

        if (value === null) {
            return null
        }

        if (!store) { // We will (re)set the value once the store is created
            return value
        }

        // we can only match record ids or display values in case the store is loaded
        if (store.isLoaded) {
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
            keepFocusIndex: true,
            navigator     : {eventSource: me.getInputElId()},
            parentId      : me.id,
            role          : 'listbox',
            selectionModel: {stayInList: false},
            store         : me.store,
            windowId      : me.windowId,
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
        let me              = this,
            {picker, store} = me,
            record          = me.value,
            filter          = store.getFilter(me.displayField);

        if (filter) {
            filter.value = value
        }

        // Filter resulting in something to show
        if (store.getCount()) {
            me.showPicker();

            // List might not exist until the picker is created
            let {list}           = me,
                {selectionModel} = list,
                index            = store.indexOf(record);

            // On show, set the active item to be the current selected record or the first
            if (record) {
                // We do not want to hear back about our own selection
                selectionModel.suspendEvents = true;
                selectionModel.select(record);
                selectionModel.suspendEvents = false
            }

            list._focusIndex = -1; // silent update to ensure afterSetFocusIndex() always gets called
            list.focusIndex  = index > -1 ? index : 0
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
            params        = {component: me, oldValue, value};

        me.fire('change', params);

        if (!me.suspendEvents) {
            ComponentManager.getParents(me).forEach(parent => {
                if (FormContainer && parent instanceof FormContainer) {
                    parent.fire('fieldChange', params)
                }
            })
        }
    }

    /**
     * @returns {Object}
     */
    getInputHintEl() {
        return VDomUtil.find(this.vdom, this.getInputHintId())?.vdom
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
        let {list}    = this,
            recordKey = list.selectionModel.getSelection()[0];

        return recordKey && this.store.get(list.getItemRecordId(recordKey)) || null
    }

    /**
     * @returns {Number|String}
     */
    getSubmitValue() {
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
     * Handles the component losing focus. This is a critical method for `forceSelection` behavior.
     * If `forceSelection` is true and the user has typed partial text without explicitly selecting an item,
     * this method selects the current typeahead suggestion (`activeRecordId`) and sets it as the component's value.
     * It is also responsible for clearing the typeahead hint.
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        let me = this;

        /*
         * If we are leaving the field, using forceSelection=true and the field does not have a selected record,
         * we do want to pick the closest match => the focussed record (honoring filters).
         * If no record is found, we will clear the field instead.
         */
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

    /**
     * todo:
     * When we are using a `Collection` as our `valueCollection`, and that `Collection` is the
     * `items` of the List's `selectionModel`, then this will be `onValueCollectionChange`,
     * a `mutate` listener on our own `valueCollection` which backs our `value` field which
     * will be implemented by a getter which accesses `valueCollection`.
     * This will become important for implementing multiSelect
     * @param {Object} selectionChangeEvent
     * @param {Object[]} selectionChangeEvent.selection
     * @protected
     */
    async onListItemSelectionChange({selection}) {
        if (selection?.length) {
            let me       = this,
                selected = selection[0],
                record   = typeof selected === 'string' ? me.store.get(me.list.getItemRecordId(selected)) : selected;

            me.hintRecordId = null;

            me.updateTypeAheadValue(null, true);

            await me.hidePicker();

            me.preventFiltering = true;
            me.value            = record;
            me.preventFiltering = false;

            me.fire('select', {
                value: record
            })
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
     * Handles virtual focus navigation within the picker list (e.g., via arrow keys).
     * This method updates the `activeRecord` and `activeRecordId` to track the focused list item.
     * It then calls `updateTypeAheadValue` to ensure the typeahead hint is reset, preventing a mismatch
     * between the navigated item and the original typed-text suggestion.
     * @param {Object} data The neonavigate event data from the list.
     * @protected
     */
    onListItemNavigate(data) {
        let {activeIndex} = data;

        if (activeIndex >= 0) {
            let me      = this,
                {store} = me;

            me.activeRecord   = data.record || store.getAt(activeIndex);
            me.activeRecordId = me.activeRecord[store.getKeyProperty()];

            // Update typeahead hint (which updates DOM), or update DOM
            me.typeAhead ? me.updateTypeAheadValue(me.lastManualInput) : me.update()
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
     * @override
     */
    togglePicker() {
        let me       = this,
            {picker} = me;

        if (picker?.hidden === false) {
            picker.hidden = true
        } else if (!me.disabled && !me.readOnly) {
            me.doFilter(null)
        }
    }

    /**
     * Override this method as needed inside class extensions.
     * @param {*} value
     * @protected
     */
    updateInputValueFromValue(value) {
        let inputValue = null;

        if (Neo.isObject(value) || Neo.isRecord(value)) {
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
            inputEl = VDomUtil.find(me.vdom, {flag: 'neo-real-input'});

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
            VDomUtil.replaceVdomChild(me.vdom, inputEl.parentNode.id, inputEl.vdom)
        }

        !silent && me.update()
    }

    /**
     * Manages the typeahead hint overlay.
     * When a user types, this method searches for the first matching record in the store. If a match is found,
     * it populates a secondary, grayed-out input field with the remainder of the suggested term.
     * This method is also responsible for setting the `activeRecordId`, which is used by `forceSelection` on blur.
     * @param {String|null} value=this.lastManualInput The text to search for.
     * @param {Boolean} silent=false True to prevent a VDOM update.
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

                for (let i = 0; i < store.count; i++) {
                    const r = store.getAt(i);
                    if (r[displayField]?.toLowerCase?.()?.startsWith(search)) {
                        match = r;
                        break;
                    }
                }

                if (match && inputHintEl) {
                    inputHintEl.value = value + match[displayField].substr(value.length);
                    me.activeRecord   = match;
                    me.activeRecordId = match[store.getKeyProperty()]
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
            me.list?.selectionModel.deselectAll();

            me.filterOnInput(inputValue)
        }
    }
}

/**
 * The select event fires when a list item gets selected
 * @event select
 * @param {Object} record
 * @param {value} record[store.getKeyProperty()]
 * @returns {Object}
 */

export default Neo.setupClass(ComboBox);
