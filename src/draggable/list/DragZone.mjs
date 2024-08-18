import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.list.DragZone
 * @extends Neo.draggable.DragZone
 */
class DragZone extends BaseDragZone {
    static config = {
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
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-list']
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me,
            opts    = {delegate: '.neo-draggable', scope: me},
            {store} = owner;

        owner.addDomListeners([
            {'drag:end'  : me.onDragEnd,   ...opts},
            {'drag:start': me.onDragStart, ...opts}
        ]);

        store.on({
            load : me.onStoreLoad,
            scope: me
        });

        // check if the store is already loaded
        if (store.getCount() > 0) {
            me.onStoreLoad()
        }
    }

    /**
     * @param {Boolean} draggable
     */
    adjustListItemCls(draggable) {
        let me      = this,
            {owner} = me,
            {store} = owner,
            node;

        store.items.forEach((record, index) => {
            node = me.getItemVdom(record, index);

            if (node) {
                node.cls = node.cls || [];
                NeoArray[draggable ? 'add' : 'remove'](node.cls, 'neo-draggable')
            }
        });

        owner.update()
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|null} vdom
     */
    getItemVdom(record, index) {
        return this.owner.vdom.cn[index]
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        if (this.owner.draggable) {
            let me           = this,
                proxy        = me.dragProxy,
                cls          = proxy.cls || {},
                rect         = me.dragElementRect,
                wrapperStyle = proxy.wrapperStyle || {};

            NeoArray.add(cls, 'neo-animate');
            proxy.cls = cls;

            // ensure to get into the next animation frame
            me.timeout(30).then(() => {
                wrapperStyle.left = `${rect.left}px`;
                wrapperStyle.top  = `${rect.top}px`;

                proxy.wrapperStyle = wrapperStyle;

                me.timeout(300).then(() => {
                    me.dragEnd()
                })
            })
        }
    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        let me = this;

        if (me.owner.draggable) {
            me.dragElement = VDomUtil.findVdomChild(me.owner.vdom, data.path[0].id).vdom;
            me.dragStart(data)
        }
    }

    /**
     *
     */
    onStoreLoad() {
        this.adjustListItemCls(true)
    }

    /**
     * @param {Object} data={}
     */
    setData(data={}) {
        let me       = this,
            {owner}  = me,
            recordId = owner.getItemRecordId(me.getDragElementRoot().id);

        data.record = owner.store.get(recordId);

        super.setData(data)
    }
}

export default Neo.setupClass(DragZone);
