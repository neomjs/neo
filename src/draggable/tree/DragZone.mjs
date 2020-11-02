import BaseDragZone from '../../draggable/list/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

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
            cls: ['neo-tree-list']
        },
        /**
         * Limit drag&drop to leaf nodes => excluding folders
         * @member {Boolean} leafNodesOnly_=true
         */
        leafNodesOnly_: false
    }}

    /**
     * Triggered after the leafNodesOnly config got changed
     * We only need to adjust folder (non leaf) nodes
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLeafNodesOnly(value, oldValue) {
        if (oldValue !== undefined) { // we only need to react to dynamic changes
            let owner = this.owner,
                store = owner.store,
                vdom  = owner.vdom,
                node;

            store.items.forEach(record => {
                if (!record.isLeaf) {
                    node = owner.getVdomChild(owner.getItemId(record.id), owner.vdom);
                    node.cls = node.cls || [];
                    NeoArray[value ? 'remove' : 'add'](node.cls, 'neo-draggable');
                }
            });

            owner.vdom = vdom;
        }
    }

    /**
     *
     * @returns {Object}
     */
    getDragElementRoot() {
        return this.dragElement.cn[0];
    }

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

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me = this;

        if (me.owner.draggable) {
            me.dragElement = {
                tag: 'ul',
                cls: ['neo-list-container', 'neo-list'],
                cn : [VDomUtil.findVdomChild(me.owner.vdom, data.path[0].id).vdom]
            };

            me.dragStart(data);
        }
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};