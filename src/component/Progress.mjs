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
         * @member {String} ntype='progress'
         * @protected
         */
        ntype: 'progress',
        /**
         * @member {String[]} baseCls=['neo-progress-label']
         * @protected
         */
        baseCls: ['neo-progress-label'],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'label', cn: [
            {tag: 'progress', cls: ['neo-progress']}
        ]}
    }
}

Neo.applyClassConfig(Progress);

export default Progress;
