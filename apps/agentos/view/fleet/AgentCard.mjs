import AgentCardController     from './AgentCardController.mjs';
import Button                  from '../../../../src/button/Base.mjs';
import Container               from '../../../../src/container/Base.mjs';
import FamilyRail              from './FamilyRail.mjs';
import Image                   from '../../../../src/component/Image.mjs';
import SourceHealthMarker      from './SourceHealthMarker.mjs';
import StateDot                from './StateDot.mjs';
import {normalizeFleetSources} from './sourceHealth.mjs';

import {describeNameProvenance, resolveNameSlot} from './nameSlot.mjs';

/**
 * The resident card: the cockpit's atom. Composes the class-based fleet primitives (FamilyRail +
 * StateDot + SourceHealthMarker) with a profile avatar, name, engine tag, and the lane row —
 * current-lane line plus the open-lane count badge (measured density evidence: 7–17 open lanes
 * per active agent; the badge carries the honest total the single line cannot) — into the SSOT
 * card anatomy.
 *
 * **Data-driven from its `record`** — one {@link AgentOS.model.FleetAgent} record (a row of the
 * shared {@link AgentOS.store.FleetRoster} Store) is the card's single data surface; there is no
 * per-card `state.Provider` and no per-field config to thread. The Store is the per-row reactive
 * layer: live field changes flow `record.set()` → the store's `recordChange` → the owning
 * {@link AgentOS.view.fleet.FleetGrid} → {@link #applyRecord}, which updates the child components
 * in place. A plain field-bag `record` (the dock-blueprint restore case) renders its snapshot the
 * same way.
 *
 * Render rules at card grain (the institution-cockpit render-model): **avatar**, **displayName**,
 * and **engineTag** are mutable versioned DISPLAY STATE over the durable `agentId` — a field change
 * re-renders in place on the SAME card instance and NEVER re-keys (identity is the id, not the
 * presentation). The **family** rail rebinds in place on a family swap. Session **state** is what
 * the resident is doing now, never identity.
 *
 * @class AgentOS.view.fleet.AgentCard
 * @extends Neo.container.Base
 */
class AgentCard extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.AgentCard'
         * @protected
         */
        className: 'AgentOS.view.fleet.AgentCard',
        /**
         * @member {String} ntype='fm-agent-card'
         * @protected
         */
        ntype: 'fm-agent-card',
        /**
         * @member {String[]} baseCls=['fm-agent-card']
         */
        baseCls: ['fm-agent-card'],
        /**
         * The card is a NON-interactive listitem — the FM roster is a ranked responsive list, not a 2D
         * data matrix. The keyboard-operable drill target is the dedicated
         * native `card-name` Button (below), NOT the card root; lifecycle toggle/restart are sibling
         * native Buttons, so every control is a real element in ordinary Tab order (drill → toggle →
         * restart). Set via the Component.Base `role` config so it renders to the vdom ROOT through
         * `changeVdomRootKey` (a raw `this.vdom.role` write does NOT flush to the mounted DOM).
         * @member {String} role='listitem'
         */
        role: 'listitem',
        /**
         * Turns the controls-slot buttons into a single `lifecycleIntent` event (the B4 emit); the
         * Lane C (C2) round-trip consumes it. See {@link AgentOS.view.fleet.AgentCardController}.
         * @member {Neo.controller.Component} controller=AgentCardController
         */
        controller: AgentCardController,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * The card's data surface: an {@link AgentOS.model.FleetAgent} record (store-backed, live)
         * or a plain field bag with the same keys (dock-blueprint snapshot). `agentId` is the
         * DURABLE identity; every other field is display state over it. `sources` carries the
         * roster / repository / runtime provenance that gates honest session rendering;
         * `pendingAction` + `controlReason` are the B4/C2 control seam the C2 adapter writes via
         * `record.set()`.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * The card anatomy — family rail · avatar · body (name-row [state dot + name + engine tag] +
         * lane row [current-lane line + open-lane count badge] + per-source health markers) ·
         * controls slot (start/stop/restart → a
         * single `lifecycleIntent` event for the Lane C round-trip). Each child is a referenced,
         * in-place-updated surface fed from the record by {@link #applyRecord}; foot meta is a sibling
         * leaf.
         * @member {Object[]} items
         */
        items: [{
            module   : FamilyRail,
            flex     : 'none',
            reference: 'family-rail'
        }, {
            module   : Image,
            cls      : ['fm-card-avatar'],
            flex     : 'none',
            reference: 'card-avatar'
        }, {
            ntype : 'container',
            cls   : ['fm-card-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                ntype : 'container',
                cls   : ['fm-card-name-row'],
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    module   : StateDot,
                    flex     : 'none',
                    reference: 'state-dot'
                }, {
                    // the dedicated native drill Button: the keyboard-operable target
                    // that opens the resident. A native <button> owns Enter/Space; its accessible name is
                    // the resident's name (set in applyRecord). The `fm-card-drill` marker scopes the
                    // FleetGrid Up/Down efficiency jump + arrow-scroll suppression to drill targets only.
                    module   : Button,
                    // `neo-selection` opts JUST this drill Button into the main-thread arrow-key
                    // preventDefault rule (DomEvents.onKeyDown) so the FleetGrid drill-to-drill Up/Down
                    // jump never scrolls the viewport — scoped to the drill target, not the whole card.
                    cls      : ['fm-card-name', 'fm-card-drill', 'neo-selection'],
                    flex     : 1,
                    handler  : 'onCardSelect',
                    reference: 'card-name'
                }, {
                    // the name-slot provenance chip (mono pill, freshness-chip register): `named`
                    // when a naming-layer trail is wired on the record, `declared` while the name
                    // is registry display state without a trail, `id` when the durable anchor
                    // itself renders. The long copy (and the trail, once wired) rides title +
                    // aria-label — reachable, never a silent claim (applyRecord writes it).
                    ntype    : 'component',
                    flex     : 'none',
                    reference: 'name-provenance'
                }, {
                    ntype    : 'component',
                    cls      : ['fm-card-engine'],
                    flex     : 'none',
                    reference: 'card-engine'
                }]
            }, {
                // the lane ROW: current-lane text + the open-lane count badge. The measured
                // density evidence puts 7–17 open lanes on an active agent — one truncated line
                // cannot carry that, so the line shows the CURRENT lane and the badge carries the
                // honest total. The badge only renders on a reported count (null = unknown = no badge).
                ntype : 'container',
                cls   : ['fm-card-lane-row'],
                layout: {ntype: 'hbox', align: 'center'},

                items: [{
                    ntype    : 'component',
                    cls      : ['fm-card-lane'],
                    flex     : 1,
                    reference: 'card-lane'
                }, {
                    ntype    : 'component',
                    cls      : ['fm-card-lane-count'],
                    flex     : 'none',
                    hidden   : true,
                    reference: 'card-lane-count'
                }]
            }, {
                ntype    : 'container',
                cls      : ['fm-card-source-health'],
                reference: 'source-health',
                role     : 'group',
                vdom     : {'aria-label': 'Source health'},
                layout   : {ntype: 'hbox', align: 'center'},
                // Runtime comes first: at constrained card widths the action-owning source must
                // remain the first visible / wrapped fact.
                items    : [{
                    module   : SourceHealthMarker,
                    reference: 'source-runtime',
                    sourceKey: 'runtime'
                }, {
                    module   : SourceHealthMarker,
                    reference: 'source-roster',
                    sourceKey: 'roster'
                }, {
                    module   : SourceHealthMarker,
                    reference: 'source-repo-status',
                    sourceKey: 'repoStatus'
                }]
            }]
        }, {
            ntype : 'container',
            cls   : ['fm-card-controls'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},

            items: [{
                ntype    : 'container',
                cls      : ['fm-card-control-verbs'],
                reference: 'control-verbs',
                layout   : {ntype: 'hbox', align: 'center'},

                items: [{
                    // ONE power toggle — start when off, stop when running. Only one of the two is
                    // ever valid for a given state, so we render the contextual action; a disabled
                    // play on a running resident (or a disabled stop on a stopped one) is bloat,
                    // not safety.
                    module   : Button,
                    handler  : 'onToggleLifecycle',
                    reference: 'control-toggle'
                }, {
                    // restart is meaningful only while running — a stopped resident starts via the
                    // toggle
                    module   : Button,
                    action   : 'restart',
                    handler  : 'onLifecycleIntent',
                    hidden   : true,
                    iconCls  : 'fa-solid fa-rotate',
                    reference: 'control-restart'
                }]
            }, {
                ntype    : 'component',
                cls      : ['fm-card-control-status'],
                reference: 'control-status',
                hidden   : true
            }]
        }]
    }

    /**
     * @summary Populate the referenced child surfaces once constructed (the anatomy exists from
     * static config; its content is record-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        // The card is a NON-interactive listitem — it takes no tabIndex. Keyboard
        // operability lives on the native child Buttons (drill / toggle / restart), which supply their
        // own Enter/Space and Tab order. The drill Button's accessible name is record-derived (applyRecord).
        this.applyRecord()
    }

    /**
     * Triggered after the record config changed — a card re-seated onto a different record (or a
     * dock-restored snapshot bag) re-renders in place.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.isConstructed && this.applyRecord()
    }

    /**
     * @summary Render the record onto the card's referenced children, in place.
     *
     * The one read-side consumer of the record contract: display fields land on the rail / avatar /
     * name-row / lane surfaces. Source facts are normalized once, update the three reusable markers,
     * and gate the state dot so missing runtime evidence cannot render as live. The B4/C2 control
     * seam renders the honest round-trip matrix — the card RENDERS what Lane-C writes, never fakes
     * success, and each terminal kind renders DISTINCTLY:
     *   unauthorized → the reason shows AND the control cluster stays disabled — you cannot retry
     *                  into a closed door;
     *   timeout      → stale-pending: the outcome is UNKNOWN (the verb may still be running, we
     *                  just lost the answer), so it reads as an unfinished "…", not a resolved "⚠"
     *                  failure, and retry stays open;
     *   rejected     → the "⚠ reason" with retry open.
     */
    applyRecord() {
        let me     = this,
            record = me.record;

        if (!record) {
            return
        }

        const
            controlReason = record.controlReason ?? null,
            pendingAction = record.pendingAction ?? null,
            sources       = normalizeFleetSources(record.sources),
            runtime       = sources.runtime,
            sourceUsable  = runtime.state === 'wired',
            recordState   = record.state ?? 'off',
            // a runtime observation only renders as a resolved state when the source is wired; a
            // transitional state, in contrast, is a FIRST-PARTY fact (we sent the intent, it is in
            // flight) so `pendingAction` takes precedence and needs no runtime-source gate.
            resolvedState = sourceUsable ? recordState : 'off',
            displayState  = pendingAction === 'stop'
                ? 'stopping'
                : pendingAction  // 'start' | 'restart' both transition toward running
                    ? 'starting'
                    : resolvedState,
            sourceReason  = sourceUsable
                ? null
                : runtime.state === 'missing'
                    ? 'MISSING'
                    : 'NOT WIRED',
            disabled      = Boolean(pendingAction) || Boolean(sourceReason) || controlReason?.kind === 'unauthorized';

        me.getReference('family-rail').family = record.family ?? null;
        me.getReference('state-dot').set({
            live : displayState === 'ok' && runtime.confidence === 'observed',
            state: displayState
        });
        // a badge only for a REPORTED positive count: null/absent = the roster DTO carries no
        // stamped count — rendering "0 lanes" there would fabricate a fact no producer stated
        const laneCount = Number.isInteger(record.openLaneCount) && record.openLaneCount > 0 ? record.openLaneCount : null;

        // the name slot: the folded display name as MUTABLE DISPLAY STATE over the durable id —
        // a record with no folded name renders the id itself in the mono register (never a blank
        // drill target), and the provenance chip states how the rendered name is grounded
        const
            nameSlot   = resolveNameSlot(record),
            nameButton = me.getReference('card-name'),
            provenance = me.getReference('name-provenance'),
            chip       = describeNameProvenance(nameSlot.provenance.state);

        nameButton.text = nameSlot.text;
        nameButton[nameSlot.isFallback ? 'addCls' : 'removeCls']('fm-card-name-id');

        provenance.set({cls: chip.cls, text: chip.text});
        provenance.changeVdomRootKey('title', nameSlot.provenance.label);
        provenance.changeVdomRootKey('aria-label', nameSlot.provenance.label);

        me.getReference('card-engine').text        = record.engineTag ?? '';
        me.getReference('card-lane').text          = record.laneLine ?? '';

        me.getReference('card-lane-count').set({
            hidden: laneCount === null,
            text  : laneCount === null ? '' : `${laneCount} ${laneCount === 1 ? 'lane' : 'lanes'}`
        });
        me.getReference('source-roster').health    = sources.roster;
        me.getReference('source-repo-status').health = sources.repoStatus;
        me.getReference('source-runtime').health   = runtime;

        me.getReference('card-avatar').set({
            alt: record.displayName ?? '',
            src: record.avatarUrl ?? null
        });

        me.getReference('control-toggle').set({
            disabled,
            iconCls: recordState === 'off' ? 'fa-solid fa-play' : 'fa-solid fa-stop'
        });

        me.getReference('control-restart').set({
            disabled,
            hidden: recordState === 'off'
        });

        me.getReference('control-status').set({
            hidden: !pendingAction && !controlReason && !sourceReason,
            // pending takes visual priority over a prior reason, so a new attempt never shows a
            // stale rejection (complements C2 clearing controlReason on a new accepted intent)
            text  : pendingAction
                ? `${pendingAction}…`
                : !controlReason
                    ? sourceReason ?? ''
                    : controlReason.kind === 'timeout'
                        ? `${controlReason.action}… stale — no response`
                        : `⚠ ${controlReason.kind}: ${controlReason.reason}`
        });

        me.update()
    }
}

export default Neo.setupClass(AgentCard);
