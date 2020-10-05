import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

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
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-dragproxy', 'neo-list']
        },
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
            {'drag:end'  : me.onDragEnd,   scope: me, delegate: '.neo-draggable'},
            {'drag:start': me.onDragStart, scope: me, delegate: '.neo-draggable'}
        );

        owner.domListeners = domListeners;

        store.on({
            load : me.onStoreLoad,
            scope: me
        });

        // check if the store is already loaded
        if (store.getCount() > 0) {
            me.onStoreLoad();
        }
    }

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

        store.items.forEach((item, index) => {
            listItem = vdom.cn[index];
            listItem.cls = listItem.cls || [];

            NeoArray[draggable ? 'add' : 'remove'](listItem.cls, 'neo-draggable');
        });

        owner.vdom = vdom;
    }

    /**
     *
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
            setTimeout(() => {
                wrapperStyle.left = `${rect.left}px`;
                wrapperStyle.top  = `${rect.top}px`;

                proxy.wrapperStyle = wrapperStyle;

                setTimeout(() => {
                    me.dragEnd();
                }, 300);
            }, 30);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me = this;

        if (me.owner.draggable) {
            me.dragElement = VDomUtil.findVdomChild(me.owner.vdom, data.path[0].id).vdom;
            me.dragStart(data);
        }
    }

    /**
     *
     */
    onStoreLoad() {
        this.adjustListItemCls(true);
    }
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};