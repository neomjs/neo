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
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }
}

Neo.setupClass(DayViewComponent);

export default DayViewComponent;
