import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';
import TabContainer          from '../../../src/tab/Container.mjs';

/**
 * @summary An interactive example demonstrating the Neo.tab.Container.
 *
 * This class creates a viewport that showcases the `Neo.tab.Container`, a component for managing
 * a collection of child components in a tabbed interface. It extends `ConfigurationViewport` to provide
 * a side-by-side view with the live tab container on one side and a configuration panel on the other.
 * The panel allows for dynamic manipulation of the container's properties, such as `activeIndex`,
 * `tabBarPosition`, and individual tab headers, to demonstrate the component's extensive features
 * and reactivity.
 *
 * @class Neo.examples.tab.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 * @see Neo.tab.Container
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.tab.container.MainContainer'
         * @protected
         */
        className: 'Neo.examples.tab.container.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Number} configItemLabelWidth=160
         */
        configItemLabelWidth: 160,
        /**
         * @member {Number} configItemWidth=280
         */
        configItemWidth: 280,
        /**
         * The layout for the viewport, arranging the configuration panel and the example component horizontally.
         * @member {Object} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * Overridden from `ConfigurationViewport`. This method defines the set of form fields that will be
     * displayed in the configuration panel. These fields are bound to the properties of the example
     * TabContainer, allowing for real-time manipulation of its appearance and behavior.
     * @returns {Object[]} An array of component configuration objects.
     */
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

    /**
     * Overridden from `ConfigurationViewport`. This method creates the actual `TabContainer` instance
     * to be demonstrated. It is configured with three initial tabs and a listener to sync user-driven
     * tab changes back to the configuration panel.
     * @returns {Neo.tab.Container} The configured TabContainer instance.
     */
    createExampleComponent() {
        return Neo.create(TabContainer, {
            height  : 300,
            width   : 500,
            sortable: true,
            style   : {margin: '20px'},

            itemDefaults: {
                ntype: 'component',
                cls  : ['neo-examples-tab-component'],
                style: {padding: '20px'}
            },

            items: [{
                header: {iconCls: 'fa fa-home', text: 'Tab 1', flag: 'tab1',},
                vdom  : {html: 'Tab 1 Content'}
            }, {
                header: {iconCls: 'fa fa-play-circle', text: 'Tab 2'},
                vdom  : {html: 'Tab 2 Content'}
            }, {
                header: {iconCls: 'fa fa-user', text: 'Tab 3', badgeText: 'hello'},
                vdom  : {html: 'Tab 3 Content'}
            }],

            listeners: {
                activeIndexChange: this.onUserActiveIndexChange,
                scope            : this
            }
        })
    }

    /**
     * A helper method to retrieve the header button for the third tab, which is used for demonstrating
     * badge functionality.
     * @returns {Neo.tab.header.Button}
     */
    getBadgeTabHeader() {
        let tabHeaders = this.exampleComponent.getTabBar().items,
            item;

        for (item of tabHeaders) {
            if (item.text === 'Tab 3') {
                return item
            }
        }
    }

    /**
     * A helper method to retrieve the header button for the first tab, identified by a unique `flag` property.
     * This allows for stable targeting of the tab even if its text or position changes.
     * @returns {Neo.tab.header.Button}
     */
    getFirstTabHeader() {
        let tabHeaders = this.exampleComponent.getTabBar().items,
            item;

        for (item of tabHeaders) {
            if (item.flag === 'tab1') {
                return item
            }
        }
    }

    /**
     * Handles the change event from various text fields in the configuration panel that control the
     * properties of the third tab's header (the "badge tab").
     * @param {String} config The name of the config property to change (e.g., 'badgeText').
     * @param {Object} opts The event data from the field's change event.
     * @param {String} opts.value The new value for the config.
     */
    onBadgeConfigChange(config, opts) {
        this.getBadgeTabHeader()[config] = opts.value
    }

    /**
     * Handles the change event from the radio group controlling the `badgePosition` config.
     * It ensures the config is only updated when a radio button is checked, not unchecked.
     * @param {String} config The name of the config property to change (always 'badgePosition').
     * @param {String} value The new value for the badge position (e.g., 'top-right').
     * @param {Object} opts The event data from the radio's change event.
     * @param {Boolean} opts.value The checked state of the radio button.
     */
    onBadgeRadioChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.getBadgeTabHeader()[config] = value
        }
    }

    /**
     * Handles the change event from various text fields in the configuration panel that control the
     * properties of the first tab's header.
     * @param {String} config The name of the config property to change (e.g., 'text', 'iconCls').
     * @param {Object} opts The event data from the field's change event.
     * @param {String} opts.value The new value for the config.
     */
    onFirstTabHeaderConfigChange(config, opts) {
        this.getFirstTabHeader()[config] = opts.value
    }

    /**
     * Handles the change event from the 'reversed layout sort-direction' checkbox. This method
     * dynamically modifies the `direction` of the tab bar's layout to demonstrate how the visual
     * order of the tabs can be reversed.
     * @param {Object} data The event data from the checkbox change event.
     * @param {Boolean} data.value The new checked state of the checkbox.
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
     * Handles the change event from the radio group controlling the `tabBarPosition` config.
     * It updates the tab container's config and also intelligently adjusts the 'reversed layout'
     * checkbox, as the concept of a reversed direction is only meaningful for 'left' and 'right' positions.
     * @param {String} value The new value for the tab bar position (e.g., 'top', 'right').
     * @param {Object} opts The event data from the radio's change event.
     * @param {Boolean} opts.value The checked state of the radio button.
     */
    onTabBarPositionChange(value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.onRadioChange('tabBarPosition', value, opts);
            Neo.getComponent('reverseLayoutDirection').checked = value === 'left'
        }

    }

    /**
     * This listener responds to the `activeIndexChange` event fired by the `TabContainer` when a user
     * clicks on a tab. Its purpose is to synchronize the UI, ensuring that the `activeIndex` number field
     * in the configuration panel accurately reflects the currently active tab.
     * @param {Object} opts The event data from the `activeIndexChange` event.
     * @param {Number} opts.value The new active index.
     */
    onUserActiveIndexChange(opts) {
        Neo.getComponent('activeIndexField').value = opts.value
    }
}

export default Neo.setupClass(MainContainer);
