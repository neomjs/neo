import ActorChip          from './ActorChipComponent.mjs';
import Component          from '../../../../../src/component/Base.mjs';
import Container          from '../../../../../src/container/Base.mjs';
import EventChip          from './EventChipComponent.mjs';
import {formatViewerTime} from '../../../util/viewerTime.mjs';

/**
 * @summary Bound an activity-event list to the render window — the load-bearing backpressure core.
 * Returns the newest `maxVisible` events (newest-first) plus the count folded out of view. The measured
 * boot-burst density (bursts that overflow a small window in tens of seconds) makes this non-decorative:
 * an unbounded feed freezes the frame (falsifying the engine story) and a silent drop falsifies the feed,
 * so the window is bounded and the overflow is surfaced honestly. Pure + serializable; the component
 * renders its result, so the bound is unit-provable in isolation.
 * @param {Object[]} events Chronological (oldest→newest) activity events.
 * @param {Number} maxVisible The render-window bound.
 * @returns {Object} `{visible: Object[] newest-first, length <= maxVisible; overflowCount: Number}`
 */
export function boundActivity(events, maxVisible) {
    const list          = Array.isArray(events) ? events : [],
          bound         = Number.isInteger(maxVisible) && maxVisible > 0 ? maxVisible : 0,
          overflowCount = Math.max(0, list.length - bound),
          visible       = list.slice(overflowCount).reverse();

    return {visible, overflowCount}
}

/**
 * @summary Coalesce same-actor event RUNS into grouped rows — the measured-density consequence:
 * a sustained burst (above ~2 events/min from one actor) rendered one-row-per-event floods the
 * window with repetition and pushes every OTHER actor out of view. Consecutive events from the
 * SAME `agentId` whose timestamps sit closer than `gapMs` join one row carrying the run's count
 * and its newest event. Honesty bounds the grouping: an event with no/invalid timestamp, an
 * anonymous event (no `agentId`), or an out-of-order timestamp can never PROVE run membership,
 * so each renders as its own row and breaks the run — grouping only what is evidenced. Pure +
 * serializable, so the rule is unit-provable in isolation.
 * @param {Object[]} events Chronological (oldest→newest) activity events.
 * @param {Number} gapMs Max gap between consecutive same-actor events to count as one run.
 * @returns {Object[]} Chronological rows: `{agentId, count, events: Object[], newest: Object}`.
 */
export function coalesceActivity(events, gapMs) {
    const list = Array.isArray(events) ? events : [],
          gap  = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 0,
          rows = [];

    let lastRow  = null,
        lastTime = NaN;

    list.forEach(event => {
        const agentId = event?.agentId ?? null,
              time    = Date.parse(event?.occurredAt);

        const joinsRun = lastRow !== null && agentId !== null && lastRow.agentId === agentId
            && Number.isFinite(time) && Number.isFinite(lastTime)
            && time - lastTime >= 0 && time - lastTime < gap;

        if (joinsRun) {
            lastRow.count++;
            lastRow.events.push(event);
            lastRow.newest = event
        } else {
            lastRow = {agentId, count: 1, events: [event], newest: event};
            rows.push(lastRow)
        }

        // an unprovable timestamp breaks the run for the NEXT event too — a follower cannot
        // evidence its gap against a row whose newest time is unknown
        lastTime = time
    });

    return rows
}

/**
 * @summary The fleet cockpit's live activity feed — a bounded, backpressure-aware stream of A2A / PR /
 * lane events. Composes {@link EventChip} for the kind chip (kind rendering delegates ENTIRELY to it —
 * this view passes the event's type straight through and holds zero local kind logic; unknown types
 * degrade to EventChip's neutral chip) and timestamps each row. On adapter loss it degrades honestly —
 * a stale banner, never a frozen feed. Event application rides the normal data->VDom flow; no manual DOM.
 *
 * Three bounds hold the feed honest under measured burst pressure, each frozen from live density
 * evidence (sustained 0.5–1 events/min on a sprint day, ~3.6/min p95 burst):
 * 1. **The ring** — `bufferSize` (200 ≈ 55min of the worst recorded burst) caps the HELD events;
 *    an overlong payload drops oldest-first and the drop is COUNTED, never silent.
 * 2. **Coalescing** — same-actor runs above ~2/min ({@link module:apps/agentos/view/fleet/ActivityStream~coalesceActivity})
 *    group into one row carrying the run count, so one busy actor cannot flood every other off the glass.
 * 3. **The window** — the newest `maxVisible` rows render; everything older folds into the honest
 *    "N earlier events" line (N counts EVENTS — folded rows' runs plus ring drops — never rows).
 *
 * @class AgentOS.view.fleet.activity.Container
 * @extends Neo.container.Base
 */
class ActivityStream extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.activity.Container'
         * @protected
         */
        className: 'AgentOS.view.fleet.activity.Container',
        /**
         * @member {String} ntype='fm-activity-stream'
         * @protected
         */
        ntype: 'fm-activity-stream',
        /**
         * @member {String[]} baseCls=['fm-activity-stream']
         */
        baseCls: ['fm-activity-stream'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The held-event ring bound: a payload longer than this keeps its NEWEST `bufferSize`
         * events (drop-oldest), and the drop is counted into the fold — the feed's memory can
         * never grow unbounded, and a drop is never silent. Reactive INCLUDING the held payload:
         * a runtime shrink re-bounds the events already held (their drop joins the fold count); a
         * grow widens the bound for the next payload only. Positive integers only — an invalid
         * bound is refused, never a disabled ring. 200 holds ~55 minutes of the worst measured
         * burst (~3.6 events/min p95).
         * @member {Number} bufferSize_=200
         * @reactive
         */
        bufferSize_: 200,
        /**
         * The same-actor coalescing threshold: consecutive events from one `agentId` closer than
         * this join one grouped row (~2/min — the measured rate above which one actor's run
         * floods the window). See {@link module:apps/agentos/view/fleet/ActivityStream~coalesceActivity}.
         * @member {Number} coalesceGapMs_=30000
         * @reactive
         */
        coalesceGapMs_: 30000,
        /**
         * Chronological (oldest->newest) activity events; capped to the newest `bufferSize` on
         * the way in, then coalesced + windowed for render.
         * @member {Object[]} events_=[]
         * @reactive
         */
        events_: [],
        /**
         * The render-window bound — the density-frozen visible ROW cap (10–12 measured; 12)
         * beyond which rows fold.
         * @member {Number} maxVisible_=12
         * @reactive
         */
        maxVisible_: 12,
        /**
         * Feed liveness — `live` streams; `sample` labels a representative (source-not-wired) feed so it
         * is never mistaken for live; `stale` renders the degrade banner (adapter loss). None of the
         * three is a silent freeze — the header always states which one is showing.
         * @member {String} adapterState_='live'
         * @reactive
         */
        adapterState_: 'live',
        /**
         * Roster-joined actor facts, injected by the owner (`agentId → {avatarUrl, displayName}`,
         * both fields optional). The stream renders identity it is GIVEN: an actor missing from
         * the directory renders handle-only, an event without an `agentId` composes no actor chip
         * at all — honest absence, never a fabricated identity (the stream's existing
         * null-agentId contract, now visible instead of implied).
         * @member {Object} actorDirectory_={}
         * @reactive
         */
        actorDirectory_: {}
    }

    /**
     * Events the ring dropped from the CURRENT payload: the intake drop (payload length minus
     * `bufferSize`) plus any later runtime-shrink drops on the same payload — cumulative within
     * the payload, RESET by the next `events` assignment. Folded into the "N earlier events"
     * count so no drop is ever silent.
     * @member {Number} droppedCount=0
     * @protected
     */
    droppedCount = 0

    /**
     * @summary Build the feed once constructed — the items are data-derived, so the initial render
     * happens here rather than through static config.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);

        // a11y: the live feed is a log region — new rows are announced to assistive tech `polite`ly
        // (never interrupting), with a name. Without this an updating feed is silent to screen
        // readers. Set on the root before the first `refreshFeed` render flushes the vdom.
        Object.assign(this.vdom, {'aria-live': 'polite', 'aria-label': 'Live fleet activity', role: 'log', tabIndex: 0});

        this.refreshFeed()
    }

    /**
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAdapterState(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @summary The reactive half of the ring contract: a runtime SHRINK re-bounds the already-held
     * events (drop-oldest, silently via the raw backing store — no beforeSet re-entry, which would
     * reset the payload's drop accounting) and ADDS the shrink's drop to {@link #droppedCount}, so
     * the fold stays honest about everything gone from the current payload. A grow only widens the
     * bound for the NEXT payload — dropped events are gone, never resurrected.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferSize(value, oldValue) {
        let me = this;

        if (!me.isConstructed) {
            return
        }

        const held   = me._events || [],
              excess = Math.max(0, held.length - value);

        if (excess > 0) {
            me.droppedCount += excess;
            me._events = held.slice(-value)   // silent raw update: re-bound without re-entering beforeSetEvents
        }

        me.refreshFeed()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCoalesceGapMs(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetEvents(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxVisible(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetActorDirectory(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @summary Guard the ring bound itself: only a positive integer can BE a buffer bound — zero,
     * negatives, and non-finite values would silently disable the ring (`slice(-0)` retains
     * everything), so an invalid value is refused and the previous bound (or the density default)
     * stays in force.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetBufferSize(value, oldValue) {
        return Number.isInteger(value) && value > 0 ? value : (oldValue ?? 200)
    }

    /**
     * @summary The ring: an incoming payload keeps only its NEWEST `bufferSize` events
     * (drop-oldest), and the drop count lands in {@link #droppedCount} for the fold — the feed's
     * held memory is bounded by construction, and a drop is surfaced, never silent.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @returns {Object[]}
     * @protected
     */
    beforeSetEvents(value, oldValue) {
        const list  = Array.isArray(value) ? value : [],
              bound = this.bufferSize;

        this.droppedCount = Math.max(0, list.length - bound);

        return this.droppedCount > 0 ? list.slice(-bound) : list
    }

    /**
     * @summary Rebuild the bounded feed: the liveness header, the newest `maxVisible` rows (each a
     * single event or a coalesced same-actor run), and the "N earlier events" fold whenever events
     * sit beyond the glass — folded rows' runs plus anything the ring dropped. Bounded by
     * construction — the rendered child count never exceeds the window + header + fold, regardless
     * of event volume, and the fold counts EVENTS (the honest unit), never rows.
     */
    refreshFeed() {
        const me                       = this,
              rows                     = coalesceActivity(me.events, me.coalesceGapMs),
              {visible, overflowCount} = boundActivity(rows, me.maxVisible),
              foldedEventCount         = rows.slice(0, overflowCount).reduce((count, row) => count + row.count, 0),
              earlierCount             = foldedEventCount + me.droppedCount,
              items                    = [me.headerConfig(), ...visible.map(row => me.rowConfig(row))];

        if (earlierCount > 0) {
            items.push(me.foldConfig(earlierCount))
        }

        me.removeAll(true);
        me.add(items)
    }

    /**
     * @summary The liveness header — a label + an honest state indicator: `● streaming` (live),
     * `sample · live feed pending` (representative, source not wired), or `stale — reconnecting`
     * (adapter loss). The state is always named so the feed can never silently pose as live.
     * @returns {Object}
     */
    headerConfig() {
        const state     = this.adapterState,
              stateText = {sample: 'sample · live feed pending', stale: 'stale — reconnecting'}[state] ?? '● streaming',
              stateCls  = {sample: 'is-sample', stale: 'is-stale'}[state] ?? 'is-live';

        return {
            module: Container,
            cls   : ['fm-stream-head', stateCls],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [
                {module: Component, cls: ['fm-stream-label'], flex: 1,      text: 'Live activity'},
                {module: Component, cls: ['fm-stream-state'], flex: 'none', text: stateText}
            ]
        }
    }

    /**
     * @summary One feed row from a coalesced row descriptor: timestamp, the kind chip (EventChip),
     * and the text — the row's NEWEST event carries all three. The chip's kind is that event's type
     * passed straight through — EventChip + the kind registry own the kind->visual mapping, so this
     * row holds no kind logic and an unknown type degrades to the neutral chip. A run (count > 1)
     * renders as ONE grouped row: the `×N` prefix carries the run count, the newest event the text.
     * @param {Object} row A `coalesceActivity` row: `{agentId, count, events, newest}`.
     * @returns {Object}
     */
    rowConfig(row) {
        const
            me        = this,
            event     = row.newest,
            coalesced = row.count > 1,
            actor     = me.actorChipConfig(row),
            recipient = me.recipientConfig(event);

        return {
            module: Container,
            cls   : coalesced ? ['fm-ev-row', 'fm-ev-coalesced'] : ['fm-ev-row'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'start'},
            items : [
                {module: Component, cls: ['fm-ev-time'], flex: 'none', vdom: me.timeVdom(event?.occurredAt)},
                {module: EventChip, flex: 'none', kind: event?.type},
                // the actor chip renders the coalescing KEY: a run row shows its actor ONCE
                // beside the count instead of implying it; an anonymous event composes no chip
                ...(actor ? [actor] : []),
                ...(recipient ? [recipient] : []),
                {module: Component, cls: ['fm-ev-text'], flex: 1, text: coalesced ? `×${row.count} · ${me.eventText(event)}` : me.eventText(event)}
            ]
        }
    }

    /**
     * @summary The row's actor chip config — the coalescing key made visible. Roster facts join
     * from the injected {@link #actorDirectory}; a missing directory entry renders handle-only,
     * a null `agentId` composes NO chip (honest absence per the stream's null-agentId contract).
     * @param {Object} row A `coalesceActivity` row.
     * @returns {Object|null}
     */
    actorChipConfig(row) {
        const agentId = row?.agentId;

        if (!agentId) {
            return null
        }

        const facts = this.actorDirectory?.[agentId] ?? this.actorDirectory?.[String(agentId).replace(/^@/, '')] ?? {};

        return {
            module   : ActorChip,
            flex     : 'none',
            agentId,
            avatarUrl: facts.avatarUrl ?? null,
            label    : facts.displayName ?? null
        }
    }

    /**
     * @summary The A2A row's recipient piece — sender→recipient as a compact cell: a directed
     * send renders `→ @recipient`, a broadcast renders the visually distinct `⇒ fleet` (class +
     * arrow both differ — the reader distinguishes them without color). Non-A2A kinds and rows
     * whose payload names no recipient compose nothing — the DTO's absence renders as absence.
     * @param {Object} event The row's newest event.
     * @returns {Object|null}
     */
    recipientConfig(event) {
        const
            payload   = event?.payload,
            isA2A     = event?.type === 'a2a-activity' || event?.type === 'lane-claim',
            to        = typeof payload?.to === 'string' && payload.to !== '' ? payload.to : null,
            broadcast = payload?.recipientClass === 'broadcast';

        if (!isA2A || (!to && !broadcast)) {
            return null
        }

        return {
            module: Component,
            cls   : ['fm-ev-recipient', broadcast ? 'is-broadcast' : 'is-direct'],
            flex  : 'none',
            text  : broadcast ? '⇒ fleet' : `→ ${to}`,
            // the raw address stays citable on hover — `AGENT:*` for broadcasts, the exact id otherwise
            vdom  : {title: to ?? 'AGENT:*'}
        }
    }

    /**
     * @summary The overflow fold — the honest count of EVENTS beyond the glass: the folded rows'
     * runs plus anything the ring dropped (never a silent drop, never a row count posing as one).
     * @param {Number} earlierCount
     * @returns {Object}
     */
    foldConfig(earlierCount) {
        return {
            module: Component,
            cls   : ['fm-stream-fold'],
            flex  : 'none',
            text  : `${earlierCount} earlier events`
        }
    }

    /**
     * @summary The row's time cell: viewer-local text with the exact UTC instant on hover.
     *
     * Previously this rendered `toISOString().slice(11, 16)` — UTC HH:MM, defended as "deterministic
     * (no locale / timezone drift)". That determinism was real and aimed at the wrong reader: the
     * WIRE must be zone-free so receipts cross-check, but a human scanning a live stream in
     * Europe/Berlin was doing offset arithmetic on every glance at a surface built for at-a-glance
     * truth. Both readers are now served — local text for the eye, `title` carrying the ISO instant
     * for anyone citing the row as evidence.
     *
     * The em dash stays HERE rather than moving into the shared formatter: `viewerTime` owns the
     * format and returns null for an unformattable instant, while each surface keeps its own
     * miss-copy, because a dense stream row and a prose pane want different words for "no time".
     * @param {String|Number|null} occurredAt
     * @returns {Object} vdom node — `text` always, `title` only when there is an instant to cite
     */
    timeVdom(occurredAt) {
        const view = formatViewerTime(occurredAt);

        return view ? {text: view.text, title: view.title} : {text: '—'}
    }

    /**
     * @summary The row's human text — the event payload's summary/subject when present, else an agent +
     * type fallback so an un-summarized event still reads. `subject` is the live A2A/PR/lane adapter's
     * text field (fixtures carry `text`); both are honored so real feed events render meaningfully.
     * The chain accepts STRINGS only: two payload vocabularies share the `subject` key — A2A rows
     * carry the message subject (a string), work-stall rows carry the stall's subject ENTITY (an
     * object) — and an object reaching a text node renders the literal `[object Object]`. Stall
     * rows build their text from the entity instead; anything else shapeless takes the named
     * agent+type fallback, never a raw object.
     * @param {Object} event
     * @returns {String}
     */
    eventText(event) {
        const
            payload = event?.payload,
            text    = [payload?.text, payload?.summary, payload?.subject]
                .find(value => typeof value === 'string' && value !== '');

        if (text) {
            return text
        }

        if (payload?.kind === 'work-stall') {
            return this.stallText(payload)
        }

        return `${event?.agentId ?? 'fleet'} · ${event?.type ?? 'event'}`
    }

    /**
     * @summary The stall row's human text, from the finding's subject entity: reference (number or
     * id) + title when present, else the finding class — a stall without a describable subject
     * still reads as a stall, never as `[object Object]`.
     * @param {Object} payload A `work-stall` event payload (`subject` per the PR/lane adapter).
     * @returns {String}
     */
    stallText(payload) {
        const
            subject = payload?.subject,
            ref     = subject?.number != null ? `#${subject.number}` : (subject?.id ?? null),
            title   = typeof subject?.title === 'string' && subject.title !== '' ? subject.title : null,
            detail  = [ref, title].filter(Boolean).join(' · ');

        return detail ? `stalled · ${detail}` : `stalled · ${payload?.findingClass ?? 'work item'}`
    }
}

export default Neo.setupClass(ActivityStream);
