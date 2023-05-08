import Container     from '../../container/Base.mjs';
import NeoArray      from '../../util/Array.mjs';
import PickerTrigger from './trigger/Picker.mjs';
import Text          from './Text.mjs';

/**
 * The abstract picker field provides an arrow down trigger which opens a floating container to provide
 * more data selection options
 * @class Neo.form.field.Picker
 * @extends Neo.form.field.Text
 * @abstract
 */
class Picker extends Text {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Picker'
         * @protected
         */
        className: 'Neo.form.field.Picker',
        /**
         * @member {String} ntype='pickerfield'
         * @protected
         */
        ntype: 'pickerfield',
        /**
         * @member {String[]} baseCls=['neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-pickerfield', 'neo-textfield'],
        /**
         * Stores the data from the getBoundingClientRect() call (picker & body DomRects)
         * @member {Array} clientRects=null
         * @protected
         */
        clientRects: null,
        /**
         * @member {Boolean} editable_=true
         */
        editable_: true,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            Enter : 'onKeyDownEnter',
            Escape: 'onKeyDownEscape'
        },
        /**
         * @member {Boolean} matchPickerWidth=true
         */
        matchPickerWidth: true,
        /**
         * @member {Object|null} picker=null
         * @protected
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
         * @member {Boolean} pickerIsMounted_=false
         * @protected
         */
        pickerIsMounted_: false,
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
         * @member {Boolean} showPickerOnFocus=false
         * @protected
         */
        showPickerOnFocus: false,
        /**
         * @member {Object|Object[]} triggers=[]
         * @protected
         */
        triggers: [{
            module: PickerTrigger
        }]
    }

    /**
     * Internal flag to prevent showing a picker multiple times
     * @member {Boolean} pickerIsMounting=false
     * @protected
     */
    pickerIsMounting = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: me.onInputClick,
            scope: me
        });
    }

    /**
     * Triggered after the editable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetEditable(value, oldValue) {
        let cls = this.cls;

        NeoArray.toggle(cls, 'neo-not-editable', !value);
        this.cls = cls;
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (value === false && oldValue && this.pickerIsMounted) {
            this.picker.hide();
        }

        super.afterSetMounted(value, oldValue);
    }

    /**
     * @param {Boolean} silent
     */
    applyClientRects(silent) {
        let me          = this,
            rects       = me.clientRects,
            inputRect   = rects[1],
            parentRect  = rects[2],
            triggerRect = rects[0],
            vdom        = me.picker.vdom,
            width       = me.matchPickerWidth ? inputRect.width : me.pickerWidth;

        me.pickerWidth = width;

        vdom.style = vdom.style || {};

        Object.assign(vdom.style, {
            left : `${inputRect.left}px`,
            top  : `${inputRect.bottom + 1}px`,
            width: `${width}px`
        });

        me.picker[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     * @returns {Neo.container.Base}
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
            vdom     : {cn: [], 'aria-activedescendant': me.id, tabIndex: -1},
            width    : me.pickerWidth,
            ...me.pickerConfig,

            // scoped to the field instance
            onFocusLeave: data => {
                let insideField = false,
                    item;

                for (item of data.oldPath) {
                    if (item.id === me.id) {
                        insideField = true;
                        break;
                    }
                }

                if (!insideField) {
                    me.hidePicker();
                    super.onFocusLeave(data);
                }
            }
        });
    }

    /**
     * Override this method to create your picker content as needed
     * @returns {Neo.component.Base|null}
     */
    createPickerComponent() {
        return null;
    }

    /**
     * @param args
     */
    destroy(...args) {
        let picker = this.picker;

        if (this.pickerIsMounted) {
            picker?.unmount();
        }

        picker?.destroy();
        super.destroy(...args);
    }

    /**
     * @param {Function} [callback]
     * @param {Object} [callbackScope]
     */
    getClientRectsThenShow(callback, callbackScope) {
        let me        = this,
            triggerId = me.getTriggerId('picker');

        me.getDomRect([triggerId, me.getInputWrapperId(), me.parentId]).then(data => {
            me.clientRects = data;
            me.showPicker(callback, callbackScope);
        });
    }

    /**
     * Returns the picker instance and creates it in case it does not exist yet
     * @returns {Neo.container.Base}
     */
    getPicker() {
        let me = this;

        if (!me.picker) {
            me.picker = me.createPicker();
        }

        return me.picker;
    }

    /**
     * @returns {String}
     */
    getPickerId() {
        return `${this.id}__picker`;
    }

    /**
     *
     */
    async hidePicker() {
        let me     = this,
            picker = me.getPicker();

        // avoid breaking selection model cls updates
        await Neo.timeout(30);

        me.pickerIsMounted && picker.unmount();

        me.pickerIsMounted = false;
    }

    /**
     * @param {Object} data
     * @protected
     */
    onFocusEnter(data) {
        super.onFocusEnter(data);

        let me = this;

        me.showPickerOnFocus && !me.pickerIsMounted && me.getClientRectsThenShow();
    }

    /**
     * @param {Object} data
     * @protected
     */
    onFocusLeave(data) {
        let me           = this,
            insidePicker = false,
            item;

        for (item of data.oldPath) {
            if (item.id === me.getPickerId()) {
                insidePicker = true;
                break;
            }
        }

        if (!insidePicker) {
            me.hidePicker();
            super.onFocusLeave(data);
        }
    }

    /**
     * @param {Object} data
     */
    onInputClick(data) {
        let me = this;

        if (!me.editable) {
            me.togglePicker();

            // stay in sync to the trigger-click logic
            !me.pickerIsMounted && me.focus()
        }
    }

    /**
     * @param {Object} data
     * @param {Function} [callback]
     * @param {Object} [callbackScope]
     * @protected
     */
    onKeyDownEnter(data, callback, callbackScope) {
        !this.pickerIsMounted && this.getClientRectsThenShow(callback, callbackScope);
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownEscape(data) {
        this.pickerIsMounted && this.hidePicker();
    }

    /**
     * Called by form.field.trigger.Picker
     * @protected
     */
    onPickerTriggerClick() {
        this.editable && this.togglePicker();
    }

    /**
     * @param {Function} [callback]
     * @param {Object} [callbackScope]
     */
    showPicker(callback, callbackScope) {
        let me     = this,
            picker = me.getPicker(),
            listenerId;

        if (!me.pickerIsMounting) {
            me.pickerIsMounting = true;

            me.applyClientRects(true);

            listenerId = picker.on('mounted', () => {
                picker.un('mounted', listenerId);

                me.pickerIsMounting = false;
                me.pickerIsMounted  = true;
                callback?.apply(callbackScope || me);
            });

            picker.render(true);
        }
    }

    /**
     *
     */
    togglePicker() {
        let me = this;

        if (me.pickerIsMounted) {
            me.hidePicker();
        } else {
            me.getClientRectsThenShow();
        }
    }
}

Neo.applyClassConfig(Picker);

export default Picker;
