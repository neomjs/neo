import AgentCardController    from './AgentCardController.mjs';
import Button                 from '../../../../src/button/Base.mjs';
import Container              from '../../../../src/container/Base.mjs';
import FamilyRail             from './FamilyRail.mjs';
import Image                  from '../../../../src/component/Image.mjs';
import StateDot, {stateLabel} from './StateDot.mjs';

import {normalizeFleetSources, summarizeFleetSources} from './sourceHealth.mjs';

import {describeNameProvenance, resolveNameSlot} from './nameSlot.mjs';
import {describeTelltale}                        from './telltale.mjs';

/**
 * The resident card: the cockpit's atom — the #15536 evolved-D/synthesis composition (operator
 * SELECT 2026-07-19: B/C identity-first hierarchy + D's narrow mechanics + A as roomy alignment).
 * Composes the class-based fleet primitives (FamilyRail + StateDot) with a profile avatar, a
 * two-line identity column, contextual actions, a tail-aware lane, and an honest source-summary
 * strip into the card anatomy — responsive to the card's OWN width via `@container` (ADR 0029:
 * layout-blind to docking; never viewport media queries).
 *
 * Anatomy (top-to-bottom, family rail as a left `::before`):
 * - **head** — avatar spanning a two-line **identity** column: `name-line` (name · provenance ·
 *   engine) over `state-line` (dot · state-word · lane-count badge · telltale), with the contextual
 *   lifecycle **actions** right-aligned;
 * - **work-row** — the current lane, two-line clamped with head+tail middle elision so two lanes
 *   sharing a prefix still distinguish by their preserved tail (the #14592 narrow falsifier);
 * - **strip** — ONE honest source word-line ("all sources nominal" / "REP not nominal"), retiring
 *   the three 9px markers; full facts stay reachable via the drill (detail), never hover-only.
 *
 * **Width modes are card-owned** (SCSS `@container`): narrow (<320px) scales the avatar to 32px,
 * hides the engine tag, and collapses the actions to one 44px target; regular/wide keep the full
 * identity. Severity changes the state-word's **weight** on a text-safe ink, never the dot's hue as
 * text (the WCAG 1.4.1→1.4.3 trap avoided by construction). #15512/#15534 state-as-text holds.
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
         * The family rail is a left `::before` on the card root (SCSS), so the root stacks the three
         * anatomy rows directly — one container level fewer than the rail-as-child shape.
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
            layout: {ntype: 'hbox', align: 'start'},

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
                cls      : ['fm-card-actions'],
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
     * elided middle. Two lanes sharing a prefix (the #14592 narrow falsifier) still distinguish by
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
            // the runtime fact gates a resolved session state: a runtime observation renders as a
            // resolved state only when the source is wired (else 'off'); a transitional pendingAction is
            // a first-party fact (we sent the intent) and takes precedence with no runtime-source gate
            runtimeWired  = sources.runtime.state === 'wired',
            recordState   = record.state ?? 'off',
            resolvedState = runtimeWired ? recordState : 'off',
            displayState  = pendingAction === 'stop'
                ? 'stopping'
                : pendingAction // 'start' | 'restart' both transition toward running
                    ? 'starting'
                    : resolvedState,
            // severity = weight: the exceptional resolved states take ink + weight on the word
            hot           = displayState === 'wedged' || displayState === 'limited',
            // the runtime source's own reason feeds the control-status honesty line when it gates
            sourceReason  = runtimeWired
                ? null
                : sources.runtime.state === 'missing' ? 'RUN MISSING' : 'RUN NOT WIRED',
            disabled      = Boolean(pendingAction) || !runtimeWired || controlReason?.kind === 'unauthorized';

        me.getReference('family-rail').family = record.family ?? null;

        me.getReference('state-dot').set({
            live : displayState === 'ok',
            state: displayState
        });

        me.getReference('card-state').set({
            cls : hot ? ['fm-card-state', 'fm-state-hot'] : ['fm-card-state'],
            text: stateLabel(displayState)
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
        // clobbers the component's root id/cls and the lane never mounts)
        lane.vdom.cn = elided.whole !== undefined
            ? [{tag: 'span', cls: ['fm-lane-whole'], html: elided.whole}]
            : [
                {tag: 'span', cls: ['fm-lane-elide'], html: elided.head},
                {tag: 'span', cls: ['fm-lane-tail'],  html: elided.tail}
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

        // the source strip: ONE honest word-line; the level cls colours the ::before dot
        const strip = me.getReference('source-strip');

        strip.set({
            cls : ['fm-card-strip', `fm-strip-${summary.level}`],
            html: `${summary.text} ▸`
        });
        strip.changeVdomRootKey('aria-label', summary.ariaLabel);

        me.getReference('card-avatar').set({
            alt: record.displayName ?? '',
            src: record.avatarUrl ?? null
        });

        me.getReference('control-toggle').set({
            disabled,
            ariaLabel: `${recordState === 'off' ? 'Start' : 'Stop'} ${nameSlot.text}`,
            iconCls  : recordState === 'off' ? 'fa-solid fa-play' : 'fa-solid fa-stop'
        });

        me.getReference('control-restart').set({
            disabled,
            ariaLabel: `Restart ${nameSlot.text}`,
            hidden   : recordState === 'off'
        });

        me.getReference('control-status').set({
            hidden: !pendingAction && !controlReason && !sourceReason,
            // pending takes visual priority over a prior reason, so a new attempt never shows a stale
            // rejection; a timeout reads as an unfinished "…" (retry stays open), not a resolved "⚠"
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
