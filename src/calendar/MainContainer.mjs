import CalendarsContainer           from './view/CalendarsContainer.mjs';
import {default as CalendarStore}   from './store/Calendars.mjs';
import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Container}       from '../container/Base.mjs';
import DateSelector                 from '../component/DateSelector.mjs';
import DateUtil                     from '../util/Date.mjs';
import DayComponent                 from './view/DayComponent.mjs';
import {default as EventStore}      from './store/Events.mjs';
import MonthComponent               from './view/MonthComponent.mjs';
import SettingsContainer            from './view/SettingsContainer.mjs';
import Toolbar                      from '../container/Toolbar.mjs';
import WeekComponent                from './view/WeekComponent.mjs';
import YearComponent                from './view/YearComponent.mjs';

const todayDate = new Date();

/**
 * @class Neo.calendar.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getStaticConfig() {return {
        /**
         * Valid entries for the views config
         * @member {String[]} validViews=['day', 'week', 'month', 'year']
         * @static
         */
        validViews: ['day', 'week', 'month', 'year']
    }}

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
         * The currently active view. Must be a value included inside the views config.
         * @member {String} activeView_='week'
         */
        activeView_: 'month',
        /**
         * Scale the calendar with using s different base font-size
         * @member {Number|null} baseFontSize_=null
         */
        baseFontSize_: null,
        /**
         * @member {Neo.calendar.view.CalendarsContainer|null} calendarsContainer=null
         */
        calendarsContainer: null,
        /**
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore_: null,
        /**
         * @member {Object|null} calendarStoreConfig=null
         */
        calendarStoreConfig: null,
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
         * @member {Neo.component.DateSelector|null} dateSelector=null
         */
        dateSelector: null,
        /**
         * @member {Object|null} dateSelectorConfig=null
         */
        dateSelectorConfig: null,
        /**
         * @member {Neo.calendar.view.DayComponent|null} dayComponent=null
         */
        dayComponent: null,
        /**
         * @member {Object|null} dayComponentConfig=null
         */
        dayComponentConfig: null,
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
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {Neo.calendar.view.MonthComponent|null} monthComponent=null
         */
        monthComponent: null,
        /**
         * @member {Object|null} monthComponentConfig=null
         */
        monthComponentConfig: null,
        /**
         * True to only keep the active view inside the DOM
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true,
        /**
         * True to scroll new years in from the top
         * @member {Boolean} scrollNewYearFromTop_=false
         */
        scrollNewYearFromTop_: false,
        /**
         * @member {Object|null} settingsContainerConfig=null
         */
        settingsContainerConfig: null,
        /**
         * @member {Number} settingsContainerWidth=300
         */
        settingsContainerWidth: 310,
        /**
         * @member {Boolean} settingsExpanded_=false
         */
        settingsExpanded_: false,
        /**
         * @member {Boolean} showWeekends_=true
         */
        showWeekends_: true,
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
         * Any combination and order of 'day', 'week', 'month', 'year'
         * @member {String[]} views_=['day', 'week', 'month', 'year']
         */
        views_: ['day', 'week', 'month', 'year'],
        /**
         * @member {Neo.calendar.view.WeekComponent|null} weekComponent=null
         */
        weekComponent: null,
        /**
         * @member {Object|null} weekComponentConfig=null
         */
        weekComponentConfig: null,
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0,
        /**
         * @member {Neo.calendar.view.YearComponent|null} yearComponent=null
         */
        yearComponent: null,
        /**
         * @member {Object|null} yearComponentConfig=null
         */
        yearComponentConfig: null
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
     * Triggered after the baseFontSize config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetBaseFontSize(value, oldValue) {
        if (oldValue !== undefined) {
            let style = this.style || {};

            if (!value) {
                delete style.fontSize;
            } else {
                style.fontSize = `${value}px`;
            }

            this.style = style;
        }
    }

    /**
     * Triggered after the currentDate config got changed
     * todo: Only update the active view, adjust the state on card change
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.weekComponent.currentDate = value;
            me.yearComponent.currentDate = value;
            me.dateSelector .value       = DateUtil.convertToyyyymmdd(value);
        }
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue !== undefined) {
            this.setViewConfig('locale', value);
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
     * Triggered after the showWeekends config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetShowWeekends(value, oldValue) {
        if (oldValue !== undefined) {
            this.setViewConfig('showWeekends', value);
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
            let me                = this,
                settingsContainer = me.items[1].items[2];

            if (value) {
                settingsContainer.expand();
            } else {
                settingsContainer.collapse(me.settingsContainerWidth);
            }
        }
    }

    /**
     * Triggered after the scrollNewYearFromTop config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetScrollNewYearFromTop(value, oldValue) {
        if (oldValue !== undefined) {
            this.dateSelector .scrollNewYearFromTop = value;
            this.yearComponent.scrollNewYearFromTop = value;
        }
    }

    /**
     * Triggered after the sideBarExpanded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSideBarExpanded(value, oldValue) {
        if (oldValue !== undefined) {
            let me      = this,
                sideBar = me.items[1].items[0],
                style   = sideBar.style || {},
                vdom;

            if (value) {
                delete sideBar.vdom.removeDom;

                me.promiseVdomUpdate().then(() => {
                    sideBar.mounted = true;

                    setTimeout(() => {
                        style.marginLeft = '0px';
                        sideBar.style = style;
                    }, 50);
                });
            } else {
                style.marginLeft    = `-${me.sideBarWidth}px`;
                sideBar._style      = style; // silent update
                sideBar._vdom.style = style; // silent update

                me.promiseVdomUpdate().then(() => {
                    setTimeout(() => {
                        vdom = sideBar.vdom;
                        vdom.removeDom = true;
                        sideBar.vdom = vdom;
                    }, 400);
                });
            }
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
            this.setViewConfig('weekStartDay', value);
        }
    }

    /**
     * Triggered before the calendarStore config gets changed.
     * @param {Neo.calendar.store.Calendars} value
     * @param {Neo.calendar.store.Calendars} oldValue
     * @protected
     */
    beforeSetCalendarStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, CalendarStore, {
            listeners: {load: me.onCalendarStoreLoad, scope: me},
            ...me.calendarStoreConfig || {}
        });
    }

    /**
     * Triggered before the eventStore config gets changed.
     * @param {Neo.calendar.store.Events} value
     * @param {Neo.calendar.store.Events} oldValue
     * @protected
     */
    beforeSetEventStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, EventStore, {
            listeners: {load: me.onEventStoreLoad, scope: me},
            ...me.eventStoreConfig || {}
        });
    }

    /**
     * Triggered before the views config gets changed.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    beforeSetViews(value, oldValue) {
        let validViews = this.getStaticConfig('validViews');

        value.forEach(view => {
            if (!validViews.includes(view)) {
                console.error(view, 'is not a valid entry for views. Stick to:', validViews);
                return oldValue;
            }
        });

        return value;
    }

    /**
     *
     * @param {String} interval
     * @protected
     */
    changeTimeInterval(interval) {
        let me = this;

        me.items[1].items[1].layout.activeIndex = me.views.indexOf(interval);

        me.items[0].items[1].items.forEach(item => {
            if (item.toggleGroup === 'timeInterval') {
                item.pressed = item.value === interval;
            }
        });

        me.activeView = interval;
    }

    /**
     *
     * @returns {Neo.component.Base[]}
     */
    createHeaderItems() {
        let me    = this,
            items = [{
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
            items : ['->', ...me.createViewHeaderButtons()]
        }];

        if (me.useSettingsContainer) {
            items[1].items.push({
                handler: me.toggleSettings.bind(me),
                iconCls: 'fa fa-cog',
                style  : {marginLeft: '10px'}
            });
        }

        return items;
    }

    /**
     *
     * @protected
     */
    createItemsContent() {
        let me = this;

        me.calendarsContainer = Neo.create({
            module       : CalendarsContainer,
            calendarStore: me.calendarStore,
            flex         : 1
        });

        me.dateSelector = Neo.create({
            module              : DateSelector,
            flex                : 'none',
            height              : me.sideBarWidth,
            listeners           : {change: me.onDateSelectorChange, scope: me},
            locale              : me.locale,
            scrollNewYearFromTop: me.scrollNewYearFromTop,
            showWeekends        : me.showWeekends,
            value               : DateUtil.convertToyyyymmdd(me.currentDate),
            weekStartDay        : me.weekStartDay,
            ...me.dateSelectorConfig || {}
        });

        me.items = [{
            module: Container,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : me.createHeaderItems()
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module: Container,
                cls   : ['neo-calendar-sidebar', 'neo-container'],
                layout: {ntype: 'vbox', align: 'stretch'},
                width : me.sideBarWidth,
                items : [me.dateSelector, me.calendarsContainer]
            }, {
                module: Container,
                flex  : 1,
                items : me.createViews(),
                layout: {
                    ntype              : 'card',
                    activeIndex        : me.views.indexOf(me.activeView),
                    removeInactiveCards: me.removeInactiveCards
                }
            }]
        }];

        if (me.useSettingsContainer) {
            me.items[1].items.push({
                module: SettingsContainer,
                removeInactiveCards: me.removeInactiveCards,
                style              : {marginRight: me.settingsExpanded ? '0' : `-${me.settingsContainerWidth}px`},
                width              : me.settingsContainerWidth,
                ...me.settingsContainerConfig
            });
        }
    }

    /**
     *
     * @returns {Neo.component.Base[]}
     */
    createViewHeaderButtons() {
        let me          = this,
            activeIndex = me.views.indexOf(me.activeView),
            buttons     = [];

        me.views.forEach((view, index) => {
            buttons.push({
                handler    : me.changeTimeInterval.bind(me, view),
                height     : 24,
                pressed    : activeIndex === index,
                text       : Neo.capitalize(view),
                toggleGroup: 'timeInterval',
                value      : view
            });
        });

        return buttons;
    }

    /**
     *
     * @returns {Neo.component.Base[]}
     */
    createViews() {
        let me    = this,
            cards = [],
            cmp;

        const defaultConfig = {
            currentDate : me.currentDate,
            eventStore  : me.eventStore,
            locale      : me.locale,
            showWeekends: me.showWeekends,
            weekStartDay: me.weekStartDay
        };

        const map = {
            day: {
                module: DayComponent,
                style : {padding: '20px'},
                ...defaultConfig,
                ...me.dayComponentConfig || {}
            },
            month: {
                module: MonthComponent,
                ...defaultConfig,
                ...me.monthComponentConfig || {}
            },
            week: {
                module: WeekComponent,
                ...defaultConfig,
                ...me.weekComponentConfig || {}
            },
            year: {
                module              : YearComponent,
                scrollNewYearFromTop: me.scrollNewYearFromTop,
                ...defaultConfig,
                ...me.yearComponentConfig || {}
            }
        }

        me.views.forEach(view => {
            me[view + 'Component'] = cmp = Neo.create(map[view]);
            cards.push(cmp);
        });

        return cards;
    }

    /**
     *
     */
    destroy(...args) {
        let me = this;

        // remove references, the super call will remove component tree based instances
        me.calendarsContainer = null;
        me.dateSelector       = null;
        me.dayComponent       = null;
        me.monthComponent     = null;
        me.weekComponent      = null;
        me.yearComponent      = null;

        super.destroy(...args);
    }

    /**
     *
     * @param {Object[]} data
     */
    onCalendarStoreLoad(data) {
        this.calendarsContainer.onStoreLoad(data);
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
     * Sets a config for the DateSelector and all views (cards)
     * @param {String} key
     * @param {*} value
     */
    setViewConfig(key, value) {
        let me = this;

        me.dateSelector[key] = value;

        me.views.forEach(view => {
            me[`${view}Component`][key] = value;
        });
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
     *
     * @param {Number} multiplier
     */
    switchInterval(multiplier) {
        let me          = this,
            currentDate = me.currentDate; // cloned

        const map = {
            day  : () => {currentDate.setDate(    currentDate.getDate()     + multiplier)},
            month: () => {currentDate.setMonth(   currentDate.getMonth()    + multiplier)},
            week : () => {currentDate.setDate(    currentDate.getDate() + 7 * multiplier)},
            year : () => {currentDate.setFullYear(currentDate.getFullYear() + multiplier)}
        };

        map[me.activeView]();
        me.currentDate = currentDate;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};