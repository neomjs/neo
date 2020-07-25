import {default as Component} from '../../component/Base.mjs';

/**
 * @class Neo.calendar.view.YearComponent
 * @extends Neo.component.Base
 */
class YearComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.YearComponent'
         * @protected
         */
        className: 'Neo.calendar.view.YearComponent',
        /**
         * @member {String} ntype='calendar-view-yearcomponent'
         * @protected
         */
        ntype: 'calendar-view-yearcomponent',
        /**
         * @member {String[]} cls=['neo-calendar-yearcomponent']
         */
        cls: ['neo-calendar-yearcomponent'],
        /**
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header']
            }, {
                cls: ['neo-months-container'],
                cn : []
            }]
        }
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        this.createMonths();
    }

    /**
     *
     */
    createMonths() {
        let me             = this,
            vdom           = me.vdom,
            monthContainer = vdom.cn[1],
            i              = 0,
            len            = 12;

        for (; i < len; i++) {
            monthContainer.cn.push({
                cls: ['neo-month']
            });
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};