import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';
import NeoArray               from '../../util/Array.mjs';
import TimeAxisComponent      from './TimeAxisComponent.mjs';
import {default as VDomUtil}  from '../../util/VDom.mjs';
import WeekEventDragZone      from '../draggable/WeekEventDragZone.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.WeekComponent
 * @extends Neo.component.Base
 */
class WeekComponent extends Component {
    static getStaticConfig() {return {
        /**
         * Valid values for timeAxisPosition
         * @member {String[]} timeAxisPositions=['end', 'start']
         * @protected
         * @static
         */
        timeAxisPositions: ['end', 'start']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.WeekComponent'
         * @protected
         */
        className: 'Neo.calendar.view.WeekComponent',
        /**
         * @member {String} ntype='calendar-view-weekcomponent'
         * @protected
         */
        ntype: 'calendar-view-weekcomponent',
        /**
         * @member {String[]} cls=['neo-calendar-weekcomponent']
         */
        cls: ['neo-calendar-weekcomponent'],
        /**
         * Will get passed from the MainContainer
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * The format of the column headers.
         * Valid values are: narrow, short & long
         * @member {String} dayNameFormat_='short'
         */
        dayNameFormat_: 'short',
        /**
         * @member {Neo.draggable.DragZone|null} eventDragZone=null
         */
        eventDragZone: null,
        /**
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * Will get passed from updateHeader()
         * @member {Date|null} firstColumnDate=null
         * @protected
         */
        firstColumnDate: null,
        /**
         * Internal flag to check if updateHeader(true) has already run
         * @member {Boolean} headerCreated=false
         * @protected
         */
        headerCreated: false,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_day=null
         * @protected
         */
        intlFormat_day: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_time=null
         * @protected
         */
        intlFormat_time: null,
        /**
         * @member {Boolean} isUpdating=false
         * @protected
         */
        isUpdating: false,
        /**
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {Object} timeAxis=null
         */
        timeAxis: null,
        /**
         * @member {Object} timeAxisConfig=null
         */
        timeAxisConfig: null,
        /**
         * Position the timeAxis at the left or right side.
         * Valid values are start & end.
         * start => left, end => right in LTR mode.
         * @member {String} timeAxisPosition_='start'
         */
        timeAxisPosition_: 'start',
        /**
         * @member {Object} timeFormat_=null
         */
        timeFormat_: {hour: '2-digit', minute: '2-digit'},
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header']
            }, {
                cls: ['neo-scroll-overlay']
            }, {
                cls : ['neo-c-w-scrollcontainer'],
                flag: 'neo-c-w-scrollcontainer',
                cn  : [{
                    cls : ['neo-header-row'],
                    flag: 'neo-header-row',
                    cn  : []
                }, {
                    cls : ['neo-c-w-column-timeaxis-container'],
                    flag: 'neo-c-w-column-timeaxis-container',
                    cn  : [{
                        cls  : ['neo-c-w-column-container'],
                        flag : 'neo-c-w-column-container',
                        style: {},
                        cn   : []
                    }]
                }]
            }]
        },
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

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push(
            {'drag:end'  : me.onColumnDragEnd,   scope: me, delegate: '.neo-c-w-column'},
            {'drag:end'  : me.onEventDragEnd,    scope: me, delegate: '.neo-event'},
            {'drag:move' : me.onColumnDragMove,  scope: me, delegate: '.neo-c-w-column'},
            {'drag:move' : me.onEventDragMove,   scope: me, delegate: '.neo-event'},
            {'drag:start': me.onColumnDragStart, scope: me, delegate: '.neo-c-w-column'},
            {'drag:start': me.onEventDragStart,  scope: me, delegate: '.neo-event'},
            {wheel       : me.onWheel,           scope: me}
        );

        me.domListeners = domListeners;

        me.timeAxis = Neo.create(TimeAxisComponent, {
            parentId : me.id,
            listeners: {
                change: me.onTimeAxisChange,
                scope : me
            },
            ...me.timeAxisConfig || {}
        });

        me.getColumnTimeAxisContainer().cn[me.timeAxisPosition === 'start' ? 'unshift' : 'push'](me.timeAxis.vdom);

        me.updateHeader(true);

        me.headerCreated = true;
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     * @param {Boolean} [silent=false]
     */
    adjustTotalHeight(data, silent=false) {
        let me          = this,
            rowHeight   = data.rowHeight,
            rowsPerItem = data.rowsPerItem,
            height      = data.totalHeight - rowHeight,
            vdom        = me.vdom,
            i           = 0,
            gradient    = [];

        for (; i < rowsPerItem; i++) {
            gradient.push(
                `var(--c-w-background-color) ${i * rowHeight + i}px`,
                `var(--c-w-background-color) ${(i + 1) * rowHeight + i}px`,
                'var(--c-w-border-color) 0'
            );
        }

        Object.assign(me.getColumnContainer().style, {
            backgroundImage: `linear-gradient(${gradient.join(',')})`,
            backgroundSize : `1px ${rowsPerItem * rowHeight + rowsPerItem}px`,
            height         : `${height}px`,
            maxHeight      : `${height}px`
        });

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateHeader();
        }
    }

    /**
     * Triggered after the dayNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDayNameFormat(value, oldValue) {
        let me = this;

        me.intlFormat_day = new Intl.DateTimeFormat(me.locale, {weekday: value});

        if (oldValue !== undefined) {
            me.updateHeader();
        }
    }

    /**
     * Triggered after the eventStore config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEventStore(value, oldValue) {
        // console.log('afterSetEventStore', value);
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.intlFormat_day  = new Intl.DateTimeFormat(value, {weekday: me.dayNameFormat});
            me.intlFormat_time = new Intl.DateTimeFormat(value, me.timeFormat);

            me.updateHeader();
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (value) {
            setTimeout(() => {
                let me = this;

                Neo.main.DomAccess.getBoundingClientRect({
                    id: me.getColumnContainer().id
                }).then(data => {
                    Neo.main.DomAccess.scrollBy({
                        direction: 'left',
                        id       : me.getScrollContainer().id,
                        value    : data.width / 3
                    });
                });
            }, 20);
        }
    }

    /**
     * Triggered after the timeAxisPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTimeAxisPosition(value, oldValue) {
        let me                = this,
            cls               = me.cls,
            vdom              = me.vdom,
            timeAxisContainer = me.getColumnTimeAxisContainer();

        NeoArray[value === 'end' ? 'add' : 'remove'](cls,  'neo-timeaxis-end');

        if (oldValue !== undefined) {
            timeAxisContainer.cn.unshift(timeAxisContainer.cn.pop()); // switch the order of the 2 items
        }

        me._cls = cls;
        me.vdom = vdom;
    }

    /**
     * Triggered after the timeFormat config got changed
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetTimeFormat(value, oldValue) {
        let me = this;

        me.intlFormat_time = new Intl.DateTimeFormat(me.locale, value);
    }

    /**
     * Triggered after the weekStartDay config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetWeekStartDay(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateHeader(false, true);
            this.updateEvents();
        }
    }

    /**
     * Triggered before the dayNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetDayNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'dayNameFormat', DateUtil.prototype.dayNameFormats);
    }

    /**
     * Triggered before the timeAxisPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTimeAxisPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'timeAxisPosition');
    }

    /**
     * Triggered before the weekStartDay config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetWeekStartDay(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'weekStartDay', DateUtil.prototype.weekStartDays);
    }

    /**
     *
     * @param {Date} date
     * @returns {Object}
     */
    createColumnAndHeader(date) {
        let me          = this,
            columnCls   = ['neo-c-w-column', 'neo-draggable'],
            currentDate = date.getDate(),
            currentDay  = date.getDay(),
            dateCls     = ['neo-date'],
            column, header;

        if (currentDay === 0 || currentDay === 6) {
            columnCls.push('neo-weekend');
        } else {
            NeoArray.remove(columnCls, 'neo-weekend');
        }

        if (currentDate        === today.day   &&
            date.getMonth()    === today.month &&
            date.getFullYear() === today.year) {
            dateCls.push('neo-today');
        }

        column = {
            cls : columnCls,
            flag: DateUtil.convertToyyyymmdd(date)
        };

        header = {
            cls: ['neo-header-row-item'],
            cn : [{
                cls : ['neo-day'],
                html: me.intlFormat_day.format(date)
            }, {
                cls : dateCls,
                html: currentDate
            }]
        };

        return {
            column: column,
            header: header
        };
    }

    /**
     *
     */
    destroy(...args) {
        this.eventStore = null;
        this.timeAxis   = null;

        super.destroy(...args);
    }

    /**
     *
     */
    getColumnContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-column-container');
    }

    /**
     *
     * @param {Date} date
     * @returns {String}
     */
    getColumnId(date) {
        return `${this.id}_col_${DateUtil.convertToyyyymmdd(date)}`;
    }

    /**
     *
     * @param {Date} date
     * @returns {String}
     */
    getColumnHeaderId(date) {
        return `${this.id}_ch_${DateUtil.convertToyyyymmdd(date)}`;
    }

    /**
     *
     */
    getColumnTimeAxisContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-column-timeaxis-container');
    }

    /**
     *
     */
    getHeaderContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-header-row');
    }

    /**
     * Used inside createId() as the default value passed to the IdGenerator.
     * @returns {String}
     */
    getIdKey() {
        return 'c-w';
    }

    /**
     *
     */
    getScrollContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-scrollcontainer');
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragEnd(data) {
        if (!data.path[0].cls.includes('neo-event')) {
            console.log('onColumnDragEnd', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragMove(data) {
        if (!data.path[0].cls.includes('neo-event')) {
            console.log('onColumnDragMove', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragStart(data) {
        if (!data.path[0].cls.includes('neo-event')) {
            console.log('onColumnDragStart', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragEnd(data) {
        this.eventDragZone.dragEnd();
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragMove(data) {
        this.eventDragZone.dragMove(data);
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragStart(data) {
        let me          = this,
            id          = data.path[0].id,
            dragElement = VDomUtil.findVdomChild(me.vdom, id).vdom,
            timeAxis    = me.timeAxis;

        const config = {
            dragElement      : dragElement,
            endTime          : timeAxis.getTime(timeAxis.endTime),
            eventRecord      : me.eventStore.get(dragElement.flag),
            proxyParentId    : data.path[1].id,
            scrollContainerId: me.getScrollContainer().id,
            startTime        : timeAxis.getTime(timeAxis.startTime)
        };

        if (!me.eventDragZone) {
            me.eventDragZone = Neo.create({
                module : WeekEventDragZone,
                appName: me.appName,
                owner  : me,
                ...config,

                dragProxyConfig: {
                    style: {
                        transition: 'none',
                        willChange: 'height'
                    }
                }
            });
        } else {
            me.eventDragZone.set(config);
        }

        me.eventDragZone.dragStart(data);
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     */
    onTimeAxisChange(data) {
        let me = this;

        me.adjustTotalHeight(data, me.headerCreated);

        if (me.headerCreated) {
            me.updateEvents();
        }
    }

    /**
     *
     * @param {Object} data
     */
    onWheel(data) {
        if (!this.isUpdating && Math.abs(data.deltaX) > Math.abs(data.deltaY)) {
            let me            = this,
                columns       = me.getColumnContainer(),
                header        = me.getHeaderContainer(),
                i             = 0,
                timeAxisWidth = 50,
                width         = data.clientWidth - timeAxisWidth,
                config, date, scrollValue;

            // console.log(data.scrollLeft, Math.round(data.scrollLeft / (data.clientWidth - timeAxisWidth) * 7));

            if (data.deltaX > 0 && Math.round(data.scrollLeft / width * 7) > 13) {
                date = new Date(columns.cn[columns.cn.length - 1].flag);

                columns.cn.splice(0, 7);
                header.cn.splice(0, 7);

                for (; i < 7; i++) {
                    date.setDate(date.getDate() + 1);

                    config= me.createColumnAndHeader(date);

                    columns.cn.push(config.column);
                    header.cn.push(config.header);
                }

                scrollValue = -width;
            }

            else if (data.deltaX < 0 && Math.round(data.scrollLeft / width * 7) < 1) {
                date = new Date(columns.cn[0].flag);

                columns.cn.length = 14;
                header.cn.length = 14;

                for (; i < 7; i++) {
                    date.setDate(date.getDate() - 1);

                    config= me.createColumnAndHeader(date);

                    columns.cn.unshift(config.column);
                    header.cn.unshift(config.header);
                }

                scrollValue = width;
            }

            if (scrollValue) {
                me.isUpdating = true;

                me.promiseVdomUpdate().then(() => {
                    Neo.main.DomAccess.scrollBy({
                        direction: 'left',
                        id       : me.getScrollContainer().id,
                        value    : scrollValue
                    }).then(() => {
                        me.isUpdating = false;
                    });
                });
            }
        }
    }

    /**
     * The algorithm relies on the eventStore being sorted by startDate ASC
     */
    updateEvents() {
        let me         = this,
            timeAxis   = me.timeAxis,
            endTime    = timeAxis.getTime(timeAxis.endTime),
            startTime  = timeAxis.getTime(timeAxis.startTime),
            totalTime  = endTime - startTime,
            date       = DateUtil.clone(me.firstColumnDate),
            eventStore = me.eventStore,
            vdom       = me.vdom,
            content    = me.getColumnContainer(),
            j          = 0,
            len        = eventStore.getCount(),
            column, duration, height, i, record, recordKey, startHours, top;

        // remove previous events from the vdom
        content.cn.forEach(item => item.cn = []);

        for (; j < 21; j++) {
            column = content.cn[j];

            for (i = 0; i < len; i++) {
                record = eventStore.items[i];

                // todo: we need a check for date overlaps => startDate < current day, endDate >= current day
                if (DateUtil.matchDate(date, record.startDate)) {
                    if (DateUtil.matchDate(date, record.endDate)) {
                        recordKey  = record[eventStore.keyProperty];
                        duration   = (record.endDate - record.startDate) / 60 / 60 / 1000; // duration in hours
                        height     = Math.round(duration / totalTime * 100 * 1000) / 1000;
                        startHours = (record.startDate.getHours() * 60 + record.startDate.getMinutes()) / 60;
                        top        = Math.round((startHours - startTime) / totalTime * 100 * 1000) / 1000;

                        // console.log(j, record);
                        // console.log(top);

                        column.cn.push({
                            cls     : ['neo-event', 'neo-draggable'],
                            flag    : record[eventStore.keyProperty],
                            id      : me.id + '__' + recordKey,
                            tabIndex: -1,

                            cn: [{
                                cls : ['neo-event-time'],
                                html: me.intlFormat_time.format(record.startDate),
                                id  : me.id + '__time__' + recordKey
                            }, {
                                cls : ['neo-event-title'],
                                html: record.title,
                                id  : me.id + '__title__' + recordKey
                            }],

                            style: {
                                height: `calc(${height}% - 2px)`,
                                top   : `calc(${top}% + 1px)`,
                                width : 'calc(100% - 1px)' // todo
                            }
                        });
                    }
                }
            }

            date.setDate(date.getDate() + 1);
        }

        me.vdom = vdom;
    }

    /**
     *
     * @param {Boolean} [create=false]
     * @param {Boolean} [silent=false]
     */
    updateHeader(create=false, silent=false) {
        let me      = this,
            date    = me.currentDate, // cloned
            vdom    = me.vdom,
            content = me.getColumnContainer(),
            header  = me.getHeaderContainer(),
            i       = 0,
            columnCls, currentDate, currentDay, dateCls, headerId;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay - 7);

        me.firstColumnDate = DateUtil.clone(date);

        for (; i < 21; i++) {
            columnCls   = ['neo-c-w-column', 'neo-draggable'];
            currentDate = date.getDate();
            currentDay  = date.getDay();
            dateCls     = ['neo-date'];

            if (currentDay === 0 || currentDay === 6) {
                columnCls.push('neo-weekend');
            } else {
                NeoArray.remove(columnCls, 'neo-weekend');
            }

            if (currentDate        === today.day   &&
                date.getMonth()    === today.month &&
                date.getFullYear() === today.year) {
                dateCls.push('neo-today');
            } else {
                NeoArray.remove(dateCls, 'neo-today');
            }

            headerId = me.getColumnHeaderId(date);

            if (create) {
                content.cn.push({
                    cls : columnCls,
                    flag: DateUtil.convertToyyyymmdd(date),
                    id  : me.getColumnId(date)
                });

                header.cn.push({
                    cls: ['neo-header-row-item'],
                    id : headerId,
                    cn : [{
                        cls : ['neo-day'],
                        html: me.intlFormat_day.format(date),
                        id  : `${headerId}_day`
                    }, {
                        cls : dateCls,
                        html: currentDate,
                        id  : `${headerId}_date`
                    }]
                });
            } else {
                Object.assign(content.cn[i], {
                    cls : columnCls,
                    flag: DateUtil.convertToyyyymmdd(date),
                    id  : me.getColumnId(date)
                });

                header.cn[i].id = headerId;

                Object.assign(header.cn[i].cn[0], {
                    html: me.intlFormat_day.format(date),
                    id  : `${headerId}_day`
                });

                Object.assign(header.cn[i].cn[1], {
                    cls : dateCls,
                    html: currentDate,
                    id  : `${headerId}_date`
                });
            }

            date.setDate(date.getDate() + 1);
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(WeekComponent);

export {WeekComponent as default};