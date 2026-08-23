import AgentSessionSummaries from '../../../store/AgentSessionSummaries.mjs';
import AgentSessionTurns     from '../../../store/AgentSessionTurns.mjs';
import Button                from '../../../../../src/button/Base.mjs';
import Component             from '../../../../../src/component/Base.mjs';
import Container             from '../../../../../src/container/Base.mjs';
import ViewerTime            from '../../../util/ViewerTime.mjs';

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
 * @class AgentOS.view.fleet.memories.Container
 * @extends Neo.container.Base
 */
class MemoriesPane extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.memories.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.memories.Container',
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
         * Optional SHELL-supplied tool configs appended to the actions row. The pane stays
         * layout-blind: it places these controls beside its own verbs and never inspects what
         * they do — ownership, handlers and state sync remain with the supplying shell.
         * @member {Object[]|null} shellTools=null
         */
        shellTools: null,
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
         * The open drill-in target — `{sessionId, title}` while a summary card's session detail
         * is open, `null` for the summary-list view. Owner-passable, so a rematerialized pane
         * reopens exactly the depth the operator was reading.
         * @member {Object|null} drillSession_=null
         * @reactive
         */
        drillSession_: null,
        /**
         * Latest session-memories (drill-in) envelope. `null` is unobserved, never empty.
         * @member {Object|null} drillSnapshot_=null
         * @reactive
         */
        drillSnapshot_: null,
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
            ntype    : 'container',
            cls      : ['fm-memories-actions'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'memories-actions',
            items    : [{
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
    /** @member {AgentOS.store.AgentSessionTurns|null} turnStore=null */
    turnStore = null
    /**
     * The session whose turn rows the drill Store currently holds — the drill append guard,
     * the {@link #renderedTarget} twin one level down.
     * @member {String|null} renderedDrillSession=null
     */
    renderedDrillSession = null

    /**
     * @summary Create the pane-local Store and render held owner state. No read fires here:
     * choosing an agent is the explicit first act, so pane construction never queries the plane
     * on its own — a resident tab constructs at projection time, before any operator intent.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        // shell-supplied window verbs land beside the pane's own actions (layout-blind slot)
        this.shellTools?.length && this.getReference('memories-actions')?.add(this.shellTools);

        const me = this;

        me.summaryStore = Neo.create(AgentSessionSummaries);
        me.turnStore    = Neo.create(AgentSessionTurns);

        // Rematerialization coherence: a pane rebuilt from an owner-held snapshot must not render
        // cards for a target no selection points at — the selection is derived from the rendered
        // truth when the owner did not pass one explicitly.
        if (me.activeAgent === null && me.snapshot?.target) {
            me.activeAgent = me.snapshot.target
        }

        me.refreshAgents();
        me.applySnapshot();

        // Drill rematerialization: an owner-passed open drill reopens at the depth the operator
        // was reading; its snapshot re-projects through the same coherence gate as a live push.
        me.drillSession && me.applyDrillSnapshot()
    }

    /** @param {...*} args */
    destroy(...args) {
        this.summaryStore?.destroy();
        this.summaryStore = null;
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

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetDrillSession(value, oldValue) {
        this.isConstructed && this.applySnapshot()
    }

    /** @param {Object|null} value @param {Object|null} oldValue */
    afterSetDrillSnapshot(value, oldValue) {
        this.isConstructed && this.applyDrillSnapshot()
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
     * @summary Open one summary card's session detail: the drill-in switches the rows zone to the
     * session's turn-level records. The drill target is part of the rendered drill KEY — the old
     * session's rows and continuation affordance are invalidated IMMEDIATELY, so no stale depth
     * can anchor an offset request into the new session.
     * @param {Neo.data.Model} record The summary card's record — its `sessionId` is the pointer.
     */
    onCardOpen(record) {
        const
            me        = this,
            sessionId = typeof record?.sessionId === 'string' ? record.sessionId : null;

        if (!sessionId || me.drillSession?.sessionId === sessionId) return;

        me.turnStore?.clear();
        me.renderedDrillSession = null;
        me.drillSession         = {sessionId, title: record.title ?? null};
        me.fire('sessionDetailRequest', {sessionId, title: record.title ?? null})
    }

    /**
     * @summary Leave the drill-in and return to the summary list. The close is an INTENT like the
     * open: the owner clears its held drill state, so a later rematerialization reopens the list,
     * never a drill the operator already left.
     */
    onDrillBackClick() {
        const me = this;

        me.drillSession = null;
        me.turnStore?.clear();
        me.renderedDrillSession = null;
        me.fire('sessionDetailClosed', {});
        me.applySnapshot()
    }

    /**
     * @summary Page back through the session's turns by the drill Store's own rendered depth —
     * the summary twin's guard one level down: fires ONLY once the open session's page zero has
     * been accepted.
     */
    onDrillMoreClick() {
        const me = this,
              id = me.drillSession?.sessionId;

        if (!id || !me.turnStore || me.renderedDrillSession !== id || me.drillSnapshot?.sessionId !== id) {
            return
        }

        me.fire('sessionDetailRequest', {
            sessionId: id,
            title    : me.drillSession.title,
            offset   : me.turnStore.count
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
                        : `Memories unavailable · ${adopted.capability?.reason || 'unknown reason'}`;

            // T5 receipt; falsy removes, so the pending and unavailable branches — which render no
            // stamp — cannot leave a previous read's instant hovering behind their copy.
            metaEl.changeVdomRootKey('title', !pending && adopted && wired ? ViewerTime.viewerTimeTitle(adopted.capability.capturedAt) : null)
        }

        // the actions bar is summary-owned chrome: while the drill is open its affordances hide
        // (the drill region carries its own back / older-turns controls)
        refreshEl && (refreshEl.hidden = !me.activeAgent || Boolean(me.drillSession));
        moreEl    && (moreEl.hidden    = Boolean(me.drillSession) || !(wired && !pending && Number.isFinite(adopted.total) && me.summaryStore.count < adopted.total));

        me.renderRows(adopted, wired, pending)
    }

    /**
     * @summary Project the latest drill envelope into turn rows under the summary twin's
     * coherence contract, one level down: the open session is part of the rendered drill KEY. An
     * envelope whose `sessionId` mismatches the open drill is NOT adopted — a stale or late
     * foreign-session page can never resurrect old rows or re-enable continuation. Replace is the
     * default; append happens only for a same-session `page.offset > 0` continuation on an
     * already-accepted page zero.
     */
    applyDrillSnapshot() {
        const
            me       = this,
            open     = me.drillSession,
            snapshot = me.drillSnapshot;

        if (!me.turnStore || !open) return;

        const
            coherent = !snapshot || snapshot.sessionId === open.sessionId,
            adopted  = coherent ? snapshot : null,
            wired    = adopted?.capability?.state === 'wired',
            append   = wired && adopted.page?.offset > 0 && adopted.sessionId === me.renderedDrillSession;

        if (!append) {
            me.turnStore.clear()
        }

        if (wired) {
            const fresh = adopted.turns.filter(turn => turn?.id && !me.turnStore.get(turn.id));

            fresh.length > 0 && me.turnStore.add(fresh);
            me.renderedDrillSession = adopted.sessionId
        } else {
            me.renderedDrillSession = null
        }

        me.renderRows(me.snapshot, me.snapshot?.capability?.state === 'wired', false)
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

        // the drill-in owns the rows zone while a session is open — the summary states below
        // resume untouched when the operator comes back (their Store never left)
        if (this.drillSession) {
            this.renderDrillRows(target);
            return
        }

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
                // the card head: title + the provenance vocabulary + the drill affordance. The
                // affordance is a real BUTTON (keyboard-reachable), never a click region on the
                // whole card — the mailbox rows' a11y ruling, applied here from birth.
                module: Container,
                cls   : ['fm-memories-card-head'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module: Component,
                    cls   : ['fm-memories-card-title'],
                    flex  : 1,
                    text  : record.title ?? 'Title unavailable for this session.'
                }, {
                    module: Component,
                    cls   : ['fm-memories-provenance', 'is-derived'],
                    text  : 'derived'
                }, {
                    module : Button,
                    cls    : ['fm-memories-card-open'],
                    iconCls: 'fa fa-angles-right',
                    text   : 'Turns',
                    ui     : 'ghost',
                    handler: () => me.onCardOpen(record)
                }]
            }, {
                module: Component,
                cls   : ['fm-memories-card-meta'],
                text  : metaBits.join(' · '),
                // T5 receipt, config shape. A session summary's own timestamp is the field an agent
                // cites when pointing at a session, so losing its exact instant to a local-only
                // rendering would cost more here than on any other pane.
                ...(ViewerTime.viewerTimeTitle(record.timestamp) ? {vdom: {title: ViewerTime.viewerTimeTitle(record.timestamp)}} : {})
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
     * @summary Render the open session's turn rows (or the honest pending/empty/unavailable
     * state) into the rows zone — the drill-in view. The header carries the back affordance, the
     * session identity, and the provenance vocabulary: these rows are AUTHORED records (the
     * agent's own prompt/response trail), visually distinct from the DERIVED summaries one level
     * up. Absence renders as absence, exactly like the summary twin.
     * @param {Neo.container.Base} target The rows zone.
     */
    renderDrillRows(target) {
        const
            me       = this,
            open     = me.drillSession,
            snapshot = me.drillSnapshot,
            coherent = snapshot && snapshot.sessionId === open.sessionId ? snapshot : null,
            wired    = coherent?.capability?.state === 'wired',
            pending  = !coherent;

        target.add({
            module: Container,
            cls   : ['fm-memories-drill-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module : Button,
                cls    : ['fm-memories-drill-back'],
                iconCls: 'fa fa-arrow-left',
                text   : 'Summaries',
                ui     : 'ghost',
                handler: 'up.onDrillBackClick'
            }, {
                module: Component,
                cls   : ['fm-memories-drill-title'],
                flex  : 1,
                text  : open.title ?? `session ${open.sessionId.slice(0, 8)}`
            }, {
                module: Component,
                cls   : ['fm-memories-provenance', 'is-authored'],
                text  : 'authored records'
            }]
        });

        if (pending) {
            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : 'Reading this session’s turns. Nothing here claims to be its history yet.'
            });
            return
        }

        if (!wired) {
            const detail = coherent.capability?.detail;

            target.add({
                module: Component,
                cls   : ['fm-memories-empty'],
                text  : `The session-memories source did not answer${detail ? ` · ${detail}` : ''}. Nothing here claims to be history.`
            });
            return
        }

        if (me.turnStore.count === 0) {
            target.add({module: Component, cls: ['fm-memories-empty'], text: 'No turn records in this session.'});
            return
        }

        target.add(me.turnStore.items.map(record => me.turnRowConfig(record)));

        if (Number.isFinite(coherent.total) && me.turnStore.count < coherent.total) {
            target.add({
                module : Button,
                cls    : ['fm-memories-drill-more'],
                flex   : 'none',
                iconCls: 'fa fa-angles-down',
                text   : 'Older turns',
                ui     : 'ghost',
                handler: 'up.onDrillMoreClick'
            })
        }
    }

    /**
     * @summary Build one turn row from a drill Store record. The response is the row's primary
     * prose, the prompt its secondary context — both render-bounded (the wire returns the
     * authored records untruncated; the BOUND is presentation, and it says so with an ellipsis).
     * Guarded-null fields are named rather than silently coerced.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    turnRowConfig(record) {
        const
            me       = this,
            metaBits = [
                me.formatStamp(record.timestamp),
                record.agentIdentity || null,
                Number.isFinite(record.amountToolCalls) ? `${record.amountToolCalls} tool calls` : null
            ].filter(Boolean),
            items    = [{
                module: Component,
                cls   : ['fm-memories-turn-meta'],
                text  : metaBits.join(' · '),
                ...(ViewerTime.viewerTimeTitle(record.timestamp) ? {vdom: {title: ViewerTime.viewerTimeTitle(record.timestamp)}} : {})
            }, {
                module: Component,
                cls   : ['fm-memories-turn-response'],
                text  : me.boundProse(record.response) ?? 'Response unavailable for this turn.'
            }];

        const prompt = me.boundProse(record.prompt, 240);

        if (prompt) {
            items.push({
                module: Component,
                cls   : ['fm-memories-turn-prompt'],
                text  : `prompt · ${prompt}`
            })
        }

        return {
            module: Container,
            cls   : ['fm-memories-turn'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items
        }
    }

    /**
     * @summary Presentation bound for authored prose: whitespace-collapsed and ellipsis-cut. The
     * record keeps the full text — this bounds the ROW, never the data.
     * @param {String|null} value
     * @param {Number} max=600
     * @returns {String|null}
     */
    boundProse(value, max = 600) {
        if (typeof value !== 'string') return null;

        const text = value.replace(/\s+/g, ' ').trim();

        return text ? (text.length > max ? `${text.slice(0, max)}…` : text) : null
    }

    /**
     * @summary Viewer-local stamp via the shared cockpit formatter — see `ViewerTime.mjs` for why
     * format is single-sourced while this pane keeps its own "unknown time" miss-copy.
     * @param {Date|String|Number|null} value
     * @returns {String}
     */
    formatStamp(value) {
        return ViewerTime.formatViewerTime(value)?.text ?? 'unknown time'
    }
}

export default Neo.setupClass(MemoriesPane);
