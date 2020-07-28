import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.MonthComponent
 * @extends Neo.component.Base
 */
class MonthComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.MonthComponent'
         * @protected
         */
        className: 'Neo.calendar.view.MonthComponent',
        /**
         * @member {String} ntype='calendar-view-monthcomponent'
         * @protected
         */
        ntype: 'calendar-view-monthcomponent',
        /**
         * @member {String[]} cls=['neo-calendar-monthcomponent']
         */
        cls: ['neo-calendar-monthcomponent'],
        /**
         * Will get passed from the MainContainer
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn : [{
                cls: ['neo-days-header'],
                cn : []
            }, {
                cls: ['neo-days'],
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
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.updateHeader(true);
        this.createContent();
    }

    /**
     * Triggered after the locale config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateHeader();
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
            this.updateHeader();
        }
    }

    /**
     *
     */
    createContent() {
        let me             = this,
            date           = me.currentDate, // cloned
            firstDayOffset = DateUtil.getFirstDayOffset(date, me.weekStartDay),
            vdom           = me.vdom,
            i              = 0,
            day, j, month, row, year;

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});

        date.setDate(1 - firstDayOffset);

        for (; i < 50; i++) {
            row = {cls: ['neo-week'], cn: []};

            for (j=0; j < 7; j++) {
                day = date.getDate();

                if (day === 1) {
                    month = me.intlFormat_month.format(date);
                    year  = date.getFullYear();

                    vdom.cn[1].cn.push({
                        cls: ['neo-month-header'],
                        cn : [{
                            cls : ['neo-month-header-content'],
                            html: `<span class="neo-bold">${month}</span> ${year}`
                        }]
                    });
                }

                row.cn.push({
                    cls : ['neo-day'],
                    html: day
                });

                date.setDate(date.getDate() + 1);
            }

            vdom.cn[1].cn.push(row);
        }

        me.vdom = vdom;
    }

    /**
     *
     * @param {Boolean} [create=false]
     */
    updateHeader(create=false) {
        let me   = this,
            date = me.currentDate, // cloned
            dt   = new Intl.DateTimeFormat(me.locale, {weekday: 'short'}),
            vdom = me.vdom,
            i    = 0;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 7; i++) {
            if (create) {
                vdom.cn[0].cn.push({
                    cls : ['neo-day-name'],
                    html: dt.format(date)
                });
            } else {
                vdom.cn[0].cn[i].html = dt.format(date);
            }

            date.setDate(date.getDate() + 1);
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(MonthComponent);

export {MonthComponent as default};