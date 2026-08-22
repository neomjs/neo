import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetCockpitViewerWakeTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import ViewerWakeFeed from '../../../../../../../../apps/agentos/store/ViewerWakeFeed.mjs';

/**
 * The viewer-wake wiring: `ensureViewerWakeStream` keeps the per-viewer wake stream bound to the
 * CURRENT bridge capability, and every observation lands in the provider VERBATIM. The unit here is
 * the composition root's routing decision — capability honesty (no capability → the not-wired
 * stamp, never a fabricated stream), custody-heal rebuild (a REPLACED bridge object retires the
 * consumer built from the old closure), and the observation path (wake frame → bounded feed +
 * stamp). The consumer itself is pinned by `fleetWakeStreamConsumer.spec.mjs`; here it is a spy.
 */
test.describe('FleetCockpit — viewer wake stream wiring (#17130 leg 2)', () => {
    let FleetCockpit;

    // scope the mock to the `fleet` subkey ONLY — `globalThis.AgentOS` is the app's Neo namespace
    // root; replacing it wipes class registrations for later spec files (cross-file bleed).
    const clearBridge = () => { delete globalThis.AgentOS?.fleet };

    const setBridge = bridge => { (globalThis.AgentOS ??= {}).fleet = {registryBridge: bridge} };

    /** A capability-side consumer spy: records lifecycle + captures the observational options. */
    const makeConsumerFactory = () => {
        const factory = {
            created: [],
            openWakeStream(opts) {
                const consumer = {
                    opts,
                    started    : 0,
                    stopped    : 0,
                    liveness   : {alive: true, reason: 'composed wake stream connected · armed for this viewer'},
                    lastCatchUp: null,
                    start() { this.started++ },
                    stop()  { this.stopped++ },
                    resolveDeliveryLiveness() { return this.liveness },
                    describe() { return {lastCatchUp: this.lastCatchUp} }
                };

                factory.created.push(consumer);
                return consumer
            }
        };

        return factory
    };

    /** A minimal owner carrying exactly the fields + prototype methods the wiring touches. */
    const makeCockpit = () => {
        const
            feed = Neo.create(ViewerWakeFeed, {}),
            data = {},
            slot = {cls: null, text: null, vdom: {}, updates: 0, set(config) { Object.assign(this, config) }, update() { this.updates++ }};

        const provider = {
            setDataCalls: [],
            setData(key, value) {
                this.setDataCalls.push({key, value});
                data[key] = value
            },
            getData : key => data[key],
            getStore: name => name === 'viewerWakeFeed' ? feed : null
        };

        const cockpit = {
            feed,
            isDestroyed           : false,
            provider,
            slot,
            viewerWakeBridge      : null,
            viewerWakeConsumer    : null,
            wakePollDigest        : null,
            ensureViewerWakeStream: FleetCockpit.prototype.ensureViewerWakeStream,
            getReference          : reference => reference === 'viewer-wake-telltale' ? slot : null,
            getStateProvider      : () => provider,
            getViewerWakeFeed     : FleetCockpit.prototype.getViewerWakeFeed,
            onViewerWakeSignal    : FleetCockpit.prototype.onViewerWakeSignal,
            stampViewerWake       : FleetCockpit.prototype.stampViewerWake,
            syncViewerWakeTelltale: FleetCockpit.prototype.syncViewerWakeTelltale
        };

        return cockpit
    };

    test.beforeAll(async () => {
        FleetCockpit = (await import('../../../../../../../../apps/agentos/view/fleet/cockpit/Container.mjs')).default
    });

    test.afterEach(() => clearBridge());

    test('no bridge at all → the honest not-wired stamp, no consumer, no fabricated stream', () => {
        clearBridge();

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();

        expect(cockpit.viewerWakeConsumer).toBe(null);

        const stamped = cockpit.provider.getData('viewerWake');

        expect(stamped.stream.alive).toBe('unknown');
        expect(stamped.stream.reason).toContain('wake push not wired');
        expect(stamped.catchUp).toEqual({state: null, at: null, pending: null});
        expect(cockpit.slot.text).toContain('wake push not wired');

        cockpit.feed.destroy()
    });

    test('a bridge WITHOUT the capability (packaged shell) → the same honest absence', () => {
        setBridge({fleetRoster: async () => ({})});

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();

        expect(cockpit.viewerWakeConsumer).toBe(null);
        expect(cockpit.provider.getData('viewerWake').stream.reason).toContain('no direct-browser wake capability');

        cockpit.feed.destroy()
    });

    test('capability present → opened ONCE, started, and the consumer liveness passes through verbatim', () => {
        const factory = makeConsumerFactory();

        setBridge(factory);

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();
        cockpit.ensureViewerWakeStream(); // the liveness tick re-entry: same bridge, no rebuild

        expect(factory.created).toHaveLength(1);
        expect(factory.created[0].started).toBe(1);
        expect(typeof factory.created[0].opts.onWake).toBe('function');
        expect(factory.created[0].opts.pollDigest, 'no injected seam → the option must stay absent').toBe(undefined);

        const stamped = cockpit.provider.getData('viewerWake');

        expect(stamped.stream.alive).toBe(true);
        expect(stamped.stream.reason).toBe('composed wake stream connected · armed for this viewer');
        expect(cockpit.slot.text).toContain('wake: live');
        expect(cockpit.slot.vdom.title).toContain('wake push live');

        cockpit.feed.destroy()
    });

    test('a wake frame lands in the bounded feed newest-first; an envelope-less frame stamps but never fabricates a row', () => {
        const factory = makeConsumerFactory();

        setBridge(factory);

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();

        const onWake = factory.created[0].opts.onWake;

        onWake({subscriptionId: 'sub-9', envelope: {eventId: '01H-1', eventType: 'wake/digest', logId: 5, emittedAt: '2026-08-16T19:00:00.000Z'}, receivedAt: 111});
        onWake({subscriptionId: 'sub-9', envelope: {eventId: '01H-2', eventType: 'wake/digest', logId: 6, emittedAt: '2026-08-16T19:00:01.000Z'}, receivedAt: 222});
        onWake({subscriptionId: 'sub-9', envelope: null, receivedAt: 333});

        expect(cockpit.feed.getCount()).toBe(2);
        expect(cockpit.feed.items.map(record => record.eventId)).toEqual(['01H-2', '01H-1']);
        expect(cockpit.feed.getAt(0).kind).toBe('wake/digest');
        expect(cockpit.slot.vdom.title).toContain('last signals: wake/digest');

        cockpit.feed.destroy()
    });

    test('custody heal: a REPLACED bridge object retires the old consumer and opens through the new closure', () => {
        const
            factoryA = makeConsumerFactory(),
            factoryB = makeConsumerFactory();

        setBridge(factoryA);

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();
        expect(factoryA.created[0].started).toBe(1);

        setBridge(factoryB);
        cockpit.ensureViewerWakeStream();

        expect(factoryA.created[0].stopped, 'the consumer must never outlive the closure custody it rode').toBe(1);
        expect(factoryB.created).toHaveLength(1);
        expect(factoryB.created[0].started).toBe(1);
        expect(cockpit.viewerWakeBridge).toBe(globalThis.AgentOS.fleet.registryBridge);

        cockpit.feed.destroy()
    });

    test('a capability that VANISHES (bridge downgrade) stops the consumer and stamps absence', () => {
        const factory = makeConsumerFactory();

        setBridge(factory);

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();
        expect(factory.created).toHaveLength(1);

        setBridge({fleetRoster: async () => ({})});
        cockpit.ensureViewerWakeStream();

        expect(factory.created[0].stopped).toBe(1);
        expect(cockpit.viewerWakeConsumer).toBe(null);
        expect(cockpit.provider.getData('viewerWake').stream.reason).toContain('wake push not wired');

        cockpit.feed.destroy()
    });

    test('an injected wakePollDigest seam projects through as the pollDigest option', () => {
        const
            factory = makeConsumerFactory(),
            seam    = async () => ({counts: {pending: 0}});

        setBridge(factory);

        const cockpit = makeCockpit();

        cockpit.wakePollDigest = seam;
        cockpit.ensureViewerWakeStream();

        expect(factory.created[0].opts.pollDigest).toBe(seam);

        cockpit.feed.destroy()
    });

    test("the consumer's lastCatchUp observation stamps into the provider verbatim", () => {
        const factory = makeConsumerFactory();

        setBridge(factory);

        const cockpit = makeCockpit();

        cockpit.ensureViewerWakeStream();

        factory.created[0].lastCatchUp = {state: 'fresh', at: 5000, pending: 3};
        cockpit.stampViewerWake();

        expect(cockpit.provider.getData('viewerWake').catchUp).toEqual({state: 'fresh', at: 5000, pending: 3});
        expect(cockpit.slot.vdom.title).toContain('catch-up: fresh (3 pending drained)');

        cockpit.feed.destroy()
    })
});
