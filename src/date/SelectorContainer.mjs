import ClassSystemUtil        from '../util/ClassSystem.mjs';
import Container              from '../container/Base.mjs';
import DateSelectorModel      from '../selection/DateSelectorModel.mjs';
import DayViewComponent       from './DayViewComponent.mjs';
import DateUtil               from '../util/Date.mjs';
import NeoArray               from '../util/Array.mjs';
import SelectorContainerModel from './SelectorContainerModel.mjs';
import Toolbar                from '../toolbar/Base.mjs';

const todayDate = new Date();

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
         * @member {Object} bind
         */
        bind: {
            weekStartDay: {twoWay: true, value: data => data.weekStartDay}
        },
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
         * @member {Intl.DateTimeFormat|null} intlFormatDay_=null
         * @protected
         */
        intlFormatDay_: null,
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
                module   : DayViewComponent,
                reference: 'day-view'
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
         * @member {Neo.model.Component} model=SelectorContainerModel
         */
        model: SelectorContainerModel,
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
        let me = this;

        if (me.mounted) {
            // todo
        } else if (value) {
            // me.updateHeaderMonth(0, 0, true);
            // me.updateHeaderYear(0, true);
            me.dayView.currentDate = value
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
     * Triggered after the intlFormatDay config got changed
     * @param {Intl.DateTimeFormat|null} value
     * @param {Intl.DateTimeFormat|null} oldValue
     * @protected
     */
    afterSetIntlFormatDay(value, oldValue) {
        if (value) {
            this.dayView.intlFormatDay = value
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
     * @param {String} value
     * @param {String} oldValue
     * @param {Boolean} [silent=false]
     */
    updateHeaderDays(value, oldValue, silent=false) {
        let me = this;

        me.intlFormatDay = new Intl.DateTimeFormat(me.locale, {weekday: value});

        if (oldValue !== undefined) {
            let centerEl = me.dayView.vdom.cn[0],
                date     = me.currentDate, // cloned
                i        = 0,
                day, node;

            date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

            for (; i < 7; i++) {
                node = centerEl.cn[i];

                node.cn[0].html = me.intlFormatDay.format(date);

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
