import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Component}       from './Base.mjs';
import DateSelectorModel            from '../selection/DateSelectorModel.mjs';
import DateUtil                     from '../util/Date.mjs';
import NeoArray                     from '../util/Array.mjs';
import {default as VDomUtil}        from '../util/VDom.mjs';

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
    static getConfig() {return {
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
         * Stores the last date change which got triggered while a month / Year transition was running
         * @member {Object|null} cachedUpdate=null
         * @protected
         */
        cachedUpdate: null,
        /**
         * @member {String[]} cls=['neo-dateselector']
         */
        cls: ['neo-dateselector'],
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
         * Used for wheel events. min value = 1.
         * A higher value means lesser sensitivity for wheel events
         * => you need to scroll "more" to trigger a month / year change
         * @member {Number} mouseWheelDelta=1
         */
        mouseWheelDelta: 1,
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
         * True to use sliding animations
         * @member {Boolean} useAnimations=true
         */
        useAnimations: true,
        /**
         * @member {String} value_=DateUtil.convertToyyyymmdd(new Date())
         */
        value_: DateUtil.convertToyyyymmdd(new Date()),
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tabIndex: -1,
            cn: [{
                cls: ['neo-dateselector-header'],
                cn : [{
                    cls: ['neo-nav-button', 'neo-prev-button']
                }, {
                    cls: ['neo-center-region'],
                    cn : [
                        {cls: ['neo-month-text']},
                        {cls: ['neo-year-text']}
                    ]
                }, {
                    cls: ['neo-nav-button', 'neo-next-button']
                }]
            }, {
                cls: ['neo-dateselector-content'],
                cn : []
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            click: {fn: me.onComponentClick, scope: me},
            wheel: {fn: me.onComponentWheel, scope: me}
        });

        me.domListeners = domListeners;

        me.updateHeaderMonth(0, 0, true);
        me.updateHeaderYear(0, true);
        me.createDayViewContent(false);
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.selectionModel) {
            me.selectionModel.register(me);
        }
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
                methodParams = [monthIncrement, yearIncrement];
            } else if (yearIncrement !== 0) {
                method       = 'changeYear';
                methodParams = [yearIncrement];
            } else if (dayIncrement !== 0) {
                me.selectionModel.select(me.id + '__' + DateUtil.convertToyyyymmdd(value));
            }

            if (method) {
                if (me.containsFocus) {
                    Neo.main.DomAccess.focus({
                        id: me.id
                    }).then(data => {
                        me[method](...methodParams);
                    });
                } else {
                    me[method](...methodParams);
                }
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
        this.updateHeaderDays(value, oldValue);
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue !== undefined) {
            let me   = this,
                dt   = new Intl.DateTimeFormat(me.locale, {month: 'short'}),
                vdom = me.vdom;

            me.updateHeaderDays(me.dayNameFormat, '', true);

            me.getHeaderMonthEl().html = dt.format(me.currentDate);

            me.vdom = vdom;
        }
    }

    /**
     * Triggered after the showCellBorders config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowCellBorders(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray[value ? 'remove' : 'add'](cls, 'neo-hide-inner-borders');
        me.cls = cls;
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

            if (me.cachedUpdate && me.cachedUpdate !== new Date(me.value)) {
                me.afterSetValue(me.value, DateUtil.convertToyyyymmdd(me.cachedUpdate));
            }

            me.cachedUpdate = null;
        }
    }

    /**
     * Triggered after the showDisabledDays config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowDisabledDays(value, oldValue) {
        if (oldValue !== undefined) {
            this.recreateDayViewContent();
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        if (oldValue !== undefined) {
            value.register(this);
        }
    }

    /**
     * Triggered after the value config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        if (!me.isUpdating) {
            me.currentDate = new Date(value);

            me.fire('change', {
                oldValue: oldValue,
                value   : value
            });
        } else {
            me.cacheUpdate();
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
            this.recreateDayViewContent(false, false);
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
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, DateSelectorModel);
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
     * Stores the last date change which could not get applied while a transition was running
     * @param {Date} [date=this.currentDate]
     * @protected
     */
    cacheUpdate(date=this.currentDate) {
        this.cachedUpdate = date;
    }

    /**
     *
     * @param {Number} increment
     * @param {Number} yearIncrement
     */
    changeMonth(increment, yearIncrement) {
        let me             = this,
            slideDirection = yearIncrement > 0 ? 'right' : yearIncrement < 0 ? 'left' : increment < 0 ? 'left' : 'right',
            headerMonthOpts, vdom, x;

        if (!me.useAnimations) {
            me.recreateContent(increment, yearIncrement);
        } else {
            if (!me.isUpdating) {
                me.isUpdating = true;

                Neo.main.DomAccess.getBoundingClientRect({
                    id: [me.getCenterContentEl().id, me.getHeaderMonthEl().id]
                }).then(data => {
                    vdom = me.vdom;
                    x    = slideDirection === 'right' ? 0 : -data[0].width;

                    vdom.cn.push({
                        cls: ['neo-relative'],
                        cn : [{
                            cls: ['neo-animation-wrapper'],
                            cn : [{
                                cls: ['neo-dateselector-content'],
                                cn : []
                            }],
                            style: {
                                height   : data[0].height + 'px',
                                transform: `translateX(${x}px)`,
                                width    : 2 * data[0].width + 'px'
                            }
                        }]
                    });

                    headerMonthOpts = me.updateHeaderMonth(increment, yearIncrement, true, data[1]);

                    if (yearIncrement !== 0) {
                        me.updateHeaderYear(increment, true);
                    }

                    me.createDayViewContent(true, vdom.cn[2].cn[0].cn[0]);
                    vdom.cn[2].cn[0].cn[slideDirection === 'right'? 'unshift' : 'push'](vdom.cn[1]);
                    vdom.cn.splice(1, 1);

                    me.promiseVdomUpdate().then(() => {
                        me.changeMonthTransitionCallback({data: data[0], slideDirection: slideDirection});
                        me.updateHeaderMonthTransitionCallback(headerMonthOpts);
                        me.vdom = vdom;

                        setTimeout(() => {
                            me.changeMonthWrapperCallback(slideDirection);
                            me.updateHeaderMonthWrapperCallback(headerMonthOpts);
                            me.triggerVdomUpdate();
                        }, 300);
                    });
                });
            } else {
                me.cacheUpdate();
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
            vdom = me.vdom,
            {data, slideDirection} = opts,
            x;

        x = slideDirection === 'right' ? -data.width : 0;
        vdom.cn[1].cn[0].style.transform = `translateX(${x}px)`;
        me._vdom = vdom; // silent update
    }

    /**
     * Replaces the wrapper div with the target month
     * @param {String} slideDirection
     * @protected
     */
    changeMonthWrapperCallback(slideDirection) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[1] = vdom.cn[1].cn[0].cn[slideDirection === 'right' ? 1 : 0];
        me._vdom = vdom; // silent update
    }

    /**
     *
     * @param {Number} increment
     */
    changeYear(increment) {
        let me = this,
            vdom, y;

        if (!me.useAnimations) {
            me.recreateContent(0, increment);
        } else {
            if (!me.isUpdating) {
                me.isUpdating = true;

                Neo.main.DomAccess.getBoundingClientRect({
                    id: me.getCenterContentEl().id
                }).then(data => {
                    vdom = me.vdom;
                    y    = increment < 0 ? 0 : -data.height;

                    vdom.cn.push({
                        cls: ['neo-relative'],
                        cn : [{
                            cls: ['neo-animation-wrapper'],
                            cn : [{
                                cls: ['neo-dateselector-content'],
                                cn : []
                            }],
                            style: {
                                flexDirection: 'column',
                                height       : 2 * data.height + 'px',
                                transform    : `translateY(${y}px)`,
                                width        : data.width + 'px'
                            }
                        }]
                    });

                    me.updateHeaderYear(increment, true);

                    me.createDayViewContent(true, vdom.cn[2].cn[0].cn[0]);
                    vdom.cn[2].cn[0].cn[increment < 0 ? 'unshift' : 'push'](vdom.cn[1]);
                    vdom.cn.splice(1, 1);

                    me.promiseVdomUpdate(vdom).then(() => {
                        y = increment < 0 ? -data.height : 0;
                        vdom.cn[1].cn[0].style.transform = `translateY(${y}px)`;
                        me.vdom = vdom;

                        setTimeout(() => {
                            vdom.cn[1] = vdom.cn[1].cn[0].cn[increment < 0 ? 1 : 0];
                            me.triggerVdomUpdate();
                        }, 300);
                    });
                });
            } else {
                me.cacheUpdate();
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
            row  = {cls: ['neo-row', 'neo-header-row'], cn: []};

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < len; i++) {
            row.cn.push({
                cls: ['neo-cell'],
                cn : [{
                    cls : ['neo-cell-content'],
                    html: me.intlFormat_day.format(date)
                }]
            });

            date.setDate(date.getDate() + 1);
        }

        return row;
    }

    /**
     *
     * @param {Boolean} silent true to update the vdom silently
     * @param {Object} [containerEl]
     */
    createDayViewContent(silent, containerEl) {
        let me              = this,
            currentDate     = me.currentDate,
            currentDay      = currentDate.getDate(),
            currentMonth    = currentDate.getMonth(),
            currentYear     = currentDate.getFullYear(),
            valueDate       = new Date(me.value),
            valueMonth      = valueDate.getMonth(),
            valueYear       = valueDate.getFullYear(),
            daysInMonth     = DateUtil.getDaysInMonth(currentDate),
            firstDayInMonth = DateUtil.getFirstDayOfMonth(currentDate),
            firstDayOffset  = firstDayInMonth - me.weekStartDay,
            vdom            = me.vdom,
            centerEl        = containerEl || me.getCenterContentEl(),
            columns         = 7,
            i               = 0,
            cellCls, cellId, cls, day, disabledDate, hasContent, j, row, rows;

        firstDayOffset = firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset;
        rows           = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day            = 1 - firstDayOffset;

        centerEl.cn.push(me.createDayNamesRow());

        for (; i < rows; i++) {
            row = {cls: ['neo-row'], cn: []};

            for (j=0; j < columns; j++) {
                hasContent = day > 0 && day <= daysInMonth;
                cellCls    = hasContent ? ['neo-cell'] : ['neo-cell', 'neo-disabled'];
                cellId     = me.getCellId(currentYear, currentMonth + 1, day);
                cls        = ['neo-cell-content'];

                if (today.year === currentYear && today.month === currentMonth && today.day === day) {
                    cls.push('neo-today');
                }

                if (valueYear === currentYear && valueMonth === currentMonth && day === currentDay) {
                    cellCls.push('neo-selected');
                    me.selectionModel.items = [cellId]; // silent update
                }

                if (me.showDisabledDays && !hasContent) {
                    disabledDate = me.currentDate; // cloned
                    disabledDate.setDate(day);
                }

                row.cn.push({
                    id      : cellId,
                    cls     : cellCls,
                    tabIndex: hasContent ? -1 : null,
                    cn: [{
                        cls : cls,
                        html: hasContent ? day : me.showDisabledDays ? disabledDate.getDate() : ''
                    }]
                });

                day++;
            }

            centerEl.cn.push(row);
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     */
    focusCurrentItem() {
        this.focus(this.selectionModel.items[0]);
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
            day = '0' + day;
        }

        month = month.toString();

        if (month.length < 2) {
            month = '0' + month;
        }

        return this.id + '__' + year + '-' + month + '-' + day;
    }

    /**
     *
     * @returns {Object}
     */
    getCenterContentEl() {
        return this.vdom.cn[1];
    }

    /**
     *
     * @returns {Object}
     */
    getHeaderMonthEl() {
        return this.vdom.cn[0].cn[1].cn[0];
    }

    /**
     *
     * @returns {Object}
     */
    getHeaderYearEl() {
        return this.vdom.cn[0].cn[1].cn[1];
    }

    /**
     *
     * @param {Object} data
     */
    onComponentClick(data) {
        let me  = this,
            cls = data.path[0].cls,
            date, monthIncrement;

             if (cls.includes('neo-cell'))        {me.onCellClick(data);}
        else if (cls.includes('neo-next-button')) {monthIncrement =  1;}
        else if (cls.includes('neo-prev-button')) {monthIncrement = -1;}

        if (monthIncrement) {
            date = me.currentDate; // cloned
            date.setMonth(date.getMonth() + monthIncrement);
            me.value = DateUtil.convertToyyyymmdd(date);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            cellEl = VDomUtil.findVdomChild(me.vdom, data.path[0].id),
            date   = me.currentDate; // cloned

        date.setDate(parseInt(cellEl.vdom.cn[0].html));
        me.value = DateUtil.convertToyyyymmdd(date);
    }

    onComponentWheel(data) {
        let me         = this,
            wheelDelta = me.mouseWheelDelta,
            date, monthIncrement, yearIncrement;

        if (Math.abs(data.deltaY) >= Math.abs(data.deltaX)) {
                 if (data.deltaY <= -wheelDelta) {yearIncrement  =  1;}
            else if (data.deltaY >=  wheelDelta) {yearIncrement  = -1;}
        } else {
                 if (data.deltaX >=  wheelDelta) {monthIncrement =  1;}
            else if (data.deltaX <= -wheelDelta) {monthIncrement = -1;}
        }

        if (Neo.isNumber(monthIncrement)) {
            date = me.currentDate; // cloned
            date.setMonth(date.getMonth() + monthIncrement);
            me.value = DateUtil.convertToyyyymmdd(date);
        } else if (Neo.isNumber(yearIncrement)) {
            date = me.currentDate; // cloned
            date.setFullYear(date.getFullYear() + yearIncrement);
            me.value = DateUtil.convertToyyyymmdd(date);
        }
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

        if (monthIncrement !== 0) {
            me.updateHeaderMonth(monthIncrement, yearIncrement, true);
        }

        if (yearIncrement !== 0) {
            me.updateHeaderYear(yearIncrement, true);
        }

        me.triggerVdomUpdate(silent);
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

        if (syncIds) {
            me.syncVdomIds();
        }

        me.triggerVdomUpdate(silent);
    }

    /**
     * Triggers a vdom update & sets isUpdating
     * @param {Boolean} [silent=false]
     * @protected
     */
    triggerVdomUpdate(silent=false) {
        let me = this;

        if (!silent) {
            me.isUpdating = true;

            me.promiseVdomUpdate(me.vdom).then(() => {
                me.isUpdating = false;
            });
        }
    }

    /**
     *
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
                vdom     = me.vdom,
                i        = 0;

            date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

            for (; i < 7; i++) {
                centerEl.cn[i].cn[0].html = me.intlFormat_day.format(date);

                date.setDate(date.getDate() + 1);
            }

            me[silent ? '_vdom' : 'vdom'] = vdom;
        }
    }

    /**
     *
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
            vdom           = me.vdom,
            headerCenterEl, y;

        if (!me.rendered || !me.useAnimations) {
            monthEl.html = currentMonth;
            me[silent ? '_vdom' : 'vdom'] = vdom;
            return null;
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

            me[silent ? '_vdom' : 'vdom'] = vdom;

            return {
                data          : monthElDomRect,
                headerCenterEl: headerCenterEl,
                increment     : increment,
                yearIncrement : yearIncrement
            };
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
            me             = this,
            vdom           = me.vdom,
            slideDirection = yearIncrement > 0 ? 'bottom' : yearIncrement < 0 ? 'top' : increment < 0 ? 'top' : 'bottom',
            y;

        y = slideDirection === 'top' ? -data.height : 0;
        headerCenterEl.cn[0].cn[0].style.transform = `translateY(${y}px)`;
        me._vdom = vdom; // silent update
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
            me             = this,
            vdom           = me.vdom,
            slideDirection = yearIncrement > 0 ? 'bottom' : yearIncrement < 0 ? 'top' : increment < 0 ? 'top' : 'bottom';

        headerCenterEl.cn[0] = headerCenterEl.cn[0].cn[0].cn[slideDirection === 'top' ? 1 : 0];
        me._vdom = vdom; // silent update
    }

    /**
     *
     * @param {Number} increment
     * @param {Boolean} [silent=false]
     */
    updateHeaderYear(increment, silent=false) {
        let me     = this,
            vdom   = me.vdom,
            yearEl = me.getHeaderYearEl();

        yearEl.html = me.currentDate.getFullYear();

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(DateSelector);

export {DateSelector as default};