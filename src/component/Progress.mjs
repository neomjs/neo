import Base from '../component/Base.mjs';

/**
 * @class Neo.component.Progress
 * @extends Neo.component.Base
 */
class Progress extends Base {
    static config = {
        /**
         * @member {String} className='Neo.component.Progress'
         * @protected
         */
        className: 'Neo.component.Progress',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }
}

Neo.applyClassConfig(Progress);

export default Progress;
