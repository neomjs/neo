import BasePanel from '../container/Panel.mjs';
import List      from './List.mjs';

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
        cls: ['neo-menu', 'neo-panel', 'neo-container'],
        /**
         * @member {Neo.menu.List} list_=List
         * @protected
         */
        list_: List,
        /**
         * Pass config options to the contained Neo.menu.List
         * @member {Object|null} listConfig=null
         */
        listConfig: null
    }}
}

Neo.applyClassConfig(Panel);

export {Panel as default};
