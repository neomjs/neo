import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_DockService} = await loadNeuralLinkModules();

/**
 * @summary Whitebox E2E witness for the agent-driven Neural Link perspective path on Demo B.
 *
 * The sibling `DemoBPerspectivesNL.spec.mjs` proves the app's OWN tour/store path
 * (capture + topology reconcile). This spec is the first witness driving the NL tools
 * themselves — the seam agent-driven screenplay automation rides:
 *
 *   capture_perspective → list_perspectives → execute_dock_operation (mutation)
 *   → restore_perspective (exact baseline document equality, activeItemIds included)
 *   → restore_perspective on an unknown name (the perspectives contract's
 *     fail-closed path: switched:false, structured error, live document untouched)
 *
 * All assertions read worker truth (dockZone.v1 documents), never the DOM.
 * The baseline is read live, so the spec does not pin the demo's initial layout —
 * it pins the restore-fidelity contract.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test dashboard/DemoBPerspectiveToolsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dashboard Demo B — NL perspective tools: capture → list → restore + fail-closed', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
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
