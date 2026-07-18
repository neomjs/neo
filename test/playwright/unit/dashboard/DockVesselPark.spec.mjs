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
import {createVesselParkHandlers} from '../../../../src/dashboard/DockVesselPark.mjs';

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
test.describe('Neo.dashboard.DockVesselPark — createVesselParkHandlers', () => {
    const harness = () => {
        const calls = {disposed: [], parked: [], reshown: []};

        const handlers = createVesselParkHandlers({
            disposeVessel: vessel => calls.disposed.push(vessel),
            parkVessel   : vessel => calls.parked.push(vessel),
            reshowVessel : vessel => calls.reshown.push(vessel)
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

        expect(calls.reshown).toEqual([{itemId: 'graph', rect: liveRect, windowName: 'vessel-graph'}]);
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
        expect(calls.disposed, 'slot cleared first — stale duplicate commits nothing').toHaveLength(1)
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
        expect(calls.reshown).toEqual([{itemId: 'graph', rect: midRect, windowName: 'vessel-graph'}]);
        expect(calls.disposed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
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
