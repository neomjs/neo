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
                cls : ['neo-header'],
                html: '2020' // todo
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
            dt             = new Intl.DateTimeFormat(Neo.config.locale, {month: 'long'}),
            currentDate    = me.currentDate, // cloned
            currentMonth   = dt.format(me.currentDate),
            vdom           = me.vdom,
            monthContainer = vdom.cn[1],
            i              = 0,
            len            = 12,
            weekLen        = 8,
            j;

        for (; i < len; i++) {
            currentDate.setMonth(i);
            currentMonth = dt.format(currentDate);

            monthContainer.cn.push({
                cls: ['neo-month'],
                cn : [{
                    cls : ['neo-month-name'],
                    html: currentMonth
                }, {
                    cls: ['neo-calendar-week'],
                    cn : [{
                        cls: ['neo-top-left-spacer']
                    }]
                }]
            });

            for (j=0; j < 7; j++) {
                monthContainer.cn[i].cn[1].cn.push({
                    cls : ['neo-weekday-cell'],
                    html: j
                });
            }
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};