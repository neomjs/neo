import BaseDragZone from '../../draggable/DragZone.mjs';

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

        let me    = this,
            store = me.owner.store;

        store.on({
            load: me.onStoreLoad
        });

        console.log(me);
    }

    /**
     *
     */
    onStoreLoad() {
        console.log('onStoreLoad');
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};