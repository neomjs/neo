import CheckBox                  from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport     from '../../ConfigurationViewport.mjs';
import {default as NumberField}  from '../../../src/form/field/Number.mjs';
import {default as PickerField}  from '../../../src/form/field/Picker.mjs';
import Radio                     from '../../../src/form/field/Radio.mjs';
import {default as TextField}    from '../../../src/form/field/Text.mjs';
import {default as TabContainer} from '../../../src/tab/Container.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount           : true,
        configItemLabelWidth: 130,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            id       : 'activeIndexField',
            labelText: 'activeIndex',
            listeners: {change: me.onConfigChange.bind(me, 'activeIndex')},
            maxValue : 2,
            minValue : 0,
            value    : me.exampleComponent.activeIndex
        }, {
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 300,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module        : Radio,
            checked       : me.exampleComponent.tabBarPosition === 'top',
            hideValueLabel: false,
            labelText     : 'tabBarPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'tabBarPosition', 'top')},
            name          : 'tabBarPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'top'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.tabBarPosition === 'right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'tabBarPosition', 'right')},
            name          : 'tabBarPosition',
            valueLabelText: 'right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.tabBarPosition === 'bottom',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'tabBarPosition', 'bottom')},
            name          : 'tabBarPosition',
            valueLabelText: 'bottom'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.tabBarPosition === 'left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'tabBarPosition', 'left')},
            name          : 'tabBarPosition',
            valueLabelText: 'left'
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 250,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }, {
            module        : CheckBox,
            checked       : me.exampleComponent.useActiveTabIndicator,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'useActiveTabIndicator')},
            name          : 'tabBarPosition',
            style         : {marginTop: '20px'},
            valueLabelText: 'useActiveTabIndicator'
        }, {
            module   : PickerField, // todo: SelectField
            labelText: 'Tab 1 iconCls',
            listeners: {change: me.onFirstTabHeaderConfigChange.bind(me, 'iconCls')},
            style    : {marginTop: '50px'},
            value    : me.getFirstTabHeader().iconCls
        }, {
            module   : TextField, // todo: ColorPicker
            labelText: 'Tab 1 iconColor',
            listeners: {change: me.onFirstTabHeaderConfigChange.bind(me, 'iconColor')},
            value    : me.getFirstTabHeader().iconColor
        }, {
            module   : TextField,
            labelText: 'Tab 1 text',
            listeners: {change: me.onFirstTabHeaderConfigChange.bind(me, 'text')},
            value    : me.getFirstTabHeader().text
        }];
    }

    createExampleComponent() {
        return Neo.create(TabContainer, {
            height: 300,
            width : 500,
            style : {margin: '20px'},

            itemDefaults: {
                ntype: 'component',
                cls  : ['neo-examples-tab-component'],
                style: {
                    padding: '20px'
                }
            },

            items: [{
                tabButtonConfig: {iconCls: 'fa fa-home',        text     : 'Tab 1'},
                vdom           : {innerHTML: 'Tab 1 Content'}
            }, {
                tabButtonConfig: {iconCls: 'fa fa-play-circle', text     : 'Tab 2'},
                vdom           : {innerHTML: 'Tab 2 Content'}
            }, {
                tabButtonConfig: {iconCls: 'fa fa-user',        text     : 'Tab 3'},
                vdom           : {innerHTML: 'Tab 3 Content'}
            }],

            listeners: {
                activeIndexChange: this.onUserActiveIndexChange,
                scope            : this
            }
        });
    }

    /**
     *
     * @param {String} config
     * @param {Object} opts
     */
    onFirstTabHeaderConfigChange(config, opts) {
        this.exampleComponent.getTabBar().items[0][config] = opts.value;;
    }

    /**
     *
     * @returns {Neo.tab.HeaderButton}
     */
    getFirstTabHeader() {
        return this.exampleComponent.getTabBar().items[0];
    }

    /**
     *
     * @param {Object} opts
     */
    onUserActiveIndexChange(opts) {
        Neo.getComponent('activeIndexField').value = opts.value;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};