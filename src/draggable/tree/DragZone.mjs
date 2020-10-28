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
            listItem;

        console.log('adjustListItemCls', draggable);

        store.items.forEach((item, index) => {
            listItem = vdom.cn[index];
            listItem.cls = listItem.cls || [];

            NeoArray[draggable ? 'add' : 'remove'](listItem.cls, 'neo-draggable');
        });

        owner.vdom = vdom;
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};