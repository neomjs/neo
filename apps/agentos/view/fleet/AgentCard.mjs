import AgentCardController    from './AgentCardController.mjs';
import Button                 from '../../../../src/button/Base.mjs';
import Container              from '../../../../src/container/Base.mjs';
import FamilyRail             from './FamilyRail.mjs';
import Image                  from '../../../../src/component/Image.mjs';
import StateDot, {stateLabel} from './StateDot.mjs';

/**
 * The closed presence-band → label map (the plane's who_is_online embryo). Only these render; an
 * out-of-set or `unknown` state keeps the presence element hidden — the closed-set discipline the
 * session-state label already follows.
 * @type {Object}
 */
const PRESENCE_BAND_LABEL = Object.freeze({
    online        : 'online',
    idle          : 'idle',
    dark          : 'dark',
    benched       : 'benched',
    neverConnected: 'never connected'
});

import {normalizeFleetSources, resolveFleetDisplayState, summarizeFleetSources} from './sourceHealth.mjs';

import {describeNameProvenance, resolveNameSlot} from './nameSlot.mjs';
import {describeTelltale}                        from './telltale.mjs';

/**
 * The resident card: the cockpit's atom — the evolved-D/synthesis composition (operator SELECT
 * 2026-07-19: B/C identity-first hierarchy + D's narrow mechanics + A as roomy alignment).
 * Composes the class-based fleet primitives (FamilyRail + StateDot) with a profile avatar, a
 * two-line identity column, contextual actions, a tail-aware lane, and an honest source-summary
 * strip into the card anatomy — responsive to the card's OWN width via `@container`: layout-blind
 * to docking, never viewport media queries.
 *
 * Anatomy (top-to-bottom, the family rail a left accent owned by FamilyRail):
 * - **head** — avatar spanning a two-line **identity** column: `name-line` (name · provenance ·
 *   engine) over `state-line` (dot · state-word · lane-count badge · telltale), with the contextual
 *   lifecycle **actions** right-aligned;
 * - **work-row** — the current lane, two-line clamped with head+tail middle elision so two lanes
 *   sharing a prefix still distinguish by their preserved tail (the narrow-density falsifier);
 * - **strip** — ONE honest source word-line ("all sources nominal" / "REP not nominal"), retiring
 *   the three 9px markers; full facts stay reachable via the drill (detail), never hover-only.
 *
 * **Width modes are card-owned** (SCSS `@container`): narrow (<320px) scales the avatar to 32px,
 * hides the engine tag, and grows the inline lifecycle verbs to a 44px touch target — they stay
 * visible (no overflow menu); regular/wide keep the full identity. Severity changes the state-word's **weight** on a text-safe ink, never the dot's hue as
 * text (the WCAG 1.4.1→1.4.3 trap avoided by construction — the visible state word is always the
 * colour-independent carrier).
 *
 * **Data-driven from its `record`** — one {@link AgentOS.model.FleetAgent} record (a row of the
 * shared {@link AgentOS.store.FleetRoster} Store) is the card's single data surface. Live field
 * changes flow `record.set()` → the store's `recordChange` → {@link AgentOS.view.fleet.FleetGrid}
 * → {@link #applyRecord}, which updates the child components in place. `avatar`, `displayName`, and
 * `engineTag` are mutable versioned DISPLAY STATE over the durable `agentId` — a field change
 * re-renders on the SAME instance and NEVER re-keys.
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
         * data matrix. The keyboard-operable drill target is the dedicated native `card-name` Button;
         * lifecycle toggle/restart are sibling native Buttons, so every control is a real element in
         * ordinary Tab order (drill → toggle → restart). Set via the Component.Base `role` config so it
         * renders to the vdom ROOT through `changeVdomRootKey`.
         * @member {String} role='listitem'
         */
        role: 'listitem',
        /**
         * Turns the actions-slot buttons into a single `lifecycleIntent` event (the B4 emit); the
         * Lane C (C2) round-trip consumes it. See {@link AgentOS.view.fleet.AgentCardController}.
         * @member {Neo.controller.Component} controller=AgentCardController
         */
        controller: AgentCardController,
        /**
         * The vbox stacks the three anatomy rows (head / work-row / strip). {@link AgentOS.view.fleet.FamilyRail}
         * is a child — the family-colour owner — positioned by SCSS as a 3px full-height left accent, out of
         * the vertical flow, so it costs no row height.
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The card's data surface: an {@link AgentOS.model.FleetAgent} record (store-backed, live) or a
         * plain field bag with the same keys (dock-blueprint snapshot). `agentId` is the DURABLE
         * identity; every other field is display state over it. `sources` gates honest session
         * rendering; `pendingAction` + `controlReason` are the B4/C2 control seam.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * The anatomy — head (avatar · identity[name-line · state-line] · actions) · work-row (lane) ·
         * source strip. Each referenced child is fed from the record by {@link #applyRecord}; FamilyRail
         * is retained as the family-color owner but rendered as the card's 3px left rail (SCSS).
         * @member {Object[]} items
         */
        items: [{
            module   : FamilyRail,
            flex     : 'none',
            reference: 'family-rail'
        }, {
            ntype : 'container',
            cls   : ['fm-card-head'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},

            items: [{
                module   : Image,
                cls      : ['fm-card-avatar'],
                flex     : 'none',
                reference: 'card-avatar'
            }, {
                ntype    : 'container',
                cls      : ['fm-card-identity'],
                flex     : 1,
                reference: 'identity',
                layout   : {ntype: 'vbox', align: 'stretch'},

                items: [{
                    ntype    : 'container',
                    cls      : ['fm-card-name-line'],
                    reference: 'name-line',
                    layout   : {ntype: 'hbox', align: 'center'},

                    items: [{
                        // the dedicated native drill Button — the keyboard-operable target that opens the
                        // resident. A native <button> owns Enter/Space; its accessible name is the
                        // resident's name (applyRecord). `neo-selection` opts JUST this drill Button into
                        // the main-thread arrow-key preventDefault rule so the FleetGrid drill-to-drill
                        // Up/Down jump never scrolls the viewport.
                        module   : Button,
                        cls      : ['fm-card-name', 'fm-card-drill', 'neo-selection'],
                        flex     : 'none',
                        handler  : 'onCardSelect',
                        reference: 'card-name'
                    }, {
                        // the name-slot provenance chip, density-calibrated (applyRecord writes it)
                        ntype    : 'component',
                        flex     : 'none',
                        reference: 'name-provenance'
                    }, {
                        // the engine tag — lives beside the name at regular+, hides at narrow (SCSS)
                        ntype    : 'component',
                        cls      : ['fm-card-engine'],
                        flex     : 'none',
                        reference: 'card-engine'
                    }]
                }, {
                    ntype    : 'container',
                    cls      : ['fm-card-state-line'],
                    reference: 'state-line',
                    layout   : {ntype: 'hbox', align: 'center'},

                    items: [{
                        module   : StateDot,
                        flex     : 'none',
                        reference: 'state-dot'
                    }, {
                        // the visible State line (WCAG 1.4.1) named via the SAME closed-set stateLabel the
                        // dot names itself with — colour (dot) and text can never disagree. Coloured with
                        // --fm-ink-dim (text-safe), NEVER a --fm-state-* hue (dot-tuned to the 3:1 non-text
                        // floor). Severity adds WEIGHT via `fm-state-hot`, never a hue on the word.
                        ntype    : 'component',
                        cls      : ['fm-card-state'],
                        flex     : 'none',
                        reference: 'card-state'
                    }, {
                        // the presence band: the plane's who_is_online observation, the THIRD
                        // independent axis — never fused into the session-state word. Hidden unless
                        // an OBSERVED band exists: absence of signal, never a verdict.
                        ntype    : 'component',
                        cls      : ['fm-card-presence'],
                        flex     : 'none',
                        hidden   : true,
                        reference: 'card-presence'
                    }, {
                        // the open-lane count badge (openLaneCount ONLY — never the engine); right-pinned
                        // in the state-line (SCSS margin-left:auto). null count = no badge (never "0 lanes").
                        ntype    : 'component',
                        cls      : ['fm-card-lane-count'],
                        flex     : 'none',
                        hidden   : true,
                        reference: 'card-lane-count'
                    }, {
                        // the S2 telltale: ONE compound chip for both axes, hidden while nominal
                        ntype    : 'component',
                        cls      : ['fm-card-telltale'],
                        flex     : 'none',
                        hidden   : true,
                        reference: 'card-telltale'
                    }]
                }]
            }, {
                ntype    : 'container',
                cls      : ['fm-card-control-verbs'],
                flex     : 'none',
                reference: 'control-verbs',
                layout   : {ntype: 'hbox', align: 'center'},

                items: [{
                    // ONE power toggle — start when off, stop when running. Only one is ever valid for a
                    // given state, so we render the contextual action; a disabled inverse is bloat.
                    module   : Button,
                    cls      : ['fm-card-action'],
                    handler  : 'onToggleLifecycle',
                    reference: 'control-toggle'
                }, {
                    // restart is meaningful only while running — a stopped resident starts via the toggle
                    module   : Button,
                    action   : 'restart',
                    cls      : ['fm-card-action', 'fm-card-action-restart'],
                    handler  : 'onLifecycleIntent',
                    hidden   : true,
                    iconCls  : 'fa-solid fa-rotate',
                    reference: 'control-restart'
                }]
            }]
        }, {
            ntype : 'container',
            cls   : ['fm-card-work-row'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'start'},

            items: [{
                // the current lane — two-line clamped (SCSS) with head+tail middle elision (applyRecord),
                // so two lanes sharing a prefix still distinguish by their preserved tail
                ntype    : 'component',
                cls      : ['fm-card-lane'],
                flex     : 1,
                reference: 'card-lane'
            }]
        }, {
            // ONE honest source word-line: the fm-strip-<level> cls colours the ::before dot; the text
            // is summary-default and NAMES the abnormal source. Full facts reach via the drill (detail).
            ntype    : 'component',
            cls      : ['fm-card-strip'],
            reference: 'source-strip',
            role     : 'status',
            vdom     : {'aria-label': 'Source health'}
        }, {
            // the honest control round-trip surface — hidden until a pending intent or a terminal
            // reason exists; renders the B4/C2 matrix (pending "…", timeout stale, "⚠ rejected: reason")
            // WITHOUT faking success. Kept distinct from the source strip so a control failure never
            // masquerades as a source fact.
            ntype    : 'component',
            cls      : ['fm-card-control-status'],
            reference: 'control-status',
            role     : 'status',
            hidden   : true
        }]
    }

    /**
     * @summary Split a long lane into a short context head + a preserved distinguishing tail with an
     * elided middle. Two lanes sharing a prefix (the narrow-density falsifier) still distinguish by
     * their tail. A lane short enough for the two-line clamp is returned whole (no elision).
     * @param {String} text The lane line.
     * @returns {{whole: String}|{head: String, tail: String}}
     * @private
     */
    static elideLaneLine(text) {
        const line = (text ?? '').trim();

        // short enough for the two-line clamp to render whole — no semantic elision needed
        if (line.length <= 52) {
            return {whole: line}
        }

        // keep a short head for context + a generous tail (the distinguishing end), eliding the
        // middle; trim each to a word boundary so the elision reads cleanly
        const
            head = line.slice(0, 20).replace(/\s+\S*$/, '').trim(),
            tail = line.slice(-30).replace(/^\S*\s+/, '').trim();

        return {head: `${head} — … — `, tail}
    }

    /**
     * @summary Populate the referenced child surfaces once constructed (the anatomy exists from static
     * config; its content is record-derived).
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
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
     * Display fields land on the rail / avatar / identity / lane / strip surfaces. Source facts are
     * summarized once (the strip names the abnormal source and can never contradict the detail
     * markers — both read {@link #summarizeFleetSources}). The state dot is gated so missing runtime
     * evidence cannot render as live; severity adds WEIGHT to the state word, never a hue. The B4/C2
     * control seam renders the honest round-trip: unauthorized disables the cluster, timeout reads as
     * an unfinished "…" with retry open, rejected shows "⚠ reason".
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
            summary       = summarizeFleetSources(record.sources),
            // the runtime fact gates a resolved session state: a wired runtime renders the row's
            // state as session truth; without one, an explicit `off` stays the operator-benched
            // participation fact it is, while every other state renders `unobserved` — never a
            // false `benched / offline` verdict, never fabricated liveness (the pulse still
            // requires an OBSERVED confidence). A transitional pendingAction is a first-party
            // fact (we sent the intent) and takes precedence with no runtime-source gate
            runtimeWired  = sources.runtime.state === 'wired',
            recordState   = record.state ?? 'off',
            resolvedState = resolveFleetDisplayState({state: record.state, sources: record.sources}),
            displayState  = pendingAction === 'stop'
                ? 'stopping'
                : pendingAction // 'start' | 'restart' both transition toward running
                    ? 'starting'
                    : resolvedState,
            // severity = weight: the exceptional resolved states take ink + weight on the word
            hot           = displayState === 'wedged' || displayState === 'limited',
            disabled      = Boolean(pendingAction) || !runtimeWired || controlReason?.kind === 'unauthorized';

        me.getReference('family-rail').family = record.family ?? null;

        me.getReference('state-dot').set({
            // a pulse means a first-hand observation: an ok state pulses only when the runtime fact is
            // OBSERVED, never when merely inferred (state-honesty — the dot never overclaims liveness)
            live : displayState === 'ok' && sources.runtime.confidence === 'observed',
            state: displayState
        });

        me.getReference('card-state').set({
            cls : hot ? ['fm-card-state', 'fm-state-hot'] : ['fm-card-state'],
            text: stateLabel(displayState)
        });

        // The presence band: session state says what the resident's PROCESS does;
        // presence says whether the SEAT is alive anywhere (the plane's who_is_online graph
        // observation). Kept separate by construction — rendered only when the producer OBSERVED
        // a band; unknown/absent stays hidden (tier-degradation: absence of signal, never a
        // verdict, never a fabricated offline).
        const
            presence         = record.presence ?? null,
            presenceObserved = presence?.confidence === 'observed' &&
                Object.hasOwn(PRESENCE_BAND_LABEL, presence?.state);

        me.getReference('card-presence').set({
            hidden: !presenceObserved,
            text  : presenceObserved ? `◉ ${PRESENCE_BAND_LABEL[presence.state]}` : ''
        });

        // the name slot: the folded display name as MUTABLE DISPLAY STATE over the durable id
        const
            nameSlot   = resolveNameSlot(record),
            nameButton = me.getReference('card-name'),
            provenance = me.getReference('name-provenance'),
            chip       = describeNameProvenance(nameSlot.provenance.state);

        nameButton.text = nameSlot.text;
        nameButton[nameSlot.isFallback ? 'addCls' : 'removeCls']('fm-card-name-id');

        provenance.set({cls: chip.cls, hidden: chip.hidden, text: chip.text});

        if (!chip.hidden) {
            provenance.changeVdomRootKey('title', nameSlot.provenance.label);
            provenance.changeVdomRootKey('aria-label', nameSlot.provenance.label)
        }

        me.getReference('card-engine').text = record.engineTag ?? '';

        // the lane: head+tail middle elision so a shared prefix cannot collapse two lanes to the same
        // visible fragment — the preserved tail distinguishes them
        const
            lane   = me.getReference('card-lane'),
            elided = AgentCard.elideLaneLine(record.laneLine);

        // set the lane's CHILD nodes (mutating cn, not replacing the whole vdom — a full replace
        // clobbers the component's root id/cls and the lane never mounts). Each fragment renders as an
        // inert `text` node, NEVER `html`: record.laneLine is remote fleet data, and Neo's vdom `html`
        // is innerHTML — a text node cannot execute an adapter-supplied lane string (mirrors the
        // AgentDetail telltale contract: escaping is forgettable, a text node cannot be got wrong).
        lane.vdom.cn = elided.whole !== undefined
            ? [{tag: 'span', cls: ['fm-lane-whole'], text: elided.whole}]
            : [
                {tag: 'span', cls: ['fm-lane-elide'], text: elided.head},
                {tag: 'span', cls: ['fm-lane-tail'],  text: elided.tail}
            ];
        lane.update();

        // a badge only for a REPORTED positive count: null/absent = no stamped count → no badge
        const laneCount = Number.isInteger(record.openLaneCount) && record.openLaneCount > 0 ? record.openLaneCount : null;

        me.getReference('card-lane-count').set({
            hidden: laneCount === null,
            text  : laneCount === null ? '' : `${laneCount} ${laneCount === 1 ? 'lane' : 'lanes'}`
        });

        // the S2 telltale: both axes passed WHOLE (unknown ≠ null — the card never collapses the two)
        const
            telltale                         = me.getReference('card-telltale'),
            {ariaLabel, hidden, text, title} = describeTelltale({throttle: record.throttle, wake: record.wake});

        telltale.set({hidden, text});
        telltale.changeVdomRootKey('aria-label', ariaLabel);
        telltale.changeVdomRootKey('title', title);

        // the source strip: ONE honest word-line, a PURE role=status — no ▸/disclosure affordance on a
        // non-interactive node (the card-name drill → detail IS the disclosure route). The level cls
        // colours the ::before dot; summary.text is a controlled literal from summarizeFleetSources.
        // Rendered as an inert `text` node, NEVER `html`: that literal is safe only because the
        // summariser composes it from a frozen label map over a hardcoded key order, so `html` would
        // make safety a property the summariser must preserve forever rather than one the card cannot
        // get wrong — the same reason the lane above is a text node (escaping is forgettable; a text
        // node is not). A later edit folding a source REASON into the summary is then inert by
        // construction instead of an innerHTML path.
        const strip = me.getReference('source-strip');

        strip.set({
            cls : ['fm-card-strip', `fm-strip-${summary.level}`],
            text: summary.text
        });
        strip.changeVdomRootKey('aria-label', summary.ariaLabel);

        me.getReference('card-avatar').set({
            alt: record.displayName ?? '',
            src: record.avatarUrl ?? null
        });

        const
            toggle  = me.getReference('control-toggle'),
            restart = me.getReference('control-restart');

        toggle.set({disabled, iconCls: recordState === 'off' ? 'fa-solid fa-play' : 'fa-solid fa-stop'});
        // restart is meaningful only while running; at every card width it stays a real, visible control
        // (no hidden overflow) — the narrow row simply keeps both verbs as light, proportional icons
        restart.set({disabled, hidden: recordState === 'off'});

        // The accessible name must reach the DOM via the vdom root: `ariaLabel` is NOT a Neo config (it
        // maps to nothing), and these controls are icon-only (`.neo-button-text` is display:none), so the
        // aria-label IS their only accessible name. The FM roster names its subject on every verb.
        toggle.changeVdomRootKey('aria-label', `${recordState === 'off' ? 'Start' : 'Stop'} ${nameSlot.text}`);
        restart.changeVdomRootKey('aria-label', `Restart ${nameSlot.text}`);

        // the control round-trip only — the runtime-source gating is already shown by the disabled
        // controls + the source strip ("RUN not nominal"), so the status line never duplicates it
        me.getReference('control-status').set({
            hidden: !pendingAction && !controlReason,
            // pending takes visual priority over a prior reason, so a new attempt never shows a stale
            // rejection; a timeout reads as an unfinished "…" (retry stays open), not a resolved "⚠"
            text  : pendingAction
                ? `${pendingAction}…`
                : !controlReason
                    ? ''
                    : controlReason.kind === 'timeout'
                        ? `${controlReason.action}… stale — no response`
                        : `⚠ ${controlReason.kind}: ${controlReason.reason}`
        });

        me.update()
    }
}

export default Neo.setupClass(AgentCard);
