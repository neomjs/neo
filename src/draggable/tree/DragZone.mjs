import BaseDragZone from '../../draggable/list/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';

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
        ntype: 'tree-dragzone'
    }}

    /**
     *
     * @param {Boolean} draggable
     */
    adjustListItemCls(draggable) {
        let me    = this,
            owner = me.owner,
            store = owner.store,
            vdom  = owner.vdom,
            node;

        store.items.forEach(item => {
            node = owner.getVdomChild(owner.getItemId(item.id), vdom);
            node.cls = node.cls || [];

            NeoArray[draggable ? 'add' : 'remove'](node.cls, 'neo-draggable');
        });

        owner.vdom = vdom;
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};