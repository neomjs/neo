import Collection  from '../../collection/Base.mjs';
import List        from '../../list/Base.mjs';
import Picker      from './Picker.mjs';
import TimeTrigger from './trigger/Time.mjs';

/**
 *
 * @class Neo.form.field.Time
 * @extends Neo.form.field.Picker
 */
class Time extends Picker {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Time'
         * @protected
         */
        className: 'Neo.form.field.Time',
        /**
         * @member {String} ntype='timefield'
         * @protected
         */
        ntype: 'timefield',
        /**
         * @member {String[]} baseCls=['neo-timefield','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-timefield', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {Neo.collection.Base|null} collection=null
         */
        collection: null,
        /**
         * @member {String} inputType='time'
         */
        inputType: 'time',
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            'Enter' : 'onKeyDownEnter',
            'Escape': 'onKeyDownEscape'
        },
        /**
         * @member {Neo.list.Base} list=null
         * @protected
         */
        list: null,
        /**
         * @member {Object|null} listConfig=null
         */
        listConfig: null,
        /**
         * @member {String} maxValue_='16:00'
         */
        maxValue_: '16:00',
        /**
         * @member {String} minValue_='08:00'
         */
        minValue_: '08:00',
        /**
         * The height of the picker container. Defaults to px.
         * @member {Number|null} pickerHeight=150
         */
        pickerHeight: 150,
        /**
         * Value in seconds, defaults to 5min
         * @member {Number} stepSize_=60*5
         */
        stepSize_: 60 * 5, // 5min
        /**
         * @member {Object|Object[]} triggers=[{module: TimeTrigger}]
         * @protected
         */
        triggers: [{
            module: TimeTrigger
        }],
        /**
         * @member {Intl.DateTimeFormat|null} valueFormat_=null
         * @protected
         */
        valueFormat_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me           = this,
            clearTrigger = me.getTrigger('clear');

        me.originalConfig.value = me.formatTime(me.value);

        if (clearTrigger) {
            clearTrigger.onFieldChange();
        }

        me.collection = Neo.create({
            module     : Collection,
            items      : me.createCollectionItems(),
            keyProperty: 'value'
        });

        me.list = Neo.create({
            module      : List,
            displayField: 'value',
            store       : me.collection,
            ...me.listConfig
        });

        me.list.keys._keys.push(
            {fn: 'onContainerKeyDownEnter',  key: 'Enter',  scope: me.id},
            {fn: 'onContainerKeyDownEscape', key: 'Escape', scope: me.id}
        );

        me.list.on({
            itemClick   : me.onListItemClick,
            itemNavigate: me.onListItemNavigate,
            scope       : me
        })
    }

    /**
     * Triggered after the maxValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        this.changeInputElKey('max', value);

        if (oldValue !== undefined) {
            this.recreateListItems()
        }
    }

    /**
     * Triggered after the minValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        this.changeInputElKey('min', value);

        if (oldValue !== undefined) {
            this.recreateListItems()
        }
    }

    /**
     * Triggered after the pickerIsMounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPickerIsMounted(value, oldValue) {
        if (value) {
            this.selectCurrentListItem()
        }
    }

    /**
     * Triggered after the stepSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStepSize(value, oldValue) {
        this.changeInputElKey('step', value)

        // todo: adjust min & max value => see: form.field.Number
    }

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @param {Boolean} [preventListSelect=false]
     * @protected
     */
    afterSetValue(value, oldValue, preventListSelect=false) {
        super.afterSetValue(value, oldValue);

        let me = this;

        me.getTrigger('time').value = value;

        if (me.pickerIsMounted && !preventListSelect) {
            me.selectCurrentListItem(true)
        }
    }

    /**
     * Gets triggered before getting the value of the valueFormat config
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeGetValueFormat(value, oldValue) {
        if (!value) {
            this._valueFormat = value = new Intl.DateTimeFormat(Neo.config.locale, {
                hour  : '2-digit',
                minute: '2-digit',
                second: this.stepSize < 60 ? '2-digit' : undefined,
                hour12: false
            })
        }

        return value
    }

    /**
     * Triggered before the maxValue config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetMaxValue(value, oldValue) {
        if (value) {
            if (value.includes('24') || (value.startsWith('12') && value.includes('AM'))) {
                return '23:59:00'
            }
        }

        return this.formatTime(value)
    }

    /**
     * Triggered before the minValue config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetMinValue(value, oldValue) {
        return this.formatTime(value)
    }

    /**
     * Triggered before the value config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetValue(value, oldValue) {
        return this.formatTime(value)
    }

    /**
     * @returns {String[]}
     */
    createCollectionItems() {
        let me          = this,
            currentDate = new Date(),
            end         = me.maxValue.split(':').map(Number),
            endDate     = new Date(),
            start       = me.minValue.split(':').map(Number),
            listItems   = [];

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            hour  : '2-digit',
            minute: '2-digit',
            second: me.stepSize < 60 ? '2-digit' : undefined
        });

        currentDate.setHours(...start);
        endDate    .setHours(...end);

        while (currentDate <= endDate) {
            listItems.push({
                value: dt.format(currentDate)
            });

            currentDate.setSeconds(currentDate.getSeconds() + me.stepSize)
        }

        return listItems
    }

    /**
     * @returns {Neo.component.DateSelector}
     */
    createPickerComponent() {
        return this.list
    }

    /**
     * @param {Function} [callback]
     */
    focusInputEl(callback) {
        let me = this;

        Neo.main.DomAccess.focus({
            appName: me.appName,
            id     : me.getInputElId()
        }).then(() => {
            callback?.apply(me)
        })
    }

    /**
     * Transforms AM / PM based times into a 24h format.
     * E.g. "08:00 AM" => "08:00"
     * @param {String|null} value
     * @protected
     * @returns {String|null}
     */
    formatTime(value) {
        if (value) {
            return this.valueFormat.format(new Date(`November 23, 2019  ${value}`))
        }

        return value
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEnter(data) {
        this.hidePicker()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEscape(data) {
        this.focusInputEl(this.hidePicker)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onKeyDownEnter(data) {
        let me = this;

        if (me.pickerIsMounted) {
            super.onKeyDownEnter(data);
            me.selectCurrentListItem()
        } else {
            super.onKeyDownEnter(data, me.selectCurrentListItem)
        }
    }

    /**
     * @param {Object} record
     */
    onListItemClick(record) {
        let me       = this,
            oldValue = me.value,
            {value}  = record;

        if (me.value !== value) {
            value = me.formatTime(value);

            me._value = value;
            me.afterSetValue(value, oldValue, true) // prevent the list from getting selected / focused
        }
    }

    /**
     * @param {Object} record
     */
    onListItemNavigate(record) {
        this.onListItemClick(record)
    }

    /**
     *
     */
    recreateListItems() {
        let me = this;

        me.collection.clear();
        me.collection.add(me.createCollectionItems());
        me.list.createItems()
    }

    /**
     * Resets the field to its original value or null depending on the clearToOriginalValue config
     * You can optionally pass a new value, which will adjust the originalConfig.value if needed.
     * @param {String|null} [value]
     */
    reset(value) {
        let me = this;

        if (value && me.clearToOriginalValue) {
            me.originalConfig.value = me.formatTime(value)
        }

        me.value = me.clearToOriginalValue ? me.originalConfig.value : null
    }

    /**
     * @param {Boolean} [preventFocus=false]
     */
    selectCurrentListItem(preventFocus=false) {
        let me     = this,
            {list} = me,
            id     = list.getItemId(me.value);

        list.selectionModel.select(id);

        if (!preventFocus) {
            list.focus(id)
        } else {
            Neo.main.DomAccess.scrollIntoView({
                appName: me.appName,
                id     : id
            })
        }
    }
}

Neo.setupClass(Time);

export default Time;
