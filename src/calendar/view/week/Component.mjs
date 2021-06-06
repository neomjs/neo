import BaseComponent      from '../../../component/Base.mjs';
import DateUtil           from '../../../util/Date.mjs';
import EditEventContainer from '../EditEventContainer.mjs';
import EventDragZone      from './EventDragZone.mjs';
import EventResizable     from './EventResizable.mjs';
import NeoArray           from '../../../util/Array.mjs';
import TimeAxisComponent  from './TimeAxisComponent.mjs';
import VDomUtil           from '../../../util/VDom.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.week.Component
 * @extends Neo.component.Base
 */
class Component extends BaseComponent {
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
         * @member {String} className='Neo.calendar.view.week.Component'
         * @protected
         */
        className: 'Neo.calendar.view.week.Component',
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
         * @member {Neo.calendar.view.EditEventContainer|null} editEventContainer=null
         */
        editEventContainer: null,
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
         * @member {Boolean} isDragging=false
         * @protected
         */
        isDragging: false,
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
         * Time in minutes, will get passed from the MainContainer
         * @member {Number} minimumEventDuration=30
         * @protected
         */
        minimumEventDuration: 30,
        /**
         * @member {Object} resizablePluginConfig=null
         */
        resizablePluginConfig: null,
        /**
         * @member {Boolean} showEventEndDates_=false
         */
        showEventEndDates_: false,
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
        vdom:
        {cn: [
            {cls: ['neo-header']},
            {cls: ['neo-scroll-overlay']},
            {cls: ['neo-c-w-scrollcontainer'], flag: 'neo-c-w-scrollcontainer', cn: [
                {cls: ['neo-header-row'], flag: 'neo-header-row', cn: []},
                {cls: ['neo-c-w-column-timeaxis-container'], flag: 'neo-c-w-column-timeaxis-container', cn: [
                    {cls: ['neo-c-w-column-container'], flag: 'neo-c-w-column-container', style: {}, cn: []}
                ]}
            ]}
        ]},
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
            domListeners = me.domListeners,
            columnOpts   = {scope: me, delegate: '.neo-c-w-column'},
            eventOpts    = {scope: me, delegate: '.neo-event'},
            plugins      = me.plugins || [];

        domListeners.push(
            {dblclick    : me.onEventDoubleClick, ...eventOpts},
            {'drag:end'  : me.onColumnDragEnd,    ...columnOpts},
            {'drag:end'  : me.onEventDragEnd,     ...eventOpts},
            {'drag:move' : me.onColumnDragMove,   ...columnOpts},
            {'drag:move' : me.onEventDragMove,    ...eventOpts},
            {'drag:start': me.onColumnDragStart,  ...columnOpts},
            {'drag:start': me.onEventDragStart,   ...eventOpts},
            {wheel       : me.onWheel,            scope: me}
        );

        me.domListeners = domListeners;

        plugins.push({
            module       : EventResizable,
            appName      : me.appName,
            delegationCls: 'neo-event',
            directions   : ['b', 't'],
            flag         : 'resizable',
            ...me.resizablePluginConfig || {}
        });

        me.plugins = plugins;

        me.timeAxis = Neo.create(TimeAxisComponent, {
            appName  : me.appName,
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
     * Adjusts drag events which start on an event resize handle
     * @param {Object} data
     * @returns {Object}
     */
    adjustResizeEvent(data) {
        data.path.shift();
        data.targetPath.shift();
        data.target = data.path[0];

        return data;
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
        super.afterSetMounted(value, oldValue);

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
     * Triggered after the showEventEndDates config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowEventEndDates(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateEvents();
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
     * @param {Object} eventData
     * @returns {Boolean}
     */
    isTopLevelColumn(eventData) {
        return eventData.path[0].cls.includes('neo-c-w-column');
    }

    /**
     *
     * @param {Object} eventData
     * @returns {Boolean}
     */
    isTopLevelEvent(eventData) {
        return eventData.path[0].cls.includes('neo-event');
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragEnd(data) {
        if (this.isTopLevelColumn(data)) {
            console.log('onColumnDragEnd', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragMove(data) {
        if (this.isTopLevelColumn(data)) {
            console.log('onColumnDragMove', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onColumnDragStart(data) {
        if (this.isTopLevelColumn(data)) {
            console.log('onColumnDragStart', data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDoubleClick(data) {
        console.log('onEventDoubleClick', data);

        let me = this;

        if (!me.editEventContainer) {
            me.editEventContainer = Neo.create({
                module    : EditEventContainer,
                appName   : me.appName,
                autoMount : true,
                autoRender: true,
                height    : 300,
                width     : 300
            });
        }
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragEnd(data) {
        let me = this;

        me.eventDragZone.dragEnd();

        if (!me.isTopLevelEvent(data)) {
            data = me.adjustResizeEvent(data);
            me.getPlugin({flag:'resizable'}).onDragEnd(data);
        } else {
            me.eventDragZone.removeBodyCursorCls();
        }

        me.isDragging = false;
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragMove(data) {
        let me = this;

        if (!me.isTopLevelEvent(data)) {
            data = me.adjustResizeEvent(data);
        }

        me.eventDragZone.dragMove(data);
    }

    /**
     *
     * @param {Object} data
     */
    onEventDragStart(data) {
        let me              = this,
            eventDragZone   = me.eventDragZone,
            isTopLevelEvent = me.isTopLevelEvent(data),
            dragElement, timeAxis;

        if (!isTopLevelEvent) {
            data = me.adjustResizeEvent(data);
        }

        dragElement = VDomUtil.findVdomChild(me.vdom, data.path[0].id).vdom;
        timeAxis    = me.timeAxis;

        me.isDragging = true;

        const config = {
            axisEndTime  : timeAxis.getTime(timeAxis.endTime),
            axisStartTime: timeAxis.getTime(timeAxis.startTime),
            dragElement  : dragElement,
            eventRecord  : me.eventStore.get(dragElement.flag),
            proxyParentId: data.path[1].id
        };

        if (!eventDragZone) {
            me.eventDragZone = eventDragZone = Neo.create({
                module           : EventDragZone,
                appName          : me.appName,
                owner            : me,
                scrollContainerId: me.getScrollContainer().id,
                ...config,

                dragProxyConfig: {
                    style: {
                        transition: 'none',
                        willChange: 'height'
                    }
                }
            });
        } else {
            eventDragZone.set(config);
        }

        if (isTopLevelEvent) {
            eventDragZone.addBodyCursorCls();
        } else {
            me.getPlugin({flag:'resizable'}).onDragStart(data);
        }

        eventDragZone.dragStart(data);
    }

    /**
     *
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @param {Object[]} data.path
     */
    onFocusChange(data) {
        let oldPath = data.oldPath,
            path    = data.path;

        if (oldPath) {
            if (oldPath[0].cls && oldPath[0].cls.includes('neo-event')) {
                Neo.currentWorker.applyDeltas(this.appName, {id: oldPath[0].id, cls: {remove: ['neo-focus']}});
            }
        }

        if (path) {
            if (path[0].cls && path[0].cls.includes('neo-event')) {
                Neo.applyDeltas(this.appName, {id: path[0].id, cls: {add: ['neo-focus']}});
            }
        }
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
            let me              = this,
                columns         = me.getColumnContainer(),
                firstColumnDate = me.firstColumnDate,
                header          = me.getHeaderContainer(),
                i               = 0,
                timeAxisWidth   = 50,
                width           = data.clientWidth - timeAxisWidth,
                config, date, scrollValue;

            // console.log(data.scrollLeft, Math.round(data.scrollLeft / (data.clientWidth - timeAxisWidth) * 7));

            if (data.deltaX > 0 && Math.round(data.scrollLeft / width * 7) > 13) {
                date = new Date(columns.cn[columns.cn.length - 1].flag);

                columns.cn.splice(0, 7);
                header.cn.splice(0, 7);

                for (; i < 7; i++) {
                    date.setDate(date.getDate() + 1);

                    config = me.createColumnAndHeader(date);

                    columns.cn.push(config.column);
                    header.cn.push(config.header);
                }

                firstColumnDate.setDate(firstColumnDate.getDate() + 7);

                // we need a short delay to move the event rendering into the next animation frame.
                // Details: https://github.com/neomjs/neo/issues/2216
                setTimeout(() => {
                    me.updateEvents(13, 20);
                }, 50);

                scrollValue = -width;
            }

            else if (data.deltaX < 0 && Math.round(data.scrollLeft / width * 7) < 1) {
                date = new Date(columns.cn[0].flag);

                columns.cn.length = 14;
                header.cn.length = 14;

                for (; i < 7; i++) {
                    date.setDate(date.getDate() - 1);

                    config = me.createColumnAndHeader(date);

                    columns.cn.unshift(config.column);
                    header.cn.unshift(config.header);
                }

                firstColumnDate.setDate(firstColumnDate.getDate() - 7);

                // we need a short delay to move the event rendering into the next animation frame.
                // Details: https://github.com/neomjs/neo/issues/2216
                setTimeout(() => {
                    me.updateEvents(0, 6);
                }, 50);

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
     * @param {Number} [startIndex=0]
     * @param {Number} [endIndex=21]
     * @param {Boolean} [silent=false]
     */
    updateEvents(startIndex=0, endIndex=21, silent=false) {
        let me                = this,
            timeAxis          = me.timeAxis,
            endTime           = timeAxis.getTime(timeAxis.endTime),
            startTime         = timeAxis.getTime(timeAxis.startTime),
            totalTime         = endTime - startTime,
            date              = DateUtil.clone(me.firstColumnDate),
            eventStore        = me.eventStore,
            vdom              = me.vdom,
            content           = me.getColumnContainer(),
            j                 = startIndex,
            len               = eventStore.getCount(),
            showEventEndDates = me.showEventEndDates,
            column, duration, eventCls, hasOverflow, height, i, record, recordKey, startHours, top;

        date.setDate(date.getDate() + startIndex);

        for (; j < endIndex; j++) {
            column = content.cn[j];

            column.cn = []; // remove previous events from the vdom

            for (i = 0; i < len; i++) {
                record = eventStore.items[i];

                // todo: we need a check for date overlaps => startDate < current day, endDate >= current day
                if (DateUtil.matchDate(date, record.startDate)) {
                    if (DateUtil.matchDate(date, record.endDate)) {
                        duration    = (record.endDate - record.startDate) / 60 / 60 / 1000; // duration in hours
                        eventCls    = ['neo-event', 'neo-draggable'];
                        hasOverflow = false;
                        height      = Math.round(duration / totalTime * 100 * 1000) / 1000;
                        recordKey   = record[eventStore.keyProperty];
                        startHours  = (record.startDate.getHours() * 60 + record.startDate.getMinutes()) / 60;
                        top         = Math.round((startHours - startTime) / totalTime * 100 * 1000) / 1000;

                        if (duration * 60 / timeAxis.interval === 1) {
                            hasOverflow = timeAxis.rowHeight < (showEventEndDates ? 50 : 34);

                            if (hasOverflow && !(showEventEndDates && timeAxis.rowHeight >= 34)) {
                                eventCls.push('neo-overflow');
                            }
                        }

                        column.cn.push({
                            cls     : eventCls,
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
                            }, {
                                cls      : ['neo-event-time', 'neo-event-end-time'],
                                html     : me.intlFormat_time.format(record.endDate),
                                id       : me.id + '__enddate__' + recordKey,
                                removeDom: hasOverflow || !showEventEndDates
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

        me[silent ? '_vdom' : 'vdom'] = vdom;
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

Neo.applyClassConfig(Component);

export {Component as default};
