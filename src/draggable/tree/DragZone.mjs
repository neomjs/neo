import BaseDragZone from '../../draggable/list/DragZone.mjs';

/**
 * @class Neo.draggable.tree.DragZone
 * @extends Neo.draggable.list.DragZone
 */
class DragZone extends BaseDragZone {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.tree.DragZone'
         * @protected
         */
        className: 'Neo.draggable.tree.DragZone',
        /**
         * @member {String} ntype='tree-dragzone'
         * @protected
         */
        ntype: 'tree-dragzone',
        /**
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-dragproxy', 'neo-tree-list']
        },
        /**
         * @member {Boolean} leafNodesOnly=true
         */
        leafNodesOnly: true
    }}

    /**
     *
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|null} vdom
     */
    getItemVdom(record, index) {
        let owner = this.owner;

        if (!(this.leafNodesOnly && !record.isLeaf)) {
            return owner.getVdomChild(owner.getItemId(record.id), owner.vdom);
        }

        return null;
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};