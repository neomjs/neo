import Base from './Base.mjs';

/**
 * @class Neo.list.Circle
 * @extends Neo.list.Base
 */
class Circle extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Circle'
         * @protected
         */
        className: 'Neo.list.Circle',
        /**
         * @member {String} ntype='circle-list'
         * @protected
         */
        ntype: 'circle-list',
        /**
         * @member {String[]} cls=['neo-circle-list','neo-list']
         */
        cls: ['neo-circle-list', 'neo-list']
    }}
}

Neo.applyClassConfig(Circle);

export default Circle;
