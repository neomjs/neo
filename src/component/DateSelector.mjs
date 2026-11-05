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
 * @summary Renders the displayed calendar date independently of the committed value when keyboard navigation defers selection.
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
         * Stores the arguments of the last day view rebuild which got requested while a month /
         * year transition was running
         * @member {Object|null} cachedDayViewRebuild=null
         * @protected
         */
        cachedDayViewRebuild: null,
        /**
         * Latest uncommitted keyboard destination requested during a transition.
         * @member {Date|null} cachedNavigationDate=null
         * @protected
         */
        cachedNavigationDate: null,
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
         * @reactive
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
         * @reactive
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
         * @reactive
         */
        isUpdating_: false,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {
            Enter: 'onNavButtonKeyDown',
            Space: 'onNavButtonKeyDown'
        },
        /**
         * @member {String} locale_=Neo.config.locale
         * @reactive
         */
        locale_: Neo.config.locale,
        /**
         * @member {String|null} maxValue_=null
         * @reactive
         */
        maxValue_: null,
        /**
         * @member {String|null} minValue_=null
         * @reactive
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
         * @reactive
         */
        selectionModel_: null,
        /**
         * True to show inner cell & header cell borders
         * @member {Boolean} showCellBorders_=true
         * @reactive
         */
        showCellBorders_: false,
        /**
         * True to show the days of the previous or next month (not selectable)
         * @member {Boolean} showDisabledDays_=true
         * @reactive
         */
        showDisabledDays_: true,
        /**
         * @member {Boolean} showWeekends_=true
         * @reactive
         */
        showWeekends_: true,
        /**
         * True to use sliding animations
         * @member {Boolean} useAnimations=true
         */
        useAnimations: true,
        /**
         * @member {String} value_=DateUtil.convertToyyyymmdd(new Date())
         * @reactive
         */
        value_: DateUtil.convertToyyyymmdd(todayDate),
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         * @reactive
         */
        weekStartDay_: 0,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: -1, cn: [
            {cls: ['neo-dateselector-header'], cn: [
                {cls: ['neo-nav-button', 'neo-prev-button'], role: 'button', 'aria-label': 'Previous Month', tabIndex: 0},
                {cls: ['neo-center-region'], 'aria-live': 'polite', cn: [
                    {cls: ['neo-month-text']},
                    {cls: ['neo-year-text']}
                ]},
                {cls: ['neo-nav-button', 'neo-next-button'], role: 'button', 'aria-label': 'Next Month', tabIndex: 0}
            ]},
            {cls: ['neo-dateselector-content'], role: 'grid', cn: []}
        ]}
    }

    /**
     * True while a header navigation button interaction is updating the displayed month,
     * preserving focus on the activated button instead of moving focus into the day grid.
     * @member {Boolean} preserveHeaderFocus=false
     * @protected
     */
    preserveHeaderFocus = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onComponentClick, scope: me},
            {
                scope: me,
                wheel: {
                    bubble : false,
                    fn     : me.onComponentWheel,
                    local  : true,
                    passive: false
                }
            }
        ])
    }

    /**
     * Triggered after the currentDate config got changed
     * @summary Updates the displayed month or day without selecting a pending keyboard destination.
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        let me             = this,
            {id, windowId} = me,
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
                if (me.selectionModel.navigationId) {
                    me.recreateDayViewContent(true);
                    me.triggerVdomUpdate()
                } else {
                    me.selectionModel.select(id + '__' + DateUtil.convertToyyyymmdd(value))
                }
            }

            if (method) {
                if (me.containsFocus && !me.preserveHeaderFocus) {
                    Neo.main.DomAccess.focus({id, windowId}).then(data => {
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

        if (oldValue !== undefined) {
            me.fire('dateChange', {
                component: me,
                oldValue,
                value
            })
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
     * @summary Replays deferred value, day-view and keyboard work after the current transition settles.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsUpdating(value, oldValue) {
        if (value === false) {
            let me = this;

            if (me.cachedUpdate && me.cachedUpdate.getTime() !== me.dateFromValue(me.value).getTime()) {
                me.afterSetValue(me.value, DateUtil.convertToyyyymmdd(me.cachedUpdate))
            }

            me.cachedUpdate = null;

            if (me.cachedDayViewRebuild) {
                let {silent, syncIds} = me.cachedDayViewRebuild;

                me.cachedDayViewRebuild = null;
                me.recreateDayViewContent(silent, syncIds)
            }

            if (me.cachedNavigationDate) {
                let date = me.cachedNavigationDate;

                me.cachedNavigationDate = null;
                me.navigateToDate(date)
            }
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

            me.getHeaderMonthEl().text = dt.format(me.currentDate);

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
     * @summary Replaces the keyboard preview with the committed value and notifies consumers after rendering can proceed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        me.cachedNavigationDate = null;
        me.selectionModel?.clearNavigation?.();

        if (value) {
            if (!me.isUpdating) {
                me.currentDate = me.dateFromValue(value);

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
     * Triggered before the value config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetValue(value, oldValue) {
        // If the value is set as a Date, try to convert it into a string
        if (Neo.typeOf(value) === 'Date') {
            return DateUtil.convertToyyyymmdd(value)
        }

        return value
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

                    me.promiseUpdate().then(() => {
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
     * @summary Builds the weekday header row with WAI-ARIA `row` and `columnheader` semantics and full-weekday `aria-label` names.
     * @returns {Object}
     */
    createDayNamesRow() {
        let me      = this,
            date    = DateUtil.clone(me.currentDate),
            longDay = new Intl.DateTimeFormat(me.locale, {weekday: 'long'}),
            i       = 0,
            len     = 7,
            row     = {cls: ['neo-row', 'neo-header-row'], role: 'row', cn: []},
            config, day;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < len; i++) {
            config =
            {'aria-label': longDay.format(date), cls: ['neo-cell'], role: 'columnheader', cn: [
                {cls : ['neo-cell-content'], text: me.intlFormat_day.format(date)}
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
     * @summary Builds the calendar day grid with WAI-ARIA `grid`, `row`, `gridcell`, `aria-selected`, `aria-disabled`, `aria-current`, and `aria-label` semantics.
     * @param {Boolean} silent=false true to update the vdom silently
     * @param {Object} [containerEl]
     */
    createDayViewContent(silent=false, containerEl) {
        let me              = this,
            {currentDate}   = me,
            currentMonth    = currentDate.getMonth(),
            currentYear     = currentDate.getFullYear(),
            date            = me.currentDate, // cloned
            fullDateFormat  = new Intl.DateTimeFormat(me.locale, {dateStyle: 'full'}),
            maxDate         = me.maxValue && me.dateFromValue(me.maxValue),
            minDate         = me.minValue && me.dateFromValue(me.minValue),
            valueDate       = me.dateFromValue(me.value),
            valueDay        = valueDate.getDate(),
            valueMonth      = valueDate.getMonth(),
            valueYear       = valueDate.getFullYear(),
            daysInMonth     = DateUtil.getDaysInMonth(currentDate),
            firstDayInMonth = DateUtil.getFirstDayOfMonth(currentDate),
            firstDayOffset  = firstDayInMonth - me.weekStartDay,
            centerEl        = containerEl || me.getCenterContentEl(),
            headerCenterId  = me.getHeaderCenterId(),
            columns         = 7,
            i               = 0,
            activeCellConfig, cellId, config, dateDay, day, firstEnabledCellConfig, hasContent, j, row, rows;

        me.vdom.cn[0].cn[1].id     = headerCenterId;
        centerEl['aria-labelledby'] = headerCenterId;
        centerEl.role               = 'grid';

        firstDayOffset = firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset;
        rows           = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day            = 1 - firstDayOffset;

        date.setDate(day);

        centerEl.cn.push(me.createDayNamesRow());

        for (; i < rows; i++) {
            row = {cls: ['neo-row'], role: 'row', cn: []};

            for (j=0; j < columns; j++) {
                hasContent = day > 0 && day <= daysInMonth;
                cellId     = me.getCellId(currentYear, currentMonth + 1, day);

                dateDay = date.getDay();

                config ={
                    id      : cellId,
                    cls     : hasContent ? ['neo-cell'] : ['neo-cell', 'neo-disabled'],
                    role    : 'gridcell',
                    tabIndex: hasContent ? -1 : null,
                    cn      : [{
                        cls : ['neo-cell-content'],
                        text: hasContent ? day : me.showDisabledDays ? date.getDate() : ''
                    }]
                };

                if (hasContent || me.showDisabledDays) {
                    config['aria-label'] = fullDateFormat.format(date)
                }

                if (dateDay === 0 || dateDay === 6) {
                    if (!me.showWeekends) {
                        config.removeDom = true
                    }

                    config.cls.push('neo-weekend')
                }

                if (maxDate && date > maxDate || minDate && date < minDate) {
                    NeoArray.add(config.cls, 'neo-disabled')
                }

                if (config.cls.includes('neo-disabled')) {
                    config['aria-disabled'] = true
                } else if (hasContent && !firstEnabledCellConfig) {
                    firstEnabledCellConfig = config
                }

                if (today.year === currentYear && today.month === currentMonth && today.day === day) {
                    config['aria-current'] = 'date';
                    config.cn[0].cls.push('neo-today')
                }

                if (valueYear === currentYear && valueMonth === currentMonth && day === valueDay) {
                    config['aria-selected'] = true;
                    config.cls.push('neo-selected');
                    me.selectionModel.items = [cellId]; // silent update
                    activeCellConfig = activeCellConfig || config
                }

                if (cellId === me.selectionModel.navigationId) {
                    config.cls.push(me.selectionModel.navigationCls);
                    activeCellConfig = config
                }

                row.cn.push(config);

                date.setDate(date.getDate() + 1);

                day++
            }

            centerEl.cn.push(row)
        }

        activeCellConfig = activeCellConfig || firstEnabledCellConfig;

        if (activeCellConfig) {
            activeCellConfig.tabIndex = 0
        }

        !silent && me.update()
    }

    /**
     * @summary Focuses the pending keyboard destination, or the committed day when no preview exists.
     */
    focusCurrentItem() {
        this.focus(this.selectionModel.navigationId || this.selectionModel.items[0])
    }

    /**
     * @summary Reads a date-only value at local noon, preserving its calendar day in every UTC offset.
     * @param {String} value
     * @returns {Date}
     * @protected
     */
    dateFromValue(value) {
        let [year, month, day] = String(value).split('-').map(Number),
            date               = new Date(year, month - 1, day, 12);

        date.setFullYear(year);

        return date
    }

    /**
     * @summary Displays an uncommitted keyboard date, retaining only the latest destination during rendering.
     * @param {Date} date
     */
    navigateToDate(date) {
        let me = this;

        if (me.isUpdating) {
            me.cachedNavigationDate = date
        } else if (date.getTime() === me.currentDate.getTime()) {
            me.recreateDayViewContent(true);
            me.triggerVdomUpdate()
        } else {
            me.currentDate = date
        }
    }

    /**
     * @summary Commits a date through the existing selection path, including an unchanged date in an empty field picker.
     * @param {String} value
     */
    selectDate(value) {
        let me = this;

        me._value = value;
        me.selectionModel.clearNavigation?.();
        me.selectionModel.select(me.id + '__' + value);
        me.afterSetValue(value, null)
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
     * @summary Returns the deterministic DOM id for the month/year header region referenced by the calendar grid's `aria-labelledby`.
     * @returns {String}
     */
    getHeaderCenterId() {
        return `${this.id}__header-center`
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
     * @summary Commits the clicked calendar cell through the shared date-selection path.
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            cellEl = VDomUtil.find(me.vdom, data.path[0].id),
            date   = me.currentDate; // cloned

        date.setDate(parseInt(cellEl.vdom.cn[0].text));
        date = DateUtil.convertToyyyymmdd(date);

        me.selectDate(date)
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
            me.preserveHeaderFocus = me.mounted;
            date = me.currentDate; // cloned
            date.setMonth(date.getMonth() + monthIncrement);
            me.value = DateUtil.convertToyyyymmdd(date)
        }
    }

    /**
     * @summary Activates the focused previous/next month header button on Enter or Space.
     * @param {Object} data
     * @protected
     */
    onNavButtonKeyDown(data) {
        let cls = data.path?.[0]?.cls;

        if (cls?.includes('neo-next-button') || cls?.includes('neo-prev-button')) {
            data.cancelBubble = true;
            this.onComponentClick(data)
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
     *
     * While a month / year transition is running, the centerEl is the transition's animation
     * wrapper, and wiping it would leave the slide's own callbacks reading a vdom that no longer
     * holds them. The rebuild is cached and replayed once the transition settles.
     * @param {Boolean} [silent=false]
     * @param {Boolean} [syncIds=true]
     * @protected
     */
    recreateDayViewContent(silent=false, syncIds=true) {
        let me = this;

        if (me.isUpdating) {
            me.cachedDayViewRebuild = {silent, syncIds};

            return
        }

        me.getCenterContentEl().cn = [];
        me.createDayViewContent(true);

        // we need to sync the new ids into the vdom
        syncIds && me.syncVdomState(me.vnode, me.vdom, true);

        me.update()
    }

    /**
     * Triggers a vdom update & sets isUpdating
     * @summary Commits the settled date VDOM and restores the navigation or selected cell's focus unless its own window has a pending leave.
     * @param {Boolean} [silent=false]
     * @protected
     */
    triggerVdomUpdate(silent=false) {
        if (!silent) {
            let me = this;

            me.isUpdating = true;

            me.promiseUpdate().then(async () => {
                let isSettled = (!me.cachedUpdate || me.cachedUpdate.getTime() === me.dateFromValue(me.value).getTime()) &&
                                          !me.cachedNavigationDate &&
                                          !me.cachedDayViewRebuild,
                    preserveHeaderFocus = me.preserveHeaderFocus;

                if (isSettled) {
                    me.preserveHeaderFocus = false
                }

                if (
                    !me.isDestroyed &&
                    me.containsFocus &&
                    !preserveHeaderFocus &&
                    !Neo.manager.Focus?.pendingFocusOut?.[me.windowId]?.componentPath?.includes(me.id) &&
                    isSettled &&
                    (me.selectionModel?.navigationId || me.selectionModel?.items?.[0])
                ) {
                    await Neo.main?.DomAccess?.focus({
                        id      : me.selectionModel.navigationId || me.selectionModel.items[0],
                        windowId: me.windowId
                    })
                }

                if (!me.isDestroyed) {
                    me.isUpdating = false
                }
            })
        }
    }

    /**
     * @summary Updates the weekday column headers and their localized `aria-label` names when `dayNameFormat`, `locale`, `weekStartDay`, or `showWeekends` changes.
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
                longDay  = new Intl.DateTimeFormat(me.locale, {weekday: 'long'}),
                i        = 0,
                day, node;

            date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

            for (; i < 7; i++) {
                node = centerEl.cn[i];

                node['aria-label'] = longDay.format(date);
                node.cn[0].text    = me.intlFormat_day.format(date);

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
            monthEl.text = currentMonth;
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
                text: currentMonth
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

        yearEl.text = me.currentDate.getFullYear();

        !silent && me.update()
    }
}

export default Neo.setupClass(DateSelector);
