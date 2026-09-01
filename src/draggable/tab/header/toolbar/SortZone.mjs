import BaseSortZone from '../../../container/SortZone.mjs';
import NeoArray     from '../../../../util/Array.mjs';

/**
 * @class Neo.draggable.tab.header.toolbar.SortZone
 * @extends Neo.draggable.container.SortZone
 */
class SortZone extends BaseSortZone {
    static config = {
        /**
         * @member {String} className='Neo.draggable.tab.header.toolbar.SortZone'
         * @protected
         */
        className: 'Neo.draggable.tab.header.toolbar.SortZone',
        /**
         * @member {String} ntype='tab-header-toolbar-sortzone'
         * @protected
         */
        ntype: 'tab-header-toolbar-sortzone',
        /**
         * @member {Object|null} dragProxyConfig
         */
        dragProxyConfig: {
            cls: ['neo-tab-header-toolbar', 'neo-toolbar']
        },
        /**
         * Every tab header already carries this root class. Spacer/action items therefore never
         * become draggable members or targets.
         * @member {String} dragHandleSelector='.neo-tab-header-button'
         */
        dragHandleSelector: '.neo-tab-header-button',
        /**
         * Keep the full toolbar box while sorting and use the rendered tab union for local moves.
         * @member {Boolean} useItemSortBoundary=true
         */
        useItemSortBoundary: true
    }

    /**
     * True while drag start excludes Overflow projection and prepares the stable item snapshot.
     * @member {Boolean} sortSnapshotPending=false
     * @protected
     */
    sortSnapshotPending = false
    /**
     * Invalidates a drag start still waiting for Overflow when its pointer terminal arrives.
     * @member {Number} sortGestureGeneration=0
     * @protected
     */
    sortGestureGeneration = 0

    /**
     * Uses the owner toolbar's exact semantic tab predicate, including its explicit action
     * exclusion, for initial marking, insertion, snapshots, targets, and traces.
     * @param {*} item
     * @returns {Boolean}
     */
    isDraggableItem(item) {
        return super.isDraggableItem(item) && this.owner?.isTabButton?.(item) === true
    }

    /**
     * Propagates the owning tab.Container's `ui`-derived class onto the drag proxy.
     *
     * The base returns `{...dragProxyConfig, cls: [...owner.cls]}` — `cls` lands AFTER the spread, so
     * the static `dragProxyConfig.cls` never reaches the proxy and the owner toolbar's own classes do.
     * That list cannot carry the variant: `component.Base#afterSetUi` emits `neo-<ntype>-<ui>` on the
     * CONTAINER, and the themes express the variant as a descendant rule on its direct-child toolbar.
     * The proxy is rooted at `document.body`, so it has no such ancestor and falls back to the theme's
     * `ui: null` density — a 32px header handing its button to a 48px proxy, which is the off-centre
     * label the defect reports.
     *
     * Carrying the class on the proxy only works because each theme also declares a SELF-scoped form of
     * the variant block; the descendant form alone would still not match. Both live in the same rule, so
     * there is one token source rather than a snapshot taken at drag start.
     * @returns {Object}
     */
    getDragProxyConfig() {
        const
            config    = super.getDragProxyConfig(),
            container = this.owner?.up?.('tab-container'),
            variant   = container?.ui && `neo-${container.ntype}-${container.ui}`;

        return variant && !config.cls.includes(variant)
            ? {...config, cls: [...config.cls, variant]}
            : config
    }

    /**
     * Override this method for class extensions (e.g. tab.header.Toolbar)
     * @param {Number} fromIndex
     * @param {Number} toIndex
     */
    moveTo(fromIndex, toIndex) {
        let owner      = this.owner,
            tabButtons = owner?.getTabButtons?.() || [],
            fromButton = owner?.items?.[fromIndex],
            toButton   = owner?.items?.[toIndex],
            fromTab    = tabButtons.indexOf(fromButton),
            toTab      = tabButtons.indexOf(toButton);

        // Optional-chained: a mid-gesture re-projection can detach or destroy the owner chain.
        fromTab > -1 && toTab > -1 && owner?.up?.()?.moveTo(fromTab, toTab)
    }

    /**
     * Completes a tab header drag under the base drag-end latch.
     * @param {Object} data
     */
    async processDragEnd(data) {
        const promise = super.processDragEnd(data);

        this.timeout(300).then(() => {
            let me      = this,
                {owner} = me,
                cls     = owner.cls || [];

            NeoArray.remove(cls, 'neo-no-animation');
            owner.cls = cls
        });

        await promise
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data) {
        let me      = this,
            {owner} = me,
            cls     = owner.cls || [],
            overflow,
            generation;

        if (!data.path?.some(node => node.cls?.includes('neo-tab-header-button'))) {
            return
        }

        NeoArray.add(cls, 'neo-no-animation');
        owner.cls = cls;

        overflow = owner.getPlugin?.('tab-overflow');
        generation = ++me.sortGestureGeneration;
        me.sortSnapshotPending = true;

        try {
            await overflow?.whenProjectionIdle?.();
            if (generation !== me.sortGestureGeneration || me.isDestroyed || owner.isDestroyed) {
                return
            }
            await super.onDragStart(data)
        } finally {
            me.sortSnapshotPending = false;
            !overflow?.isDestroyed && overflow?.onSortSnapshotReady?.()
        }
    }

    /**
     * Invalidates a start still waiting on the projection handshake before normal terminal cleanup.
     * @param {Object} data
     */
    async onDragEnd(data) {
        this.sortGestureGeneration++;
        await super.onDragEnd(data)
    }
}

export default Neo.setupClass(SortZone);
