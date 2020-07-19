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
         * @member {Object} vdom
         */
        vdom: {
            cn: []
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let vdom = this.vdom,
            html, i;

        for (i=1; i < 25; i++) {
            html = i === 24 ? '00:00' : (i < 10 ? '0' : '') + i + ':00';

            vdom.cn.push({
                cls: ['neo-c-w-timeaxis-item'],
                cn : [{
                    html: html
                }]
            });
        }
    }
}

Neo.applyClassConfig(TimeAxisComponent);

export {TimeAxisComponent as default};