import Base from './Base.mjs';

/**
 * A base class for lists which will use component based list items
 * @class Neo.list.Component
 * @extends Neo.list.Base
 */
class Component extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Component'
         * @protected
         */
        className: 'Neo.list.Component',
        /**
         * @member {String} ntype='component-list'
         * @protected
         */
        ntype: 'component-list'
    }}
}

Neo.applyClassConfig(Component);

export {Component as default};
