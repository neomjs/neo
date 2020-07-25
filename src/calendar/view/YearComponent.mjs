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
         * The format of the column headers.
         * Valid values are: narrow, short & long
         * @member {String} dayNameFormat_='narrow'
         */
        dayNameFormat_: 'narrow',
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
        },
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0
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
    createDayNamesRow() {
        let me   = this,
            date = me.currentDate, // cloned
            i    = 0,
            row  = {cls: ['neo-calendar-week'], cn: [{cls: ['neo-top-left-spacer']}]};

        date.setDate(me.currentDate.getDate() - me.currentDate.getDay() + me.weekStartDay);

        const dt = new Intl.DateTimeFormat(Neo.config.locale, {
            weekday: me.dayNameFormat
        });

        for (; i < 7; i++) {
            row.cn.push({
                cls : ['neo-weekday-cell'],
                html: dt.format(date)
            });

            date.setDate(date.getDate() + 1);
        }

        return row;
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
            len            = 12;

        for (; i < len; i++) {
            currentDate.setMonth(i);
            currentMonth = dt.format(currentDate);

            monthContainer.cn.push({
                cls: ['neo-month'],
                cn : [
                    {
                        cls : ['neo-month-name'],
                        html: currentMonth
                    },
                    me.createDayNamesRow()
                ]
            });
        }

        me.vdom = vdom;
    }
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};