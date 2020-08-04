import {default as Component} from '../../component/Base.mjs';
import DateUtil               from '../../util/Date.mjs';
import NeoArray               from '../../util/Array.mjs';
import TimeAxisComponent      from './TimeAxisComponent.mjs';
import {default as VDomUtil}  from '../../util/VDom.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.WeekComponent
 * @extends Neo.component.Base
 */
class WeekComponent extends Component {
    static getStaticConfig() {return {
        /**
         * Valid values for timeAxisPosition
         * @member {String[]} timeAxisPositions=['end', 'start']
         * @protected
         * @static
         */
        timeAxisPositions: ['end', 'start']
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.WeekComponent'
         * @protected
         */
        className: 'Neo.calendar.view.WeekComponent',
        /**
         * @member {String} ntype='calendar-view-weekcomponent'
         * @protected
         */
        ntype: 'calendar-view-weekcomponent',
        /**
         * @member {String[]} cls=['neo-calendar-weekcomponent']
         */
        cls: ['neo-calendar-weekcomponent'],
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
         * Will get passed from updateHeader()
         * @member {Date|null} firstColumnDate=null
         * @protected
         */
        firstColumnDate: null,
        /**
         * Internal flag to check if updateHeader(true) has already run
         * @member {Boolean} headerCreated=false
         * @protected
         */
        headerCreated: false,
        /**
         * @member {Object} timeAxis=null
         */
        timeAxis: null,
        /**
         * @member {Object} timeAxisConfig=null
         */
        timeAxisConfig: null,
        /**
         * Position the timeAxis at the left or right side.
         * Valid values are start & end.
         * start => left, end => right in LTR mode.
         * @member {String} timeAxisPosition_='start'
         */
        timeAxisPosition_: 'start',
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header']
            }, {
                cls: ['neo-scroll-overlay']
            }, {
                cls  : ['neo-cw-body-and-header'],
                flag : 'neo-cw-body-and-header',
                style: {},
                cn   : [{
                    cls : ['neo-header-row'],
                    cn  : [],
                    flag: 'neo-header-row'
                }, {
                    cls  : ['neo-c-w-column-timeaxis-container'],
                    flag : 'neo-c-w-column-container',
                    style: {},
                    cn   : [{
                        cls  : ['neo-c-w-column-container'],
                        flag : 'neo-c-w-column-content-container',
                        style: {},
                        cn   : []
                    }],
                }]
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

        let me = this;

        me.timeAxis = Neo.create(TimeAxisComponent, {
            parentId : me.id,
            listeners: {
                change: me.onTimeAxisChange,
                scope : me
            },
            ...me.timeAxisConfig || {}
        });

        me.getColumnContainer().cn[me.timeAxisPosition === 'start' ? 'unshift' : 'push'](me.timeAxis.vdom);

        me.updateHeader(true);

        me.headerCreated = true;
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     * @param {Boolean} [silent=false]
     */
    adjustTotalHeight(data, silent=false) {
        let me          = this,
            rowHeight   = data.rowHeight,
            rowsPerItem = data.rowsPerItem,
            height      = data.totalHeight - rowHeight,
            vdom        = me.vdom,
            i           = 0,
            gradient    = [];

        for (; i < rowsPerItem; i++) {
            gradient.push(
                `var(--c-w-background-color) ${i * rowHeight + i}px`,
                `var(--c-w-background-color) ${(i + 1) * rowHeight + i}px`,
                'var(--c-w-border-color) 0'
            );
        }

        Object.assign(me.getColumnContentContainer().style, {
            backgroundImage: `linear-gradient(${gradient.join(',')})`,
            backgroundSize : `1px ${rowsPerItem * rowHeight + rowsPerItem}px`
        });

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {Date} value
     * @param {Date} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateHeader();
        }
    }

    /**
     * Triggered after the eventStore config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEventStore(value, oldValue) {
        // console.log('afterSetEventStore', value);
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
                let me = this,
                    vdom;

                // without manually assigning width values for the column container,
                // the sticky positioned timeAxis will get pushed out of the visible
                // area once the 7th column got scrolled out

                Neo.main.DomAccess.getBoundingClientRect({
                    id: me.getColumnContentContainer().id
                }).then(data => {
                    let width = 3 * data.width + 50;

                    vdom = me.vdom;
                    me.getColumnContainer().style.width = `${width}px`;
                    me.vdom = vdom;
                });
            }, 20);
        }
    }

    /**
     * Triggered after the timeAxisPosition config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTimeAxisPosition(value, oldValue) {
        let me   = this,
            cls  = me.cls,
            vdom = me.vdom;

        NeoArray[value === 'end' ? 'add' : 'remove'](cls,  'neo-timeaxis-end');

        if (oldValue !== undefined) {
            vdom.cn[1].cn.unshift(vdom.cn[1].cn.pop()); // switch the order of the 2 items
        }

        me._cls = cls;
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
            this.updateHeader();
            this.updateEvents();
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
     * Triggered before the timeAxisPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTimeAxisPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'timeAxisPosition');
    }

    /**
     * Triggered before the weekStartDay config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetWeekStartDay(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'weekStartDay', DateUtil.prototype.weekStartDays);
    }

    /**
     *
     */
    destroy(...args) {
        this.eventStore = null;
        this.timeAxis   = null;

        super.destroy(...args);
    }

    /**
     *
     */
    getBackgroundContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-background');
    }

    /**
     *
     */
    getColumnContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-column-container');
    }

    /**
     *
     */
    getColumnContentContainer() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-column-content-container');
    }

    /**
     *
     */
    getVdomContent() {
        return VDomUtil.getByFlag(this.vdom, 'neo-c-w-content');
    }

    /**
     *
     */
    getVdomHeaderRow() {
        return VDomUtil.getByFlag(this.vdom, 'neo-header-row');
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     */
    onTimeAxisChange(data) {
        let me = this;

        me.adjustTotalHeight(data, me.headerCreated);

        if (me.headerCreated) {
            me.updateEvents();
        }
    }

    /**
     * The algorithm relies on the eventStore being sorted by startDate ASC
     */
    updateEvents() {
        let me         = this,
            timeAxis   = me.timeAxis,
            endTime    = timeAxis.getTime(timeAxis.endTime),
            startTime  = timeAxis.getTime(timeAxis.startTime),
            totalTime  = endTime - startTime,
            date       = DateUtil.clone(me.firstColumnDate),
            eventStore = me.eventStore,
            vdom       = me.vdom,
            content    = me.getColumnContentContainer(),
            j          = 0,
            len        = eventStore.getCount(),
            column, duration, height, i, record, startHours, top;

        // remove previous events from the vdom
        content.cn.forEach(item => item.cn = []);

        for (; j < 21; j++) {
            column = content.cn[j];

            for (i = 0; i < len; i++) {
                record = eventStore.items[i];

                // todo: we need a check for date overlaps => startDate < current day, endDate >= current day
                if (DateUtil.matchDate(date, record.startDate)) {
                    if (DateUtil.matchDate(date, record.endDate)) {
                        duration   = (record.endDate - record.startDate) / 60 / 60 / 1000; // duration in hours
                        height     = Math.round(duration / totalTime * 100 * 1000) / 1000;
                        startHours = (record.startDate.getHours() * 60 + record.startDate.getMinutes()) / 60;
                        top        = Math.round((startHours - startTime) / totalTime * 100 * 1000) / 1000;

                        // console.log(j, record);
                        // console.log(top);

                        column.cn.push({
                            cls : ['neo-event'],
                            id  : me.id + '__' + record[eventStore.keyProperty],
                            html: record.title,

                            style: {
                                height: `calc(${height}% - 2px)`,
                                top   : `calc(${top}% + 1px)`,
                                width : 'calc(100% - 1px)' // todo
                            }
                        });
                    }
                }
            }

            date.setDate(date.getDate() + 1);
        }

        // console.log(content);
        me.vdom = vdom;
    }

    /**
     *
     * @param {Boolean} [create=false]
     */
    updateHeader(create=false) {
        let me      = this,
            date    = me.currentDate, // cloned
            vdom    = me.vdom,
            content = me.getColumnContentContainer(),
            i       = 0,
            columnCls, currentDate, currentDay, dateCls;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        me.firstColumnDate = DateUtil.clone(date);

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            weekday: me.dayNameFormat
        });

        for (; i < 21; i++) {
            columnCls   = ['neo-c-w-column'];
            currentDate = date.getDate();
            currentDay  = date.getDay();
            dateCls     = ['neo-date'];

            if (currentDay === 0 || currentDay === 6) {
                columnCls.push('neo-weekend');
            } else {
                NeoArray.remove(columnCls, 'neo-weekend');
            }

            if (currentDate        === today.day   &&
                date.getMonth()    === today.month &&
                date.getFullYear() === today.year) {
                dateCls.push('neo-today');
            } else {
                NeoArray.remove(dateCls, 'neo-today');
            }

            if (create) {
                content.cn.push({
                    cls: columnCls
                });

                me.getVdomHeaderRow().cn.push({
                    cls: ['neo-header-row-item'],
                    cn : [{
                        cls : ['neo-day'],
                        html: dt.format(date)
                    }, {
                        cls : dateCls,
                        html: currentDate
                    }]
                });
            } else {
                content.cn[i].cls = columnCls;

                content.cn[i].cn[0].cn[0].html = dt.format(date);

                Object.assign(content.cn[i].cn[0].cn[1], {
                    cls : dateCls,
                    html: currentDate
                });
            }

            date.setDate(date.getDate() + 1);
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(WeekComponent);

export {WeekComponent as default};