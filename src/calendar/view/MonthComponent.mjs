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
         * @member {String} locale_=Neo.config.locale
         */
        locale_: Neo.config.locale,
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn : [{
                cls: ['neo-days-header'],
                cn : []
            }, {
                cls: ['neo-days'],
                cn : []
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
        this.createContent();
    }

    /**
     *
     */
    createContent() {
        let me   = this,
            date = me.currentDate, // cloned
            vdom = me.vdom,
            i    = 0,
            j;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 7; i++) {
            for (j=0; j < 30; j++) {
                vdom.cn[1].cn.push({
                    cls : ['neo-day'],
                    html: i
                });
            }

            date.setDate(date.getDate() + 1);
        }

        me.vdom = vdom;
    }

    /**
     *
     */
    createHeader() {
        let me   = this,
            date = me.currentDate, // cloned
            dt   = new Intl.DateTimeFormat(me.locale, {weekday: 'short'}),
            vdom = me.vdom,
            i    = 0;

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        for (; i < 7; i++) {
            vdom.cn[0].cn.push({
                cls : ['neo-day-name'],
                html: dt.format(date)
            });

            date.setDate(date.getDate() + 1);
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(MonthComponent);

export {MonthComponent as default};