import CheckBoxField from '../../../form/field/CheckBox.mjs';
import Container     from '../../../container/Base.mjs';
import NumberField   from '../../../form/field/Number.mjs';
import RadioField    from '../../../form/field/Radio.mjs';

/**
 * @class Neo.calendar.view.settings.WeekContainer
 * @extends Neo.container.Base
 */
class WeekContainer extends Container {
    static config = {
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
    }

    /**
     *
     */
    createContent() {
        let me            = this,
            weekComponent = me.getWeekComponent(),
            timeAxis      = weekComponent.timeAxis || {};

        me.add([{
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
            module        : CheckBoxField,
            checked       : weekComponent.showEventEndTime,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange, scope: me},
            name          : 'showEventEndTime',
            style         : {marginTop: '10px'},
            valueLabelText: 'showEventEndTime'
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'start',
            fieldValue    : 'start',
            hideValueLabel: false,
            labelText     : 'timeAxisPosition',
            listeners     : {change: me.onTimeAxisPositionChange, scope: me},
            name          : 'timeAxisPosition',
            style         : {marginTop: '10px'},
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
        }]);
    }

    /**
     * @returns {Neo.calendar.view.TimeAxisComponent}
     */
    getTimeAxis() {
        return this.getWeekComponent().timeAxis;
    }

    /**
     * @returns {Neo.calendar.view.Component}
     */
    getWeekComponent() {
        return this.up('calendar-maincontainer').weekComponent;
    }

    /**
     * @param {Object} data
     */
    onConfigChange(data) {
        this.getWeekComponent()[data.component.name] = data.value;
    }

    /**
     * @param {Object} data
     */
    onTimeAxisConfigChange(data) {
        this.getTimeAxis()[data.component.name] = data.value;
    }

    /**
     * @param {Object} data
     */
    onTimeAxisPositionChange(data) {
        if (data.value) {
            this.getWeekComponent().timeAxisPosition = data.component.fieldValue;
        }
    }
}

Neo.setupClass(WeekContainer);

export default WeekContainer;
