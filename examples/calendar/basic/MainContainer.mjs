import Button                   from '../../../src/component/Button.mjs';
import {default as Calendar}    from '../../../src/calendar/MainContainer.mjs';
import MainContainerController  from './MainContainerController.mjs';
import {default as NumberField} from '../../../src/form/field/Number.mjs';
import {default as TimeField}   from '../../../src/form/field/Time.mjs';
import Toolbar                  from '../../../src/container/Toolbar.mjs';
import Viewport                 from '../../../src/container/Viewport.mjs';

/**
 * @class CalendarBasic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'CalendarBasic.MainContainer',
        ntype    : 'calendar-basic-maincontainer',

        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module : Toolbar,
            flex   : 'none',
            padding: 20,
            reference: 'headerToolbar',

            style: {
                padding: '10px 5px 10px 10px'
            },

            items: ['->', {
                module : Button,
                handler: 'onWeekStartDayButtonClick',
                height : 27,
                style  : {marginRight: '10px'},
                text   : 'weekStartDay: Monday'
            }, {
                module       : TimeField,
                clearable    : false,
                labelPosition: 'inline',
                labelText    : 'Start Time',
                listeners    : {change: 'onStartTimeFieldChange'},
                maxValue     : '10:00',
                minValue     : '00:00',
                stepSize     : 60 * 60, // 1h
                style        : {marginRight: '10px'},
                value        : '00:00',
                width        : 120
            }, {
                module       : TimeField,
                labelPosition: 'inline',
                labelText    : 'End Time',
                listeners    : {change: 'onEndTimeFieldChange'},
                maxValue     : '23:00',
                minValue     : '14:00',
                stepSize     : 60 * 60, // 1h
                style        : {marginRight: '10px'},
                width        : 120
            }, {
                module        : NumberField,
                clearable     : false,
                excludedValues: [45],
                inputEditable : false,
                labelPosition : 'inline',
                labelText     : 'Interval',
                listeners     : {change: 'onIntervalFieldChange'},
                maxValue      : 60,
                minValue      : 15,
                stepSize      : 15,
                style         : {marginRight: '10px'},
                value         : 30,
                width         : 120
            }, {
                module       : NumberField,
                clearable    : false,
                labelPosition: 'inline',
                labelText    : 'Row Height',
                listeners    : {change: 'onRowHeightFieldChange'},
                maxValue     : 100,
                minValue     : 8,
                stepSize     : 2,
                style        : {marginRight: '10px'},
                value        : 20,
                width        : 120
            }, {
                module : Button,
                handler: 'onSwitchThemeButtonClick',
                height : 27,
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }]
        }, {
            module   : Calendar,
            reference: 'calendar',
            flex     : 1,

            eventStoreConfig: {
                autoLoad: true,
                url     : '../../examples/calendar/basic/data/events.json'
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};