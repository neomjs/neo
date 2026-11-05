import Component from '../../../component/Base.mjs';

/**
 * @class Neo.calendar.view.week.TimeAxisComponent
 * @extends Neo.container.Base
 */
class TimeAxisComponent extends Component {
    /**
     * Valid values for interval
     * @member {Number[]} intervals=[15,30,60]
     * @protected
     * @static
     */
    static intervals = [15, 30, 60]
    /**
     * Valid values for timeFormat
     * @member {String[]} timeFormats=['12h','24h']
     * @protected
     * @static
     */
    static timeFormats = ['12h', '24h']

    static config = {
        /**
         * @member {String} className='Neo.calendar.view.week.TimeAxisComponent'
         * @protected
         */
        className: 'Neo.calendar.view.week.TimeAxisComponent',
        /**
         * @member {String[]} baseCls=['neo-calendar-timeaxis']
         */
        baseCls: ['neo-calendar-timeaxis'],
        /**
         * @member {Object} bind
         */
        bind: {
            endTime   : data => data.endTime,
            locale    : data => data.locale,
            startTime : data => data.startTime,
            timeFormat: data => data.timeFormatter?.resolvedOptions().hour12 ? '12h' : '24h'
        },
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} endTime_='24:00'
         * @reactive
         */
        endTime_: '24:00',
        /**
         * @member {Intl.DateTimeFormat|null} intlFormat_time=null
         * @protected
         */
        intlFormat_time: null,
        /**
         * The time interval in minutes to display as rows.
         * Valid values: 15, 30, 60
         * @member {Number} interval_=30
         * @reactive
         */
        interval_: 30,
        /**
         * Bound to the state provider.
         * @member {String} locale_=Neo.config.locale
         * @reactive
         */
        locale_: Neo.config.locale,
        /**
         * @member {Number} rowHeight_=20
         * @reactive
         */
        rowHeight_: 20,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} startTime_='00:00'
         * @reactive
         */
        startTime_: '00:00',
        /**
         * Display mode for the time axis labels: '12h' ('am/pm' alias) or '24h',
         * or an Intl.DateTimeFormat options object.
         * @member {Object|String} timeFormat_='24h'
         * @reactive
         */
        timeFormat_: '24h',
        /**
         * @member {Object} vdom
         */
        vdom:
        {style: {}}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.createItems();
        me.afterSetRowHeight(me.rowHeight, 0)
    }

    /**
     * Triggered after the endTime config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEndTime(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            // todo: handle 24:00 as 23:59
            if (!value) {
                me._endTime = '24:00'
            }

            me.afterSetRowHeight(me.rowHeight, 0)
        }
    }

    /**
     * Triggered after the interval config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetInterval(value, oldValue) {
        if (oldValue !== undefined) {
            this.afterSetRowHeight(this.rowHeight, 0)
        }
    }

    /**
     * @summary Rebuilds the Intl.DateTimeFormat instance and refreshes axis labels when locale changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (value && this.timeFormat) {
            this.intlFormat_time = new Intl.DateTimeFormat(value, this.getTimeFormatOptions());

            if (oldValue !== undefined && this.vdom.cn) {
                this.updateItems()
            }
        }
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        if (oldValue !== undefined && this.vdom.cn) {
            let me                = this,
                endTime           = me.getTime(me.endTime),
                startTime         = me.getTime(me.startTime),
                {rowHeight, vdom} = me,
                rowsPerItem       = me.getRowsPerItem(),
                itemHeight        = rowsPerItem * rowHeight + rowsPerItem, // rowsPerItem * 1px borders
                totalHeight       = rowHeight + ((endTime - startTime) * itemHeight),
                i, itemStyle;

            Object.assign(vdom.style, {
                backgroundImage    : `linear-gradient(var(--c-w-background-color) ${itemHeight - 1}px, var(--c-w-border-color) 1px)`,
                backgroundPositionY: `${-itemHeight + 1}px`,
                backgroundSize     : `0.4em ${itemHeight}px`,
                height             : `${totalHeight - rowHeight + 1}px`,
                maxHeight          : `${totalHeight - rowHeight + 1}px`
            });

            for (i=0; i < 25; i++) {
                itemStyle = {
                    height: `${itemHeight}px`
                };

                if (i === startTime) {
                    itemStyle.marginTop = `${-2 - rowHeight * (rowsPerItem === 1 ? 0.5 : rowsPerItem === 2 ? 1 : 2)}px`
                } else {
                    delete itemStyle.marginTop
                }

                vdom.cn[i].style = itemStyle;

                vdom.cn[i].removeDom = (i < startTime || i - 1 >= endTime);
            }

            me.fire('change', {
                component: me,
                rowHeight,
                rowsPerItem,
                totalHeight
            })
        }
    }

    /**
     * Triggered after the startTime config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetStartTime(value, oldValue) {
        if (oldValue !== undefined) {
            this.afterSetRowHeight(this.rowHeight, 0)
        }
    }

    /**
     * @summary Rebuilds the Intl.DateTimeFormat instance and refreshes axis labels when timeFormat changes.
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @protected
     */
    afterSetTimeFormat(value, oldValue) {
        if (value) {
            this.intlFormat_time = new Intl.DateTimeFormat(this.locale, this.getTimeFormatOptions());

            if (oldValue !== undefined && this.vdom.cn) {
                this.updateItems()
            }
        }
    }

    /**
     * @summary Preserves an explicit caller-supplied timeFormat config as a standalone axis override instead of overwriting it from the stateProvider binding.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetBind(value, oldValue) {
        if (value && this.originalConfig?.timeFormat !== undefined && !this.originalConfig.bind?.timeFormat) {
            delete value.timeFormat
        }

        return value
    }

    /**
     * Triggered before the interval config gets changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    beforeSetInterval(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'interval')
    }

    /**
     * @summary Normalizes 'am/pm' to '12h' and validates enum strings against static timeFormats while allowing Intl.DateTimeFormat option objects.
     * @param {Object|String} value
     * @param {Object|String} oldValue
     * @returns {Object|String}
     * @protected
     */
    beforeSetTimeFormat(value, oldValue) {
        if (value === 'am/pm') {
            value = '12h'
        }

        if (Neo.isObject(value)) {
            return value
        }

        return this.beforeSetEnumValue(value, oldValue, 'timeFormat')
    }

    /**
     * @summary Populates the 25 hourly time axis VDOM items formatted via intlFormat_time.
     */
    createItems() {
        let me     = this,
            {vdom} = me,
            date   = new Date(2024, 0, 1, 0, 0, 0),
            i;

        me.intlFormat_time = new Intl.DateTimeFormat(me.locale, me.getTimeFormatOptions());

        vdom.cn = [];

        for (i = 0; i < 25; i++) {
            date.setHours(i === 24 ? 0 : i, 0, 0, 0);

            vdom.cn.push({
                cls: ['neo-c-w-timeaxis-item'],
                cn : [{text: me.intlFormat_time.format(date)}]
            })
        }
    }

    /**
     * Calculates the amount of rows related to the interval config
     * @returns {Number}
     */
    getRowsPerItem() {
        let {interval} = this;
        return interval === 60 ? 1 : interval === 30 ? 2 : 4
    }

    /**
     * Calculates the time for the end- or startTime
     * @param {String} value
     * @returns {Number}
     */
    getTime(value) {
        return value.split(':').map(Number)[0]
    }

    /**
     * @summary Resolves the timeFormat config ('12h', '24h', or options object) into Intl.DateTimeFormat options.
     * @returns {Object}
     */
    getTimeFormatOptions() {
        let {timeFormat} = this;

        if (Neo.isObject(timeFormat)) {
            return timeFormat
        }

        return timeFormat === '12h'
            ? {hour: 'numeric', hour12: true}
            : {hour: '2-digit', minute: '2-digit', hour12: false}
    }

    /**
     * @summary Updates the text of all 25 hourly time axis VDOM items when locale or timeFormat changes.
     */
    updateItems() {
        let me   = this,
            cn   = me.vdom.cn,
            date = new Date(2024, 0, 1, 0, 0, 0),
            i;

        for (i = 0; i < 25; i++) {
            date.setHours(i === 24 ? 0 : i, 0, 0, 0);
            cn[i].cn[0].text = me.intlFormat_time.format(date)
        }

        me.update()
    }
}

export default Neo.setupClass(TimeAxisComponent);
