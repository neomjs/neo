import Component from '../../component/Base.mjs';
import DateUtil  from '../../util/Date.mjs';
import NeoArray  from '../../util/Array.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.YearComponent
 * @extends Neo.component.Base
 */
class YearComponent extends Component {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.YearComponent'
         * @protected
         */
        className: 'Neo.calendar.view.YearComponent',
        /**
         * @member {String[]} baseCls=['neo-calendar-yearcomponent']
         */
        baseCls: ['neo-calendar-yearcomponent'],
        /**
         * @member {Object} bind
         */
        bind: {
            calendarStore       : 'stores.calendars',
            currentDate         : data => data.currentDate,
            eventStore          : 'stores.events',
            locale              : data => data.locale,
            scrollNewYearFromTop: data => data.scrollNewYearFromTop,
            showWeekends        : data => data.showWeekends,
            weekStartDay        : data => data.weekStartDay
        },
        /**
         * Stores the last date change which got triggered while a year transition was running
         * @member {Date|null} cachedUpdate=null
         * @protected
         */
        cachedUpdate: null,
        /**
         * Bound to the view model.
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore_: null,
        /**
         * Will get passed from the MainContainer
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * The format of the column headers.
         * Valid values are: narrow, short & long
         * @member {String} dayNameFormat_='narrow'
         */
        dayNameFormat_: 'narrow',
        /**
         * @member {Number} eventIndicatorHigh_=3
         */
        eventIndicatorHigh_: 3,
        /**
         * @member {Number} eventIndicatorLow_=1
         */
        eventIndicatorLow_: 1,
        /**
         * @member {Number} eventIndicatorMedium_=2
         */
        eventIndicatorMedium_: 2,
        /**
         * Bound to the view model.
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_day=null
         * @protected
         */
        intlFormat_day: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_month=null
         * @protected
         */
        intlFormat_month: null,
        /**
         * Internal flag to prevent changing the date while change animations are still running
         * @member {Boolean} isUpdating_=false
         * @protected
         */
        isUpdating_: false,
        /**
         * Bound to the view model.
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * The format of the month header names.
         * Valid values are: narrow, short & long
         * @member {String} monthNameFormat_='long'
         */
        monthNameFormat_: 'long',
        /**
         * Internal flag to store if createMonths() got called while not being mounted
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
         * True to scroll new years in from the top
         * @member {Boolean} scrollNewYearFromTop=false
         */
        scrollNewYearFromTop: false,
        /**
         * True to show borders for the calendar month cells
         * @member {Boolean} showCellBorders_=false
         */
        showCellBorders_: false,
        /**
         * True to show the days of the previous or next month (not selectable)
         * @member {Boolean} showDisabledDays_=true
         */
        showDisabledDays_: true,
        /**
         * Bound to the view model.
         * @member {Boolean} showWeekends_=true
         */
        showWeekends_: true,
        /**
         * True to show the week number as the first column of each month
         * @member {Boolean} showWeekNumbers_=true
         */
        showWeekNumbers_: true,
        /**
         * True to show 6 weeks for each month, so that all months have the same height
         * @member {Boolean} sixWeeksPerMonth_=false
         */
        sixWeeksPerMonth_: false,
        /**
         * True to use sliding animations
         * @member {Boolean} useAnimations=true
         */
        useAnimations: true,
        /**
         * @member {Object} vdom
         */
        vdom:
        {cn: [
            {cls: ['neo-content-wrapper'], cn: [
                {cls: ['neo-year-header'], cn: [
                    {},
                    {cls: ['neo-nav-button', 'neo-prev-button']},
                    {cls: ['neo-nav-button', 'neo-next-button']}
                ]},
                {cls: ['neo-months-container']}
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
     * @param config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onNavButtonClick, delegate: '.neo-nav-button', scope: me},
            {wheel: me.onWheel, scope: me}
        ]);

        if (me.calendarStore.getCount() > 0 && me.eventStore.getCount() > 0) {
            me.createMonths(true) // silent update
        }

        me.updateHeaderYear()
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
        value   ?.on(listeners)
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (this.isConstructed) {
            let oldYear = oldValue.getFullYear(),
                year    = value   .getFullYear();

            if (year !== oldYear) {
                this.changeYear(year - oldYear)
            } else {
                // todo
                console.log('## select a new day', value.getMonth(), value.getDate())
            }
        }
    }

    /**
     * Triggered after the dayNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDayNameFormat(value, oldValue) {
        this.updateDayNamesRows(value, oldValue)
    }

    /**
     * Triggered after the eventIndicatorHigh config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetEventIndicatorHigh(value, oldValue) {
        oldValue !== undefined && this.createMonths()
    }

    /**
     * Triggered after the eventIndicatorLow config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetEventIndicatorLow(value, oldValue) {
        oldValue !== undefined && this.createMonths()
    }

    /**
     * Triggered after the eventIndicatorMedium config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetEventIndicatorMedium(value, oldValue) {
        oldValue !== undefined && this.createMonths()
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
        value   ?.on(listeners)
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

            me.updateDayNamesRows(me.dayNameFormat, '', true);
            me.updateMonthNameFormat(me.monthNameFormat, '')
        }
    }

    /**
     * Triggered after the monthNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetMonthNameFormat(value, oldValue) {
        this.updateMonthNameFormat(value, oldValue)
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (value && me.needsEventUpdate) {
            me.createMonths();
            me.needsEventUpdate = false
        }
    }

    /**
     * Triggered after the showCellBorders config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowCellBorders(value, oldValue) {
        let cls = this.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-show-cell-borders');
        this.cls = cls
    }

    /**
     * Triggered after the showWeekends config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowWeekends(value, oldValue) {
        if (oldValue !== undefined) {
            let me     = this,
                {vdom} = me,
                i      = 0,
                item, itemCn, j, k, len;

            for (; i < 12; i++) { // months
                itemCn = vdom.cn[0].cn[1].cn[i].cn;
                len    = itemCn.length;

                for (j=1; j < len; j++) { // weeks
                    for (k=1; k < 8; k++) { // days
                        item = itemCn[j].cn[k];

                        if (item.cls.includes('neo-weekend')) {
                            if (value) {
                                delete item.removeDom
                            } else {
                                item.removeDom = true
                            }
                        }
                    }
                }
            }

            // triggers the vdom update
            me.updateDayNamesRows(me.dayNameFormat, '')
        }
    }

    /**
     * Triggered after the showWeekNumbers config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowWeekNumbers(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this,
                i  = 0,
                itemCn, j, len;

            for (; i < 12; i++) {
                itemCn = me.vdom.cn[0].cn[1].cn[i].cn;
                len    = itemCn.length;

                for (j = 1; j < len; j++) {
                    itemCn[j].cn[0].removeDom = !value
                }
            }

            me.update()
        }
    }

    /**
     * Triggered after the sixWeeksPerMonth config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSixWeeksPerMonth(value, oldValue) {
        if (oldValue !== undefined) {
            let me   = this,
                date = me.currentDate, // cloned
                i    = 0;

            date.setMonth(0);
            date.setDate(1);

            for (; i < 12; i++) {
                me.vdom.cn[0].cn[1].cn[i].cn[7].removeDom = DateUtil.getWeeksOfMonth(date, me.weekStartDay) === 5 && !value;
                date.setMonth(date.getMonth() + 1)
            }

            me.update()
        }
    }

    /**
     * Triggered after the weekStartDay config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetWeekStartDay(value, oldValue) {
        oldValue !== undefined && this.createMonths()
    }

    /**
     * Triggered before the dayNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetDayNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'dayNameFormat', DateUtil.prototype.dayNameFormats)
    }

    /**
     * Triggered before the monthNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMonthNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'monthNameFormat', DateUtil.prototype.monthNameFormats)
    }

    /**
     * Stores the last date change which could not get applied while a transition was running
     * @param {Date} [date=this.currentDate]
     * @protected
     */
    cacheUpdate(date=this.currentDate) {
        this.cachedUpdate = date
    }

    /**
     * @param {Number} increment
     */
    changeYear(increment) {
        let me = this,
            scrollFromTop, vdom, y;

        if (!me.useAnimations) {
            // me.recreateContent(increment); // todo
        } else {
            if (!me.isUpdating) {
                me.isUpdating = true;

                me.getDomRect().then(data => {
                    scrollFromTop = me.scrollNewYearFromTop && increment < 0 || !me.scrollNewYearFromTop && increment > 0;
                    vdom          = me.vdom;
                    y             = scrollFromTop ? 0 : -data.height;

                    vdom.cn.push(
                        {cls: ['neo-relative'], cn: [
                            {cls: ['neo-animation-wrapper'], cn: [
                                {cls: ['neo-content-wrapper'], cn: [
                                    {cls: ['neo-year-header'], cn: [
                                        {html: me.currentDate.getFullYear()},
                                        {cls: ['neo-nav-button', 'neo-prev-button']},
                                        {cls: ['neo-nav-button', 'neo-next-button']}
                                    ]},
                                    {cls: ['neo-months-container']}
                                ]}
                            ],
                            style: {
                                height   : `${2 * data.height}px`,
                                transform: `translateY(${y}px)`,
                                width    : `${data.width}px`
                            }}
                        ]}
                    );

                    me.createMonths(true, vdom.cn[1].cn[0].cn[0].cn[1]);
                    vdom.cn[1].cn[0].cn[scrollFromTop ? 'unshift' : 'push'](vdom.cn[0]);
                    vdom.cn.splice(0, 1);

                    me.promiseUpdate(vdom).then(() => {
                        y = scrollFromTop ? -data.height : 0;
                        vdom.cn[0].cn[0].style.transform = `translateY(${y}px)`;
                        me.update();

                        me.timeout(300).then(() => {
                            vdom.cn[0] = vdom.cn[0].cn[0].cn[scrollFromTop ? 1 : 0];
                            me.triggerVdomUpdate()
                        })
                    })
                })
            }
        }
    }

    /**
     *
     */
    createDayNamesRow() {
        let me   = this,
            date = me.currentDate, // cloned
            i    = 0,
            row  = {cls: ['neo-calendar-week'], cn: [{cls: ['neo-cell', 'neo-top-left-spacer']}]},
            day, node;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 7; i++) {
            node = {
                cls : ['neo-cell', 'neo-weekday-cell'],
                html: me.intlFormat_day.format(date)
            };

            day = date.getDay();

            if (!me.showWeekends && (day === 0 || day === 6)) {
                node.removeDom = true
            }

            row.cn.push(node);

            date.setDate(date.getDate() + 1)
        }

        return row
    }

    /**
     * @param {Object} containerEl
     * @param {Date} currentDate
     * @returns {Object} vdom
     */
    createMonthContent(containerEl, currentDate) {
        let me             = this,
            {calendarStore, eventStore} = me,
            currentDay     = currentDate.getDate(),
            currentMonth   = currentDate.getMonth(),
            currentYear    = currentDate.getFullYear(),
            date           = DateUtil.clone(currentDate),
            valueDate      = me.currentDate, // cloned
            valueMonth     = valueDate.getMonth(),
            valueYear      = valueDate.getFullYear(),
            daysInMonth    = DateUtil.getDaysInMonth(currentDate),
            firstDayOffset = DateUtil.getFirstDayOffset(currentDate, me.weekStartDay),
            columns        = 7,
            i              = 0,
            weekDate       = DateUtil.clone(currentDate),
            cellId, config, configCls, dateDay, day, dayRecords, hasContent, j, row, rows;

        rows = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day  = 1 - firstDayOffset;

        date.setDate(day);
        weekDate.setDate(day + 7);

        for (; i < 6; i++) {
            row = {
                cls      : ['neo-calendar-week'],
                removeDom: i === rows && !me.sixWeeksPerMonth,

                cn: [{
                    cls      : ['neo-cell', 'neo-weeknumber-cell'],
                    html     : DateUtil.getWeekOfYear(weekDate),
                    removeDom: !me.showWeekNumbers
                }]
            };

            weekDate.setDate(weekDate.getDate() + 7);

            for (j=0; j < columns; j++) {
                hasContent = day > 0 && day <= daysInMonth;
                cellId     = me.getCellId(currentYear, currentMonth + 1, day);
                dateDay    = date.getDay();

                config = {
                    id      : cellId,
                    cls     : hasContent ? ['neo-cell'] : ['neo-cell', 'neo-disabled'],
                    tabIndex: hasContent ? -1 : null,

                    cn: [{
                        cls : ['neo-cell-content'],
                        html: hasContent ? day : me.showDisabledDays ? date.getDate() : ''
                    }]
                };

                configCls = config.cls;

                if (dateDay === 0 || dateDay === 6) {
                    configCls.push('neo-weekend');

                    if (!me.showWeekends) {
                        config.removeDom = true
                    }
                }


                if (today.year === currentYear && today.month === currentMonth && today.day === day) {
                    config.cn[0].cls.push('neo-today')
                }

                if (valueYear === currentYear && valueMonth === currentMonth && day === currentDay) {
                    configCls.push('neo-selected')
                }

                if (!config.removeDom) {
                    dayRecords = eventStore.getDayRecords(date);
                    dayRecords = dayRecords.filter(record => calendarStore.get(record.calendarId).active);

                         if (dayRecords.length >= me.eventIndicatorHigh)   {configCls.push('neo-events-high');}
                    else if (dayRecords.length >= me.eventIndicatorMedium) {configCls.push('neo-events-medium');}
                    else if (dayRecords.length >= me.eventIndicatorLow)    {configCls.push('neo-events-low');}
                }

                row.cn.push(config);

                date.setDate(date.getDate() + 1);

                day++
            }

            containerEl.cn.push(row)
        }

        return containerEl
    }

    /**
     * @param {Boolean} [silent=false] true to update the vdom silently
     * @param {Object} [containerEl]
     */
    createMonths(silent=false, containerEl) {
        let me = this;

        if (!me.mounted) {
            me.needsEventUpdate = true
        } else {
            let currentDate    = me.currentDate, // cloned
                {vdom}         = me,
                monthContainer = containerEl || vdom.cn[0].cn[1],
                i              = 0,
                monthVdom;

            monthContainer.cn = [];

            for (; i < 12; i++) {
                currentDate.setMonth(i);
                currentDate.setDate(1);

                monthVdom =
                {cls: ['neo-month'], cn: [
                    {cls: ['neo-month-name'], html: me.intlFormat_month.format(currentDate)},
                    me.createDayNamesRow()
                ]};

                monthVdom = me.createMonthContent(monthVdom, DateUtil.clone(currentDate));

                monthContainer.cn.push(monthVdom)
            }

            !silent && me.update()
        }
    }

    /**
     * @param {Number|String} year
     * @param {Number|String} month
     * @param {Number|String} day
     * @returns {String} id
     */
    getCellId(year, month, day) {
        day = day.toString();

        if (day.length < 2) {
            day = '0' + day
        }

        month = month.toString();

        if (month.length < 2) {
            month = '0' + month
        }

        return this.id + '__' + year + '-' + month + '-' + day
    }

    /**
     * @param {Object[]} data
     */
    onCalendarStoreLoad(data) {
        this.eventStore.getCount() > 0 && this.createMonths()
    }

    /**
     * @param {Object} data
     */
    onCalendarStoreRecordChange(data) {
        this.createMonths()
    }

    /**
     * @param {Object[]} data
     */
    onEventStoreLoad(data) {
        this.calendarStore.getCount() > 0 && this.createMonths()
    }

    /**
     * @param {Object[]} data
     */
    onEventStoreRecordChange(data) {
        this.createMonths()
    }

    /**
     * @param {Object} data
     */
    onNavButtonClick(data) {
        let me            = this,
            {currentDate} = me; // cloned

        currentDate.setFullYear(currentDate.getFullYear() + (data.path[0].cls.includes('neo-next-button') ? 1 : -1));

        me.currentDate = currentDate
    }

    /**
     * @param {Object} data
     */
    onWheel(data) {
        if (Math.abs(data.deltaY) > Math.abs(data.deltaX)) {
            let me            = this,
                {currentDate} = me; // cloned

            currentDate.setFullYear(currentDate.getFullYear() + (data.deltaY > 0 ? 1 : -1));

            me.currentDate = currentDate
        }
    }

    /**
     * Triggers a vdom update & sets isUpdating
     * @param {Boolean} [silent=false]
     * @protected
     */
    triggerVdomUpdate(silent=false) {
        if (!silent) {
            let me = this;

            me.isUpdating = true;

            me.promiseUpdate(me.vdom).then(() => {
                me.isUpdating = false
            })
        }
    }

    /**
     * Dynamically update the weekday rows inside each month
     * @param {String} value
     * @param {String} oldValue
     * @param {Boolean} [silent=false]
     */
    updateDayNamesRows(value, oldValue, silent=false) {
        let me = this;

        me.intlFormat_day = new Intl.DateTimeFormat(me.locale, {weekday: value});

        if (oldValue !== undefined) {
            let date   = me.currentDate, // cloned
                {vdom} = me,
                i      = 1,
                day, j, node;

            date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

            for (; i < 8; i++) {
                for (j=0; j < 12; j++) {
                    day  = date.getDay();
                    node = vdom.cn[0].cn[1].cn[j].cn[1].cn[i];

                    node.html = me.intlFormat_day.format(date);

                    if (!me.showWeekends && (day === 0 || day === 6)) {
                        node.removeDom = true
                    } else {
                        delete node.removeDom
                    }
                }

                date.setDate(date.getDate() + 1)
            }

            !silent && me.update()
        }
    }

    /**
     *
     */
    updateHeaderYear() {
        this.vdom.cn[0].cn[0].cn[0].html = this.currentDate.getFullYear()
    }

    /**
     * Dynamically update the monthNameFormat
     * @param {String} value
     * @param {String} oldValue
     * @param {Boolean} [silent=false]
     * @protected
     */
    updateMonthNameFormat(value, oldValue, silent=false) {
        let me = this;

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: value});

        if (oldValue !== undefined) {
            let {currentDate, vdom} = me,
                i                   = 0;

            for (; i < 12; i++) {
                currentDate.setMonth(i);
                currentDate.setDate(1);

                vdom.cn[0].cn[1].cn[i].cn[0].html = me.intlFormat_month.format(currentDate)
            }

            !silent && me.update()
        }
    }
}

Neo.setupClass(YearComponent);

export default YearComponent;
