import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_InstanceService} = await loadNeuralLinkModules();

/**
 * @summary Whitebox E2E witness for one dock Group's deployed Neural Link transaction tools.
 *
 * Demo B supplies the live Group identity. An agent stages two semantic mutations into one
 * Group write, then uses the public transaction tools to inspect, archive, undo, redo and
 * replay it. The legacy writer stack remains separate:
 *
 *   begin_transaction(groupId) → two moveItem mutations → commit_transaction(groupId)
 *   → list/save → undo/redo → undo/replay → undo
 *
 * Assertions read the committed documents and Group cursor through Neural Link. A missing
 * Group must refuse before mutation, while omitting groupId must stay on the legacy stack.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test dashboard/DemoBDockTransactionsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dashboard Demo B — deployed dock Group transaction tools', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('one Group batch can be listed, saved, undone, redone and replayed without touching legacy history', async ({page, neuralLink}) => {
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

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
              workspaces = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the DemoBWorkspace must exist in the App Worker').toBeTruthy();

        let groupId;
        await expect.poll(async () => {
            groupId = (await app.getComponent(wsId, ['topologyGroupId'])).topologyGroupId;
            return groupId
        }, {message: 'Demo B must publish its live topology Group', timeout: 10000}).toBeTruthy();

        const
            scope        = {sessionId: app.sessionId, groupId},
            baseline     = (await app.getDockTopology(wsId)).document,
            groupBefore  = await NeuralLink_InstanceService.listTransactions(scope),
            legacyBefore = await NeuralLink_InstanceService.listTransactions({sessionId: app.sessionId});

        expect(groupBefore.groupId, 'the deployed tool selects the live Group').toBe(groupId);

        expect(
            baseline.nodes['side-tabs']?.items,
            'precondition: the demo boots with timeline + console in the side tabs (the burst sources)'
        ).toEqual(expect.arrayContaining(['timeline', 'console']));

        // 1. begin_transaction — the named batch belongs to this Group, not the writer stack.
        const begun = await NeuralLink_InstanceService.beginTransaction({
            name     : 'Spec dock burst',
            ...scope
        });

        expect(begun.opened, `the batch must open (got: ${begun.reason})`).toBe(true);

        // 2. The mutation burst is staged; the committed document stays unchanged until commit.
        for (const itemId of ['timeline', 'console']) {
            const moved = await app.executeDockOperation(wsId, {
                itemId,
                operation   : 'moveItem',
                targetNodeId: 'workbench-tabs'
            });

            expect(moved.errors).toEqual([]);
            expect(moved.staged).toBe(true)
        }

        expect((await app.getDockTopology(wsId)).document).toEqual(baseline);

        // 3. One commit and one history row cover both operations on this one participant.
        const committed = await NeuralLink_InstanceService.commitTransaction(scope);

        expect(committed.committed, `the batch must commit its captured ops (got: ${committed.reason})`).toBe(true);
        expect(committed.txId).toBeTruthy();

        const
            movedDocument = (await app.getDockTopology(wsId)).document,
            groupAfter    = await NeuralLink_InstanceService.listTransactions(scope);

        expect(movedDocument.nodes['workbench-tabs'].items).toEqual(
            expect.arrayContaining(['workbench', 'timeline', 'console'])
        );
        expect(groupAfter.groupId).toBe(groupId);
        expect(groupAfter.cursor).toBe(groupBefore.cursor + 1);
        const listedRow = groupAfter.committed.at(-1);

        expect(listedRow).toMatchObject({opCount: 1});
        expect(listedRow.txId).toBeTruthy();
        expect(await NeuralLink_InstanceService.listTransactions({sessionId: app.sessionId}))
            .toEqual(legacyBefore);

        // 4. Save the listed Group row through the Brain archive boundary.
        const saved = await NeuralLink_InstanceService.saveTransaction({
            ...scope, txId: listedRow.txId, name: 'Saved spec dock burst'
        });

        expect(saved.saved, `save_transaction returned: ${JSON.stringify(saved)}`).toBe(true);
        expect(saved.archiveId).toBeTruthy();

        // 5. Undo restores the exact source document and moves only the Group cursor.
        const undone = await NeuralLink_InstanceService.undo(scope);

        expect(undone.undone).toBe(true);
        expect(undone).toMatchObject({groupId, cursor: groupAfter.cursor - 1});

        const afterUndo = (await app.getDockTopology(wsId)).document;

        expect(
            afterUndo,
            'undo must return the exact pre-burst dockZone.v1 document'
        ).toEqual(baseline);

        const groupAfterUndo = await NeuralLink_InstanceService.listTransactions(scope);

        expect(groupAfterUndo.committed).toHaveLength(groupBefore.committed.length);
        expect(groupAfterUndo.redo.at(-1).txId).toBe(listedRow.txId);

        // 6. Redo re-applies the one Group row without appending another.
        const redone = await NeuralLink_InstanceService.redo(scope);

        expect(redone.redone).toBe(true);
        expect(redone).toMatchObject({groupId, cursor: groupAfter.cursor});

        const afterRedo = (await app.getDockTopology(wsId)).document;

        expect(afterRedo).toEqual(movedDocument);
        expect((await NeuralLink_InstanceService.listTransactions(scope)).committed.at(-1).txId)
            .toBe(listedRow.txId);

        // 7. An unknown explicit Group is refused without moving either cursor or document.
        expect(await NeuralLink_InstanceService.undo({sessionId: app.sessionId, groupId: `${groupId}-missing`}))
            .toMatchObject({undone: false, reason: 'unknown-group'});
        expect((await app.getDockTopology(wsId)).document).toEqual(movedDocument);

        // 8. Undo, replay the saved data as a new row, then undo that new row.
        expect((await NeuralLink_InstanceService.undo(scope)).undone).toBe(true);
        expect((await app.getDockTopology(wsId)).document).toEqual(baseline);

        const replayed = await NeuralLink_InstanceService.replayTransaction({...scope, archiveId: saved.archiveId});

        expect(replayed.replayed, `replay_transaction returned: ${JSON.stringify(replayed)}`).toBe(true);
        expect(replayed.txId).not.toBe(listedRow.txId);
        expect((await app.getDockTopology(wsId)).document).toEqual(movedDocument);
        expect((await NeuralLink_InstanceService.undo(scope)).undone).toBe(true);
        expect((await app.getDockTopology(wsId)).document).toEqual(baseline);
        expect(await NeuralLink_InstanceService.listTransactions({sessionId: app.sessionId}))
            .toEqual(legacyBefore);

        expect(pageErrors, 'no page errors may escape during the transaction chain').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the transaction chain').toEqual([]);
    })
})
