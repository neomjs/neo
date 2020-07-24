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
            cn: []
        }
    }}
}

Neo.applyClassConfig(YearComponent);

export {YearComponent as default};