import BasePanel       from '../container/Panel.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import List            from './List.mjs';

/**
 * @class Neo.menu.Panel
 * @extends Neo.container.Panel
 */
class Panel extends BasePanel {
    static config = {
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
         * @member {String[]} baseCls=['neo-menu','neo-panel','neo-container']
         */
        baseCls: ['neo-menu', 'neo-panel', 'neo-container'],
        /**
         * @member {Neo.menu.List} list_=List
         * @protected
         */
        list_: List,
        /**
         * Pass config options to the contained Neo.menu.List
         * @member {Object|null} listConfig=null
         */
        listConfig: null,
        /**
         * Optionally pass menu.Store data directly
         * @member {Object[]|null} listItems_=null
         */
        listItems_: null,
        /**
         * The distance in px between a menu and a child menu
         * See: https://github.com/neomjs/neo/issues/2569
         * @member {Number} subMenuGap_=0
         */
        subMenuGap_: 0
    }

    /**
     * Triggered after the list config got changed
     * @param {Neo.menu.List} value
     * @param {Neo.menu.List} oldValue
     * @protected
     */
    afterSetList(value, oldValue) {
        this.add(value);
    }

    /**
     * Triggered after the listItems config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetListItems(value, oldValue) {
        this.list.items = value;
    }

    /**
     * Triggered after the subMenuGap config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSubMenuGap(value, oldValue) {
        this.list.subMenuGap = value;
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

Neo.setupClass(Panel);

export default Panel;
