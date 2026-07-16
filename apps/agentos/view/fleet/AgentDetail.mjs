import Button                                         from '../../../../src/button/Base.mjs';
import Container                                      from '../../../../src/container/Base.mjs';
import FamilyRail                                     from './FamilyRail.mjs';
import Image                                          from '../../../../src/component/Image.mjs';
import StateDot                                       from './StateDot.mjs';
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
 * dock/layout/Electron coupling reaches it — so the pop-out (T4.15) reparents it into its own
 * OS window without change. The header's pop-out affordance keeps that contract: it only FIRES
 * `popOutIntent` with the current {@link #popOutMode}; the owning cockpit routes the intent
 * through the dock layer and writes the mode back. The affordance is record-gated (it rides the
 * identity header) — a popped-out inspector whose resident leaves the roster falls back to the
 * empty state, and closing its window manually is the documented reattach path.
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
         * Where this inspector currently renders — `'docked'` (inside the cockpit's dock
         * projection) or `'windowed'` (its own OS window on the shared heap). DISPLAY state the
         * owning cockpit writes after routing a `popOutIntent`; the view only flips its affordance
         * (icon + accessible label) — it never executes dock or window operations itself.
         * @member {String} popOutMode_='docked'
         * @reactive
         */
        popOutMode_: 'docked',
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
                    }, {
                        // the layout-blind pop-out affordance: fires intent, executes nothing —
                        // the owning cockpit routes it through the dock layer (T4.15); icon +
                        // accessible label sync from popOutMode via syncPopOutAffordance
                        module   : Button,
                        cls      : ['fm-detail-popout'],
                        flex     : 'none',
                        handler  : 'up.onPopOutButtonClick',
                        iconCls  : 'fa-solid fa-arrow-up-right-from-square',
                        reference: 'detail-popout-button'
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
            ntype    : 'container',
            cls      : ['fm-detail-panes'],
            flex     : 1,
            hidden   : true,
            reference: 'detail-panes',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : PANES.map(paneConfig)
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
        this.applyRecord();
        this.syncPopOutAffordance();
        this.startFreshnessAging()
    }

    /**
     * Triggered after the popOutMode config changed — the owning cockpit writes the mode after
     * routing an intent; the view flips only its affordance rendering.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetPopOutMode(value, oldValue) {
        this.isConstructed && this.syncPopOutAffordance()
    }

    /**
     * @summary Render the pop-out affordance for the current {@link #popOutMode}: the detach icon +
     * label while docked, the reattach icon + label while windowed. Vdom-level `aria-label` (the
     * house idiom) keeps the icon-only button accessible in both states.
     * @protected
     */
    syncPopOutAffordance() {
        let me       = this,
            windowed = me.popOutMode === 'windowed',
            button   = me.getReference('detail-popout-button'),
            label    = windowed ? 'Reattach to the cockpit' : 'Pop out to its own window';

        if (button) {
            button.iconCls = windowed
                ? 'fa-solid fa-down-left-and-up-right-to-center'
                : 'fa-solid fa-arrow-up-right-from-square';

            button.changeVdomRootKey('aria-label', label);
            button.changeVdomRootKey('title', label)
        }
    }

    /**
     * @summary The affordance click: report intent only — the owning cockpit decides what a click
     * means for the current mode and executes the dock/window operations.
     */
    onPopOutButtonClick() {
        this.fire('popOutIntent', {mode: this.popOutMode})
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
            panes  = me.getReference('detail-panes');

        empty.hidden  = !!record;
        header.hidden = !record;
        panes.hidden  = !record;

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
