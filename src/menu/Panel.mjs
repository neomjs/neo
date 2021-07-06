import BasePanel from '../container/Panel.mjs';

/**
 * @class Neo.menu.Panel
 * @extends Neo.container.Panel
 */
class Panel extends BasePanel {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.menu.Panel'
         * @protected
         */
        className: 'Neo.menu.Panel',
        /**
         * @member {String} ntype='menu'
         * @protected
         */
        ntype: 'menu',
        /**
         * @member {String[]} cls=['neo-menu','neo-panel','neo-container']
         */
        cls: ['neo-menu', 'neo-panel', 'neo-container']
    }}
}

Neo.applyClassConfig(Panel);

export {Panel as default};
