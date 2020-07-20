import {default as Collection}  from '../../collection/Base.mjs';
import {default as List}        from '../../list/Base.mjs';
import Picker                   from './Picker.mjs';
import {default as TimeTrigger} from './trigger/Time.mjs';

/**
 *
 * @class Neo.form.field.Time
 * @extends Neo.form.field.Picker
 */
class Time extends Picker {
    static getConfig() {return {
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
         * @member {String[]} cls=['neo-timefield', 'neo-pickerfield', 'neo-textfield']
         */
        cls: ['neo-timefield', 'neo-pickerfield', 'neo-textfield'],
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
         * Defaults to 1min
         * @member {Number} stepSize_=60*5
         */
        stepSize_: 60*5, // 5min
        /**
         * @member {Object|Object[]} triggers=[{module: TimeTrigger}]
         * @protected
         */
        triggers: [{
            module: TimeTrigger
        }]
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.collection = Neo.create({
            module     : Collection,
            items      : me.createCollectionItems(),
            keyProperty: 'value'
        });

        me.list = Neo.create({
            module        : List,
            displayField  : 'value',
            store         : me.collection,
            ...me.listConfig || {}
        });

        me.list.keys._keys.push(
            {fn: 'onContainerKeyDownEnter',  key: 'Enter',  scope: me.id},
            {fn: 'onContainerKeyDownEscape', key: 'Escape', scope: me.id}
        );

        me.list.on({
            itemClick   : me.onListItemClick,
            itemNavigate: me.onListItemNavigate,
            scope       : me
        });
    }

    /**
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        this.changeInputElKey('max', value);
    }

    /**
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        this.changeInputElKey('min', value);
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStepSize(value, oldValue) {
        this.changeInputElKey('step', value);

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

        if (this.pickerIsMounted && !preventListSelect) {
            this.selectCurrentListItem(true);
        }
    }

    /**
     * Triggered before the maxValue config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMaxValue(value, oldValue) {
        // todo: check format => '08:00'
        return value;
    }

    /**
     * Triggered before the minValue config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMinValue(value, oldValue) {
        // todo: check format => '08:00'
        return value;
    }

    /**
     *
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

        if (end.length < 3) {end.push(0);}
        endDate.setHours(...end);

        if (start.length < 3) {start.push(0);}
        currentDate.setHours(...start);

        while (currentDate <= endDate) {//console.log(currentDate);
            listItems.push({
                value: dt.format(currentDate)
            });

            currentDate.setSeconds(currentDate.getSeconds() + me.stepSize);
        }

        return listItems;
    }

    /**
     *
     * @returns {Neo.component.DateSelector}
     */
    createPickerComponent() {
        return this.list;
    }

    /**
     *
     * @param {Function} [callback]
     */
    focusInputEl(callback) {
        let me = this;

        Neo.main.DomAccess.focus({
            id: me.getInputElId()
        }).then(() => {
            if (callback) {
                callback.apply(me);
            }
        });
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEnter(data) {
        this.hidePicker();
    }

    /**
     * @param {Object} data
     * @protected
     */
    onContainerKeyDownEscape(data) {
        this.focusInputEl(this.hidePicker);
    }

    /**
     *
     * @param {Object} data
     * @protected
     */
    onKeyDownEnter(data) {
        let me = this;

        if (me.pickerIsMounted) {
            super.onKeyDownEnter(data);
            me.selectCurrentListItem();
        } else {
            super.onKeyDownEnter(data, me.selectCurrentListItem);
        }
    }

    /**
     *
     * @param {Object} record
     */
    onListItemClick(record) {
        let me       = this,
            oldValue = me.value,
            value    = record.value;

        if (me.value !== value) {
            me._value = value;
            me.afterSetValue(value, oldValue, true); // prevent the list from getting selected / focussed
        }
    }

    /**
     *
     * @param {Object} record
     */
    onListItemNavigate(record) {
        this.onListItemClick(record);
    }

    /**
     * @param {Boolean} [preventFocus=false]
     */
    selectCurrentListItem(preventFocus=false) {
        let me   = this,
            list = me.list,
            id   = list.getItemId(me.value);

        list.selectionModel.select(id);

        if (!preventFocus) {
            list.focus(id);
        } else {
            Neo.main.DomAccess.scrollIntoView({
                id: id
            });
        }
    }
}

Neo.applyClassConfig(Time);

export {Time as default};