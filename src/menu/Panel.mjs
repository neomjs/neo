import BasePanel       from '../container/Panel.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import List            from './List.mjs';

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

    /**
     * Triggered after the list config got changed
     * @param {Neo.menu.List} value
     * @param {Neo.menu.List} oldValue
     * @protected
     */
    afterSetList(value, oldValue) {
        console.log('afterSetList', value);
    }

    /**
     * Triggered before the list config gets changed.
     * @param {Neo.menu.List} value
     * @param {Neo.menu.List} oldValue
     * @protected
     */
    beforeSetList(value, oldValue) {
        oldValue && oldValue.destroy();
        return ClassSystemUtil.beforeSetInstance(value, List, this.listConfig);
    }
}

Neo.applyClassConfig(Panel);

export {Panel as default};
