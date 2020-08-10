import {default as Container} from '../container/Base.mjs';

/**
 * @class Neo.filter.BooleanContainer
 * @extends Neo.container.Base
 */
class BooleanContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.filter.BooleanContainer'
         * @protected
         */
        className: 'Neo.filter.BooleanContainer',
        /**
         * @member {String} ntype='filter-booleancontainer'
         * @protected
         */
        ntype: 'filter-booleancontainer'
    }}
}

Neo.applyClassConfig(BooleanContainer);

export {BooleanContainer as default};