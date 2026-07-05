import Component from '../../../../src/component/Base.mjs';
import Container from '../../../../src/container/Base.mjs';
import EventChip from './EventChip.mjs';

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
 * @summary The fleet cockpit's live activity feed — a bounded, backpressure-aware stream of A2A / PR /
 * lane events. Composes {@link EventChip} for the kind chip (kind rendering delegates ENTIRELY to it —
 * this view passes the event's type straight through and holds zero local kind logic; unknown types
 * degrade to EventChip's neutral chip), timestamps each row, and caps the rendered window at
 * `maxVisible` with an honest "N more" fold so a burst can never grow the DOM unbounded or silently
 * drop. On adapter loss it degrades honestly — a stale banner, never a frozen feed. Event application
 * rides the normal data->VDom flow; no manual DOM.
 *
 * The live-adapter binding and the NL-verified live mount are sibling leaves; this leaf is the component
 * + its bounded-buffer contract, unit-provable against a burst fixture.
 *
 * @class AgentOS.view.fleet.ActivityStream
 * @extends Neo.container.Base
 */
class ActivityStream extends Container {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.ActivityStream'
         * @protected
         */
        className: 'AgentOS.view.fleet.ActivityStream',
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
         * Chronological (oldest->newest) activity events; the feed renders the newest `maxVisible`.
         * @member {Object[]} events_=[]
         * @reactive
         */
        events_: [],
        /**
         * The render-window bound — the density-derived cap (default 15) beyond which events fold.
         * @member {Number} maxVisible_=15
         * @reactive
         */
        maxVisible_: 15,
        /**
         * Feed liveness — `live` streams; `stale` renders the degrade banner (adapter loss), never a
         * silent freeze.
         * @member {String} adapterState_='live'
         * @reactive
         */
        adapterState_: 'live'
    }

    /**
     * @summary Build the feed once constructed — the items are data-derived, so the initial render
     * happens here rather than through static config.
     * @param {...*} args
     */
    onConstructed(...args) {
        super.onConstructed(...args);
        this.refreshFeed()
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
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAdapterState(value, oldValue) {
        this.isConstructed && this.refreshFeed()
    }

    /**
     * @summary Rebuild the bounded feed: the liveness header, the newest `maxVisible` event rows, and
     * the "N more" fold when the burst exceeds the window. Bounded by construction — the rendered child
     * count never exceeds the window + header + fold, regardless of event volume.
     */
    refreshFeed() {
        const {visible, overflowCount} = boundActivity(this.events, this.maxVisible),
              items                    = [this.headerConfig(), ...visible.map(event => this.rowConfig(event))];

        if (overflowCount > 0) {
            items.push(this.foldConfig(overflowCount))
        }

        this.removeAll(true);
        this.add(items)
    }

    /**
     * @summary The liveness header — a label + a streaming/stale indicator (the honest-degrade surface).
     * @returns {Object}
     */
    headerConfig() {
        const stale = this.adapterState === 'stale';

        return {
            module: Container,
            cls   : ['fm-stream-head', stale ? 'is-stale' : 'is-live'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [
                {module: Component, cls: ['fm-stream-label'], flex: 1,      text: 'Live activity'},
                {module: Component, cls: ['fm-stream-state'], flex: 'none', text: stale ? 'stale — reconnecting' : '● streaming'}
            ]
        }
    }

    /**
     * @summary One event row: timestamp, the kind chip (EventChip), and the text. The chip's kind is the
     * event's type passed straight through — EventChip + the kind registry own the kind->visual mapping,
     * so this row holds no kind logic and an unknown type degrades to the neutral chip.
     * @param {Object} event
     * @returns {Object}
     */
    rowConfig(event) {
        return {
            module: Container,
            cls   : ['fm-ev-row'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'start'},
            items : [
                {module: Component, cls: ['fm-ev-time'], flex: 'none', text: this.formatTime(event?.occurredAt)},
                {module: EventChip, flex: 'none', kind: event?.type},
                {module: Component, cls: ['fm-ev-text'], flex: 1, text: this.eventText(event)}
            ]
        }
    }

    /**
     * @summary The overflow fold — the honest count of events beyond the window (never a silent drop).
     * @param {Number} overflowCount
     * @returns {Object}
     */
    foldConfig(overflowCount) {
        return {
            module: Component,
            cls   : ['fm-stream-fold'],
            flex  : 'none',
            text  : `${overflowCount} more`
        }
    }

    /**
     * @summary UTC HH:MM for a row timestamp — deterministic (no locale / timezone drift); an em dash
     * when the event carries no time.
     * @param {String|Number|null} occurredAt
     * @returns {String}
     */
    formatTime(occurredAt) {
        if (occurredAt == null) {
            return '—'
        }

        const date = new Date(occurredAt);

        return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(11, 16)
    }

    /**
     * @summary The row's human text — the event payload's summary when present, else an agent + type
     * fallback so an un-summarized event still reads.
     * @param {Object} event
     * @returns {String}
     */
    eventText(event) {
        return event?.payload?.text ?? event?.payload?.summary ?? `${event?.agentId ?? 'fleet'} · ${event?.type ?? 'event'}`
    }
}

export default Neo.setupClass(ActivityStream);
