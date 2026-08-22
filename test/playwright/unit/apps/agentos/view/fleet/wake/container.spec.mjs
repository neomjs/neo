import {setup} from '../../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'WakeRoutePaneHonestyTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import '../../../../../../../../src/manager/Instance.mjs';
import WakeRoutePane  from '../../../../../../../../apps/agentos/view/fleet/wake/Container.mjs';

/**
 * @summary One seat row in the exact `fleetWakeRoutes` contract shape.
 * @param {String} identity
 * @param {Object} [overrides]
 * @returns {Object}
 */
function seat(identity, overrides = {}) {
    return {
        agentId      : identity.replace('@', ''),
        agentIdentity: identity,
        subscription : {state: 'active', reason: null},
        armed        : {state: 'unobserved', reason: 'arming read path unavailable'},
        delivery     : {state: 'alive', reason: null},
        lastFailure  : {state: 'observed', reason: null, receipt: null},
        presence     : {state: 'online', lastSeenAt: '2026-08-03T19:55:00.000Z', reason: null},
        ...overrides
    }
}

/**
 * @summary One wired source envelope.
 * @param {Object[]} seats
 * @param {Object} [capability]
 * @returns {Object}
 */
function envelope(seats, capability = {}) {
    return {
        capability: {
            source    : 'fleet:wakeRoutes', state: 'wired', confidence: 'observed',
            capturedAt: '2026-08-03T20:01:00.000Z', reason: null, ...capability
        },
        viewer: '@e2e-operator',
        count : seats.length,
        seats
    }
}

/**
 * @summary Create the pane with captured `wakeRoutesRequest` intents.
 * @param {Object} [config]
 * @returns {{pane: Object, requests: Object[]}}
 */
function createPane(config = {}) {
    const requests = [],
          pane     = Neo.create(WakeRoutePane, {
              listeners: {wakeRoutesRequest: data => {
                  const {source, ...params} = data;
                  requests.push(params)
              }},
              ...config
          });

    return {pane, requests}
}

test.describe('WakeRoutePane — decomposed per-seat honesty (never fused)', () => {
    test('an unobserved pane claims nothing and never queries on its own', () => {
        const {pane, requests} = createPane();

        expect(requests).toEqual([]);
        expect(pane.seatStore.count).toBe(0);
        expect(pane.getReference('wakeroutes-meta').text).toBe('Read the routes to see each seat’s wake path.');

        pane.destroy()
    });

    test('a wired envelope projects every axis into Store rows and each axis renders as ITSELF', () => {
        const {pane} = createPane();

        pane.snapshot = envelope([
            seat('@neo-opus-ada', {
                subscription: {state: 'none', reason: null},
                presence    : {state: 'idle', lastSeenAt: '2026-08-03T18:29:27.443Z', reason: 'stale add_memory activity'}
            }),
            seat('@neo-fable-clio', {
                lastFailure: {
                    state  : 'observed',
                    reason : 'terminal wake delivery failure: connect-timeout',
                    receipt: {errorClass: 'connect-timeout', failedAt: '2026-08-03T19:00:00.000Z'}
                }
            })
        ]);

        expect(pane.seatStore.count).toBe(2);

        const ada = pane.seatStore.get('@neo-opus-ada');

        expect(ada.subscriptionState).toBe('none');
        expect(ada.presenceState).toBe('idle');
        expect(ada.armedState).toBe('unobserved');

        const clio = pane.seatStore.get('@neo-fable-clio');

        expect(clio.failureErrorClass).toBe('connect-timeout');
        expect(clio.failureAt).toBe('2026-08-03T19:00:00.000Z');

        // Composition and VALUE, not format. This line used to pin `captured 2026-08-03 20:01Z`,
        // which quietly asserted UTC rendering from a spec whose subject is the meta SENTENCE — so it
        // broke the day instants became viewer-local, and re-pinning would pass or fail on the
        // runner's own zone. The format contract is proven with a pinned locale/zone in
        // `viewerTime.spec.mjs`.
        //
        // But composition alone was too weak, and the gap is the point: `toContain('captured ')` plus
        // a digits match passes if the pane formats the WRONG instant — swap `capturedAt` for
        // `lastSeenAt` and every such assertion still holds. "This pane formats the instant it
        // claims to" is the PANE's contract, not the formatter's, so it must survive the split.
        //
        // The title is the zone-free way to pin it: it carries the exact ISO by construction, so this
        // is stable in Berlin and in a UTC runner alike while asserting nothing about glyphs.
        const metaEl = pane.getReference('wakeroutes-meta');

        expect(metaEl.text).toContain('2 seat routes · every axis observed · captured ');
        expect(metaEl.text).not.toContain('unknown time');
        expect(metaEl.vdom.title).toBe('2026-08-03T20:01:00.000Z');

        // The rendered card carries the state IN THE SENTENCE (never colour alone), reason attached.
        const rows  = pane.getReference('wakeroutes-rows'),
              texts = rows.items.map(card => card.items.map(line => line.text));

        expect(texts[0][0]).toBe('@neo-opus-ada');
        expect(texts[0][1]).toBe('subscription: none');
        expect(texts[0][2]).toContain('armed: unobserved — arming read path unavailable');
        // Same split as the meta line above: these assert the SENTENCE this pane composes — the state
        // word, the separator grammar and the attached reason — not the glyphs of the instant inside
        // it. Pinning the formatted stamp here made the pane spec a second, zone-dependent test of the
        // formatter, and it is the reason both lines broke on a change that touched neither the
        // presence axis nor the failure axis.
        expect(texts[0][5]).toContain('presence: idle · last seen ');
        expect(texts[0][5]).toContain('— stale add_memory activity');
        expect(texts[1][4]).toMatch(/^last failure: connect-timeout at .+\d/);

        // Same value-pinning as the meta line, per axis: the receipt names WHICH instant the row
        // formatted, so a row that renders a plausible time from the wrong field still fails.
        const axes = rows.items.map(card => card.items.map(line => line.vdom?.title ?? null));

        expect(axes[0][5]).toBe('2026-08-03T18:29:27.443Z'); // ada's presence lastSeenAt
        expect(axes[1][4]).toBe('2026-08-03T19:00:00.000Z'); // clio's failure receipt failedAt

        // …and an axis carrying no instant carries no title: an empty receipt would read as
        // "no instant exists" rather than "this line has no time in it".
        expect(axes[0][1]).toBeNull();                       // subscription: none

        pane.destroy()
    });

    test('a degraded-partial envelope keeps its rows AND names every silent axis — partial truth plus a named gap', () => {
        const {pane} = createPane();

        pane.snapshot = envelope([
            seat('@neo-fable-clio', {
                delivery   : {state: 'unknown', reason: 'delivery-lane liveness is not exposed by the containerized plane yet'},
                lastFailure: {state: 'unknown', reason: 'terminal delivery receipts live with the containerized delivery authority; not exposed yet', receipt: null}
            })
        ], {
            state     : 'degraded',
            confidence: 'partial',
            reason    : 'delivery axis: not exposed yet; failure axis: not exposed yet'
        });

        expect(pane.seatStore.count).toBe(1);
        expect(pane.getReference('wakeroutes-meta').text)
            .toContain('silent axes: delivery axis: not exposed yet; failure axis: not exposed yet');

        const texts = pane.getReference('wakeroutes-rows').items[0].items.map(line => line.text);

        expect(texts[3]).toContain('delivery: unknown — delivery-lane liveness is not exposed');

        pane.destroy()
    });

    test('an unavailable envelope clears the rows and claims exactly that', () => {
        const {pane} = createPane();

        pane.snapshot = envelope([seat('@neo-fable-clio')]);
        expect(pane.seatStore.count).toBe(1);

        pane.snapshot = {
            capability: {state: 'unavailable', reason: 'fleet wake-routes verb not wired'},
            viewer    : null,
            count     : 0,
            seats     : []
        };

        expect(pane.seatStore.count).toBe(0);
        expect(pane.getReference('wakeroutes-meta').text)
            .toBe('Wake routes unavailable · fleet wake-routes verb not wired');
        expect(pane.getReference('wakeroutes-rows').items[0].text)
            .toBe('The wake-routes source did not answer. Nothing here claims reachability.');

        pane.destroy()
    });

    test('an empty registry renders as an honest empty, distinct from unavailable', () => {
        const {pane} = createPane();

        pane.snapshot = envelope([]);

        expect(pane.getReference('wakeroutes-rows').items[0].text).toBe('No seats in the registry.');

        pane.destroy()
    });

    test('degraded/none never claims an empty registry — the roster-unreadable vs observed-empty control pair', () => {
        const {pane} = createPane();

        // An unreadable roster arrives as degraded/none with zero seats. Adopting it would render
        // "No seats in the registry" for a registry nobody could read — the pane must refuse.
        pane.snapshot = {
            capability: {
                source    : 'fleet:wakeRoutes', state: 'degraded', confidence: 'none',
                capturedAt: '2026-08-03T20:01:00.000Z', reason: 'fleet roster unreadable'
            },
            viewer: null,
            count : 0,
            seats : []
        };

        expect(pane.seatStore.count).toBe(0);
        expect(pane.getReference('wakeroutes-meta').text).toBe('Wake routes unavailable · fleet roster unreadable');
        expect(pane.getReference('wakeroutes-rows').items[0].text)
            .toBe('The wake-routes source did not answer. Nothing here claims reachability.');

        // The control: observed-empty PARTIAL truth claims the empty registry honestly.
        pane.snapshot = envelope([], {
            state     : 'degraded',
            confidence: 'partial',
            reason    : 'arming axis: arming read path unavailable'
        });

        expect(pane.getReference('wakeroutes-rows').items[0].text).toBe('No seats in the registry.');

        pane.destroy()
    });

    test('the read is the explicit act: Refresh fires the intent, and destroy releases the Store', () => {
        const {pane, requests} = createPane();

        pane.onRefreshClick();
        expect(requests).toEqual([{}]);

        const store = pane.seatStore;

        pane.destroy();
        // A destroyed instance releases its fields (undefined-or-null — the point is: no live ref).
        expect(pane.seatStore ?? null).toBeNull();
        expect(store.isDestroyed ?? store.isDestroying ?? true).toBeTruthy()
    })
});
