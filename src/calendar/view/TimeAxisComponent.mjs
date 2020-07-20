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
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        if (oldValue !== undefined) {
            let me          = this,
                vdom        = me.vdom,
                rowHeight   = me.rowHeight,
                itemHeight  = 2 * rowHeight + 2, // 2 * 1px borders
                totalHeight = rowHeight + (24 * itemHeight),
                i, itemStyle;

            Object.assign(vdom.style, {
                backgroundImage: `linear-gradient(var(--c-w-background-color) ${itemHeight-1}px, var(--c-w-border-color) 1px)`,
                backgroundSize : `0.4em ${itemHeight}px`,
                height         : `${totalHeight}px`,
                maxHeight      : `${totalHeight}px`
            });

            for (i=0; i < 24; i++) {
                itemStyle = {
                    height: `${itemHeight}px`
                };

                if (i === 0) {
                    itemStyle.marginTop = `${rowHeight}px`;
                }

                vdom.cn[i].style = itemStyle;
            }

            me.totalHeight = totalHeight;

            me.vdom = vdom;

            me.fire('heightChange', {
                component: me,
                rowHeight: rowHeight,
                value    : totalHeight
            });
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

        for (i=1; i < 25; i++) {
            html = i === 24 ? '00:00' : (i < 10 ? '0' : '') + i + ':00';

            vdom.cn.push({
                cls  : ['neo-c-w-timeaxis-item'],
                cn   : [{html: html}]
            });
        }
    }
}

Neo.applyClassConfig(TimeAxisComponent);

export {TimeAxisComponent as default};