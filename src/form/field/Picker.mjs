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
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            Enter : 'onKeyDownEnter',
            Escape: 'onKeyDownEscape'
        },
        /**
         * @member {Neo.container.Base|null} picker=null
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
         * By default, the width of the picker matches the width of the input wrap element.
         * @member {Number|null} pickerWidth=null
         */
        pickerWidth: null,
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            click: me.onInputClick,
            scope: me
        })
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (value === false && oldValue && this.pickerIsMounted) {
            this.picker.hide()
        }

        super.afterSetMounted(value, oldValue)
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (this.picker) {
            this.picker.theme = value
        }
    }

    /**
     * @returns {Neo.container.Base}
     */
    createPicker() {
        const
            me              = this,
            {pickerWidth}   = me,
            pickerComponent = me.createPickerComponent();

        me.picker =  Neo.create(Container, {
            parentId : 'document.body',
            floating : true,
            align    : {
                edgeAlign : pickerWidth ? 't0-b0' : 't-b',
                matchSize : !pickerWidth,
                axisLock  : true,
                target    : me.getInputWrapperId()
            },
            appName  : me.appName,
            cls      : ['neo-picker-container', 'neo-container'],
            height   : me.pickerHeight,
            hidden   : true,
            id       : me.getPickerId(),
            items    : pickerComponent ? [pickerComponent] : [],
            maxHeight: me.pickerMaxHeight,
            theme    : me.theme,
            width    : pickerWidth,
            ...me.pickerConfig,

            // scoped to the field instance
            onFocusLeave: data => {
                let insideField = false,
                    item;

                for (item of data.oldPath) {
                    if (item.id === me.id) {
                        insideField = true;
                        break
                    }
                }

                if (!insideField) {
                    me.hidePicker();
                    super.onFocusLeave(data)
                }
            }
        });

        me.picker.on('hiddenChange', me.onPickerHiddenChange, me);

        return me.picker
    }

    /**
     * Override this method to create your picker content as needed
     * @returns {Neo.component.Base|null}
     */
    createPickerComponent() {
        return null
    }

    /**
     * @param args
     */
    destroy(...args) {
        let {picker} = this;

        if (picker?.hidden === false) {
            picker.unmount()
        }

        picker?.destroy();
        super.destroy(...args)
    }

    /**
     * Returns the picker instance and creates it in case it does not exist yet
     * @returns {Neo.container.Base}
     */
    getPicker() {
        return this.picker || this.createPicker()
    }

    /**
     * @returns {String}
     */
    getPickerId() {
        return `${this.id}__picker`
    }

    /**
     *
     */
    async hidePicker() {
        if (this.picker) {
            this.picker.hidden = true
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onFocusEnter(data) {
        super.onFocusEnter(data);

        let me = this;

        me.showPickerOnFocus && me.showPicker()
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
                break
            }
        }

        if (!insidePicker) {
            me.hidePicker();
            super.onFocusLeave(data)
        }
    }

    /**
     * @param {Object} data
     */
    onInputClick(data) {
        !this.editable && this.togglePicker()
    }

    /**
     * @param {Object} data
     * @param {Function} [callback]
     * @param {Object} [callbackScope]
     * @protected
     */
    onKeyDownEnter(data, callback, callbackScope) {
        !this.pickerIsMounted && this.showPicker(callback, callbackScope)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownEscape(data) {
        if (this.pickerIsMounted) {
            this.hidePicker();

            // We processed this event, and it should not proceed to ancestor components
            data.cancelBubble = true;

            // And no further listeners should be notified
            return false
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} data.oldValue
     * @param {Boolean} data.value
     * @protected
     */
    onPickerHiddenChange(data) {
        this.pickerIsMounted = !data.value
    }

    /**
     * Called by form.field.trigger.Picker
     * @protected
     */
    onPickerTriggerClick() {
        this.editable && this.togglePicker()
    }

    /**
     *
     */
    showPicker() {
        this.getPicker().hidden = false
    }

    /**
     *
     */
    togglePicker() {
        let picker = this.getPicker();
        picker.hidden = !picker.hidden
    }
}

Neo.setupClass(Picker);

export default Picker;
