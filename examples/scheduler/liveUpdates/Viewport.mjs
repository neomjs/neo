import Button                       from '../../../src/button/Base.mjs';
import Component                    from '../../../src/component/Base.mjs';
import Container                    from '../../../src/container/Base.mjs';
import FlightStore, {ROUTE_CATALOG} from './FlightStore.mjs';
import GateStore, {GATES}           from './GateStore.mjs';
import Label                        from '../../../src/component/Label.mjs';
import Scheduler                    from '../../../src/scheduler/Container.mjs';
import StateProvider                from '../../../src/state/Provider.mjs';
import ThemeSwitcher                from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                      from '../../../src/toolbar/Base.mjs';
import Viewport                     from '../../../src/container/Viewport.mjs';

const
    AXIS_START      = '2026-11-09T06:00:00Z',
    AXIS_END        = '2026-11-09T12:00:00Z',
    AXIS_END_MS     = Date.parse(AXIS_END),
    OUTSIDE_NOW     = '2026-10-01T00:00:00Z',
    DEFAULT_SEED    = 19257,
    DEFAULT_TICK_MS = 1000,
    COMPACT_BODY_PX = 640,
    DESKTOP_PPM     = 4.5,
    MOBILE_PPM      = 3.0,
    MS_PER_MINUTE   = 60_000,
    MS_PER_HOUR     = 3_600_000,
    GATE_BY_ID      = new Map(GATES.map(gate => [gate.id, gate])),
    PIER_COLOR_CLS  = {A: 'neo-scheduler-bar-cyan', B: 'neo-scheduler-bar-violet', C: 'neo-scheduler-bar-emerald'},
    hourFormatter   = new Intl.DateTimeFormat('en-GB', {
        hour    : '2-digit',
        hour12  : false,
        minute  : '2-digit',
        timeZone: 'UTC'
    });

/**
 * @summary Deterministic 32-bit Mulberry32 PRNG returning floats in `[0, 1)`.
 * @param {Number} seed
 * @returns {Function}
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/**
 * @summary Formats `[start, end]` timestamps as a compact `'HH:MM–HH:MM'` UTC range string.
 * @param {Date|Number|String} start
 * @param {Date|Number|String} end
 * @returns {String}
 */
function formatUtcRange(start, end) {
    const
        s = start instanceof Date ? start : new Date(start),
        e = end   instanceof Date ? end   : new Date(end);
    return `${hourFormatter.format(s)}–${hourFormatter.format(e)}`
}

/**
 * @summary Custom `barRenderer` styling each flight bar by pier and decorating changed flights with at-rest (`is-feed-fresh`) and fading (`is-feed-fading`) markers.
 * @param {Object} barDescriptor
 * @param {Object} context
 * @returns {Object}
 */
function renderFlightBar(barDescriptor, {vdom}) {
    const
        {bar, endDate, startDate, title} = barDescriptor,
        gate                             = GATE_BY_ID.get(String(bar.resourceId)),
        pier                             = gate?.pier || bar.pier || 'A',
        feedMark                         = bar.feedMark || '',
        deltaText                        = bar.deltaText || '',
        status                           = bar.status || 'scheduled',
        code                             = bar.flightCode || title,
        city                             = bar.city || '',
        barId                            = vdom.id,
        labelNode                        = vdom.cn.find(child => child.id === `${barId}__label`),
        rangeText                        = formatUtcRange(startDate, endDate);

    vdom.cls.push(
        'gate-flight-bar',
        `gate-pier-${pier.toLowerCase()}`,
        PIER_COLOR_CLS[pier] || 'neo-scheduler-bar-cyan'
    );

    if (feedMark === 'fresh') {
        vdom.cls.push('is-feed-fresh');
        vdom.data.feedMark = 'fresh'
    } else if (feedMark === 'fading') {
        vdom.cls.push('is-feed-fading');
        vdom.data.feedMark = 'fading'
    }

    const statusSuffix = status === 'delayed' ? 'Delayed' : status === 'arrived' ? 'New arrival' : `Pier ${pier}`;
    vdom['aria-label'] = `${code} ${city}, ${gate?.name || bar.resourceId}, ${rangeText} (${statusSuffix}${feedMark ? `, ${feedMark}` : ''})`;

    if (labelNode) {
        labelNode.cls.push('gate-bar-body');
        delete labelNode.text;

        const topChildren = [{
            tag : 'span',
            id  : `${barId}__code`,
            cls : ['gate-bar-code'],
            text: city ? `${code} · ${city}` : title
        }];

        if (feedMark && deltaText) {
            topChildren.push({
                tag : 'span',
                id  : `${barId}__delta`,
                cls : ['gate-bar-delta', feedMark === 'fading' ? 'is-fading' : 'is-fresh'],
                text: deltaText
            })
        }

        labelNode.cn = [{
            tag: 'span',
            id : `${barId}__top`,
            cls: ['gate-bar-top'],
            cn : topChildren
        }, {
            tag : 'span',
            id  : `${barId}__meta`,
            cls : ['gate-bar-meta'],
            text: `${rangeText} · ${statusSuffix}`
        }]
    }

    return vdom
}

/**
 * @summary Airport gate operations scheduler driven by an in-worker seeded simulated feed (~1 update/s) while preserving scroll position and active drags.
 * @class Neo.examples.scheduler.liveUpdates.Viewport
 * @extends Neo.container.Viewport
 */
class GateOperationsViewport extends Viewport {
    static config = {
        className    : 'Neo.examples.scheduler.liveUpdates.Viewport',
        cls          : ['gate-viewport'],
        layout       : {ntype: 'vbox', align: 'stretch'},
        stateProvider: {
            module: StateProvider,
            data  : {
                changeCount: 0,
                paused     : false
            },
            formulas: {
                changeCounterText: data => data.changeCount === 1 ? '1 change' : `${data.changeCount} changes`
            },
            stores: {
                flights: {module: FlightStore},
                gates  : {module: GateStore}
            }
        },
        items: [{
            module: Toolbar,
            cls   : ['gate-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['gate-title'],
                text  : 'Gate operations'
            }, {
                module   : Label,
                cls      : ['gate-sim-badge'],
                reference: 'sim-badge',
                text     : 'Simulated feed'
            }, {
                ntype: 'component',
                cls  : ['gate-spacer'],
                flex : 1
            }, {
                module   : Label,
                bind     : {text: data => data.changeCounterText},
                cls      : ['gate-counter'],
                reference: 'change-counter'
            }, {
                module   : Button,
                bind     : {pressed: data => data.paused},
                cls      : ['gate-pause-btn'],
                handler  : 'up.onTogglePause',
                pressed  : false,
                reference: 'pause-button',
                text     : 'Pause'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module   : Container,
            cls      : ['gate-feed-bar'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            reference: 'feed-bar',
            items    : [{
                module   : Component,
                cls      : ['gate-feed-ticker'],
                reference: 'feed-ticker',
                vdom     : {
                    cls: ['gate-feed-ticker'],
                    cn : [{
                        tag : 'span',
                        cls : ['gate-feed-kind', 'is-live'],
                        text: 'Live · 1/s'
                    }, {
                        tag : 'span',
                        cls : ['gate-feed-summary'],
                        text: '60 flights across 14 gates · 06:00–12:00 UTC · Scroll or drag a flight while the feed runs'
                    }]
                }
            }, {
                ntype: 'component',
                cls  : ['gate-feed-spacer'],
                flex : 1
            }, {
                module: Component,
                cls   : ['gate-legend'],
                vdom  : {
                    cls: ['gate-legend'],
                    cn : [{
                        tag : 'span',
                        cls : ['gate-legend-chip', 'is-fresh'],
                        text: 'Just changed'
                    }, {
                        tag : 'span',
                        cls : ['gate-legend-chip', 'is-fading'],
                        text: 'Fading'
                    }]
                }
            }]
        }, {
            module         : Scheduler,
            barDraggable   : true,
            barMarginPct   : 10,
            barRenderer    : renderFlightBar,
            bind           : {eventStore: 'stores.flights', store: 'stores.gates'},
            cls            : ['gate-scheduler'],
            editable       : false,
            flex           : 1,
            listeners      : {eventChange: 'up.onVisitorMoveFlight'},
            majorFormatter : () => 'Monday, 9 November 2026 · UTC',
            majorTickUnit  : 'day',
            minimumDuration: 20,
            minorFormatter : tick => hourFormatter.format(tick.date),
            reference      : 'scheduler',
            resizableBars  : true,
            resourceColumns: [{
                dataField: 'name',
                locked   : 'start',
                text     : 'Gate',
                width    : 108
            }],
            rowHeight: 62,
            timeAxis : {
                end        : AXIS_END,
                now        : OUTSIDE_NOW,
                pxPerMinute: DESKTOP_PPM,
                snapMinutes: 5,
                start      : AXIS_START,
                tickStep   : 1,
                tickUnit   : 'hour',
                timeZone   : 'UTC'
            }
        }]
    }

    #arrivalSeq = 200
    #feedTimer  = null
    #isCompact  = null
    #rng        = null
    #tickMs     = DEFAULT_TICK_MS

    /** @summary Initializes the seeded PRNG from URL params (default `19257`), starts the 1s feed, and binds responsive body scaling. */
    onConstructed() {
        super.onConstructed();

        const
            params      = new URLSearchParams(Neo.config.url?.search || ''),
            rawSeed     = Number(params.get('seed')),
            rawInterval = Number(params.get('interval')),
            seed        = Number.isFinite(rawSeed) && params.has('seed') ? (rawSeed >>> 0) : DEFAULT_SEED;

        this.#rng    = mulberry32(seed);
        this.#tickMs = Number.isFinite(rawInterval) && rawInterval >= 50 ? Math.round(rawInterval) : DEFAULT_TICK_MS;

        const body = this.getReference('scheduler')?.body;
        if (body) {
            this.observeConfig(body, 'containerWidth', width => this.applyResponsiveScale(width));
            if (body.containerWidth > 0) {
                this.applyResponsiveScale(body.containerWidth)
            }
        }

        this.startFeed()
    }

    /** @summary Clears the feed interval when the viewport is destroyed. */
    destroy(...args) {
        this.stopFeed();
        super.destroy(...args)
    }

    /** @summary Starts the periodic simulated feed timer if not paused or destroyed. */
    startFeed() {
        if (this.#feedTimer || this.isDestroyed || this.getStateProvider()?.data?.paused) {
            return
        }

        this.#feedTimer = setInterval(() => {
            if (this.isDestroyed) {
                this.stopFeed();
                return
            }
            this.stepFeed()
        }, this.#tickMs)
    }

    /** @summary Stops the periodic simulated feed timer. */
    stopFeed() {
        if (this.#feedTimer !== null) {
            clearInterval(this.#feedTimer);
            this.#feedTimer = null
        }
    }

    /** @summary Toggles `paused` on the root `StateProvider`, halting or resuming the simulated feed. */
    onTogglePause() {
        const provider = this.getStateProvider();
        if (!provider) {
            return
        }

        const nextPaused = !provider.data.paused;
        provider.data.paused = nextPaused;
        this.toggleCls('is-paused', nextPaused);

        if (nextPaused) {
            this.stopFeed();
            this.updateTicker('paused', 'Paused', `Feed paused at ${provider.data.changeCount} ${provider.data.changeCount === 1 ? 'change' : 'changes'} · Scroll or drag any flight`)
        } else {
            this.updateTicker('live', 'Live · 1/s', 'Simulated feed resumed · Updates arrive every second');
            this.startFeed()
        }
    }

    /** @summary Announces visitor drag/resize commits in the sub-toolbar without incrementing the simulated feed counter. */
    onVisitorMoveFlight({action, record}) {
        if (!record || this.isDestroyed) {
            return
        }

        const
            gateName  = GATE_BY_ID.get(String(record.resourceId))?.name || record.resourceId,
            rangeText = formatUtcRange(record.startDate, record.endDate),
            verb      = action === 'resize' ? 'Turnaround resized' : 'Gate reassigned';

        this.updateTicker('manual', verb, `${record.flightCode || record.title} → ${gateName} · ${rangeText}`)
    }

    /**
     * @summary Executes one deterministic simulated feed mutation (`delay`, `arrive`, or `depart`), advancing previous `'fresh'` marks to `'fading'` and skipping any flight currently being dragged.
     */
    stepFeed() {
        const
            provider  = this.getStateProvider(),
            scheduler = this.getReference('scheduler'),
            store     = scheduler?.eventStore;

        if (!provider || provider.data.paused || !store || !this.#rng) {
            return
        }

        const
            activeDragId = scheduler.eventDragZone?.eventRecord?.id ?? null,
            allRecords   = [];

        for (let i = 0, len = store.getCount(); i < len; i++) {
            const rec = store.getAt(i);
            if (rec) {
                allRecords.push(rec)
            }
        }

        allRecords.sort((a, b) =>
            String(a.resourceId).localeCompare(String(b.resourceId)) ||
            a.startDate.getTime() - b.startDate.getTime() ||
            String(a.id).localeCompare(String(b.id))
        );

        const
            eligible  = activeDragId == null ? allRecords : allRecords.filter(r => r.id !== activeDragId),
            freeSlots = this.findFreeGateSlots(allRecords),
            delayPool = eligible.filter(rec => this.canSlipFlight(rec, allRecords, 15));

        const roll = this.#rng();
        let kind;

        if (allRecords.length <= 55 && freeSlots.length > 0) {
            kind = roll < 0.55 || delayPool.length === 0 ? 'arrive' : 'delay'
        } else if (allRecords.length >= 65 || freeSlots.length === 0) {
            kind = roll < 0.55 && delayPool.length > 0 ? 'delay' : 'depart'
        } else if (roll < 0.45 && delayPool.length > 0) {
            kind = 'delay'
        } else if (roll < 0.73 && freeSlots.length > 0) {
            kind = 'arrive'
        } else {
            kind = 'depart'
        }

        if (kind === 'delay' && delayPool.length === 0) {
            kind = freeSlots.length > 0 ? 'arrive' : 'depart'
        }
        if (kind === 'depart' && eligible.length === 0) {
            return
        }

        // Advance highlight lifecycle silently so the primary store mutation flushes one consolidated row refresh
        for (const rec of allRecords) {
            if (rec.feedMark === 'fading') {
                rec.setSilent({deltaText: '', feedMark: ''})
            } else if (rec.feedMark === 'fresh') {
                rec.setSilent({feedMark: 'fading'})
            }
        }

        const nextCount = provider.data.changeCount + 1;

        if (kind === 'delay') {
            const
                pick      = delayPool[Math.floor(this.#rng() * delayPool.length)],
                addMin    = this.#rng() < 0.5 ? 10 : 15,
                nextStart = new Date(pick.startDate.getTime() + addMin * MS_PER_MINUTE),
                nextEnd   = new Date(pick.endDate.getTime()   + addMin * MS_PER_MINUTE),
                gateName  = GATE_BY_ID.get(String(pick.resourceId))?.name || pick.resourceId;

            pick.set({
                deltaText: `+${addMin}m`,
                endDate  : nextEnd,
                feedMark : 'fresh',
                startDate: nextStart,
                status   : 'delayed'
            });
            store.doSort();

            provider.data.changeCount = nextCount;
            this.updateTicker('delay', `Delayed +${addMin}m`, `${pick.flightCode} (${pick.city}) at ${gateName} → ${formatUtcRange(nextStart, nextEnd)}`)
        } else if (kind === 'arrive') {
            const
                slot            = freeSlots[Math.floor(this.#rng() * freeSlots.length)],
                seq             = ++this.#arrivalSeq,
                [carrier, city] = ROUTE_CATALOG[(seq + nextCount) % ROUTE_CATALOG.length],
                flightCode      = `${carrier} ${seq}`,
                gate            = GATE_BY_ID.get(slot.gateId),
                startMs         = Date.UTC(2026, 10, 9, slot.hour, 10, 0),
                endMs           = startMs + 40 * MS_PER_MINUTE,
                startDate       = new Date(startMs),
                endDate         = new Date(endMs);

            store.add({
                city,
                deltaText : 'NEW',
                endDate,
                feedMark  : 'fresh',
                flightCode,
                id        : `fl-live-${nextCount}`,
                pier      : gate?.pier || 'A',
                resourceId: slot.gateId,
                slotHour  : slot.hour,
                startDate,
                status    : 'arrived',
                title     : `${flightCode} · ${city}`
            });

            provider.data.changeCount = nextCount;
            this.updateTicker('arrive', 'New arrival', `${flightCode} (${city}) assigned to ${gate?.name || slot.gateId} · ${formatUtcRange(startDate, endDate)}`)
        } else {
            const
                pick     = eligible[Math.floor(this.#rng() * eligible.length)],
                gateName = GATE_BY_ID.get(String(pick.resourceId))?.name || pick.resourceId;

            store.remove(pick);

            provider.data.changeCount = nextCount;
            this.updateTicker('depart', 'Gate freed', `${pick.flightCode} (${pick.city}) departed · ${gateName} open`)
        }
    }

    /**
     * @summary Checks whether `record` can shift later by `maxMinutes` on its current gate without colliding with another flight or leaving the axis.
     * @param {Neo.data.Model} record
     * @param {Neo.data.Model[]} allRecords
     * @param {Number} maxMinutes
     * @returns {Boolean}
     */
    canSlipFlight(record, allRecords, maxMinutes) {
        if (record.status === 'delayed') {
            return false
        }

        const
            shiftedStart = record.startDate.getTime(),
            shiftedEnd   = record.endDate.getTime() + maxMinutes * MS_PER_MINUTE;

        if (shiftedEnd > AXIS_END_MS) {
            return false
        }

        for (const other of allRecords) {
            if (other === record || String(other.resourceId) !== String(record.resourceId)) {
                continue
            }
            if (shiftedStart < other.endDate.getTime() && shiftedEnd > other.startDate.getTime()) {
                return false
            }
        }

        return true
    }

    /**
     * @summary Returns all `(gateId, hour)` turnaround slots (`06:00`–`12:00`) that currently contain no intersecting flight.
     * @param {Neo.data.Model[]} allRecords
     * @returns {Array<{gateId: String, hour: Number}>}
     */
    findFreeGateSlots(allRecords) {
        const free = [];

        for (const gate of GATES) {
            for (let hour = 6; hour <= 11; hour++) {
                const
                    slotStart = Date.UTC(2026, 10, 9, hour, 0, 0),
                    slotEnd   = slotStart + MS_PER_HOUR;

                let busy = false;
                for (const rec of allRecords) {
                    if (String(rec.resourceId) === gate.id &&
                        rec.startDate.getTime() < slotEnd &&
                        rec.endDate.getTime() > slotStart) {
                        busy = true;
                        break
                    }
                }

                if (!busy) {
                    free.push({gateId: gate.id, hour})
                }
            }
        }

        return free
    }

    /**
     * @summary Updates the sub-toolbar live status pill and summary text.
     * @param {String} kind
     * @param {String} badgeText
     * @param {String} summaryText
     */
    updateTicker(kind, badgeText, summaryText) {
        const ticker = this.getReference('feed-ticker');
        if (!ticker || this.isDestroyed) {
            return
        }

        const vdom = ticker.vdom;
        vdom.cn[0].cls  = ['gate-feed-kind', `is-${kind}`];
        vdom.cn[0].text = badgeText;
        vdom.cn[1].text = summaryText;
        ticker.update()
    }

    /**
     * @summary Scales `pxPerMinute` cleanly on narrow viewports while keeping `Gate` column width static.
     * @param {Number} bodyWidth
     */
    applyResponsiveScale(bodyWidth) {
        if (!bodyWidth || bodyWidth <= 0) {
            return
        }

        const
            compact   = bodyWidth < COMPACT_BODY_PX,
            scheduler = this.getReference('scheduler');

        if (!scheduler || compact === this.#isCompact) {
            return
        }

        this.#isCompact = compact;
        this.toggleCls('is-compact', compact);
        scheduler.timeAxis.pxPerMinute = compact ? MOBILE_PPM : DESKTOP_PPM
    }
}

export default Neo.setupClass(GateOperationsViewport);
