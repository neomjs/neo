import {default as Container}  from '../../../container/Base.mjs';
import {default as RadioField} from '../../../form/field/Radio.mjs';
import {default as TimeField}  from '../../../form/field/Time.mjs';

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
            module    : TimeField,
            clearable : false,
            flex      : 'none',
            labelText : 'Start Time',
            labelWidth: 130,
            listeners : {change: me.onStartTimeChange, scope: me},
            maxValue  : '10:00',
            minValue  : '00:00',
            stepSize  : 60 * 60, // 1h
            value     : '00:00'
        }, {
            module    : TimeField,
            flex      : 'none',
            labelText : 'End Time',
            labelWidth: 130,
            listeners : {change: me.onEndTimeChange, scope: me},
            maxValue  : '23:00',
            minValue  : '14:00',
            stepSize  : 60 * 60, // 1h
            style     : {marginTop: '5px'}
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'start',
            fieldValue    : 'start',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'timeAxisPosition',
            labelWidth    : 130,
            listeners     : {change: me.onTimeAxisPositionChange, scope: me},
            name          : 'timeAxisPosition',
            style         : {marginTop: '5px'},
            valueLabelText: 'start'
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'end',
            fieldValue    : 'end',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 130,
            listeners     : {change: me.onTimeAxisPositionChange, scope: me},
            name          : 'timeAxisPosition',
            style         : {marginTop: '5px'},
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
    onEndTimeChange(data) {
        this.getTimeAxis().endTime = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onStartTimeChange(data) {
        this.getTimeAxis().startTime = data.value;
    }

    /**
     *
     * @param opts
     */
    onTimeAxisPositionChange(opts) {
        if (opts.value) {
            this.getWeekComponent().timeAxisPosition = opts.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(WeekContainer);

export {WeekContainer as default};