import BaseDragZone from '../../draggable/DragZone.mjs';
import NeoArray     from '../../util/Array.mjs';
import VDomUtil     from '../../util/VDom.mjs';

const
    fallbackDraggableStates = new WeakMap(),
    normalizeClassNames     = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))];

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
            {owner} = me;

        owner.items.forEach(item => {
            // spacers
            if (typeof item === 'string') {
                return;
            }

            me.setItemDraggableCls(item, draggable)
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
        this.setItemDraggableCls(data.item, true)
    }

    /**
     * @summary Applies the drag marker without requiring every draggable item to implement the component contribution API.
     *
     * Full components keep the marker as an owner-keyed wrapper class contribution. Lightweight item implementations retain
     * the legacy wrapperCls mutation contract, which keeps drag zones compatible with functional components and test doubles.
     * @param {Neo.component.Base|Object} item
     * @param {Boolean}                   draggable
     * @protected
     */
    setItemDraggableCls(item, draggable) {
        if (typeof item.setWrapperClsContribution === 'function') {
            item.setWrapperClsContribution(this, draggable ? ['neo-draggable'] : [])
        } else {
            let current = normalizeClassNames(item.wrapperCls),
                state   = fallbackDraggableStates.get(item),
                wrapperCls;

            if (!state) {
                state = {aggregate: current, authored: current};
                fallbackDraggableStates.set(item, state)
            } else if (!Neo.isEqual(current, state.aggregate)) {
                state.authored = normalizeClassNames([
                    ...state.authored.filter(cls => current.includes(cls)),
                    ...current.filter(cls => cls !== 'neo-draggable')
                ])
            }

            wrapperCls = [...state.authored];
            draggable && NeoArray.add(wrapperCls, 'neo-draggable');

            state.aggregate = wrapperCls;
            item.wrapperCls = wrapperCls;

            if (!draggable) {
                fallbackDraggableStates.delete(item)
            }
        }
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
