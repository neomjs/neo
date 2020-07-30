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
        this.createItems();
    }

    /**
     *
     */
    createItems() {
        let me            = this,
            weekComponent = me.getWeekComponent(),
            timeAxis      = weekComponent.timeAxis;

        me.items = [{
            module              : TimeField,
            clearable           : true,
            clearToOriginalValue: true,
            labelText           : 'startTime',
            listeners           : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue            : '10:00',
            minValue            : '00:00',
            name                : 'startTime',
            stepSize            : 60 * 60, // 1h
            style               : {},
            value               : timeAxis.startTime
        }, {
            module   : TimeField,
            labelText: 'endTime',
            listeners: {change: me.onTimeAxisConfigChange, scope: me},
            maxValue : '23:00',
            minValue : '14:00',
            name     : 'endTime',
            stepSize : 60 * 60, // 1h
            value    : timeAxis.endTime !== '24:00' ? timeAxis.endTime : undefined
        }, {
            module              : NumberField,
            clearable           : true,
            clearToOriginalValue: true,
            excludedValues      : [45],
            inputEditable       : false,
            labelText           : 'interval',
            listeners           : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue            : 60,
            minValue            : 15,
            name                : 'interval',
            stepSize            : 15,
            value               : timeAxis.interval
        }, {
            module              : NumberField,
            clearable           : true,
            clearToOriginalValue: true,
            labelText           : 'rowHeight',
            listeners           : {change: me.onTimeAxisConfigChange, scope: me},
            maxValue            : 100,
            minValue            : 8,
            name                : 'rowHeight',
            stepSize            : 2,
            value               : timeAxis.rowHeight
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

        super.createItems();
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