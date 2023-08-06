import BaseComponent     from '../../../component/Base.mjs';
import DateUtil          from '../../../util/Date.mjs';
import NeoArray          from '../../../util/Array.mjs';
import TimeAxisComponent from './TimeAxisComponent.mjs';
import VDomUtil          from '../../../util/VDom.mjs';

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
    /**
     * Valid values for timeAxisPosition
     * @member {String[]} timeAxisPositions=['end','start']
     * @protected
     * @static
     */
    static timeAxisPositions = ['end', 'start']

    static config = {
        /**
         * @member {String} className='Neo.calendar.view.week.Component'
         * @protected
         */
        className: 'Neo.calendar.view.week.Component',
        /**
         * @member {String[]} baseCls=['neo-calendar-weekcomponent']
         */
        baseCls: ['neo-calendar-weekcomponent'],
        /**
         * @member {Object} bind
         */
        bind: {
            calendarStore       : 'stores.calendars',
            currentDate         : data => data.currentDate,
            enableDrag          : data => data.events.enableDrag,
            endTime             : data => data.endTime,
            eventBorder         : data => data.events.border,
            eventStore          : 'stores.events',
            intlFormat_time     : data => data.intlFormat_time,
            locale              : data => data.locale,
            minimumEventDuration: data => data.minimumEventDuration,
            showWeekends        : data => data.showWeekends,
            startTime           : data => data.startTime,
            weekStartDay        : data => data.weekStartDay
        },
        /**
         * Bound to the view model
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore_: null,
        /**
         * Amount of hidden columns on both sides each inside this view.
         * @member {Number} columnsBuffer_=7
         */
        columnsBuffer_: 7,
        /**
         * Amount of visible columns inside this view.
         * @member {Number} columnsVisible_=7
         */
        columnsVisible_: 7,
        /**
         * Bound to the view model.
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
         * Bound to the view model.
         * @member {Boolean} enableDrag_=true
         * @protected
         */
        enableDrag_: true,
        /**
         * Bound to the view model
         * @member {String|null} eventBorder_=null
         */
        eventBorder_: null,
        /**
         * @member {Neo.calendar.view.week.EventDragZone|null} eventDragZone=null
         */
        eventDragZone: null,
        /**
         * Bound to the view model
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
         * Bound to the view model.
         * @member {Intl.DateTimeFormat|null} intlFormat_time_=null
         * @protected
         */
        intlFormat_time_: null,
        /**
         * @member {Boolean} isUpdating=false
         * @protected
         */
        isUpdating: false,
        /**
         * Bound to the view model.
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * Time in minutes. Bound to the view model.
         * @member {Number} minimumEventDuration=30
         * @protected
         */
        minimumEventDuration: 30,
        /**
         * Internal flag to store if updateEvents() got called while not being mounted
         * @member {Boolean} needsEventUpdate=false
         * @protected
         */
        needsEventUpdate: false,
        /**
         * @member {Neo.calendar.view.MainContainer|null} owner=null
         * @protected
         */
        owner: null,
        /**
         * config values for Neo.calendar.view.week.plugin.DragDrop
         * @member {Object} pluginDragDropConfig=null
         */
        pluginDragDropConfig: null,
        /**
         * config values for Neo.calendar.view.week.plugin.EventResizable
         * @member {Object} pluginResizableConfig=null
         */
        pluginEventResizableConfig: null,
        /**
         * @member {Boolean} showEventEndTime_=false
         */
        showEventEndTime_: false,
        /**
         * Bound to the view model.
         * @member {Boolean} showWeekends_=true
         */
        showWeekends_: true,
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
         * Internal flag to store the total amount of rendered columns.
         * Changing columnsBuffer or columnsVisible will update this value.
         * @member {Number|null} totalColumns=null
         * @protected
         */
        totalColumns: null,
        /**
         * @member {Object} vdom
         */
        vdom:
        {cn: [
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
         * Bound to the view model.
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {dblclick: me.onEventDoubleClick, scope: me, delegate: '.neo-event'},
            {wheel   : me.onWheel,            scope: me}
        ]);

        me.timeAxis = Neo.create(TimeAxisComponent, {
            appName  : me.appName,
            parentId : me.id,
            listeners: {
                change: me.onTimeAxisChange,
                scope : me
            },
            ...me.timeAxisConfig
        });

        me.getColumnTimeAxisContainer().cn[me.timeAxisPosition === 'start' ? 'unshift' : 'push'](me.timeAxis.vdom);

        if (me.calendarStore.getCount() > 0 && me.eventStore.getCount() > 0) {
            me.needsEventUpdate = true;
        }

        me.updateHeader(true, me.needsEventUpdate);

        me.needsEventUpdate && me.updateEvents(false);

        me.headerCreated = true;
    }

    /**
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

        !silent && me.update();
    }

    /**
     * Triggered after the calendarStore config got changed
     * @param {Neo.calendar.store.Calendars|null} value
     * @param {Neo.calendar.store.Calendars|null} oldValue
     * @protected
     */
    afterSetCalendarStore(value, oldValue) {
        let me = this,

        listeners = {
            load        : me.onCalendarStoreLoad,
            recordChange: me.onCalendarStoreRecordChange,
            scope       : me
        };

        oldValue?.un(listeners);
        value   ?.on(listeners);
    }

    /**
     * Triggered after the columnsBuffer config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetColumnsBuffer(value, oldValue) {
        this.totalColumns = this.visibleColumns + 2 * value;
    }

    /**
     * Triggered after the columnsVisible config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetColumnsVisible(value, oldValue) {
        this.totalColumns = 2 * this.columnsBuffer + value;
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        let me = this;

        if (me.isConstructed) {
            me.updateHeader(false, true);
            me.updateEvents();
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
        oldValue && me.updateHeader();
    }

    /**
     * Triggered after the enableDrag config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetEnableDrag(value, oldValue) {
        let me = this;

        if (value && !me.getPlugin({flag: 'dragdrop'})) {
            Promise.all([
                import('./plugin/DragDrop.mjs'),
                import('./plugin/EventResizable.mjs')
            ]).then(modules => {
                let me      = this,
                    plugins = me.plugins || [];

                plugins.push({
                    module : modules[0].default,
                    appName: me.appName,
                    flag   : 'dragdrop',
                    ...me.pluginDragDropConfig
                }, {
                    module       : modules[1].default,
                    appName      : me.appName,
                    delegationCls: 'neo-event',
                    directions   : ['b', 't'],
                    flag         : 'resizable',
                    ...me.pluginEventResizableConfig
                });

                me.plugins = plugins;
            });
        }
    }

    /**
     * Triggered after the eventBorder config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEventBorder(value, oldValue) {
        let me  = this,
            cls = me.cls;

        oldValue && NeoArray.remove(cls, `neo-event-border-${oldValue}`);
        value    && NeoArray.add(   cls, `neo-event-border-${value}`);

        me.cls = cls;
    }

    /**
     * Triggered after the eventStore config got changed
     * @param {Neo.calendar.store.Events|null} value
     * @param {Neo.calendar.store.Events|null} oldValue
     * @protected
     */
    afterSetEventStore(value, oldValue) {
        let me = this,

        listeners = {
            load        : me.onEventStoreLoad,
            recordChange: me.onEventStoreRecordChange,
            scope       : me
        };

        oldValue?.un(listeners);
        value   ?.on(listeners);
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue) {
            let me = this;

            me.intlFormat_day  = new Intl.DateTimeFormat(value, {weekday: me.dayNameFormat});
            me.updateHeader();
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this,
            rect;

        if (value) {
            if (me.needsEventUpdate) {
                me.updateEvents();
                me.needsEventUpdate = false;
            }

            await me.timeout(70);

            rect = await me.getDomRect(me.getColumnContainer().id);

            Neo.main.DomAccess.scrollBy({
                appName  : me.appName,
                direction: 'left',
                id       : me.getScrollContainer().id,
                value    : rect.width * me.columnsBuffer / me.columnsVisible / 3
            });
        }
    }

    /**
     * Triggered after the showEventEndTime config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowEventEndTime(value, oldValue) {
        oldValue !== undefined && this.updateEvents();
    }

    /**
     * Triggered after the showWeekends config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowWeekends(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-show-weekends');

        me._cls = cls; // silent update

        if (oldValue !== undefined) {
            me.updateHeader(false, true);
            me.updateEvents();
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
            timeAxisContainer = me.getColumnTimeAxisContainer();

        NeoArray[value === 'end' ? 'add' : 'remove'](cls, 'neo-timeaxis-end');

        if (oldValue !== undefined) {
            timeAxisContainer.cn.unshift(timeAxisContainer.cn.pop()); // switch the order of the 2 items
        }

        me.cls = cls; // silent update
        me.update();
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
     * @param {Date} date
     * @returns {Object}
     */
    createColumnAndHeader(date) {
        let me          = this,
            columnCls   = ['neo-c-w-column', 'neo-draggable'],
            currentDate = date.getDate(),
            currentDay  = date.getDay(),
            dateCls     = ['neo-date'],
            removeDom   = false,
            column, header;

        if (currentDay === 0 || currentDay === 6) {
            columnCls.push('neo-weekend');
            !me.showWeekends && (removeDom = true);
        }

        if (currentDate === today.day && date.getMonth() === today.month && date.getFullYear() === today.year) {
            dateCls.push('neo-today');
        }

        column = {cls: columnCls, flag: DateUtil.convertToyyyymmdd(date), removeDom};

        header =
        {cls: ['neo-header-row-item'], removeDom: removeDom, cn: [
            {cls: ['neo-day'], html: me.intlFormat_day.format(date)},
            {cls: dateCls,     html: currentDate}
        ]};

        return {column, header};
    }

    /**
     *
     */
    destroy(...args) {
        this.timeAxis = null;

        super.destroy(...args);
    }

    /**
     *
     */
    getColumnContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-column-container');
    }

    /**
     * @param {Date} date
     * @returns {String}
     */
    getColumnId(date) {
        return `${this.id}_col_${DateUtil.convertToyyyymmdd(date)}`;
    }

    /**
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
     * @param {Number|String} recordId
     * @returns {String}
     */
    getEventId(recordId) {
        return `${this.id}__${recordId}`;
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
     * @param {Object[]} data
     */
    onCalendarStoreLoad(data) {
        this.eventStore.getCount() > 0 && this.updateEvents();
    }

    /**
     * @param {Object} data
     */
    onCalendarStoreRecordChange(data) {
        this.updateEvents();
    }

    /**
     * @param {Object} data
     */
    onEventDoubleClick(data) {
        if (this.data.events.enableEdit) {
            !data.path[0].cls.includes('neo-event') && data.path.shift();

            let me                 = this,
                editEventContainer = me.owner.editEventContainer,
                eventNode          = data.path[0],
                eventVdom          = VDomUtil.findVdomChild(me.vdom, eventNode.id).vdom,
                record             = me.eventStore.get(eventVdom.flag),
                style              = editEventContainer.style;

            Object.assign(style, {left: `${eventNode.rect.width + 15}px`, top: eventVdom.style.top});
            editEventContainer.setSilent({parentId: data.path[1].id, record, style});
            editEventContainer.render(true);
        }
    }

    /**
     * @param {Object[]} data
     */
    onEventStoreLoad(data) {
        this.calendarStore.getCount() > 0 && this.updateEvents();
    }

    /**
     * @param {Object[]} data
     */
    onEventStoreRecordChange(data) {
        this.updateEvents();
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     * @param {Object[]} data.path
     */
    onFocusChange(data) {
        let oldPath = data.oldPath,
            path    = data.path;

        oldPath?.[0]?.cls.includes('neo-event') && Neo.applyDeltas(this.appName, {id: oldPath[0].id, cls: {remove: ['neo-focus']}});
        path   ?.[0]?.cls.includes('neo-event') && Neo.applyDeltas(this.appName, {id: path[0]   .id, cls: {add:    ['neo-focus']}});
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     */
    onTimeAxisChange(data) {
        let me = this;

        me.adjustTotalHeight(data, me.headerCreated);
        me.headerCreated && me.updateEvents();
    }

    /**
     * @param {Object} data
     */
    onWheel(data) {
        if (!this.isUpdating && Math.abs(data.deltaX) > Math.abs(data.deltaY)) {
            let me              = this,
                columns         = me.getColumnContainer(),
                columnsBuffer   = me.columnsBuffer,
                columnsVisible  = me.columnsVisible,
                firstColumnDate = me.firstColumnDate,
                header          = me.getHeaderContainer(),
                i               = 0,
                timeAxisWidth   = 50,
                width           = data.clientWidth - timeAxisWidth,
                config, date, scrollValue;

            // console.log(data.scrollLeft, Math.round(data.scrollLeft / (data.clientWidth - timeAxisWidth) * 7));

            if (data.deltaX > 0 && Math.round(data.scrollLeft / width * columnsBuffer) > columnsBuffer + columnsVisible - 1) {
                date = new Date(columns.cn[columns.cn.length - 1].flag);

                columns.cn.splice(0, columnsBuffer);
                header .cn.splice(0, columnsBuffer);

                for (; i < columnsBuffer; i++) {
                    date.setDate(date.getDate() + 1);

                    config = me.createColumnAndHeader(date);

                    columns.cn.push(config.column);
                    header .cn.push(config.header);
                }

                firstColumnDate.setDate(firstColumnDate.getDate() + columnsBuffer);

                // we need a short delay to move the event rendering into the next animation frame.
                // Details: https://github.com/neomjs/neo/issues/2216
                setTimeout(() => {me.updateEvents(false, columnsBuffer + columnsVisible, me.totalColumns)}, 50);

                scrollValue = -width;
            }

            else if (data.deltaX < 0 && Math.round(data.scrollLeft / width * columnsBuffer) < 1) {
                date = new Date(columns.cn[0].flag);

                columns.cn.length = columnsBuffer + columnsVisible;
                header .cn.length = columnsBuffer + columnsVisible;

                for (; i < columnsBuffer; i++) {
                    date.setDate(date.getDate() - 1);

                    config = me.createColumnAndHeader(date);

                    columns.cn.unshift(config.column);
                    header .cn.unshift(config.header);
                }

                firstColumnDate.setDate(firstColumnDate.getDate() - columnsBuffer);

                // we need a short delay to move the event rendering into the next animation frame.
                // Details: https://github.com/neomjs/neo/issues/2216
                setTimeout(() => {me.updateEvents(false, 0, columnsBuffer)}, 50);

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
     * @param {Date} date
     */
    setFirstColumnDate(date) {
        date.setDate(date.getDate() - date.getDay() + this.weekStartDay - this.columnsBuffer);
    }

    /**
     * The algorithm relies on the eventStore being sorted by startDate ASC
     * @param {Boolean} [silent=false]
     * @param {Number} [startIndex=0]
     * @param {Number} [endIndex=this.totalColumns]
     */
    updateEvents(silent=false, startIndex=0, endIndex=this.totalColumns) {
        let me = this;

        if (!me.mounted) {
            me.needsEventUpdate = true;
        } else {
            let calendarStore     = me.calendarStore,
                eventStore        = me.eventStore,
                timeAxis          = me.timeAxis,
                endTime           = timeAxis.getTime(me.endTime),
                startTime         = timeAxis.getTime(me.startTime),
                totalTime         = endTime - startTime,
                date              = DateUtil.clone(me.firstColumnDate),
                vdom              = me.vdom,
                content           = me.getColumnContainer(),
                j                 = startIndex,
                showEventEndTime  = me.showEventEndTime,
                calendarRecord, column, dayRecords, duration, endDate, eventCls, eventIntervals, hasOverflow, height, i,
                len, record, recordKey, startDate, startHours, top;

            date.setDate(date.getDate() + startIndex);

            for (; j < endIndex; j++) {
                column = content.cn[j];

                column.cn = []; // remove previous events from the vdom

                dayRecords = eventStore.getDayRecords(date);
                len        = dayRecords.length;

                for (i = 0; i < len; i++) {
                    record         = dayRecords[i];
                    calendarRecord = calendarStore.get(record.calendarId);

                    if (calendarRecord?.active) {
                        endDate   = record.endDate;
                        startDate = record.startDate;

                        if (endTime <= startDate.getHours() || startTime >= endDate.getHours()) {
                            continue;
                        }

                        if (endTime < endDate.getHours()) {
                            endDate = DateUtil.clone(endDate);
                            endDate.setHours(endTime);
                            endDate.setMinutes(0);
                        }

                        if (startTime > startDate.getHours()) {
                            startDate = DateUtil.clone(startDate);
                            startDate.setHours(startTime);
                            startDate.setMinutes(0);
                        }

                        duration       = (endDate - startDate) / 60 / 60 / 1000; // duration in hours
                        eventCls       = ['neo-event', 'neo-draggable', `neo-${calendarRecord.color}`];
                        eventIntervals = duration * 60 / timeAxis.interval;
                        hasOverflow    = false;
                        height         = Math.round(duration / totalTime * 100 * 1000) / 1000;
                        recordKey      = record[eventStore.keyProperty];
                        startHours     = (startDate.getHours() * 60 + startDate.getMinutes()) / 60;
                        top            = Math.round((startHours - startTime) / totalTime * 100 * 1000) / 1000;

                        if (eventIntervals <= 2) {
                            hasOverflow = timeAxis.rowHeight * eventIntervals < (showEventEndTime ? 50 : 34);

                            if (hasOverflow && !(showEventEndTime && (timeAxis.rowHeight / eventIntervals >= 34))) {
                                eventCls.push('neo-overflow');
                            }
                        }

                        showEventEndTime = !(hasOverflow && eventIntervals === 1 || !showEventEndTime);

                        showEventEndTime && eventCls.push('neo-show-end-time');

                        column.cn.push({
                            cls     : eventCls,
                            flag    : recordKey,
                            id      : me.getEventId(recordKey),
                            tabIndex: -1,

                            cn: [{
                                cls : ['neo-event-time'],
                                html: me.intlFormat_time.format(record.startDate),
                                id  : `${me.id}__time__${recordKey}`
                            }, {
                                cls : ['neo-event-title'],
                                html: record.title,
                                id  : `${me.id}__title__${recordKey}`
                            }, {
                                cls      : ['neo-event-time', 'neo-event-end-time'],
                                html     : me.intlFormat_time.format(record.endDate),
                                id       : `${me.id}__enddate__${recordKey}`,
                                removeDom: !showEventEndTime
                            }],

                            style: {
                                height: `calc(${height}% - 2px)`,
                                top   : `calc(${top}% + 1px)`,
                                width : 'calc(100% - 1px)'
                            }
                        });
                    }
                }

                date.setDate(date.getDate() + 1);
            }

            me[silent ? '_vdom' : 'vdom'] = vdom;
        }
    }

    /**
     * @param {Boolean} [create=false]
     * @param {Boolean} [silent=false]
     */
    updateHeader(create=false, silent=false) {
        let me           = this,
            date         = me.currentDate, // cloned
            vdom         = me.vdom,
            content      = me.getColumnContainer(),
            header       = me.getHeaderContainer(),
            i            = 0,
            showWeekends = me.showWeekends,
            columnCls, currentDate, currentDay, dateCls, headerId, removeDom;

        me.setFirstColumnDate(date);

        me.firstColumnDate = DateUtil.clone(date);

        for (; i < me.totalColumns; i++) {
            columnCls   = ['neo-c-w-column', 'neo-draggable'];
            currentDate = date.getDate();
            currentDay  = date.getDay();
            dateCls     = ['neo-date'];
            removeDom   = false;

            if (currentDay === 0 || currentDay === 6) {
                columnCls.push('neo-weekend');
                !showWeekends && (removeDom = true);
            }

            if (currentDate === today.day && date.getMonth() === today.month && date.getFullYear() === today.year) {
                dateCls.push('neo-today');
            }

            headerId = me.getColumnHeaderId(date);

            if (create) {
                content.cn.push({cls: columnCls, flag: DateUtil.convertToyyyymmdd(date), id: me.getColumnId(date), removeDom});

                header.cn.push(
                {cls: ['neo-header-row-item'], id: headerId, removeDom, cn: [
                    {cls: ['neo-day'], html: me.intlFormat_day.format(date), id: `${headerId}_day`},
                    {cls : dateCls,    html: currentDate,                    id: `${headerId}_date`}
                ]});
            } else {
                Object.assign(content.cn[i], {
                    cls : columnCls,
                    flag: DateUtil.convertToyyyymmdd(date),
                    id  : me.getColumnId(date),
                    removeDom
                });

                Object.assign(header.cn[i],       {id: headerId, removeDom});
                Object.assign(header.cn[i].cn[0], {html: me.intlFormat_day.format(date), id: `${headerId}_day`});
                Object.assign(header.cn[i].cn[1], {cls: dateCls, html: currentDate, id: `${headerId}_date`});
            }

            date.setDate(date.getDate() + 1);
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(Component);

export default Component;
