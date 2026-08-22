import AgentCard      from './card/Container.mjs';
import ComponentList  from '../../../../../src/list/Component.mjs';
import SelectionModel from './SelectionModel.mjs';

/**
 * The fleet roster as a real animated list — the store-driven replacement for the destroy/recreate
 * card rebuild: one {@link AgentOS.view.fleet.roster.card.Container AgentCard} INSTANCE per rendered
 * row, pooled by index and re-seated onto its record (the calendar component-list pattern), with
 * {@link Neo.list.plugin.Animate} owning the geometry — a sort MOVES the surviving instances
 * (translate transition), a filter fades rows out and in, and the fluid column count derives from
 * the list's own measured width (`minItemWidth`), never the viewport.
 *
 * The card anatomy, its controller and the `lifecycleIntent` seam are untouched: this list only
 * changes WHO renders the rows. Selection is a first-class contract here
 * ({@link AgentOS.view.fleet.roster.SelectionModel}) — the item itself is the target, and a
 * lifecycle-control click is carved out of the selection path by that model, so operating an agent
 * never re-targets the cockpit's selection-driven panes.
 *
 * @class AgentOS.view.fleet.roster.List
 * @extends Neo.list.Component
 */
class List extends ComponentList {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.roster.List'
         * @protected
         */
        className: 'AgentOS.view.fleet.roster.List',
        /**
         * @member {String} ntype='fm-fleet-roster-list'
         * @protected
         */
        ntype: 'fm-fleet-roster-list',
        /**
         * Keeps the shipped region cls: the skin's card-area anchors carry over to the list root.
         * @member {String[]} baseCls=['fm-fleet-cards','neo-list']
         */
        baseCls: ['fm-fleet-cards', 'neo-list'],
        /**
         * The plugin owns move/fade geometry; created via the sanctioned `animate` seam with
         * {@link #pluginAnimateConfig} below.
         * @member {Boolean} animate=true
         * @reactive
         */
        animate: true,
        /**
         * The roster Store is provider-owned (the cockpit's `stores.fleetRoster`) and seated by the
         * owning {@link AgentOS.view.fleet.roster.Container} — an injected store is never destroyed
         * by its renderer.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * The measured card anatomy constant (the uniform 126px row the shipped grid rendered) —
         * the fixed row height the plugin's translate geometry requires.
         * @member {Number} itemHeight=126
         * @reactive
         */
        itemHeight: 126,
        /**
         * Fluid columns from the LIST's own measured width (ADR 0029 own-width discipline: the
         * ladder measures this surface, never the viewport): the plugin derives the column count
         * from `minItemWidth` and writes the fluid per-item width back — one squeezed column on a
         * narrow dock slot, two at the shipped default, three on the wide fleet view.
         * @member {Object} pluginAnimateConfig={minItemWidth:410}
         */
        pluginAnimateConfig: {minItemWidth: 410},
        /**
         * Selection is the product contract (one selected resident drives detail + memories), with
         * the lifecycle-control carve-out.
         * @member {Neo.selection.ListModel} selectionModel=SelectionModel
         * @reactive
         */
        selectionModel: SelectionModel
    }

    /**
     * @summary One pooled AgentCard per rendered row (create on first use, re-seat via `record` on
     * reuse) — instance identity is what survives a sort, so the plugin can MOVE the same rendered
     * card instead of flashing a rebuilt one. The `lifecycleIntent` listener stays a string: it
     * resolves up the controller chain at fire time (card → roster controller → cockpit
     * controller), exactly like the shipped card config did.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]} The list item vdom children.
     */
    createItemContent(record, index) {
        let me    = this,
            items = me.items || [],
            card  = items[index],

        config = {
            id: me.getComponentId(index),
            record
        };

        if (card) {
            card.setSilent(config);
            // explicit: a record MUTATION re-enters here with the SAME record instance, which the
            // config equality gate would silently drop — applyRecord() is idempotent and renders
            // both the reseat and the mutation (the old grid called it per recordChange too)
            card.applyRecord()
        } else {
            items[index] = card = Neo.create({
                appName  : me.appName,
                module   : AgentCard,
                listeners: {lifecycleIntent: 'onAgentLifecycleIntent'},
                parentId : me.id,
                windowId : me.windowId,
                ...config
            })
        }

        me.items       = items;
        me.updateDepth = -1;

        return [card.createVdomReference()]
    }
}

export default Neo.setupClass(List);
