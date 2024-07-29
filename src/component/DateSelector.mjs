import ClassSystemUtil   from '../util/ClassSystem.mjs';
import Component         from './Base.mjs';
import DateSelectorModel from '../selection/DateSelectorModel.mjs';
import DateUtil          from '../util/Date.mjs';
import NeoArray          from '../util/Array.mjs';
import VDomUtil          from '../util/VDom.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.component.DateSelector
 * @extends Neo.component.Base
 */
class DateSelector extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.DateSelector'
         * @protected
         */
        className: 'Neo.component.DateSelector',
        /**
         * @member {String} ntype='dateselector'
         * @protected
         */
        ntype: 'dateselector',
        /**
         * @member {String[]} baseCls=['neo-dateselector']
         */
        baseCls: ['neo-dateselector'],
        /**
         * Stores the last date change which got triggered while a month / year transition was running
         * @member {Date|null} cachedUpdate=null
         * @protected
         */
        cachedUpdate: null,
        /**
         * Date object created on the value config
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * @member {String} dateFormat='Y-m-d'
         */
        dateFormat: 'Y-m-d',
        /**
         * The format of the column headers.
         * Valid values are: narrow, short & long
         * @member {String} dayNameFormat_='short'
         */
        dayNameFormat_: 'short',
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_day=null
         * @protected
         */
        intlFormat_day: null,
        /**
         * Internal flag to prevent changing the date while change animations are still running
         * @member {Boolean} isUpdating_=false
         * @protected
         */
        isUpdating_: false,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {String|null} maxValue_=null
         */
        maxValue_: null,
        /**
         * @member {String|null} minValue_=null
         */
        minValue_: null,
        /**
         * Used for wheel events. min value = 1.
         * A higher value means lesser sensitivity for wheel events
         * => you need to scroll "more" to trigger a month / year change
         * @member {Number} mouseWheelDelta=1
         */
        mouseWheelDelta: 1,
        /**
         * True to scroll new years in from the top
         * @member {Boolean} scrollNewYearFromTop=false
         */
        scrollNewYearFromTop: false,
        /**
         * Either pass a selection.Model module, an instance or a config object
         * @member {Object|Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * True to show inner cell & header cell borders
         * @member {Boolean} showCellBorders_=true
         */
        showCellBorders_: false,
        /**
         * True to show the days of the previous or next month (not selectable)
         * @member {Boolean} showDisabledDays_=true
         */
        showDisabledDays_: true,
        /**
         * @member {Boolean} showWeekends_=true
         */
        showWeekends_: true,
        /**
         * True to use sliding animations
         * @member {Boolean} useAnimations=true
         */
        useAnimations: true,
        /**
         * @member {String} value_=DateUtil.convertToyyyymmdd(new Date())
         */
        value_: DateUtil.convertToyyyymmdd(todayDate),
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: -1, cn: [
            {cls: ['neo-dateselector-header'], cn: [
                {cls: ['neo-nav-button', 'neo-prev-button']},
                {cls: ['neo-center-region'], cn: [
                    {cls: ['neo-month-text']},
                    {cls: ['neo-year-text']}
                ]},
                {cls: ['neo-nav-button', 'neo-next-button']}
            ]},
            {cls: ['neo-dateselector-content'], cn: []}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onComponentClick, scope: me},
            {wheel: me.onComponentWheel, scope: me}
        ])
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        let me = this,
            dayIncrement, method, methodParams,  monthIncrement, yearIncrement;

        if (me.mounted) {
            dayIncrement   = value.getDate()     - oldValue.getDate();
            monthIncrement = value.getMonth()    - oldValue.getMonth();
            yearIncrement  = value.getFullYear() - oldValue.getFullYear();

            if (monthIncrement !== 0) { // gets used when month & year changed as well
                method       = 'changeMonth';
                methodParams = [monthIncrement, yearIncrement]
            } else if (yearIncrement !== 0) {
                method       = 'changeYear';
                methodParams = [yearIncrement]
            } else if (dayIncrement !== 0) {
                me.selectionModel.select(me.id + '__' + DateUtil.convertToyyyymmdd(value))
            }

            if (method) {
                if (me.containsFocus) {
                    Neo.main.DomAccess.focus({
                        id: me.id
                    }).then(data => {
                        me[method](...methodParams)
                    })
                } else {
                    me[method](...methodParams)
                }
            }
        } else if (value) {
            me.updateHeaderMonth(0, 0, true);
            me.updateHeaderYear(0, true);
            me.recreateDayViewContent(false, false)
        }
    }

    /**
     * Triggered after the dayNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDayNameFormat(value, oldValue) {
        this.updateHeaderDays(value, oldValue)
    }

    /**
     * Triggered after the isUpdating config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsUpdating(value, oldValue) {
        if (value === false) {
            let me = this;

            if (me.cachedUpdate && me.cachedUpdate !== new Date(`${me.value}T00:00:00.000Z`)) {
                me.afterSetValue(me.value, DateUtil.convertToyyyymmdd(me.cachedUpdate))
            }

            me.cachedUpdate = null
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
            let me = this,
                dt = new Intl.DateTimeFormat(me.locale, {month: 'short'});

            me.updateHeaderDays(me.dayNameFormat, '', true);

            me.getHeaderMonthEl().html = dt.format(me.currentDate);

            me.update()
        }
    }

    /**
     * Triggered after the maxValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMaxValue(value, oldValue) {
        oldValue !== undefined && this.recreateDayViewContent()
    }

    /**
     * Triggered after the minValue config got changed
     * @param {Text} value
     * @param {Text} oldValue
     * @protected
     */
    afterSetMinValue(value, oldValue) {
        oldValue !== undefined && this.recreateDayViewContent()
    }

    /**
     * Triggered after the showCellBorders config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowCellBorders(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray.toggle(cls, 'neo-hide-inner-borders', !value);
        me.cls = cls
    }

    /**
     * Triggered after the showDisabledDays config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowDisabledDays(value, oldValue) {
        oldValue !== undefined && this.recreateDayViewContent()
    }

    /**
     * Triggered after the showWeekends config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowWeekends(value, oldValue) {
        if (oldValue !== undefined) {
            let me  = this,
                len = 7,
                i, item;

            me.getCenterContentEl().cn.forEach((row, index) => {
                // ignore the header
                if (index > 0) {
                    for (i=0; i < len; i++) {
                        item = row.cn[i];

                        if (item.cls.includes('neo-weekend')) {
                            if (value) {
                                delete item.removeDom
                            } else {
                                item.removeDom = true
                            }
                        }
                    }
                }
            });

            // triggers the vdom update
            me.updateHeaderDays(me.dayNameFormat, '')
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        oldValue !== undefined && value.register(this)
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        if (value) {
            if (!me.isUpdating) {
                me.currentDate = new Date(`${value}T00:00:00.000Z`);

                me.fire('change', {
                    component: me,
                    oldValue,
                    value
                })
            } else {
                me.cacheUpdate()
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
        oldValue !== undefined && this.recreateDayViewContent(false, false)
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
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue && oldValue.destroy();

        return ClassSystemUtil.beforeSetInstance(value, DateSelectorModel)
    }

    /**
     * Triggered before the weekStartDay config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetWeekStartDay(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'weekStartDay', DateUtil.prototype.weekStartDays)
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
     * @param {Number} yearIncrement
     */
    changeMonth(increment, yearIncrement) {
        let me             = this,
            slideDirection = yearIncrement > 0 ? 'right' : yearIncrement < 0 ? 'left' : increment < 0 ? 'left' : 'right',
            headerMonthOpts, vdom, x;

        if (!me.useAnimations) {
            me.recreateContent(increment, yearIncrement)
        } else {
            if (!me.isUpdating) {
                me.isUpdating = true;

                me.getDomRect([me.getCenterContentEl().id, me.getHeaderMonthEl().id]).then(data => {
                    vdom = me.vdom;
                    x    = slideDirection === 'right' ? 0 : -data[0].width;

                    vdom.cn.push(
                        {cls: ['neo-relative'], cn: [
                            {cls: ['neo-animation-wrapper'], style: {height: `${data[0].height}px`, transform: `translateX(${x}px)`, width: `${2 * data[0].width}px`}, cn: [
                                {cls: ['neo-dateselector-content'], cn: []}
                            ]}
                        ]}
                    );

                    headerMonthOpts = me.updateHeaderMonth(increment, yearIncrement, true, data[1]);

                    if (yearIncrement !== 0) {
                        me.updateHeaderYear(increment, true)
                    }

                    me.createDayViewContent(true, vdom.cn[2].cn[0].cn[0]);
                    vdom.cn[2].cn[0].cn[slideDirection === 'right'? 'unshift' : 'push'](vdom.cn[1]);
                    vdom.cn.splice(1, 1);

                    me.promiseUpdate().then(() => {
                        me.changeMonthTransitionCallback({data: data[0], slideDirection: slideDirection});
                        me.updateHeaderMonthTransitionCallback(headerMonthOpts);
                        me.update();

                        me.timeout(300).then(() => {
                            me.changeMonthWrapperCallback(slideDirection);
                            me.updateHeaderMonthWrapperCallback(headerMonthOpts);
                            me.triggerVdomUpdate()
                        })
                    })
                })
            } else {
                me.cacheUpdate()
            }
        }
    }

    /**
     * Slides the wrapper div to the left or right
     * @param {Object} opts
     * @param {Object} opts.data
     * @param {String} opts.slideDirection
     * @protected
     */
    changeMonthTransitionCallback(opts) {
        let me   = this,
            {data, slideDirection} = opts,
            x;

        x = slideDirection === 'right' ? -data.width : 0;
        me.vdom.cn[1].cn[0].style.transform = `translateX(${x}px)`
    }

    /**
     * Replaces the wrapper div with the target month
     * @param {String} slideDirection
     * @protected
     */
    changeMonthWrapperCallback(slideDirection) {
        let {vdom} = this;

        vdom.cn[1] = vdom.cn[1].cn[0].cn[slideDirection === 'right' ? 1 : 0]
    }

    /**
     * @param {Number} increment
     */
    changeYear(increment) {
        let me = this,
            scrollFromTop, style, vdom, y;

        if (!me.useAnimations) {
            me.recreateContent(0, increment)
        } else {
            if (!me.isUpdating) {
                me.isUpdating = true;

                me.getDomRect(me.getCenterContentEl().id).then(data => {
                    scrollFromTop = me.scrollNewYearFromTop && increment < 0 || !me.scrollNewYearFromTop && increment > 0;
                    vdom          = me.vdom;
                    y             = scrollFromTop ? 0 : -data.height;

                    style = {
                        flexDirection: 'column',
                        height       : `${2 * data.height}px`,
                        transform    : `translateY(${y}px)`,
                        width        : `${data.width}px`
                    };

                    vdom.cn.push(
                        {cls: ['neo-relative'], cn: [
                            {cls: ['neo-animation-wrapper'], style: style, cn: [
                                {cls: ['neo-dateselector-content'], cn: []}
                            ]}
                        ]}
                    );

                    me.updateHeaderYear(increment, true);

                    me.createDayViewContent(true, vdom.cn[2].cn[0].cn[0]);
                    vdom.cn[2].cn[0].cn[scrollFromTop ? 'unshift' : 'push'](vdom.cn[1]);
                    vdom.cn.splice(1, 1);

                    me.promiseUpdate(vdom).then(() => {
                        y = scrollFromTop ? -data.height : 0;
                        vdom.cn[1].cn[0].style.transform = `translateY(${y}px)`;
                        me.update();

                        me.timeout(300).then(() => {
                            vdom.cn[1] = vdom.cn[1].cn[0].cn[scrollFromTop ? 1 : 0];
                            me.triggerVdomUpdate()
                        })
                    })
                })
            } else {
                me.cacheUpdate()
            }
        }
    }

    /**
     *
     */
    createDayNamesRow() {
        let me   = this,
            date = DateUtil.clone(me.currentDate),
            i    = 0,
            len  = 7,
            row  = {cls: ['neo-row', 'neo-header-row'], cn: []},
            config, day;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < len; i++) {
            config =
            {cls: ['neo-cell'], cn: [
                {cls : ['neo-cell-content'], html: me.intlFormat_day.format(date)}
            ]};

            day = date.getDay();

            if (!me.showWeekends && (day === 0 || day === 6)) {
                config.removeDom = true
            }

            row.cn.push(config);

            date.setDate(date.getDate() + 1)
        }

        return row
    }

    /**
     * @param {Boolean} silent=false true to update the vdom silently
     * @param {Object} [containerEl]
     */
    createDayViewContent(silent=false, containerEl) {
        let me              = this,
            {currentDate}   = me,
            currentDay      = currentDate.getDate(),
            currentMonth    = currentDate.getMonth(),
            currentYear     = currentDate.getFullYear(),
            date            = me.currentDate, // cloned
            maxDate         = me.maxValue && new Date(`${me.maxValue}T00:00:00.000Z`),
            minDate         = me.minValue && new Date(`${me.minValue}T00:00:00.000Z`),
            valueDate       = new Date(`${me.value}T00:00:00.000Z`),
            valueMonth      = valueDate.getMonth(),
            valueYear       = valueDate.getFullYear(),
            daysInMonth     = DateUtil.getDaysInMonth(currentDate),
            firstDayInMonth = DateUtil.getFirstDayOfMonth(currentDate),
            firstDayOffset  = firstDayInMonth - me.weekStartDay,
            centerEl        = containerEl || me.getCenterContentEl(),
            columns         = 7,
            i               = 0,
            cellId, config, dateDay, day, hasContent, j, row, rows;

        firstDayOffset = firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset;
        rows           = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day            = 1 - firstDayOffset;

        date.setDate(day);

        centerEl.cn.push(me.createDayNamesRow());

        for (; i < rows; i++) {
            row = {cls: ['neo-row'], cn: []};

            for (j=0; j < columns; j++) {
                hasContent = day > 0 && day <= daysInMonth;
                cellId     = me.getCellId(currentYear, currentMonth + 1, day);

                dateDay = date.getDay();

                config ={
                    id      : cellId,
                    cls     : hasContent ? ['neo-cell'] : ['neo-cell', 'neo-disabled'],
                    tabIndex: hasContent ? -1 : null,
                    cn: [{
                        cls : ['neo-cell-content'],
                        html: hasContent ? day : me.showDisabledDays ? date.getDate() : ''
                    }]
                };

                if (dateDay === 0 || dateDay === 6) {
                    if (!me.showWeekends) {
                        config.removeDom = true
                    }

                    config.cls.push('neo-weekend')
                }

                if (maxDate && date > maxDate || minDate && date < minDate) {
                    NeoArray.add(config.cls, 'neo-disabled')
                }

                if (today.year === currentYear && today.month === currentMonth && today.day === day) {
                    config.cn[0].cls.push('neo-today')
                }

                if (valueYear === currentYear && valueMonth === currentMonth && day === currentDay) {
                    config.cls.push('neo-selected');
                    me.selectionModel.items = [cellId] // silent update
                }

                row.cn.push(config);

                date.setDate(date.getDate() + 1);

                day++
            }

            centerEl.cn.push(row)
        }

        !silent && me.update()
    }

    /**
     *
     */
    focusCurrentItem() {
        this.focus(this.selectionModel.items[0])
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
     * @returns {Object}
     */
    getCenterContentEl() {
        return this.vdom.cn[1]
    }

    /**
     * @returns {Object}
     */
    getHeaderMonthEl() {
        return this.vdom.cn[0].cn[1].cn[0]
    }

    /**
     * @returns {Object}
     */
    getHeaderYearEl() {
        return this.vdom.cn[0].cn[1].cn[1]
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            cellEl = VDomUtil.findVdomChild(me.vdom, data.path[0].id),
            date   = me.currentDate; // cloned

        date.setDate(parseInt(cellEl.vdom.cn[0].html));
        date = DateUtil.convertToyyyymmdd(date);

        // We want to always trigger a change event.
        // Reason: A form.field.Date can have a null value, and we want to select the current date.
        me._value = date;
        me.afterSetValue(date, null)
    }

    /**
     * @param {Object} data
     */
    onComponentClick(data) {
        let me  = this,
            cls = data.path[0].cls,
            date, monthIncrement;

             if (cls.includes('neo-cell'))        {me.onCellClick(data)}
        else if (cls.includes('neo-next-button')) {monthIncrement =  1}
        else if (cls.includes('neo-prev-button')) {monthIncrement = -1}

        if (monthIncrement) {
            date = me.currentDate; // cloned
            date.setMonth(date.getMonth() + monthIncrement);
            me.value = DateUtil.convertToyyyymmdd(date)
        }
    }

    /**
     * @param {Object} data
     */
    onComponentWheel(data) {
        let me               = this,
            {deltaX, deltaY} = data,
            wheelDelta       = me.mouseWheelDelta,
            date, monthIncrement, yearIncrement;

        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                 if (deltaY >=  wheelDelta) {yearIncrement  =  1}
            else if (deltaY <= -wheelDelta) {yearIncrement  = -1}
        } else {
                 if (deltaX >=  wheelDelta) {monthIncrement =  1}
            else if (deltaX <= -wheelDelta) {monthIncrement = -1}
        }

        if (monthIncrement) {
            date = me.currentDate; // cloned
            date.setMonth(date.getMonth() + monthIncrement);
            me.value = DateUtil.convertToyyyymmdd(date)
        } else if (yearIncrement) {
            date = me.currentDate; // cloned
            date.setFullYear(date.getFullYear() + yearIncrement);
            me.value = DateUtil.convertToyyyymmdd(date)
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this)
    }

    /**
     * @param {String[]} items
     */
    onSelect(items) {
        this.value = items[0].split('__')[1]
    }

    /**
     * Recreates the current centerEl, month & year el
     * @param {Number} monthIncrement
     * @param {Number} yearIncrement
     * @param {Boolean} [silent=false]
     * @protected
     */
    recreateContent(monthIncrement, yearIncrement, silent=false) {
        let me = this;

        me.recreateDayViewContent(true);

        monthIncrement !== 0 && me.updateHeaderMonth(monthIncrement, yearIncrement, true);
        yearIncrement  !== 0 && me.updateHeaderYear(yearIncrement, true);

        me.triggerVdomUpdate(silent)
    }

    /**
     * Recreates the current centerEl
     * @param {Boolean} [silent=false]
     * @param {Boolean} [syncIds=true]
     * @protected
     */
    recreateDayViewContent(silent=false, syncIds=true) {
        let me = this;

        me.getCenterContentEl().cn = [];
        me.createDayViewContent(true);

        // using force => we do want to keep the same ids
        syncIds && me.syncVdomIds(me.vnode, me.vdom, true);

        !silent && me.update()
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

            me.promiseUpdate().then(() => {
                me.isUpdating = false
            })
        }
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @param {Boolean} [silent=false]
     */
    updateHeaderDays(value, oldValue, silent=false) {
        let me = this;

        me.intlFormat_day = new Intl.DateTimeFormat(me.locale, {weekday: value});

        if (oldValue !== undefined) {
            let centerEl = me.getCenterContentEl().cn[0],
                date     = me.currentDate, // cloned
                i        = 0,
                day, node;

            date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

            for (; i < 7; i++) {
                node = centerEl.cn[i];

                node.cn[0].html = me.intlFormat_day.format(date);

                day = date.getDay();

                if (!me.showWeekends && (day === 0 || day === 6)) {
                    node.removeDom = true
                } else {
                    delete node.removeDom
                }

                date.setDate(date.getDate() + 1)
            }

            !silent && me.update()
        }
    }

    /**
     * @param {Number} increment
     * @param {Number} yearIncrement
     * @param {Boolean} silent=false
     * @param {Object} monthElDomRect
     * @returns {Object|null} opts or null in case no transitions are needed
     */
    updateHeaderMonth(increment, yearIncrement, silent=false, monthElDomRect) {
        let me             = this,
            dt             = new Intl.DateTimeFormat(me.locale, {month: 'short'}),
            currentMonth   = dt.format(me.currentDate),
            monthEl        = me.getHeaderMonthEl(),
            slideDirection = yearIncrement > 0 ? 'bottom' : yearIncrement < 0 ? 'top' : increment < 0 ? 'top' : 'bottom',
            {vdom}         = me,
            headerCenterEl, y;

        if (!me.mounted || !me.useAnimations) {
            monthEl.html = currentMonth;
            !silent && me.update();
            return null
        } else {
            y = slideDirection === 'top' ? 0 : -monthElDomRect.height;

            vdom.cn[0].cn[1].cn.unshift({
                cls  : ['neo-relative-header'],
                style: {
                    height: monthElDomRect.height + 'px',
                    width : monthElDomRect.width  + 'px'
                },
                cn: [{
                    cls: ['neo-animation-wrapper-header'],
                    cn : [],
                    style: {
                        height   : 2 * monthElDomRect.height + 'px',
                        transform: `translateY(${y}px)`,
                        width    : monthElDomRect.width + 'px'
                    }
                }]
            });

            headerCenterEl = vdom.cn[0].cn[1];

            headerCenterEl.cn[0].cn[0].cn.push({
                cls : ['neo-month-text'],
                html: currentMonth
            });

            headerCenterEl.cn[0].cn[0].cn[slideDirection === 'top' ? 'unshift' : 'push'](headerCenterEl.cn[1]);
            headerCenterEl.cn.splice(1, 1);

            !silent && me.update();

            return {
                data: monthElDomRect,
                headerCenterEl,
                increment,
                yearIncrement
            }
        }
    }

    /**
     * Slides the wrapper div to the top or bottom
     * @param {Object} opts
     * @param {Object} opts.data
     * @param {Object} opts.headerCenterEl
     * @param {Number} opts.increment
     * @param {Number} opts.yearIncrement
     * @protected
     */
    updateHeaderMonthTransitionCallback(opts) {
        let {data, headerCenterEl, increment, yearIncrement} = opts,
            slideDirection = yearIncrement > 0 ? 'bottom' : yearIncrement < 0 ? 'top' : increment < 0 ? 'top' : 'bottom',
            y;

        y = slideDirection === 'top' ? -data.height : 0;
        headerCenterEl.cn[0].cn[0].style.transform = `translateY(${y}px)`
    }

    /**
     * Replaces the wrapper div to the left or right
     * @param {Object} opts
     * @param {Object} opts.headerCenterEl
     * @param {Number} opts.increment
     * @param {Number} opts.yearIncrement
     * @protected
     */
    updateHeaderMonthWrapperCallback(opts) {
        let {headerCenterEl, increment, yearIncrement} = opts,
            slideDirection = yearIncrement > 0 ? 'bottom' : yearIncrement < 0 ? 'top' : increment < 0 ? 'top' : 'bottom';

        headerCenterEl.cn[0] = headerCenterEl.cn[0].cn[0].cn[slideDirection === 'top' ? 1 : 0]
    }

    /**
     * @param {Number} increment
     * @param {Boolean} [silent=false]
     */
    updateHeaderYear(increment, silent=false) {
        let me     = this,
            yearEl = me.getHeaderYearEl();

        yearEl.html = me.currentDate.getFullYear();

        !silent && me.update()
    }
}

Neo.setupClass(DateSelector);

export default DateSelector;
