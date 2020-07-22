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
 * @extends Neo.container.Base
 */
class WeekComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.WeekComponent'
         * @protected
         */
        className: 'Neo.calendar.view.WeekComponent',
        /**
         * @member {String} ntype='calendar-view-weekComponent'
         * @protected
         */
        ntype: 'calendar-view-weekComponent',
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
         * @member {Object} timeAxis=null
         */
        timeAxis: null,
        /**
         * @member {Object} timeAxisConfig=null
         */
        timeAxisConfig: null,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header-row'],
                cn : [{
                    cls: ['neo-top-left-corner']
                }]
            }, {
                cls: ['neo-c-w-body'],
                cn : [{
                    cls  : ['neo-c-w-content'],
                    cn   : [],
                    flag : 'neo-c-w-content',
                    style: {}
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
                change: me.adjustTotalHeight,
                scope : me
            },
            ...me.timeAxisConfig || {}
        });

        me.vdom.cn[1].cn.unshift(me.timeAxis.vdom);

        me.updateHeader(true);
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number} data.rowHeight
     * @param {Number} data.rowsPerItem
     * @param {Number} data.totalHeight
     */
    adjustTotalHeight(data) {
        let me          = this,
            rowHeight   = data.rowHeight,
            rowsPerItem = data.rowsPerItem,
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

        Object.assign(me.getVdomContent().style, {
            backgroundImage: `linear-gradient(${gradient.join(',')})`,
            backgroundSize : `1px ${rowsPerItem * rowHeight + rowsPerItem}px`,
            height         : `${data.totalHeight - rowHeight}px`,
            maxHeight      : `${data.totalHeight - rowHeight}px`
        });

        me.vdom = vdom;
    }

    /**
     * Triggered after the currentDate config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetCurrentDate(value, oldValue) {
        if (oldValue !== undefined) {
            console.log('WeekComponent afterSetCurrentDate', value);
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
     * Triggered before the dayNameFormat config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetDayNameFormat(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'dayNameFormat', DateUtil.prototype.dayNameFormats);
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
        this.timeAxis = null;

        super.destroy(...args);
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
        return this.vdom.cn[0];
    }

    /**
     *
     * @param {Boolean} [create=false]
     */
    updateHeader(create=false) {
        let me        = this,
            vdom      = me.vdom,
            date      = DateUtil.clone(me.currentDate),
            headerRow = me.getVdomHeaderRow(),
            i         = 0,
            columnCls, content, currentDate, currentDay, dateCls;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        content = me.getVdomContent();

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            weekday: me.dayNameFormat
        });

        for (; i < 7; i++) {
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

                headerRow.cn.push({
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

                headerRow.cn[i + 1].cn[0].html = dt.format(date);

                Object.assign(headerRow.cn[i + 1].cn[1], {
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