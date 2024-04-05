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
 * @class Neo.container.DateSelector
 * @extends Neo.container.Base
 */
class DateSelector extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.DateSelector'
         * @protected
         */
        className: 'Neo.container.DateSelector',
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
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                text: 'prev'
            }, {
                text: '2024'
            }, {
                text: 'next'
            }]
        }, {
            module: Container,
            layout: 'card',
            items : [{
                vdom: {html: 'body'}
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
}

Neo.setupClass(DateSelector);

export default DateSelector;
