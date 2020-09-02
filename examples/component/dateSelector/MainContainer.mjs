import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import DateSelector          from '../../../src/component/DateSelector.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container'
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getMonth() === 0,
            hideValueLabel: false,
            labelText     : 'currentDate (month)',
            listeners     : {change: me.onMonthRadioChange.bind(me, 0)},
            name          : 'month',
            valueLabelText: 'Jan'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getMonth() === 1,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 1)},
            name          : 'month',
            valueLabelText: 'Feb'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getMonth() === 2,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 2)},
            name          : 'month',
            valueLabelText: 'Mar'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getMonth() === 3,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onMonthRadioChange.bind(me, 3)},
            name          : 'month',
            valueLabelText: 'Apr'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getFullYear() === 2021,
            hideValueLabel: false,
            labelText     : 'currentDate (year)',
            listeners     : {change: me.onYearRadioChange.bind(me, 2021)},
            name          : 'year',
            style         : {marginTop: '10px'},
            valueLabelText: '2021'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getFullYear() === 2020,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2020)},
            name          : 'year',
            valueLabelText: '2020'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getFullYear() === 2019,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2019)},
            name          : 'year',
            valueLabelText: '2019'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.currentDate.getFullYear() === 2018,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onYearRadioChange.bind(me, 2018)},
            name          : 'year',
            valueLabelText: '2018'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.dayNameFormat === 'narrow',
            hideValueLabel: false,
            labelText     : 'dayNameFormat',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'narrow')},
            name          : 'dayNameFormat',
            style         : {marginTop: '10px'},
            valueLabelText: 'narrow'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.dayNameFormat === 'short',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'short')},
            name          : 'dayNameFormat',
            valueLabelText: 'short'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.dayNameFormat === 'long',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'dayNameFormat', 'long')},
            name          : 'dayNameFormat',
            valueLabelText: 'long'
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 800,
            minValue  : 230,
            stepSize  : 10,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.showCellBorders,
            labelText: 'showCellBorders',
            listeners: {change: me.onConfigChange.bind(me, 'showCellBorders')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.showDisabledDays,
            labelText: 'showDisabledDays',
            listeners: {change: me.onConfigChange.bind(me, 'showDisabledDays')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.useAnimations,
            labelText: 'useAnimations',
            listeners: {change: me.onConfigChange.bind(me, 'useAnimations')},
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : me.exampleComponent.weekStartDay === 6,
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            listeners     : {change: me.onRadioChange.bind(me, 'weekStartDay', 6)},
            name          : 'weekStartDay',
            style         : {marginTop: '10px'},
            valueLabelText: '6 (Saturday)'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.weekStartDay === 0,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'weekStartDay', 0)},
            name          : 'weekStartDay',
            valueLabelText: '0 (Sunday)'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.weekStartDay === 1,
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
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create(DateSelector, {
            height: 300,
            width : 300
        });
    }

    onMonthRadioChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            let date = this.exampleComponent.currentDate;
            date.setMonth(value);
            this.exampleComponent.currentDate = date;
        }
    }

    onYearRadioChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            let date = this.exampleComponent.currentDate;
            date.setFullYear(value);
            this.exampleComponent.currentDate = date;
        }
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};