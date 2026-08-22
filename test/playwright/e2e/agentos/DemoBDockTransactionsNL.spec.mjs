import {test, expect}               from '../../fixtures.mjs';
import {NeuralLink_InstanceService} from '../../../../ai/services.mjs';

/**
 * @summary Whitebox E2E witness for dock-mutation undo/redo through the Neural Link
 * transaction chain on Demo B.
 *
 * Dock operations record their reverse (the pre-mutation document, re-committed through
 * the shared fail-closed commit path) into the writer's transaction stack. This spec proves
 * the end-to-end contract an agent-driven screenplay rides:
 *
 *   begin_transaction → two moveItem mutations → commit_transaction (ops captured)
 *   → undo (exact baseline document, activeItemIds included)
 *   → redo (the burst re-applied)
 *
 * plus the no-regress guard: an undo dispatch re-applying a captured reverse must never
 * enqueue a new transaction (committed stays empty, the batch waits on the redo branch).
 *
 * All assertions read worker truth (dockZone.v1 documents + the transaction stack audit),
 * never the DOM. The baseline is read live, so the spec pins restore-fidelity, not the
 * demo's initial layout.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test agentos/DemoBDockTransactionsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Demo B — dock transactions: begin → mutate → commit → undo → redo', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('a named dock batch commits its captured ops, undo returns the exact baseline, redo re-applies, and no undo dispatch re-enqueues', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordDemoBTxRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoBTxRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoBTxRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-tour-play', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the DemoBWorkspace must exist in the App Worker').toBeTruthy();

        const baseline = (await app.getDockTopology(wsId)).document;

        expect(
            baseline.nodes['side-tabs']?.items,
            'precondition: the demo boots with timeline + console in the side tabs (the burst sources)'
        ).toEqual(expect.arrayContaining(['timeline', 'console']));

        // 1. begin_transaction — the named batch opens under the writer's identity
        const begun = await NeuralLink_InstanceService.beginTransaction({
            name     : 'Spec dock burst',
            sessionId: app.sessionId
        });

        expect(begun.opened, `the batch must open (got: ${begun.reason})`).toBe(true);

        // 2. The mutation burst — two semantic dockZone.v1 operations inside the batch
        for (const itemId of ['timeline', 'console']) {
            const moved = await app.executeDockOperation(wsId, {
                itemId,
                operation   : 'moveItem',
                targetNodeId: 'workbench-tabs'
            });

            expect(moved.errors).toEqual([]);
            expect(moved.applied).toBe(true)
        }

        // 3. commit_transaction — the batch closes WITH its captured reverse ops
        const committed = await NeuralLink_InstanceService.commitTransaction({sessionId: app.sessionId});

        expect(committed.committed, `the batch must commit its captured ops (got: ${committed.reason})`).toBe(true);
        expect(committed.ops).toBe(2);

        // 4. undo — every captured reverse re-applies: the exact baseline document returns
        const undone = await NeuralLink_InstanceService.undo({sessionId: app.sessionId});

        expect(undone.undone).toBe(true);
        expect(undone.reverted).toBe(2);

        const afterUndo = (await app.getDockTopology(wsId)).document;

        expect(
            afterUndo,
            'undo must return the exact pre-burst dockZone.v1 document'
        ).toEqual(baseline);

        // 5. The no-regress guard — the undo dispatch itself must leave the stack untouched:
        // committed empty (nothing new auto-wrapped), the batch parked on the redo branch
        const stackAfterUndo = await NeuralLink_InstanceService.listTransactions({sessionId: app.sessionId});

        expect(
            stackAfterUndo.committed,
            'an undo dispatch must never enqueue a new transaction'
        ).toEqual([]);
        expect(stackAfterUndo.redo.length).toBe(1);
        expect(stackAfterUndo.redo[0].opCount).toBe(2);

        // 6. redo — the forward ops re-apply as one unit
        const redone = await NeuralLink_InstanceService.redo({sessionId: app.sessionId});

        expect(redone.redone).toBe(true);
        expect(redone.reapplied).toBe(2);

        const afterRedo = (await app.getDockTopology(wsId)).document;

        expect(afterRedo.nodes['workbench-tabs'].items).toEqual(
            expect.arrayContaining(['workbench', 'timeline', 'console'])
        );

        const stackAfterRedo = await NeuralLink_InstanceService.listTransactions({sessionId: app.sessionId});

        expect(stackAfterRedo.committed.length).toBe(1);
        expect(stackAfterRedo.redo).toEqual([]);

        // 7. Leave the demo surface at its baseline for the next consumer (film or spec)
        await NeuralLink_InstanceService.undo({sessionId: app.sessionId});

        expect(pageErrors, 'no page errors may escape during the transaction chain').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the transaction chain').toEqual([]);
    })
})
