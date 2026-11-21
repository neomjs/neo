import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockProjectionCycleTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import ProjectionCycle from '../../../../src/dashboard/dock/projection/Cycle.mjs';

/**
 * @summary A dock Workspace chains every projection on the one before it, and a cycle waiting behind a refresh that
 * never settles waits for good. The waiting cycle carries that refresh's live timing, so a record read during the
 * stall names the phase it never left; the chain's order stays strict.
 */
const workspace = {id: 'dock-workspace-under-test', isDestroyed: false, timeout: ms => new Promise(resolve => setTimeout(resolve, ms))},
      settle    = ms => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Neo.dashboard.dock.projection.Cycle', () => {
    test('a cycle behind a refresh in flight carries its live timing, and drops it once the tail settles', async () => {
        let release;

        const predecessor = Neo.create(ProjectionCycle),
              tail        = predecessor.run(Promise.resolve(), workspace, () => new Promise(resolve => {release = resolve})),
              cycle       = Neo.create(ProjectionCycle, {predecessorTiming: predecessor.timing, waitedForTail: true}),
              run         = cycle.run(tail.catch(() => {}), workspace, async () => {});

        await settle(20);
        predecessor.stamp('reconciled');

        expect(cycle.predecessorTiming, 'the live record, not a copy').toBe(predecessor.timing);
        expect(cycle.predecessorTiming).toEqual(expect.objectContaining({reconciled: expect.any(Number), startedAt: expect.any(Number)}));
        expect(cycle.predecessorTiming.settledAt, 'the phase the stalled refresh never left').toBeUndefined();

        release();
        await run;

        expect(cycle.predecessorTiming).toBeNull()
    });

    test('a cycle never starts before the refresh it waits on has settled', async () => {
        let release;

        const order       = [],
              predecessor = Neo.create(ProjectionCycle),
              tail        = predecessor.run(Promise.resolve(), workspace, () => new Promise(resolve => {release = () => {order.push('predecessor'); resolve()}})),
              cycle       = Neo.create(ProjectionCycle, {predecessorTiming: predecessor.timing, waitedForTail: true}),
              run         = cycle.run(tail.catch(() => {}), workspace, async () => {order.push('cycle')});

        await settle(50);
        expect(order, 'held behind the unsettled refresh').toEqual([]);
        expect(cycle.timing.startedAt).toBeUndefined();

        release();
        await run;

        expect(order).toEqual(['predecessor', 'cycle'])
    });

    test('the timing belongs to the awaited refresh: a direct repair tail gets an unknown-owner marker', async () => {
        const older  = Neo.create(ProjectionCycle),
              own    = older.run(Promise.resolve(), workspace, async () => {}),
              repair = own.then(() => new Promise(() => {}));

        // The older cycle settled with a start and no settledAt, as a typed failure that queued a repair leaves it
        await own;
        delete older.timing.settledAt;

        expect(own, 'run keeps the promise it returned').toBe(older.promise);
        expect(ProjectionCycle.timingOf(older, own), 'the cycle\'s own refresh').toBe(older.timing);
        expect(ProjectionCycle.timingOf(older, repair), 'a repair no cycle owns').toEqual({owner: 'unknown'});
        expect(ProjectionCycle.timingOf(older, null), 'no tail').toBeNull()
    })
});
