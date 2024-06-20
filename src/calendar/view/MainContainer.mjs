import CalendarsContainer    from './calendars/Container.mjs';
import Container             from '../../container/Base.mjs';
import DateSelector          from '../../component/DateSelector.mjs';
import DateUtil              from '../../util/Date.mjs';
import EditCalendarContainer from './calendars/EditContainer.mjs';
import EditEventContainer    from './EditEventContainer.mjs';
import MainContainerModel    from './MainContainerModel.mjs';
import Toolbar               from '../../toolbar/Base.mjs';

const todayDate = new Date();

/**
 * @class Neo.calendar.view.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    /**
     * Valid entries for the views config
     * @member {String[]} validViews=['day','week','month','year']
     * @static
     */
    static validViews = ['day', 'week', 'month', 'year']

    static config = {
        /**
         * @member {String} className='Neo.calendar.view.MainContainer'
         * @protected
         */
        className: 'Neo.calendar.view.MainContainer',
        /**
         * @member {String} ntype='calendar-maincontainer'
         * @protected
         */
        ntype: 'calendar-maincontainer',
        /**
         * The currently active view. Must be a value included inside the views config.
         * valid values: 'day', 'week', 'month', 'year'
         * @member {String} activeView_='week'
         */
        activeView_: 'week',
        /**
         * @member {String[]} baseCls=['neo-calendar-maincontainer','neo-container']
         */
        baseCls: ['neo-calendar-maincontainer', 'neo-container'],
        /**
         * Scale the calendar with using s different base font-size
         * @member {Number|null} baseFontSize_=null
         */
        baseFontSize_: null,
        /**
         * @member {Neo.calendar.view.Container|null} calendarsContainer=null
         */
        calendarsContainer: null,
        /**
         * @member {Object|null} calendarStoreConfig_=null
         */
        calendarStoreConfig_: null,
        /**
         * @member {Object|null} colorStoreConfig_=null
         */
        colorStoreConfig_: null,
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
         * Read only
         * @member {Neo.calendar.view.calendars.EditContainer|null} editCalendarContainer_=null
         */
        editCalendarContainer_: null,
        /**
         * @member {Object|null} editCalendarContainerConfig=null
         */
        editCalendarContainerConfig: null,
        /**
         * Read only
         * @member {Neo.calendar.view.EditEventContainer|null} editEventContainer_=null
         */
        editEventContainer_: null,
        /**
         * @member {Object|null} editEventContainerConfig=null
         */
        editEventContainerConfig: null,
        /**
         * @member {Object|null} eventStoreConfig_=null
         */
        eventStoreConfig_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.calendar.view.MainContainerModel} model=MainContainerModel
         */
        model: MainContainerModel,
        /**
         * @member {Neo.calendar.view.Component|null} monthComponent=null
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
         * @member {String[]} views_=['day','week','month','year']
         */
        views_: ['day', 'week', 'month', 'year'],
        /**
         * @member {Neo.calendar.view.Component|null} weekComponent=null
         */
        weekComponent: null,
        /**
         * @member {Object|null} weekComponentConfig=null
         */
        weekComponentConfig: null,
        /**
         * @member {Neo.calendar.view.YearComponent|null} yearComponent=null
         */
        yearComponent: null,
        /**
         * @member {Object|null} yearComponentConfig=null
         */
        yearComponentConfig: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.createItemsContent();
        !me.sideBarExpanded && me.afterSetSideBarExpanded(false, true)
    }

    /**
     * Triggered after the activeView config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetActiveView(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items[1].items[1].layout.activeIndex = me.views.indexOf(value);

            me.items[0].items[1].items.forEach(item => {
                if (item.toggleGroup === 'mainViews') {
                    item.pressed = item.value === value
                }
            });
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
                delete style.fontSize
            } else {
                style.fontSize = `${value}px`
            }

            this.style = style
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
                if (settingsContainer) {
                    settingsContainer.expand()
                } else {
                    me.createSettingsContainer(true).then(() => {
                        // short delay to ensure the vnode already exists
                        setTimeout(() => {
                            me.items[1].items[2].expand()
                        }, 50)
                    })
                }
            } else {
                settingsContainer.collapse(me.settingsContainerWidth)
            }
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
                style   = sideBar.style || {};

            if (value) {
                delete sideBar.vdom.removeDom;

                me.promiseUpdate().then(() => {
                    sideBar.mounted = true;

                    setTimeout(() => {
                        style.marginLeft = '0px';
                        sideBar.style = style;
                    }, 50)
                })
            } else {
                style.marginLeft    = `-${me.sideBarWidth}px`;
                sideBar._style      = style; // silent update
                sideBar._vdom.style = style; // silent update

                me.promiseUpdate().then(() => {
                    setTimeout(() => {
                        sideBar.vdom.removeDom = true;
                        sideBar.update();

                        sideBar.mounted = false
                    }, 400)
                });
            }
        }
    }

    /**
     * Triggered after the useSettingsContainer config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseSettingsContainer(value, oldValue) {
        let me = this;

        if (value) {
            me.settingsExpanded && me.createSettingsContainer(false);

            // we need a short delay to ensure the items already got created
            setTimeout(() => {
                me.items[0].items[1].add({
                    handler: me.toggleSettings.bind(me),
                    iconCls: 'fa fa-cog',
                    style  : {marginLeft: '10px'}
                })
            }, 10)
        } else if (!value && oldValue) {
            // we only need this logic in case we dynamically change the config from true to false
            me.items[1]         .removeLast();
            me.items[0].items[1].removeLast()
        }
    }

    /**
     * Gets triggered before getting the value of the editCalendarContainer config
     * @param {Neo.calendar.view.calendars.EditContainer|null} value
     * @returns {Neo.calendar.view.calendars.EditContainer}
     */
    beforeGetEditCalendarContainer(value) {
        if (!value) {
            let me = this;

            me._editCalendarContainer = value = Neo.create({
                module : EditCalendarContainer,
                appName: me.appName,
                model  : {parent: me.getModel()},
                owner  : me,
                width  : 250,
                ...me.editCalendarContainerConfig
            })
        }

        return value
    }

    /**
     * Gets triggered before getting the value of the editEventContainer config
     * @param {Neo.calendar.view.EditEventContainer|null} value
     * @returns {Neo.calendar.view.EditEventContainer}
     */
    beforeGetEditEventContainer(value) {
        if (!value) {
            let me = this;

            me._editEventContainer = value = Neo.create({
                module : EditEventContainer,
                appName: me.appName,
                model  : {parent: me.getModel()},
                owner  : me,
                width  : 250,
                ...me.editEventContainerConfig
            })
        }

        return value
    }

    /**
     * Triggered before the activeView config gets changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetActiveView(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'activeView', 'validViews')
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
                return oldValue
            }
        });

        return value
    }

    /**
     * @param {String} view
     * @protected
     */
    changeActiveView(view) {
        this.activeView = view
    }

    /**
     * @returns {Object[]}
     */
    createHeaderItems() {
        let me = this;

        return [{
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
        }]
    }

    /**
     * @protected
     */
    createItemsContent() {
        let me = this;

        me.calendarsContainer = Neo.create({
            module  : CalendarsContainer,
            flex    : 1,
            parentId: me.id, // we need the parentId to access the model inside the ctor
            owner   : me
        });

        me.dateSelector = Neo.create({
            module   : DateSelector,
            appName  : me.appName,
            flex     : 'none',
            height   : me.sideBarWidth,
            listeners: {change: me.onDateSelectorChange, scope: me},
            parentId : me.id, // we need the parentId to access the model inside the ctor
            value    : null,

            bind: {
                locale              : data => data.locale,
                scrollNewYearFromTop: data => data.scrollNewYearFromTop,
                showWeekends        : data => data.showWeekends,
                value               : data => DateUtil.convertToyyyymmdd(data.currentDate),
                weekStartDay        : data => data.weekStartDay
            },

            ...me.dateSelectorConfig
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
                module   : Container,
                flex     : 1,
                items    : me.createViews(),
                listeners: {cardLoaded: me.onCardLoaded, scope: me},
                layout   : {
                    ntype              : 'card',
                    activeIndex        : me.views.indexOf(me.activeView),
                    removeInactiveCards: me.removeInactiveCards
                }
            }]
        }]
    }

    /**
     * @param {Boolean} collapsed
     * @returns {Promise<*>}
     */
    createSettingsContainer(collapsed) {
        let me = this;

        return import('./SettingsContainer.mjs').then(module => {
            me.items[1].add({
                module             : module.default,
                collapsed,
                removeInactiveCards: me.removeInactiveCards,
                style              : {marginRight: !collapsed ? '0' : `-${me.settingsContainerWidth}px`},
                width              : me.settingsContainerWidth,
                ...me.settingsContainerConfig
            })
        })
    }

    /**
     * @returns {Object[]}
     */
    createViewHeaderButtons() {
        let me          = this,
            activeIndex = me.views.indexOf(me.activeView),
            buttons     = [];

        me.views.forEach((view, index) => {
            buttons.push({
                handler    : me.changeActiveView.bind(me, view),
                height     : 24,
                pressed    : activeIndex === index,
                text       : Neo.capitalize(view),
                toggleGroup: 'mainViews',
                value      : view
            })
        });

        return buttons
    }

    /**
     * @returns {Neo.component.Base[]}
     */
    createViews() {
        let me    = this,
            cards = [],
            cmp,

        defaultConfig = {
            appName : me.appName,
            owner   : me,
            parentId: me.id
        },

        map = {
            day: {
                module: () => import('./DayComponent.mjs'),
                flag  : 'day',
                ...defaultConfig,
                ...me.dayComponentConfig
            },
            month: {
                module: () => import('./month/Component.mjs'),
                flag  : 'month',
                ...defaultConfig,
                ...me.monthComponentConfig
            },
            week: {
                module: () => import('./week/Component.mjs'),
                flag  : 'week',
                ...defaultConfig,
                ...me.weekComponentConfig
            },
            year: {
                module: () => import('./YearComponent.mjs'),
                flag  : 'year',
                ...defaultConfig,
                ...me.yearComponentConfig
            }
        };

        me.views.forEach(view => {
            me[`${view}Component`] = cmp = map[view];
            cards.push(cmp);
        });

        return cards
    }

    /**
     * @param data
     */
    onCardLoaded(data) {
        this[`${data.item.flag}Component`] = data.item;

        // fire the event on this instance as well => setting views can subscribe to it more easily
        this.fire('cardLoaded', {item: data.item})
    }

    /**
     * @param {Object} data
     * @param {String} data.oldValue
     * @param {String} data.value
     */
    onDateSelectorChange(data) {
        data.oldValue !== undefined && this.getModel().setData('currentDate', new Date(`${data.value}T00:00:00.000Z`))
    }

    /**
     * @param data
     */
    onNextIntervalButtonClick(data) {
        this.switchInterval(1)
    }

    /**
     * @param data
     */
    onPreviousIntervalButtonClick(data) {
        this.switchInterval(-1)
    }

    /**
     * @param data
     */
    onTodayButtonClick(data) {
        this.model.setData({
            currentDate: todayDate
        })
    }

    /**
     * @protected
     */
    toggleSettings() {
        this.settingsExpanded = !this.settingsExpanded
    }

    /**
     * @protected
     */
    toggleSidebar() {
        this.sideBarExpanded = !this.sideBarExpanded
    }

    /**
     * @param {Number} multiplier
     */
    switchInterval(multiplier) {
        let me          = this,
            currentDate = me.data.currentDate,

        map = {
            day  : () => {currentDate.setDate(    currentDate.getDate()     + multiplier)},
            month: () => {currentDate.setMonth(   currentDate.getMonth()    + multiplier)},
            week : () => {currentDate.setDate(    currentDate.getDate() + 7 * multiplier)},
            year : () => {currentDate.setFullYear(currentDate.getFullYear() + multiplier)}
        };

        map[me.activeView]();

        me.model.setData({currentDate})
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
