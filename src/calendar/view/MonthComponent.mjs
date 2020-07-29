import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';
import {default as VDomUtil}  from '../../util/VDom.mjs';

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
         * Internal flag to store the header height in px after getting mounted.
         * Needed for the infinite scrolling
         * @member {Number|null} headerHeight=null
         * @protected
         */
        headerHeight: null,
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
                cls: ['neo-c-m-scrollcontainer']
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

        let me           = this,
            domListeners = me.domListeners;

        domListeners.push({
            wheel: {fn: me.onWheel, scope: me}
        });

        me.domListeners = domListeners;

        me.updateHeader(true);
        me.createContent();
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (value) {
            setTimeout(() => {
                let me = this;

                Neo.main.DomAccess.getBoundingClientRect({
                    id: [me.vdom.cn[1].id, me.vdom.cn[0].id]
                }).then(data => {
                    let vdom = me.vdom;

                    me.headerHeight = data[1].height;

                    console.log(data);
                    console.log(data[0].height, data[1].height);
                    vdom.cn[1].scrollTop = data[0].height - data[1].height;
                    me.vdom = vdom;
                });
            }, 20);
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
            this.updateMonthNames(true);
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
            this.createContent(true);
            this.updateHeader();
        }
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    createContent(silent=false) {
        let me             = this,
            date           = me.currentDate, // cloned
            vdom           = me.vdom,
            i              = 0,
            day, dayCls, firstDayOffset, j, prevRows, row, weekDay;

        vdom.cn[1].cn = [];

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});

        firstDayOffset = DateUtil.getFirstDayOffset(date, me.weekStartDay);

        date.setDate(1 - firstDayOffset);

        date.setDate(date.getDate() - 6 * 7);

        for (; i < 15; i++) {
            row = {cls: ['neo-week'], cn: []};

            for (j=0; j < 7; j++) {
                day = date.getDate();

                if (day === 1) {
                    vdom.cn[1].cn.push({
                        cls: ['neo-month-header'],
                        cn : [{
                            cls: ['neo-month-header-content'],
                            cn : [{
                                tag : 'span',
                                cls : ['neo-month-name'],
                                flag: 'month-name',
                                html: me.intlFormat_month.format(date)
                            }, {
                                vtype: 'text',
                                html : ` ${date.getFullYear()}`
                            }]
                        }]
                    });
                }

                dayCls  = ['neo-day'];
                weekDay = date.getDay();

                if (weekDay === 0 || weekDay === 6) {
                    dayCls.push('neo-weekend');
                }

                row.cn.push({
                    cls : dayCls,
                    html: day
                });

                date.setDate(date.getDate() + 1);
            }

            vdom.cn[1].cn.push(row);
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Object} data
     */
    onWheel(data) {
        if (Math.abs(data.deltaY) > Math.abs(data.deltaX)) {
            let me        = this,
                vdom      = me.vdom,
                container = vdom.cn[1],
                i         = 0;

            console.log('onWheel', data.scrollTop, Math.round(data.scrollTop / data.clientHeight * 6));
            console.log(data.deltaY);

            if (data.deltaY > 0 && Math.round(data.scrollTop / data.clientHeight * 6) > 8) {
                for (; i < 6; i++) {
                    if (container.cn[1].cls.includes('neo-month-header')) {
                        container.cn.push(container.cn.splice(1, 1)[0]);
                    }

                    container.cn.push(container.cn.shift());
                }

                container.scrollTop = 0;
console.log(me.vnode);
                me.vdom = vdom;
            }
        }
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

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateMonthNames(silent=false) {
        let me     = this,
            date   = me.currentDate, // cloned
            vdom   = me.vdom,
            months = VDomUtil.getFlags(vdom, 'month-name');

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});

        months.forEach(month => {
            month.html = me.intlFormat_month.format(date);
            date.setMonth(date.getMonth() + 1);
        });

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(MonthComponent);

export {MonthComponent as default};