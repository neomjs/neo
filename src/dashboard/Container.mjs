import BaseContainer from '../container/Base.mjs';

/**
 * @class Neo.dashboard.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.Container'
         * @protected
         */
        className: 'Neo.dashboard.Container',
        /**
         * @member {String} ntype='dashboard'
         * @protected
         */
        ntype: 'dashboard'
    }
}

Neo.setupClass(Container);

export default Container;
