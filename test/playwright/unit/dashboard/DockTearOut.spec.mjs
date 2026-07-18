import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockTearOutTest'
    }
});

import {test, expect}              from '@playwright/test';
import {createDockTearOutHandlers} from '../../../../src/dashboard/DockTearOut.mjs';

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
test.describe('Neo.dashboard.DockTearOut — createDockTearOutHandlers', () => {
    const harness = ({admit = true, commitErrors = []} = {}) => {
        const calls = {applied: [], closed: [], ended: 0, opened: [], started: [], synced: []};

        const sortZone = {
            endWindowDrag  : () => calls.ended++,
            startWindowDrag: data => calls.started.push(data)
        };

        const handlers = createDockTearOutHandlers({
            applyOperation  : operation => {
                calls.applied.push(operation);
                return commitErrors.length
                    ? {document: null, errors: commitErrors}
                    : {document: {committed: true, detached: operation.itemId}, errors: []}
            },
            closeVessel     : vessel => calls.closed.push(vessel),
            onDocumentChange: (document, operation) => calls.synced.push({document, operation}),
            openVessel      : async request => {
                calls.opened.push(request);
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

        expect(calls.opened[0]).toEqual({itemId: 'graph', proxyRect: data.proxyRect, sortZone});
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

    test('a model refusal at the terminal retires the vessel instead of syncing — no window survives showing a still-docked item', async () => {
        const {calls, handlers, sortZone} = harness({commitErrors: ['item "graph" is not in the tree']});

        await handlers.onDockTearOutExit(exitData(sortZone));
        handlers.onDockTearOutTerminal({itemId: 'graph', sortZone});

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
