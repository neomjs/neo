import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Container}       from '../container/Base.mjs';
import DateSelector                 from '../component/DateSelector.mjs';
import DateUtil                     from '../util/Date.mjs';
import {default as EventStore}      from './store/Events.mjs';
import ItemsContainer               from './ItemsContainer.mjs';
import Toolbar                      from '../container/Toolbar.mjs';
import WeekComponent                from './view/WeekComponent.mjs';

const todayDate = new Date();

/**
 * @class Neo.calendar.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.MainContainer'
         * @protected
         */
        className: 'Neo.calendar.MainContainer',
        /**
         * @member {String} ntype='calendar-maincontainer'
         * @protected
         */
        ntype: 'calendar-maincontainer',
        /**
         * @member {String[]} cls=['neo-container']
         */
        cls: ['neo-calendar-maincontainer', 'neo-container'],
        /**
         * The currently active date inside all views
         * @member {Date} currentDate_=new Date()
         */
        currentDate_: todayDate,
        /**
         * @member {Neo.component.DateSelector|null} dateSelector_=null
         */
        dateSelector_: null,
        /**
         * @member {Object|null} dateSelectorConfig=null
         */
        dateSelectorConfig: null,
        /**
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {Object|null} eventStoreConfig=null
         */
        eventStoreConfig: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Number} settingsContainerWidth=300
         */
        settingsContainerWidth: 300,
        /**
         * @member {Boolean} settingsExpanded_=false
         */
        settingsExpanded_: false,
        /**
         * @member {Boolean} sideBarExpanded_=true
         */
        sideBarExpanded_: true,
        /**
         * @member {Number} sideBarWidth=220
         */
        sideBarWidth: 220,
        /**
         * @member {Boolean} useSettingsContainer_=true
         */
        useSettingsContainer_: true,
        /**
         * @member {Neo.calendar.view.WeekComponent|null} weekComponent_=null
         */
        weekComponent_: null,
        /**
         * @member {Object|null} weekComponentConfig=null
         */
        weekComponentConfig: null,
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.createItemsContent();

        if (!me.sideBarExpanded) {
            me.afterSetSideBarExpanded(false, true);
        }
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            this.dateSelector .value       = DateUtil.convertToyyyymmdd(value);
            this.weekComponent.currentDate = value;
        }
    }

    /**
     * Triggered after the eventStore config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEventStore(value, oldValue) {
        if (oldValue !== undefined) {
            this.weekComponent.eventStore = value;
        }
    }

    /**
     * Triggered after the settingsExpanded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSettingsExpanded(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            console.log('afterSetSettingsExpanded', value);
        }
    }

    /**
     * Triggered after the sideBarExpanded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSideBarExpanded(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let sideBar = this.items[1].items[0],
                style   = sideBar.style || {};

            style.marginLeft = value ? '0': `-${this.sideBarWidth}px`;

            sideBar.style = style;
        }
    }

    /**
     * Triggered after the weekStartDay config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetWeekStartDay(value, oldValue) {
        if (oldValue !== undefined) {
            this.dateSelector .weekStartDay = value;
            this.weekComponent.weekStartDay = value;
        }
    }

    /**
     * Triggered when accessing the dateSelector config
     * @param {Object} value
     * @protected
     */
    beforeGetDateSelector(value) {
        if (!value) {
            value = this.dateSelector = this.down('dateselector');
        }

        return value;
    }

    /**
     * Triggered when accessing the weekComponent config
     * @param {Object} value
     * @protected
     */
    beforeGetWeekComponent(value) {
        if (!value) {
            value = this.weekComponent = this.down('calendar-view-weekComponent');
        }

        return value;
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.calendar.store.Events} value
     * @param {Neo.calendar.store.Events} oldValue
     * @protected
     */
    beforeSetEventStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.destroy();
        }

        const defaultValue = {
            listeners: {
                load : me.onEventStoreLoad,
                scope: me
            },
            ...me.eventStoreConfig || {}
        }

        return ClassSystemUtil.beforeSetInstance(value, EventStore, defaultValue);
    }

    /**
     *
     * @param {String} interval
     * @protected
     */
    changeTimeInterval(interval) {
        const map = {
            day  : 0,
            month: 2,
            week : 1,
            year : 3
        };

        this.items[1].items[1].layout.activeIndex = map[interval];

        this.items[0].items[1].items.forEach(item => {
            if (item.toggleGroup === 'timeInterval') {
                item.pressed = item.value === interval;
            }
        });
    }

    /**
     *
     * @protected
     */
    createItemsContent() {
        let me = this;

        me.items = [{
            module: Container,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                cls   : ['neo-calendar-header-toolbar', 'neo-left', 'neo-toolbar'],
                width : me.sideBarWidth,
                items : [{
                    handler: me.toggleSidebar.bind(me),
                    iconCls: 'fa fa-bars'
                }, '->', {
                    handler: me.onPreviousIntervalButtonClick.bind(me),
                    iconCls: 'fa fa-chevron-left',
                }, {
                    handler: me.onTodayButtonClick.bind(me),
                    height : 24,
                    text   : 'Today'
                }, {
                    handler: me.onNextIntervalButtonClick.bind(me),
                    iconCls: 'fa fa-chevron-right'
                }]
            }, {
                module: Toolbar,
                cls   : ['neo-calendar-header-toolbar', 'neo-toolbar'],
                items : ['->', {
                    handler    : me.changeTimeInterval.bind(me, 'day'),
                    height     : 24,
                    text       : 'Day',
                    toggleGroup: 'timeInterval',
                    value      : 'day'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'week'),
                    height     : 24,
                    pressed    : true,
                    text       : 'Week',
                    toggleGroup: 'timeInterval',
                    value      : 'week'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'month'),
                    height     : 24,
                    text       : 'Month',
                    toggleGroup: 'timeInterval',
                    value      : 'month'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'year'),
                    height     : 24,
                    text       : 'Year',
                    toggleGroup: 'timeInterval',
                    value      : 'year'
                }]
            }]
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: Container,
                cls   : ['neo-calendar-sidebar', 'neo-container'],
                layout: {ntype: 'vbox', align: 'stretch'},
                width : 220,
                items : [{
                    module      : DateSelector,
                    currentDate : me.currentDate,
                    flex        : 'none',
                    height      : me.sideBarWidth,
                    weekStartDay: me.weekStartDay,

                    listeners: {
                        change: me.onDateSelectorChange,
                        scope : me
                    },

                    ...me.dateSelectorConfig || {}
                }, {
                    module: ItemsContainer,
                    flex  : 1
                }]
            }, {
                module: Container,
                flex  : 1,
                layout: {ntype: 'card', activeIndex: 1},
                items : [{
                    ntype: 'component',
                    vdom : {innerHTML: 'Day'}
                }, {
                    module      : WeekComponent,
                    currentDate : me.currentDate,
                    eventStore  : me.eventStore,
                    weekStartDay: me.weekStartDay,
                    ...me.weekComponentConfig || {}
                }, {
                    ntype: 'component',
                    vdom : {innerHTML: 'Month'}
                }, {
                    ntype: 'component',
                    vdom : {innerHTML: 'Year'}
                }]
            }]
        }];

        if (me.useSettingsContainer) {
            me.items[0].items[1].items.push({
                handler: me.toggleSettings.bind(me),
                iconCls: 'fa fa-cog',
                style  : {marginLeft: '10px'}
            });
        }
    }

    /**
     *
     */
    destroy(...args) {
        // remove references, the super call will remove component tree based instances
        this.dateSelector  = null;
        this.weekComponent = null;

        super.destroy(...args);
    }

    /**
     *
     * @param {Object} opts
     * @param {String} opts.oldValue
     * @param {String} opts.value
     */
    onDateSelectorChange(opts) {
        if (opts.oldValue !== undefined) {
            this.currentDate = new Date(opts.value);
        }
    }

    /**
     *
     * @param {Object[]} data
     */
    onEventStoreLoad(data) {
        // todo: update the active view (card)
        this.weekComponent.updateEvents();
    }

    /**
     *
     * @param data
     */
    onNextIntervalButtonClick(data) {
        this.switchInterval(1);
    }

    /**
     *
     * @param data
     */
    onPreviousIntervalButtonClick(data) {
        this.switchInterval(-1);
    }

    /**
     *
     * @param data
     */
    onTodayButtonClick(data) {
        this.currentDate = todayDate;
    }

    /**
     *
     * @protected
     */
    toggleSettings() {
        this.settingsExpanded = !this.settingsExpanded;
    }

    /**
     *
     * @protected
     */
    toggleSidebar() {
        this.sideBarExpanded = !this.sideBarExpanded;
    }

    /**
     * todo: different intervals matching to the active card view
     * @param {Number} multiplier
     */
    switchInterval(multiplier) {
        let me          = this,
            currentDate = me.currentDate,
            interval    = 7;

        interval *= multiplier;

        currentDate.setDate(currentDate.getDate() + interval);
        me.currentDate = currentDate;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};