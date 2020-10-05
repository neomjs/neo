import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';

/**
 * @class Neo.draggable.list.DragZone
 * @extends Neo.draggable.DragZone
 */
class DragZone extends BaseDragZone {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.list.DragZone'
         * @protected
         */
        className: 'Neo.draggable.list.DragZone',
        /**
         * @member {String} ntype='list-dragzone'
         * @protected
         */
        ntype: 'list-dragzone',
        /**
         * @member {Neo.list.Base} owner=null
         */
        owner: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            owner        = me.owner,
            domListeners = owner.domListeners,
            store        = owner.store;

        domListeners.push(
            {'drag:start': me.onDragStart, scope: me, delegate: '.neo-draggable'}
        );

        owner.domListeners = domListeners;

        store.on({
            load: me.onStoreLoad
        });

        // check if the store is already loaded
        if (store.getCount() > 0) {
            me.onStoreLoad();
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        console.log('onDragStart', data);
    }

    /**
     *
     */
    onStoreLoad() {
        let me    = this,
            owner = me.owner,
            store = owner.store,
            vdom  = owner.vdom,
            listItem;

        store.items.forEach((item, index) => {
            listItem = vdom.cn[index];
            listItem.cls = listItem.cls || [];

            NeoArray.add(listItem.cls, 'neo-draggable');
        });

        owner.vdom = vdom;
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};