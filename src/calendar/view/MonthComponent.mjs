import {default as Component} from '../../component/Base.mjs';

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
         * @member {Object} vdom
         */
        vdom: {
            cls: ['neo-content-wrapper'],
            cn : [{
                cls: ['neo-days-header'],
                cn : []
            }, {
                cls: ['neo-days']
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
        this.createHeader();
    }

    /**
     *
     */
    createHeader() {
        let me   = this,
            vdom = me.vdom,
            i    = 0;

        for (; i < 7; i++) {
            vdom.cn[0].cn.push({
                cls : ['neo-day-name'],
                html: 'Mon'
            });
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(MonthComponent);

export {MonthComponent as default};