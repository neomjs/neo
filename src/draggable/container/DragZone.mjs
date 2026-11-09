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
     * Chains the zone's drag starts and ends, so they run one at a time in the order they arrive
     * @member {Promise<void>} dragQueue
     * @protected
     */
    dragQueue = Promise.resolve()

    /**
     * True from {@link #startDrag} until its queued start has built the drag
     * @member {Boolean} dragStartPending=false
     * @protected
     */
    dragStartPending = false

    /**
     * The start {@link #startDrag} queued, until it settles
     * @member {Promise<void>|null} dragStarting=null
     * @protected
     */
    dragStarting = null

    /**
     * @summary Runs once a queued start has built its drag, before any end queued behind it.
     * @returns {Promise<void>|void}
     * @protected
     */
    afterDragStart() {}

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
            {'drag:start': me.startDrag,   ...opts}
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
            if (typeof item === 'string' || !item) {
                return;
            }

            wrapperCls = item.wrapperCls || [];

            NeoArray.toggle(wrapperCls, 'neo-draggable', draggable && me.isItemRootDragTarget(item));
            item.wrapperCls = wrapperCls;
        });
    }

    /**
     * Returns the owner items admitted to this drag zone.
     * @param {Object[]} [items=this.owner.items]
     * @returns {Neo.component.Base[]}
     */
    getDraggableItems(items=this.owner.items) {
        return (items || []).filter(item => this.isDraggableItem(item))
    }

    /**
     * The generic container contract admits every component item. Specialised drag zones override
     * this one predicate so initial marking and dynamic insertion cannot drift.
     * @param {*} item
     * @returns {Boolean}
     */
    isDraggableItem(item) {
        return Boolean(item) && typeof item !== 'string'
    }

    /**
     * @summary Decides whether the item's wrapper should be a native drag target.
     * Sortable membership can be broader than the region allowed to begin a gesture.
     * @param {*} item
     * @returns {Boolean}
     * @protected
     */
    isItemRootDragTarget(item) {
        return this.isDraggableItem(item)
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
     * @summary Queues a drag start or end behind every earlier one: a start never runs into the last drag's end, and an
     * end never tears down a start that is still building.
     * @param {Function} step
     * @returns {Promise<*>}
     * @protected
     */
    queueDragStep(step) {
        let me  = this,
            run = me.dragQueue.then(step);

        // A failed step must not stall the ones behind it
        me.dragQueue = run.catch(Neo.emptyFn);

        return run
    }

    /**
     * @summary The drag start entry. It queues {@link #onDragStart} with every override, and records that start until
     * it settles, so the drag's moves wait for it.
     * @param {Object}   data
     * @param {Function} [prepare] Sets the drag up once the zone is free, right before its start runs
     * @returns {Promise<void>}
     */
    async startDrag(data, prepare) {
        let me = this,
            start;

        me.dragStartPending = true;

        start = me.queueDragStep(async () => {
            prepare?.();

            try {
                await me.onDragStart(data)
            } finally {
                me.dragStartPending = false
            }

            await me.afterDragStart()
        });

        me.dragStarting = start;

        try {
            await start
        } finally {
            me.dragStarting === start && (me.dragStarting = null)
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
        let items = Array.isArray(data.item) ? data.item : [data.item];

        items.forEach(item => {
            if (!item || typeof item === 'string') {
                return
            }

            let wrapperCls = item.wrapperCls || [];

            NeoArray.toggle(wrapperCls, 'neo-draggable', this.isItemRootDragTarget(item));
            item.wrapperCls = wrapperCls
        })
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
