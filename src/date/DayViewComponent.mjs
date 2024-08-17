import Base     from '../component/Base.mjs';
import DateUtil from '../util/Date.mjs';
import NeoArray from '../util/Array.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.date.DayViewComponent
 * @extends Neo.component.Base
 */
class DayViewComponent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.date.DayViewComponent'
         * @protected
         */
        className: 'Neo.date.DayViewComponent',
        /**
         * @member {String} className='day-view-component'
         * @protected
         */
        ntype: 'day-view-component',
        /**
         * @member {String[]} baseCls=['neo-day-view']
         * @protected
         */
        baseCls: ['neo-day-view'],
        /**
         * @member {Object} bind
         */
        bind: {
            intlFormatDay: data => data.intlFormatDay,
            weekStartDay : data => data.weekStartDay
        },
        /**
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormatDay=null
         * @protected
         */
        intlFormatDay: null,
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: []}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createContent(true)
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        this.isConstructed && this.recreateContent(false)
    }

    /**
     * Triggered after the weekStartDay config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetWeekStartDay(value, oldValue) {
        this.isConstructed && this.recreateContent(false)
    }

    /**
     * @returns {Object}
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
                {cls : ['neo-cell-content'], html: me.intlFormatDay.format(date)}
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
    createContent(silent=false, containerEl) {
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
            centerEl        = containerEl || me.vdom,
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

                    config.cls.push('neo-weekend');
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
     * Recreates the current month view
     * @param {Boolean} [syncIds=true]
     * @protected
     */
    recreateContent(syncIds=true) {
        let me = this;

        me.vdom.cn = [];
        me.createContent(true);

        // using force => we do want to keep the same ids
        syncIds && me.syncVdomIds(me.vnode, me.vdom, true);

        me.update()
    }
}

export default Neo.setupClass(DayViewComponent);
