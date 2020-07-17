import {default as Component} from '../../component/Base.mjs';

/**
 * @class Neo.calendar.view.WeekComponent
 * @extends Neo.container.Base
 */
class WeekComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.WeekComponent'
         * @protected
         */
        className: 'Neo.calendar.view.WeekComponent',
        /**
         * @member {String} ntype='calendar-view-weekComponent'
         * @protected
         */
        ntype: 'calendar-view-weekComponent',
        /**
         * @member {String[]} cls=['neo-calendar-weekcomponent']
         */
        cls: ['neo-calendar-weekcomponent'],
        /**
         * @member {Object} vdom
         */
        vdom: {
            cn: [{
                cls: ['neo-header-row']
            }, {
                cls: ['neo-c-w-body'],
                cn : [{
                    cls: ['neo-time-axis']
                }, {
                    cls: ['neo-c-w-content']
                }]
            }]
        }
    }}
}

Neo.applyClassConfig(WeekComponent);

export {WeekComponent as default};