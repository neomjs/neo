import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockVesselParkTest'
    },
    // The machine is a zero-import pure module: no Main facade, no LocalStorage addon. Declaring
    // both mocks off keeps this file runnable SOLO (the mock paths call `Neo.ns`, which only
    // exists once a sibling spec loads the real core into the shared worker).
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}             from '@playwright/test';
import {createVesselParkHandlers} from '../../../../src/dashboard/dock/window/VesselPark.mjs';

/**
 * @summary The in-gesture vessel park machine, driven end-to-end through its injected seams.
 *
 * Every witness is a contract pin from the ticket's AC set: conversion PARKS and never closes
 * (the activation wall is structural — the machine has no acquisition seam, and the round-trip
 * witness proves the full ledger touches only the three injected seams), out-conversion re-shows
 * the SAME window with the live-rect/origin-fallback rule, commit disposes exactly once with
 * every other outcome failing toward restore, and stale events (duplicate convert-in, slotless
 * out/terminal, mismatched itemId) are silent no-ops. The seams are the assertion surface.
 */
test.describe('Neo.dashboard.dock.window.VesselPark — createVesselParkHandlers', () => {
    const harness = () => {
        const calls = {disposed: [], parked: [], reshown: []};

        const handlers = createVesselParkHandlers({
            disposeVessel: vessel => {
                calls.disposed.push(vessel);
                return true
            },
            parkVessel: vessel => {
                calls.parked.push(vessel);
                return true
            },
            reshowVessel: vessel => {
                calls.reshown.push(vessel);
                return true
            }
        });

        return {calls, handlers}
    };

    const rect   = (x, y, width, height) => ({x, y, width, height});
    const inData = (overrides = {}) => ({
        itemId    : 'graph',
        sourceRect: rect(500, 120, 640, 480),
        windowName: 'vessel-graph',
        ...overrides
    });

    test('conversion-in PARKS with the vessel identity and never touches dispose — the slot records the origin anchor', () => {
        const {calls, handlers} = harness();

        handlers.onConversionIn(inData());

        expect(calls.parked).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(calls.disposed, 'parking must NEVER close — the one-way activation door').toHaveLength(0);
        expect(handlers.parkedVessel).toEqual({
            itemId           : 'graph',
            preConversionRect: rect(500, 120, 640, 480),
            windowName       : 'vessel-graph'
        })
    });

    test('a duplicate conversion-in with a live slot is a stale re-fire: parked exactly once', () => {
        const {calls, handlers} = harness();

        handlers.onConversionIn(inData());
        handlers.onConversionIn(inData({windowName: 'vessel-imposter'}));

        expect(calls.parked).toHaveLength(1);
        expect(handlers.parkedVessel.windowName, 'the first vessel holds the slot').toBe('vessel-graph')
    });

    test('conversion-out re-shows the SAME window at the supplied LIVE rect — the resume-under-the-pointer semantics', () => {
        const {calls, handlers} = harness();
        const liveRect          = rect(900, 300, 640, 480);

        handlers.onConversionIn(inData());
        handlers.onConversionOut({rect: liveRect});

        expect(calls.reshown).toEqual([{
            itemId: 'graph', rect: liveRect, terminal: false, windowName: 'vessel-graph'
        }]);
        expect(calls.disposed).toHaveLength(0);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('conversion-out without a supplied rect falls back to the recorded pre-conversion rect — origin semantics', () => {
        const {calls, handlers} = harness();

        handlers.onConversionIn(inData());
        handlers.onConversionOut();

        expect(calls.reshown).toEqual([{
            itemId    : 'graph',
            rect      : rect(500, 120, 640, 480),
            terminal  : false,
            windowName: 'vessel-graph'
        }])
    });

    test('conversion-out with no slot is a stale event: zero seam calls', () => {
        const {calls, handlers} = harness();

        handlers.onConversionOut({rect: rect(0, 0, 100, 100)});

        expect(calls.reshown).toHaveLength(0);
        expect(calls.disposed).toHaveLength(0)
    });

    test('the commit terminal disposes EXACTLY once — a duplicate terminal disposes nothing further, and re-show never fires', () => {
        const {calls, handlers} = harness();

        handlers.onConversionIn(inData());
        handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'});

        expect(calls.disposed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(calls.reshown).toHaveLength(0);
        expect(handlers.parkedVessel).toBeNull();

        handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'});
        expect(calls.disposed, 'strict-success clear — stale duplicate commits nothing').toHaveLength(1)
    });

    test('a committed close refusal retains exact retry authority and coalesces one async disposition', async () => {
        let resolveClose,
            attempt = 0;

        const pending  = new Promise(resolve => resolveClose = resolve),
              calls    = [],
              handlers = createVesselParkHandlers({
                  disposeVessel: vessel => {
                      calls.push(vessel);
                      return ++attempt === 1 ? pending : true
                  },
                  parkVessel  : () => true,
                  reshowVessel: () => true
              });

        handlers.onConversionIn(inData());

        const first  = handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'}),
              second = handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'});

        expect(second).toBe(first);
        expect(calls).toHaveLength(1);

        resolveClose(false);

        await expect(first).resolves.toBe(false);
        expect(handlers.parkedVessel?.itemId, 'refusal keeps the sole retry authority').toBe('graph');

        expect(handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'})).toBe(true);
        expect(calls).toHaveLength(2);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('every non-commit outcome RESTORES at the pre-conversion rect and never disposes — cancel, reject, and unknown alike', () => {
        for (const outcome of ['cancelled', 'rejected', 'terminal-detached', undefined]) {
            const {calls, handlers} = harness();

            handlers.onConversionIn(inData());
            handlers.onGestureTerminal({itemId: 'graph', outcome});

            expect(calls.disposed, `outcome "${outcome}" must never dispose`).toHaveLength(0);
            expect(calls.reshown, `outcome "${outcome}" restores the window`).toEqual([{
                itemId    : 'graph',
                rect      : rect(500, 120, 640, 480),
                terminal  : true,
                windowName: 'vessel-graph'
            }]);
            expect(handlers.parkedVessel).toBeNull()
        }
    });

    test('a terminal for a DIFFERENT itemId is stale: the parked vessel survives untouched', () => {
        const {calls, handlers} = harness();

        handlers.onConversionIn(inData());
        handlers.onGestureTerminal({itemId: 'other-item', outcome: 'committed'});

        expect(calls.disposed).toHaveLength(0);
        expect(calls.reshown).toHaveLength(0);
        expect(handlers.parkedVessel?.itemId).toBe('graph')
    });

    test('the full round-trip ledger — park, out, park again, commit — touches ONLY the three injected seams, dispose count exactly 1', () => {
        const {calls, handlers} = harness();
        const midRect           = rect(700, 200, 640, 480);

        handlers.onConversionIn(inData());                          // over the target: park
        handlers.onConversionOut({rect: midRect});                  // changed mind: same window back, no reopen
        handlers.onConversionIn(inData({sourceRect: midRect}));     // over again: park again
        handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'}); // dropped in: dispose

        // The activation-wall AC at contract tier: the machine exposes NO acquisition surface, so
        // the complete ledger of platform effects across the round-trip is exactly these calls —
        // zero mid-gesture window opens are possible by construction.
        expect(calls.parked).toHaveLength(2);
        expect(calls.reshown).toEqual([{
            itemId: 'graph', rect: midRect, terminal: false, windowName: 'vessel-graph'
        }]);
        expect(calls.disposed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('async park admission publishes no slot until strict true; false remains source-owned', async () => {
        let resolvePark;

        const pending  = new Promise(resolve => resolvePark = resolve),
              calls    = [],
              handlers = createVesselParkHandlers({
                  disposeVessel: () => true,
                  parkVessel   : vessel => {
                      calls.push(vessel);
                      return pending
                  },
                  reshowVessel: () => true
              }),
              admission = handlers.onConversionIn(inData());

        expect(calls).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(handlers.parkedVessel, 'dispatch is not admission').toBeNull();
        expect(handlers.transition?.phase).toBe('parking');

        resolvePark(false);

        await expect(admission).resolves.toBe(false);
        expect(handlers.parkedVessel).toBeNull();
        expect(handlers.transition).toBeNull()
    });

    test('async re-show refusal retains the exact parked vessel for a later strict-success retry', async () => {
        let allowRestore = false;

        const calls    = [],
              handlers = createVesselParkHandlers({
                  disposeVessel: () => true,
                  parkVessel   : () => true,
                  reshowVessel : async vessel => {
                      calls.push(vessel);
                      return allowRestore
                  }
              });

        expect(handlers.onConversionIn(inData())).toBe(true);

        await expect(handlers.onConversionOut({rect: rect(900, 300, 640, 480)})).resolves.toBe(false);
        expect(handlers.parkedVessel?.windowName).toBe('vessel-graph');

        allowRestore = true;

        await expect(handlers.onConversionOut({rect: rect(920, 320, 640, 480)})).resolves.toBe(true);
        expect(calls).toHaveLength(2);
        expect(calls[1].rect).toEqual(rect(920, 320, 640, 480));
        expect(handlers.parkedVessel).toBeNull()
    });

    test('synchronous platform throws normalize to refusal and preserve recoverable ownership', () => {
        const parkThrows = createVesselParkHandlers({
            disposeVessel: () => true,
            parkVessel   : () => { throw new Error('park failed') },
            reshowVessel : () => true
        });

        expect(() => parkThrows.onConversionIn(inData())).not.toThrow();
        expect(parkThrows.parkedVessel).toBeNull();

        const restoreThrows = createVesselParkHandlers({
            disposeVessel: () => true,
            parkVessel   : () => true,
            reshowVessel : () => { throw new Error('move failed') }
        });

        expect(restoreThrows.onConversionIn(inData())).toBe(true);
        expect(() => restoreThrows.onGestureTerminal({itemId: 'graph', outcome: 'cancelled'})).not.toThrow();
        expect(restoreThrows.parkedVessel?.itemId).toBe('graph')
    });

    test('a terminal arriving during async park settles that generation, then disposes exactly once', async () => {
        let resolvePark;

        const pending  = new Promise(resolve => resolvePark = resolve),
              disposed = [],
              handlers = createVesselParkHandlers({
                  disposeVessel: vessel => {
                      disposed.push(vessel);
                      return true
                  },
                  parkVessel  : () => pending,
                  reshowVessel: () => true
              });

        handlers.onConversionIn(inData());

        const first  = handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'}),
              second = handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'});

        expect(disposed).toHaveLength(0);

        resolvePark(true);

        await expect(first).resolves.toBe(true);
        await expect(second).resolves.toBe(true);
        expect(disposed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('false-after-physical-park still runs the queued terminal compensation exactly once', async () => {
        for (const outcome of ['committed', 'rejected']) {
            let resolvePark;

            const pending  = new Promise(resolve => resolvePark = resolve),
                  calls    = {disposed: [], reshown: []},
                  handlers = createVesselParkHandlers({
                      disposeVessel: vessel => {
                          calls.disposed.push(vessel);
                          return true
                      },
                      parkVessel  : () => pending,
                      reshowVessel: vessel => {
                          calls.reshown.push(vessel);
                          return true
                      }
                  });

            handlers.onConversionIn(inData());
            const terminal = handlers.onGestureTerminal({itemId: 'graph', outcome});

            // Models Main's normal terminal race: the native move happened, but generation reset
            // makes the pointer-follow admission resolve false after the effect.
            resolvePark(false);

            await expect(terminal).resolves.toBe(true);

            if (outcome === 'committed') {
                expect(calls.disposed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
                expect(calls.reshown).toHaveLength(0)
            } else {
                expect(calls.disposed).toHaveLength(0);
                expect(calls.reshown).toEqual([{
                    itemId    : 'graph',
                    rect      : rect(500, 120, 640, 480),
                    terminal  : true,
                    windowName: 'vessel-graph'
                }])
            }
        }
    });

    test('external tear-out retirement clears a pending park generation without a late resurrection', async () => {
        let resolvePark;

        const pending  = new Promise(resolve => resolvePark = resolve),
              handlers = createVesselParkHandlers({
                  disposeVessel: () => true,
                  parkVessel   : () => pending,
                  reshowVessel : () => true
              }),
              admission = handlers.onConversionIn(inData());

        expect(handlers.onVesselRetired({itemId: 'other'})).toBe(false);
        expect(handlers.onVesselRetired({itemId: 'graph'})).toBe(true);
        expect(handlers.transition).toBeNull();

        resolvePark(true);

        await expect(admission).resolves.toBe(false);
        expect(handlers.parkedVessel).toBeNull();
        expect(handlers.onVesselRetired({itemId: 'graph'}), 'duplicate retirement is inert').toBe(false)
    });

    test('external retirement invalidates a queued terminal before its late park settlement can dispose', async () => {
        let resolvePark;

        const pending  = new Promise(resolve => resolvePark = resolve),
              disposed = [],
              handlers = createVesselParkHandlers({
                  disposeVessel: vessel => {
                      disposed.push(vessel);
                      return true
                  },
                  parkVessel  : () => pending,
                  reshowVessel: () => true
              });

        handlers.onConversionIn(inData());
        const terminal = handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'});

        expect(handlers.onVesselRetired({itemId: 'graph', retirement: true})).toBe(true);
        resolvePark(true);

        await expect(terminal).resolves.toBe(false);
        expect(disposed).toEqual([]);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('external retirement clears only after strict close settlement; refusal preserves recovery truth', async () => {
        let resolveRetirement;

        const retirement = new Promise(resolve => resolveRetirement = resolve),
              handlers   = createVesselParkHandlers({
                  disposeVessel: () => true,
                  parkVessel   : () => true,
                  reshowVessel : () => true
              });

        handlers.onConversionIn(inData());
        const settlement = handlers.onVesselRetired({itemId: 'graph', retirement});

        expect(handlers.transition?.phase).toBe('retiring');
        expect(handlers.parkedVessel?.itemId).toBe('graph');
        expect(handlers.onGestureTerminal({itemId: 'other', outcome: 'committed'})).toBe(false);
        expect(handlers.onGestureTerminal({itemId: 'graph', outcome: 'committed'})).toBe(settlement);

        resolveRetirement(false);

        await expect(settlement).resolves.toBe(false);
        expect(handlers.parkedVessel?.itemId, 'a refused close cannot erase recovery authority').toBe('graph');

        expect(handlers.onVesselRetired({itemId: 'graph', retirement: true})).toBe(true);
        expect(handlers.parkedVessel).toBeNull()
    });

    test('config validation fails LOUD: missing or non-function seams throw', () => {
        const seams = {
            disposeVessel: () => {},
            parkVessel   : () => {},
            reshowVessel : () => {}
        };

        expect(() => createVesselParkHandlers()).toThrow(/required function seams/);
        expect(() => createVesselParkHandlers({...seams, parkVessel: undefined})).toThrow(/required function seams/);
        expect(() => createVesselParkHandlers({...seams, reshowVessel: 'hide'})).toThrow(/required function seams/);
        expect(() => createVesselParkHandlers({...seams, disposeVessel: null})).toThrow(/required function seams/)
    })
});
