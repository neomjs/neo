import AgentMemories from '../../store/AgentMemories.mjs';
import Button        from '../../../../src/button/Base.mjs';
import Component     from '../../../../src/component/Base.mjs';
import Container     from '../../../../src/container/Base.mjs';

/**
 * The invoked Fleet memories surface: what one agent remembers, turn by turn.
 *
 * @summary Renders one viewer-bound `fleetMemories` source envelope without synthesizing, ranking,
 * merging, or caching it. The pane owns only a local projection Store of turn rows; it fires
 * intent events for reads and the owning FleetCockpit holds the authenticated bridge. Choosing
 * whose memories to read is an explicit act — the pane never auto-defaults to a roster agent, and
 * the projection (private only for self) is derived server-side, never chosen here.
 *
 * Honest states are first-class: no-selection, unavailable (with the source's reason), an empty
 * wired window, per-row fallback summaries, and the paging cursor all render explicitly. Appending
 * happens only when the envelope's own `page.before` echo proves a continuation of the same
 * target; any fresh read replaces the rows.
 *
 * @class AgentOS.view.fleet.MemoriesPane
 * @extends Neo.container.Base
 */
class MemoriesPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.MemoriesPane'
         * @protected
         */
        className: 'AgentOS.view.fleet.MemoriesPane',
        /**
         * @member {String} ntype='fm-memories-pane'
         * @protected
         */
        ntype: 'fm-memories-pane',
        /**
         * @member {String[]} baseCls=['fm-memories-pane']
         */
        baseCls: ['fm-memories-pane'],
        /**
         * Selected target agent as canonical `@identity`, or null for the explicit
         * "pick an agent" state.
         * @member {String|null} activeAgent_=null
         * @reactive
         */
        activeAgent_: null,
        /**
         * Agent choices supplied by the cockpit from its provider-owned roster.
         * @member {Object[]} agentOptions_=[]
         * @reactive
         */
        agentOptions_: [],
        /**
         * Latest memories envelope. `null` is unobserved, never empty.
         * @member {Object|null} snapshot_=null
         * @reactive
         */
        snapshot_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype : 'container',
            cls   : ['fm-memories-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['fm-memories-title'],
                flex : 1,
                text : 'What they remember'
            }, {
                ntype: 'component',
                cls  : ['fm-memories-authority'],
                text : 'query-time · not authority'
            }]
        }, {
            ntype    : 'container',
            cls      : ['fm-memories-agents'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            reference: 'memories-agents'
        }, {
            ntype    : 'component',
            cls      : ['fm-memories-meta'],
            flex     : 'none',
            reference: 'memories-meta',
            text     : 'Memories not observed yet'
        }, {
            ntype    : 'container',
            cls      : ['fm-memories-rows'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'memories-rows'
        }, {
            ntype : 'container',
            cls   : ['fm-memories-actions'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                flex : 1
            }, {
                module   : Button,
                reference: 'memories-refresh',
                text     : 'Refresh',
                iconCls  : 'fa fa-rotate',
                ui       : 'ghost',
                hidden   : true,
                handler  : 'up.onRefreshClick'
            }, {
                module   : Button,
                reference: 'memories-more',
                text     : 'Older turns',
                iconCls  : 'fa fa-angles-down',
                ui       : 'ghost',
                hidden   : true,
                handler  : 'up.onLoadMoreClick'
            }]
        }]
    }

    /** @member {AgentOS.store.AgentMemories|null} turnStore=null */
    turnStore = null
    /**
     * The target whose rows the Store currently holds — the append guard: a `page.before`
     * continuation appends only when the envelope's target matches this.
     * @member {String|null} renderedTarget=null
     */
    renderedTarget = null

    /**
     * @summary Create the pane-local Store and render held owner state. No read fires here:
     * choosing an agent is the explicit first act, so an auto-hidden pane construction never
     * queries the plane on its own.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        this.turnStore = Neo.create(AgentMemories);
        this.refreshAgents();
        this.applySnapshot()
    }

    /** @param {...*} args */
    destroy(...args) {
        this.turnStore?.destroy();
        this.turnStore = null;
        super.destroy(...args)
    }

    /** @param {String|null} value @param {String|null} oldValue @returns {String|null} */
    beforeSetActiveAgent(value, oldValue) {
        return value === null || /^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : oldValue ?? null
    }

    /** @param {String|null} value @param {String|null} oldValue */
    afterSetActiveAgent(value, oldValue) {
        this.isConstructed && this.refreshAgents()
    }

    /** @param {Object[]} value @param {Object[]} oldValue */
    afterSetAgentOptions(value, oldValue) {
        this.isConstructed && this.refreshAgents()
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetSnapshot(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /** @param {String} agentIdentity */
    onAgentClick(agentIdentity) {
        if (agentIdentity === this.activeAgent) return;

        this.activeAgent = agentIdentity;
        this.fire('memoriesRequest', {agentIdentity})
    }

    /** @summary Re-read the newest page for the selected agent. */
    onRefreshClick() {
        this.activeAgent && this.fire('memoriesRequest', {agentIdentity: this.activeAgent})
    }

    /** @summary Page back through the envelope's own cursor. */
    onLoadMoreClick() {
        const cursor = this.snapshot?.nextCursor;

        this.activeAgent && cursor && this.fire('memoriesRequest', {agentIdentity: this.activeAgent, before: cursor})
    }

    /**
     * @summary Rebuild the agent chips from the roster-supplied options in source order.
     */
    refreshAgents() {
        const target = this.getReference('memories-agents');

        if (!target) return;

        const options = (this.agentOptions || [])
            .filter((option, index, all) => option?.agentIdentity && all.findIndex(item => item.agentIdentity === option.agentIdentity) === index);

        target.removeAll(true);
        target.add(options.map(option => ({
            module : Button,
            cls    : option.agentIdentity === this.activeAgent ? ['fm-memories-agent', 'is-active'] : ['fm-memories-agent'],
            text   : option.label || option.agentIdentity,
            ui     : 'ghost',
            handler: () => this.onAgentClick(option.agentIdentity)
        })))
    }

    /**
     * @summary Project the latest envelope into Store rows and honest chrome. Replace is the
     * default; append happens only for a same-target `page.before` continuation.
     */
    applySnapshot() {
        const
            me        = this,
            snapshot  = me.snapshot,
            metaEl    = me.getReference('memories-meta'),
            moreEl    = me.getReference('memories-more'),
            refreshEl = me.getReference('memories-refresh'),
            wired     = snapshot?.capability?.state === 'wired';

        if (metaEl) {
            metaEl.text = !snapshot
                ? (me.activeAgent ? 'Memories not observed yet' : 'Pick an agent to read their recent turns.')
                : wired
                    ? `${snapshot.target} · ${snapshot.projection} projection · captured ${me.formatStamp(snapshot.capability.capturedAt)}`
                    : `Memories unavailable · ${snapshot.capability?.reason || 'unknown reason'}`
        }

        refreshEl && (refreshEl.hidden = !me.activeAgent);
        moreEl    && (moreEl.hidden    = !(wired && snapshot.nextCursor));

        if (!me.turnStore) return;

        const append = wired && snapshot.page?.before && snapshot.target === me.renderedTarget;

        if (!append) {
            me.turnStore.clear()
        }

        if (wired) {
            const fresh = snapshot.turns.filter(turn => turn?.id && !me.turnStore.get(turn.id));

            fresh.length > 0 && me.turnStore.add(fresh);
            me.renderedTarget = snapshot.target
        } else {
            me.renderedTarget = null
        }

        me.renderRows(snapshot, wired)
    }

    /**
     * @summary Render the Store's rows (or the honest empty/unavailable state) into the rows zone.
     * @param {Object|null} snapshot
     * @param {Boolean} wired
     */
    renderRows(snapshot, wired) {
        const target = this.getReference('memories-rows');

        if (!target) return;

        target.removeAll(true);

        if (!snapshot) {
            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : this.activeAgent ? 'No read has been made yet.' : 'Memories render here once an agent is chosen.'
            });
            return
        }

        if (!wired) {
            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : 'The memories source did not answer. Nothing here claims to be history.'
            });
            return
        }

        if (this.turnStore.count === 0) {
            target.add({module: Component, cls: ['fm-memories-empty'], text: 'No turn memories in this window.'});
            return
        }

        target.add(this.turnStore.items.map(record => this.turnRowConfig(record)))
    }

    /**
     * @summary Build one turn row from a Store record. The summary text renders as returned; a
     * guarded-null summary and a fallback summary are both named rather than silently coerced.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    turnRowConfig(record) {
        const session = typeof record.sessionId === 'string' && record.sessionId ? record.sessionId.slice(0, 8) : 'unknown';

        return {
            module: Container,
            cls   : ['fm-memories-turn'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Component,
                cls   : ['fm-memories-turn-meta'],
                text  : `${this.formatStamp(record.timestamp)} · session ${session}${record.summaryFallback ? ' · fallback summary' : ''}`
            }, {
                module: Component,
                cls   : ['fm-memories-turn-body'],
                text  : record.summary ?? 'Summary unavailable for this turn.'
            }]
        }
    }

    /** @param {Date|String|Number|null} value @returns {String} */
    formatStamp(value) {
        const date = new Date(value);

        return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').slice(0, 16) + 'Z' : 'unknown time'
    }
}

export default Neo.setupClass(MemoriesPane);
