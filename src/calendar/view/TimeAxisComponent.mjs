import {default as Component} from '../../component/Base.mjs';

/**
 * @class Neo.calendar.view.TimeAxisComponent
 * @extends Neo.container.Base
 */
class TimeAxisComponent extends Component {
    static getStaticConfig() {return {
        /**
         * Valid values for interval
         * @member {Number[]} intervals=[15, 30, 60]
         * @protected
         * @static
         */
        intervals: [15, 30, 60]
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.TimeAxisComponent'
         * @protected
         */
        className: 'Neo.calendar.view.TimeAxisComponent',
        /**
         * @member {String} ntype='calendar-timeaxis'
         * @protected
         */
        ntype: 'calendar-timeaxis',
        /**
         * @member {String[]} cls=['neo-calendar-timeaxis']
         */
        cls: ['neo-calendar-timeaxis'],
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} endTime_='24:00'
         */
        endTime_: '24:00',
        /**
         * The time interval in minutes to display as rows.
         * Valid values: 15, 30, 60
         * @member {Number} interval_=30
         */
        interval_: 30,
        /**
         * @member {Number} rowHeight_=20
         */
        rowHeight_: 20,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} startTime_='00:00'
         */
        startTime_: '00:00',
        /**
         * @member {Object} vdom
         */
        vdom: {
            style: {}
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.createItems();
        me.afterSetRowHeight(me.rowHeight, 0);
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
                me.endTime = '24:00';
            }

            me.afterSetRowHeight(me.rowHeight, 0);
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
            this.afterSetRowHeight(this.rowHeight, 0);
        }
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        if (oldValue !== undefined) {
            let me          = this,
                endTime     = me.getTime(me.endTime),
                startTime   = me.getTime(me.startTime),
                vdom        = me.vdom,
                rowHeight   = me.rowHeight,
                rowsPerItem = me.getRowsPerItem(),
                itemHeight  = rowsPerItem * rowHeight + rowsPerItem, // rowsPerItem * 1px borders
                totalHeight = rowHeight + ((endTime - startTime) * itemHeight),
                i, itemStyle;

            Object.assign(vdom.style, {
                backgroundImage: `linear-gradient(var(--c-w-background-color) ${itemHeight-1}px, var(--c-w-border-color) 1px)`,
                backgroundSize : `0.4em ${itemHeight}px`,
                height         : `${totalHeight}px`,
                maxHeight      : `${totalHeight}px`
            });

            for (i=0; i < 25; i++) {
                itemStyle = {
                    height: `${itemHeight}px`
                };

                if (i === startTime) {
                    itemStyle.marginTop = `${-2 - rowHeight * (rowsPerItem === 1 ? 0.5 : rowsPerItem === 2 ? 1 : 2)}px`;
                } else {
                    delete itemStyle.marginTop;
                }

                vdom.cn[i].style = itemStyle;

                vdom.cn[i].removeDom = (i < startTime || i - 1 >= endTime);
            }

            me.totalHeight = totalHeight;

            // silent update: the view containing this component will trigger the vdom update
            me._vdom = vdom;

            me.fire('change', {
                component  : me,
                rowHeight  : rowHeight,
                rowsPerItem: rowsPerItem,
                totalHeight: totalHeight
            });
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
            this.afterSetRowHeight(this.rowHeight, 0);
        }
    }

    /**
     * Triggered before the interval config gets changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    beforeSetInterval(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'interval');
    }

    /**
     *
     */
    createItems() {
        let vdom = this.vdom,
            html, i;

        vdom.cn = [];

        for (i=0; i < 25; i++) {
            html = i === 24 ? '00:00' : (i < 10 ? '0' : '') + i + ':00';

            vdom.cn.push({
                cls  : ['neo-c-w-timeaxis-item'],
                cn   : [{html: html}]
            });
        }
    }

    /**
     * Calculates the amount of rows related to the interval config
     * @return {Number}
     */
    getRowsPerItem() {
        return this.interval === 60 ? 1 : this.interval === 30 ? 2 : 4;
    }

    /**
     * Calculates the time for the end- or startTime
     * @param {String} value
     * @return {Number}
     */
    getTime(value) {
        return value.split(':').map(Number)[0];
    }
}

Neo.applyClassConfig(TimeAxisComponent);

export {TimeAxisComponent as default};