import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

/**
 * @class Neo.draggable.toolbar.DragZone
 * @extends Neo.draggable.DragZone
 */
class DragZone extends BaseDragZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.toolbar.DragZone'
         * @protected
         */
        className: 'Neo.draggable.toolbar.DragZone',
        /**
         * @member {String} ntype='toolbar-dragzone'
         * @protected
         */
        ntype: 'toolbar-dragzone'
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

        owner.on('insert', me.onItemInsert, me);

        me.adjustToolbarItemCls(true)
    }

    /**
     * @param {Boolean} draggable
     */
    adjustToolbarItemCls(draggable) {
        let me      = this,
            {owner} = me,
            wrapperCls;

        owner.items.forEach(item => {
            wrapperCls = item.wrapperCls || [];

            NeoArray[draggable ? 'add' : 'remove'](wrapperCls, 'neo-draggable');
            item.wrapperCls = wrapperCls
        })
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
     * @param {Object} data
     * @param {Number} data.index
     * @param {Neo.component.Base} data.item
     */
    onItemInsert(data) {
        let {item} = data,
            cls    = item.cls || [];

        NeoArray.add(cls, 'neo-draggable');
        item.cls = cls
    }
}

export default Neo.setupClass(DragZone);
