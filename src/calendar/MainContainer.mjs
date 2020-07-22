import {default as Container} from '../container/Base.mjs';
import DateSelector           from '../component/DateSelector.mjs';
import ItemsContainer         from './ItemsContainer.mjs';
import Toolbar                from '../container/Toolbar.mjs';
import WeekComponent          from './view/WeekComponent.mjs';

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
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Boolean} sideBarExpanded_=true
         * @protected
         */
        sideBarExpanded_: true,
        /**
         * @member {Number} sideBarWidth=220
         * @protected
         */
        sideBarWidth: 220,
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
            console.log('afterSetCurrentDate', value, oldValue);
            this.dateSelector .currentDate = value;
            this.weekComponent.currentDate = value;
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
                    iconCls: 'fa fa-chevron-left',
                }, {
                    handler: me.onTodayButtonClick.bind(me),
                    height : 24,
                    text   : 'Today'
                }, {
                    iconCls: 'fa fa-chevron-right'
                }]
            }, {
                module: Toolbar,
                cls   : ['neo-calendar-header-toolbar', 'neo-toolbar'],
                items : ['->', {
                    handler    : me.changeTimeInterval.bind(me, 'day'),
                    text       : 'Day',
                    toggleGroup: 'timeInterval',
                    value      : 'day'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'week'),
                    pressed    : true,
                    text       : 'Week',
                    toggleGroup: 'timeInterval',
                    value      : 'week'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'month'),
                    text       : 'Month',
                    toggleGroup: 'timeInterval',
                    value      : 'month'
                }, {
                    handler    : me.changeTimeInterval.bind(me, 'year'),
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
     * @param data
     */
    onTodayButtonClick(data) {
        this.currentDate = todayDate;
    }

    /**
     *
     * @protected
     */
    toggleSidebar() {
        this.sideBarExpanded = !this.sideBarExpanded;
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};