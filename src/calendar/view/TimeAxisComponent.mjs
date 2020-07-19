import {default as Component} from '../../component/Base.mjs';

/**
 * @class Neo.calendar.view.TimeAxisComponent
 * @extends Neo.container.Base
 */
class TimeAxisComponent extends Component {
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
         * @member {Number} rowHeight_=10
         */
        rowHeight_: 10
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.createItems();
    }

    createItems() {
        let me         = this,
            vdom       = me.vdom,
            itemHeight = 4 * me.rowHeight + 2, // 2 * 1px borders
            html, i, itemStyle;

        vdom.style.backgroundImage = `linear-gradient(var(--c-w-background-color) ${itemHeight-1}px, var(--c-w-border-color) 1px)`;
        vdom.style.backgroundSize  = `0.4em ${itemHeight}px`;

        vdom.cn = [];

        for (i=1; i < 25; i++) {
            html = i === 24 ? '00:00' : (i < 10 ? '0' : '') + i + ':00';

            itemStyle = {
                height: `${itemHeight}px`
            };

            if (i === 1) {
                itemStyle.marginTop = `${2 * me.rowHeight}px`;
            }

            vdom.cn.push({
                cls  : ['neo-c-w-timeaxis-item'],
                cn   : [{html: html}],
                style: itemStyle
            });
        }
    }
}

Neo.applyClassConfig(TimeAxisComponent);

export {TimeAxisComponent as default};