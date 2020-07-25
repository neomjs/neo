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
         * True to show the days of the previous or next month (not selectable)
         * @member {Boolean} showDisabledDays_=true
         */
        showDisabledDays_: true,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls : ['neo-header'],
                html: '2020' // todo
            }, {
                cls: ['neo-months-container'],
                cn : []
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
        this.createMonths();
    }

    /**
     *
     */
    createDayNamesRow() {
        let me   = this,
            date = me.currentDate, // cloned
            i    = 0,
            row  = {cls: ['neo-calendar-week'], cn: [{cls: ['neo-top-left-spacer']}]};

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            weekday: me.dayNameFormat
        });

        for (; i < 7; i++) {
            row.cn.push({
                cls : ['neo-weekday-cell'],
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
            valueDate       = new Date(me.value),
            valueMonth      = valueDate.getMonth(),
            valueYear       = valueDate.getFullYear(),
            daysInMonth     = DateUtil.getDaysInMonth(currentDate),
            firstDayInMonth = DateUtil.getFirstDayOfMonth(currentDate),
            firstDayOffset  = firstDayInMonth - me.weekStartDay,
            columns         = 7,
            i               = 0,
            cellCls, cellId, cls, day, disabledDate, hasContent, j, row, rows;

        firstDayOffset = firstDayOffset < 0 ? firstDayOffset + 7 : firstDayOffset;
        rows           = (daysInMonth + firstDayOffset) / 7 > 5 ? 6 : 5;
        day            = 1 - firstDayOffset;

        for (; i < rows; i++) {
            row = {cls: ['neo-calendar-week'], cn: [{cls: ['neo-top-left-spacer']}]}; // todo: weekNumber

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

            containerEl.cn.push(row);
        }

        return containerEl;
    }

    /**
     *
     */
    createMonths() {
        let me             = this,
            dt             = new Intl.DateTimeFormat(Neo.config.locale, {month: 'long'}),
            currentDate    = me.currentDate, // cloned
            currentMonth   = dt.format(me.currentDate),
            vdom           = me.vdom,
            monthContainer = vdom.cn[1],
            i              = 0,
            len            = 12,
            monthVdom;

        for (; i < len; i++) {
            currentDate.setMonth(i);
            currentMonth = dt.format(currentDate);

            monthVdom = {
                cls: ['neo-month'],
                cn : [
                    {
                        cls : ['neo-month-name'],
                        html: currentMonth
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
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};