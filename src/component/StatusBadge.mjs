import Base from '../component/Base.mjs';

/**
 * @class Neo.component.StatusBadge
 * @extends Neo.component.Base
 */
class StatusBadge extends Base {
    static config = {
        /**
         * @member {String} className='Neo.component.StatusBadge'
         * @protected
         */
        className: 'Neo.component.StatusBadge',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {}
    }
}

Neo.applyClassConfig(StatusBadge);

export default StatusBadge;
