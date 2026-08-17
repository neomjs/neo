import AgentSessionSummaries from '../../store/AgentSessionSummaries.mjs';
import Button                from '../../../../src/button/Base.mjs';
import Component             from '../../../../src/component/Base.mjs';
import Container             from '../../../../src/container/Base.mjs';
import {formatViewerTime}    from './viewerTime.mjs';

/**
 * The invoked Fleet memories surface: what one agent has been doing, session by session.
 *
 * @summary Renders one viewer-bound `fleetMemories` source envelope of session summaries without
 * synthesizing, ranking, merging, or caching it. The pane owns only a local projection Store of
 * summary cards; it fires intent events for reads and the owning FleetCockpit holds the
 * authenticated bridge. Choosing whose memories to read is an explicit act — the pane never
 * auto-defaults to a roster agent.
 *
 * Honest states are first-class: no-selection, unavailable (with the source's reason), a
 * genuinely-empty corpus (`total: 0`), per-card guarded non-string titles/summaries, multi-agent
 * session attribution, and offset paging against the corpus `total` all render explicitly.
 * Appending happens only when the envelope's own `page.offset` echo proves a continuation of the
 * same target; any fresh read replaces the cards.
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
                text : 'session summaries · query-time · not authority'
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
                text     : 'Older sessions',
                iconCls  : 'fa fa-angles-down',
                ui       : 'ghost',
                hidden   : true,
                handler  : 'up.onLoadMoreClick'
            }]
        }]
    }

    /** @member {AgentOS.store.AgentSessionSummaries|null} summaryStore=null */
    summaryStore = null
    /**
     * The target whose cards the Store currently holds — the append guard: a `page.offset > 0`
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

        const me = this;

        me.summaryStore = Neo.create(AgentSessionSummaries);

        // Rematerialization coherence: a pane rebuilt from an owner-held snapshot must not render
        // cards for a target no selection points at — the selection is derived from the rendered
        // truth when the owner did not pass one explicitly.
        if (me.activeAgent === null && me.snapshot?.target) {
            me.activeAgent = me.snapshot.target
        }

        me.refreshAgents();
        me.applySnapshot()
    }

    /** @param {...*} args */
    destroy(...args) {
        this.summaryStore?.destroy();
        this.summaryStore = null;
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

    /**
     * @summary Switch the selected target. The selected target is part of the rendered snapshot
     * KEY, not merely a request parameter: the old target's cards and continuation affordance are
     * invalidated IMMEDIATELY (switch-pending state), so no stale store depth can anchor an
     * offset request and no old-target action survives into the new selection.
     * @param {String} agentIdentity
     */
    onAgentClick(agentIdentity) {
        const me = this;

        if (agentIdentity === me.activeAgent) return;

        me.activeAgent = agentIdentity;
        me.summaryStore?.clear();
        me.renderedTarget = null;
        me.applySnapshot();
        me.fire('memoriesRequest', {agentIdentity})
    }

    /** @summary Re-read the newest page for the selected agent. */
    onRefreshClick() {
        this.activeAgent && this.fire('memoriesRequest', {agentIdentity: this.activeAgent})
    }

    /**
     * @summary Page back through the corpus by the Store's own rendered depth. Guarded by the
     * coherence contract: fires ONLY once the selected target's page zero has been accepted
     * (rendered truth === selection), so an offset page can never precede or supersede it.
     */
    onLoadMoreClick() {
        const me = this;

        if (!me.activeAgent || !me.summaryStore || me.renderedTarget !== me.activeAgent ||
            me.snapshot?.target !== me.activeAgent) {
            return
        }

        me.fire('memoriesRequest', {
            agentIdentity: me.activeAgent,
            offset       : me.summaryStore.count
        })
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
     * @summary Project the latest envelope into Store cards and honest chrome under the coherence
     * contract: the selected target is part of the rendered snapshot KEY. An envelope whose target
     * mismatches a non-null selection is NOT adopted — the pane renders the switch-pending state
     * instead, so a stale or late foreign-target page can never resurrect old cards or re-enable
     * continuation. Replace is the default; append happens only for a same-target
     * `page.offset > 0` continuation on an already-accepted page zero.
     */
    applySnapshot() {
        const
            me        = this,
            snapshot  = me.snapshot,
            metaEl    = me.getReference('memories-meta'),
            moreEl    = me.getReference('memories-more'),
            refreshEl = me.getReference('memories-refresh'),
            coherent  = !snapshot || !me.activeAgent || snapshot.target === me.activeAgent,
            adopted   = coherent ? snapshot : null,
            wired     = adopted?.capability?.state === 'wired',
            pending   = me.activeAgent && (!adopted || adopted.target !== me.activeAgent);

        if (!me.summaryStore) return;

        const append = wired && adopted.page?.offset > 0 && adopted.target === me.renderedTarget;

        if (!append) {
            me.summaryStore.clear()
        }

        if (wired) {
            const fresh = adopted.sessions.filter(session => session?.id && !me.summaryStore.get(session.id));

            fresh.length > 0 && me.summaryStore.add(fresh);
            me.renderedTarget = adopted.target
        } else {
            me.renderedTarget = null
        }

        if (metaEl) {
            metaEl.text = pending
                ? `Reading ${me.activeAgent}…`
                : !adopted
                    ? 'Pick an agent to read their recent sessions.'
                    : wired
                        ? `${adopted.target} · ${me.summaryStore.count} of ${adopted.total ?? '?'} sessions · captured ${me.formatStamp(adopted.capability.capturedAt)}`
                        : `Memories unavailable · ${adopted.capability?.reason || 'unknown reason'}`
        }

        refreshEl && (refreshEl.hidden = !me.activeAgent);
        moreEl    && (moreEl.hidden    = !(wired && !pending && Number.isFinite(adopted.total) && me.summaryStore.count < adopted.total));

        me.renderRows(adopted, wired, pending)
    }

    /**
     * @summary Render the Store's cards (or the honest pending/empty/unavailable state) into the
     * rows zone. `snapshot` here is the ADOPTED envelope — a coherence-rejected one arrives as
     * null with `pending` set.
     * @param {Object|null} snapshot
     * @param {Boolean} wired
     * @param {Boolean} pending
     */
    renderRows(snapshot, wired, pending) {
        const target = this.getReference('memories-rows');

        if (!target) return;

        target.removeAll(true);

        if (pending) {
            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : 'Waiting for this agent’s first page. Nothing here claims to be their history yet.'
            });
            return
        }

        if (!snapshot) {
            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : 'Session summaries render here once an agent is chosen.'
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

        if (this.summaryStore.count === 0) {
            target.add({module: Component, cls: ['fm-memories-empty'], text: 'No sessions in this corpus.'});
            return
        }

        target.add(this.summaryStore.items.map(record => this.summaryCardConfig(record)))
    }

    /**
     * @summary Build one session card from a Store record. Title and summary render as returned;
     * guarded-null values are named rather than silently coerced, and sessions carrying co-author
     * identities beyond the selected target show their attribution explicitly.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    summaryCardConfig(record) {
        const
            me       = this,
            session  = typeof record.sessionId === 'string' && record.sessionId ? record.sessionId.slice(0, 8) : 'unknown',
            metaBits = [
                me.formatStamp(record.timestamp),
                `session ${session}`,
                record.category || null,
                Number.isFinite(record.memoryCount) ? `${record.memoryCount} memories` : null,
                Number.isFinite(record.quality) ? `quality ${record.quality}` : null
            ].filter(Boolean),
            coAuthors = (record.sourceAgentIdentities || []).filter(identity => identity !== me.renderedTarget),
            items     = [{
                module: Component,
                cls   : ['fm-memories-card-title'],
                text  : record.title ?? 'Title unavailable for this session.'
            }, {
                module: Component,
                cls   : ['fm-memories-card-meta'],
                text  : metaBits.join(' · ')
            }];

        if (coAuthors.length > 0) {
            items.push({
                module: Component,
                cls   : ['fm-memories-card-attribution'],
                text  : `with ${coAuthors.join(', ')}`
            })
        }

        items.push({
            module: Component,
            cls   : ['fm-memories-card-body'],
            text  : record.summary ?? 'Summary unavailable for this session.'
        });

        return {
            module: Container,
            cls   : ['fm-memories-card'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items
        }
    }

    /**
     * @summary Viewer-local stamp via the shared cockpit formatter — see `viewerTime.mjs` for why
     * format is single-sourced while this pane keeps its own "unknown time" miss-copy.
     * @param {Date|String|Number|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return formatViewerTime(value)?.text ?? 'unknown time'
    }
}

export default Neo.setupClass(MemoriesPane);
