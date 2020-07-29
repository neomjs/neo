import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';
import NeoArray               from '../../util/Array.mjs';
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
         * @member {Boolean} isScrolling=false
         * @protected
         */
        isScrolling: false,
        /**
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {String|null} scrollTask=null
         * @protected
         */
        scrollTaskId: null,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn : [{
                cls: ['neo-days-header'],
                cn : [{
                    cls  : ['neo-static-header'],
                    style: {},
                    cn   : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name',
                        html: 'Jan'
                    }, {
                        vtype: 'text',
                        html : ' 2020'
                    }]
                }]
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
            date         = me.currentDate, // cloned
            vdom         = me.vdom,
            header       = vdom.cn[0].cn[0],
            domListeners = me.domListeners;

        domListeners.push({
            wheel: {fn: me.onWheel, scope: me}
        });

        me.domListeners = domListeners;

        // todo: update the format in a central spot
        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});

        header.cn[0].html = me.intlFormat_month.format(date);
        header.cn[1].html = ` ${date.getFullYear()}`;

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
                    me.headerHeight = data[1].height;

                    Neo.main.DomAccess.scrollTopBy({
                        id   : me.vdom.cn[1].id,
                        value: data[0].height - data[1].height
                    });
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
        let me   = this,
            date = me.currentDate, // cloned
            vdom = me.vdom,
            i    = 0,
            firstDayOffset, row;

        vdom.cn[1].cn = [];

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});

        firstDayOffset = DateUtil.getFirstDayOffset(date, me.weekStartDay);

        date.setDate(1 - firstDayOffset);

        date.setDate(date.getDate() - 6 * 7);

        for (; i < 18; i++) {
            row = me.createWeek(DateUtil.clone(date));

            if (row.header) {
                vdom.cn[1].cn.push(row.header);
            }

            vdom.cn[1].cn.push(row.row);

            date.setDate(date.getDate() + 7);
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Date} date
     * @returns {Object}
     */
    createWeek(date) {
        let me     = this,
            i      = 0,
            header = null,
            day, dayCls, row, weekDay;

        row = {
            flag: DateUtil.convertToyyyymmdd(date),
            cls : ['neo-week'],
            cn  : []
        };

        for (; i < 7; i++) {
            day = date.getDate();

            if (day === 1) {
                row.flag = DateUtil.convertToyyyymmdd(date); // the first day of a month wins

                header = {
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
                };
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

        return {
            header: header,
            row   : row
        }
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
                i         = 0,
                date, len, scrollTo, week;

            // console.log(data.scrollTop, Math.round(data.scrollTop / (data.clientHeight - me.headerHeight) * 6));

            if (data.deltaY > 0 && Math.round(data.scrollTop / (data.clientHeight - me.headerHeight) * 6) > 11) {
                date = new Date(container.cn[container.cn.length - 1].flag);

                for (; i < 6; i++) {
                    if (container.cn[1].cls.includes('neo-month-header')) {
                        container.cn.splice(1, 1);
                    }

                    container.cn.shift();

                    date.setDate(date.getDate() + 7);

                    week = me.createWeek(DateUtil.clone(date));

                    if (week.header) {
                        container.cn.push(week.header);
                    }

                    container.cn.push(week.row);
                }

                me.vdom = vdom;
            }

            else if (data.deltaY < 0 && Math.round(data.scrollTop / (data.clientHeight - me.headerHeight) * 6) < 1) {
                if (container.cn[0].flag) {
                    date = new Date(container.cn[0].flag);
                } else {
                    date = new Date(container.cn[1].flag);
                }

                for (; i < 6; i++) {
                    len = container.cn.length;

                    if (container.cn[len - 2].cls.includes('neo-month-header')) {
                        container.cn.splice(len - 2, 1);
                    }

                    container.cn.pop();

                    date.setDate(date.getDate() - 7);

                    week = me.createWeek(DateUtil.clone(date));

                    container.cn.unshift(week.row);

                    if (week.header) {
                        container.cn.unshift(week.header);
                    }
                }

                me.promiseVdomUpdate(me.vdom).then(() => {
                    Neo.main.DomAccess.scrollTopTo({
                        id   : me.vdom.cn[1].id,
                        value: data.clientHeight - me.headerHeight
                    });
                });
            }

            if (!me.isScrolling) {
                me.isScrolling = true;
                NeoArray.add(me.vdom.cn[1].cls, 'neo-is-scrolling');console.log('###add cls');
                me.vdom.cn[0].cn[0].style.opacity = 0;
                me.vdom = vdom;
            }

            if (me.scrollTaskId) {
                clearTimeout(me.scrollTaskId);
            }

            me.scrollTaskId = setTimeout(me.onWheelEnd.bind(me), 300);
        }
    }

    /**
     *
     */
    onWheelEnd() {
        let me     = this,
            vdom   = me.vdom,
            header = vdom.cn[0].cn[0],
            i      = 6,
            date, flag;

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: 'short'});
        me.isScrolling      = false;

        for (; i < 12; i++) {
            flag = vdom.cn[1].cn[i].flag; // todo: #989 => get the date of the first fully visible row for the header

            if (flag) {
                date = new Date(flag);
                date.setMonth(date.getMonth() + 1);
                header.cn[0].html = me.intlFormat_month.format(date);
                header.cn[1].html = ` ${date.getFullYear()}`;
                break;
            }
        }

        NeoArray.remove(vdom.cn[1].cls, 'neo-is-scrolling');
        header.style.opacity = 1;

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
            i    = 1;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 8; i++) {
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