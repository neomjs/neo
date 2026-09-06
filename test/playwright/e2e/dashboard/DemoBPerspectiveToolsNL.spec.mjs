import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';
import Operations                            from '../../../../src/dashboard/dock/model/Operations.mjs';
import WorkspaceDocument                     from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

const {NeuralLink_DockService} = await loadNeuralLinkModules();

/**
 * @summary Neural Link perspective round-trips preserve document truth and real-window projections.
 * The single-window arm verifies exact document restoration and unknown-name refusal. The topology
 * arm moves an existing CounterPane into a real sibling, then requires the same instance to return
 * visibly after restore. Empty staging tabs obey the document model's canonical normalization.
 * `NEO_TEST_DROP_SIBLING_PROJECTION=1` removes only that test worker's sibling projection; the same
 * visibility assertion must fail. The ordinary run changes no runtime method.
 */
test.describe('Dashboard Demo B — NL perspective tools: capture → list → restore + fail-closed', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('a topology restore moves the same live pane out of the sibling and presents both captured documents', async ({page, neuralLink}) => {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await expect(page.locator('.agentos-dockdemo-counter-pane')).toBeVisible({timeout: 30000});
        const app     = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow');
        const records = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']);
        const wsId    = (Array.isArray(records) ? records[0] : records).id;
        const panes   = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.CounterPane'}, ['id']);
        const paneId  = (Array.isArray(panes) ? panes[0] : panes).id;
        const opened  = await app.callMethod(wsId, 'openCrossWindowStage');
        expect(opened).toMatchObject({workspaceId: 'demo-b-popup'});
        const popup = page.context().pages().find(candidate => candidate !== page);
        expect(popup).toBeTruthy();
        await expect(popup.locator('.neo-tab-container')).toBeVisible({timeout: 30000});
        const baseline = await app.callMethod(wsId, 'getDockTopologyWorkspaces');
        const expected = Object.fromEntries(Object.entries(baseline).map(([key, document]) => [key, WorkspaceDocument.normalizeTree(document)]));
        expect(await NeuralLink_DockService.capturePerspective({
            captureScope: 'topology', componentId: wsId, layoutId: 'sibling-restore',
            sessionId   : app.sessionId, title: 'Sibling restore'
        })).toMatchObject({captured: true, stored: true, errors: []});
        const moved = Operations.transferItem(baseline['demo-b-main'], baseline['demo-b-popup'], {
            itemId: 'workbench', sourceWorkspaceId: 'demo-b-main', targetWorkspaceId: 'demo-b-popup',
            target: {operation: 'addTab', tabsNodeId: 'popup-tabs'}
        });
        expect(moved.errors).toEqual([]);
        expect(await app.callMethod(wsId, 'commitDockTopologyWorkspaces', [{
            ...baseline, 'demo-b-main': moved.sourceDocument, 'demo-b-popup': moved.targetDocument
        }])).toMatchObject({errors: []});
        await expect(popup.locator(`[id="${paneId}"]`), 'the existing pane is presented in the changed sibling').toBeVisible({timeout: 10000});
        await expect(page.locator(`[id="${paneId}"]`)).toHaveCount(0);

        if (process.env.NEO_TEST_DROP_SIBLING_PROJECTION === '1') {
            const className = 'Neo.examples.dashboard.crossWindow.DemoBWorkspace';
            const {source}  = await app.getMethodSource(className, 'projectWorkspaceDocument');
            expect(source).toContain('const me = this;');
            await app.manageNeoConfig('set', {enableHotPatching: true});
            expect(await app.patchCode(className, 'projectWorkspaceDocument', 'function ' + source.replace(
                'const me = this;',
                "if (workspaceId === 'demo-b-popup') return Promise.resolve(); const me = this;"
            ))).toMatchObject({success: true})
        }
        expect(await NeuralLink_DockService.restorePerspective({componentId: wsId, name: 'sibling-restore', sessionId: app.sessionId}))
            .toMatchObject({switched: true, errors: []});
        expect(await app.callMethod(wsId, 'getDockTopologyWorkspaces')).toEqual(expected);
        await expect(page.locator(`[id="${paneId}"]`), 'the original pane returns through the captured primary projection').toBeVisible({timeout: 10000});
        await expect(popup.locator(`[id="${paneId}"]`), 'the sibling no longer presents the moved-away pane').toHaveCount(0);
        await expect(popup.locator('.neo-tab-header-button'), 'the restored empty sibling has no stale Workbench tab').toHaveCount(0);
        await expect(popup.locator('.neo-tab-container'), 'the normalized empty sibling has no retired tabs projection').toHaveCount(0)
    });

    test('NL capture/list/restore round-trip returns the exact baseline; unknown names fail closed', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordDemoBNlToolsRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoBNlToolsRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoBNlToolsRuntimeError({
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

        const baseline = (await app.getDockTopology(wsId)).document;

        expect(
            baseline.nodes['side-tabs']?.items,
            'precondition: the demo boots with timeline in the side tabs (the mutation source)'
        ).toContain('timeline');

        // 1. capture_perspective — write-locked, dockLayout.v2 returned, stored
        const captured = await NeuralLink_DockService.capturePerspective({
            captureScope   : 'window',
            componentId    : wsId,
            layoutId       : 'spec-nl-perspective',
            perspectiveName: 'Spec NL Perspective',
            sessionId      : app.sessionId,
            title          : 'Spec witness baseline'
        });

        expect(captured.errors, 'capture must not surface errors').toEqual([]);
        expect(captured.captured).toBe(true);
        expect(captured.stored).toBe(true);

        // 2. list_perspectives — the store-backed read tier surfaces the capture
        const listed = await NeuralLink_DockService.listPerspectives({
            componentId: wsId,
            sessionId  : app.sessionId
        });

        expect(listed.errors).toEqual([]);
        expect(
            listed.perspectives.some(p => p.layoutId === 'spec-nl-perspective' && p.perspectiveName === 'Spec NL Perspective'),
            'list_perspectives must surface the just-captured layout'
        ).toBe(true);

        // 3. Mutation through the semantic dockZone.v1 path: timeline joins the workbench tabs
        const mutated = await app.executeDockOperation(wsId, {
            itemId      : 'timeline',
            operation   : 'moveItem',
            targetNodeId: 'workbench-tabs'
        });

        expect(mutated.errors).toEqual([]);
        expect(mutated.applied).toBe(true);
        expect(mutated.document.nodes['workbench-tabs'].items).toContain('timeline');
        expect(
            mutated.document.nodes['side-tabs'].items,
            'the mutation must be observable before restore (restore-fidelity is vacuous otherwise)'
        ).not.toContain('timeline');

        // 4. restore_perspective — exact baseline document, activeItemIds included
        const restored = await NeuralLink_DockService.restorePerspective({
            componentId: wsId,
            name       : 'Spec NL Perspective',
            sessionId  : app.sessionId
        });

        expect(restored.errors).toEqual([]);
        expect(restored.switched).toBe(true);
        expect(
            restored.document,
            'restore must return the exact pre-mutation dockZone.v1 document'
        ).toEqual(baseline);

        // 5. Fail-closed: an unknown name errors structurally and touches nothing
        const failed = await NeuralLink_DockService.restorePerspective({
            componentId: wsId,
            name       : 'Spec NL Missing',
            sessionId  : app.sessionId
        });

        expect(failed.switched).toBe(false);
        expect(failed.errors.length, 'the fail-closed path must name its reason').toBeGreaterThan(0);

        const untouched = (await app.getDockTopology(wsId)).document;

        expect(
            untouched,
            'a failed restore must leave the live document byte-identical'
        ).toEqual(baseline);

        expect(pageErrors, 'no page errors may escape during the NL perspective chain').toEqual([]);
        expect(runtimeErrors, 'no runtime errors may escape during the NL perspective chain').toEqual([]);
    })
})
