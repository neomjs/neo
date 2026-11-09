import ClassSystemUtil from '../../util/ClassSystem.mjs';
import Field           from './Base.mjs';
import NeoArray        from '../../util/Array.mjs';
import Store           from '../../data/Store.mjs';
import StringUtil      from '../../util/String.mjs';
import VNodeUtil       from '../../util/VNode.mjs';

/**
 * @summary A Store-backed native single-select field with optional rich option content.
 * Values are typed scalars, not records. A missing requested value remains in `value`, but is invalid and
 * submits null until the Store supplies it. Filtering does not invalidate an existing selection.
 * @class Neo.form.field.Select
 * @extends Neo.form.field.Base
 */
class Select extends Field {
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
         * @member {String[]} baseCls=['neo-selectfield']
         * @protected
         */
        baseCls: ['neo-selectfield'],
        /**
         * Opts into CSS base-select where supported. False keeps the browser's classic control.
         * The closed control uses native text; custom content belongs to the open options.
         * @member {Boolean} customizable_=true
         * @reactive
         */
        customizable_: true,
        /** @member {String} disabledField='disabled' */
        disabledField: 'disabled',
        /** @member {String} displayField='name' */
        displayField: 'name',
        /**
         * @member {String|null} error_=null
         * @reactive
         */
        error_: null,
        /** @member {String} errorTextMissing='Selection unavailable' */
        errorTextMissing: 'Selection unavailable',
        /** @member {String} errorTextRequired='Required' */
        errorTextRequired: 'Required',
        /**
         * @member {Boolean} hideLabel_=false
         * @reactive
         */
        hideLabel_: false,
        /**
         * @member {String} labelText_=''
         * @reactive
         */
        labelText_: '',
        /**
         * An array of scalars or records to normalize into an owned Store. An explicit or bound Store wins
         * during construction; assigning options later replaces it. Null clears the options Store.
         * @member {Array|null} options_=null
         * @reactive
         */
        options_: null,
        /**
         * @member {String} placeholderText_='Select…'
         * @reactive
         */
        placeholderText_: 'Select…',
        /**
         * @member {Boolean} showErrorTexts_=true
         * @reactive
         */
        showErrorTexts_: true,
        /**
         * Instances are borrowed. Configs and arrays create an owned Store, disposed on replacement/destruction.
         * With neither store nor options, creates an empty Store; a binding can instead supply one later.
         * @member {Neo.data.Store|Object|Array|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * Unique, non-null strings, finite numbers or booleans. DOM option values are internal typed tokens;
         * use value / getSubmitValue(), not native FormData, to read business values.
         * @member {String} valueField='id'
         */
        valueField: 'id',
        /**
         * @member {Object} _vdom
         * @protected
         */
        _vdom: {cn: [
            {tag: 'label', cls: ['neo-selectfield-label']},
            {tag: 'select', cls: ['neo-selectfield-input'], cn: []},
            {cls: ['neo-selectfield-error'], removeDom: true}
        ]}
    }

    /** @type {WeakSet<Neo.data.Store>} */
    #ownedStores = new WeakSet()
    /** @type {Map<String, Object>} */
    #optionsByToken = new Map()
    /** @type {String|null} */
    #externalError = null

    /**
     * @summary Registers native change handling after the field's configs are available.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.addDomListeners({change: this.onInputValueChange, scope: this});
        this.refreshOptions()
    }

    /**
     * @summary Detaches the field without retiring borrowed Store or Model state.
     */
    destroy(...args) {
        const store = this.store;
        this.unbindStore(store);
        super.destroy(...args);
        this.#ownedStores.has(store) && store.destroy()
    }

    /**
     * @summary Switches between enhanced and classic native presentation.
     * @param {Boolean} value
     * @protected
     */
    afterSetCustomizable(value) {
        this[value ? 'addCls' : 'removeCls']('neo-selectfield-customizable')
    }

    /**
     * @summary Keeps the native disabled property and field validity in agreement.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);
        this.getInputEl().disabled = value;
        this.configsApplied && this.validate(false)
    }

    /**
     * @summary Renders an explicitly assigned error, including form server errors.
     * @param {String|null} value
     * @protected
     */
    afterSetError(value) {
        this.#externalError = value;
        this.updateError(value);
        this.update()
    }

    /**
     * @summary Hides the visual label while retaining its accessible name.
     * @param {Boolean} value
     * @protected
     */
    afterSetHideLabel(value) {
        this.vdom.cn[0].removeDom = value;
        this.syncLabel()
    }

    /**
     * @summary Updates the field's visible and accessible label.
     * @protected
     */
    afterSetLabelText() {
        this.syncLabel()
    }

    /**
     * @summary Replaces the options-owned Store after construction.
     * @param {Array|null} value
     * @protected
     */
    afterSetOptions(value) {
        this.configsApplied && (this.store = value || [])
    }

    /**
     * @summary Refreshes the empty option's label.
     * @protected
     */
    afterSetPlaceholderText() {
        this.configsApplied && this.refreshOptions()
    }

    /**
     * @summary Applies native required validity and rechecks the logical selection.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRequired(value, oldValue) {
        this.getInputEl().required = value;
        super.afterSetRequired(value, oldValue)
    }

    /**
     * @summary Updates error visibility without changing the validation result.
     * @protected
     */
    afterSetShowErrorTexts() {
        this.configsApplied && this.validate(false)
    }

    /**
     * @summary Subscribes additively; Store load covers membership changes and sort.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        this.unbindStore(oldValue);
        value?.on({filter: 'refreshOptions', load: 'refreshOptions', recordChange: 'refreshOptions', scope: this});
        this.configsApplied && this.refreshOptions();
        this.#ownedStores.has(oldValue) && oldValue.destroy()
    }

    /**
     * @summary Projects a programmatic value; Base supplies the change event sequence.
     * @protected
     */
    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) this.#externalError = null;
        this.configsApplied && this.refreshOptions()
    }

    /**
     * @summary Rejects malformed options before replacing the current Store.
     * @param {Array|null} value
     * @returns {Array|null}
     * @protected
     */
    beforeSetOptions(value) {
        if (value !== null && !Array.isArray(value)) throw new TypeError('Select options must be an array or null');
        return value
    }

    /**
     * @summary Normalizes the Store without borrowing its Model instance into another owner.
     * @param {*} value
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value) {
        const me = this;
        if (!value && !me.configsApplied && me.bind?.store) return null;
        value ??= !me.configsApplied ? me.options || [] : [];

        if (Array.isArray(value)) {
            value = {data: value.map(option => Neo.isObject(option) ? {...option} : {
                [me.displayField]: String(option),
                [me.valueField]  : option
            })}
        }

        const storeClass = value?.module || value?.ntype || value?.className;
        if (Neo.isObject(value) && !value.model && [undefined, Store, 'store', 'Neo.data.Store'].includes(storeClass)) {
            const fields = new Set([me.valueField, me.displayField, me.disabledField]);
            value.data?.forEach(record => Object.keys(record).forEach(key => fields.add(key)));
            value = {...value, keyProperty: value.keyProperty || me.valueField,
                model: {fields: [...fields].map(name => ({name}))}}
        }

        const store = ClassSystemUtil.beforeSetInstance(value, Store);
        if (store !== value) me.#ownedStores.add(store);
        return store
    }

    /**
     * @summary Accepts null or a typed scalar key without coercion.
     * @param {*} value
     * @returns {*}
     * @protected
     */
    beforeSetValue(value) {
        value === null || this.getOptionToken(value);
        return value
    }

    /**
     * @summary Renders one option's opaque content; override for rich options.
     * Return trusted noninteractive HTML containing readable text; escape dynamic data (or call super for the label).
     * Keep ids and selectedcontent out of this markup. Classic browsers use the text as their option label.
     * @param {Object} record
     * @param {Number} index Index in the visible Store, or -1 for a filtered selection.
     * @returns {String}
     */
    createOptionContent(record, index) {
        return StringUtil.escapeHtml(String(record[this.displayField] ?? ''))
    }

    /**
     * @summary Binds the label and error description to the native input's stable id.
     * @protected
     */
    ensureStableIds() {
        super.ensureStableIds();
        const me = this;
        me.vdom.cn[0].id  = `${me.id}__label`;
        me.vdom.cn[0].for = me.getInputElId();
        me.vdom.cn[2].id  = `${me.id}__error`;
        me.getInputEl().id = me.getInputElId()
    }

    /**
     * @summary Focuses the native control.
     */
    focus() {
        super.focus(this.getInputElId())
    }

    /**
     * @summary Returns the native select VDOM.
     * @returns {Object}
     */
    getInputEl() {
        return this.vdom.cn[1]
    }

    /**
     * @summary Returns the native select's id.
     * @returns {String}
     */
    getInputElId() {
        return `${this.id}__input`
    }

    /**
     * @summary Encodes typed keys without conflating 0, false, empty string or string zero.
     * @param {*} value
     * @returns {String}
     * @protected
     */
    getOptionToken(value) {
        const type = typeof value;
        if (!['string', 'number', 'boolean'].includes(type) || type === 'number' && !Number.isFinite(value)) {
            throw new TypeError('Select values must be strings, finite numbers or booleans')
        }
        return `${type}:${value}`
    }

    /**
     * @summary Resolves against the full population, including a filtered-out selection.
     * @returns {Object|null}
     */
    getSelectedRecord() {
        const {store, value, valueField} = this;
        if (!store || value === null) return null;
        for (const item of store.allItems?.items || store.items) {
            // The Store must hydrate its own hidden rows too, so mapped fields and notification ownership agree.
            const record = store.hydrateRecord(item);
            if (record[valueField] === value) return record
        }
        return null
    }

    /**
     * @summary Returns the resolved scalar, or null while a requested key is absent.
     * @returns {String|Number|Boolean|null}
     */
    getSubmitValue() {
        return this.getSelectedRecord() ? this.value : null
    }

    /**
     * @summary Checks logical selection validity without emitting value events.
     * @returns {Boolean}
     */
    isValid() {
        return this.validate()
    }

    /**
     * @summary Reconciles the user's native choice before the next VDOM diff.
     * @param {Object} data
     * @protected
     */
    onInputValueChange({value: token}) {
        const me       = this,
              record   = me.#optionsByToken.get(token),
              oldValue = me.value,
              input    = me.vnode && VNodeUtil.find(me.vnode, me.getInputElId())?.vnode;

        input?.childNodes.forEach(option => {
            option.attributes.selected = String(option.attributes.value === token)
        });

        if (!me.disabled && (token === '' || record && !record[me.disabledField])) {
            me.value = token === '' ? null : record[me.valueField];
            if (me.value !== oldValue) me.fireUserChangeEvent(me.value, oldValue)
        }
        me.refreshOptions()
    }

    /**
     * @summary Rebuilds managed option nodes while retaining a filtered selection and unresolved request.
     * @protected
     */
    refreshOptions() {
        if (!this.configsApplied || this.isDestroyed) return;
        const me       = this,
              input    = me.getInputEl(),
              selected = me.getSelectedRecord(),
              records  = [],
              options  = [{tag: 'option', id: `${me.id}__empty`, value: '', text: me.placeholderText, selected: !selected}],
              tokens   = new Map();

        me.store?.forEach(record => records.push(record));
        const visibleCount = records.length;
        if (selected && !records.includes(selected)) records.push(selected);

        records.forEach((record, position) => {
            const index = position < visibleCount ? position : -1,
                  token = me.getOptionToken(record[me.valueField]);
            if (tokens.has(token)) throw new Error(`Select option values must be unique: ${token}`);
            tokens.set(token, record);
            options.push({
                tag         : 'option', id: `${me.id}__${me.store.getInternalId(record)}`, value: token,
                'aria-label': String(record[me.displayField] ?? ''),
                disabled    : !!record[me.disabledField], selected: record === selected,
                ...(index === -1 ? {hidden: ''} : {}), html: me.createOptionContent(record, index)
            })
        });

        me.#optionsByToken = tokens;
        input.cn = options;
        me.validate();
        me.update()
    }

    /**
     * @summary Clears a form server error even when reset keeps the current value.
     * @param {String|Number|Boolean|null} value=null
     */
    reset(value=null) {
        this.#externalError = null;
        super.reset(value);
        this.validate(false)
    }

    /**
     * @summary Keeps a hidden label available through aria-label.
     * @protected
     */
    syncLabel() {
        this.vdom.cn[0].text = this.labelText;
        this.getInputEl()['aria-label'] = this.hideLabel ? this.labelText : null;
        this.update()
    }

    /**
     * @summary Removes only this field's subscriptions.
     * @param {Neo.data.Store|null} store
     * @protected
     */
    unbindStore(store) {
        store?.un({filter: 'refreshOptions', load: 'refreshOptions', recordChange: 'refreshOptions', scope: this})
    }

    /**
     * @summary Projects validation onto accessible state and optional error text.
     * @param {String|null} value
     * @protected
     */
    updateError(value) {
        const me = this, input = me.getInputEl(), error = me.vdom.cn[2];
        error.text = value || '';
        error.removeDom = !value || !me.showErrorTexts;
        input['aria-invalid'] = !!value;
        input['aria-describedby'] = error.removeDom ? null : `${me.id}__error`;
        me.cls = NeoArray.toggle(me.cls, 'neo-invalid', !!value)
    }

    /**
     * @summary Required rejects empty; an unresolved request is invalid even for an optional field.
     * @param {Boolean} silent=true
     * @returns {Boolean}
     */
    validate(silent=true) {
        const me = this;
        me._error = me.disabled ? null : me.value !== null && !me.getSelectedRecord()
            ? me.errorTextMissing : me.required && me.value === null ? me.errorTextRequired : me.#externalError;
        me.updateError(me._error);
        !silent && me.update();
        return !me._error
    }
}

export default Neo.setupClass(Select);
