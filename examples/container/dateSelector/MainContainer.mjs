import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import DateField             from '../../../src/form/field/Date.mjs';
import DateSelector          from '../../../src/container/DateSelector.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.container.dateSelector.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className: 'Neo.examples.container.dateSelector.MainContainer'
    }

    createConfigurationComponents() {
        let me               = this,
            exampleComponent = me.exampleComponent;

        return [{
            module        : Radio,
            checked       : exampleComponent.currentDate.getMonth() === 0,
            hideValueLabel: false,
            labelText     : 'currentDate (month)',
            listeners     : {change: me.onMonthRadioChange.bind(me, 0)},
            name          : 'month',
            valueLabelText: 'Jan'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getMonth() === 1,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 1)},
            name          : 'month',
            valueLabelText: 'Feb'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getMonth() === 2,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 2)},
            name          : 'month',
            valueLabelText: 'Mar'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getMonth() === 3,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 3)},
            name          : 'month',
            valueLabelText: 'Apr'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getFullYear() === 2025,
            hideValueLabel: false,
            labelText     : 'currentDate (year)',
            listeners     : {change: me.onYearRadioChange.bind(me, 2025)},
            name          : 'year',
            style         : {marginTop: '10px'},
            valueLabelText: '2025'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getFullYear() === 2024,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2024)},
            name          : 'year',
            valueLabelText: '2024'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getFullYear() === 2023,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2023)},
            name          : 'year',
            valueLabelText: '2023'
        }, {
            module        : Radio,
            checked       : exampleComponent.currentDate.getFullYear() === 2022,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2022)},
            name          : 'year',
            valueLabelText: '2022'
        }, {
            module        : Radio,
            checked       : exampleComponent.dayNameFormat === 'narrow',
            hideValueLabel: false,
            labelText     : 'dayNameFormat',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'narrow')},
            name          : 'dayNameFormat',
            style         : {marginTop: '10px'},
            valueLabelText: 'narrow'
        }, {
            module        : Radio,
            checked       : exampleComponent.dayNameFormat === 'short',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'short')},
            name          : 'dayNameFormat',
            valueLabelText: 'short'
        }, {
            module        : Radio,
            checked       : exampleComponent.dayNameFormat === 'long',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'long')},
            name          : 'dayNameFormat',
            valueLabelText: 'long'
        }, {
            module    : NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 800,
            minValue  : 230,
            stepSize  : 10,
            style     : {marginTop: '10px'},
            value     : exampleComponent.height
        }, {
            module          : DateField,
            labelText       : 'maxValue',
            listeners       : {change: me.onConfigChange.bind(me, 'maxValue')},
            matchPickerWidth: false,
            value           : exampleComponent.maxValue
        }, {
            module          : DateField,
            labelText       : 'minValue',
            listeners       : {change: me.onConfigChange.bind(me, 'minValue')},
            matchPickerWidth: false,
            value           : exampleComponent.minValue
        }, {
            module   : CheckBox,
            checked  : exampleComponent.showCellBorders,
            labelText: 'showCellBorders',
            listeners: {change: me.onConfigChange.bind(me, 'showCellBorders')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : exampleComponent.showDisabledDays,
            labelText: 'showDisabledDays',
            listeners: {change: me.onConfigChange.bind(me, 'showDisabledDays')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : exampleComponent.useAnimations,
            labelText: 'useAnimations',
            listeners: {change: me.onConfigChange.bind(me, 'useAnimations')},
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : exampleComponent.weekStartDay === 6,
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            listeners     : {change: me.onRadioChange.bind(me, 'weekStartDay', 6)},
            name          : 'weekStartDay',
            style         : {marginTop: '10px'},
            valueLabelText: '6 (Saturday)'
        }, {
            module        : Radio,
            checked       : exampleComponent.weekStartDay === 0,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'weekStartDay', 0)},
            name          : 'weekStartDay',
            valueLabelText: '0 (Sunday)'
        }, {
            module        : Radio,
            checked       : exampleComponent.weekStartDay === 1,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'weekStartDay', 1)},
            name          : 'weekStartDay',
            valueLabelText: '1 (Monday)'
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 800,
            minValue  : 240,
            stepSize  : 10,
            style     : {marginTop: '10px'},
            value     : exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create(DateSelector, {
            height: 300,
            width : 300
        })
    }

    onMonthRadioChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            let date = this.exampleComponent.currentDate;
            date?.setMonth(value);
            this.exampleComponent.currentDate = date;
        }
    }

    onYearRadioChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            let date = this.exampleComponent.currentDate;
            date?.setFullYear(value);
            this.exampleComponent.currentDate = date;
        }
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
