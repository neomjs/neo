import ClassSystemUtil   from '../util/ClassSystem.mjs';
import Container         from '../container/Base.mjs';
import DateSelectorModel from '../selection/DateSelectorModel.mjs';
import DateUtil          from '../util/Date.mjs';
import NeoArray          from '../util/Array.mjs';
import Toolbar           from '../toolbar/Base.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.date.SelectorContainer
 * @extends Neo.container.Base
 */
class SelectorContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.date.SelectorContainer'
         * @protected
         */
        className: 'Neo.date.SelectorContainer',
        /**
         * @member {String} ntype='date-selector'
         * @protected
         */
        ntype: 'date-selector',
        /**
         * @member {String[]} baseCls=['neo-dateselector','neo-container']
         */
        baseCls: ['neo-dateselector', 'neo-container'],
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
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['neo-header-toolbar'],
            flex  : 'none',

            itemDefaults: {
                ntype: 'button',
                ui   : 'tertiary' // todo: should be ghost
            },

            items : [{
                handler: 'up.onPrevButtonClick',
                iconCls: 'fas fa-circle-chevron-left'
            }, {
                flex: 1,
                text: '2024'
            }, {
                handler: 'up.onNextButtonClick',
                iconCls: 'fas fa-circle-chevron-right'
            }]
        }, {
            module: Container,
            layout: 'card',
            items : [{
                cls      : ['neo-day-view'],
                reference: 'day-view',
                vdom     : {cn: []}
            }]
        }],
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
        weekStartDay_: 0
    }

    /**
     * Stores the last date change which got triggered while a month / year transition was running
     * @member {Date|null} cachedUpdate=null
     * @protected
     */
    cachedUpdate = null

    /**
     * Convenience shortcut
     * @returns {Object|Neo.component.Base|null}
     */
    get dayView() {
        return this.getItem('day-view')
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
            // todo
        } else if (value) {
            // me.updateHeaderMonth(0, 0, true);
            // me.updateHeaderYear(0, true);
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
     * Triggered after the showCellBorders config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowCellBorders(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray.toggle(cls, 'neo-hide-inner-borders', !value);
        me.cls = cls
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
     */
    changeMonth(increment) {
        let date = this.currentDate; // cloned
        date.setMonth(date.getMonth() + increment);
        this.value = DateUtil.convertToyyyymmdd(date)
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
            currentDate     = me.currentDate,
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
            centerEl        = containerEl || me.dayView.vdom,
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
     * @param {Object} data
     */
    onNextButtonClick(data) {
        this.changeMonth(1)
    }

    /**
     * @param {Object} data
     */
    onPrevButtonClick(data) {
        this.changeMonth(-1)
    }

    /**
     * Recreates the current month view
     * @param {Boolean} [syncIds=true]
     * @protected
     */
    recreateDayViewContent(syncIds=true) {
        let me      = this,
            dayView = me.dayView;

        dayView.vdom.cn = [];
        me.createDayViewContent(true);

        // using force => we do want to keep the same ids
        syncIds && me.syncVdomIds(dayView.vnode, dayView.vdom, true);

        dayView.update?.()
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
            let centerEl = me.dayView.vdom.cn[0],
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
}

Neo.setupClass(SelectorContainer);

export default SelectorContainer;
