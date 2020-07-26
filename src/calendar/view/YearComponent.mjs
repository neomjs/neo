import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';

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
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.YearComponent'
         * @protected
         */
        className: 'Neo.calendar.view.YearComponent',
        /**
         * @member {String} ntype='calendar-view-yearcomponent'
         * @protected
         */
        ntype: 'calendar-view-yearcomponent',
        /**
         * @member {String[]} cls=['neo-calendar-yearcomponent']
         */
        cls: ['neo-calendar-yearcomponent'],
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
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_month=null
         * @protected
         */
        intlFormat_month: null,
        /**
         * The format of the month header names.
         * Valid values are: narrow, short & long
         * @member {String} monthNameFormat_='long'
         */
        monthNameFormat_: 'long',
        /**
         * True to show the days of the previous or next month (not selectable)
         * @member {Boolean} showDisabledDays_=true
         */
        showDisabledDays_: true,
        /**
         * True to show the week number as the first column of each month
         * @member {Boolean} showWeekNumbers_=true
         */
        showWeekNumbers_: true,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls : ['neo-year-header']
            }, {
                cls: ['neo-months-container']
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
     * @param config
     */
    constructor(config) {
        super(config);
        this.updateHeaderYear();
        this.createMonths();
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            if (value.getFullYear() !== oldValue.getFullYear()) {
                // todo
                console.log('## transition to the new year', value.getFullYear());
            } else {
                // todo
                console.log('## select a new day', value.getMonth(), value.getDate());
            }
        }
    }

    /**
     * Triggered after the monthNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetMonthNameFormat(value, oldValue) {
        this.intlFormat_month = new Intl.DateTimeFormat(Neo.config.locale, {month: value});

        if (oldValue !== undefined) {
            let me          = this,
                vdom        = me.vdom,
                i           = 0,
                currentDate = me.currentDate;

            for (; i < 12; i++) {
                currentDate.setMonth(i);
                currentDate.setDate(1);

                vdom.cn[1].cn[i].cn[0].html = me.intlFormat_month.format(currentDate);
            }

            me.vdom = vdom;
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
                vdom = me.vdom,
                i    = 0,
                itemCn, j, len;

            for (; i < 12; i++) {
                itemCn = vdom.cn[1].cn[i].cn;
                len    = itemCn.length;

                for (j = 1; j < len; j++) {
                    itemCn[j].cn[0].removeDom = !value;
                }
            }

            me.vdom = vdom;
        }
    }

    /**
     * Triggered after the weekStartDay config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetWeekStartDay(value, oldValue) {
        if (oldValue !== undefined) {
            this.createMonths();
        }
    }

    /**
     *
     */
    createDayNamesRow() {
        let me   = this,
            date = me.currentDate, // cloned
            i    = 0,
            row  = {cls: ['neo-calendar-week'], cn: [{cls: ['neo-cell', 'neo-top-left-spacer']}]};

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            weekday: me.dayNameFormat
        });

        for (; i < 7; i++) {
            row.cn.push({
                cls : ['neo-cell', 'neo-weekday-cell'],
                html: dt.format(date)
            });

            date.setDate(date.getDate() + 1);
        }

        return row;
    }

    /**
     *
     * @param {Object} containerEl
     * @param {Date} currentDate
     * @returns {Object} vdom
     */
    createMonthContent(containerEl, currentDate) {
        let me              = this,
            currentDay      = currentDate.getDate(),
            currentMonth    = currentDate.getMonth(),
            currentYear     = currentDate.getFullYear(),
            disabledDate    = DateUtil.clone(currentDate),
            valueDate       = me.currentDate, // cloned
            valueMonth      = valueDate.getMonth(),
            valueYear       = valueDate.getFullYear(),
            daysInMonth     = DateUtil.getDaysInMonth(currentDate),
            firstDayInMonth = DateUtil.getFirstDayOfMonth(currentDate),
            firstDayOffset  = firstDayInMonth - me.weekStartDay,
            columns         = 7,
            i               = 0,
            weekDate        = DateUtil.clone(currentDate),
            cellCls, cellId, cls, day, hasContent, j, row, rows;

        firstDayOffset = firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset;
        rows           = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day            = 1 - firstDayOffset;

        for (; i < rows; i++) {
            row = {
                cls: ['neo-calendar-week'],
                cn : [{
                    cls      : ['neo-cell', 'neo-weeknumber-cell'],
                    html     : DateUtil.getWeekOfYear(weekDate),
                    removeDom: !me.showWeekNumbers
                }]
            };

            weekDate.setDate(weekDate.getDate() + 7);

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
                }

                if (me.showDisabledDays && !hasContent) {
                    disabledDate.setMonth(currentMonth);
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

            containerEl.cn.push(row);
        }

        return containerEl;
    }

    /**
     *
     */
    createMonths() {
        let me             = this,
            currentDate    = me.currentDate, // cloned
            vdom           = me.vdom,
            monthContainer = vdom.cn[1],
            i              = 0,
            monthVdom;

        monthContainer.cn = [];

        for (; i < 12; i++) {
            currentDate.setMonth(i);
            currentDate.setDate(1);

            monthVdom = {
                cls: ['neo-month'],
                cn : [
                    {
                        cls : ['neo-month-name'],
                        html: me.intlFormat_month.format(currentDate)
                    },
                    me.createDayNamesRow()
                ]
            };

            monthVdom = me.createMonthContent(monthVdom, DateUtil.clone(currentDate));

            monthContainer.cn.push(monthVdom);
        }

        me.vdom = vdom;
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
     */
    updateHeaderYear() {
        this.vdom.cn[0].html = this.currentDate.getFullYear();
    }
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};