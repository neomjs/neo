import Container                                      from '../../../../src/container/Base.mjs';
import FamilyRail                                     from './FamilyRail.mjs';
import Image                                          from '../../../../src/component/Image.mjs';
import MailboxPane                                    from './MailboxPane.mjs';
import StateDot                                       from './StateDot.mjs';
import TabContainer                                   from '../../../../src/tab/Container.mjs';
import {classifyPaneFreshness, describePaneFreshness} from './agentFreshness.mjs';
import {normalizeFleetSources}                        from './sourceHealth.mjs';

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
        ntype : 'container',
        cls   : ['fm-detail-pane-head'],
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
        // the pane renders and never fetches: it fires the page intent, this view (which holds the
        // read seam and the subject) performs the bounded re-read. Wired explicitly rather than via
        // a string handler — this view carries no controller for one to resolve against.
        this.getReference('mailbox-pane')?.on('pageRequest', this.onMailboxPageRequest, this);
        this.applyRecord();
        this.startFreshnessAging()
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
     * never touches MailboxService — it calls the authenticated `fleetMailboxMirror` read verb, whose
     * source holds the identity binding, and whose admission is the Memory Core primitive's own
     * fail-closed gate.
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

        if (!record) {
            return
        }

        const
            sources      = normalizeFleetSources(record.sources),
            runtime      = sources.runtime,
            sourceUsable = runtime.state === 'wired',
            state        = sourceUsable ? (record.state ?? 'off') : 'off',
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
