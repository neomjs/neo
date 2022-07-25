import Base         from './Base.mjs';
import BaseTrigger  from './trigger/Base.mjs';
import ClearTrigger from './trigger/Clear.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';
import VNodeUtil    from '../../util/VNode.mjs';

/**
 * @class Neo.form.field.Text
 * @extends Neo.form.field.Base
 */
class Text extends Base {
    /**
     * Set this value to false, in case a field should display errors up front
     * @member {Boolean} validBeforeMount=true
     */
    validBeforeMount = true

    static getStaticConfig() {return {
        /**
         * Valid values for autoCapitalize
         * @member {String[]} autoCapitalizeValues=['characters','none','on','off','sentences','words']
         * @protected
         * @static
         */
        autoCapitalizeValues: ['characters', 'none', 'on', 'off', 'sentences', 'words'],
        /**
         * Valid values for labelPosition
         * @member {String[]} labelPositions=['bottom','inline','left','right','top']
         * @protected
         * @static
         */
        labelPositions: ['bottom', 'inline', 'left', 'right', 'top']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Text'
         * @protected
         */
        className: 'Neo.form.field.Text',
        /**
         * @member {String} ntype='textfield'
         * @protected
         */
        ntype: 'textfield',
        /**
         * An enumerated attribute that controls whether and how text input is automatically capitalized as it is
         * entered/edited by the user.
         * Valid values: 'characters', 'none', 'on', 'off', 'sentences', 'words'
         * @member {String} autoCapitalize=off'
         */
        autoCapitalize_: 'off',
        /**
         * @member {Boolean} autoComplete_=false
         */
        autoComplete_: false,
        /**
         * Internal variable to store the actual width for the label centerBorderEl
         * (only needed for labelPosition: 'inline')
         * @member {Number|null} centerBorderElWidth=null
         * @protected
         */
        centerBorderElWidth: null,
        /**
         * True shows a clear trigger in case the field has a non empty value.
         * @member {Boolean} clearable_=true
         */
        clearable_: true,
        /**
         * True will reset the field to its initial value config.
         * Recommended for fields with required: true
         * @member {Boolean} clearToOriginalValue_=false
         */
        clearToOriginalValue_: false,
        /**
         * @member {String[]} cls=['neo-textfield']
         */
        cls: ['neo-textfield'],
        /**
         * @member {String|null} error_=null
         */
        error_: null,
        /**
         * @member {Boolean} hideLabel_=false
         */
        hideLabel_: false,
        /**
         * @member {RegExp|null} inputPattern=null
         */
        inputPattern_: null,
        /**
         * @member {String} inputType_='text'
         */
        inputType_: 'text',
        /**
         * Valid values: 'bottom', 'inline', 'left', 'right', 'top'
         * @member {String} labelPosition_='left'
         */
        labelPosition_: 'left',
        /**
         * @member {String} labelText_='LabelText'
         */
        labelText_: 'LabelText',
        /**
         * defaults to px
         * @member {Number|String} labelWidth_=150
         */
        labelWidth_: 150,
        /**
         * The maximum amount of chars which you can enter into this field
         * @member {Number|null} maxLength_=null
         */
        maxLength_: null,
        /**
         * The minimum amount of chars which you can enter into this field
         * @member {Number|null} minLength_=null
         */
        minLength_: null,
        /**
         * @member {String|null} placeholderText_=null
         */
        placeholderText_: null,
        /**
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * null => Follow the element's default behavior for spell checking
         * @member {Boolean|null} spellCheck_=false
         */
        spellCheck_: false,
        /**
         * @member {Object|Object[]|null} triggers_=null
         */
        triggers_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'label', cls: ['neo-textfield-label'], style: {}},
            {tag: 'input', cls: ['neo-textfield-input'], flag: 'neo-real-input', style: {}},
            {cls: ['neo-textfield-error'], html: 'ERROR', removeDom: true}
        ]}
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push(
            {input: me.onInputValueChange, scope: me}
        );

        me.domListeners = domListeners;
    }

    /**
     * Triggered after the appName config got changed
     * @param {String} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let me = this;

        super.afterSetAppName(value, oldValue);

        value && me.triggers?.forEach(item => {
            item.appName = value;
        });
    }

    /**
     * Triggered after the autoCapitalize config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAutoCapitalize(value, oldValue) {
        this.changeInputElKey('autocapitalize', value === 'off' || value === 'none' ? null : value);
    }

    /**
     * Triggered after the autoComplete config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetAutoComplete(value, oldValue) {
        this.changeInputElKey('autocomplete', value ? null : 'off');
    }

    /**
     * Triggered after the clearable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetClearable(value, oldValue) {
        let me = this,
            triggers;

        if (value) {
            triggers = me.triggers || [];
            triggers.unshift(ClearTrigger);
            me.triggers = triggers;
        } else {
            me.removeTrigger('clear');
        }
    }

    /**
     * Triggered after the clearToOriginalValue config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetClearToOriginalValue(value, oldValue) {
        this.fire('changeClearToOriginalValue', {
            oldValue,
            value
        });
    }

    /**
     * Triggered after the error config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetError(value, oldValue) {
        this.updateValidationIndicators(false);
    }

    /**
     * Triggered after the hideLabel config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHideLabel(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[0].removeDom = value;
        me._vdom = vdom; // silent update

        me.updateInputWidth();
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        let me        = this,
            inputEl   = me.getInputEl(),
            inputElId = me.getInputElId(),
            labelEl   = me.getLabelEl();

        inputEl.id  = inputElId;
        labelEl.id  = me.getLabelId();
        labelEl.for = inputElId;

        // silent vdom update, the super call will trigger the engine
        super.afterSetId(value, oldValue);
    }

    /**
     * Triggered after the inputPattern config got changed
     * @param {RegExp|null} value 
     * @param {RegExp|null} oldValue
     * @protected
     */
    afterSetInputPattern(value, oldValue) {
        
    }

    /**
     * Triggered after the inputType config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetInputType(value, oldValue) {
        this.changeInputElKey('type', value);
    }

    /**
     * Triggered after the labelPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabelPosition(value, oldValue) {
        let me  = this,
            cls = me.cls,
            centerBorderElCls, isEmpty, vdom;

        NeoArray.remove(cls, 'label-' + oldValue);
        NeoArray.add(cls, 'label-' + value);
        me[oldValue === 'inline' || value === 'inline' ? '_cls' : 'cls'] = cls; // silent update if needed

        if (oldValue === 'inline') {
            vdom = me.vdom;

            vdom.cn[0] = me.getLabelEl(); // remove the wrapper

            vdom.cn[0].width = me.labelWidth;

            me._vdom = vdom; // silent update
            me.updateInputWidth();
        } else if (value === 'inline') {
            centerBorderElCls = ['neo-center-border'];
            isEmpty           = me.isEmpty();
            vdom              = me.vdom;

            if (!isEmpty) {
                centerBorderElCls.push('neo-float-above');
            }

            delete vdom.cn[0].width;

            vdom.cn[0] = {
                cls: ['neo-label-wrapper'],
                cn : [{
                    cls: ['neo-left-border']
                }, {
                    cls: centerBorderElCls,
                    cn : [vdom.cn[0]]
                }, {
                    cls: ['neo-right-border']
                }]
            };

            me._vdom = vdom; // silent update
            me.updateInputWidth();

            if (!isEmpty) {
                setTimeout(() => {
                    me.updateCenterBorderElWidth(false);
                }, 20);
            }
        }
    }

    /**
     * Triggered after the labelText config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabelText(value, oldValue) {
        let me      = this,
            isEmpty = me.isEmpty(),
            vdom    = me.vdom;

        me.getLabelEl().innerHTML = value;

        if (me.hideLabel) {
            me._vdom = vdom; // silent update
        } else {
            if (me.labelPosition === 'inline') {
                if (!isEmpty) {
                    delete me.getCenterBorderEl().width;
                }

                me.promiseVdomUpdate(vdom).then(() => {
                    me.updateCenterBorderElWidth(isEmpty);
                });
            } else {
                me.vdom = vdom;
            }
        }
    }

    /**
     * Triggered after the labelWidth config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @protected
     */
    afterSetLabelWidth(value, oldValue) {
        if (this.labelPosition !== 'inline') {
            let me    = this,
                vdom  = me.vdom,
                label = vdom.cn[0];

            label.width = value;

            me._vdom = vdom; // silent update

            !me.hideLabel && me.updateInputWidth();
        }
    }

    /**
     * Triggered after the maxLength config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetMaxLength(value, oldValue) {
        this.updateValidationIndicators();
        this.changeInputElKey('maxlength', value);
    }

    /**
     * Triggered after the minLength config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetMinLength(value, oldValue) {
        this.updateValidationIndicators();
        this.changeInputElKey('minlength', value);
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (oldValue !== undefined) {
            let triggers = me.triggers || [],
                i        = 0,
                len      = triggers.length;

            for (; i < len; i++) {
                if (!triggers[i].vdom.removeDom) {
                    triggers[i].mounted = value;
                }
            }

            if (me.labelPosition === 'inline') {
                if (value) {
                    me.updateCenterBorderElWidth();
                } else {
                    delete me.getCenterBorderEl().width;
                }
            }
        }
    }

    /**
     * Triggered after the placeholderText config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPlaceholderText(value, oldValue) {
        this.changeInputElKey('placeholder', value === '' ? null : value);
    }

    /**
     * Triggered after the required config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRequired(value, oldValue) {
        this.updateValidationIndicators();
        this.changeInputElKey('required', value ? value : null);
    }

    /**
     * Triggered after the spellCheck config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     * @protected
     */
    afterSetSpellCheck(value, oldValue) {
        this.changeInputElKey('spellcheck', Neo.isBoolean(value) ? value : null);
    }

    /**
     * Triggered after the triggers config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetTriggers(value, oldValue) {
        let me           = this,
            vdom         = me.vdom,
            inputEl      = vdom.cn[1], // inputEl or inputWrapperEl
            preTriggers  = [],
            postTriggers = [],
            width;

        if (oldValue) {
            oldValue.forEach(item => {
                if (!me.getTrigger(item.type)) {
                    item.destroy();
                }
            });
        }

        if (value.length > 0) {
            value.forEach(item => {
                if (item.align === 'start') {
                    preTriggers.push(item);
                } else {
                    postTriggers.push(item);
                }
            });

            postTriggers.sort((a, b) => b.weight - a.weight); // DESC
            preTriggers .sort((a, b) => a.weight - b.weight); // ASC

            postTriggers = postTriggers.map(a => a.vdom);
            preTriggers  = preTriggers .map(a => a.vdom);

            if (inputEl.tag === 'input') {
                // wrap the input tag
                vdom.cn[1] = {
                    cls  : ['neo-input-wrapper'],
                    cn   : [...preTriggers, inputEl, ...postTriggers],
                    id   : me.getInputWrapperId(),
                    width: inputEl.width
                };

                delete inputEl.width;
            } else {
                inputEl.cn = [...preTriggers, me.getInputEl(), ...postTriggers];
            }
        } else {
            if (inputEl.tag !== 'input') {
                // replacing the input wrapper div with the input tag
                width = inputEl.width;
                vdom.cn[1] = me.getInputEl();
                vdom.cn[1].width = width;
            }
        }

        me.promiseVdomUpdate().then(() => {
            me.updateTriggerVnodes();
        });
    }

    /**
     * Triggered after the value config got changed
     * todo: add validation logic
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        me.getInputEl().value = value;

        if (!!value !== !!oldValue) { // change from empty to non empty
            NeoArray[value && value.toString().length > 0 ? 'add' : 'remove'](me._cls, 'neo-has-content');
        }

        NeoArray[me.originalConfig.value !== value ? 'add' : 'remove'](me._cls, 'neo-is-dirty');
        me.updateValidationIndicators();

        me.vdom = vdom;

        super.afterSetValue(value, oldValue); // fires the change event
    }

    /**
     * Triggered after the width config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @protected
     */
    afterSetWidth(value, oldValue) {
        super.afterSetWidth(value, oldValue);
        this.updateInputWidth();
    }

    /**
     * Return a shallow copy of the triggers config
     * @param {Array|null} value
     * @protected
     */
    beforeGetTriggers(value) {
        if (Array.isArray(value)) {
            return [...value];
        }

        return value;
    }

    /**
     * Triggered before the autoCapitalize config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetAutoCapitalize(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'autoCapitalize', 'autoCapitalizeValues');
    }

    /**
     * Triggered before the labelPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetLabelPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'labelPosition');
    }

    /**
     * Triggered before the triggers config gets changed
     * @param {Object|Object[]} value
     * @param {Object[]} oldValue
     * @returns {Object[]} the parsed triggers config
     * @protected
     * @returns {Object|Object[]}
     */
    beforeSetTriggers(value, oldValue) {
        if (!value) {
            value = [];
        } else if (!Array.isArray(value)) {
            value = [value];
        }

        let me = this;

        value.forEach((item, index) => {
            if (item.isClass) {
                value[index] = Neo.create(item, {
                    appName: me.appName,
                    id     : me.getTriggerId(item.prototype.type),
                    field  : me
                });
            } else if (!(item instanceof BaseTrigger)) {
                if (!item.module && !item.ntype) {
                    item.ntype = 'trigger';
                }

                if (item.module) {
                    item.className = item.module.prototype.className;
                    item.id        = me.getTriggerId(item.module.prototype.type);
                }

                value[index] = Neo[item.className ? 'create' : 'ntype']({
                    ...item,
                    appName: me.appName,
                    field  : me
                });
            }
        });

        return value;
    }

    /**
     * Changes the value of a inputEl vdom object attribute or removes it in case it has no value
     * @param {String} key
     * @param {Array|Number|Object|String|null} value
     */
    changeInputElKey(key, value) {
        let me   = this,
            vdom = me.vdom;

        if (value || Neo.isBoolean(value) || value === 0) {
            me.getInputEl()[key] = value;
        } else {
            delete me.getInputEl()[key];
        }

        me.vdom = vdom;
    }

    /**
     * Resets the field to its original value or null depending on the clearToOriginalValue config
     */
    clear() {
        let me = this;

        me.value = me.clearToOriginalValue ? me.originalConfig.value : null;
        me.fire('clear');
    }

    /**
     * Calls focus() on the inputEl node instead
     * @param {String} id=this.id
     * @override
     */
    focus(id=this.id) {
        super.focus(this.getInputElId());
    }

    /**
     * @returns {Object|null}
     */
    getCenterBorderEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {cls: 'neo-center-border'});
        return el?.vdom;
    }

    /**
     * @returns {Object|null}
     */
    getInputEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {flag: 'neo-real-input'});
        return el?.vdom;
    }
    /**
     * @returns {String}
     */
    getInputElId() {
        return `${this.id}__input`;
    }

    /**
     * Calculates the new inputWidth based on the labelWidth & total width
     * @returns {Number|null} null in case this.width is unknown
     */
    getInputWidth() {
        let me          = this,
            ignoreLabel = me.hideLabel || me.labelPosition === 'bottom' || me.labelPosition === 'inline' || me.labelPosition === 'top',
            labelWidth  = ignoreLabel ? 0 : me.labelWidth,
            width       = me.width;

        if (labelWidth && width) {
            return parseInt(width) - parseInt(labelWidth);
        } else if (width) {
            return width;
        }

        return null;
    }

    /**
     * @returns {String}
     */
    getInputWrapperId() {
        return `${this.id}__input-wrapper`;
    }

    /**
     * @returns {Object|null}
     */
    getLabelEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {tag: 'label'});
        return el?.vdom;
    }

    /**
     * @returns {String}
     */
    getLabelId() {
        return `${this.id}__label`;
    }

    /**
     * @param {String} type
     * @returns {Neo.form.field.trigger.Base|null}
     */
    getTrigger(type) {
        let me       = this,
            triggers = me.triggers || [],
            i        = 0,
            len      = triggers.length;

        for (; i < len; i++) {
            if (triggers[i].type === type) {
                return triggers[i];
            }
        }

        return null;
    }

    /**
     * @param {String} id
     * @returns {Neo.form.field.trigger.Base|null}
     */
    getTriggerById(id) {
        let me       = this,
            triggers = me.triggers || [],
            i        = 0,
            len      = triggers.length;

        for (; i < len; i++) {
            if (triggers[i].id === id) {
                return triggers[i];
            }
        }

        return null;
    }

    /**
     * @param {String} type
     * @protected
     * @returns {String} The trigger node id
     */
    getTriggerId(type) {
        return this.id + '-trigger-' + type;
    }

    /**
     * Finds a trigger by a given type config
     * @param {String} type
     * @returns {Boolean}
     */
    hasTrigger(type) {
        let triggers = this.triggers || [],
            i        = 0,
            len      = triggers.length;

        for (; i < len; i++) {
            if (triggers[i].type === type) {
                return true;
            }
        }

        return false;
    }

    /**
     * @returns {Boolean}
     */
    isEmpty() {
        return !(this.value?.toString().length > 0);
    }

    /**
     * @returns {Boolean}
     */
    isValid() {
        let me          = this,
            value       = me.value,
            valueLength = value?.toString().length;

        if (me.required && (!value || valueLength < 1)) {
            return false;
        }

        if (Neo.isNumber(me.maxLength) && valueLength > me.maxLength) {
            return false;
        }

        if (Neo.isNumber(me.minLength) && valueLength < me.minLength) {
            return false;
        }

        return super.isValid();
    }

    /**
     * @param {Object} config
     * @param {Boolean} [preventOriginalConfig] True prevents the instance from getting an originalConfig property
     * @returns {Object} config
     */
    mergeConfig(...args) {
        let me       = this,
            config   = super.mergeConfig(...args),
            triggers = config.triggers || me.triggers;

        me[triggers ? 'triggers' : '_triggers'] = triggers;

        delete config.triggers;
        return config;
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.path
     * @protected
     */
    onFocusEnter(data) {
        let me  = this,
            cls = me.cls,
            vdom;

        NeoArray.add(cls, 'neo-focus');
        me.cls = cls;

        if (me.labelPosition === 'inline') {
            if (me.centerBorderElWidth) {
                vdom = me.vdom;
                me.getCenterBorderEl().width = me.centerBorderElWidth;
                me.vdom = vdom;
            } else {
                me.updateCenterBorderElWidth(false);
            }
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @protected
     */
    onFocusLeave(data) {
        let me             = this,
            centerBorderEl = me.getCenterBorderEl(), // labelPosition: 'inline'
            vdom           = me.vdom;

        me.updateValidationIndicators();

        NeoArray.remove(me._cls, 'neo-focus');

        if (centerBorderEl && me.isEmpty()) {
            delete centerBorderEl.width;
        }

        me.vdom = vdom;
    }

    /**
     * @param {Object} data
     * @protected
     */
    onInputValueChange(data) {
        let me       = this,
            value    = data.value,
            oldValue = me.value,
            vnode    = VNodeUtil.findChildVnode(me.vnode, {nodeName: 'input'});

        if (vnode) {
            // required for validation -> revert a wrong user input
            vnode.vnode.attributes.value = value;
        }

        if (me.inputPattern && !me.inputPattern.test(value) ) {            
            me.afterSetValue(oldValue, value);
        } else if (value !== oldValue) {
            me.value = value;
        }
    }

    /**
     * Removes all triggers of a given type
     * @param {String} type
     * @param {Boolean} [silent=false] true prevents a vdom update
     * @param {Array} [triggerSource] pass a shallow copy of this.triggers
     * @returns {Boolean} true in case a trigger was found & removed
     */
    removeTrigger(type, silent=false, triggerSource) {
        let me       = this,
            hasMatch = false,
            triggers = triggerSource || me.triggers || [],
            i        = 0,
            len      = triggers.length,
            trigger;

        for (; i < len; i++) {
            trigger = triggers[i];

            if (trigger.type === type) {
                NeoArray.remove(triggers, trigger);
                len--;
                hasMatch = true;
            }
        }

        if (hasMatch && !silent) {
            me.triggers = triggers;
        }

        return hasMatch;
    }

    /**
     * Resets the field to its original value or null depending on the clearToOriginalValue config
     * You can optionally pass a new value, which will adjust the originalConfig.value if needed.
     * @param {String|null} [value=null]
     */
    reset(value=null) {
        if (value && this.clearToOriginalValue) {
            this.originalConfig.value = value;
        }

        super.reset(value);
    }

    /**
     * Used for labelPosition: 'inline' to adjust the top border matching to the length of the label
     * @param {Boolean} [silent=false] true to get the value, but not apply it to the DOM
     * @protected
     */
    updateCenterBorderElWidth(silent=false) {
        let me = this;

        me.mounted && me.getDomRect(me.getCenterBorderEl().id).then(data => {
            me.centerBorderElWidth = Math.round(data.width * .7) + 8;

            if (!silent) {
                let vdom = me.vdom;

                me.getCenterBorderEl().width = me.centerBorderElWidth;
                me.vdom = vdom;
            }
        });
    }

    /**
     * Calculates the new inputWidth based on the labelWidth & total width
     * @protected
     */
    updateInputWidth() {
        let me         = this,
            inputWidth = me.getInputWidth(),
            vdom       = me.vdom;

        if (inputWidth !== null && inputWidth !== me.width) {
            vdom.cn[1].width = inputWidth;
        } else {
            delete vdom.cn[1].width;
        }

        me.vdom = vdom;
    }

    /**
     * Since triggers do not get rendered, assign the relevant props
     * todo: this could be handled by component.Base
     */
    updateTriggerVnodes() {
        let me           = this,
            triggerRoot  = me.vnode?.childNodes[1],
            childNodes   = triggerRoot?.childNodes || [],
            trigger;

        childNodes.forEach(vnode => {
            trigger = me.getTriggerById(vnode.id);

            trigger && Object.assign(trigger, {
                vnode,
                _rendered: true,
                _mounted : true
            });
        });
    }

    /**
     * @param {Boolean} silent=true
     */
    updateValidationIndicators(silent=true) {
        let me   = this,
            vdom = me.vdom;

        if (!(me.validBeforeMount && !me.mounted)) {
            NeoArray[!me.isValid() ? 'add' : 'remove'](me._cls, 'neo-invalid');

            if (!silent) {
                me.vdom = vdom;
            }
        }
    }
}

Neo.applyClassConfig(Text);

export default Text;
