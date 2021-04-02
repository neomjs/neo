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
         * @member {String[]} labelPositions=['bottom', 'inline', 'left', 'right', 'top']
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
         * @member {Boolean} clearToOriginalValue=false
         */
        clearToOriginalValue_: false,
        /**
         * @member {String[]} cls=['neo-textfield']
         */
        cls: ['neo-textfield'],
        /**
         * @member {Boolean} hideLabel_=false
         */
        hideLabel_: false,
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
         * @member {String|null} placeholderText_=null
         */
        placeholderText_: null,
        /**
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * @member {Object|Object[]|null} triggers_=null
         */
        triggers_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                tag  : 'label',
                cls  : ['neo-textfield-label'],
                style: {}
            }, {
                tag         : 'input',
                autocomplete: 'off',
                autocorrect : 'off',
                cls         : ['neo-textfield-input'],
                flag        : 'neo-real-input',
                spellcheck  : 'false',
                style       : {}
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = Neo.clone(me.domListeners, true, true),
            vdom         = me.vdom,
            inputEl      = me.getInputEl(),
            labelEl      = me.getLabelEl();

        inputEl.id = labelEl.for = me.id + '-input';

        me.vdom = vdom;

        domListeners.push({
            input: {
                fn   : me.onInputValueChange,
                scope: me
            }
        });

        me.domListeners = domListeners;
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
            oldValue: oldValue,
            value   : value
        });
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

            if (!me.hideLabel) {
                me.updateInputWidth();
            }
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && this.labelPosition === 'inline') {
            this.updateCenterBorderElWidth();
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
        this.changeInputElKey('required', value);
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

        // console.log(value && [...value], oldValue && [...oldValue]);

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
                    id   : me.id + '-input-wrapper',
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
                    id   : me.getTriggerId(item.prototype.type),
                    field: me
                });
            } else if (!(item instanceof BaseTrigger)) {
                if (!item.module && !item.ntype) {
                    item.ntype = 'trigger';
                }

                if (item.module) {
                    item.className = item.module.prototype.className;
                    item.id        = me.getTriggerId(item.module.prototype.type);
                }

                value[index] = Neo[item.className ? 'create' : 'ntype']({...item, field: me});
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

        if (value || value === 0) {
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
     *
     * @returns {Object|null}
     */
    getCenterBorderEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {cls: 'neo-center-border'});
        return el && el.vdom;
    }

    /**
     *
     * @returns {Object|null}
     */
    getInputEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {flag: 'neo-real-input'});
        return el && el.vdom;
    }

    /**
     *
     * @returns {String}
     */
    getInputElId() {
        return this.id + '-input';
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
     *
     * @returns {Object|null}
     */
    getLabelEl() {
        let el = VDomUtil.findVdomChild(this.vdom, {tag: 'label'});
        return el && el.vdom;
    }

    /**
     *
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
     *
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
     *
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
     *
     * @returns {Boolean}
     */
    isEmpty() {
        return !(this.value && this.value.toString().length > 0);
    }

    /**
     *
     * @returns {Boolean}
     */
    isValid() {
        let me = this;

        if (me.required && (!me.value || me.value && me.value.length < 1)) {
            return false;
        }

        return super.isValid();
    }

    /**
     *
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
     *
     * @param {Array} path
     * @protected
     */
    onFocusEnter(path) {
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
     *
     * @param {Array} path
     * @protected
     */
    onFocusLeave(path) {
        let me             = this,
            centerBorderEl = me.getCenterBorderEl(), // labelPosition: 'inline'
            cls            = me.cls,
            vdom;

        NeoArray.remove(cls, 'neo-focus');

        if (centerBorderEl && me.isEmpty()) {
            me._cls = cls; // silent update
            vdom = me.vdom;
            delete centerBorderEl.width;
            me.vdom = vdom;
        } else {
            me.cls = cls;
        }
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

        if (value !== oldValue) {
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
     * Used for labelPosition: 'inline' to adjust the top border matching to the length of the label
     * @param {Boolean} [silent=false] true to get the value, but not apply it to the DOM
     * @protected
     */
    updateCenterBorderElWidth(silent=false) {
        let me = this;

        if (me.mounted) {
            Neo.main.DomAccess.getBoundingClientRect({
                id: me.getCenterBorderEl().id
            }).then(data => {
                me.centerBorderElWidth = Math.round(data.width * .7) + 8;

                if (!silent) {
                    let vdom = me.vdom;

                    me.getCenterBorderEl().width = me.centerBorderElWidth;
                    me.vdom = vdom;
                }
            });
        }
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
            triggerRoot  = me.vnode && me.vnode.childNodes[1],
            childNodes   = triggerRoot && triggerRoot.childNodes || [],
            trigger;

        childNodes.forEach(vnode => {
            trigger = me.getTriggerById(vnode.id);

            if (trigger) {
                Object.assign(trigger, {
                    vnode    : vnode,
                    _rendered: true,
                    _mounted : true
                });
            }
        });
    }
}

Neo.applyClassConfig(Text);

export {Text as default};