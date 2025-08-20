import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.container.DragZone
 * @extends Neo.draggable.DragZone
 */
class DragZone extends BaseDragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.container.DragZone'
         * @protected
         */
        className: 'Neo.draggable.container.DragZone',
        /**
         * @member {String} ntype='container-dragzone'
         * @protected
         */
        ntype: 'container-dragzone'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            {owner} = me,
            opts    = {delegate: '.neo-draggable', scope: me};

        owner.addDomListeners([
            {'drag:end'  : me.onDragEnd,   ...opts},
            {'drag:move' : me.onDragMove,  ...opts},
            {'drag:start': me.onDragStart, ...opts}
        ]);

        owner.on({
            insert      : me.onItemInsert,
            itemsCreated: me.onItemsCreated,
            scope       : me
        });

        // The container items can already be created
        me.adjustItemCls(true);
    }

    /**
     * @param {Boolean} draggable
     */
    adjustItemCls(draggable) {
        let me      = this,
            {owner} = me,
            wrapperCls;

        owner.items.forEach(item => {
            // spacers
            if (typeof item === 'string') {
                return;
            }

            wrapperCls = item.wrapperCls || [];

            NeoArray.toggle(wrapperCls, 'neo-draggable', draggable);
            item.wrapperCls = wrapperCls;
        });
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

                me.timeout(100).then(() => {
                    me.dragEnd();
                });
            });
        }
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me = this;

        if (me.owner.draggable) {
            me.dragElement = VDomUtil.find(me.owner.vdom, data.path[0].id).vdom;
            await me.dragStart(data);
        }
    }

    /**
     * @param {Object}             data
     * @param {Number}             data.index
     * @param {Neo.component.Base} data.item
     */
    onItemInsert(data) {
        let {item}     = data,
            wrapperCls = item.wrapperCls || [];

        NeoArray.add(wrapperCls, 'neo-draggable');
        item.wrapperCls = wrapperCls;
    }

    /**
     * @param {Object}               data
     * @param {String}               data.id
     * @param {Neo.component.Base[]} data.items
     */
    onItemsCreated(data) {
        this.adjustItemCls(true);
    }
}

export default Neo.setupClass(DragZone);
