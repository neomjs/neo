import {default as Container}   from '../../../container/Base.mjs';
import {default as NumberField} from '../../../form/field/Number.mjs';
import {default as RadioField}  from '../../../form/field/Radio.mjs';
import {default as TimeField}   from '../../../form/field/Time.mjs';

/**
 * @class Neo.calendar.view.settings.WeekContainer
 * @extends Neo.container.Base
 */
class WeekContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.WeekContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.WeekContainer',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            flex      : 'none',
            labelWidth: 130,
            style     : {marginTop: '5px'}
        },
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);

        let me            = this,
            weekComponent = me.getWeekComponent();

        me.items = [{
            module   : TimeField,
            clearable: false,
            labelText: 'Start Time',
            listeners : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue : '10:00',
            minValue : '00:00',
            name     : 'startTime',
            stepSize : 60 * 60, // 1h
            style    : {},
            value    : '00:00'
        }, {
            module   : TimeField,
            labelText: 'End Time',
            listeners : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue : '23:00',
            minValue : '14:00',
            name     : 'endTime',
            stepSize : 60 * 60 // 1h
        }, {
            module        : NumberField,
            clearable     : false,
            excludedValues: [45],
            inputEditable : false,
            labelText     : 'Interval',
            listeners     : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue      : 60,
            minValue      : 15,
            name          : 'interval',
            stepSize      : 15,
            value         : 30
        }, {
            module   : NumberField,
            clearable: false,
            labelText: 'Row Height',
            listeners: {change: me.onTimeAxisConfigChange, scope: me},
            maxValue : 100,
            minValue : 8,
            name     : 'rowHeight',
            stepSize : 2,
            value    : 20
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'start',
            fieldValue    : 'start',
            hideValueLabel: false,
            labelText     : 'timeAxisPosition',
            listeners     : {change: me.onTimeAxisPositionChange, scope: me},
            name          : 'timeAxisPosition',
            valueLabelText: 'start'
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'end',
            fieldValue    : 'end',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onTimeAxisPositionChange, scope: me},
            name          : 'timeAxisPosition',
            valueLabelText: 'end'
        }];
    }

    /**
     *
     * @return {Neo.calendar.view.TimeAxisComponent}
     */
    getTimeAxis() {
        return this.getWeekComponent().timeAxis;
    }

    /**
     *
     * @return {Neo.calendar.view.WeekComponent}
     */
    getWeekComponent() {
        return this.up('calendar-maincontainer').weekComponent;
    }

    /**
     *
     * @param {Object} data
     */
    onTimeAxisConfigChange(data) {
        this.getTimeAxis()[data.component.name] = data.value;
    }

    /**
     *
     * @param data
     */
    onTimeAxisPositionChange(data) {
        if (data.value) {
            this.getWeekComponent().timeAxisPosition = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(WeekContainer);

export {WeekContainer as default};