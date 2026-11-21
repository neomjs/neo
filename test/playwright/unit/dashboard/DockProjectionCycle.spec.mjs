import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockProjectionCycleTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import ProjectionCycle from '../../../../src/dashboard/dock/projection/Cycle.mjs';

/**
 * @summary A dock Workspace chains every projection on the one before it. A refresh that never settles must not
 * freeze the ones behind it: a Workstation cold boot's Reset, which never rendered its Feed, waited on such a tail.
 */
const workspace = {id: 'dock-workspace-under-test', isDestroyed: false, timeout: ms => new Promise(resolve => setTimeout(resolve, ms))},
      never     = () => new Promise(() => {}),
      settle    = ms => new Promise(resolve => setTimeout(resolve, ms));

test.describe('Neo.dashboard.dock.projection.Cycle', () => {
    test('behind a predecessor that settles in time, a cycle waits for it and abandons nothing', async () => {
        const order       = [],
              predecessor = Neo.create(ProjectionCycle),
              tail        = predecessor.run(Promise.resolve(), workspace, async () => {await settle(30); order.push('predecessor')}),
              cycle       = Neo.create(ProjectionCycle, {predecessor, tailBudget: 1000, waitedForTail: true});

        await cycle.run(tail.catch(() => {}), workspace, async () => {order.push('cycle')});

        expect(order).toEqual(['predecessor', 'cycle']);
        expect(predecessor.abandoned).toBe(false);
        expect(cycle.timing.abandonedPredecessor).toBeUndefined()
    });

    test('a predecessor whose refresh never settles is abandoned after the budget, and the next cycle runs', async () => {
        const warnings    = [],
              warn        = console.warn,
              predecessor = Neo.create(ProjectionCycle),
              tail        = predecessor.run(Promise.resolve(), workspace, never),
              cycle       = Neo.create(ProjectionCycle, {predecessor, tailBudget: 50, waitedForTail: true});

        let ran = false;

        console.warn = (...args) => warnings.push(args);

        try {
            await cycle.run(tail.catch(() => {}), workspace, async () => {ran = true})
        } finally {
            console.warn = warn
        }

        expect(ran, 'the cycle behind the hung refresh projects').toBe(true);
        expect(predecessor.abandoned).toBe(true);
        expect(cycle.timing.abandonedPredecessor, 'the hung refresh started and never settled').toEqual(expect.objectContaining({startedAt: expect.any(Number)}));
        expect(cycle.timing.abandonedPredecessor.settledAt).toBeUndefined();
        expect(warnings).toHaveLength(1);
        expect(warnings[0][0]).toContain(workspace.id)
    });

    test('an abandoned cycle that has not started never starts, even when its own tail settles later', async () => {
        let releaseFirst, secondRan = false;

        const first     = Neo.create(ProjectionCycle),
              firstRun  = first.run(Promise.resolve(), workspace, () => new Promise(resolve => {releaseFirst = resolve})),
              second    = Neo.create(ProjectionCycle, {predecessor: first, tailBudget: 1000, waitedForTail: true}),
              secondRun = second.run(firstRun.catch(() => {}), workspace, async () => {secondRan = true}),
              third     = Neo.create(ProjectionCycle, {predecessor: second, tailBudget: 50, waitedForTail: true}),
              warn      = console.warn;

        console.warn = () => {};

        try {
            await third.run(secondRun.catch(() => {}), workspace, async () => {});
            expect(second.abandoned).toBe(true);

            releaseFirst();
            await secondRun
        } finally {
            console.warn = warn
        }

        expect(secondRan, 'the abandoned cycle stood down').toBe(false);
        expect(second.timing.startedAt).toBeUndefined()
    })
});
