import {default as Container}     from '../../container/Base.mjs';
import {default as PickerTrigger} from './trigger/Picker.mjs';
import Text                       from './Text.mjs';
import {default as VDomUtil}      from '../../util/VDom.mjs';

/**
 * The abstract picker field provides an arrow down trigger which opens a floating container to provide
 * more data selection options
 * @class Neo.form.field.Picker
 * @extends Neo.form.field.Text
 * @abstract
 */
class Picker extends Text {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Picker'
         * @private
         */
        className: 'Neo.form.field.Picker',
        /**
         * @member {String} ntype='pickerfield'
         * @private
         */
        ntype: 'pickerfield',
        /**
         * Stores the data from the getBoundingClientRect() call (picker & body DomRects)
         * @member {Array} clientRects=null
         * @private
         */
        clientRects: null,
        /**
         * @member {String[]} cls=['neo-pickerfield', 'neo-textfield']
         */
        cls: ['neo-pickerfield', 'neo-textfield'],
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            'Enter' : 'onKeyDownEnter',
            'Escape': 'onKeyDownEscape'
        },
        /**
         * @member {Boolean} matchPickerWidth=true
         */
        matchPickerWidth: true,
        /**
         * @member {Object|null} picker=null
         * @private
         */
        picker: null,
        /**
         * Configs to pass to the picker container
         * @member {Object|null} pickerConfig=null
         */
        pickerConfig: null,
        /**
         * The height of the picker container. Defaults to px.
         * @member {Number|null} pickerHeight=100
         */
        pickerHeight: 100,
        /**
         * @member {Boolean} pickerIsMounted=false
         * @private
         */
        pickerIsMounted: false,
        /**
         * The height of the picker container. Defaults to px.
         * @member {Number|null} pickerMaxHeight=200
         */
        pickerMaxHeight: 200,
        /**
         * The width of the picker container. Defaults to px.
         * @member {Number|null} pickerWidth=100
         */
        pickerWidth: 100,
        /**
         * @member {Object|Object[]} triggers=[]
         * @private
         */
        triggers: [{
            module: PickerTrigger
        }]
    }}

    /**
     * Triggered after the hideLabel config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetHideLabel(value, oldValue) {
        super.afterSetHideLabel(value, oldValue);
        this.updatePickerWidth();
    }

    /**
     * Triggered after the labelWidth config got changed
     * @param {Number|String} value
     * @param {Number|String} oldValue
     * @private
     */
    afterSetLabelWidth(value, oldValue) {
        super.afterSetLabelWidth(value, oldValue);
        this.updatePickerWidth();
    }

    /**
     * Triggered after the width config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetWidth(value, oldValue) {
        super.afterSetWidth(value, oldValue);
        this.updatePickerWidth();
    }

    /**
     *
     * @return {Neo.container.Base}
     */
    createPicker() {
        let me              = this,
            pickerComponent = me.createPickerComponent();

        return Neo.create(Container, {
            appName  : me.appName,
            cls      : ['neo-picker-container', 'neo-container'],
            height   : me.pickerHeight,
            id       : me.getPickerId(),
            items    : pickerComponent ? [pickerComponent] : [],
            maxHeight: me.pickerMaxHeight,
            vdom     : {cn: [], tabIndex: -1},
            width    : me.pickerWidth,
            ...me.pickerConfig || {}
        });
    }

    applyClientRects(silent) {
        let me              = this,
            bodyRect        = me.clientRects[1],
            triggerRect     = me.clientRects[0],
            vdom            = me.picker.vdom,
            width           = me.matchPickerWidth ? me.getInputWidth() : me.pickerWidth;

        Object.assign(vdom.style, {
            left: (triggerRect.left + triggerRect.width - width + 1) + 'px',
            top : (triggerRect.top + triggerRect.height + 1) + 'px'
        });

        me.picker[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @return {null}
     */
    createPickerComponent() {
        return null;
    }

    /**
     *
     * @param {Function} [callback]
     * @param {Function} [callbackScope]
     */
    getClientRectsThenShow(callback, callbackScope) {
        let me = this;

        Neo.main.DomAccess.getBoundingClientRect({
            id: [me.id, 'body']
        }).then(data => {
            me.clientRects = data;
            me.showPicker(callback, callbackScope);
        });
    }

    /**
     * Returns the picker intance and creates it in case it does not exist yet
     * @return {Neo.container.Base}
     */
    getPicker() {
        let me = this;

        if (!me.picker) {
            me.picker = me.createPicker();
        }

        return me.picker;
    }

    /**
     *
     * @returns {String}
     */
    getPickerId() {
        return this.id + '__picker';
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    hidePicker(silent=false) {
        let me     = this,
            picker = me.getPicker(),
            vdom   = me.vdom;

        if (me.pickerIsMounted) {
            VDomUtil.removeVdomChild(vdom, me.getPickerId());
        }

        me.pickerIsMounted = false;

        if (silent) {
            me._vdom = vdom;
            picker.mounted = false;
        } else {
            me.promiseVdomUpdate().then(data => {
                picker.mounted = me.pickerIsMounted;
            });
        }
    }

    /**
     *
     * @param {Array} data
     * @private
     */
    onFocusLeave(data) {
        let me = this;

        // inline will trigger an vdom update, so hide picker should be silent
        if (me.labelPosition === 'inline' && (me.value === '' || me.value === null)) {
            me.hidePicker(true);
        } else {
            me.hidePicker();
        }

        super.onFocusLeave(data);
    }

    /**
     *
     * @param {Object} data
     * @param {Function} [callback]
     * @param {Function} [callbackScope]
     * @private
     */
    onKeyDownEnter(data, callback, callbackScope) {
        if (!this.pickerIsMounted) {
            this.getClientRectsThenShow(callback, callbackScope);
        }
    }

    /**
     *
     * @param {Object} data
     * @private
     */
    onKeyDownEscape(data) {
        if (this.pickerIsMounted) {
            this.hidePicker();
        }
    }

    /**
     * Called by form.field.trigger.Picker
     * @private
     */
    onPickerTriggerClick() {
        let me = this;

        if (me.pickerIsMounted) {
            me.hidePicker();
        } else {
            me.getClientRectsThenShow();
        }
    }

    /**
     *
     * @param {Function} [callback]
     * @param {Function} [callbackScope]
     */
    showPicker(callback, callbackScope) {
        let me     = this,
            picker = me.getPicker(),
            vdom   = me.vdom;

        me.applyClientRects(true);
        vdom.cn.push(picker.vdom);

        me.pickerIsMounted = true;

        me.promiseVdomUpdate().then(data => {
            picker.mounted = me.pickerIsMounted;

            if (callback) {
                callback.apply(callbackScope || me);
            }
        });
    }

    /**
     *
     */
    updatePickerWidth() {
        let me = this,
            inputWidth;

        if (me.matchPickerWidth) {
            inputWidth = me.getInputWidth();

            if (me.picker) {
                me.picker.width = inputWidth;
            } else {
                me.pickerWidth  = inputWidth;
            }
        }
    }
}

Neo.applyClassConfig(Picker);

export {Picker as default};