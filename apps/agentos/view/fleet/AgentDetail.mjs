import AgentConfigCard                                   from './AgentConfigCard.mjs';
import Container                                         from '../../../../src/container/Base.mjs';
import FamilyRail                                        from './FamilyRail.mjs';
import Image                                             from '../../../../src/component/Image.mjs';
import MailboxPane                                       from './MailboxPane.mjs';
import StateDot                                          from './StateDot.mjs';
import TabContainer                                      from '../../../../src/tab/Container.mjs';
import {runConfigIntentRoundTrip}                        from './configIntentRoundTrip.mjs';
import {describeTelltaleReadout}                         from './telltale.mjs';
import {classifyPaneFreshness, describePaneFreshness}    from './agentFreshness.mjs';
import {normalizeFleetSources, resolveFleetDisplayState} from './sourceHealth.mjs';

/**
 * The SSOT drill-in panes (design §B3: "thought-stream, lane, repo, and PRs"), each with the honest
 * live cadence its freshness is judged against. `freshnessTtl` is the default window a pane's ledger
 * may override once its feed stamps one; the values are tunable, not contractual.
 * @type {Object[]}
 */
const PANES = [
    {key: 'thought-stream', title: 'Thought stream', freshnessTtl: 60_000},
    {key: 'lane',           title: 'Current lane',   freshnessTtl: 300_000},
    {key: 'repo',           title: 'Repository',     freshnessTtl: 300_000},
    {key: 'prs',            title: 'Pull requests',  freshnessTtl: 300_000}
];

/**
 * @summary One pane's config: a header (title + referenced freshness chip) over a referenced body.
 * Built from the {@link PANES} descriptor so the reference ids derive from the pane key.
 * @param {Object} pane A {@link PANES} entry.
 * @returns {Object}
 * @private
 */
const paneConfig = pane => ({
    ntype : 'container',
    cls   : ['fm-detail-pane', `fm-detail-pane-${pane.key}`],
    flex  : 'none',
    layout: {ntype: 'vbox', align: 'stretch'},

    items: [{
        ntype: 'container',
        cls  : ['fm-detail-pane-head'],
        // The vbox stretch default otherwise gives this head `flex: 1 1 0%`, pinning its height
        // below wrapped title/provenance content. The body owns the remaining vertical space.
        flex  : 'none',
        layout: {ntype: 'hbox', align: 'center'},

        items: [{
            ntype: 'component',
            cls  : ['fm-detail-pane-title'],
            flex : 1,
            html : pane.title
        }, {
            ntype    : 'component',
            flex     : 'none',
            reference: `pane-${pane.key}-freshness`
        }]
    }, {
        ntype    : 'component',
        cls      : ['fm-detail-pane-body'],
        reference: `pane-${pane.key}-body`
    }]
});

/**
 * The cockpit drill-in surface: one resident's detail — the identity header over the four SSOT
 * panes (thought-stream · current lane · repository · pull requests). Mounted as the dock
 * document's auto-hidden `agent-detail` inspector; the card→detail selection feeds its `record`.
 *
 * **Data-driven from its `record`** — one {@link AgentOS.model.FleetAgent} record (or a plain
 * field-bag of the same keys), exactly like {@link AgentOS.view.fleet.AgentCard}. There is no
 * per-view `state.Provider`; the owning cockpit's roster Store is the reactive layer, and a
 * re-seat onto a different record re-renders in place via {@link #applyRecord}.
 *
 * **Identity-header render rules:** the social **displayName** and **engineTag**
 * are mutable DISPLAY STATE / session-metadata over the durable `agentId` (§2.3.2/§2.3.3) — the id
 * is rendered too, subordinate, as the never-renamed anchor; a family swap rebinds the rail in
 * place and never reads as a different resident. **No role-typing anywhere** (§2.3.1) — the header
 * renders what the resident IS and is DOING (identity + availability + session state), never what
 * it must be. Every claim is witness, not authority (§2.4).
 *
 * **Freshness ledger (the panes):** every pane renders its observation freshness —
 * `fresh` / `stale` / `lost` from a wired feed's `observedAt` vs TTL, or the honest `unobserved`
 * until its Lane-C / memory-surface feed leaf lands. A pane NEVER renders a claim as silently
 * current: an unwired pane says so. The pure classification is
 * {@link module:apps/agentos/view/fleet/agentFreshness}; this view is its first consumer.
 *
 * **Shell-agnostic + layout-blind:** the view takes ordinary configs only — no
 * dock/layout/Electron coupling reaches it — so the pop-out leaf (T4.15) reparents it into its own
 * OS window without change.
 *
 * @class AgentOS.view.fleet.AgentDetail
 * @extends Neo.container.Base
 */
class AgentDetail extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.AgentDetail'
         * @protected
         */
        className: 'AgentOS.view.fleet.AgentDetail',
        /**
         * @member {String} ntype='fm-agent-detail'
         * @protected
         */
        ntype: 'fm-agent-detail',
        /**
         * @member {String[]} baseCls=['fm-agent-detail']
         */
        baseCls: ['fm-agent-detail'],
        /**
         * Optional SHELL-supplied tool configs appended to the identity header. The pane stays
         * layout-blind: it places these controls at its header's trailing edge and never inspects
         * what they do — ownership, handlers and state sync remain with the supplying shell.
         * @member {Object[]|null} shellTools=null
         */
        shellTools: null,
        /**
         * The provider-hosted `AgentDefinitions` Store, resolved via the standard bind (the same
         * instance Accounts writes into) — the configuration tab's data surface. The JOIN is the
         * Fleet Registry key: `FleetAgent.agentId` IS the roster row's `id`, which IS
         * `AgentDefinition.id`. `null` (no store seated, e.g. a bare unit mount) renders the
         * tab's honest no-definition state — never a fabricated config. The bind lives in the
         * COMPOSITION (the cockpit's resolver), not here — this view stays provider-agnostic, so
         * bare mounts and vessel reparents never require a provider chain.
         * @member {Neo.data.Store|null} agentDefinitions_=null
         * @reactive
         */
        agentDefinitions_: null,
        /**
         * The provider-hosted public tenant Store, seated by FleetCockpit composition alongside the
         * definitions Store. The configuration card owns its Store listeners; this view only keeps
         * the exact shared instance stable across dock and vessel reparents.
         * @member {Neo.data.Store|null} fleetTenants_=null
         * @reactive
         */
        fleetTenants_: null,
        /**
         * The drilled-in resident: an {@link AgentOS.model.FleetAgent} record (store-backed, live)
         * or a plain field bag with the same keys. `null` renders the honest "no agent selected"
         * empty state — never a blank inspector masquerading as a loaded one.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * Per-pane freshness ledgers keyed by pane `key` — `{observedAt, freshnessTtl, lost}` the
         * Lane-C / memory-surface feed leaves stamp as they land. `null` (today's reality) → every
         * pane degrades to the honest `unobserved`; the view sharpens to timestamped freshness with
         * no change the moment a feed wires a ledger.
         * @member {Object|null} paneLedgers_=null
         * @reactive
         */
        paneLedgers_: null,
        /**
         * Injected wall-clock (ms) for freshness classification; `null` → the live `Date.now()`.
         * Tests pin it so the freshness contract renders deterministically.
         * @member {Number|null} now_=null
         * @reactive
         */
        now_: null,
        /**
         * How often (ms) the freshness labels re-age off the wall clock while a record is shown —
         * a `fresh` pane must decay to `stale` / `lost` over time even with no new data. Tunable.
         * @member {Number} freshnessRefreshMs=30000
         */
        freshnessRefreshMs: 30000,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The empty state, the identity header, and the four SSOT panes (built from {@link PANES}).
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'component',
            cls      : ['fm-detail-empty'],
            html     : 'Select an agent to inspect',
            reference: 'detail-empty'
        }, {
            ntype    : 'container',
            cls      : ['fm-detail-header'],
            flex     : 'none',
            hidden   : true,
            reference: 'detail-header',
            layout   : {ntype: 'hbox', align: 'stretch'},

            items: [{
                module   : FamilyRail,
                flex     : 'none',
                reference: 'family-rail'
            }, {
                module   : Image,
                cls      : ['fm-detail-avatar'],
                flex     : 'none',
                reference: 'detail-avatar'
            }, {
                ntype : 'container',
                cls   : ['fm-detail-identity'],
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},

                items: [{
                    ntype : 'container',
                    cls   : ['fm-detail-name-row'],
                    layout: {ntype: 'hbox', align: 'center'},

                    items: [{
                        module   : StateDot,
                        flex     : 'none',
                        reference: 'state-dot'
                    }, {
                        ntype    : 'component',
                        cls      : ['fm-detail-name'],
                        flex     : 1,
                        reference: 'detail-name'
                    }, {
                        // engine is session-metadata, not identity — rendered
                        // subordinate to the name, never as a role
                        ntype    : 'component',
                        cls      : ['fm-detail-engine'],
                        flex     : 'none',
                        reference: 'detail-engine'
                    }]
                }, {
                    // the durable anchor, rendered small beneath the display name — name is display
                    // state OVER this id (§2.3.2), so the id is always reachable, never the label
                    ntype    : 'component',
                    cls      : ['fm-detail-id'],
                    reference: 'detail-id'
                }, {
                    // availability (participationStatus), not a role — honest status word or nothing
                    ntype    : 'component',
                    cls      : ['fm-detail-participation'],
                    reference: 'detail-participation'
                }, {
                    // The FULL two-axis telltale readout. The card is exception-based — nominal earns
                    // zero pixels there, because 20 cards cannot spend a line each on "fine". This is
                    // ONE resident, so both axes state themselves unconditionally: an operator who
                    // drilled in cannot otherwise tell "wake is on" from "nobody looked at wake".
                    // Lives in the identity block rather than a fifth pane — the four SSOT panes are
                    // content surfaces with freshness TTLs, and this is resident state.
                    ntype    : 'component',
                    cls      : ['fm-detail-telltale'],
                    reference: 'detail-telltale'
                }, {
                    // The full three-source provenance readout — the drill-in counterpart to the card's
                    // ONE honest word-line. The card names only the abnormal source(s) (20 compact cards
                    // cannot each spend three lines on provenance); the resident detail states all three
                    // unconditionally, each with the producer that reported it — the evidence the summary
                    // had no room for. Reads the SAME normalizeFleetSources output as the card's strip, so
                    // detail and card can never disagree about a source's health. Sibling to the telltale
                    // by design: both are resident identity state, not freshness-gated pane content.
                    ntype    : 'component',
                    cls      : ['fm-detail-sources'],
                    reference: 'detail-sources'
                }]
            }]
        }, {
            // object permanence: the mailbox belongs to the agent object, so it rides the detail
            // as a TAB beside the status panes — the a11y region + identity header stay above
            module     : TabContainer,
            cls        : ['fm-detail-tabs'],
            flex       : 1,
            hidden     : true,
            reference  : 'detail-tabs',
            activeIndex: 0,

            items: [{
                ntype    : 'container',
                cls      : ['fm-detail-panes'],
                header   : {text: 'Status'},
                reference: 'detail-panes',
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : PANES.map(paneConfig)
            }, {
                // the tab title stays COUNTLESS by design: an unread badge would imply
                // operator-side read tracking that deliberately does not exist
                module   : MailboxPane,
                header   : {text: 'Mailbox'},
                reference: 'mailbox-pane'
            }, {
                // object permanence (the S5 fork-1 ruling): per-agent CONFIGURATION belongs to the
                // agent object, so it rides the detail as a tab — the mailbox precedent applied to
                // the config card. The card fires `configIntent`; THIS view owns the bridge
                // round-trip through the shared runner (which arbitrates supersession per shared
                // record, across every owner), with the card as this owner's status sink.
                module   : AgentConfigCard,
                emptyText: 'This agent has no stored definition yet — add it via the rail\'s Add agent zone.',
                header   : {text: 'Configuration'},
                reference: 'config-pane'
            }]
        }]
    }

    /**
     * @summary Populate the header + panes once the anatomy exists (content is record-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        // a11y: the agent-detail drill is a named landmark region so screen-reader users land in a
        // labeled region on drill-in, not an unnamed pane. Set on the root before applyRecord's first
        // render flush; a later re-seat (applyRecord) keeps the root, so the region survives.
        Object.assign(this.vdom, {role: 'region', 'aria-label': 'Agent detail'});

        // shell-supplied window verbs land at the identity header's trailing edge (layout-blind slot)
        this.shellTools?.length && this.getReference('detail-header')?.add(this.shellTools);
        // the pane renders and never fetches: it fires the page intent, this view (which holds the
        // read seam and the subject) performs the bounded re-read. Wired explicitly rather than via
        // a string handler — this view carries no controller for one to resolve against.
        this.getReference('mailbox-pane')?.on('pageRequest', this.onMailboxPageRequest, this);
        // same explicit-wiring rule for the config tab: the card fires, this view runs the shared
        // bridge round-trip (see onConfigIntent)
        const configPane = this.getReference('config-pane');

        configPane?.on('configIntent', this.onConfigIntent, this);

        if (configPane) {
            configPane.tenantStore = this.fleetTenants
        }
        this.applyRecord();
        this.startFreshnessAging()
    }

    /**
     * Triggered after the composition-seated public tenant Store changes.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetFleetTenants(value, oldValue) {
        const card = this.getReference?.('config-pane');

        if (card) card.tenantStore = value
    }

    /**
     * @summary Age the freshness labels over wall-clock time — freshness is time-relative, so a
     * pane that was `fresh` must mechanically decay to `stale` / `lost` even with no new data. A
     * self-rescheduling timer re-classifies every {@link #freshnessRefreshMs} while a record is
     * shown; the `isDestroyed` guard ends the loop on teardown (no explicit clear needed). Uses the
     * live clock (`applyPaneFreshness` reads `now ?? Date.now()`), so a pinned test `now` ages
     * deterministically via `afterSetNow` instead.
     * @protected
     */
    startFreshnessAging() {
        let me = this;

        me.timeout(me.freshnessRefreshMs).then(() => {
            if (!me.isDestroyed) {
                me.record && me.applyPaneFreshness();
                // the mailbox chip ages off the SAME timer. It is time-relative like every other
                // pane, but it renders inside a child that reads the live clock only when something
                // re-renders it — so without this nudge a `fresh` mailbox stays fresh forever while
                // its snapshot silently rots, which is precisely the stale-claim-rendered-as-current
                // failure the freshness vocabulary exists to prevent. One owner timer, two
                // consumers: a second interval would age the same surface twice.
                me.record && me.getReference('mailbox-pane')?.applySnapshot();
                me.startFreshnessAging()
            }
        })
    }

    /**
     * Triggered after the record config changed — a re-seat onto a different resident (or a null
     * clear back to the empty state) re-renders in place.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.isConstructed && this.applyRecord()
    }

    /**
     * Monotonic read generation for {@link #loadMailboxMirror}. A drill is a user gesture and the
     * mirror read is async, so two reads can be in flight across a fast A→B→A drill; only the
     * newest may land.
     * @member {Number} mailboxReadGeneration=0
     * @protected
     */
    mailboxReadGeneration = 0

    /**
     * @summary Honor the pane's page request by re-reading the mirror at the requested offset.
     *
     * Routed through the SAME read as the drill, so a page transition inherits its generation latch
     * and subject re-check for free: a page request answered after the operator drilled elsewhere is
     * dropped exactly like a stale drill read, rather than paging resident A's inbox into B's pane.
     * @param {Object} data `{offset}` from the pane's `pageRequest` event.
     * @protected
     */
    onMailboxPageRequest(data) {
        this.loadMailboxMirror({offset: data.offset})
    }

    /**
     * @summary Read THIS resident's mailbox mirror through the Fleet read seam and hand it to the pane.
     *
     * The pane renders and never fetches; this view owns the read because it owns the drill, and it
     * stays shell-agnostic so the popped-out inspector reads exactly like the docked one. The Body
     * never touches MailboxService — it calls the `fleetMailboxMirror` read verb, whose source is
     * the thing that would hold the identity binding.
     *
     * **Today that source is unwired and this transport authenticates nothing**, so the read can
     * only answer an honest `unavailable` and the pane renders `unobserved`. That is the truthful
     * state, not a placeholder: no viewer identity crosses the Fleet boundary yet, so no admission
     * can be attributed. The live read waits on authenticated viewer ingress + per-request identity
     * binding; this path is the seam it will arrive through, already failing closed.
     *
     * **Race-safe by generation, not by hope.** A drill is a gesture; the read is async. Across a
     * fast A→B drill the in-flight read for A resolves AFTER B is seated, and assigning it would
     * render A's inbox under B's name — the exact defect the possession guard exists to prevent,
     * re-entering through the back door. The generation latch AND the re-checked subject both have
     * to hold before a snapshot lands.
     *
     * Fail-closed: an absent verb or a throw leaves the pane `unobserved` — it never fabricates a
     * snapshot, and never renders "no mail" for a read that did not happen.
     * @returns {Promise<void>}
     * @protected
     */
    async loadMailboxMirror({offset = 0} = {}) {
        let me       = this,
            username = me.record?.githubUsername,
            bridge   = globalThis.AgentOS?.fleet?.registryBridge;

        // The read asks for the resident's MAILBOX identity, never the Fleet registry key: a mailbox
        // subject is an AgentIdentity node id (`@neo-opus-vega`) while `agentId` is a registry key
        // (`vega`), so passing the key would request a subject that does not exist — and any answer
        // to it would be about someone else. A resident with no identity authority is honestly
        // unreadable: no read is issued at all, rather than one aimed at a guess.
        const subject = typeof username === 'string' && username.trim()
            ? (username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`)
            : null;

        if (!subject || typeof bridge?.fleetMailboxMirror !== 'function') {
            return
        }

        const generation = ++me.mailboxReadGeneration;

        try {
            const snapshot = await bridge.fleetMailboxMirror({subjectAgentId: subject, offset});

            // A newer drill won, the subject moved, or the view is gone — drop it on the floor.
            // The re-check compares the SAME field the read was aimed with (`githubUsername`), not
            // the registry key: comparing across the two id spaces would never match and would
            // silently discard every snapshot.
            if (me.isDestroyed || generation !== me.mailboxReadGeneration || me.record?.githubUsername !== username) {
                return
            }

            me.getReference('mailbox-pane').snapshot = snapshot
        } catch (error) {
            // fail-closed: the pane stays honestly unobserved rather than inventing a snapshot
        }
    }

    /**
     * Triggered after the per-pane ledgers changed — re-render just the freshness chips (a feed
     * stamping a new `observedAt` must re-label the pane without a full record re-seat).
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetPaneLedgers(value, oldValue) {
        this.isConstructed && this.record && this.applyPaneFreshness()
    }

    /**
     * Triggered after the injected clock changed — freshness is time-relative, so a new `now`
     * re-classifies every pane.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetNow(value, oldValue) {
        this.isConstructed && this.record && this.applyPaneFreshness()
    }

    /**
     * @summary Render the record onto the header, or fall back to the honest empty state.
     *
     * The identity header: displayName is mutable display state (falling back
     * through the durable id, never blank), engineTag is subordinate session-metadata, the id is
     * always shown as the anchor, participationStatus renders as availability (not a role), and the
     * family rail + state dot mirror {@link AgentOS.view.fleet.AgentCard} (state gated on a wired
     * runtime source so missing evidence never renders as live).
     * @protected
     */
    /**
     * The full store-lifecycle listener set for the definitions store — one map, attached and
     * detached symmetrically ({@link #afterSetAgentDefinitions} + {@link #destroy}). Three distinct
     * edges, three listeners: `recordChange` (a field mutated in place — record identity unchanged,
     * so the card's reactive `record` never re-fires), `mutate` (membership: a definition added,
     * replaced, or removed after this view mounted), `load` (a reload re-seated the rows wholesale).
     * @returns {Object}
     * @protected
     */
    getDefinitionsStoreListeners() {
        const me = this;

        return {
            load        : me.onDefinitionsStoreMutation,
            mutate      : me.onDefinitionsStoreMutation,
            recordChange: me.onDefinitionRecordChange,
            scope       : me
        }
    }

    /**
     * Triggered after the agentDefinitions config got changed — the composition seating the shared
     * store (or a test seating one directly). Moves the store-lifecycle listeners old → new, then
     * re-seats the card: a detail mounted BEFORE its definition existed must acquire the record the
     * moment membership delivers it.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetAgentDefinitions(value, oldValue) {
        const me = this;

        oldValue?.un?.(me.getDefinitionsStoreListeners());
        value?.on?.(me.getDefinitionsStoreListeners());

        me.isConstructed && me.applyConfigRecord()
    }

    /**
     * @summary Store membership or a wholesale reload changed the definition rows — re-seat the
     * card from the canonical store. Covers a definition ADDED after mount (null → record),
     * REPLACED (new instance for the same id), REMOVED (record → honest empty state), and reloads.
     * @protected
     */
    onDefinitionsStoreMutation() {
        this.applyConfigRecord()
    }

    /**
     * @summary Detach the provider-owned store's listeners — the store outlives this view, so an
     * attached listener would keep firing into a destroyed component.
     * @param {...*} args
     */
    destroy(...args) {
        this.agentDefinitions?.un?.(this.getDefinitionsStoreListeners());
        super.destroy(...args)
    }

    /**
     * @summary Seat the configuration tab from the definitions store — the Fleet-Registry-key join
     * (`record.agentId` === `AgentDefinition.id`). No resident or no store → `null` → the card's
     * honest empty line.
     */
    applyConfigRecord() {
        const
            me   = this,
            card = me.getReference('config-pane');

        if (card) {
            card.record = (me.record?.agentId && me.agentDefinitions?.get(me.record.agentId)) || null
        }
    }

    /**
     * @summary A definition record changed in place (e.g. an accepted configure readback from ANY
     * owner, incl. Accounts) — refresh the card when the change concerns the seated definition.
     * @param {Object} data The store's `recordChange` payload.
     * @protected
     */
    onDefinitionRecordChange(data) {
        const card = this.getReference('config-pane');

        card?.record && data?.record?.id === card.record.id && card.refresh()
    }

    /**
     * @summary The config tab's `configIntent` → the shared bridge round-trip. Ordering is NOT
     * owned here: the runner arbitrates supersession per shared record across every owner
     * (Accounts included), so a newer intent from either surface outranks an older in-flight
     * response. This owner contributes only its store resolution and its status sink (the card).
     * Fail-closed and readback-only by construction —
     * see {@link module:apps/agentos/view/fleet/configIntentRoundTrip}.
     * @param {Object} intent `{id, harnessType?, mcpServers?, mcpTarget?}` (+ event envelope,
     *     stripped by the runner).
     * @returns {Promise<void>}
     */
    onConfigIntent(intent={}) {
        const me = this;

        return runConfigIntentRoundTrip({
            intent,
            owner        : me,
            setSaveStatus: (agentId, state, reason) => me.getReference('config-pane')?.setSaveStatus(agentId, state, reason),
            store        : me.agentDefinitions
        })
    }

    applyRecord() {
        let me     = this,
            record = me.record,
            empty  = me.getReference('detail-empty'),
            header = me.getReference('detail-header'),
            tabs   = me.getReference('detail-tabs');

        empty.hidden  = !!record;
        header.hidden = !record;
        tabs.hidden   = !record;

        // The mailbox tab follows the drilled-in resident. A snapshot is one SUBJECT's mail, so it
        // cannot survive a re-seat onto a different resident: retaining it renders resident A's
        // inbox under resident B's name — mail attributed to an agent who never received it. The
        // pane drops to its honest `unobserved` state until THIS subject's snapshot arrives.
        // A same-subject re-seat (a roster refresh restamping the record) keeps it.
        const
            mailbox   = me.getReference('mailbox-pane'),
            sameAgent = mailbox.record?.agentId && mailbox.record.agentId === record?.agentId;

        mailbox.set({
            record,
            ...(sameAgent ? {} : {snapshot: null})
        });

        sameAgent || me.loadMailboxMirror();

        // the configuration tab joins on the Fleet Registry key; a roster resident with no stored
        // definition renders the card's honest no-definition line, never a fabricated config
        me.applyConfigRecord();

        if (!record) {
            return
        }

        const
            sources = normalizeFleetSources(record.sources),
            runtime = sources.runtime,
            // the drill-in dot renders the SAME resolved truth as the card and the health tally —
            // one resolver, three surfaces: a roster-only active resident reads `unobserved` here
            // exactly as the grid displays it, never a contradictory `off`
            state        = resolveFleetDisplayState({state: record.state, sources: record.sources}),
            agentId      = record.agentId ?? '';

        me.getReference('family-rail').family = record.family ?? null;

        me.getReference('state-dot').set({
            live : state === 'ok' && runtime.confidence === 'observed',
            state
        });

        me.getReference('detail-name').text   = record.displayName || agentId || '—';
        me.getReference('detail-engine').text = record.engineTag ?? '';
        me.getReference('detail-id').text     = agentId;

        // availability, rendered honestly — a known status word, or hidden when unstamped (null =
        // no identity-root fact; never guessed, never a role)
        const participation = record.participationStatus ?? null;

        me.getReference('detail-participation').set({
            hidden: participation === null,
            text  : participation === null ? '' : participation.replace(/_/g, ' ')
        });

        // The full two-axis readout: BOTH axes, always — the opposite of the card's exception-based
        // chip, and deliberately so. Three renderings for three different facts: a nominal axis says
        // so (an operator who drilled in needs "wake: on" confirmed, not omitted), an observed
        // `unknown` carries the producer's reason, and an axis nobody reported says "not reported"
        // rather than borrowing 'unknown' — which would claim someone looked.
        const readout = describeTelltaleReadout({throttle: record.throttle, wake: record.wake});

        // Built as VDOM nodes carrying `text`, never an `html` string. `reason` is the PRODUCER's
        // sentence — it crosses a process boundary before it reaches here — and Neo routes `html` to
        // innerHTML (src/vdom/Helper.mjs), so interpolating it made a remote adapter's error message
        // executable in the cockpit. A `text` node is inert by construction, which is the only version
        // of this that cannot be got wrong again later: escaping is a thing you must remember, and a
        // text node is a thing you cannot forget.
        const telltale = me.getReference('detail-telltale');

        telltale.vdom.cn = readout.flatMap(({axis, reason, reported, state}) => {
            if (!reported) {
                return [{tag: 'span', cls: ['fm-detail-telltale-axis', 'fm-detail-telltale-unreported'], text: `${axis}: not reported`}]
            }

            const nodes = [{tag: 'span', cls: ['fm-detail-telltale-axis', `fm-detail-telltale-${state}`], text: `${axis}: ${state}`}];

            // the reason is the producer's evidence for what it could not see; the card has no room
            // for it, which is what makes a degraded chip a prompt to drill in rather than a dead end
            if (reason) {
                nodes.push({tag: 'span', cls: ['fm-detail-telltale-reason'], text: `— ${reason}`})
            }

            return nodes
        });

        telltale.update();

        // The three-source provenance readout — the drill-in counterpart to the card's one word-line.
        // Each source states itself unconditionally (like the telltale's axes): a wired source names its
        // confidence AND its producer; a not-wired / missing source says so plainly. State rides the TEXT
        // ("not wired" / "missing"), never colour alone (WCAG 1.4.1). Built as `text` VDOM nodes, never an
        // `html` string — `fact.source` is a producer literal that crossed a process boundary, and Neo
        // routes `html` to innerHTML; a text node is inert by construction.
        const
            sourceLabels  = {runtime: 'Runtime', repoStatus: 'Repository', roster: 'Roster'},
            sourceOrder   = ['runtime', 'repoStatus', 'roster'],
            detailSources = me.getReference('detail-sources');

        detailSources.vdom.cn = sourceOrder.flatMap(key => {
            const
                fact      = sources[key],
                stateText = fact.state === 'wired' ? `wired · ${fact.confidence}` : fact.state.replace(/-/g, ' '),
                nodes     = [{
                    tag : 'span',
                    cls : ['fm-detail-sources-axis', `fm-detail-sources-${fact.state}`],
                    text: `${sourceLabels[key]}: ${stateText}`
                }];

            // the producer literal is the provenance evidence — which adapter reported this fact; the
            // card's one-word summary cannot carry it, which is the point of the drill-in
            if (fact.source) {
                nodes.push({tag: 'span', cls: ['fm-detail-sources-producer'], text: `— ${fact.source}`})
            }

            return nodes
        });

        detailSources.update();

        me.getReference('detail-avatar').set({
            alt: record.displayName ?? agentId,
            src: record.avatarUrl ?? null
        });

        me.applyPaneFreshness()
    }

    /**
     * @summary Render each pane's freshness chip + known body content, honestly.
     *
     * Every pane header shows its observation freshness — timestamped `fresh`/`stale`/`lost` from a
     * wired ledger, or `unobserved` until its feed lands (never a silently-current
     * claim). The `lane` pane additionally renders the record-known lane line + open-lane count; the
     * feed-gated panes (thought-stream / repo / prs) render an honest "awaiting …" body until their
     * Lane-C / memory-surface leaf wires content.
     * @protected
     */
    applyPaneFreshness() {
        let me      = this,
            record  = me.record,
            ledgers = me.paneLedgers ?? {},
            now     = me.now ?? Date.now();

        PANES.forEach(pane => {
            const
                ledger       = ledgers[pane.key] ?? null,
                merged       = ledger ? {freshnessTtl: pane.freshnessTtl, ...ledger} : null,
                {cls, label} = describePaneFreshness(classifyPaneFreshness(merged, now));

            // .text (never .html): the label is ours but the pane body is record-derived
            // (laneLine), so it must be escaped text, never interpreted markup — no injection surface
            me.getReference(`pane-${pane.key}-freshness`).set({cls, text: label});
            me.getReference(`pane-${pane.key}-body`).text = me.renderPaneBody(pane.key, record)
        })
    }

    /**
     * @summary The honest body content for one pane from the record's known facts. The `lane` pane
     * renders the real lane line + open-lane count; the feed-gated panes render an "awaiting" line
     * until their source leaf lands (degrade honestly, never a fabricated stream).
     * @param {String} key Pane key.
     * @param {Object} record The drilled-in FleetAgent record (never null here).
     * @returns {String}
     * @protected
     */
    renderPaneBody(key, record) {
        if (key === 'lane') {
            const
                laneLine  = record.laneLine || 'no current lane reported',
                laneCount = Number.isInteger(record.openLaneCount) && record.openLaneCount > 0 ? record.openLaneCount : null,
                countText = laneCount === null ? '' : ` · ${laneCount} open ${laneCount === 1 ? 'lane' : 'lanes'}`;

            return `${laneLine}${countText}`
        }

        return 'awaiting live feed'
    }
}

export default Neo.setupClass(AgentDetail);
