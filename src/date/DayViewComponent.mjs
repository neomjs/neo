import Base from '../component/Base.mjs';

/**
 * @class Neo.date.DayViewComponent
 * @extends Neo.component.Base
 */
class DayViewComponent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.date.DayViewComponent'
         * @protected
         */
        className: 'Neo.date.DayViewComponent',
        /**
         * @member {String} className='day-view-component'
         * @protected
         */
        ntype: 'day-view-component',
        /**
         * @member {String[]} baseCls=['neo-day-view']
         * @protected
         */
        baseCls: ['neo-day-view'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: []}
    }
}

Neo.setupClass(DayViewComponent);

export default DayViewComponent;
