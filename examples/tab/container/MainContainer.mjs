import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import TabContainer          from '../../../src/tab/Container.mjs';

/**
 * @class Neo.examples.tab.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.tab.container.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me           = this,
            tabContainer = me.exampleComponent,
            headerLayout = tabContainer.getTabBar().layout;

        return [{
            module   : NumberField,
            id       : 'activeIndexField',
            labelText: 'activeIndex',
            listeners: {change: me.onConfigChange.bind(me, 'activeIndex')},
            maxValue : 2,
            minValue : 0,
            value    : tabContainer.activeIndex
        }, {
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 300,
            stepSize : 5,
            value    : tabContainer.height
        }, {
            module        : CheckBox,
            checked       : headerLayout.direction === 'column-reverse' || headerLayout.direction === 'row-reverse',
            hideLabel     : true,
            hideValueLabel: false,
            id            : 'reverseLayoutDirection',
            listeners     : {change: me.onLayoutSortDirectionChange.bind(me)},
            style         : {marginTop: '10px'},
            valueLabelText: 'reversed layout sort-direction'
        }, {
            module        : CheckBox,
            checked       : tabContainer.sortable,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'sortable')},
            style         : {marginTop: '10px'},
            valueLabelText: 'sortable'
        }, {
            module        : Radio,
            checked       : tabContainer.tabBarPosition === 'top',
            hideValueLabel: false,
            labelText     : 'tabBarPosition',
            listeners     : {change: me.onTabBarPositionChange.bind(me, 'top')},
            name          : 'tabBarPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'top'
        }, {
            module        : Radio,
            checked       : tabContainer.tabBarPosition === 'right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onTabBarPositionChange.bind(me, 'right')},
            name          : 'tabBarPosition',
            valueLabelText: 'right'
        }, {
            module        : Radio,
            checked       : tabContainer.tabBarPosition === 'bottom',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onTabBarPositionChange.bind(me, 'bottom')},
            name          : 'tabBarPosition',
            valueLabelText: 'bottom'
        }, {
            module        : Radio,
            checked       : tabContainer.tabBarPosition === 'left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onTabBarPositionChange.bind(me, 'left')},
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
            value    : tabContainer.width
        }, {
            module        : CheckBox,
            checked       : tabContainer.useActiveTabIndicator,
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange.bind(me, 'useActiveTabIndicator')},
            style         : {marginTop: '10px'},
            valueLabelText: 'useActiveTabIndicator'
        }, {
            module   : TextField, // todo: SelectField
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
        }, {
            module        : Radio,
            checked       : me.getBadgeTabHeader().badgePosition === 'bottom-left',
            hideValueLabel: false,
            labelText     : 'badgePosition',
            listeners     : {change: me.onBadgeRadioChange.bind(me, 'badgePosition', 'bottom-left')},
            name          : 'badgePosition',
            style         : {marginTop: '50px'},
            valueLabelText: 'bottom-left'
        }, {
            module        : Radio,
            checked       : me.getBadgeTabHeader().badgePosition === 'bottom-right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onBadgeRadioChange.bind(me, 'badgePosition', 'bottom-right')},
            name          : 'badgePosition',
            valueLabelText: 'bottom-right'
        }, {
            module        : Radio,
            checked       : me.getBadgeTabHeader().badgePosition === 'top-left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onBadgeRadioChange.bind(me, 'badgePosition', 'top-left')},
            name          : 'badgePosition',
            valueLabelText: 'top-left'
        }, {
            module        : Radio,
            checked       : me.getBadgeTabHeader().badgePosition === 'top-right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onBadgeRadioChange.bind(me, 'badgePosition', 'top-right')},
            name          : 'badgePosition',
            valueLabelText: 'top-right'
        }, {
            module   : TextField,
            labelText: 'badgeText',
            listeners: {change: me.onBadgeConfigChange.bind(me, 'badgeText')},
            style    : {marginTop: '10px'},
            value    : me.getBadgeTabHeader().badgeText
        }]
    }

    createExampleComponent() {
        return Neo.create(TabContainer, {
            height  : 300,
            width   : 500,
            sortable: true,
            style   : {margin: '20px'},

            itemDefaults: {
                ntype: 'component',
                cls  : ['neo-examples-tab-component'],
                style: {
                    padding: '20px'
                }
            },

            items: [{
                tabButtonConfig: {iconCls: 'fa fa-home',        text: 'Tab 1', flag: 'tab1',},
                vdom           : {innerHTML: 'Tab 1 Content'}
            }, {
                tabButtonConfig: {iconCls: 'fa fa-play-circle', text: 'Tab 2'},
                vdom           : {innerHTML: 'Tab 2 Content'}
            }, {
                tabButtonConfig: {iconCls: 'fa fa-user',        text: 'Tab 3', badgeText: 'hello'},
                vdom           : {innerHTML: 'Tab 3 Content'}
            }],

            listeners: {
                activeIndexChange: this.onUserActiveIndexChange,
                scope            : this
            }
        })
    }

    /**
     * @returns {Neo.tab.header.Button}
     */
    getBadgeTabHeader() {
        let tabHeaders = this.exampleComponent.getTabBar().items,
            item

        for (item of tabHeaders) {
            if (item.text === 'Tab 3') {
                return item
            }
        }
    }

    /**
     * @returns {Neo.tab.header.Button}
     */
    getFirstTabHeader() {
        let tabHeaders = this.exampleComponent.getTabBar().items,
            item

        for (item of tabHeaders) {
            if (item.flag === 'tab1') {
                return item
            }
        }
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onBadgeConfigChange(config, opts) {
        this.getBadgeTabHeader()[config] = opts.value
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onBadgeRadioChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.getBadgeTabHeader()[config] = value
        }
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onFirstTabHeaderConfigChange(config, opts) {
        this.getFirstTabHeader()[config] = opts.value
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Boolean} data.oldValue
     * @param {Boolean} data.value
     */
    onLayoutSortDirectionChange(data) {
        let layout    = this.exampleComponent.getTabBar().layout,
            direction = layout.direction;

        if (data.value === true) {
            if (!direction.includes('-reverse')) {
                direction += '-reverse'
            }
        } else {
            if (direction.includes('-reverse')) {
                direction = direction.substring(0, direction.indexOf('-reverse'))
            }
        }

        layout.direction = direction
    }

    /**
     * @param {String} value
     * @param {Object} opts
     */
    onTabBarPositionChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.onRadioChange('tabBarPosition', value, opts);
            Neo.getComponent('reverseLayoutDirection').checked = value === 'left'
        }

    }

    /**
     * @param {Object} opts
     */
    onUserActiveIndexChange(opts) {
        Neo.getComponent('activeIndexField').value = opts.value
    }
}

export default Neo.setupClass(MainContainer);
