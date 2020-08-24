import Component from '../../component/Base.mjs';
import DateUtil  from '../../util/Date.mjs';
import NeoArray  from '../../util/Array.mjs';
import VDomUtil  from '../../util/VDom.mjs';

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
         * The format of the column headers.
         * Valid values are: narrow, short & long
         * @member {String} dayNameFormat_='short'
         */
        dayNameFormat_: 'short',
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
         * @member {Intl.DateTimeFormat|null} intlFormat_day=null
         * @protected
         */
        intlFormat_day: null,
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_month=null
         * @protected
         */
        intlFormat_month: null,
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
         * The format of the month header names.
         * Valid values are: narrow, short & long
         * @member {String} monthNameFormat_='long'
         */
        monthNameFormat_: 'short',
        /**
         * @member {String|null} scrollTask=null
         * @protected
         */
        scrollTaskId: null,
        /**
         * @member {Boolean} showWeekends_=true
         */
        showWeekends_: true,
        /**
         * True to use box shadows for the months while scrolling
         * @member {Boolean} useScrollBoxShadows_=true
         */
        useScrollBoxShadows_: true,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-days-header'],
                cn : [{
                    cls  : ['neo-static-header'],
                    style: {},
                    cn   : [{
                        tag : 'span',
                        cls : ['neo-month-name'],
                        flag: 'month-name'
                    }, {
                        vtype: 'text'
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

        header.cn[0].html = me.intlFormat_month.format(date);
        header.cn[1].html = ` ${date.getFullYear()}`;

        me.updateHeader(true);
        me.createContent();
    }

    /**
     * Triggered after the dayNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDayNameFormat(value, oldValue) {
        let me = this;

        me.intlFormat_day = new Intl.DateTimeFormat(me.locale, {weekday: value});

        if (oldValue !== undefined) {
            me.updateHeader();
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
            let me = this;

            me.intlFormat_day   = new Intl.DateTimeFormat(value, {weekday: me.dayNameFormat});
            me.intlFormat_month = new Intl.DateTimeFormat(value, {month  : me.monthNameFormat});

            me.updateMonthNames(true);
            me.updateHeader();
        }
    }

    /**
     * Triggered after the monthNameFormat config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetMonthNameFormat(value, oldValue) {
        let me = this;

        me.intlFormat_month = new Intl.DateTimeFormat(me.locale, {month: value});

        if (oldValue !== undefined) {
            me.updateMonthNames();
        }
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

                    Neo.main.DomAccess.scrollBy({
                        direction: 'top',
                        id       : me.vdom.cn[1].id,
                        value    : data[0].height - data[1].height
                    });
                });
            }, 20);
        }
    }

    /**
     * Triggered after the showWeekends config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowWeekends(value, oldValue) {
        if (oldValue !== undefined) {
            let me   = this,
                vdom = me.vdom,
                i, item;

            vdom.cn[1].cn.forEach(row => {
                if (row.flag) {
                    for (i=0; i < 7; i++) {
                        item = row.cn[i];

                        if (item.cls.includes('neo-weekend')) {
                            if (value) {
                                delete item.removeDom;
                            } else {
                                item.removeDom = true;
                            }
                        }
                    }
                }
            });

            // triggers the vdom update
            me.updateHeader();
        }
    }

    /**
     * Triggered after the useScrollBoxShadows config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseScrollBoxShadows(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        NeoArray[value ? 'add' : 'remove'](me.vdom.cn[1].cls, 'neo-scroll-shadows');
        me.vdom = vdom;
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
     * Triggered before the dayNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetDayNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'dayNameFormat', DateUtil.prototype.dayNameFormats);
    }

    /**
     * Triggered before the monthNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetMonthNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'monthNameFormat', DateUtil.prototype.monthNameFormats);
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
            day, dayConfig, row, weekDay;

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

            dayConfig = {
                cls : ['neo-day'],
                html: day
            };

            weekDay = date.getDay();

            if (weekDay === 0 || weekDay === 6) {
                dayConfig.cls.push('neo-weekend');

                if (!me.showWeekends) {
                    dayConfig.removeDom = true;
                }
            }

            row.cn.push(dayConfig);

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
                date, len, week;

            // console.log(data.scrollTop, Math.round(data.scrollTop / (data.clientHeight - me.headerHeight) * 6));

            if (data.deltaY > 0 && Math.round(data.scrollTop / (data.clientHeight - me.headerHeight) * 6) > 11) {
                date = new Date(container.cn[container.cn.length - 1].flag);

                date.setDate(date.getDate() - (date.getDay() - me.weekStartDay));

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

                date.setDate(date.getDate() - (date.getDay() - me.weekStartDay));

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
                    Neo.main.DomAccess.scrollTo({
                        direction: 'top',
                        id       : me.vdom.cn[1].id,
                        value    : data.clientHeight - me.headerHeight
                    });
                });
            }

            if (!me.isScrolling) {
                me.isScrolling = true;
                NeoArray.add(me.vdom.cn[1].cls, 'neo-is-scrolling');
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

        me.isScrolling = false;

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

        // todo: #990 => scroll the view to the closest row
    }

    /**
     *
     * @param {Boolean} [create=false]
     */
    updateHeader(create=false) {
        let me   = this,
            date = me.currentDate, // cloned
            vdom = me.vdom,
            i    = 1,
            day, node;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 8; i++) {
            day = date.getDay();

            if (create) {
                node = {
                    cls : ['neo-day-name'],
                    html: me.intlFormat_day.format(date)
                };

                if (!me.showWeekends && (day === 0 || day === 6)) {
                    node.removeDom = true;
                }

                vdom.cn[0].cn.push(node);
            } else {
                node = vdom.cn[0].cn[i];

                node.html = me.intlFormat_day.format(date);

                if (!me.showWeekends && (day === 0 || day === 6)) {
                    node.removeDom = true;
                } else {
                    delete node.removeDom;
                }
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

        months.forEach(month => {
            month.html = me.intlFormat_month.format(date);
            date.setMonth(date.getMonth() + 1);
        });

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(MonthComponent);

export {MonthComponent as default};