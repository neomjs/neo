import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTearOutTest'
    },
    // This lifecycle machine is a pure module. Keeping both Neo facade mocks disabled makes the
    // witness runnable in a fresh worker instead of depending on a sibling spec importing core.
    mockLocalStorage: false,
    mockMain        : false
});

import {test, expect}              from '@playwright/test';
import {createDockTearOutHandlers} from '../../../../src/dashboard/dock/window/TearOut.mjs';

/**
 * @summary The tear-out admission machine, driven end-to-end through its injected seams.
 *
 * Every witness here is a choreography-contract pin: admission fails CLOSED (a blocked popup
 * degrades the gesture to its in-window fallback — the base armed the detached state before the
 * exit event, so the machine must actively end it), the model commits exactly once at the
 * detached terminal (never at a boundary), re-entry/cancel retire the vessel with zero mutation,
 * and a committed tear-out KEEPS its vessel while a refused commit retires it. The seams are the
 * assertion surface — the machine exposes nothing else.
 */
test.describe('Neo.dashboard.dock.window.TearOut — createDockTearOutHandlers', () => {
    const harness = ({admit = true, closeResult = true, commitErrors = [], commitThrows = false, openResult = null} = {}) => {
        const calls = {applied: [], closed: [], ended: 0, opened: [], started: [], synced: []};

        const sortZone = {
            endWindowDrag  : () => calls.ended++,
            startWindowDrag: data => calls.started.push(data)
        };

        const handlers = createDockTearOutHandlers({
            applyOperation  : operation => {
                calls.applied.push(operation);
                if (commitThrows) throw new Error('host reducer exploded');
                return commitErrors.length
                    ? {document: null, errors: commitErrors}
                    : {document: {committed: true, detached: operation.itemId}, errors: []}
            },
            closeVessel     : vessel => {
                calls.closed.push(vessel);
                return typeof closeResult === 'function' ? closeResult(vessel) : closeResult
            },
            onDocumentChange: (document, operation) => calls.synced.push({document, operation}),
            openVessel      : async request => {
                calls.opened.push(request);
                if (openResult) return openResult(request);
                return admit ? {popupHeight: 480, popupWidth: 640, windowName: `vessel-${request.itemId}`} : null
            }
        });

        return {calls, handlers, sortZone}
    };

    const exitData = (sortZone, itemId = 'graph') => ({itemId, proxyRect: {x: 5, y: 6, width: 640, height: 430}, sortZone});

    test('failed admission fails CLOSED: embodiment ended, pointer-follow never engaged, and a later terminal commits nothing', async () => {
        const {calls, handlers, sortZone} = harness({admit: false});

        await handlers.onDockTearOutExit(exitData(sortZone));

        expect(calls.opened).toHaveLength(1);           // the host WAS asked (Boolean windowOpen is its check)
        expect(calls.ended).toBe(1);                    // the base armed the detached state pre-event — degrade must end it
        expect(calls.started).toHaveLength(0);          // the OS pointer-follow never engages without a vessel

        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});

        expect(calls.applied, 'no admitted vessel = nothing to commit').toHaveLength(0);
        expect(calls.closed).toHaveLength(0)
    });

    test('an admitted vessel engages the pointer-follow with the vessel geometry + the original gesture data', async () => {
        const {calls, handlers, sortZone} = harness();
        const data                        = exitData(sortZone);

        await handlers.onDockTearOutExit(data);

        expect(calls.opened[0]).toEqual({
            admissionToken: 1, itemId: 'graph', proxyRect: data.proxyRect, sortZone
        });
        expect(calls.ended).toBe(0);
        expect(calls.started).toEqual([{
            dragData: data, popupHeight: 480, popupWidth: 640, windowName: 'vessel-graph'
        }])
    });

    test('the detached terminal commits detachItem EXACTLY once, syncs the committed document, and the vessel STAYS', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone));
        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});

        expect(calls.applied).toEqual([{operation: 'detachItem', itemId: 'graph'}]);
        expect(calls.synced).toEqual([{
            document : {committed: true, detached: 'graph'},
            operation: {operation: 'detachItem', itemId: 'graph'}
        }]);
        expect(calls.closed, 'a committed tear-out keeps its vessel — it owns the item now').toHaveLength(0);

        // the slot is consumed: a duplicate terminal (stale event) commits nothing further
        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});
        expect(calls.applied).toHaveLength(1)
    });

    test('a composed remote terminal retires the exact active vessel once without model mutation', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone));

        expect(handlers.retireActiveVessel({itemId: 'inbox', windowName: 'vessel-graph'}),
            'other-item retirement is inert').toBe(false);
        expect(handlers.retireActiveVessel({itemId: 'graph', windowName: 'vessel-imposter'}),
            'same-item wrong-window retirement is inert').toBe(false);
        expect(handlers.retireActiveVessel({itemId: 'graph', windowName: 'vessel-graph'})).toBe(true);
        expect(handlers.retireActiveVessel({itemId: 'graph', windowName: 'vessel-graph'}),
            'duplicate retirement is inert').toBe(false);

        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});
        handlers.onDockTearOutCancel({itemId: 'graph', sortZone});

        expect(calls.applied).toHaveLength(0);
        expect(calls.closed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}])
    });

    test('a model refusal at the terminal retires the vessel instead of syncing — no window survives showing a still-docked item', async () => {
        const {calls, handlers, sortZone} = harness({commitErrors: ['item "graph" is not in the tree']});

        await handlers.onDockTearOutExit(exitData(sortZone));
        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});

        expect(calls.applied).toHaveLength(1);
        expect(calls.synced).toHaveLength(0);
        expect(calls.closed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}])
    });

    test('a THROWING host reducer lands on the refusal path — vessel retired, no sync, no propagated throw (the orphan guard)', async () => {
        const {calls, handlers, sortZone} = harness({commitThrows: true});

        await handlers.onDockTearOutExit(exitData(sortZone));

        // a throw is a host bug, but it must normalize to the refusal path: an uncaught throw
        // here would skip closeVessel and orphan the window — the exact class the machine prevents
        expect(() => handlers.onDockTearOutTerminal({itemId: 'graph', sortZone})).not.toThrow();

        expect(calls.applied).toHaveLength(1);
        expect(calls.synced).toHaveLength(0);
        expect(calls.closed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}])
    });

    test('re-entry retires the vessel with ZERO model mutation and resumes the in-window embodiment', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone));
        handlers.onDockTearOutEntry({itemId: 'graph', sortZone});

        expect(calls.closed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(calls.ended).toBe(1);
        expect(calls.applied).toHaveLength(0);

        // entry without a vessel (nothing admitted) still resumes the embodiment, retires nothing
        handlers.onDockTearOutEntry({itemId: 'graph', sortZone});
        expect(calls.closed).toHaveLength(1);
        expect(calls.ended).toBe(2)
    });

    test('cancel while detached retires the vessel with zero mutation — base cleanup owns the embodiment teardown', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone));
        handlers.onDockTearOutCancel({itemId: 'graph', sortZone});

        expect(calls.closed).toEqual([{itemId: 'graph', windowName: 'vessel-graph'}]);
        expect(calls.applied).toHaveLength(0);
        expect(calls.ended, 'cancel ends the drag — no embodiment to resume').toBe(0)
    });

    for (const [terminal, terminate] of [
        ['cancel',   (handlers, sortZone) => handlers.onDockTearOutCancel({itemId: 'graph', sortZone})],
        ['re-entry', (handlers, sortZone) => handlers.onDockTearOutEntry({itemId: 'graph', sortZone})],
        ['release',  (handlers, sortZone) => handlers.onDockTearOutTerminal({itemId: 'graph', sortZone})]
    ]) {
        test(`a deferred vessel admission resolving after ${terminal} is retired and never published`, async () => {
            let resolveOpen;

            const {calls, handlers, sortZone} = harness({
                openResult: () => new Promise(resolve => resolveOpen = resolve)
            });

            const admission = handlers.onDockTearOutExit(exitData(sortZone));

            expect(terminate(handlers, sortZone), 'the terminal invalidates provisional authority').toBe(false);

            resolveOpen({generation: 17, popupHeight: 480, popupWidth: 640, windowName: 'vessel-graph'});

            await expect(admission).resolves.toBe(false);
            expect(calls.started, 'a dead gesture can never start pointer-follow').toHaveLength(0);
            expect(calls.closed, 'the late physical result is cleanup-only authority').toEqual([{
                itemId: 'graph', windowName: 'vessel-graph'
            }]);
            expect(calls.applied, 'no terminal may adopt a late admission').toHaveLength(0);
            expect(handlers.activeVessel).toBeNull()
        })
    }

    test('an externally retired pending admission stays dead and a successor exit admits fresh', async () => {
        let attempt = 0,
            resolveOpen;

        const {calls, handlers, sortZone} = harness({
            openResult: request => ++attempt === 1
                ? new Promise(resolve => resolveOpen = resolve)
                : {
                    admissionToken: request.admissionToken,
                    generation    : 22,
                    popupHeight   : 480,
                    popupWidth    : 640,
                    windowName    : 'vessel-graph'
                }
        });

        const first = handlers.onDockTearOutExit(exitData(sortZone));

        expect(handlers.onVesselRetired({
            admissionToken: 1,
            generation    : 17,
            itemId        : 'graph',
            windowName    : 'vessel-graph'
        })).toBe(true);

        resolveOpen({admissionToken: 1, generation: 17, windowName: 'vessel-graph'});

        await expect(first).resolves.toBe(false);
        expect(calls.closed, 'the already-dead physical generation is not closed by semantic name').toHaveLength(0);
        expect(handlers.activeVessel).toBeNull();

        await expect(handlers.onDockTearOutExit(exitData(sortZone))).resolves.toBe(true);
        expect(calls.started).toHaveLength(1);
        expect(handlers.activeVessel).toEqual({itemId: 'graph', windowName: 'vessel-graph'})
    });

    test('an explicit close refusal retains the active vessel and coalesces one in-flight retirement', async () => {
        let resolveClose,
            attempt = 0;

        const closeResult                 = new Promise(resolve => resolveClose = resolve),
              {calls, handlers, sortZone} = harness({
                  closeResult: () => ++attempt === 1 ? closeResult : true
              });

        await handlers.onDockTearOutExit(exitData(sortZone));

        const first  = handlers.onDockTearOutCancel({itemId: 'graph', sortZone}),
              second = handlers.onDockTearOutCancel({itemId: 'graph', sortZone});

        expect(calls.closed).toHaveLength(1);

        resolveClose(false);

        await expect(first).resolves.toBe(false);
        await expect(second).resolves.toBe(false);

        // Refusal preserves the private slot, so a later exact retry remains possible.
        expect(handlers.activeVessel).toEqual({itemId: 'graph', windowName: 'vessel-graph'});
        expect(handlers.retireActiveVessel({itemId: 'graph', windowName: 'vessel-graph'})).toBe(true);
        expect(calls.closed).toHaveLength(2);
        expect(handlers.activeVessel).toBeNull()
    });

    test('an externally observed exact disconnect clears a retained refusal without closing again', async () => {
        const {calls, handlers, sortZone} = harness({closeResult: false});

        await handlers.onDockTearOutExit(exitData(sortZone));
        expect(handlers.onDockTearOutCancel({itemId: 'graph', sortZone})).toBe(false);

        expect(handlers.onVesselRetired({itemId: 'other', windowName: 'vessel-graph'})).toBe(false);
        expect(handlers.onVesselRetired({itemId: 'graph', windowName: 'vessel-graph'})).toBe(true);
        expect(handlers.activeVessel).toBeNull();
        expect(calls.closed).toHaveLength(1)
    });

    test('the hysteresis re-crossing arc: exit → entry → exit → terminal yields two vessels, ONE commit, one retirement', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone));    // vessel 1 admitted
        handlers.onDockTearOutEntry({itemId: 'graph', sortZone}); // vessel 1 retired, zero mutation
        await handlers.onDockTearOutExit(exitData(sortZone));    // vessel 2 admitted
        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone}); // vessel 2 commits + stays

        expect(calls.opened).toHaveLength(2);
        expect(calls.closed).toHaveLength(1);
        expect(calls.applied).toEqual([{operation: 'detachItem', itemId: 'graph'}]);
        expect(calls.synced).toHaveLength(1)
    });

    test('a terminal for a DIFFERENT item than the admitted vessel commits nothing (stale-identity guard)', async () => {
        const {calls, handlers, sortZone} = harness();

        await handlers.onDockTearOutExit(exitData(sortZone, 'graph'));
        handlers.onDockTearOutTerminal({itemId: 'inbox', sortZone});

        expect(calls.applied).toHaveLength(0);
        expect(calls.synced).toHaveLength(0)
    })
});
