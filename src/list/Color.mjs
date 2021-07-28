import Base from './Base.mjs';

/**
 * @class Neo.list.Color
 * @extends Neo.list.Base
 */
class Color extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Color'
         * @protected
         */
        className: 'Neo.list.Color',
        /**
         * @member {String} ntype='colorlist'
         * @protected
         */
        ntype: 'colorlist',
        /**
         * @member {String[]} cls=['neo-color-list','neo-list']
         */
        cls: ['neo-color-list', 'neo-list']
    }}
}

Neo.applyClassConfig(Color);

export {Color as default};
